import highsLoader, { type Highs } from "highs";
import type { Command, Site, State, Step } from "../../sim/src/types.ts";

let highs: Highs | null = null;

/** Load the HiGHS solver once. In the browser, pass where the .wasm file lives: { locateFile: () => wasmUrl }. */
export async function initPlanner(options?: Parameters<typeof highsLoader>[0]) {
  highs ??= await highsLoader(options);
}

/** What each bad outcome "costs" the planner, in litres of fuel, so the same numbers work in any currency. */
const COST = {
  cycleLPerKwh: 0.02, // battery wear per kWh charged or discharged
  belowReserveLPerKwh: 0.6, // per kWh-hour spent below the reserve
  shedLPerKwh: 1.0, // switching off fans or AC is worse than running the generator
  criticalLPerKwh: 100, // the fridge going down: almost never acceptable
  startL: 0.3, // wear and fuel for each generator start
  gridLPerKwh: 0.05, // grid power is cheap, but not free
};

/** Small generators waste fuel at light load, so the planner never runs one below 70% of its rating. */
const MIN_LOAD_FRACTION = 0.7;

/** One term of a linear expression in the form the LP reader expects: "+ 2.5 x" or "- 2.5 x". */
const term = (coef: number, name: string) => `${coef < 0 ? "-" : "+"} ${Math.abs(coef).toFixed(6)} ${name}`;

/** Average 15-minute steps into 1-hour slots. The planner thinks in hours; the plant runs in quarters. */
export function toHourly(steps: Step[]): Step[] {
  const out: Step[] = [];
  for (let i = 0; i + 4 <= steps.length; i += 4) {
    const q = steps.slice(i, i + 4);
    const avg = (f: (s: Step) => number) => q.reduce((a, s) => a + f(s), 0) / 4;
    out.push({ pvKw: avg((s) => s.pvKw), criticalKw: avg((s) => s.criticalKw), otherKw: avg((s) => s.otherKw), gridOn: q.every((s) => s.gridOn) });
  }
  return out;
}

/**
 * Plan the next hours (one Step per hour) as a mixed-integer program, and return the first hour's decision.
 * Per hour k the solver chooses: battery charge c, discharge d, generator output gen and on/off u,
 * grid import r, curtailed solar v, shed load s, unmet critical load e, and battery energy E at the end of the hour.
 */

/** One hour of a plan, for showing on screen. */
export interface PlannedHour {
  socPct: number; // battery at the end of the hour
  genKw: number;
  gridKw: number;
  shedKw: number;
}

export function plan(site: Site, state: State, hours: Step[]): Command & { schedule: PlannedHour[] } {
  const N = hours.length;
  const b = site.battery;
  const g = site.generator;
  const reserveKwh = (b.reservePct / 100) * b.capacityKwh;

  const objective: string[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const binaries: string[] = [];

  for (let k = 0; k < N; k++) {
    const h = hours[k];

    // 1. Battery energy: what was there + what went in - what came out (with losses).
    constraints.push(
      `energy${k}: E${k} ${term(-b.etaCharge, `c${k}`)} ${term(1 / b.etaDischarge, `d${k}`)}` +
        (k === 0 ? ` = ${state.socKwh.toFixed(6)}` : ` - 1 E${k - 1} = 0`),
    );
    // 2. Power balance: sources = uses. Known numbers (load - sun) go on the right.
    constraints.push(
      `power${k}: d${k} + gen${k} + r${k} - c${k} - v${k} + s${k} + e${k} = ${(h.criticalKw + h.otherKw - h.pvKw).toFixed(6)}`,
    );
    // 3. Soft reserve: low_k is how far below the reserve the battery ends the hour.
    constraints.push(`reserve${k}: E${k} + low${k} >= ${reserveKwh.toFixed(6)}`);

    bounds.push(
      `0 <= E${k} <= ${b.capacityKwh}`,
      `0 <= c${k} <= ${b.maxChargeKw}`,
      `0 <= d${k} <= ${b.maxDischargeKw}`,
      `0 <= v${k} <= ${h.pvKw.toFixed(6)}`,
      `0 <= s${k} <= ${h.otherKw.toFixed(6)}`,
      `0 <= e${k} <= ${h.criticalKw.toFixed(6)}`,
      `0 <= r${k} <= ${h.gridOn ? 50 : 0}`, // grid only in hours it's expected to be on
      `low${k} >= 0`,
    );

    if (g) {
      const minKw = Math.max(g.minKw, MIN_LOAD_FRACTION * g.maxKw);
      // 4. Generator: off (u = 0, gen = 0) or on (u = 1, minKw <= gen <= maxKw).
      constraints.push(`genMax${k}: gen${k} ${term(-g.maxKw, `u${k}`)} <= 0`);
      constraints.push(`genMin${k}: gen${k} ${term(-minKw, `u${k}`)} >= 0`);
      // 5. Starts: w_k >= u_k - u_(k-1), so w_k = 1 in an hour where the generator switches on.
      constraints.push(`start${k}: w${k} - 1 u${k}` + (k === 0 ? ` >= ${state.genOn ? -1 : 0}` : ` + 1 u${k - 1} >= 0`));
      bounds.push(`gen${k} >= 0`, `w${k} >= 0`);
      binaries.push(`u${k}`);
      objective.push(term(g.litresPerKwh, `gen${k}`), term(g.idleLitresPerHour, `u${k}`), term(COST.startL, `w${k}`));
    } else {
      bounds.push(`gen${k} = 0`);
    }

    objective.push(
      term(COST.cycleLPerKwh, `c${k}`),
      term(COST.cycleLPerKwh, `d${k}`),
      term(COST.belowReserveLPerKwh, `low${k}`),
      term(COST.shedLPerKwh, `s${k}`),
      term(COST.criticalLPerKwh, `e${k}`),
      term(COST.gridLPerKwh, `r${k}`),
    );
  }

  // 6. Energy left at the end is worth what it would cost the generator to make it again.
  //    Without this, every plan drains the battery, because "tomorrow" is out of sight.
  const refillLPerKwh = g ? (g.litresPerKwh + g.idleLitresPerHour / g.maxKw) / b.etaCharge : COST.gridLPerKwh;
  objective.push(term(-refillLPerKwh, `E${N - 1}`));

  const lp = [
    "Minimize",
    " cost: " + objective.join("\n "),
    "Subject To",
    ...constraints.map((c) => " " + c),
    "Bounds",
    ...bounds.map((c) => " " + c),
    ...(binaries.length ? ["Binary", " " + binaries.join(" ")] : []),
    "End",
  ].join("\n");

    if (!highs) throw new Error("planner: call initPlanner() first");
  const res = highs.solve(lp, { time_limit: 5, mip_rel_gap: 0.01 });
  if (res.Status !== "Optimal" && res.Status !== "Time limit reached") throw new Error(`planner: ${res.Status}`);

  const x = (name: string) => res.Columns[name]?.Primal ?? 0;
    const schedule = hours.map((_, k) => ({
    socPct: (100 * x(`E${k}`)) / b.capacityKwh,
    genKw: x(`u${k}`) > 0.5 ? x(`gen${k}`) : 0,
    gridKw: x(`r${k}`),
    shedKw: x(`s${k}`),
  }));
  return { genKw: schedule[0].genKw, shedKw: schedule[0].shedKw > 1e-6 ? schedule[0].shedKw : 0, schedule };
}
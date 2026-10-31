import type { Site, State, Step } from "../../sim/src/types.ts";
import { plan, type PlannedHour } from "./planner.ts";

/** "Can I run this appliance?" */
export interface Ask {
  kw: number; // the appliance's power
  minutes: number; // how long it runs
}

export interface Answer {
  verdict: "now" | "later" | "costs"; // run now for free · wait and it's free · costs fuel whenever you run it
  startIn: number; // hours from now to start (0 = now)
  extraFuelL: number; // extra fuel at that start time
  extraFuelNowL: number; // extra fuel if run right now
  lowestPct: number; // lowest battery in the plan with the appliance added
}

/** Below this, running the appliance is effectively free (rounding noise from the solver). */
const FREE_L = 0.05;

/**
 * Fuel a plan really costs: fuel burned, minus the battery energy it leaves at the end
 * (priced at what the generator would need to make it again). Without this, a plan that drains
 * the battery would look "free" when it just pushes the fuel into tomorrow.
 */
function trueFuelL(site: Site, schedule: PlannedHour[]) {
  const g = site.generator;
  if (!g) return 0;
  const burned = schedule.reduce((a, h) => a + (h.genKw > 0 ? g.litresPerKwh * h.genKw + g.idleLitresPerHour : 0), 0);
  const endKwh = (schedule.at(-1)!.socPct / 100) * site.battery.capacityKwh;
  const refillLPerKwh = (g.litresPerKwh + g.idleLitresPerHour / g.maxKw) / site.battery.etaCharge;
  return burned - refillLPerKwh * endKwh;
}

/** Add the appliance's load to the hours it runs in, starting `start` hours from now. It counts as critical: it must run. */
function withLoad(hours: Step[], ask: Ask, start: number): Step[] {
  let left = ask.minutes / 60;
  return hours.map((h, i) => {
    if (i < start || left <= 0) return h;
    const fraction = Math.min(1, left);
    left -= fraction;
    return { ...h, criticalKw: h.criticalKw + ask.kw * fraction };
  });
}

/**
 * Re-plan with the appliance added: now, then each later hour up to `maxWaitH`, and report the
 * earliest time it runs without extra fuel. Every number comes from the planner, not a guess.
 */
export function whatIf(site: Site, state: State, hours: Step[], ask: Ask, maxWaitH = 12): Answer {
  const base = trueFuelL(site, plan(site, state, hours).schedule);
  const tryAt = (start: number) => {
    const { schedule } = plan(site, state, withLoad(hours, ask, start));
    return { start, extra: Math.max(0, trueFuelL(site, schedule) - base), lowest: Math.min(...schedule.map((h) => h.socPct)) };
  };

  const now = tryAt(0);
  if (now.extra <= FREE_L) return { verdict: "now", startIn: 0, extraFuelL: 0, extraFuelNowL: 0, lowestPct: now.lowest };

  let best = now;
  const lastStart = Math.min(maxWaitH, hours.length - Math.ceil(ask.minutes / 60));
  for (let s = 1; s <= lastStart; s++) {
    const r = tryAt(s);
    if (r.extra <= FREE_L) return { verdict: "later", startIn: s, extraFuelL: 0, extraFuelNowL: now.extra, lowestPct: r.lowest };
    if (r.extra < best.extra) best = r;
  }
  return { verdict: "costs", startIn: best.start, extraFuelL: best.extra, extraFuelNowL: now.extra, lowestPct: best.lowest };
}
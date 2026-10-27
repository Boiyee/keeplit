import { baseline } from "../../sim/src/baseline.ts";
import { stepPlant } from "../../sim/src/plant.ts";
import { forecast, lagosClinic, makeWeek, palawanVillage } from "../../sim/src/scenarios.ts";
import { DT, STEPS_PER_DAY, type Command, type Log, type Site, type State, type Step } from "../../sim/src/types.ts";
import { plan, toHourly } from "./planner.ts";

type Policy = (state: State, step: Step, k: number) => Command;

function simulate(site: Site, steps: Step[], policy: Policy) {
  let state: State = { socKwh: 0.6 * site.battery.capacityKwh, genOn: false };
  const logs: Log[] = [];
  steps.forEach((step, k) => {
    const { next, log } = stepPlant(site, state, step, policy(state, step, k));
    state = next;
    logs.push(log);
  });
  const sum = (f: (l: Log) => number) => logs.reduce((a, l) => a + f(l), 0);
  return [
    sum((l) => l.fuelL),
    sum((l) => (l.genKw > 0 ? DT : 0)),
    sum((l) => (l.criticalUnmetKwh > 1e-6 ? DT * 60 : 0)),
    sum((l) => l.dischargeKwh) / site.battery.capacityKwh,
    sum((l) => (l.socPct < 20 ? DT : 0)),
    sum((l) => l.shedKwh),
  ];
}

const sites = process.argv[3] === "palawan" ? [palawanVillage] : [lagosClinic];
const seeds = Number(process.argv[2] ?? 1);

for (const site of sites) {
  const totals = { base: [0, 0, 0, 0, 0, 0], keep: [0, 0, 0, 0, 0, 0] };
  for (let seed = 1; seed <= seeds; seed++) {
    const week = makeWeek(site, seed, 8); // 8 days, so the last day still has 24 h to look ahead
    const fcHours = toHourly(forecast(week, seed));
    const days7 = week.slice(0, 7 * STEPS_PER_DAY);

    let held: Command = { genKw: 0, shedKw: 0 };
    const keep = simulate(site, days7, (state, step, k) => {
      if (k % 4 === 0) {
        const h = k / 4; // re-plan at the top of every hour; the current grid state is known for sure
        held = plan(site, state, [{ ...fcHours[h], gridOn: step.gridOn }, ...fcHours.slice(h + 1, h + 24)]);
      }
      return held;
    });
    const base = simulate(site, days7, (state, step) => baseline(site, state, step));
    base.forEach((v, i) => (totals.base[i] += v / seeds));
    keep.forEach((v, i) => (totals.keep[i] += v / seeds));
  }
  console.log(`${site.name} · average of ${seeds} week(s)`);
  ["fuel L", "generator h", "fridge down min", "battery cycles", "hours below 20%", "shed kWh"].forEach((name, i) =>
    console.log(`  ${name.padEnd(16)} old rules ${totals.base[i].toFixed(1).padStart(5)}   keeplit ${totals.keep[i].toFixed(1).padStart(5)}`),
  );
}
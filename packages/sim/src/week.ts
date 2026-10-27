import { baseline } from "./baseline.ts";
import { stepPlant } from "./plant.ts";
import { lagosClinic, makeWeek, palawanVillage } from "./scenarios.ts";
import { DT, type Log, type State } from "./types.ts";

for (const site of [lagosClinic, palawanVillage]) {
  let state: State = { socKwh: 0.6 * site.battery.capacityKwh, genOn: false };
  const logs: Log[] = [];
  for (const step of makeWeek(site, 1)) {
    const { next, log } = stepPlant(site, state, step, baseline(site, state, step));
    state = next;
    logs.push(log);
  }
  const sum = (f: (l: Log) => number) => logs.reduce((a, l) => a + f(l), 0);
  console.log(`${site.name} · baseline · 7 days`);
  console.log(`  fuel             ${sum((l) => l.fuelL).toFixed(1)} L`);
  console.log(`  generator        ${sum((l) => (l.genKw > 0 ? DT : 0)).toFixed(1)} h`);
  console.log(`  fridge down      ${sum((l) => (l.criticalUnmetKwh > 1e-6 ? DT * 60 : 0)).toFixed(0)} min`);
  console.log(`  battery cycles   ${(sum((l) => l.dischargeKwh) / site.battery.capacityKwh).toFixed(1)}`);
  console.log(`  hours below 20%  ${sum((l) => (l.socPct < 20 ? DT : 0)).toFixed(1)}`);
}
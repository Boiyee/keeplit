import { stepPlant } from "./plant.ts";
import type { Site, State } from "./types.ts";

const site: Site = {
  name: "test",
  battery: { capacityKwh: 10, etaCharge: 0.92, etaDischarge: 0.92, maxChargeKw: 3, maxDischargeKw: 4, reservePct: 30 },
  pvKwp: 3.6,
  generator: { maxKw: 4, minKw: 1.2, litresPerKwh: 0.3, idleLitresPerHour: 0.4, fuelPricePerLitre: 1000 },
  hasGrid: true,
};

let state: State = { socKwh: 6, genOn: false };
// One hour at night: no sun, no grid, fridge and lights only.
for (let i = 0; i < 4; i++) {
  const { next, log } = stepPlant(site, state, { pvKw: 0, criticalKw: 0.4, otherKw: 0, gridOn: false }, { genKw: 0, shedKw: 0 });
  state = next;
  console.log(`step ${i + 1}: battery ${log.socPct.toFixed(1)}%`);
}
// One hour with the generator on at 4 kW.
for (let i = 0; i < 4; i++) {
  const { next, log } = stepPlant(site, state, { pvKw: 0, criticalKw: 0.4, otherKw: 0, gridOn: false }, { genKw: 4, shedKw: 0 });
  state = next;
  console.log(`gen step ${i + 1}: battery ${log.socPct.toFixed(1)}%, fuel ${log.fuelL.toFixed(3)} L`);
}
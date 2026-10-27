import { STEPS_PER_DAY, type Site, type Step } from "./types.ts";

/** Seeded random numbers, so every run with the same seed is identical. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Solar output for one step: a daylight curve times that day's cloudiness. */
function solarKw(kwp: number, hour: number, cloud: number) {
  if (hour < 6.5 || hour > 18.5) return 0;
  return kwp * 0.8 * Math.sin((Math.PI * (hour - 6.5)) / 12) * cloud;
}

export const lagosClinic: Site = {
  name: "Lagos clinic",
  battery: { capacityKwh: 7.2, etaCharge: 0.92, etaDischarge: 0.92, maxChargeKw: 2.5, maxDischargeKw: 4, reservePct: 30 },
  pvKwp: 3.6,
  generator: { maxKw: 4, minKw: 1.2, litresPerKwh: 0.3, idleLitresPerHour: 0.4, fuelPricePerLitre: 1000 },
  hasGrid: true,
};

export const palawanVillage: Site = {
  name: "Palawan village",
  battery: { capacityKwh: 7, etaCharge: 0.96, etaDischarge: 0.96, maxChargeKw: 3, maxDischargeKw: 3, reservePct: 15 },
  pvKwp: 2.5,
  generator: { maxKw: 3, minKw: 0.9, litresPerKwh: 0.28, idleLitresPerHour: 0.3, fuelPricePerLitre: 70 },
  hasGrid: false,
};

/** Build `days` of 15-minute steps for a site. */
export function makeWeek(site: Site, seed: number, days = 7): Step[] {
  const r = rng(seed);
  const steps: Step[] = [];
  for (let d = 0; d < days; d++) {
    const cloud = 0.45 + 0.55 * r();
    // Lagos-style grid: two long outages a day at random times, 6 to 12 hours each
    const outages = site.hasGrid
      ? [0, 1].map(() => {
          const start = Math.floor(r() * STEPS_PER_DAY);
          return [start, start + 24 + Math.floor(r() * 24)];
        })
      : [];
    for (let k = 0; k < STEPS_PER_DAY; k++) {
      const hour = k / 4;
      const day = hour >= 8 && hour < 17;
      const gridOn = site.hasGrid && !outages.some(([a, b]) => k >= a && k < b) && r() > 0.03;
      steps.push({
        pvKw: solarKw(site.pvKwp, hour, cloud * (0.85 + 0.3 * r())),
        criticalKw: site.hasGrid ? 0.45 + (hour >= 18 || hour < 6 ? 0.2 : 0) : 0.4, // fridge + lights (+ ward at night)
        otherKw: site.hasGrid ? (day ? 1.2 + 1.2 * r() : 0.2 * r()) : day ? 0.6 + 0.6 * r() : 0.15 * r(),
        gridOn,
      });
    }
  }
  return steps;
}

/** What the planner "knows" ahead of time: the real values plus forecast error. Used in step 4. */
export function forecast(steps: Step[], seed: number): Step[] {
  const r = rng(seed ^ 0x9e3779b9);
  return steps.map((s) => ({ ...s, pvKw: s.pvKw * (0.8 + 0.4 * r()), otherKw: s.otherKw * (0.8 + 0.4 * r()) }));
}
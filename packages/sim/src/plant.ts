import { DT, type Command, type Log, type Site, type State, type Step } from "./types.ts";

/** Advance the site by one 15-minute step. The battery absorbs whatever is left over. */
export function stepPlant(site: Site, state: State, step: Step, cmd: Command): { next: State; log: Log } {
  const b = site.battery;
  const gen = site.generator;

  // A generator can't run below its minimum load.
  let genKw = 0;
  if (gen && cmd.genKw > 0) genKw = Math.min(gen.maxKw, Math.max(gen.minKw, cmd.genKw));

  const shedKw = Math.min(cmd.shedKw, step.otherKw);
  const demandKw = step.criticalKw + step.otherKw - shedKw;
  const net = step.pvKw + genKw - demandKw; // + surplus, - deficit

  let soc = state.socKwh;
  let dischargeKwh = 0;
  let gridKwh = 0;
  let unmetKw = 0;

  if (net >= 0) {
    // Surplus: charge the battery, limited by charge rate and free space. The rest is wasted.
    const chargeKw = Math.min(net, b.maxChargeKw, (b.capacityKwh - soc) / (b.etaCharge * DT));
    soc += chargeKw * b.etaCharge * DT;
  } else if (step.gridOn) {
    // Deficit with grid: the grid covers the gap and the inverter charges the battery from it.
    gridKwh = -net * DT;
    const chargeKw = Math.min(b.maxChargeKw, (b.capacityKwh - soc) / (b.etaCharge * DT));
    soc += chargeKw * b.etaCharge * DT;
    gridKwh += chargeKw * DT;
  } else {
    // Deficit, no grid: the battery covers what it can.
    const deficit = -net;
    const fromBattery = Math.min(deficit, b.maxDischargeKw, (soc * b.etaDischarge) / DT);
    soc -= (fromBattery / b.etaDischarge) * DT;
    dischargeKwh = fromBattery * DT;
    unmetKw = deficit - fromBattery;
  }

  // Missing power hits the non-critical load first; whatever is left is the fridge going down.
  const criticalUnmetKw = Math.max(0, unmetKw - (step.otherKw - shedKw));
  const fuelL = gen && genKw > 0 ? (gen.litresPerKwh * genKw + gen.idleLitresPerHour) * DT : 0;

  return {
    next: { socKwh: Math.max(0, soc), genOn: genKw > 0 },
    log: {
      socPct: (100 * soc) / b.capacityKwh,
      genKw,
      fuelL,
      dischargeKwh,
      criticalUnmetKwh: criticalUnmetKw * DT,
      shedKwh: shedKw * DT,
      gridKwh,
    },
  };
}
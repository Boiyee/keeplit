export const DT = 0.25; // hours per step (15 min)
export const STEPS_PER_DAY = 96;

export interface Site {
  name: string;
  battery: { capacityKwh: number; etaCharge: number; etaDischarge: number; maxChargeKw: number; maxDischargeKw: number; reservePct: number };
  pvKwp: number;
  generator: { maxKw: number; minKw: number; litresPerKwh: number; idleLitresPerHour: number; fuelPricePerLitre: number } | null;
  hasGrid: boolean;
}

/** One 15-minute slice of the world. */
export interface Step {
  pvKw: number;      // solar available
  criticalKw: number; // must never go down (fridge)
  otherKw: number;   // can be switched off
  gridOn: boolean;
}

/** What a policy decides for one step. */
export interface Command {
  genKw: number;  // 0 = generator off
  shedKw: number; // non-critical load switched off
}

export interface State {
  socKwh: number; // energy in the battery
  genOn: boolean;
}

export interface Log {
  socPct: number;
  genKw: number;
  fuelL: number;
  dischargeKwh: number;
  criticalUnmetKwh: number;
  shedKwh: number;
  gridKwh: number;
}
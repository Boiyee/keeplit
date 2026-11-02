export interface Reading {
  batteryPct: number | null;
  batteryV: number | null;
  loadW: number | null;
  pvW: number | null;
  acInputOn: boolean | null;
  brand: string | null;
  confidence: "high" | "medium" | "low";
  notes: string;
}

export interface PowerLimits {
  pvMaxW?: number;
  loadMaxW?: number;
}

const DEFAULT_MAX_W = 20000;

// Real system bands: 12 V, 24 V and 48 V nominal.
const VOLTAGE_BANDS: Array<{ min: number; max: number; label: string }> = [
  { min: 10.5, max: 15.5, label: "12 V" },
  { min: 21, max: 31, label: "24 V" },
  { min: 42, max: 62, label: "48 V" },
];

// A small value with decimals (e.g. 2.4) is almost certainly kilowatts read as watts.
function looksLikeKwAsW(value: number): boolean {
  return value > 0 && value < 30 && !Number.isInteger(value);
}

function checkPower(field: "loadW" | "pvW", value: number | null, maxW: number, problems: string[]): void {
  if (value === null) return;
  if (value < 0) {
    problems.push(`${field} ${value} is impossible (power cannot be negative)`);
    return;
  }
  if (looksLikeKwAsW(value)) {
    problems.push(
      `${field} ${value} looks like kW read as W (a value between 0 and 30 with decimals is usually kilowatts)`,
    );
  }
  if (value > maxW) {
    problems.push(`${field} ${value} is above the ${maxW} W limit`);
  }
}

// Returns a list of plain-English problems with a reading; empty means OK.
export function validate(r: Reading, limits?: PowerLimits): string[] {
  const problems: string[] = [];
  if (r.batteryPct !== null && (r.batteryPct < 0 || r.batteryPct > 100)) {
    problems.push(`batteryPct ${r.batteryPct} is impossible (must be 0–100)`);
  }
  const volts = r.batteryV;
  if (volts !== null && !VOLTAGE_BANDS.some((band) => volts >= band.min && volts <= band.max)) {
    problems.push(`batteryV ${volts} fits no known system band (12 V: 10.5–15.5, 24 V: 21–31, 48 V: 42–62)`);
  }
  checkPower("loadW", r.loadW, limits?.loadMaxW ?? DEFAULT_MAX_W, problems);
  checkPower("pvW", r.pvW, limits?.pvMaxW ?? DEFAULT_MAX_W, problems);
  const fields = [r.batteryPct, r.batteryV, r.loadW, r.pvW, r.acInputOn, r.brand];
  if (fields.every((value) => value === null)) {
    problems.push("nothing readable (every reading field is null)");
  }
  return problems;
}

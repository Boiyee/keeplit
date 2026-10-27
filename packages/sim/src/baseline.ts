import type { Command, Site, State, Step } from "./types.ts";

/** A typical inverter default: generator on below 20%, off again at 80%. Nothing is planned ahead. */
export function baseline(site: Site, state: State, step: Step): Command {
  const gen = site.generator;
  if (!gen || step.gridOn) return { genKw: 0, shedKw: 0 };
  const socPct = (100 * state.socKwh) / site.battery.capacityKwh;
  const on = state.genOn ? socPct < 80 : socPct < 20;
  return { genKw: on ? gen.maxKw : 0, shedKw: 0 };
}
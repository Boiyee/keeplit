/// <reference lib="webworker" />
// Runs the planner off the main thread, so the screen never freezes while HiGHS is solving.
import wasmUrl from "highs/runtime?url";
import { initPlanner, plan } from "../../../packages/planner/src/planner.ts";
import type { Site, State, Step } from "../../../packages/sim/src/types.ts";

export interface PlanRequest {
  site: Site;
  state: State;
  hours: Step[];
}

const ready = initPlanner({ locateFile: () => wasmUrl });

self.onmessage = async (e: MessageEvent<PlanRequest>) => {
  await ready;
  const { site, state, hours } = e.data;
  try {
    self.postMessage({ ok: true, result: plan(site, state, hours) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
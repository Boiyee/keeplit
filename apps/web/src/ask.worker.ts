/// <reference lib="webworker" />
// Answers "Can I run X?" off the main thread. It re-plans up to 13 times, so it must not block the screen.
import wasmUrl from "highs/runtime?url";
import { initPlanner } from "../../../packages/planner/src/planner.ts";
import { whatIf, type Ask } from "../../../packages/planner/src/whatif.ts";
import type { Site, State, Step } from "../../../packages/sim/src/types.ts";

export interface AskRequest {
  site: Site;
  state: State;
  hours: Step[];
  ask: Ask;
}

const ready = initPlanner({ locateFile: () => wasmUrl });

self.onmessage = async (e: MessageEvent<AskRequest>) => {
  await ready;
  const { site, state, hours, ask } = e.data;
  try {
    self.postMessage({ ok: true, answer: whatIf(site, state, hours, ask) });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) });
  }
};
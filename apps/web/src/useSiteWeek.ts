import { useEffect, useRef, useState } from "react";
import type { PlannedHour } from "../../../packages/planner/src/planner.ts";
import { toHourly } from "../../../packages/planner/src/planner.ts";
import { stepPlant } from "../../../packages/sim/src/plant.ts";
import { forecast, makeWeek } from "../../../packages/sim/src/scenarios.ts";
import type { Command, Site, State, Step } from "../../../packages/sim/src/types.ts";
import type { PlanRequest } from "./planner.worker.ts";

const WEEK_HOURS = 7 * 24;
const MS_PER_HOUR = 1200; // playback speed: one simulated hour every 1.2 s (slower if the solver is slower)

/** Everything the screens need to draw one moment of the simulated week. */
export interface Snapshot {
  hour: number; // hours since Monday 00:00; the screen shows the start of this hour
  now: Step; // conditions right now
  socPct: number; // battery right now
  genKw: number; // what the planner decided for this hour
  fuelL: number; // fuel used so far this week
  schedule: PlannedHour[]; // the fresh plan: entry i covers hour + i
  ahead: Step[]; // the forecast that plan was made from
  solveMs: number;
}

/** Ask the planner worker for a plan, and wait for the answer. */
function makeSolver() {
  const worker = new Worker(new URL("./planner.worker.ts", import.meta.url), { type: "module" });
  return {
    solve: (req: PlanRequest) =>
      new Promise<Command & { schedule: PlannedHour[] }>((resolve, reject) => {
        worker.onmessage = (e) => (e.data.ok ? resolve(e.data.result) : reject(new Error(e.data.error)));
        worker.postMessage(req);
      }),
    stop: () => worker.terminate(),
  };
}

/** Play a simulated week for one site: plan every hour, then run the plant for four 15-minute steps. */
export function useSiteWeek(site: Site, seed = 1) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState("");
    const playingRef = useRef(playing);
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const week = makeWeek(site, seed, 8); // 8 days, so the last day can still look 24 h ahead
    const fcHours = toHourly(forecast(week, seed));
    const solver = makeSolver();
    let state: State = { socKwh: 0.6 * site.battery.capacityKwh, genOn: false };
    let fuelL = 0;
    let hour = 0;
    let stopped = false;

    async function run() {
      while (!stopped && hour < WEEK_HOURS) {
        if (!playingRef.current) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }
        const t0 = performance.now();
        // the current hour's grid state is known for sure; the rest is forecast
        const ahead = [{ ...fcHours[hour], gridOn: week[hour * 4].gridOn }, ...fcHours.slice(hour + 1, hour + 24)];
        const result = await solver.solve({ site, state, hours: ahead });
        const solveMs = performance.now() - t0;

        if (stopped) return;
        // show the moment the decision is made, then let the hour play out
        setSnap({
          hour,
          now: week[hour * 4],
          socPct: (100 * state.socKwh) / site.battery.capacityKwh,
          genKw: result.genKw,
          fuelL,
          schedule: result.schedule,
          ahead,
          solveMs,
        });
        for (let q = 0; q < 4; q++) {
          const { next, log } = stepPlant(site, state, week[hour * 4 + q], result);
          state = next;
          fuelL += log.fuelL;
        }
        hour++;
        await new Promise((r) => setTimeout(r, Math.max(0, MS_PER_HOUR - (performance.now() - t0))));
      }
    }
    run().catch((e) => setError(String(e)));
    return () => {
      stopped = true;
      solver.stop();
    };
  }, [site, seed]);

  return { snap, playing, setPlaying, error };
}

/** "Mon 14:00" for a given hour of the week. */
export function clock(hour: number) {
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][Math.floor(hour / 24) % 7];
  return `${day} ${String(hour % 24).padStart(2, "0")}:00`;
}
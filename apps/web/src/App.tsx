import { useEffect, useState } from "react";
import wasmUrl from "highs/runtime?url";
import {
  initPlanner,
  plan,
  toHourly,
  type PlannedHour,
} from "../../../packages/planner/src/planner.ts";
import {
  forecast,
  lagosClinic,
  makeWeek,
} from "../../../packages/sim/src/scenarios.ts";

/** Plan the next 24 hours for the demo Lagos clinic, entirely in the browser. */
async function planDemoDay() {
  await initPlanner({ locateFile: () => wasmUrl });
  const hours = toHourly(forecast(makeWeek(lagosClinic, 1, 2), 1)).slice(0, 24);
  const state = { socKwh: 0.6 * lagosClinic.battery.capacityKwh, genOn: false };
  const t0 = performance.now();
  const result = plan(lagosClinic, state, hours);
  return { schedule: result.schedule, ms: performance.now() - t0 };
}

export default function App() {
  const [schedule, setSchedule] = useState<PlannedHour[] | null>(null);
  const [ms, setMs] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    planDemoDay()
      .then((r) => {
        setSchedule(r.schedule);
        setMs(r.ms);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const nextGen = schedule?.findIndex((h) => h.genKw > 0) ?? -1;

  return (
    <main className="min-h-screen bg-[#0A0C10] text-[#EDEFF2] p-5 font-sans">
      <p className="font-mono text-xs tracking-widest text-[#8A93A3]">
        LAGOS CLINIC · PLANNED ON THIS DEVICE
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight mt-1">
        Next <span className="text-[#FFC94D]">24</span> hours
      </h1>

      {error && <p className="mt-6 text-[#FF4D5E]">{error}</p>}
      {!schedule && !error && <p className="mt-6 text-[#8A93A3]">Planning…</p>}

      {schedule && (
        <>
          <div className="mt-6 rounded-2xl border border-[#FFC94D] bg-[#11141A] p-5">
            <p className="font-mono text-xs text-[#FFC94D]">NEXT ACTION</p>
            <p className="text-2xl font-extrabold mt-1">
              {nextGen === -1
                ? "Generator stays off all day"
                : nextGen === 0
                  ? "Run the generator now"
                  : `Generator off for ${nextGen} h`}
            </p>
            <p className="font-mono text-xs text-[#8A93A3] mt-2">
              Solved in {ms.toFixed(0)} ms in this browser
            </p>
          </div>

          <ol className="mt-4 rounded-2xl border border-[#1E232C] bg-[#11141A] divide-y divide-[#1E232C]">
            {schedule.map((h, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="font-mono w-10 text-[#8A93A3]">+{i}h</span>
                <span className="flex-1 h-2 rounded bg-[#1E232C]">
                  <span
                    className="block h-2 rounded bg-[#FFC94D]"
                    style={{ width: `${h.socPct}%` }}
                  />
                </span>
                <span className="w-12 text-right">{h.socPct.toFixed(0)}%</span>
                <span className="w-20 text-right font-mono text-xs">
                  {h.genKw > 0 ? (
                    <span className="text-[#B07CFF]">
                      GEN {h.genKw.toFixed(1)}
                    </span>
                  ) : h.gridKw > 0.01 ? (
                    "grid"
                  ) : (
                    "battery/sun"
                  )}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </main>
  );
}

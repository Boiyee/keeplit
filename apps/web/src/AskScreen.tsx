import { useEffect, useRef, useState } from "react";
import type { Answer } from "../../../packages/planner/src/whatif.ts";
import type { Site } from "../../../packages/sim/src/types.ts";
import type { AskRequest } from "./ask.worker.ts";
import { clock, type Snapshot } from "./useSiteWeek.ts";

/** The clinic's appliances that people ask about. Later, these come from onboarding. */
const APPLIANCES = [
  { name: "Sterilizer", kw: 1.8 },
  { name: "Water pump", kw: 0.75 },
  { name: "Air conditioner", kw: 1.2 },
  { name: "Lab centrifuge", kw: 0.4 },
];
const DURATIONS = [20, 40, 60, 120];

interface Result {
  answer: Answer;
  appliance: (typeof APPLIANCES)[number];
  minutes: number;
  askedAt: number; // hour of the week it was asked
  ms: number;
}

const forMinutes = (m: number) => (m < 60 ? `${m} min` : `${m / 60} h`);

export function AskScreen({ site, s }: { site: Site; s: Snapshot }) {
  const worker = useRef<Worker | null>(null);
  const [appliance, setAppliance] = useState(0);
  const [minutes, setMinutes] = useState(40);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    worker.current = new Worker(new URL("./ask.worker.ts", import.meta.url), {
      type: "module",
    });
    return () => worker.current?.terminate();
  }, []);

  function check() {
    const w = worker.current;
    if (!w) return;
    const a = APPLIANCES[appliance];
    const req: AskRequest = {
      site,
      state: {
        socKwh: (s.socPct / 100) * site.battery.capacityKwh,
        genOn: s.genKw > 0,
      },
      hours: s.ahead,
      ask: { kw: a.kw, minutes },
    };
    const t0 = performance.now();
    setBusy(true);
    setError("");
    w.onmessage = (e) => {
      setBusy(false);
      if (e.data.ok)
        setResult({
          answer: e.data.answer,
          appliance: a,
          minutes,
          askedAt: s.hour,
          ms: performance.now() - t0,
        });
      else setError(e.data.error);
    };
    w.postMessage(req);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display font-extrabold text-3xl leading-none tracking-tight">
        Ask your <span className="text-accent">power.</span>
      </h2>

      <section className="rounded-2xl border border-line bg-panel p-4 flex flex-col gap-3">
        <p className="font-display font-extrabold text-lg">
          Can I run something?
        </p>
        <div className="flex gap-2">
          <label className="flex-[2] flex flex-col gap-1 font-mono text-[10.5px] text-faint">
            APPLIANCE
            <select
              value={appliance}
              onChange={(e) => setAppliance(Number(e.target.value))}
              className="h-11 px-2.5 border border-line-strong bg-ink text-text font-sans text-sm"
            >
              {APPLIANCES.map((a, i) => (
                <option key={a.name} value={i}>
                  {a.name} · {a.kw} kW
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 flex flex-col gap-1 font-mono text-[10.5px] text-faint">
            FOR
            <select
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="h-11 px-2.5 border border-line-strong bg-ink text-text font-sans text-sm"
            >
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {forMinutes(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          onClick={check}
          disabled={busy}
          className="h-12 bg-accent text-ink font-semibold disabled:opacity-60"
        >
          {busy ? "Checking the plan…" : "Check now"}
        </button>
      </section>

      {error && <p className="text-bad">{error}</p>}
      {result && <AnswerCard r={result} />}
    </div>
  );
}

function AnswerCard({ r }: { r: Result }) {
  const { answer: a } = r;
  const at = clock(r.askedAt + a.startIn).slice(4);
  const title =
    a.verdict === "now" ? (
      <>
        Yes, run it <span className="text-accent">now.</span>
      </>
    ) : a.verdict === "later" ? (
      <>
        Not yet. Run it from <span className="text-accent">{at}.</span>
      </>
    ) : (
      <>
        It costs about{" "}
        <span className="text-accent">{a.extraFuelL.toFixed(1)} L</span> of
        fuel.
      </>
    );
  const why =
    a.verdict === "now"
      ? "Sun, battery and grid cover it without starting the generator or putting the fridge at risk."
      : a.verdict === "later"
        ? `Running it now would cost about ${a.extraFuelNowL.toFixed(1)} L of extra fuel. From ${at} it runs on free power.`
        : `There's no free window in the next 12 hours. Cheapest at ${at}${a.startIn === 0 ? " (now)" : ""}; right now it would cost ${a.extraFuelNowL.toFixed(1)} L.`;

  return (
    <section className="rounded-2xl border border-accent bg-panel p-5 flex flex-col gap-3 shadow-[0_0_32px_rgb(255_201_77/0.14)]">
      <p className="font-mono text-[11px] text-faint">
        {r.appliance.name.toUpperCase()} · {r.appliance.kw} kW ·{" "}
        {forMinutes(r.minutes).toUpperCase()}
      </p>
      <p className="font-display font-extrabold text-2xl leading-tight tracking-tight">
        {title}
      </p>
      <p className="text-sm text-muted">{why}</p>
      <div className="border-t border-line pt-3 flex flex-col gap-1.5 font-mono text-[11px] leading-relaxed">
        <p className="text-faint">HOW I CHECKED</p>
        <p>
          <span className="text-good">✓</span> Re-planned 24 h with{" "}
          {r.appliance.kw} kW added for {forMinutes(r.minutes)}, starting now →{" "}
          {a.extraFuelNowL.toFixed(2)} L extra
        </p>
        {a.startIn > 0 && (
          <p>
            <span className="text-good">✓</span> Tried later start times → best
            at {at}, {a.extraFuelL.toFixed(2)} L extra
          </p>
        )}
        <p>
          <span className="text-good">✓</span> Lowest battery in that plan:{" "}
          {a.lowestPct.toFixed(0)}%
        </p>
        <p className="text-faint pt-1">
          ASKED AT {clock(r.askedAt).toUpperCase()} · PLANNER ON THIS DEVICE ·
          NO INTERNET USED · {(r.ms / 1000).toFixed(1)} S
        </p>
      </div>
    </section>
  );
}

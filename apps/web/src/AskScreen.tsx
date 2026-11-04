import { useEffect, useRef, useState } from "react";
import type { Answer } from "../../../packages/planner/src/whatif.ts";
import type { Site } from "../../../packages/sim/src/types.ts";
import type { AskRequest } from "./ask.worker.ts";
import { reply, understand, type SiteContext } from "../../../packages/agent/src/agent.ts";
import { browserTranscriber, speak, type Transcriber } from "./voice.ts";
import { LANGUAGES, codeFor } from "./languages.ts";
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

const OFFLINE_MSG = "I need internet to understand questions. Use the picker below — it works offline.";

const VOICE_LANG_KEY = "keeplit.voiceLang";

/** Voice language saved earlier, or English when nothing valid was saved. */
function loadVoiceLang(): string {
  try {
    const saved = localStorage.getItem(VOICE_LANG_KEY);
    if (saved && LANGUAGES.some((l) => l.name === saved)) return saved;
  } catch {
    // Storage unavailable (private mode, blocked cookies); fall back to English.
  }
  return "English";
}

interface ChatMsg {
  from: "user" | "keeplit";
  text: string;
  planner?: { verdict: Answer["verdict"]; extraFuelL: number; lowestPct: number } | null;
}

/** One-line summary of the next 24 h for the agent's site context. */
function planSummary(snap: Snapshot): string {
  const coming = snap.schedule.map((h, i) => ({ ...h, at: snap.hour + i }));
  const lowest = coming.reduce((a, b) => (b.socPct < a.socPct ? b : a));
  const gen = coming.filter((h) => h.genKw > 0);
  const genText =
    gen.length === 0
      ? "generator stays off"
      : `generator on ${gen.map((h) => `${clock(h.at).slice(4)} ${h.genKw.toFixed(1)}kW`).join(", ")}`;
  return `${genText}; lowest battery ${lowest.socPct.toFixed(0)}% at ${clock(lowest.at).slice(4)}.`;
}

export function AskScreen({ site, s }: { site: Site; s: Snapshot }) {
  const worker = useRef<Worker | null>(null);
  const [appliance, setAppliance] = useState(0);
  const [minutes, setMinutes] = useState(40);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [micBlocked, setMicBlocked] = useState(false);
  const [voiceLang, setVoiceLang] = useState<string>(loadVoiceLang);
  const [transcriber, setTranscriber] = useState<Transcriber | null>(() =>
    browserTranscriber(codeFor(voiceLang)),
  );
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    worker.current = new Worker(new URL("./ask.worker.ts", import.meta.url), {
      type: "module",
    });
    return () => worker.current?.terminate();
  }, []);

  useEffect(() => () => transcriber?.stop(), [transcriber]);

  /** Runs one what-if through the planner worker; callers must not overlap. */
  function askPlanner(req: AskRequest): Promise<Answer> {
    const w = worker.current;
    if (!w) return Promise.reject(new Error("planner starting"));
    return new Promise<Answer>((resolve, reject) => {
      w.onmessage = (e) => {
        if (e.data.ok) resolve(e.data.answer as Answer);
        else reject(new Error(String(e.data.error)));
      };
      w.postMessage(req);
    });
  }

  function siteState() {
    return {
      socKwh: (s.socPct / 100) * site.battery.capacityKwh,
      genOn: s.genKw > 0,
    };
  }

  function buildCtx(): SiteContext {
    return {
      siteName: site.name,
      clock: clock(s.hour),
      batteryPct: s.socPct,
      solarKw: s.now.pvKw,
      loadKw: s.now.criticalKw + s.now.otherKw,
      gridOn: s.now.gridOn,
      genKw: s.genKw,
      appliances: APPLIANCES.map((a) => ({ name: a.name, kw: a.kw })),
      plan: planSummary(s),
    };
  }

  async function send(override?: string) {
    const question = (override ?? input).trim();
    if (question === "" || chatBusy) return;
    setMessages((m) => [...m, { from: "user", text: question }]);
    setInput("");
    if (!navigator.onLine) {
      setMessages((m) => [...m, { from: "keeplit", text: OFFLINE_MSG }]);
      return;
    }
    setChatBusy(true);
    try {
      const ctx = buildCtx();
      const { intent, language } = await understand(question, ctx);
      let facts: object = ctx;
      let planner: ChatMsg["planner"] = null;
      if (intent.kind === "what_if") {
        const answer = await askPlanner({
          site,
          state: siteState(),
          hours: s.ahead,
          ask: { kw: intent.kw, minutes: intent.minutes },
        });
        facts = answer;
        planner = { verdict: answer.verdict, extraFuelL: answer.extraFuelL, lowestPct: answer.lowestPct };
      }
      const text = await reply(question, ctx, intent, facts, language);
      if (soundOn) {
        try {
          speak(text, codeFor(language));
        } catch {
          // No voice for this language, or speech blocked: the written answer below still stands.
        }
      }
      setMessages((m) => [...m, { from: "keeplit", text, planner }]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setMessages((m) => [
        ...m,
        {
          from: "keeplit",
          text: navigator.onLine ? `Spark error: ${reason.slice(0, 120)}` : OFFLINE_MSG,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }

  function pickVoiceLang(next: string) {
    setVoiceLang(next);
    try {
      localStorage.setItem(VOICE_LANG_KEY, next);
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
    transcriber?.stop();
    setListening(false);
    setTranscriber(browserTranscriber(codeFor(next)));
  }

  function toggleMic() {
    if (!transcriber) return;
    if (listening) {
      transcriber.stop();
      setListening(false);
      return;
    }
    setMicBlocked(false);
    setListening(true);
    transcriber.start(
      (text, final) => {
        setInput(text);
        if (final) {
          setListening(false);
          void send(text);
        }
      },
      (msg) => {
        setListening(false);
        if (msg === "not-allowed" || msg === "service-not-allowed") setMicBlocked(true);
      },
    );
  }

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
        {messages.length > 0 && (
          <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.from === "user"
                    ? "ml-auto max-w-[85%] bg-accent text-ink px-4 py-2.5 text-sm"
                    : "max-w-[95%] rounded-2xl border border-line bg-panel px-4 py-2.5 text-sm"
                }
              >
                <p>{m.text}</p>
                {m.planner && (
                  <p className="font-mono text-[10.5px] text-faint pt-1.5">
                    PLANNER: {m.planner.verdict} · {m.planner.extraFuelL.toFixed(1)} L · LOWEST{" "}
                    {m.planner.lowestPct.toFixed(0)}%
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        {chatBusy && <p className="text-sm text-faint">Thinking…</p>}
        {micBlocked && <p className="text-sm text-bad">Microphone blocked — type instead.</p>}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void send();
            }}
            placeholder="Ask KEEPLIT anything"
            aria-label="Ask KEEPLIT anything"
            className="h-12 px-3 border border-line-strong bg-ink text-text text-sm flex-1 min-w-0"
          />
          {transcriber && (
            <button
              onClick={toggleMic}
              aria-label={listening ? "Stop" : "Start talking"}
              className={`h-12 w-12 shrink-0 border flex items-center justify-center ${
                listening ? "bg-accent text-ink border-accent" : "border-line-strong text-text"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <path d="M12 18v3" />
              </svg>
            </button>
          )}
          {transcriber && (
            <label className="flex flex-col gap-1 font-mono text-[10.5px] text-faint">
              VOICE LANGUAGE
              <select
                value={voiceLang}
                onChange={(e) => pickVoiceLang(e.target.value)}
                aria-label="Voice language"
                className="h-12 px-2 border border-line-strong bg-ink text-text text-sm max-w-28"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={() => setSoundOn(!soundOn)}
            aria-label={soundOn ? "Mute spoken answers" : "Read answers aloud"}
            aria-pressed={soundOn}
            className={`h-12 w-12 shrink-0 border flex items-center justify-center ${
              soundOn ? "bg-accent text-ink border-accent" : "border-line-strong text-faint"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
              {soundOn ? (
                <>
                  <path d="M16 9a4 4 0 0 1 0 6" />
                  <path d="M18.5 6.5a8 8 0 0 1 0 11" />
                </>
              ) : (
                <path d="M16 9l6 6M22 9l-6 6" />
              )}
            </svg>
          </button>
          <button
            onClick={() => void send()}
            disabled={chatBusy || busy || input.trim() === ""}
            className="h-12 px-5 bg-accent text-ink font-semibold disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </section>

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
          disabled={busy || chatBusy}
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

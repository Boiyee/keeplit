import { useState } from "react";
import { lagosClinic } from "../../../packages/sim/src/scenarios.ts";
import { Live, Plan } from "./screens.tsx";
import { clock, useSiteWeek } from "./useSiteWeek.ts";

type Tab = "live" | "plan";

export default function App() {
  const { snap, playing, setPlaying, error } = useSiteWeek(lagosClinic);
  const [tab, setTab] = useState<Tab>("live");

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-5 pb-28">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h1 className="font-display font-extrabold text-[22px] tracking-tight">
            {lagosClinic.name}
          </h1>
          <p className="font-mono text-[11px] tracking-[0.08em] text-faint">
            DEMO SITE · {snap ? clock(snap.hour).toUpperCase() : "STARTING"} ·{" "}
            {snap ? `PLANNED IN ${snap.solveMs.toFixed(0)} MS` : "PLANNING"}
          </p>
        </div>
        <button
          onClick={() => setPlaying(!playing)}
          className="h-11 px-4 border border-line-strong text-sm font-mono"
          aria-label={playing ? "Pause the week" : "Play the week"}
        >
          {playing ? "PAUSE" : "PLAY"}
        </button>
      </header>

      {error && <p className="text-bad">{error}</p>}
      {!snap && !error && (
        <p className="text-faint mt-10">Planning the first hour…</p>
      )}
      {snap &&
        (tab === "live" ? (
          <Live s={snap} onPlan={() => setTab("plan")} />
        ) : (
          <Plan s={snap} />
        ))}

      <nav
        aria-label="App"
        className="fixed inset-x-3 bottom-3 mx-auto max-w-md flex gap-1 border border-line bg-panel/95 p-1.5"
      >
        {(["live", "plan"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`flex-1 h-12 text-sm font-semibold capitalize ${tab === t ? "bg-accent text-ink" : "text-faint"}`}
          >
            {t}
          </button>
        ))}
        <button
          disabled
          className="flex-1 h-12 text-sm text-line-strong"
          title="Coming soon"
        >
          Ask
        </button>
      </nav>
    </div>
  );
}

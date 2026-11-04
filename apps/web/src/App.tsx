import { useState } from "react";
import { lagosClinic, palawanVillage } from "../../../packages/sim/src/scenarios.ts";
import type { Site } from "../../../packages/sim/src/types.ts";
import { AskScreen } from "./AskScreen.tsx";
import { CompareScreen } from "./CompareScreen.tsx";
import { Live, Plan } from "./screens.tsx";
import { clock, useSiteWeek } from "./useSiteWeek.ts";

type Tab = "live" | "plan" | "ask" | "compare";

const SITES: { site: Site; country: string }[] = [
  { site: lagosClinic, country: "Nigeria" },
  { site: palawanVillage, country: "Philippines" },
];

const SITE_KEY = "keeplit.site";

/** Site picked earlier, or Lagos clinic when nothing valid was saved. */
function loadSiteName(): string {
  try {
    const saved = localStorage.getItem(SITE_KEY);
    if (saved && SITES.some((s) => s.site.name === saved)) return saved;
  } catch {
    // Storage unavailable; fall back to Lagos clinic.
  }
  return lagosClinic.name;
}

export default function App() {
  const [siteName, setSiteName] = useState<string>(loadSiteName);
  // Module-level site objects, so the ref only changes when the site does
  // and useSiteWeek restarts the simulated week.
  const site = SITES.find((s) => s.site.name === siteName)?.site ?? lagosClinic;
  const { snap, playing, setPlaying, error, applyReading } = useSiteWeek(site);
  const [tab, setTab] = useState<Tab>("live");

  function pickSite(next: string) {
    setSiteName(next);
    try {
      localStorage.setItem(SITE_KEY, next);
    } catch {
      // Storage unavailable; the choice just won't persist.
    }
  }

  return (
    <div className="mx-auto max-w-md min-h-screen px-5 pt-5 pb-28">
      <header className="flex flex-col gap-2 mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display font-extrabold text-[22px] tracking-tight">
              {site.name}
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
        </div>
        <select
          value={site.name}
          onChange={(e) => pickSite(e.target.value)}
          aria-label="Site"
          className="h-9 px-2 border border-line-strong bg-ink text-text font-mono text-xs w-full"
        >
          {SITES.map((s) => (
            <option key={s.site.name} value={s.site.name}>
              {s.site.name} · {s.country}
            </option>
          ))}
        </select>
      </header>

      {error && <p className="text-bad">{error}</p>}
      {!snap && !error && (
        <p className="text-faint mt-10">Planning the first hour…</p>
      )}
      {snap && tab === "live" && (
        <Live
          s={snap}
          onPlan={() => setTab("plan")}
          site={site}
          onUseReading={applyReading}
        />
      )}
      {snap && tab === "plan" && <Plan s={snap} />}
      {snap && tab === "ask" && <AskScreen site={site} s={snap} />}
      {snap && tab === "compare" && (
        <CompareScreen site={site} s={snap} />
      )}

      <nav
        aria-label="App"
        className="fixed inset-x-3 bottom-3 mx-auto max-w-md flex gap-1 border border-line bg-panel/95 p-1.5"
      >
        {(["live", "plan", "ask", "compare"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
            className={`flex-1 h-12 text-sm font-semibold capitalize ${tab === t ? "bg-accent text-ink" : "text-faint"}`}
          >
            {t}
          </button>
        ))}
      </nav>
    </div>
  );
}

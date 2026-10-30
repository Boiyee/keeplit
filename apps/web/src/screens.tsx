import { PowerFlow } from "./PowerFlow.tsx";
import { clock, type Snapshot } from "./useSiteWeek.ts";

/** The plan made this hour, with each entry's clock hour and forecast attached. */
const upcoming = (s: Snapshot) =>
  s.schedule.map((h, i) => ({ ...h, at: s.hour + i, step: s.ahead[i] }));

function nextAction(s: Snapshot) {
  const next = upcoming(s);
  const genNow = s.genKw > 0;
  const change = next.findIndex((h, i) => i > 0 && h.genKw > 0 !== genNow);
  const at = change === -1 ? null : clock(next[change].at).slice(4);
  if (genNow)
    return {
      title: at ? `Generator on until ${at}` : "Generator on",
      why: "Topping up the battery at an efficient load, so the fridge reserve holds.",
    };
  if (at)
    return {
      title: `Generator off until ${at}`,
      why: "The battery and sun cover the load until then. One planned top-up keeps the fridge safe.",
    };
  return {
    title: "Generator stays off",
    why: "Battery, sun and grid cover the next 24 hours.",
  };
}

export function Live({ s, onPlan }: { s: Snapshot; onPlan: () => void }) {
  const loadKw = s.now.criticalKw + s.now.otherKw;
  const action = nextAction(s);
  const fridgeSafe = upcoming(s).every(
    (h) => h.socPct >= 15 || h.genKw > 0 || h.step?.gridOn,
  );

  return (
    <div className="flex flex-col gap-4">
      <PowerFlow
        socPct={s.socPct}
        pvKw={s.now.pvKw}
        gridOn={s.now.gridOn}
        genKw={s.genKw}
        loadKw={loadKw}
        charging={s.now.pvKw + s.genKw > loadKw || s.now.gridOn}
      />

      <section className="rounded-2xl border border-accent bg-panel p-5 shadow-[0_0_32px_rgb(255_201_77/0.14)]">
        <p className="font-mono text-[11px] tracking-[0.1em] text-accent">
          NEXT ACTION
        </p>
        <h2 className="font-display font-extrabold text-2xl leading-tight tracking-tight mt-1">
          {action.title}
        </h2>
        <p className="text-sm text-muted mt-1.5">{action.why}</p>
        <button
          onClick={onPlan}
          className="text-accent text-sm font-semibold mt-3"
        >
          See the plan →
        </button>
      </section>

      <div className="grid grid-cols-3 gap-2.5">
        <Readout label="BATTERY" value={`${s.socPct.toFixed(0)}%`} accent />
        <Readout label="SOLAR" value={`${s.now.pvKw.toFixed(1)} kW`} />
        {s.genKw > 0 ? (
          <Readout label="GENERATOR" value={`${s.genKw.toFixed(1)} kW`} />
        ) : (
          <Readout label="GENERATOR" value="off" off />
        )}
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-4 py-3 text-sm">
        <span className={`size-2 ${fridgeSafe ? "bg-good" : "bg-warn"}`} />
        <span className="font-mono text-[11px] text-faint">FRIDGE</span>
        <span className="font-semibold">
          {fridgeSafe
            ? "Covered for the next 24 h"
            : "At risk — check the plan"}
        </span>
      </div>
    </div>
  );
}

function Readout({
  label,
  value,
  accent,
  off,
}: {
  label: string;
  value: string;
  accent?: boolean;
  off?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-line bg-panel px-3.5 py-3">
      <p className="font-mono text-[10.5px] text-faint">{label}</p>
      <p
        className={
          off
            ? "font-serif italic text-3xl leading-tight text-faint"
            : `font-display font-extrabold text-2xl tracking-tight ${accent ? "text-accent" : ""}`
        }
      >
        {value}
      </p>
    </div>
  );
}

/** Battery charge line over coloured bands showing where the power comes from each hour. */
export function Plan({ s }: { s: Snapshot }) {
  const next = upcoming(s);
  const W = 320,
    H = 180;
  const x = (i: number) => (i / next.length) * W;
  const y = (pct: number) => H - (pct / 100) * H;
  // battery now, then at the end of each planned hour
  const points = [s.socPct, ...next.map((h) => h.socPct)];
  const line = points
    .map((pct, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(pct).toFixed(1)}`)
    .join(" ");
  const source = (h: (typeof next)[number]) =>
    h.genKw > 0
      ? "var(--color-gen)"
      : h.gridKw > 0.01
        ? "var(--color-grid)"
        : h.step && h.step.pvKw >= h.step.criticalKw + h.step.otherKw
          ? "var(--color-accent)"
          : "var(--color-batt)";
  const events = next
    .filter((h, i) => i === 0 || h.genKw > 0 !== next[i - 1].genKw > 0)
    .slice(0, 4);
  const lowest = Math.min(...points);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-line bg-panel p-4 flex flex-col gap-2.5">
        <div className="flex justify-between font-mono text-[11px] text-faint">
          <span>BATTERY CHARGE</span>
          <span className="text-text">
            {s.socPct.toFixed(0)}% → {next.at(-1)!.socPct.toFixed(0)}%
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Planned battery charge for the next 24 hours; lowest ${lowest.toFixed(0)} percent`}
        >
          {[30, 50, 100].map((p) => (
            <path key={p} d={`M0 ${y(p)} H${W}`} stroke="var(--color-line)" />
          ))}
          <path
            d={`M0 ${y(30)} H${W}`}
            stroke="var(--color-good)"
            strokeDasharray="4 4"
          />
          <path
            d={`${line} L${W} ${H} L0 ${H} Z`}
            fill="rgb(255 201 77 / 0.08)"
          />
          <path
            d={line}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
        </svg>
        <div
          className="flex h-3.5 gap-0.5 overflow-hidden rounded"
          role="img"
          aria-label="Power source by hour"
        >
          {next.map((h) => (
            <span
              key={h.at}
              className="flex-1"
              style={{ background: source(h) }}
            />
          ))}
        </div>
        <div className="flex justify-between font-mono text-[10.5px] text-faint">
          {[0, 6, 12, 18, 24].map((i) => (
            <span key={i}>{clock(s.hour + i).slice(4)}</span>
          ))}
        </div>
        <div className="flex flex-wrap gap-3.5 text-xs text-muted">
          {[
            ["Solar", "accent"],
            ["Battery", "batt"],
            ["Generator", "gen"],
            ["Grid", "grid"],
          ].map(([name, c]) => (
            <span key={name} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-sm"
                style={{ background: `var(--color-${c})` }}
              />
              {name}
            </span>
          ))}
        </div>
      </section>

      <ol className="rounded-2xl border border-line bg-panel divide-y divide-line">
        {events.map((h) => (
          <li key={h.at} className="flex gap-3.5 px-4 py-3.5 text-sm">
            <span
              className={`font-mono text-xs w-12 shrink-0 ${h.genKw > 0 ? "text-gen" : "text-accent"}`}
            >
              {clock(h.at).slice(4)}
            </span>
            <span>
              {h.genKw > 0
                ? `Generator on at ${h.genKw.toFixed(1)} kW to top up the battery.`
                : "Generator off. Battery, sun and grid carry the load."}
              <span className="text-faint">
                {" "}
                Battery {h.socPct.toFixed(0)}% after.
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

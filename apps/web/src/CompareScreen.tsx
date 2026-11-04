import { useState } from "react";
import type { Site } from "../../../packages/sim/src/types.ts";
import results from "./results.json";
import { clock, type Snapshot } from "./useSiteWeek.ts";

const localeFor = (symbol: string) => (symbol === "₱" ? "en-PH" : "en-NG");
const pct = (old: number, keep: number) =>
  old > 0 ? Math.round((100 * (old - keep)) / old) : 0;

/** Old inverter rules vs KEEPLIT: the week playing now, then the averages over several simulated weeks. */
export function CompareScreen({ site, s }: { site: Site; s: Snapshot }) {
  const [price, setPrice] = useState(site.generator?.fuelPricePerLitre ?? 1000);
  const symbol = site.generator?.currency ?? "₦";
  const money = (n: number) => `${symbol}${Math.round(n).toLocaleString(localeFor(symbol))}`;
  const savedL = s.old.fuelL - s.fuelL;
  const tested = results.find((r) => r.site === site.name);
  const max = Math.max(s.old.fuelL, s.fuelL, 0.1);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display font-extrabold text-3xl leading-none tracking-tight">
        Same week, two <span className="text-accent">brains.</span>
      </h2>

      <section className="rounded-2xl border border-accent bg-panel p-5 flex flex-col gap-3 shadow-[0_0_32px_rgb(255_201_77/0.14)]">
        <p className="font-mono text-[11px] tracking-[0.1em] text-accent">
          THIS WEEK · MON 00:00 → {clock(s.hour).toUpperCase()}
        </p>
        <Bar
          label="Old inverter rules"
          litres={s.old.fuelL}
          width={s.old.fuelL / max}
          color="bg-batt"
        />
        <Bar
          label="KEEPLIT"
          litres={s.fuelL}
          width={s.fuelL / max}
          color="bg-accent"
        />
        <p className="font-display font-extrabold text-2xl leading-tight tracking-tight">
          {savedL > 0.05 && site.generator ? (
            <>
              Saved <span className="text-accent">{savedL.toFixed(1)} L</span> ·{" "}
              {money(savedL * price)}
            </>
          ) : savedL < -0.05 ? (
            <>
              Behind by {(-savedL).toFixed(1)} L{" "}
              <span className="text-faint text-base font-sans font-normal">
                (it fills the battery early; watch it catch up)
              </span>
            </>
          ) : (
            <>Level so far</>
          )}
        </p>
        <p className="text-sm text-muted">
          Fridge without power: old rules{" "}
          <b className="text-text">{s.old.fridgeDownMin} min</b>, KEEPLIT{" "}
          <b className={s.fridgeDownMin ? "text-bad" : "text-good"}>
            {s.fridgeDownMin} min
          </b>
        </p>
      </section>

      {tested && (
        <section className="rounded-2xl border border-line bg-panel p-4 flex flex-col gap-3">
          <p className="font-mono text-[11px] tracking-[0.1em] text-faint">
            TESTED ON {tested.weeks} DIFFERENT WEEKS · AVERAGE PER WEEK
          </p>
          <Row
            label="Fuel"
            unit="L"
            old={tested.oldRules.fuelL}
            keep={tested.keeplit.fuelL}
          />
          <Row
            label="Generator running"
            unit="h"
            old={tested.oldRules.genHours}
            keep={tested.keeplit.genHours}
          />
          <Row
            label="Battery below 20%"
            unit="h"
            old={tested.oldRules.hoursBelow20}
            keep={tested.keeplit.hoursBelow20}
          />
          <Row
            label="Fridge without power"
            unit="min"
            old={tested.oldRules.fridgeDownMin}
            keep={tested.keeplit.fridgeDownMin}
          />
          <Row
            label="Spare loads switched off"
            unit="kWh"
            old={tested.oldRules.shedKwh}
            keep={tested.keeplit.shedKwh}
          />
          {site.generator && (
          <p className="border-t border-line pt-3 text-sm text-muted">
            That's about{" "}
            <b className="text-accent">
              {money(
                (tested.oldRules.fuelL - tested.keeplit.fuelL) * 52 * price,
              )}
            </b>{" "}
            a year at
            <label className="inline-flex items-center gap-1 mx-1">
              <span className="sr-only">Fuel price per litre</span>{symbol}
              <input
                type="number"
                min={0}
                step={50}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-16 h-8 px-1.5 border border-line-strong bg-ink text-text font-mono text-sm"
              />
            </label>
            per litre.
          </p>
          )}
          {tested.keeplit.fuelL > tested.oldRules.fuelL && (
            <p className="text-sm text-faint">
              No saving here: with no grid to wait for, the generator has to run most evenings anyway. KEEPLIT pays off where the grid or sun comes back.
            </p>
          )}
        </section>
      )}

      <p className="font-mono text-[10.5px] leading-relaxed text-faint">
        BOTH RUN ON THE SAME SIMULATED WEEKS, WITH OUTAGE TIMES FORECAST UP TO
        ±1 H WRONG. EVERY NUMBER HERE IS COMPUTED BY THE SIMULATOR; NONE IS
        TYPED IN.
      </p>
    </div>
  );
}

function Bar({
  label,
  litres,
  width,
  color,
}: {
  label: string;
  litres: number;
  width: number;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono">{litres.toFixed(1)} L</span>
      </div>
      <div className="h-3 bg-ink border border-line">
        <div
          className={`h-full ${color} transition-[width] duration-700`}
          style={{ width: `${Math.max(width, 0.01) * 100}%` }}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  unit,
  old,
  keep,
}: {
  label: string;
  unit: string;
  old: number;
  keep: number;
}) {
  const d = pct(old, keep);
  return (
    <div className="grid grid-cols-[1fr_auto_auto_3.5rem] items-baseline gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-mono text-faint line-through decoration-faint/50">
        {old.toFixed(unit === "min" ? 0 : 1)}
      </span>
      <span className="font-mono font-medium">
        {keep.toFixed(unit === "min" ? 0 : 1)} {unit}
      </span>
      <span
        className={`font-mono text-right ${d > 0 ? "text-good" : "text-faint"}`}
      >
        {old === keep
          ? "same"
          : old === 0
            ? `+${keep.toFixed(1)}`
            : d > 0
              ? `−${d}%`
              : `+${-d}%`}
      </span>
    </div>
  );
}

import { useRef, useState } from "react";
import { readScreen, type ScreenResult } from "../../../packages/agent/src/readScreen.ts";
import type { Site } from "../../../packages/sim/src/types.ts";

const MAX_SIDE = 1280; // downscale photos to at most 1280 px on the long side

/** Downscale a photo via canvas and return it as a JPEG data URL. Local-only, works offline. */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);
        if (img.width === 0 || img.height === 0) throw new Error("empty image");
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("could not read the photo"));
    };
    img.src = objectUrl;
  });
}

type Phase = "idle" | "reading" | "done" | "failed";

export function ScanCard({ site, onUseReading }: { site: Site; onUseReading: (socPct: number) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScreenResult | null>(null);

  // Never throws: every failure lands on the offline message, never a crashed screen.
  async function scan(file: File) {
    try {
      const dataUrl = await downscale(file);
      setPhoto(dataUrl);
      if (!navigator.onLine) {
        setPhase("failed");
        return;
      }
      setPhase("reading");
      setResult(await readScreen(dataUrl, { pvMaxW: site.pvKwp * 1250 }));
      setPhase("done");
    } catch {
      setPhase("failed");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <button
        onClick={() => inputRef.current?.click()}
        disabled={phase === "reading"}
        className="h-12 w-full bg-accent text-ink font-semibold disabled:opacity-60"
      >
        Scan the inverter screen
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Take a photo of the inverter screen"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void scan(file);
        }}
      />
      {photo && (
        <img
          src={photo}
          alt="Inverter screen photo"
          className="w-full max-h-64 rounded-2xl border border-line object-cover"
        />
      )}
      {phase === "reading" && (
        <p className="text-sm text-faint">Reading the screen…</p>
      )}
      {phase === "failed" && (
        <p className="rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
          Scanning needs internet. Everything else keeps working offline.
        </p>
      )}
      {phase === "done" && result && (
        <ResultPanel result={result} onUseReading={onUseReading} />
      )}
    </section>
  );
}

function ResultPanel({
  result,
  onUseReading,
}: {
  result: ScreenResult;
  onUseReading: (socPct: number) => void;
}) {
  const r = result.reading;
  const clean = result.problems.length === 0;
  const pct = r.batteryPct;
  const rows: Array<[string, string]> = [
    ["Battery", pct === null ? "—" : `${pct}%`],
    ["Battery V", r.batteryV === null ? "—" : `${r.batteryV} V`],
    ["Load", r.loadW === null ? "—" : `${r.loadW} W`],
    ["Solar", r.pvW === null ? "—" : `${r.pvW} W`],
    ["AC input", r.acInputOn === null ? "—" : r.acInputOn ? "on" : "off"],
    ["Brand", r.brand ?? "—"],
    ["Confidence", r.confidence],
  ];
  return (
    <section className="rounded-2xl border border-line bg-panel p-4 flex flex-col gap-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="font-mono text-[10.5px] text-faint">{label.toUpperCase()}</span>
          <span className="font-semibold">{value}</span>
        </div>
      ))}
      <div className="border-t border-line pt-2.5 flex flex-col gap-1.5">
        <p className="font-mono text-[10.5px] text-faint">PHYSICS CHECK</p>
        {clean ? (
          <p className="text-sm">
            <span className="text-good">✓</span> All checks passed
          </p>
        ) : (
          result.problems.map((problem) => (
            <p key={problem} className="text-sm">
              <span className="text-bad">✗</span> {problem}
            </p>
          ))
        )}
        <p className="font-mono text-[11px] text-faint pt-1">
          {result.attempts === 2 ? "LOOKED TWICE · " : ""}
          {(result.ms / 1000).toFixed(1)} S
        </p>
      </div>
      {pct !== null && clean ? (
        <button
          onClick={() => onUseReading(pct)}
          className="h-12 w-full bg-accent text-ink font-semibold mt-1"
        >
          Plan from this reading
        </button>
      ) : !clean ? (
        <p className="text-sm text-muted">
          I won&apos;t plan from a reading that fails the physics check.
        </p>
      ) : (
        <p className="text-sm text-muted">
          No battery % on the screen, so there&apos;s nothing to plan from.
        </p>
      )}
    </section>
  );
}

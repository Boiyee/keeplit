/** The signature diagram: sun, grid, generator and load around the battery. Active lines flow; idle ones are dotted. */
export function PowerFlow({
  socPct,
  pvKw,
  gridOn,
  genKw,
  loadKw,
  charging,
}: {
  socPct: number;
  pvKw: number;
  gridOn: boolean;
  genKw: number;
  loadKw: number;
  charging: boolean;
}) {
  const ring = 2 * Math.PI * 78;
  const on = (active: boolean) =>
    active
      ? { stroke: "var(--color-accent)", className: "flow" }
      : { stroke: "var(--color-line-strong)", strokeDasharray: "3 6" };
  const node = (active: boolean) =>
    active ? "var(--color-accent)" : "var(--color-line)";
  const label = (active: boolean) =>
    active ? "var(--color-text)" : "var(--color-faint)";

  return (
    <svg
      viewBox="0 0 520 440"
      className="w-full max-w-[360px] mx-auto"
      role="img"
      aria-label={`Battery ${socPct.toFixed(0)} percent; solar ${pvKw.toFixed(1)} kilowatts; grid ${gridOn ? "on" : "off"}; generator ${genKw > 0 ? "on" : "off"}`}
    >
      <path
        d="M116 102 L200 170"
        fill="none"
        strokeWidth="2.4"
        {...on(pvKw > 0.05)}
      />
      <path
        d="M404 102 L320 170"
        fill="none"
        strokeWidth="2.4"
        {...on(gridOn)}
      />
      <path
        d="M116 338 L200 270"
        fill="none"
        strokeWidth="2.4"
        {...on(genKw > 0)}
      />
      <path d="M320 270 L404 338" fill="none" strokeWidth="2.4" {...on(true)} />

      <circle
        cx="260"
        cy="220"
        r="78"
        fill="var(--color-panel)"
        stroke="var(--color-line)"
        strokeWidth="12"
      />
      <circle
        cx="260"
        cy="220"
        r="78"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={`${(ring * socPct) / 100} ${ring}`}
        transform="rotate(-90 260 220)"
      />
      <text
        x="260"
        y="236"
        textAnchor="middle"
        fontFamily="var(--font-display)"
        fontWeight="800"
        fontSize="52"
        fill="var(--color-accent)"
      >
        {socPct.toFixed(0)}%
      </text>
      <text
        x="260"
        y="264"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="14"
        letterSpacing="1.5"
        fill="var(--color-faint)"
      >
        {charging ? "CHARGING" : "BATTERY"}
      </text>

      <circle
        cx="90"
        cy="80"
        r="34"
        fill="var(--color-panel)"
        stroke={node(pvKw > 0.05)}
        strokeWidth="1.8"
      />
      <circle
        cx="90"
        cy="80"
        r="9"
        fill="none"
        stroke={node(pvKw > 0.05)}
        strokeWidth="2.2"
      />
      <text
        x="90"
        y="140"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="16"
        fill={label(pvKw > 0.05)}
      >
        SOLAR {pvKw.toFixed(1)} kW
      </text>

      <circle
        cx="430"
        cy="80"
        r="34"
        fill="var(--color-panel)"
        stroke={node(gridOn)}
        strokeWidth="1.8"
      />
      <path
        d="M422 96 L430 64 L438 96 M424 88 H436 M426 78 H434"
        fill="none"
        stroke={label(gridOn)}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <text
        x="430"
        y="140"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="16"
        fill={label(gridOn)}
      >
        {gridOn ? "GRID ON" : "GRID OFF"}
      </text>

      <circle
        cx="90"
        cy="360"
        r="34"
        fill="var(--color-panel)"
        stroke={genKw > 0 ? "var(--color-gen)" : "var(--color-line)"}
        strokeWidth="1.8"
      />
      <rect
        x="74"
        y="349"
        width="32"
        height="22"
        rx="4"
        fill="none"
        stroke={label(genKw > 0)}
        strokeWidth="2.2"
      />
      <text
        x="90"
        y="420"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="16"
        fill={genKw > 0 ? "var(--color-gen)" : "var(--color-faint)"}
      >
        {genKw > 0 ? `GEN ${genKw.toFixed(1)} kW` : "GEN OFF"}
      </text>

      <circle
        cx="430"
        cy="360"
        r="34"
        fill="var(--color-panel)"
        stroke="var(--color-accent)"
        strokeWidth="1.8"
      />
      <path
        d="M416 362 L430 350 L444 362 M420 359 V373 H440 V359"
        fill="none"
        stroke="var(--color-text)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <text
        x="430"
        y="420"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="16"
        fill="var(--color-text)"
      >
        LOAD {loadKw.toFixed(1)} kW
      </text>
    </svg>
  );
}

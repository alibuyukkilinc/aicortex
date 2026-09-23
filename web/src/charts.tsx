import type { ReactNode } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Small hand-built SVG charts. Specs follow the dataviz guide: bars <= 24px, 4px rounded data end,
// square at the baseline, 2px surface gap between stacked segments, hairline grid, hover + focus tooltips.
// Colors come from CSS tokens validated for both themes (--viz-*).

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Axis labels stay narrow: 12.400 becomes 12,4 B (or 12.4K), so the numbers never run into the chart.
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const tickLabel = (v: number) => (v >= 10000 ? compact.format(v) : v.toLocaleString());

// "Nice" axis maximum and ticks: 0 / 5 / 10 rather than 0 / 3.7 / 7.4.
function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Math.round(v));
  return ticks;
}

// Rect with only the top corners rounded (the data end); the baseline side stays square.
function topRounded(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}
function rightRounded(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 8px))" }} role="tooltip">
      {tip.content}
    </div>
  );
}

export interface Series {
  key: string;
  label: string;
  color: string; // CSS color, normally var(--viz-*)
  // Context only: listed in the tooltip and the accessible label, never drawn and never part of the scale.
  // For a count that would dwarf the series the chart is about (audit entries next to logged work).
  context?: boolean;
}

export function StackedColumns({
  data,
  series,
  xLabel,
  height = 200,
  ariaLabel,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  xLabel: (row: Record<string, number | string>) => string;
  height?: number;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 8, right: 8, bottom: 22, left: 38 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const drawn = series.filter((s) => !s.context);
  const totals = data.map((d) => drawn.reduce((s, x) => s + Number(d[x.key] ?? 0), 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1] || 1;
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.min(24, Math.max(2, band - 4));
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(innerW / 46))));

  const show = (i: number, cx: number) => {
    setActive(i);
    const row = data[i];
    setTip({
      x: cx,
      y: y(totals[i]) + 4,
      content: (
        <>
          <div className="faint" style={{ marginBottom: 4 }}>
            {xLabel(row)}
          </div>
          {series.map((s) => (
            <div className={`tip-row${s.context ? " faint" : ""}`} key={s.key}>
              <span className="key" style={{ background: s.color }} />
              <b>{Number(row[s.key] ?? 0)}</b>
              <span className="muted">{s.label}</span>
            </div>
          ))}
        </>
      ),
    });
  };
  const hide = () => {
    setActive(null);
    setTip(null);
  };

  return (
    <div ref={ref} className="chart" style={{ position: "relative" }} onMouseLeave={hide}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
              <text x={pad.left - 6} y={y(t) + 4} textAnchor="end">
                {tickLabel(t)}
              </text>
            </g>
          ))}
          {data.map((row, i) => {
            const cx = pad.left + band * i + band / 2;
            let acc = 0;
            const visible = drawn.filter((s) => Number(row[s.key] ?? 0) > 0);
            return (
              <g
                key={i}
                tabIndex={0}
                aria-label={`${xLabel(row)}: ${series.map((s) => `${s.label} ${Number(row[s.key] ?? 0)}`).join(", ")}`}
                onMouseMove={() => show(i, cx)}
                onFocus={() => show(i, cx)}
                onBlur={hide}
                style={{ outline: "none" }}
              >
                {/* The whole band is the hit target, not just the painted bar. */}
                <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} fill="transparent" />
                {visible.map((s, j) => {
                  const v = Number(row[s.key]);
                  const h = (v / top) * innerH;
                  const gap = j > 0 ? 2 : 0; // surface gap between stacked segments
                  const y0 = pad.top + innerH - acc - h;
                  acc += h;
                  const isTop = j === visible.length - 1;
                  const segH = Math.max(0, h - gap);
                  return isTop ? (
                    <path key={s.key} d={topRounded(cx - barW / 2, y0, barW, segH)} fill={s.color} opacity={active === null || active === i ? 1 : 0.55} />
                  ) : (
                    <rect key={s.key} x={cx - barW / 2} y={y0} width={barW} height={segH} fill={s.color} opacity={active === null || active === i ? 1 : 0.55} />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 6} textAnchor="middle">
                    {xLabel(row)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

export function HBars({
  data,
  color,
  detail,
  ariaLabel,
}: {
  data: { label: string; value: number }[];
  color: string;
  detail?: (i: number) => ReactNode;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const rowH = 32;
  const padBottom = 20; // room for the x-axis tick labels
  const values = data.map((d) => d.value.toLocaleString());
  // Columns size to the actual content (a few px per character) instead of a fixed guess,
  // so long routes and five/six-digit token counts never run off the card edge.
  const labelW = Math.min(170, Math.max(56, Math.max(0, ...data.map((d) => d.label.length)) * 6.4 + 18));
  const valueW = Math.min(80, Math.max(32, Math.max(0, ...values.map((v) => v.length)) * 7.2 + 14));
  const rawMax = Math.max(...data.map((d) => d.value), 1);
  const ticks = niceTicks(rawMax);
  const top = ticks[ticks.length - 1] || 1;
  const barMax = Math.max(0, width - labelW - valueW);
  const rowsH = data.length * rowH;
  const height = rowsH + padBottom;
  const tickX = (v: number) => labelW + (v / top) * barMax;
  useEffect(() => setTip(null), [data]);

  const hide = () => {
    setHover(null);
    setTip(null);
  };

  return (
    <div ref={ref} className="chart" style={{ position: "relative" }} onMouseLeave={hide}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel}>
          <defs>
            <clipPath id={`hbar-lbl-${uid}`}>
              <rect x={0} y={0} width={Math.max(0, labelW - 8)} height={rowsH} />
            </clipPath>
          </defs>
          {data.map((_, i) => i > 0 && <line key={`row-${i}`} x1={0} x2={width} y1={i * rowH} y2={i * rowH} stroke="var(--viz-grid)" strokeWidth={1} />)}
          {ticks.map((tval) => (
            <g key={tval}>
              <line x1={tickX(tval)} x2={tickX(tval)} y1={0} y2={rowsH} stroke={tval === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
              <text x={tickX(tval)} y={height - 6} textAnchor="middle">
                {tickLabel(tval)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const w = (d.value / top) * barMax;
            const yMid = i * rowH + rowH / 2;
            const show = () => {
              setHover(i);
              detail && setTip({ x: labelW + Math.max(w, 20) / 2, y: yMid - 10, content: detail(i) });
            };
            return (
              <g key={d.label} tabIndex={0} aria-label={`${d.label}: ${d.value}`} onMouseMove={show} onFocus={show} onBlur={hide} style={{ outline: "none" }}>
                {hover === i && <rect x={0} y={i * rowH} width={width} height={rowH} fill="var(--fill)" />}
                <rect x={0} y={i * rowH} width={width} height={rowH} fill="transparent" />
                <text x={labelW - 8} y={yMid + 4} textAnchor="end" clipPath={`url(#hbar-lbl-${uid})`}>
                  {d.label}
                  <title>{d.label}</title>
                </text>
                {w > 0 && <path d={rightRounded(labelW, yMid - 9, w, 18)} fill={color} />}
                {/* Value at the bar tip, in text ink - never in the series color. */}
                <text x={labelW + w + 6} y={yMid + 4} style={{ fill: "var(--muted)" }}>
                  {values[i]}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

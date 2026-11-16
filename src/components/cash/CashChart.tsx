"use client";

import { Area, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dollars } from "@/lib/cash/format";
import type { Business, Projection } from "@/lib/cash/types";

interface Props {
  business: Business;
  base: Projection;
  alt?: { projection: Projection; label: string } | null;
  selectedWeek: number | null;
  onSelectWeek: (week: number) => void;
}

interface Row { x: string; week: number; base: number; alt?: number; date: string }

const compact = (cents: number) => {
  const d = cents / 100;
  const sign = d < 0 ? "−" : "";
  const abs = Math.abs(d);
  return `${sign}$${abs >= 1000 ? `${(abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1)}k` : abs.toFixed(0)}`;
};

export function CashChart({ business, base, alt, selectedWeek, onSelectWeek }: Props) {
  const rows: Row[] = [
    { x: "Now", week: 0, base: business.openingCents, alt: alt ? business.openingCents : undefined, date: "Today" },
    ...base.weeks.map((week, index) => ({ x: `W${week.week}`, week: week.week, base: week.endCents, alt: alt?.projection.weeks[index]?.endCents, date: week.label })),
  ];
  const values = rows.flatMap((row) => [row.base, row.alt ?? row.base]);
  const low = Math.min(0, ...values);
  const high = Math.max(business.floorCents, ...values);
  // Round, readable ticks that always include $0.
  const span = Math.max(1, high - low);
  const step = [100_000, 200_000, 250_000, 500_000, 1_000_000, 2_000_000, 2_500_000, 5_000_000, 10_000_000].find((s) => span / s <= 5) ?? 25_000_000;
  const domain: [number, number] = [Math.floor(low / step) * step, Math.ceil(high / step) * step];
  if (domain[0] === low && low < 0) domain[0] -= step;
  if (domain[1] - high < step * 0.25) domain[1] += step;
  const ticks: number[] = [];
  for (let t = domain[0]; t <= domain[1]; t += step) ticks.push(t);

  const summary = base.weeks.map((week) => `Week ${week.week}: ${dollars(week.endCents)}`).join(", ");

  return <figure className="m-0">
    <div className="h-[260px] w-full sm:h-[320px]" role="img" aria-label={`Cash balance by week. ${summary}.${alt ? ` ${alt.label} shown in blue.` : ""}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 16, right: 12, bottom: 0, left: 0 }}
          onClick={(state) => { const week = (state as { activePayload?: Array<{ payload: Row }> } | null)?.activePayload?.[0]?.payload.week; if (week) onSelectWeek(week); }}
        >
          <defs>
            <linearGradient id="baseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f2f1ee" stopOpacity={0.10} />
              <stop offset="100%" stopColor="#f2f1ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <ReferenceArea y1={domain[0]} y2={0} fill="var(--bad)" fillOpacity={0.09} ifOverflow="extendDomain" />
          <ReferenceArea y1={0} y2={business.floorCents} fill="var(--warn)" fillOpacity={0.06} ifOverflow="extendDomain" />
          <ReferenceLine y={0} stroke="rgb(255 110 97 / 45%)" strokeWidth={1} />
          <ReferenceLine y={business.floorCents} stroke="rgb(242 180 76 / 45%)" strokeDasharray="3 5" label={{ value: `Cushion ${compact(business.floorCents)}`, position: "insideTopLeft", fill: "rgb(242 180 76 / 85%)", fontSize: 11 }} />
          {selectedWeek ? <ReferenceLine x={`W${selectedWeek}`} stroke="rgb(255 255 255 / 22%)" /> : null}
          <XAxis dataKey="x" axisLine={false} tickLine={false} tick={{ fill: "rgb(242 241 238 / 46%)", fontSize: 12 }} tickMargin={10} interval={0} />
          <YAxis domain={domain} tickFormatter={compact} axisLine={false} tickLine={false} tick={{ fill: "rgb(242 241 238 / 40%)", fontSize: 11 }} width={48} ticks={ticks} interval={0} />
          <Tooltip cursor={{ stroke: "rgb(255 255 255 / 18%)" }} content={<ChartTip floor={business.floorCents} altLabel={alt?.label} />} />
          <Area type="linear" dataKey="base" stroke="none" fill="url(#baseFill)" isAnimationActive={false} />
          <Line
            type="linear" dataKey="base" name="As scheduled" stroke={alt ? "rgb(242 241 238 / 45%)" : "#f2f1ee"} strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) => {
              const { cx, cy, payload } = props;
              if (cx === undefined || cy === undefined || !payload) return <g key={props.index} />;
              const bad = payload.base < 0;
              const tight = !bad && payload.base < business.floorCents;
              return <circle key={props.index} cx={cx} cy={cy} r={bad ? 5 : 3.5} fill={bad ? "var(--bad)" : tight ? "var(--warn)" : alt ? "#6b6b6d" : "#f2f1ee"} stroke="var(--canvas)" strokeWidth={2} />;
            }}
            activeDot={{ r: 6, stroke: "var(--canvas)", strokeWidth: 2, fill: "#f2f1ee" }}
            isAnimationActive={false}
          />
          {alt && <Line type="linear" dataKey="alt" name={alt.label} stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--accent)", stroke: "var(--canvas)", strokeWidth: 2 }} activeDot={{ r: 6, stroke: "var(--canvas)", strokeWidth: 2, fill: "var(--accent)" }} animationDuration={600} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] muted">
      <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block h-[2px] w-5 rounded" style={{ background: alt ? "rgb(242 241 238 / 45%)" : "#f2f1ee" }} />As scheduled</span>
      {alt && <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block h-[3px] w-5 rounded" style={{ background: "var(--accent)" }} />{alt.label}</span>}
      <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgb(255 110 97 / 25%)" }} />Overdrawn</span>
      <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgb(242 180 76 / 20%)" }} />Under cushion</span>
    </figcaption>
  </figure>;
}

function ChartTip({ active, payload, floor, altLabel }: { active?: boolean; payload?: Array<{ payload: Row }>; floor: number; altLabel?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const tone = (cents: number) => cents < 0 ? "var(--bad)" : cents < floor ? "var(--warn)" : "var(--ink)";
  return <div className="glass glass-thin px-3.5 py-2.5 text-[13px]" style={{ borderRadius: 14 }}>
    <p className="faint text-[12px]">{row.week === 0 ? "Today" : `Week ${row.week} · ends ${row.date}`}</p>
    <p className="figure mt-0.5" style={{ color: tone(row.base) }}>{dollars(row.base)} <span className="faint text-[12px] font-normal">as scheduled</span></p>
    {row.alt !== undefined && altLabel && <p className="figure" style={{ color: "var(--accent)" }}>{dollars(row.alt)} <span className="faint text-[12px] font-normal">{altLabel.toLowerCase()}</span></p>}
  </div>;
}

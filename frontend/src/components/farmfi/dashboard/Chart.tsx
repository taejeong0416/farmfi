"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Panel } from "../ui/Panel";

// Palette continues the original placeholder's gradient/conic stops so the
// real charts land visually where the fake ones used to.
const PALETTE = ["#08703f", "#4fc17a", "#f1a93d", "#d9e2dc", "#0b7d46"];
const LINE_COLOR = "#0b7d46";
const GRID_COLOR = "#e1e7e1";
const MUTED_TEXT = "#67736a";

export interface ChartPoint {
  name: string;
  value: number;
  status?: string;
}

const FALLBACK_BARS: ChartPoint[] = [44, 58, 47, 70, 64, 52, 76, 88, 66, 91].map((v, i) => ({
  name: `${i + 1}`,
  value: v,
}));

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

function TooltipContent({ active, payload, label, valueFormatter }: any) {
  if (!active || !payload || !payload.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(13, 50, 31, 0.12)",
        borderRadius: 8,
        padding: "8px 12px",
        boxShadow: "0 10px 28px rgba(20, 50, 27, 0.12)",
        fontSize: 12,
      }}
    >
      <div style={{ color: MUTED_TEXT }}>{label}</div>
      <div style={{ fontWeight: 900, color: "#111612" }}>
        {valueFormatter ? valueFormatter(value) : value.toLocaleString("ko-KR")}
      </div>
    </div>
  );
}

export function Chart({
  title,
  data,
  type = "area",
  valueFormatter,
  height = 190,
}: {
  title: string;
  data?: ChartPoint[];
  type?: "line" | "bar" | "area";
  valueFormatter?: (value: number) => string;
  height?: number;
}) {
  const points = data && data.length > 0 ? data : FALLBACK_BARS;
  const formatter = valueFormatter ?? formatCompact;

  return (
    <Panel title={title}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {type === "bar" ? (
            <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: MUTED_TEXT }}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
              <YAxis hide tickFormatter={formatter} />
              <Tooltip content={<TooltipContent valueFormatter={formatter} />} cursor={{ fill: "rgba(7,82,47,0.06)" }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {points.map((p, i) => (
                  <Cell
                    key={`${p.name}-${i}`}
                    fill={p.status === "completed" ? PALETTE[0] : p.status === "pending" ? "#d9e2dc" : PALETTE[1]}
                  />
                ))}
              </Bar>
            </BarChart>
          ) : type === "line" ? (
            <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: MUTED_TEXT }}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip content={<TooltipContent valueFormatter={formatter} />} />
              <Line type="monotone" dataKey="value" stroke={LINE_COLOR} strokeWidth={2.5} dot={false} />
            </LineChart>
          ) : (
            <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="farmfiAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: MUTED_TEXT }}
                axisLine={{ stroke: GRID_COLOR }}
                tickLine={false}
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip content={<TooltipContent valueFormatter={formatter} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={LINE_COLOR}
                strokeWidth={2.5}
                fill="url(#farmfiAreaFill)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </Panel>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
  color?: string;
}

const FALLBACK_DONUT: DonutSlice[] = [
  { name: "생산", value: 45 },
  { name: "판매", value: 27 },
  { name: "재고", value: 14 },
  { name: "기타", value: 14 },
];

export function Donut({
  title,
  data,
  centerLabel,
  valueFormatter,
}: {
  title: string;
  data?: DonutSlice[];
  centerLabel?: string;
  valueFormatter?: (value: number) => string;
}) {
  const provided = data && data.length > 0 ? data : [];
  const providedTotal = provided.reduce((sum, d) => sum + d.value, 0);
  const slices = providedTotal > 0 ? provided : FALLBACK_DONUT;
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  const formatter = valueFormatter ?? formatCompact;
  const label = centerLabel ?? formatter(total);

  return (
    <Panel title={title}>
      <div style={{ position: "relative", width: 170, height: 170, margin: "20px auto" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="none"
            >
              {slices.map((slice, i) => (
                <Cell key={slice.name} fill={slice.color ?? PALETTE[i % PALETTE.length]} />
              ))}
            </Pie>
            <Tooltip content={<TooltipContent valueFormatter={formatter} />} />
          </PieChart>
        </ResponsiveContainer>
        <div
          style={{
            position: "absolute",
            inset: 34,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            background: "#fff",
            color: "#111612",
            fontWeight: 900,
            fontSize: 15,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {label}
        </div>
      </div>
    </Panel>
  );
}

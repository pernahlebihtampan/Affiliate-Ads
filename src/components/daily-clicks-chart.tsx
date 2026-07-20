"use client";

import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatNumber } from "@/lib/utils";

interface DailyClicksDataPoint {
  date: string;
  klik: number;
  pesanan: number;
}

interface DailyClicksChartProps {
  data: DailyClicksDataPoint[];
}

const KLIK_COLOR = "#3B82F6";
const PESANAN_COLOR = "#22C55E";

interface TooltipEntry {
  payload?: DailyClicksDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const dp = payload[0]?.payload;
  if (!dp) return null;

  const entries = [
    { name: "Klik", value: dp.klik, color: KLIK_COLOR },
    { name: "Pesanan", value: dp.pesanan, color: PESANAN_COLOR },
  ];

  return (
    <div className="bg-white rounded-lg border shadow-lg p-3 text-sm">
      <p className="font-medium mb-2 text-gray-700">
        {new Date(dp.date + "T00:00:00").toLocaleDateString("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
      {entries.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-semibold ml-auto">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

const LEGEND_ITEMS = [
  { value: "Klik", color: KLIK_COLOR },
  { value: "Pesanan", color: PESANAN_COLOR },
];

function CustomLegend() {
  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-3">
      {LEGEND_ITEMS.map((entry) => (
        <span
          key={entry.value}
          className="flex items-center gap-1.5 text-sm text-gray-600"
        >
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ backgroundColor: entry.color }}
          />
          {entry.value}
        </span>
      ))}
    </div>
  );
}

export function DailyClicksChart({ data }: DailyClicksChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center text-muted-foreground">
        Belum ada data harian. Pilih rentang tanggal terlebih dahulu.
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    dateLabel: new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    }),
  }));

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">
        Klik &amp; Pesanan Harian
      </h3>
      <ResponsiveContainer width="100%" height={350}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          {/* Sumbu kiri untuk Klik (skala umumnya jauh lebih besar) */}
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            label={{
              value: "Klik",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 12, fill: KLIK_COLOR, textAnchor: "middle" },
            }}
          />
          {/* Sumbu kanan untuk Pesanan */}
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            label={{
              value: "Pesanan",
              angle: 90,
              position: "insideRight",
              style: { fontSize: 12, fill: PESANAN_COLOR, textAnchor: "middle" },
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" height={36} content={<CustomLegend />} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="klik"
            name="Klik"
            stroke={KLIK_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: KLIK_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: KLIK_COLOR, strokeWidth: 2, stroke: "#fff" }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="pesanan"
            name="Pesanan"
            stroke={PESANAN_COLOR}
            strokeWidth={2}
            dot={{ r: 3, fill: PESANAN_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: PESANAN_COLOR, strokeWidth: 2, stroke: "#fff" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

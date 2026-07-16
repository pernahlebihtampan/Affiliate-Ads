"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface DailyDataPoint {
  date: string;
  komisi: number;
  spend: number;
  profit: number;
}

interface DailyChartProps {
  data: DailyDataPoint[];
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="bg-white rounded-lg border shadow-lg p-3 text-sm">
      <p className="font-medium mb-2 text-gray-700">
        {new Date(label + "T00:00:00").toLocaleDateString("id-ID", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-semibold ml-auto">
            {formatCurrency(entry.value ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DailyChart({ data }: DailyChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border p-8 text-center text-muted-foreground">
        Belum ada data harian. Pilih rentang tanggal terlebih dahulu.
      </div>
    );
  }

  // Format tanggal untuk ditampilkan di sumbu X
  const chartData = data.map((d) => ({
    ...d,
    dateLabel: new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    }),
  }));

  // Tentukan batas bawah untuk sumbu Y agar grafik tidak terpotong
  const allValues = data.flatMap((d) => [d.komisi, d.spend, d.profit]);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);
  const yMin = minVal < 0 ? minVal * 1.1 : 0;
  const yMax = maxVal * 1.15;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">
        Pendapatan Harian
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
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
            tickFormatter={(value) =>
              value >= 1000000
                ? `${(value / 1000000).toFixed(1)}jt`
                : value >= 1000
                ? `${(value / 1000).toFixed(0)}rb`
                : `${value}`
            }
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => (
              <span className="text-sm text-gray-600">{value}</span>
            )}
          />
          {/* Grafik komisi (garis biru) */}
          <Line
            type="monotone"
            dataKey="komisi"
            name="Komisi"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#3B82F6", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }}
          />
          {/* Grafik spend (garis kuning) */}
          <Line
            type="monotone"
            dataKey="spend"
            name="Pengeluaran (Spend)"
            stroke="#EAB308"
            strokeWidth={2}
            dot={{ r: 3, fill: "#EAB308", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#EAB308", strokeWidth: 2, stroke: "#fff" }}
          />
          {/* Grafik profit (batang) */}
          <Bar
            dataKey="profit"
            name="Keuntungan (Komisi - Spend)"
            fill="#22C55E"
            opacity={0.7}
            radius={[3, 3, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import {
  ComposedChart,
  Line,
  Bar,
  Cell,
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
  profitSelesai: number;
  komisiDibatalkan: number;
}

interface DailyChartProps {
  data: DailyDataPoint[];
}

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  // Data point asli — sumber tanggal mentah "yyyy-MM-dd" (label sumbu X hanya
  // "9 Jul" dan tidak bisa diparse jadi Date)
  payload?: { date?: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const rawDate = payload[0]?.payload?.date;

  return (
    <div className="bg-white rounded-lg border shadow-lg p-3 text-sm">
      <p className="font-medium mb-2 text-gray-700">
        {rawDate
          ? new Date(rawDate + "T00:00:00").toLocaleDateString("id-ID", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })
          : ""}
      </p>
      {payload.map((entry) => {
        // Seri hijau (profit Selesai) dirender merah saat nilainya negatif —
        // samakan warna swatch tooltip dengan warna batangnya
        const swatchColor =
          entry.color === "#22C55E" && (entry.value ?? 0) < 0
            ? "#EF4444"
            : entry.color;
        return (
        <div key={entry.name} className="flex items-center gap-2 py-0.5">
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{
              backgroundColor: swatchColor,
              // Swatch putih tak terlihat di latar putih — beri pinggiran
              // sewarna stroke batangnya (merah bila negatif)
              border:
                swatchColor?.toUpperCase() === "#FFFFFF"
                  ? `1.5px solid ${(entry.value ?? 0) < 0 ? "#EF4444" : "#22C55E"}`
                  : undefined,
            }}
          />
          <span className="text-gray-600">{entry.name}:</span>
          <span className="font-semibold ml-auto">
            {formatCurrency(entry.value ?? 0)}
          </span>
        </div>
        );
      })}
    </div>
  );
}

interface LegendEntry {
  value?: string;
  color?: string;
}

function CustomLegend({ payload }: { payload?: LegendEntry[] }) {
  if (!payload || payload.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pb-3">
      {payload.map((entry) => (
        <span
          key={entry.value}
          className="flex items-center gap-1.5 text-sm text-gray-600"
        >
          <span
            className="w-3 h-3 rounded-full inline-block"
            style={{
              backgroundColor: entry.color,
              border:
                entry.color?.toUpperCase() === "#FFFFFF"
                  ? "1.5px solid #22C55E"
                  : undefined,
            }}
          />
          {entry.value}
        </span>
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
  const allValues = data.flatMap((d) => [
    d.komisi,
    d.spend,
    d.profit,
    d.profitSelesai,
    d.komisiDibatalkan,
  ]);
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
          {/* Axis tersembunyi agar bar overlay menimpa (bukan berdampingan) —
              satu axis per seri bar, urutan render menentukan tumpukan */}
          <XAxis dataKey="dateLabel" xAxisId="overlay" hide />
          <XAxis dataKey="dateLabel" xAxisId="overlay2" hide />
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
          <Legend verticalAlign="top" height={36} content={<CustomLegend />} />
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
          {/* Grafik profit total (batang putih, pinggiran hijau;
              pinggiran merah bila nilainya negatif) */}
          <Bar
            dataKey="profit"
            name="Keuntungan (Komisi - Spend)"
            fill="#FFFFFF"
            stroke="#22C55E"
            strokeWidth={1.5}
            radius={[3, 3, 0, 0]}
          >
            {chartData.map((d) => (
              <Cell
                key={d.date}
                fill="#FFFFFF"
                stroke={d.profit < 0 ? "#EF4444" : "#22C55E"}
              />
            ))}
          </Bar>
          {/* Grafik profit order Selesai (batang hijau, menimpa batang profit;
              merah bila nilainya negatif) */}
          <Bar
            dataKey="profitSelesai"
            name="Keuntungan Selesai (Komisi Selesai - Spend)"
            xAxisId="overlay"
            fill="#22C55E"
            stroke="#22C55E"
            strokeWidth={1.5}
            radius={[3, 3, 0, 0]}
          >
            {chartData.map((d) => (
              <Cell
                key={d.date}
                fill={d.profitSelesai < 0 ? "#EF4444" : "#22C55E"}
                stroke={d.profitSelesai < 0 ? "#EF4444" : "#22C55E"}
              />
            ))}
          </Bar>
          {/* Estimasi komisi pesanan Dibatalkan (batang abu-abu, lapisan
              teratas): hargaRp × (pctShopee + pctXtra) / 100 */}
          <Bar
            dataKey="komisiDibatalkan"
            name="Komisi Dibatalkan (estimasi)"
            xAxisId="overlay2"
            fill="#9CA3AF"
            stroke="#9CA3AF"
            strokeWidth={1.5}
            radius={[3, 3, 0, 0]}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

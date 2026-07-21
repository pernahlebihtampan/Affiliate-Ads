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

// Seri batang yang saling menimpa di posisi X yang sama. Urutan render
// ditentukan per-tanggal (terpanjang paling belakang) — lihat chartData.
const BAR_KEYS = ["profit", "profitSelesai", "komisiDibatalkan"] as const;
type BarKey = (typeof BAR_KEYS)[number];

function barColors(key: BarKey, value: number): { fill: string; stroke: string } {
  switch (key) {
    case "profit":
      // Batang putih, pinggiran hijau; pinggiran merah bila negatif
      return { fill: "#FFFFFF", stroke: value < 0 ? "#EF4444" : "#22C55E" };
    case "profitSelesai": {
      const c = value < 0 ? "#EF4444" : "#22C55E";
      return { fill: c, stroke: c };
    }
    case "komisiDibatalkan":
      return { fill: "#9CA3AF", stroke: "#9CA3AF" };
  }
}

interface TooltipEntry {
  // Data point asli — sumber tanggal mentah "yyyy-MM-dd" (label sumbu X hanya
  // "9 Jul" dan tidak bisa diparse jadi Date) sekaligus nilai semua seri
  payload?: DailyDataPoint;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const dp = payload[0]?.payload;
  if (!dp) return null;

  // Dibangun dari data point mentah (bukan entri seri Recharts) karena seri
  // batang kini berupa lapisan generik layer1..3 yang namanya tidak informatif
  const entries = [
    { name: "Komisi", value: dp.komisi, color: "#3B82F6" },
    { name: "Pengeluaran (Spend +PPN)", value: dp.spend, color: "#EAB308" },
    { name: "Keuntungan (Komisi - Spend)", value: dp.profit, color: "#FFFFFF" },
    {
      name: "Keuntungan Selesai (Komisi Selesai - Spend)",
      value: dp.profitSelesai,
      color: "#22C55E",
    },
    { name: "Komisi Dibatalkan (estimasi)", value: dp.komisiDibatalkan, color: "#9CA3AF" },
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
      {entries.map((entry) => {
        // Seri hijau (profit Selesai) dirender merah saat nilainya negatif —
        // samakan warna swatch tooltip dengan warna batangnya
        const swatchColor =
          entry.color === "#22C55E" && entry.value < 0 ? "#EF4444" : entry.color;
        return (
          <div key={entry.name} className="flex items-center gap-2 py-0.5">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{
                backgroundColor: swatchColor,
                // Swatch putih tak terlihat di latar putih — beri pinggiran
                // sewarna stroke batangnya (merah bila negatif)
                border:
                  swatchColor === "#FFFFFF"
                    ? `1.5px solid ${entry.value < 0 ? "#EF4444" : "#22C55E"}`
                    : undefined,
              }}
            />
            <span className="text-gray-600">{entry.name}:</span>
            <span className="font-semibold ml-auto">
              {formatCurrency(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const LEGEND_ITEMS = [
  { value: "Komisi", color: "#3B82F6" },
  { value: "Pengeluaran (Spend +PPN)", color: "#EAB308" },
  { value: "Keuntungan (Komisi - Spend)", color: "#FFFFFF" },
  { value: "Keuntungan Selesai (Komisi Selesai - Spend)", color: "#22C55E" },
  { value: "Komisi Dibatalkan (estimasi)", color: "#9CA3AF" },
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
            style={{
              backgroundColor: entry.color,
              border:
                entry.color === "#FFFFFF" ? "1.5px solid #22C55E" : undefined,
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

  // Format tanggal untuk sumbu X + urutkan lapisan batang per-tanggal:
  // batang terpanjang dari nol (nilai absolut terbesar) digambar paling
  // belakang (layer1), terpendek paling depan (layer3), supaya semua batang
  // di tanggal yang sama tetap terlihat
  const chartData = data.map((d) => {
    const order = [...BAR_KEYS].sort(
      (a, b) => Math.abs(d[b]) - Math.abs(d[a])
    );
    return {
      ...d,
      dateLabel: new Date(d.date + "T00:00:00").toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      }),
      layer1: d[order[0]],
      layer2: d[order[1]],
      layer3: d[order[2]],
      layerKeys: order,
    };
  });

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
              satu axis per lapisan bar, urutan render menentukan tumpukan */}
          <XAxis dataKey="dateLabel" xAxisId="overlay" hide />
          <XAxis dataKey="dateLabel" xAxisId="overlay2" hide />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            domain={[yMin, yMax]}
            tickFormatter={(value) =>
              Math.abs(value) >= 1000000
                ? `${(value / 1000000).toFixed(1)}jt`
                : Math.abs(value) >= 1000
                ? `${(value / 1000).toFixed(0)}rb`
                : `${Math.round(value)}`
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
            name="Pengeluaran (Spend +PPN)"
            stroke="#EAB308"
            strokeWidth={2}
            dot={{ r: 3, fill: "#EAB308", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#EAB308", strokeWidth: 2, stroke: "#fff" }}
          />
          {/* Tiga lapisan batang generik — tiap tanggal, seri asli
              (profit / profitSelesai / komisiDibatalkan) dipetakan ke lapisan
              sesuai panjang batangnya; warna per-sel mengikuti seri aslinya */}
          {([
            { dataKey: "layer1", xAxisId: undefined, layerIdx: 0 },
            { dataKey: "layer2", xAxisId: "overlay", layerIdx: 1 },
            { dataKey: "layer3", xAxisId: "overlay2", layerIdx: 2 },
          ] as const).map(({ dataKey, xAxisId, layerIdx }) => (
            <Bar
              key={dataKey}
              dataKey={dataKey}
              xAxisId={xAxisId}
              strokeWidth={1.5}
              radius={[3, 3, 0, 0]}
              legendType="none"
            >
              {chartData.map((d) => {
                const seriesKey = d.layerKeys[layerIdx];
                const { fill, stroke } = barColors(seriesKey, d[seriesKey]);
                return <Cell key={d.date} fill={fill} stroke={stroke} />;
              })}
            </Bar>
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

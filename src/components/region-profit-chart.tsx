"use client";

import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

export interface RegionChartRow {
  region: string;
  label: string;
  spend: number;
  totalKomisi: number;
  profit: number;
  roas: number;
  orders: number;
}

const PROFIT_COLOR = "#16A34A";
const LOSS_COLOR = "#DC2626";

interface TooltipEntry {
  payload?: RegionChartRow;
}

function RegionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const r = payload[0]?.payload;
  if (!r) return null;

  const rows = [
    { name: "Spend", value: formatCurrency(r.spend) },
    { name: "Komisi (estimasi)", value: "±" + formatCurrency(r.totalKomisi) },
    { name: "Keuntungan", value: "±" + formatCurrency(r.profit) },
    { name: "Pesanan", value: "±" + formatNumber(r.orders) },
    { name: "ROAS", value: r.spend > 0 ? r.roas.toFixed(2) + "x" : "—" },
  ];
  return (
    <div className="bg-white rounded-lg border shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5 text-gray-700">{r.label}</p>
      {rows.map((row) => (
        <div key={row.name} className="flex items-center gap-4 py-0.5">
          <span className="text-gray-600">{row.name}:</span>
          <span
            className={`font-semibold ml-auto ${
              row.name === "Keuntungan"
                ? r.profit < 0
                  ? "text-red-600"
                  : "text-green-600"
                : ""
            }`}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// Bar horizontal keuntungan (± estimasi) per wilayah, diurutkan dari paling
// untung. Arah bar dari garis nol + urutan baris memberi sinyal yang sama
// dengan warnanya (hijau untung / merah rugi) — tidak bergantung warna saja.
export function RegionProfitChart({ rows }: { rows: RegionChartRow[] }) {
  if (rows.length === 0) return null;

  const data = [...rows].sort((a, b) => b.profit - a.profit);
  const height = Math.max(data.length * 26 + 40, 160);

  const fmtAxis = (v: number) => {
    const abs = Math.abs(v);
    const s =
      abs >= 1_000_000
        ? `${(abs / 1_000_000).toFixed(1)}jt`
        : abs >= 1000
        ? `${(abs / 1000).toFixed(0)}rb`
        : `${abs}`;
    return v < 0 ? `-${s}` : s;
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        Keuntungan per Wilayah{" "}
        <span className="font-normal">
          (± estimasi; <span className="text-green-600 font-medium">untung</span> ke
          kanan, <span className="text-red-600 font-medium">rugi</span> ke kiri)
        </span>
      </h3>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtAxis}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval={0}
          />
          <ReferenceLine x={0} stroke="#9ca3af" />
          <Tooltip
            content={<RegionTooltip />}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="profit" barSize={14} radius={2} isAnimationActive={false}>
            {data.map((r) => (
              <Cell
                key={r.region}
                fill={r.profit < 0 ? LOSS_COLOR : PROFIT_COLOR}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatNumber } from "@/lib/utils";

export interface PenempatanBucket {
  label: string; // nama penempatan
  spend: number; // termasuk PPN 11%
  klik: number;
  cpc: number;
}

const SPEND_COLOR = "#2563EB";
const KLIK_COLOR = "#0D9488";

interface TooltipEntry {
  payload?: PenempatanBucket;
}

function PenempatanTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const b = payload[0]?.payload;
  if (!b) return null;
  const rows = [
    { name: "Spend +PPN", value: formatCurrency(b.spend) },
    { name: "Klik", value: formatNumber(b.klik) },
    { name: "CPC", value: formatCurrency(b.cpc) },
  ];
  return (
    <div className="bg-white rounded-lg border shadow-lg p-3 text-sm">
      <p className="font-medium mb-1.5 text-gray-700">{b.label}</p>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-4 py-0.5">
          <span className="text-gray-600">{r.name}:</span>
          <span className="font-semibold ml-auto">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// Dua panel bertumpuk dengan sumbu-x sama (nama penempatan): spend (biru) di
// atas, volume klik (hijau) di bawah — dua besaran beda satuan dipisah panel,
// BUKAN dual-axis. Tooltip keduanya menampilkan spend + klik + CPC.
export function PenempatanChart({ data }: { data: PenempatanBucket[] }) {
  if (data.length === 0) return null;
  const margin = { top: 4, right: 16, left: 0, bottom: 0 };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-1">
        Spend vs Klik per Penempatan
      </h3>
      <p className="text-xs text-muted-foreground mb-2">
        <span style={{ color: SPEND_COLOR }}>■</span> Spend (termasuk PPN)
        &nbsp;·&nbsp; <span style={{ color: KLIK_COLOR }}>■</span> Klik tautan
      </p>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart data={data} margin={margin} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis dataKey="label" tick={false} tickLine={false} axisLine={false} height={4} />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}rb` : `${v}`)}
            width={44}
          />
          <Tooltip content={<PenempatanTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Bar dataKey="spend" fill={SPEND_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={data} margin={margin} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}rb` : `${v}`)}
            width={44}
          />
          <Tooltip content={<PenempatanTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Bar dataKey="klik" fill={KLIK_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

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

export interface KlikBucket {
  label: string;
  klik: number;
  pesanan: number;
  komisi: number;
  cr: number;
  epc: number;
}

const KLIK_COLOR = "#2563EB";
const CR_COLOR = "#0D9488";

interface TooltipEntry {
  payload?: KlikBucket;
}

function KlikTooltip({
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
    { name: "Klik", value: formatNumber(b.klik) },
    { name: "Pesanan", value: formatNumber(b.pesanan) },
    { name: "Konversi (CR)", value: (b.cr * 100).toFixed(2) + "%" },
    { name: "Komisi", value: formatCurrency(b.komisi) },
    { name: "EPC", value: formatCurrency(b.epc) },
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

// Dua panel bertumpuk dengan sumbu-x sama: volume klik (biru) di atas,
// tingkat konversi pesanan/klik (amber) di bawah — dua besaran beda satuan
// dipisah panel, BUKAN dual-axis. Tooltip keduanya menampilkan metrik lengkap.
export function KlikChart({ title, data }: { title: string; data: KlikBucket[] }) {
  if (data.length === 0) return null;
  const margin = { top: 4, right: 16, left: 0, bottom: 0 };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-2">
        <span style={{ color: KLIK_COLOR }}>■</span> Klik &nbsp;·&nbsp;{" "}
        <span style={{ color: CR_COLOR }}>■</span> Konversi (pesanan / klik)
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
          <Tooltip content={<KlikTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Bar dataKey="klik" fill={KLIK_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={data} margin={margin} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#e5e7eb" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => (v * 100).toFixed(1) + "%"}
            width={44}
          />
          <Tooltip content={<KlikTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
          <Bar dataKey="cr" fill={CR_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

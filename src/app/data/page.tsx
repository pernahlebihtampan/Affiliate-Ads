"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { formatCurrency, formatNumber } from "@/lib/utils";

type DataType = "orders" | "clicks" | "pivot";

interface OrderItem {
  idPemesanan: string;
  statusPesanan: string;
  namaBarang: string;
  namaToko: string;
  nilaiPembelianRp: number;
  komisiBersihRp: number;
  tag1: string;
  orderTimeUTC: string;
  platform: string;
}

interface Click {
  klikId: string;
  waktuKlik: string;
  wilayah: string;
  tag1: string;
  perujuk: string;
}

export default function DataBrowserPage() {
  const [dataType, setDataType] = useState<DataType>("orders");
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [clicks, setClicks] = useState<Click[]>([]);
  const [pivotData, setPivotData] = useState<Record<string, Record<string, number>>>({});
  const [pivotDates, setPivotDates] = useState<string[]>([]);
  const [pivotCampaigns, setPivotCampaigns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [pivotMetric, setPivotMetric] = useState<"komisi" | "spend" | "orders">("komisi");

  const fetchOrders = async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns?id=1&type=meta`);
    setLoading(false);
  };

  const fetchPivot = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard");
      const data = await res.json();

      // Build pivot: campaign × date
      const pivot: Record<string, Record<string, number>> = {};
      const dateSet = new Set<string>();
      const campaignSet = new Set<string>();

      for (const row of data.rows || []) {
        campaignSet.add(row.metaCampaignName);
        // For now, we just use aggregate - in real version, fetch daily data
      }

      setPivotCampaigns(Array.from(campaignSet).sort());
      setPivotDates(Array.from(dateSet).sort());
      setPivotData(pivot);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetch = () => {
    if (dataType === "pivot") {
      fetchPivot();
    } else if (dataType === "orders") {
      fetchOrders();
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Data Browser</h1>
          <p className="text-sm text-muted-foreground">
            Jelajahi data mentah orders, clicks, atau pivot kampanye × tanggal
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(["orders", "clicks", "pivot"] as DataType[]).map((t) => (
            <button
              key={t}
              onClick={() => setDataType(t)}
              className={`px-4 py-2 rounded-md text-sm border ${
                dataType === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white hover:bg-gray-50"
              }`}
            >
              {t === "orders" ? "Pesanan" : t === "clicks" ? "Klik" : "Pivot"}
            </button>
          ))}
        </div>

        {dataType === "pivot" && (
          <div className="flex items-center gap-2">
            <select
              value={pivotMetric}
              onChange={(e) => setPivotMetric(e.target.value as any)}
              className="px-3 py-2 border rounded-md text-sm"
            >
              <option value="komisi">Komisi</option>
              <option value="spend">Spend</option>
              <option value="orders">Pesanan</option>
            </select>
            <button
              onClick={handleFetch}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Muat Pivot
            </button>
          </div>
        )}

        {dataType !== "pivot" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari..."
              className="px-3 py-2 border rounded-md text-sm w-64"
            />
            <button
              onClick={handleFetch}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Cari
            </button>
          </div>
        )}

        {/* Placeholder - actual data browsing would need a dedicated API */}
        <div className="bg-white rounded-lg border p-8 text-center text-muted-foreground">
          <p className="text-lg mb-2">🔍</p>
          <p>
            Gunakan API endpoint untuk mengakses data mentah.
          </p>
          <p className="text-xs mt-2">
            GET /api/campaigns?id=X&type=meta · GET /api/dashboard?from=...&to=...
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

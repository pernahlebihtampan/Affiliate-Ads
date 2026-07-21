"use client";

import { useState, useEffect, useRef } from "react";

type Key = string | number;

// Combobox dengan pencarian. Dipakai di Pusat Kampanye, Dasbor, Ringkasan,
// Performa Klik/Wilayah/Penempatan.
// - `value`/`onChange` memakai kunci generik (string | number).
// - `allLabel` (opsional) menampilkan entri paling atas untuk mengosongkan
//   filter (value → null), mis. "Semua kampanye".
export function SearchSelect<T>({
  label,
  items,
  value,
  onChange,
  getKey,
  displayFn,
  placeholder,
  allLabel,
  className,
  wrapperClassName,
  disabled,
  title,
}: {
  label?: string;
  items: T[];
  value: Key | null;
  onChange: (value: Key | null) => void;
  getKey: (item: T) => Key;
  displayFn: (item: T) => string;
  placeholder?: string;
  allLabel?: string;
  className?: string;
  // Kelas untuk wrapper luar (flex item / lebar). `className` hanya mengenai
  // trigger di dalamnya, jadi lebar berbasis flex (mis. `basis-3/4`) harus lewat sini.
  wrapperClassName?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = search
    ? items.filter((item) =>
        displayFn(item).toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const hasValue = value !== null && value !== "";
  const selected = hasValue ? items.find((i) => getKey(i) === value) : undefined;

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const pick = (v: Key | null) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName || ""}`}>
      {label && (
        <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      )}
      <div
        className={`px-3 py-2 border rounded-md text-sm flex items-center justify-between ${
          disabled
            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
            : "bg-white cursor-pointer"
        } ${className || ""}`}
        onClick={() => !disabled && setOpen(!open)}
        title={title}
      >
        <span className={`truncate ${selected || (!placeholder && allLabel) ? "" : "text-gray-400"}`}>
          {selected ? displayFn(selected) : placeholder || allLabel || "-- Pilih --"}
        </span>
        <svg className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border rounded-md shadow-lg max-h-72 flex flex-col">
          <div className="p-1 border-b">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ketik untuk mencari..."
              className="w-full px-2 py-1.5 border rounded text-sm outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {allLabel && (
              <div
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 text-gray-500 ${
                  !hasValue ? "bg-blue-100 font-medium" : ""
                }`}
                onClick={() => pick(null)}
              >
                {allLabel}
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-gray-400 text-center">Tidak ditemukan</div>
            ) : (
              <div className="py-1">
                {filtered.slice(0, 200).map((item) => {
                  const k = getKey(item);
                  return (
                    <div
                      key={k}
                      className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 truncate ${
                        k === value ? "bg-blue-100 font-medium" : ""
                      }`}
                      onClick={() => pick(k)}
                    >
                      {displayFn(item)}
                    </div>
                  );
                })}
                {filtered.length > 200 && (
                  <div className="px-3 py-1.5 text-xs text-gray-400 text-center">
                    … dan {filtered.length - 200} lainnya
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { id } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

type DateInputProps = {
  /** Nilai ISO `yyyy-MM-dd` (atau string kosong bila belum dipilih). */
  value: string;
  /** Dipanggil dengan ISO `yyyy-MM-dd` saat tanggal dipilih. */
  onChange: (iso: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
};

/** Parse `yyyy-MM-dd` → Date lokal (tanpa geser hari); null bila kosong/invalid. */
function parseIso(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : null;
}

/**
 * Pengganti `<input type="date">` yang selalu tampil format Indonesia
 * (field `dd/MM/yyyy` + kalender popover nama bulan/hari id-ID),
 * tak bergantung locale browser. Kontrak sama: `value`/`onChange` pakai ISO `yyyy-MM-dd`.
 */
export function DateInput({
  value,
  onChange,
  className = "",
  placeholder = "dd/mm/yyyy",
  disabled,
}: DateInputProps) {
  const selected = parseIso(value);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<Date>(selected ?? new Date());

  // Grid 6 minggu penuh mulai awal pekan (locale id) yang memuat awal bulan.
  const gridStart = startOfWeek(startOfMonth(view), { locale: id });
  const gridEnd = endOfWeek(endOfMonth(view), { locale: id });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    format(addDays(gridStart, i), "EEEEEE", { locale: id }),
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={`inline-flex items-center justify-between gap-2 ${className}`}
        >
          <span className={selected ? "" : "text-muted-foreground"}>
            {selected ? format(selected, "dd/MM/yyyy") : placeholder}
          </span>
          <CalendarIcon className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 rounded-md border bg-background p-3 shadow-lg"
        >
          {/* Header: navigasi bulan */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setView((v) => addMonths(v, -1))}
              className="p-1 rounded hover:bg-muted"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold capitalize">
              {format(view, "MMMM yyyy", { locale: id })}
            </span>
            <button
              type="button"
              onClick={() => setView((v) => addMonths(v, 1))}
              className="p-1 rounded hover:bg-muted"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Nama hari */}
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekdays.map((w, i) => (
              <span
                key={i}
                className="text-center text-xs font-medium text-muted-foreground py-1 capitalize"
              >
                {w}
              </span>
            ))}
          </div>

          {/* Kisi tanggal */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const isSelected = selected && isSameDay(day, selected);
              const inMonth = isSameMonth(day, view);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => {
                    onChange(format(day, "yyyy-MM-dd"));
                    setView(day);
                    setOpen(false);
                  }}
                  className={`w-8 h-8 rounded text-sm flex items-center justify-center transition-colors
                    ${isSelected ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted"}
                    ${!inMonth ? "text-muted-foreground/50" : ""}
                    ${!isSelected && isToday(day) ? "ring-1 ring-ring" : ""}`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

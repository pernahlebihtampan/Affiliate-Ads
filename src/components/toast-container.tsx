"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const toast = e.detail as Toast;
      const id = String(Date.now());
      setToasts((prev) => [...prev, { ...toast, id }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    };

    window.addEventListener("toast" as any, handler as any);
    return () => window.removeEventListener("toast" as any, handler as any);
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "p-3 rounded-lg shadow-lg border cursor-pointer transition-all",
            toast.variant === "destructive" && "bg-red-50 border-red-200 text-red-800",
            toast.variant === "success" && "bg-green-50 border-green-200 text-green-800",
            (!toast.variant || toast.variant === "default") &&
              "bg-white border-gray-200 text-gray-900"
          )}
          onClick={() => dismiss(toast.id)}
        >
          <p className="font-medium text-sm">{toast.title}</p>
          {toast.description && (
            <p className="text-xs mt-0.5 opacity-80">{toast.description}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function showToast(
  title: string,
  description?: string,
  variant?: "default" | "destructive" | "success"
) {
  const event = new CustomEvent("toast", {
    detail: { title, description, variant },
  });
  window.dispatchEvent(event);
}

"use client";

import { Sidebar } from "./sidebar";
import { ToastContainer } from "./toast-container";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="p-6">{children}</div>
      </main>
      <ToastContainer />
    </div>
  );
}

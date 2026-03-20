"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { AuthInitializer } from "./auth-initializer";
import { useNotificationPush } from "@/hooks/use-notification-push";

export function ErpShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useNotificationPush();

  return (
    <>
      <AuthInitializer />
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
            <div className="mx-auto max-w-7xl p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>
      <BottomNav />
    </>
  );
}

"use client";

import { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background touch-pan-y">
      <main className="flex-1 pb-20 overflow-x-hidden">{children}</main>
      <BottomNav />
    </div>
  );
}

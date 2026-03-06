"use client";

import { ReactNode } from "react";
import { BottomNav } from "./bottom-nav";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background touch-pan-y">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Ir al contenido principal
      </a>
      <main id="main-content" className="flex-1 pb-20 overflow-x-hidden">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

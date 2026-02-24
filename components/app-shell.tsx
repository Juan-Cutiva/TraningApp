"use client"

import type { ReactNode } from "react"
import { BottomNav } from "./bottom-nav"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex-1 pb-20">{children}</main>
      <BottomNav />
    </div>
  )
}

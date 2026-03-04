"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Dumbbell,
  CalendarDays,
  Settings,
  Scale,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Inicio" },
  { href: "/stats", icon: BarChart3, label: "Stats" },
  { href: "/body-weight", icon: Scale, label: "Peso" },
  { href: "/routines", icon: Dumbbell, label: "Rutinas" },
  { href: "/history", icon: CalendarDays, label: "Historial" },
  { href: "/settings", icon: Settings, label: "Ajustes" },
];

export function BottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/workout/")) return null;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md safe-area-bottom"
    >
      <div className="mx-auto flex max-w-lg items-center justify-around px-1 py-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[9px] transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon
                className={cn("h-4 w-4 mb-0.5", isActive && "stroke-[2.5px]")}
                aria-hidden="true"
              />
              <span className="font-medium" aria-hidden="true">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

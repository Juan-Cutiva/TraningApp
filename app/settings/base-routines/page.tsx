import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { AdminBaseRoutinesEditor } from "@/components/settings/admin-base-routines-editor";

export const metadata: Metadata = {
  title: "Rutinas base (admin)",
  description: "Edita la plantilla de rutinas base que se distribuye a todos los usuarios.",
};

export default function AdminBaseRoutinesPage() {
  return (
    <AppShell>
      <AdminBaseRoutinesEditor />
    </AppShell>
  );
}

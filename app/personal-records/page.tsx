import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PersonalRecordsContent } from "@/components/personal-records/personal-records-content";

export const metadata: Metadata = {
  title: "Records Personales",
  description: "Consulta y gestiona todos tus récords personales de fuerza.",
};

export default function PersonalRecordsPage() {
  return (
    <AppShell>
      <PersonalRecordsContent />
    </AppShell>
  );
}

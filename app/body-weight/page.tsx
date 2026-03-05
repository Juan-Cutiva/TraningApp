import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { BodyWeightContent } from "@/components/body-weight/body-weight-content";

export const metadata: Metadata = {
  title: "Peso Corporal",
  description: "Registra y sigue la evolución de tu peso corporal.",
};

export default function BodyWeightPage() {
  return (
    <AppShell>
      <BodyWeightContent />
    </AppShell>
  );
}

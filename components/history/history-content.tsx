"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, calculate1RM } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Dumbbell,
  TrendingUp,
  CalendarOff,
  FileDown,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ErrorBoundary } from "@/components/error-boundary";

export function HistoryContent() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  const allLogs = useLiveQuery(() => db.workoutLogs.reverse().sortBy("date"));

  const exerciseNames = useLiveQuery(async () => {
    const logs = await db.workoutLogs.toArray();
    const names = new Set<string>();
    logs.forEach((l) => l.exercises.forEach((e) => names.add(e.exerciseName)));
    return Array.from(names).sort();
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const monthLogs =
    allLogs?.filter((l) => {
      const d = new Date(l.date);
      return d >= monthStart && d <= monthEnd;
    }) ?? [];

  const monthDuration = monthLogs.reduce((s, l) => s + l.duration, 0);

  const selectedDayLog = selectedDate
    ? (allLogs?.find((l) => isSameDay(new Date(l.date), selectedDate)) ?? null)
    : null;

  function handleDayClick(day: Date) {
    setSelectedDate(day);
    setSheetOpen(true);
  }

  const exerciseChartData = useMemo(() => {
    if (!selectedExercise || !allLogs) return [];
    return allLogs
      .filter((l) => l.exercises.some((e) => e.exerciseName === selectedExercise))
      .slice()
      .reverse()
      .map((l) => {
        const ex = l.exercises.find((e) => e.exerciseName === selectedExercise);
        const completedSets = ex?.sets.filter((s) => s.completed) ?? [];
        const maxWeight =
          completedSets.length > 0
            ? Math.max(...completedSets.map((s) => Number(s.weight) || 0))
            : 0;
        const bestSet =
          completedSets.length > 0
            ? completedSets.reduce(
                (best, s) => (Number(s.weight) > Number(best.weight) ? s : best),
                completedSets[0],
              )
            : null;
        const bestWeight = Number(bestSet?.weight) || 0;
        const bestReps = bestSet?.reps ?? 0;
        const rm = calculate1RM(bestWeight, bestReps);
        return {
          date: format(new Date(l.date), "dd/MM"),
          peso: maxWeight,
          "1RM": rm.epley,
        };
      });
  }, [allLogs, selectedExercise]);

  async function exportPDF() {
    if (!allLogs || allLogs.length === 0) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const pageW = 210;
    const margin = 14;
    const contentW = pageW - margin * 2;
    let y = margin;

    const COLOR_PRIMARY: [number, number, number] = [67, 97, 238];
    const COLOR_DARK: [number, number, number] = [20, 20, 40];
    const COLOR_GRAY: [number, number, number] = [100, 100, 120];
    const COLOR_LIGHT: [number, number, number] = [240, 241, 248];
    const COLOR_ROW_ALT: [number, number, number] = [248, 249, 255];

    // ── Header ──────────────────────────────────────────────────────────────
    doc.setFillColor(...COLOR_PRIMARY);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Cuti Traning", margin, 12);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("Historial de Entrenamientos", margin, 19);
    const exportDate = format(new Date(), "dd 'de' MMMM yyyy", { locale: es });
    doc.text(`Exportado el ${exportDate}`, pageW - margin, 19, { align: "right" });
    y = 36;

    // ── Summary ──────────────────────────────────────────────────────────────
    const totalDuration = allLogs.reduce((s, l) => s + l.duration, 0);
    const totalSessions = allLogs.length;
    const avgDuration = totalSessions > 0 ? totalDuration / totalSessions : 0;
    const fmtMin = (s: number) => `${Math.round(s / 60)} min`;

    doc.setFillColor(...COLOR_LIGHT);
    doc.roundedRect(margin, y, contentW, 20, 3, 3, "F");
    doc.setTextColor(...COLOR_DARK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    const colW = contentW / 3;
    [
      ["Sesiones totales", String(totalSessions)],
      ["Tiempo total", fmtMin(totalDuration)],
      ["Promedio por sesión", fmtMin(avgDuration)],
    ].forEach(([label, value], i) => {
      const cx = margin + colW * i + colW / 2;
      doc.setTextColor(...COLOR_GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(label, cx, y + 7, { align: "center" });
      doc.setTextColor(...COLOR_PRIMARY);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(value, cx, y + 15, { align: "center" });
    });
    y += 28;

    // ── Sessions ─────────────────────────────────────────────────────────────
    const sorted = [...allLogs].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    for (let idx = 0; idx < sorted.length; idx++) {
      const log = sorted[idx];
      const dateStr = format(new Date(log.date), "EEEE dd 'de' MMMM yyyy", { locale: es });
      const completedExercises = log.exercises.filter((ex) =>
        ex.sets.some((s) => s.completed)
      );
      const blockH = 14 + completedExercises.length * 7 + 6;

      // Page break check
      if (y + blockH > 282) {
        doc.addPage();
        y = margin;
      }

      // Session header bar
      doc.setFillColor(...COLOR_PRIMARY);
      doc.roundedRect(margin, y, contentW, 10, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(log.routineName, margin + 3, y + 6.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`${fmtMin(log.duration)}  ·  ${dateStr}`, pageW - margin - 3, y + 6.5, { align: "right" });
      y += 11;

      // Exercises
      completedExercises.forEach((ex, ei) => {
        const rowBg: [number, number, number] = ei % 2 === 0 ? COLOR_LIGHT : COLOR_ROW_ALT;
        doc.setFillColor(...rowBg);
        doc.rect(margin, y, contentW, 7, "F");

        doc.setTextColor(...COLOR_DARK);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(ex.exerciseName, margin + 3, y + 4.8);

        const setsStr = ex.sets
          .filter((s) => s.completed)
          .map((s) => `${s.weight}${s.unit}×${s.reps}`)
          .join("   ");
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...COLOR_GRAY);
        doc.setFontSize(7.5);
        doc.text(setsStr, pageW - margin - 3, y + 4.8, { align: "right" });
        y += 7;
      });

      if (log.notes) {
        if (y + 8 > 282) { doc.addPage(); y = margin; }
        doc.setFillColor(255, 248, 220);
        doc.rect(margin, y, contentW, 7, "F");
        doc.setTextColor(120, 100, 0);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(7.5);
        doc.text(`Nota: ${log.notes}`, margin + 3, y + 4.8);
        y += 7;
      }

      y += 5; // gap between sessions
    }

    // ── Footer on last page ───────────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setTextColor(...COLOR_GRAY);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.text(`Página ${p} de ${pageCount}`, pageW / 2, 293, { align: "center" });
    }

    doc.save(`cuti-traning-historial-${format(new Date(), "yyyy-MM-dd")}.pdf`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Historial</h1>
        {allLogs && allLogs.length > 0 && (
          <Button variant="outline" size="sm" className="gap-2 h-9" onClick={exportPDF}>
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
        )}
      </div>

      <Tabs defaultValue="calendar">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="calendar" className="flex-1">
            Calendario
          </TabsTrigger>
          <TabsTrigger value="exercises" className="flex-1">
            Ejercicios
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendar">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mes anterior"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </Button>
            <span
              aria-live="polite"
              aria-atomic="true"
              className="font-semibold text-foreground capitalize"
            >
              {format(currentMonth, "MMMM yyyy", { locale: es })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Mes siguiente"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-4">
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <div
                key={d}
                className="text-center text-xs font-medium text-muted-foreground py-1"
              >
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) => {
              const hasWorkout = allLogs?.some((l) =>
                isSameDay(new Date(l.date), day),
              );
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isToday = isSameDay(day, new Date());
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  aria-label={`${format(day, "EEEE dd 'de' MMMM", { locale: es })}${hasWorkout && isCurrentMonth ? ", entrenamiento registrado" : ""}${isSelected ? ", seleccionado" : ""}`}
                  className={`relative flex h-10 items-center justify-center rounded-lg text-sm transition-colors
                    ${!isCurrentMonth ? "text-muted-foreground/30" : "text-foreground"}
                    ${isToday && !isSelected ? "bg-primary/15 font-bold text-primary" : ""}
                    ${isSelected ? "bg-primary text-primary-foreground font-bold" : ""}
                    ${isCurrentMonth && !isSelected ? "hover:bg-muted active:bg-muted/70" : ""}
                  `}
                >
                  <span aria-hidden="true">{format(day, "d")}</span>
                  {hasWorkout && isCurrentMonth && !isSelected && (
                    <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  {hasWorkout && isCurrentMonth && isSelected && (
                    <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-primary-foreground" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Stats - 2 columnas más grandes y atractivas */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 flex flex-col items-center justify-center gap-1">
                <div className="flex items-center gap-2 mb-1">
                  <Dumbbell className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">
                    Entrenamientos
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {monthLogs.length}
                </p>
                <p className="text-xs text-muted-foreground">este mes</p>
              </CardContent>
            </Card>
            <Card className="bg-chart-3/10 border-chart-3/20">
              <CardContent className="p-5 flex flex-col items-center justify-center gap-1">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-5 w-5 text-chart-3" />
                  <span className="text-xs font-medium text-chart-3 uppercase tracking-wide">
                    Tiempo total
                  </span>
                </div>
                <p className="text-3xl font-bold text-foreground">
                  {Math.round(monthDuration / 60)}m
                </p>
                <p className="text-xs text-muted-foreground">minutos</p>
              </CardContent>
            </Card>
          </div>

          <h2 className="mb-3 text-base font-semibold text-foreground">
            Sesiones recientes
          </h2>
          {!allLogs || allLogs.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-10 text-center">
                <CalendarOff className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-base font-medium text-foreground">
                  Sin entrenamientos aún
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Completa tu primera rutina para ver el historial aquí
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {allLogs?.slice(0, 10).map((log) => (
                <Card
                  key={log.id}
                  className="border-border/60"
                >
                <button
                  type="button"
                  className="w-full cursor-pointer hover:bg-muted/50 transition-all active:scale-[0.99] rounded-[inherit] text-left"
                  aria-label={`Ver detalles de ${log.routineName}, ${format(new Date(log.date), "EEEE dd MMM", { locale: es })}`}
                  onClick={() => {
                    setSelectedDate(new Date(log.date));
                    setSheetOpen(true);
                  }}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                        <Dumbbell className="h-5 w-5 text-primary" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {log.routineName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(log.date), "EEEE dd MMM", {
                            locale: es,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-bold text-foreground">
                        {Math.round(log.duration / 60)}m
                      </p>
                      <p className="text-xs text-muted-foreground">duración</p>
                    </div>
                  </CardContent>
                </button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="exercises">
          <div className="mb-5">
            <Select
              value={selectedExercise ?? ""}
              onValueChange={(v) => setSelectedExercise(v || null)}
            >
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Selecciona un ejercicio para ver su progreso" />
              </SelectTrigger>
              <SelectContent>
                {exerciseNames?.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedExercise && exerciseChartData.length > 0 && (
            <>
              <Card className="mb-4">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base font-semibold">
                    Progreso: {selectedExercise}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <ErrorBoundary>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={exerciseChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-border"
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "12px",
                          fontSize: "12px",
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="peso"
                        stroke="var(--color-primary)"
                        strokeWidth={3}
                        dot={{ r: 4, fill: "var(--color-primary)" }}
                        name="Peso Max"
                      />
                      <Line
                        type="monotone"
                        dataKey="1RM"
                        stroke="var(--color-accent)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3, fill: "var(--color-accent)" }}
                        name="1RM Est."
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  </ErrorBoundary>
                </CardContent>
              </Card>

              <ExercisePRs exerciseName={selectedExercise} />
            </>
          )}

          {selectedExercise && exerciseChartData.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center">
                <TrendingUp className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="text-base font-medium text-foreground">
                  Sin datos aún
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Completa este ejercicio en tus entrenamientos
                </p>
              </CardContent>
            </Card>
          )}

          {!selectedExercise && (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <TrendingUp className="mb-4 h-12 w-12 text-muted-foreground/30" />
                <p className="text-lg font-medium text-foreground">
                  Selecciona un ejercicio
                </p>
                <p className="text-sm text-muted-foreground mt-2 max-w-62.5">
                  Elige un ejercicio para ver tu historial de peso y progreso
                  estimado de 1RM
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[75dvh] overflow-auto rounded-t-2xl"
        >
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-lg">
              {selectedDate
                ? format(selectedDate, "EEEE dd 'de' MMMM yyyy", {
                    locale: es,
                  })
                : ""}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Detalle del entrenamiento del día seleccionado
            </SheetDescription>
          </SheetHeader>

          <div className="px-4 pb-8">
            {selectedDayLog ? (
              <div>
                <div className="mb-5 flex items-center gap-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/15">
                    <Dumbbell className="h-7 w-7 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-bold text-foreground">
                      {selectedDayLog.routineName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedDayLog.exercises.length} ejercicios •{" "}
                      {Math.round(selectedDayLog.duration / 60)} minutos
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {selectedDayLog.exercises.map((ex, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border p-4 bg-card"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-foreground">
                            {ex.exerciseName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {ex.muscleGroup}
                          </p>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                          {ex.sets.filter((s) => s.completed).length} series
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {ex.sets
                          .filter((s) => s.completed)
                          .map((s, si) => (
                            <span
                              key={si}
                              className="inline-flex items-center text-sm bg-secondary/70 px-3 py-1.5 rounded-lg text-foreground font-medium"
                            >
                              {s.weight}
                              {s.unit} × {s.reps}
                            </span>
                          ))}
                        {ex.sets.filter((s) => s.completed).length === 0 && (
                          <span className="text-sm text-muted-foreground">
                            Sin series completadas
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center py-10 text-center">
                <CalendarOff className="mb-4 h-14 w-14 text-muted-foreground/30" />
                <p className="text-lg font-medium text-foreground">
                  Día de descanso
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  No hubo entrenamiento este día
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ExercisePRs({ exerciseName }: { exerciseName: string }) {
  const prs = useLiveQuery(
    () =>
      db.personalRecords.where("exerciseName").equals(exerciseName).toArray(),
    [exerciseName],
  );

  if (!prs || prs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-semibold">
          Records Personales
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {prs.map((pr) => (
          <div
            key={pr.id}
            className="flex items-center justify-between py-3 border-b border-border last:border-0"
          >
            <div>
              <p className="font-medium text-foreground">
                {pr.type === "weight" ? "🏆 Mayor Peso" : "🔥 Mayor Reps"}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(pr.date), "dd MMM yyyy", { locale: es })}
              </p>
            </div>
            <span className="text-lg font-bold text-accent">{pr.details}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

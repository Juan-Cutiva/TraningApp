"use client";

import { useState, useEffect } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type BodyWeightEntry, type WeightGoal } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Target,
  Plus,
  Loader2,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

export function BodyWeightContent() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newNote, setNewNote] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [mounted, setMounted] = useState(false);

  const weightLogs = useLiveQuery(() =>
    db.bodyWeight.orderBy("date").reverse().toArray(),
  );

  const weightGoal = useLiveQuery(() =>
    db.weightGoals.orderBy("createdAt").reverse().first(),
  );

  const userSettings = useLiveQuery(() =>
    db.userSettings.toCollection().first(),
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const latestWeight = weightLogs?.[0]?.weight;
  const firstWeight = weightLogs?.[weightLogs.length - 1]?.weight;
  const weightChange =
    latestWeight && firstWeight ? latestWeight - firstWeight : 0;

  const goalProgress = (() => {
    if (!weightGoal || !latestWeight) return 0;
    const range = Math.abs(weightGoal.targetWeight - weightGoal.startWeight);
    if (range === 0) return 100; // already at goal
    const raw =
      weightGoal.targetWeight > weightGoal.startWeight
        ? ((latestWeight - weightGoal.startWeight) / range) * 100
        : ((weightGoal.startWeight - latestWeight) / range) * 100;
    return Math.min(100, Math.max(0, raw));
  })();

  const goalDirection =
    weightGoal && weightGoal.targetWeight > weightGoal.startWeight
      ? "up"
      : "down";

  // IMC calculation
  const heightCm = userSettings?.height;
  const imc =
    latestWeight && heightCm && heightCm > 0
      ? latestWeight / Math.pow(heightCm / 100, 2)
      : null;

  function imcCategory(bmi: number): { label: string; color: string } {
    // Using -500 dark variants for light mode contrast (WCAG AA on white backgrounds)
    if (bmi < 18.5) return { label: "Bajo peso",   color: "text-blue-600 dark:text-blue-400" };
    if (bmi < 25)   return { label: "Peso normal",  color: "text-green-600 dark:text-green-400" };
    if (bmi < 30)   return { label: "Sobrepeso",    color: "text-yellow-600 dark:text-yellow-400" };
    if (bmi < 35)   return { label: "Obesidad I",   color: "text-orange-600 dark:text-orange-400" };
    return           { label: "Obesidad II+", color: "text-red-600 dark:text-red-400" };
  }

  async function addWeightEntry() {
    if (!newWeight) return;

    const entry: BodyWeightEntry = {
      weight: parseFloat(newWeight),
      date: new Date(),
      note: newNote || undefined,
    };

    await db.bodyWeight.add(entry);

    setNewWeight("");
    setNewNote("");
    setIsAddDialogOpen(false);
    toast.success(`Peso registrado: ${parseFloat(newWeight).toFixed(1)} kg`);
  }

  async function setGoal() {
    if (!goalWeight || !latestWeight) return;

    // Eliminar meta anterior si existe
    if (weightGoal?.id) {
      await db.weightGoals.delete(weightGoal.id);
    }

    const goal: WeightGoal = {
      targetWeight: parseFloat(goalWeight),
      startWeight: latestWeight,
      startDate: new Date(),
      achieved: false,
      createdAt: new Date(),
    };

    await db.weightGoals.add(goal);

    setGoalWeight("");
    setIsGoalDialogOpen(false);
    toast.success(`Meta establecida: ${parseFloat(goalWeight).toFixed(1)} kg`);
  }

  async function deleteWeightEntry(id: number) {
    if (confirm("¿Eliminar este registro de peso?")) {
      await db.bodyWeight.delete(id);
      toast.success("Registro eliminado");
    }
  }

  async function deleteGoal() {
    if (weightGoal?.id && confirm("¿Eliminar esta meta de peso?")) {
      await db.weightGoals.delete(weightGoal.id);
      toast.success("Meta eliminada");
    }
  }

  const chartData = (() => {
    const raw = weightLogs?.slice().reverse() ?? [];
    return raw.map((log: BodyWeightEntry, i: number) => {
      // 7-entry moving average (by data point, not calendar days)
      const windowStart = Math.max(0, i - 6);
      const window = raw.slice(windowStart, i + 1);
      const avg = window.reduce((s, l) => s + l.weight, 0) / window.length;
      return {
        date: format(new Date(log.date), "dd/MM"),
        weight: log.weight,
        // Show average only when we have at least 3 data points in window
        avg7: window.length >= 3 ? Math.round(avg * 10) / 10 : undefined,
      };
    });
  })();

  if (!mounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Peso Corporal</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-lg"
            onClick={() => setIsGoalDialogOpen(true)}
          >
            <Target className="h-4 w-4" />
            Meta
          </Button>
          <Button
            size="sm"
            className="gap-1.5 rounded-lg"
            onClick={() => setIsAddDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Pesar
          </Button>
        </div>
      </div>

      {/* Current Weight Card */}
      <Card className="mb-5 bg-linear-to-br from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Scale className="h-8 w-8 text-primary" />
            <span className="text-sm font-medium text-primary uppercase tracking-wider">
              Peso Actual
            </span>
          </div>
          {latestWeight ? (
            <>
              <p className="text-5xl font-bold text-foreground">
                {latestWeight.toFixed(1)}
                <span className="text-xl font-normal text-muted-foreground ml-1">
                  kg
                </span>
              </p>
              {weightLogs && weightLogs.length > 1 && (
                <div
                  className={`flex items-center justify-center gap-1 mt-3 text-sm font-medium ${
                    weightChange > 0
                      ? "text-chart-2"
                      : weightChange < 0
                        ? "text-chart-3"
                        : "text-muted-foreground"
                  }`}
                >
                  {weightChange > 0 ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : weightChange < 0 ? (
                    <TrendingDown className="h-4 w-4" />
                  ) : null}
                  <span>
                    {weightChange > 0 ? "+" : ""}
                    {weightChange.toFixed(1)} kg desde el inicio
                  </span>
                </div>
              )}
              {imc !== null && (
                <div className="mt-3 pt-3 border-t border-primary/20 flex items-center justify-center gap-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
                      IMC
                    </p>
                    <p className={`text-2xl font-bold ${imcCategory(imc).color}`}>
                      {imc.toFixed(1)}
                    </p>
                    <p className={`text-xs font-semibold ${imcCategory(imc).color}`}>
                      {imcCategory(imc).label}
                    </p>
                  </div>
                </div>
              )}
              {!heightCm && (
                <p className="text-xs text-muted-foreground mt-3 opacity-70">
                  Configura tu altura en Ajustes para ver el IMC
                </p>
              )}
            </>
          ) : (
            <div className="py-6">
              <p className="text-lg text-muted-foreground">Sin registros</p>
              <p className="text-sm text-muted-foreground mt-1">
                Agrega tu primer peso
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Goal Card */}
      {weightGoal && latestWeight && (
        <Card className="mb-5 border-chart-3/30 bg-chart-3/5">
          <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-5 w-5 text-chart-3" />
              Meta de Peso
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={deleteGoal}
              aria-label="Eliminar meta de peso"
              title="Eliminar meta de peso"
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {weightGoal.targetWeight} kg
                </p>
                <p className="text-sm text-muted-foreground">
                  Inicio: {weightGoal.startWeight} kg
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">
                  {Math.min(100, Math.max(0, goalProgress)).toFixed(0)}%
                </p>
                <p className="text-sm text-muted-foreground">
                  {latestWeight > weightGoal.targetWeight
                    ? "Por perder"
                    : "Por ganar"}
                  :{" "}
                  {Math.abs(latestWeight - weightGoal.targetWeight).toFixed(1)}{" "}
                  kg
                </p>
              </div>
            </div>
            <Progress
              value={Math.min(100, Math.max(0, goalProgress))}
              className="h-3 bg-chart-3/20"
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {goalDirection === "up" ? "↑" : "↓"} Meta:{" "}
              {weightGoal.targetWeight} kg
            </p>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      {chartData.length > 1 && (
        <Card className="mb-5">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Historial de Peso</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <ErrorBoundary>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={["dataMin - 2", "dataMax + 2"]}
                  tick={{ fontSize: 10 }}
                  className="fill-muted-foreground"
                  axisLine={false}
                  tickLine={false}
                  width={35}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [
                    `${value} kg`,
                    name === "avg7" ? "Media 7 días" : "Peso",
                  ]}
                />
                <Legend
                  formatter={(value) => value === "avg7" ? "Media 7 días" : "Peso diario"}
                  wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                />
                {weightGoal && (
                  <ReferenceLine
                    y={weightGoal.targetWeight}
                    stroke="var(--color-chart-3)"
                    strokeDasharray="5 5"
                    label={{ value: `Meta ${weightGoal.targetWeight}kg`, fontSize: 10, fill: "var(--color-chart-3)" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--color-primary)" }}
                  name="weight"
                />
                <Line
                  type="monotone"
                  dataKey="avg7"
                  stroke="var(--color-chart-3)"
                  strokeWidth={2.5}
                  strokeDasharray="6 3"
                  dot={false}
                  name="avg7"
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
            </ErrorBoundary>
          </CardContent>
        </Card>
      )}

      {/* Recent Entries */}
      {weightLogs && weightLogs.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Registros Recientes</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="flex flex-col gap-2">
              {weightLogs
                .slice(0, 10)
                .map((entry: BodyWeightEntry, i: number) => (
                  <div
                    key={entry.id || i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Scale className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">
                          {entry.weight.toFixed(1)} kg
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(entry.date), "EEEE dd MMM", {
                            locale: es,
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {entry.note && (
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                          {entry.note}
                        </span>
                      )}
                      {entry.id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteWeightEntry(entry.id!)}
                          aria-label={`Eliminar registro de ${entry.weight.toFixed(1)} kg`}
                          title={`Eliminar registro de ${entry.weight.toFixed(1)} kg`}
                          className="h-8 w-8 text-muted-foreground/40 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(!weightLogs || weightLogs.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center">
            <Scale className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-semibold text-foreground">
              Sin registros aún
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-62.5">
              Agrega tu peso corporal para seguir tu progreso y establecer metas
            </p>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="mt-5 gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Agregar Primer Peso
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add Weight Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl">
          <DialogHeader>
            <DialogTitle>Registrar Peso</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div>
              <Label htmlFor="new-weight" className="text-sm font-medium">Peso (kg)</Label>
              <Input
                id="new-weight"
                type="text"
                inputMode="decimal"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                placeholder="Ej: 75.5"
                className="mt-1.5 h-11"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="new-note" className="text-sm font-medium">Nota (opcional)</Label>
              <Input
                id="new-note"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ej: Mañana, en ayunas..."
                className="mt-1.5 h-11"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={addWeightEntry}
              disabled={!newWeight || isNaN(parseFloat(newWeight))}
              className="px-6"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Goal Dialog */}
      <Dialog open={isGoalDialogOpen} onOpenChange={setIsGoalDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl">
          <DialogHeader>
            <DialogTitle>Establecer Meta de Peso</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Peso actual</p>
              <p className="text-2xl font-bold text-foreground">
                {latestWeight?.toFixed(1) || "--"} kg
              </p>
            </div>
            <div>
              <Label htmlFor="goal-weight" className="text-sm font-medium">Meta de peso (kg)</Label>
              <Input
                id="goal-weight"
                type="text"
                inputMode="decimal"
                value={goalWeight}
                onChange={(e) => setGoalWeight(e.target.value)}
                placeholder="Ej: 70"
                className="mt-1.5 h-11"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {goalWeight && latestWeight && !isNaN(parseFloat(goalWeight))
                  ? parseFloat(goalWeight) > latestWeight
                    ? `Necesitas ganar ${(parseFloat(goalWeight) - latestWeight).toFixed(1)} kg`
                    : `Necesitas perder ${(latestWeight - parseFloat(goalWeight)).toFixed(1)} kg`
                  : ""}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsGoalDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={setGoal}
              disabled={
                !goalWeight || !latestWeight || isNaN(parseFloat(goalWeight))
              }
              className="px-6"
            >
              Establecer Meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

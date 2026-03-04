"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Trophy, Dumbbell, TrendingUp, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export function PersonalRecordsContent() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [prToDelete, setPrToDelete] = useState<number | null>(null);

  const personalRecords = useLiveQuery(() =>
    db.personalRecords.orderBy("date").reverse().toArray(),
  );

  const prsByExercise = personalRecords?.reduce(
    (acc, pr) => {
      if (!acc[pr.exerciseName]) {
        acc[pr.exerciseName] = [];
      }
      acc[pr.exerciseName].push(pr);
      return acc;
    },
    {} as Record<string, typeof personalRecords>,
  );

  const exercises = Object.keys(prsByExercise || {}).sort();

  async function deletePR(id: number) {
    await db.personalRecords.delete(id);
    setDeleteDialogOpen(false);
    setPrToDelete(null);
  }

  function openDeleteDialog(id: number) {
    setPrToDelete(id);
    setDeleteDialogOpen(true);
  }

  if (!personalRecords) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-500" />
          Records Personales
        </h1>
      </div>

      {exercises.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Trophy className="mb-4 h-14 w-14 text-muted-foreground/30" />
            <p className="text-lg font-medium text-foreground">
              Sin records aún
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-70">
              Completa tus primeros entrenamientos para empezar a establecer tus
              récords personales
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {exercises.map((exerciseName) => {
            const prs = prsByExercise![exerciseName];
            const weightPR = prs.find((p) => p.type === "weight");
            const repsPR = prs.find((p) => p.type === "reps");

            return (
              <Card key={exerciseName}>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base font-semibold">
                    {exerciseName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex flex-col gap-2">
                  {weightPR && (
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg group">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                          <Dumbbell className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Mayor Peso
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(weightPR.date), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">
                          {weightPR.details}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(weightPR.id!)}
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {repsPR && (
                    <div className="flex items-center justify-between p-3 bg-chart-3/5 rounded-lg group">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/15">
                          <TrendingUp className="h-5 w-5 text-chart-3" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Mayor Reps
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(repsPR.date), "dd MMM yyyy", {
                              locale: es,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-chart-3">
                          {repsPR.details}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDeleteDialog(repsPR.id!)}
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] rounded-xl">
          <DialogHeader>
            <DialogTitle>Eliminar Record</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">
              ¿Estás seguro de que deseas eliminar este record personal? Esta
              acción no se puede deshacer.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => prToDelete && deletePR(prToDelete)}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

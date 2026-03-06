"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { subDays, isAfter } from "date-fns";
import { Activity } from "lucide-react";

export function MuscleActivity() {
  const logs = useLiveQuery(() =>
    db.workoutLogs.where("completed").equals(1).toArray(),
  );

  const { muscleData, maxVolume } = useMemo(() => {
    if (!logs) return { muscleData: [], maxVolume: 0 };

    const now = new Date();
    const last7Days = subDays(now, 7);
    const recentLogs = logs.filter((l) => isAfter(new Date(l.date), last7Days));

    const muscleCounts: Record<string, number> = {};
    recentLogs.forEach((log) => {
      log.exercises.forEach((ex) => {
        const completedSets = ex.sets.filter((s) => s.completed).length;
        if (completedSets > 0) {
          const group = ex.muscleGroup || "Otros";
          muscleCounts[group] = (muscleCounts[group] || 0) + completedSets;
        }
      });
    });

    const data = Object.entries(muscleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const max = data.length > 0 ? Math.max(...data.map((d) => d[1])) : 0;
    return { muscleData: data, maxVolume: max };
  }, [logs]);

  if (!logs) return null;
  if (muscleData.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">
            Actividad Muscular (7 días)
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex flex-col gap-3 mt-2">
          {muscleData.map(([muscle, count]) => (
            <div key={muscle}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-foreground">{muscle}</span>
                <span className="text-muted-foreground">{count} series</span>
              </div>
              <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${(count / maxVolume) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

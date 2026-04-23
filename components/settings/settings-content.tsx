"use client";

import { useState, useRef, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Download,
  Upload,
  Moon,
  Sun,
  Monitor,
  Timer,
  AlertTriangle,
  Check,
  Loader2,
  Settings,
  Database,
  HelpCircle,
  Scale,
  Target,
  Dumbbell,
  TrendingUp,
  Plus,
  LogOut,
} from "lucide-react";

import { BASE_ROUTINES } from "@/lib/base-routines";
import { useAuth } from "@/components/auth/auth-provider";
import { AdminUsersPanel } from "./admin-users-panel";

const DEFAULT_SETTINGS = {
  defaultRestSeconds: 150,
  theme: "dark" as const,
  bodyWeight: null as number | null,
  defaultUnit: "kg",
};

export function SettingsContent() {
  const { logout, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [loadBaseStatus, setLoadBaseStatus] = useState<string | null>(null);

  // Local state for height
  const [heightInput, setHeightInput] = useState<string>("");

  // Read-only query - NO writes allowed here
  const settings = useLiveQuery(() => db.userSettings.toCollection().first());

  // Sync height with settings
  useEffect(() => {
    if (settings?.height !== null && settings?.height !== undefined) {
      setHeightInput(String(settings.height));
    } else {
      setHeightInput("");
    }
  }, [settings?.height]);

  // Separate effect to seed default settings (write operation, outside liveQuery)
  useEffect(() => {
    setMounted(true);
    async function ensureSettings() {
      const count = await db.userSettings.count();
      if (count === 0) {
        await db.userSettings.add(DEFAULT_SETTINGS);
      }
    }
    ensureSettings();
  }, []);

  async function updateSetting(field: string, value: unknown) {
    if (!settings?.id) return;
    await db.userSettings.update(settings.id, { [field]: value });
  }

  async function handleHeightChange(value: string) {
    setHeightInput(value);
    if (value === "") {
      await updateSetting("height", null);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num) && num > 0) {
        await updateSetting("height", num);
      }
    }
  }

  async function handleExport() {
    try {
      const data = {
        version: 2,
        exportDate: new Date().toISOString(),
        routines: await db.routines.toArray(),
        workoutLogs: await db.workoutLogs.toArray(),
        personalRecords: await db.personalRecords.toArray(),
        goals: await db.goals.toArray(),
        userSettings: await db.userSettings.toArray(),
        bodyWeight: await db.bodyWeight.toArray(),
        weightGoals: await db.weightGoals.toArray(),
        customEquipment: await db.customEquipment.toArray(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cuti Traning-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus("Exportado correctamente");
      setTimeout(() => setExportStatus(null), 3000);
    } catch {
      setExportStatus("Error al exportar");
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !Array.isArray(data.routines)) {
        setImportStatus("Archivo no válido");
        return;
      }

      if (!confirm("Esto reemplazará todos los datos actuales. ¿Continuar?")) {
        return;
      }

      // Clear all tables including the ones added after v1 (bodyWeight,
      // weightGoals, customEquipment) so the restore is idempotent.
      await db.routines.clear();
      await db.workoutLogs.clear();
      await db.personalRecords.clear();
      await db.goals.clear();
      await db.userSettings.clear();
      await db.bodyWeight.clear();
      await db.weightGoals.clear();
      await db.customEquipment.clear();

      if (data.routines?.length) await db.routines.bulkAdd(data.routines);
      if (data.workoutLogs?.length)
        await db.workoutLogs.bulkAdd(data.workoutLogs);
      if (data.personalRecords?.length)
        await db.personalRecords.bulkAdd(data.personalRecords);
      if (data.goals?.length) await db.goals.bulkAdd(data.goals);
      if (data.userSettings?.length)
        await db.userSettings.bulkAdd(data.userSettings);
      // v2+ backups include body weight, weight goals and custom equipment.
      if (data.bodyWeight?.length) await db.bodyWeight.bulkAdd(data.bodyWeight);
      if (data.weightGoals?.length)
        await db.weightGoals.bulkAdd(data.weightGoals);
      if (data.customEquipment?.length)
        await db.customEquipment.bulkAdd(data.customEquipment);

      setImportStatus("Importado correctamente");
      setTimeout(() => setImportStatus(null), 3000);
    } catch {
      setImportStatus("Error al importar archivo");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleLoadBaseRoutines() {
    if (
      !confirm(
        "Esto agregará las 4 rutinas base (Lun, Mar, Jue, Vie). ¿Continuar?",
      )
    ) {
      return;
    }

    try {
      const routinesToAdd = BASE_ROUTINES.map((r) => ({
        ...r,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.routines.bulkAdd(routinesToAdd);
      setLoadBaseStatus("Rutinas base cargadas correctamente");
      setTimeout(() => setLoadBaseStatus(null), 3000);
    } catch {
      setLoadBaseStatus("Error al cargar rutinas base");
    }
  }

  async function handleClearData() {
    if (
      !confirm(
        "⚠️ ATENCIÓN: Esto eliminará TODOS los datos. Esta acción no se puede deshacer. ¿Continuar?",
      )
    )
      return;
    if (!confirm("¿Confirmar eliminación total de datos?")) return;

    // Clear all tables except users (preserve login credentials).
    // customEquipment es tabla nueva (Dexie v4) — incluirla para que el
    // "Eliminar todos los datos" sea realmente completo.
    await db.routines.clear();
    await db.workoutLogs.clear();
    await db.personalRecords.clear();
    await db.goals.clear();
    await db.userSettings.clear();
    await db.bodyWeight.clear();
    await db.weightGoals.clear();
    await db.customEquipment.clear();

    // Reload the page to reset the app state
    window.location.reload();
  }

  if (!mounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6 pb-10">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Ajustes</h1>

      {/* Theme */}
      <Card className="mb-5">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Apariencia
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="flex gap-2">
            {[
              { value: "light", icon: Sun, label: "Claro" },
              { value: "dark", icon: Moon, label: "Oscuro" },
              { value: "system", icon: Monitor, label: "Sistema" },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={theme === opt.value ? "default" : "outline"}
                className="flex-1 gap-2 h-11 rounded-lg"
                size="sm"
                onClick={() => setTheme(opt.value)}
              >
                <opt.icon className="h-4 w-4" />
                {opt.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Workout Defaults */}
      <Card className="mb-5">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-5 w-5 text-chart-2" />
            Entrenamiento
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 flex flex-col gap-5">
          <div>
            <Label
              htmlFor="default-rest"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Timer
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              Descanso por defecto
            </Label>
            <Select
              value={String(settings?.defaultRestSeconds ?? 150)}
              onValueChange={(value: string) =>
                updateSetting("defaultRestSeconds", parseInt(value))
              }
            >
              <SelectTrigger id="default-rest" className="mt-2 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">60 segundos (1 min)</SelectItem>
                <SelectItem value="90">90 segundos (1.5 min)</SelectItem>
                <SelectItem value="120">120 segundos (2 min)</SelectItem>
                <SelectItem value="150">150 segundos (2.5 min)</SelectItem>
                <SelectItem value="180">180 segundos (3 min)</SelectItem>
                <SelectItem value="240">240 segundos (4 min)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label
              htmlFor="default-unit"
              className="text-sm font-medium flex items-center gap-2"
            >
              Unidad de peso por defecto
            </Label>
            <Select
              value={settings?.defaultUnit ?? "kg"}
              onValueChange={(value: string) =>
                updateSetting("defaultUnit", value)
              }
            >
              <SelectTrigger id="default-unit" className="mt-2 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">Kilogramos (kg)</SelectItem>
                <SelectItem value="lb">Libras (lb)</SelectItem>
                <SelectItem value="otro">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label
              htmlFor="height"
              className="text-sm font-medium flex items-center gap-2"
            >
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Altura (cm)
            </Label>
            <Input
              id="height"
              type="text"
              inputMode="decimal"
              value={heightInput}
              onChange={(e) => handleHeightChange(e.target.value)}
              placeholder="Ej: 175"
              className="mt-2 h-11"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Se usa para calcular el IMC en Peso Corporal
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="mb-5">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5 text-chart-3" />
            Gestión de Datos
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 flex flex-col gap-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-12 rounded-lg border-border/60"
            onClick={handleExport}
          >
            <Download className="h-5 w-5 text-primary" />
            <div className="flex flex-col items-start">
              <span className="font-medium">Exportar datos</span>
              <span className="text-xs text-muted-foreground">
                Crear backup en JSON
              </span>
            </div>
          </Button>
          {exportStatus && (
            <p className="text-sm text-accent flex items-center gap-2 ml-1">
              <Check className="h-4 w-4" />
              {exportStatus}
            </p>
          )}

          <div>
            <Button
              variant="outline"
              className="w-full justify-start gap-3 h-12 rounded-lg border-border/60"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-5 w-5 text-chart-2" />
              <div className="flex flex-col items-start">
                <span className="font-medium">Importar respaldo</span>
                <span className="text-xs text-muted-foreground">
                  Restaurar desde JSON
                </span>
              </div>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              aria-label="Importar archivo de respaldo JSON"
              title="Importar archivo de respaldo JSON"
              tabIndex={-1}
              className="hidden"
              onChange={handleImport}
            />
          </div>
          {importStatus && (
            <p className="text-sm text-accent flex items-center gap-2 ml-1">
              <Check className="h-4 w-4" />
              {importStatus}
            </p>
          )}

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-12 rounded-lg border-border/60"
            onClick={handleLoadBaseRoutines}
          >
            <Plus className="h-5 w-5 text-chart-4" />
            <div className="flex flex-col items-start">
              <span className="font-medium">Cargar rutinas base</span>
              <span className="text-xs text-muted-foreground">
                4 rutinas predefinidas (Lun, Mar, Jue, Vie)
              </span>
            </div>
          </Button>
          {loadBaseStatus && (
            <p className="text-sm text-accent flex items-center gap-2 ml-1">
              <Check className="h-4 w-4" />
              {loadBaseStatus}
            </p>
          )}
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card className="mb-5">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Preguntas Frecuentes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="consistency">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-chart-3" />
                  ¿Qué es la consistencia?
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    La <strong>consistencia</strong> mide qué tan seguido
                    entrenas comparando con tus días asignados.
                  </p>
                  <p>
                    Ejemplo: Si tienes 3 rutinas asignadas (Lunes, Miércoles,
                    Viernes) y entrenas 2 veces en la semana, tu consistencia
                    será del 67% (2/3).
                  </p>
                  <p className="text-xs mt-2">
                    💡 <strong>Tip:</strong> Mantén una consistencia alta (70%)
                    para ver resultados!
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="1rm">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-chart-2" />
                  ¿Qué es 1RM estimado?
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    El <strong>1RM</strong> (Una Repetición Máxima) es el peso
                    máximo que podrías levantar en una sola repetición.
                  </p>
                  <p>
                    Se calcula usando fórmulas como Epley, Brzycki y Lombardi
                    basándose en tus series registradas.
                  </p>
                  <p className="text-xs mt-2">
                    💡 <strong>Nota:</strong> Es una estimación, tu real 1RM
                    puede variar ±5%.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="supersets">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  ¿Cómo funcionan las Súper Series?
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Las <strong>Súper Series (SS)</strong> son dos ejercicios
                    consecutivos que se hacen sin descanso entre ellos.
                  </p>
                  <p>Para crear una:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Agrega dos ejercicios a tu rutina</li>
                    <li>Presiona el botón de enlace (🔗) entre ellos</li>
                    <li>Se mostrarán marcados con "SS"</li>
                  </ol>
                  <p className="text-xs mt-2">
                    💡 <strong>Tip:</strong> Excelentes para músculos
                    antagonistas (ej: Pecho + Espalda).
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="offline">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-chart-4" />
                  ¿Mis datos están seguros?
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    <strong>Sí, 100%.</strong> Cuti Traning funciona
                    completamente offline.
                  </p>
                  <p>
                    Tus datos se guardan en tu navegador (IndexedDB), nunca se
                    envían a ningún servidor.
                  </p>
                  <p>
                    Usa la función de <strong>Exportar datos</strong>{" "}
                    regularmente para hacer backups.
                  </p>
                  <p className="text-xs mt-2">
                    💡 <strong>Nota:</strong> Si borras la caché del navegador,
                    perderás los datos. Exporta antes!
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="reps">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-accent" />
                  ¿Puedo poner rangos de repeticiones?
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    <strong>Sí!</strong> En el campo de repeticiones puedes
                    escribir:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>
                      <strong>10</strong> - Exactas 10 repeticiones
                    </li>
                    <li>
                      <strong>8-12</strong> - Entre 8 y 12 repeticiones
                    </li>
                    <li>
                      <strong>12-15</strong> - Rango de 12 a 15
                    </li>
                  </ul>
                  <p className="text-xs mt-2">
                    💡 <strong>Tip:</strong> Los rangos son ideales para
                    entrenamiento en volumen.
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="pr">
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-yellow-500" />
                  ¿Cómo se calculan los PRs?
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Los <strong>Récords Personales (PRs)</strong> se detectan
                    automáticamente:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>
                      <strong>Mayor Peso:</strong> El peso más alto en una serie
                    </li>
                    <li>
                      <strong>Mayor Reps:</strong> Más repeticiones con el mismo
                      peso
                    </li>
                  </ul>
                  <p className="text-xs mt-2">
                    🏆 ¡Los PRs se muestran en el Dashboard!
                  </p>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Admin Panel — only visible to admin */}
      {isAdmin && <AdminUsersPanel />}

      {/* Danger Zone */}
      <Card className="mb-5 border-destructive/30 bg-destructive/5">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Zona de Peligro
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-3">
          <p className="text-sm text-muted-foreground">
            Eliminar todos los datos es irreversible. Asegúrate de tener un
            backup.
          </p>
          <Button
            variant="destructive"
            className="w-full h-12 rounded-lg font-medium"
            onClick={handleClearData}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Eliminar todos los datos
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 rounded-lg font-medium border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={logout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </Button>
        </CardContent>
      </Card>

      {/* PWA Installation */}
      <Card className="mb-5 bg-primary/5 border-primary/20">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            Instalar como App
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                1
              </div>
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  En Chrome/Edge (Android/PC)
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  Busca el icono de 📱 o ⬇️ en la barra de direcciones y
                  selecciona "Instalar Cuti Traning"
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                2
              </div>
              <div className="text-sm">
                <p className="font-medium text-foreground">En iOS (Safari)</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Toca el botón Compartir (⬜) en Safari y selecciona "Añadir a
                  pantalla de inicio"
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                3
              </div>
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  Beneficios de la App
                </p>
                <ul className="text-muted-foreground text-xs mt-1 space-y-1 list-disc list-inside">
                  <li>Acceso rápido desde tu pantalla de inicio</li>
                  <li>Funciona 100% offline</li>
                  <li>Diseño inmersivo sin barra del navegador</li>
                  <li>Notificaciones de recordatorio</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* App Info */}
      <div className="text-center pt-4">
        <p className="text-sm font-semibold text-foreground">Cuti Traning</p>
        <p className="text-xs text-muted-foreground mt-1">Versión 0.3.0</p>
        <p className="text-xs text-muted-foreground mt-1">
          100% Offline • Tus datos en tu dispositivo
        </p>
      </div>
    </div>
  );
}

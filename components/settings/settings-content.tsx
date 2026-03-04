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
  Weight,
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
  Music2,
  Music,
  Link,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";

import { BASE_ROUTINES } from "@/lib/base-routines";

const DEFAULT_SETTINGS = {
  defaultRestSeconds: 150,
  theme: "dark" as const,
  bodyWeight: null as number | null,
  defaultUnit: "kg",
  musicService: null as "spotify" | null,
  musicEmbedUrl: "",
  showMusicWidget: false,
};

export function SettingsContent() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [loadBaseStatus, setLoadBaseStatus] = useState<string | null>(null);

  // Local state for body weight to allow empty values
  const [bodyWeightInput, setBodyWeightInput] = useState<string>("");

  // Read-only query - NO writes allowed here
  const settings = useLiveQuery(() => db.userSettings.toCollection().first());

  // Sync body weight input with settings
  useEffect(() => {
    if (settings?.bodyWeight !== null && settings?.bodyWeight !== undefined) {
      setBodyWeightInput(String(settings.bodyWeight));
    } else {
      setBodyWeightInput("");
    }
  }, [settings?.bodyWeight]);

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

  async function handleBodyWeightChange(value: string) {
    setBodyWeightInput(value);
    // Only save to DB if there's a valid number
    if (value === "") {
      await updateSetting("bodyWeight", null);
    } else {
      const num = parseFloat(value);
      if (!isNaN(num)) {
        await updateSetting("bodyWeight", num);
      }
    }
  }

  async function handleExport() {
    try {
      const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        routines: await db.routines.toArray(),
        workoutLogs: await db.workoutLogs.toArray(),
        personalRecords: await db.personalRecords.toArray(),
        goals: await db.goals.toArray(),
        userSettings: await db.userSettings.toArray(),
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

      if (!data.version || !data.routines) {
        setImportStatus("Archivo no válido");
        return;
      }

      if (!confirm("Esto reemplazará todos los datos actuales. ¿Continuar?")) {
        return;
      }

      await db.routines.clear();
      await db.workoutLogs.clear();
      await db.personalRecords.clear();
      await db.goals.clear();
      await db.userSettings.clear();

      if (data.routines?.length) await db.routines.bulkAdd(data.routines);
      if (data.workoutLogs?.length)
        await db.workoutLogs.bulkAdd(data.workoutLogs);
      if (data.personalRecords?.length)
        await db.personalRecords.bulkAdd(data.personalRecords);
      if (data.goals?.length) await db.goals.bulkAdd(data.goals);
      if (data.userSettings?.length)
        await db.userSettings.bulkAdd(data.userSettings);

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

    // Clear ALL tables in the database
    await db.routines.clear();
    await db.workoutLogs.clear();
    await db.personalRecords.clear();
    await db.goals.clear();
    await db.userSettings.clear();
    await db.bodyWeight.clear();
    await db.weightGoals.clear();

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
              htmlFor="body-weight"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Weight className="h-4 w-4 text-muted-foreground" />
              Peso corporal (kg)
            </Label>
            <Input
              id="body-weight"
              type="text"
              inputMode="decimal"
              value={bodyWeightInput}
              onChange={(e) => handleBodyWeightChange(e.target.value)}
              placeholder="Opcional"
              className="mt-2 h-11"
            />
          </div>
        </CardContent>
      </Card>

      {/* Music Widget */}
      <Card className="mb-5">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Music2 className="h-5 w-5 text-chart-4" />
            Música en Entrenamiento
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0 flex flex-col gap-5">
          <div>
            <Label
              htmlFor="music-service"
              className="text-sm font-medium flex items-center gap-2"
            >
              <Music
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              Servicio de música
            </Label>
            <Select
              value={settings?.musicService || "none"}
              onValueChange={(value: string) =>
                updateSetting("musicService", value === "none" ? null : value)
              }
            >
              <SelectTrigger id="music-service" className="mt-2 h-11">
                <SelectValue placeholder="Selecciona un servicio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Desactivado</SelectItem>
                <SelectItem value="spotify">
                  <div className="flex items-center gap-2">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                    </svg>
                    Spotify
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {settings?.musicService && (
            <>
              <div>
                <Label
                  htmlFor="music-url"
                  className="text-sm font-medium flex items-center gap-2"
                >
                  <Link
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  URL de Playlist Spotify
                </Label>
                <Input
                  id="music-url"
                  placeholder="https://open.spotify.com/playlist/..."
                  value={settings?.musicEmbedUrl || ""}
                  onChange={(e) =>
                    updateSetting("musicEmbedUrl", e.target.value)
                  }
                  className="mt-2 h-11"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  Copia la URL de tu playlist, álbum o canción en Spotify
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="show-widget" className="text-sm font-medium">
                    Mostrar widget
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Widget flotante durante el entrenamiento
                  </p>
                </div>
                <Switch
                  id="show-widget"
                  checked={settings?.showMusicWidget || false}
                  onCheckedChange={(checked) =>
                    updateSetting("showMusicWidget", checked)
                  }
                />
              </div>

              {settings?.showMusicWidget && settings?.musicEmbedUrl && (
                <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <p className="text-xs text-primary font-medium">
                    ✅ Widget activado
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    El widget de música aparecerá en la pantalla de
                    entrenamiento
                  </p>
                </div>
              )}
            </>
          )}
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

      {/* Danger Zone */}
      <Card className="mb-5 border-destructive/30 bg-destructive/5">
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Zona de Peligro
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <p className="text-sm text-muted-foreground mb-4">
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
                  selecciona "Instalar Juan Traning"
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
        <p className="text-sm font-semibold text-foreground">Juan Traning</p>
        <p className="text-xs text-muted-foreground mt-1">Versión 0.3.0</p>
        <p className="text-xs text-muted-foreground mt-1">
          100% Offline • Tus datos en tu dispositivo
        </p>
      </div>
    </div>
  );
}

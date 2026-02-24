"use client"

import { useState, useRef, useEffect } from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useTheme } from "next-themes"
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
} from "lucide-react"

const DEFAULT_SETTINGS = {
  defaultRestSeconds: 150,
  theme: "dark" as const,
  bodyWeight: null as number | null,
}

export function SettingsContent() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportStatus, setExportStatus] = useState<string | null>(null)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  // Read-only query - NO writes allowed here
  const settings = useLiveQuery(() => db.userSettings.toCollection().first())

  // Separate effect to seed default settings (write operation, outside liveQuery)
  useEffect(() => {
    setMounted(true)
    async function ensureSettings() {
      const count = await db.userSettings.count()
      if (count === 0) {
        await db.userSettings.add(DEFAULT_SETTINGS)
      }
    }
    ensureSettings()
  }, [])

  async function updateSetting(field: string, value: unknown) {
    if (!settings?.id) return
    await db.userSettings.update(settings.id, { [field]: value })
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
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Juan Traning-backup-${new Date().toISOString().split("T")[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportStatus("Exportado correctamente")
      setTimeout(() => setExportStatus(null), 3000)
    } catch {
      setExportStatus("Error al exportar")
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)

      if (!data.version || !data.routines) {
        setImportStatus("Archivo no valido")
        return
      }

      if (
        !confirm("Esto reemplazara todos los datos actuales. Continuar?")
      ) {
        return
      }

      await db.routines.clear()
      await db.workoutLogs.clear()
      await db.personalRecords.clear()
      await db.goals.clear()
      await db.userSettings.clear()

      if (data.routines?.length) await db.routines.bulkAdd(data.routines)
      if (data.workoutLogs?.length)
        await db.workoutLogs.bulkAdd(data.workoutLogs)
      if (data.personalRecords?.length)
        await db.personalRecords.bulkAdd(data.personalRecords)
      if (data.goals?.length) await db.goals.bulkAdd(data.goals)
      if (data.userSettings?.length)
        await db.userSettings.bulkAdd(data.userSettings)

      setImportStatus("Importado correctamente")
      setTimeout(() => setImportStatus(null), 3000)
    } catch {
      setImportStatus("Error al importar archivo")
    }

    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleClearData() {
    if (
      !confirm(
        "ATENCION: Esto eliminara todos los datos. Esta accion no se puede deshacer. Continuar?"
      )
    )
      return
    if (!confirm("Confirmar eliminacion total de datos?")) return

    await db.routines.clear()
    await db.workoutLogs.clear()
    await db.personalRecords.clear()
    await db.goals.clear()
    await db.userSettings.clear()
  }

  if (!mounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Ajustes</h1>

      {/* Theme */}
      <Card className="mb-4">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Apariencia</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="flex gap-2">
            {[
              { value: "light", icon: Sun, label: "Claro" },
              { value: "dark", icon: Moon, label: "Oscuro" },
              { value: "system", icon: Monitor, label: "Sistema" },
            ].map((opt) => (
              <Button
                key={opt.value}
                variant={theme === opt.value ? "default" : "outline"}
                className="flex-1 gap-1.5"
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
      <Card className="mb-4">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Entrenamiento</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 flex flex-col gap-4">
          <div>
            <Label className="flex items-center gap-2 text-sm">
              <Timer className="h-4 w-4 text-muted-foreground" />
              Descanso por defecto (segundos)
            </Label>
            <Input
              type="number"
              min={30}
              step={15}
              value={settings?.defaultRestSeconds ?? 150}
              onChange={(e) =>
                updateSetting(
                  "defaultRestSeconds",
                  parseInt(e.target.value) || 150
                )
              }
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="flex items-center gap-2 text-sm">
              <Weight className="h-4 w-4 text-muted-foreground" />
              Peso corporal (kg)
            </Label>
            <Input
              type="number"
              min={0}
              step={0.1}
              value={settings?.bodyWeight ?? ""}
              onChange={(e) =>
                updateSetting(
                  "bodyWeight",
                  e.target.value ? parseFloat(e.target.value) : null
                )
              }
              placeholder="Opcional"
              className="mt-1.5"
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="mb-4">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm">Datos</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2 flex flex-col gap-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" />
            Exportar datos (JSON)
          </Button>
          {exportStatus && (
            <p className="text-xs text-accent flex items-center gap-1">
              <Check className="h-3 w-3" />
              {exportStatus}
            </p>
          )}

          <div>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Importar respaldo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </div>
          {importStatus && (
            <p className="text-xs text-accent flex items-center gap-1">
              <Check className="h-3 w-3" />
              {importStatus}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="mb-8 border-destructive/30">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Zona de peligro
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <Button
            variant="destructive"
            className="w-full"
            onClick={handleClearData}
          >
            Eliminar todos los datos
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

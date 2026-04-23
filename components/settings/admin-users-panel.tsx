"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield, Plus, Pencil, Trash2, Loader2, Eye, EyeOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminHeaders } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface RemoteUser {
  id: number;
  email: string;
  active: boolean;
  role: string;
}

type DialogMode = "create" | "edit";
interface UserForm { email: string; password: string; active: boolean; role: string; }
const EMPTY_FORM: UserForm = { email: "", password: "", active: true, role: "user" };

export function AdminUsersPanel() {
  const [users, setUsers] = useState<RemoteUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("create");
  const [editingUser, setEditingUser] = useState<RemoteUser | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: adminHeaders() });
      if (!res.ok) throw new Error("Error al cargar usuarios.");
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error de conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  function openCreate() {
    setForm(EMPTY_FORM); setFormError(null); setShowPassword(false);
    setDialogMode("create"); setEditingUser(null); setDialogOpen(true);
  }

  function openEdit(user: RemoteUser) {
    setForm({ email: user.email, password: "", active: user.active, role: user.role });
    setFormError(null); setShowPassword(false);
    setDialogMode("edit"); setEditingUser(user); setDialogOpen(true);
  }

  async function handleSave() {
    setFormError(null);
    if (!form.email) { setFormError("El correo es obligatorio."); return; }
    if (dialogMode === "create" && !form.password) { setFormError("La contraseña es obligatoria."); return; }
    setSaving(true);
    try {
      let res: Response;
      if (dialogMode === "create") {
        res = await fetch("/api/admin/users", {
          method: "POST", headers: adminHeaders(),
          body: JSON.stringify({ email: form.email, password: form.password, active: form.active, role: form.role }),
        });
      } else {
        const body: Record<string, unknown> = { email: form.email, active: form.active, role: form.role };
        if (form.password) body.password = form.password;
        res = await fetch(`/api/admin/users/${editingUser!.id}`, {
          method: "PATCH", headers: adminHeaders(), body: JSON.stringify(body),
        });
      }
      if (!res.ok) { const d = await res.json(); setFormError(d.error ?? "Error."); return; }
      setDialogOpen(false);
      await fetchUsers();
    } catch { setFormError("Error de conexión."); }
    finally { setSaving(false); }
  }

  async function handleDelete(user: RemoteUser) {
    if (!confirm(`¿Eliminar "${user.email}"?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders() });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error("No se pudo eliminar", {
          description: d.error ?? "Intenta de nuevo.",
        });
        return;
      }
      await fetchUsers();
    } catch {
      toast.error("Error de conexión al eliminar.");
    }
  }

  async function toggleActive(user: RemoteUser) {
    await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH", headers: adminHeaders(),
      body: JSON.stringify({ active: !user.active }),
    });
    await fetchUsers();
  }

  return (
    <>
      <Card className="mb-5">
        <CardHeader className="p-5 pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              Usuarios
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openCreate}>
              <Plus className="h-3 w-3" /> Nuevo
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {users.map((user) => (
                <div key={user.id} className="flex items-center gap-2 py-2 border-b border-border/40 last:border-0">
                  {/* Active dot */}
                  <button onClick={() => toggleActive(user)} title={user.active ? "Activo" : "Inactivo"}>
                    <span className={cn("block h-2 w-2 rounded-full", user.active ? "bg-green-500" : "bg-red-400")} />
                  </button>

                  <span className="flex-1 text-sm truncate">{user.email}</span>

                  {user.role === "admin" && (
                    <span className="text-xs text-primary/70 shrink-0">admin</span>
                  )}

                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(user)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive/70 hover:text-destructive" onClick={() => handleDelete(user)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Nuevo usuario" : "Editar usuario"}</DialogTitle>
            <DialogDescription className="sr-only">Gestión de usuario</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="u-email">Correo</Label>
              <Input id="u-email" type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-pass">
                Contraseña
                {dialogMode === "edit" && <span className="text-muted-foreground text-xs ml-1">(vacío = no cambiar)</span>}
              </Label>
              <div className="relative">
                <Input id="u-pass" type={showPassword ? "text" : "password"} value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="pr-9" />
                <button type="button" tabIndex={-1} onClick={() => setShowPassword((v) => !v)} aria-label="Mostrar/ocultar contraseña"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Suscripción</Label>
                <Select value={form.active ? "true" : "false"}
                  onValueChange={(v) => setForm((f) => ({ ...f, active: v === "true" }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Activa</SelectItem>
                    <SelectItem value="false">Inactiva</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : dialogMode === "create" ? "Crear" : "Guardar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { sql } from "@/lib/neon";
import { verifyAdmin, unauthorized } from "../../_verify";

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** PATCH /api/admin/users/[id] — update user fields */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin(req))) return unauthorized();

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  const body = await req.json();
  const { email, password, active, role } = body;

  // Build dynamic update
  const updates: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (email !== undefined) {
    updates.push(`email = $${i++}`);
    values.push(email.trim().toLowerCase());
  }
  if (password !== undefined && password !== "") {
    updates.push(`password_hash = $${i++}`);
    values.push(sha256(password));
  }
  if (active !== undefined) {
    updates.push(`active = $${i++}`);
    values.push(active);
  }
  if (role !== undefined) {
    updates.push(`role = $${i++}`);
    values.push(role);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  // Guard: prevent demoting the last admin or deactivating them — either
  // would leave the system without any admin able to manage users or edit
  // base routines. Only runs when the patch would change role or active.
  const demotesAdmin = role !== undefined && role !== "admin";
  const deactivates = active === false;
  if (demotesAdmin || deactivates) {
    const targetRows = (await sql`
      SELECT role, active FROM users WHERE id = ${userId} LIMIT 1
    `) as { role: string; active: boolean }[];
    if (targetRows.length === 0) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }
    const target = targetRows[0];
    if (target.role === "admin" && target.active) {
      const countRows = (await sql`
        SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND active = true
      `) as { n: number }[];
      const activeAdmins = countRows[0]?.n ?? 0;
      if (activeAdmins <= 1) {
        return NextResponse.json(
          {
            error:
              "No se puede dejar al sistema sin admins activos. Promueve o activa a otro admin primero.",
          },
          { status: 400 }
        );
      }
    }
  }

  values.push(userId);
  const query = `UPDATE users SET ${updates.join(", ")} WHERE id = $${i} RETURNING id, email, active, role, created_at`;

  try {
    // Neon supports both tagged-template and function-style calls but the
    // types only model the tagged variant. Cast to the function signature
    // we're actually using; the runtime behavior is documented.
    const sqlFn = sql as unknown as (
      query: string,
      params: unknown[],
    ) => Promise<Record<string, unknown>[]>;
    const rows = await sqlFn(query, values);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
    }
    return NextResponse.json({ user: rows[0] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return NextResponse.json(
        { error: "Ya existe un usuario con ese correo." },
        { status: 409 }
      );
    }
    console.error("[PATCH /api/admin/users/:id]", err);
    return NextResponse.json({ error: "Error del servidor." }, { status: 500 });
  }
}

/** DELETE /api/admin/users/[id] — delete a user */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await verifyAdmin(req))) return unauthorized();

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  }

  // Prevent admin from deleting their own account
  const adminEmail = req.headers.get("x-admin-email") ?? "";
  const self = await sql`SELECT id FROM users WHERE email = ${adminEmail} LIMIT 1`;
  if (self.length > 0 && self[0].id === userId) {
    return NextResponse.json(
      { error: "No puedes eliminar tu propia cuenta." },
      { status: 400 }
    );
  }

  // Prevent removing the last admin — the system needs at least one to
  // edit base routines and manage users. Only checks when the target is
  // actually an admin; regular users can be deleted freely.
  const targetRows = await sql`
    SELECT role FROM users WHERE id = ${userId} LIMIT 1
  `;
  if (targetRows.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }
  if (targetRows[0].role === "admin") {
    const countRows = (await sql`
      SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin' AND active = true
    `) as { n: number }[];
    const activeAdmins = countRows[0]?.n ?? 0;
    if (activeAdmins <= 1) {
      return NextResponse.json(
        { error: "No se puede eliminar el último admin activo del sistema." },
        { status: 400 }
      );
    }
  }

  const rows = await sql`
    DELETE FROM users WHERE id = ${userId} RETURNING id
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

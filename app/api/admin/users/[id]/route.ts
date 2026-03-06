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

  values.push(userId);
  const query = `UPDATE users SET ${updates.join(", ")} WHERE id = $${i} RETURNING id, email, active, role, created_at`;

  try {
    const rows = await sql(query, values);
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

  const rows = await sql`
    DELETE FROM users WHERE id = ${userId} RETURNING id
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { query } from "./db";
import { can } from "./format";

const COOKIE = "tba_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

const mac = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export async function createSession(admin) {
  const payload = Buffer.from(
    JSON.stringify({ id: admin.id, email: admin.email, name: admin.name, exp: Date.now() + MAX_AGE * 1000 })
  ).toString("base64url");
  (await cookies()).set(COOKIE, `${payload}.${mac(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in admin, or null. */
export async function getAdmin() {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = mac(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp <= Date.now()) return null;
    // the cookie only proves who it is; role, permissions and "still active" come fresh from the database
    const account = await loadAccount(data.id);
    return account?.is_active ? account : null;
  } catch {
    return null;
  }
}

const loadAccount = cache(async (id) => {
  const [row] = await query("SELECT id, email, name, role, permissions, is_active FROM admins WHERE id = $1", [id]);
  return row || null;
});

/** Use at the top of every admin page and admin server action. */
export async function requireAdmin() {
  const admin = await getAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** Signed in AND allowed to do this task (see PERMISSIONS in lib/format.js). Others are sent to the dashboard. */
export async function requirePerm(permission) {
  const admin = await requireAdmin();
  if (!can(admin, permission)) redirect("/admin?denied=" + permission);
  return admin;
}

import crypto from "node:crypto";
import { promisify } from "node:util";

/*
  Passwords are stored as "salt:scrypt-hash". scrypt is slow on purpose (it makes guessing passwords expensive),
  so the website uses the async versions: they run on a background thread and never freeze the server for
  other visitors while a password is checked. Scripts (seed, reset-admin) can use the simple sync versions.
  Both produce and accept exactly the same format.
*/
const scrypt = promisify(crypto.scrypt);

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

/** Same as hashPassword, without blocking the server. */
export async function hashPasswordAsync(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return `${salt}:${hash}`;
}

/** Same as verifyPassword, without blocking the server. */
export async function verifyPasswordAsync(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const test = await scrypt(password, salt, 64);
  const known = Buffer.from(hash, "hex");
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

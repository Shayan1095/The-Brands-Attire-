// Rescue for the admin login, for the database in DATABASE_URL (the live one when .env.local points at it).
// Normally you change your password in the admin: your name at the bottom of the menu -> My account.
// Use this only when you cannot sign in at all.
//
//   node scripts/reset-admin.mjs --email=you@example.com           check only: lists the admin accounts (emails partly
//                                                                    hidden) and whether logins are locked. Changes nothing.
//   node scripts/reset-admin.mjs --email=you@example.com --reset   asks for a new password (typed hidden, twice), sets it
//                                                                    on that account (creates it as an owner if missing),
//                                                                    switches it on and clears the login lockout.
//
// Without --email it uses ADMIN_EMAIL from .env.local. Add --from-env to use ADMIN_PASSWORD from .env.local
// instead of typing one. Passwords are never printed.
import fs from "node:fs";
import pg from "pg";
import { hashPassword, verifyPassword } from "../db/password.mjs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const arg = process.argv.find((a) => a.startsWith("--email="));
const email = String(arg ? arg.slice(8) : process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const reset = process.argv.includes("--reset");
const fromEnv = process.argv.includes("--from-env");
const hide = (e) => String(e).replace(/^(.{2}).*(@.*)$/, "$1***$2");

/** Reads a line from the keyboard without showing what is typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let value = "";
    if (!stdin.isTTY) { // piped input
      stdin.once("data", (d) => resolve(String(d).replace(/\r?\n$/, "")));
      return;
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0003") { process.stdout.write("\n"); process.exit(1); }
      else if (ch === "\u0008" || ch === "\u007f") { if (value) { value = value.slice(0, -1); process.stdout.write("\b \b"); } }
      else { value += ch; process.stdout.write("*".repeat(ch.length)); }
    };
    stdin.on("data", onData);
  });
}

if (!url) { console.log("DATABASE_URL is not set, so there is no live database to use."); process.exit(1); }
if (!email) { console.log('Say which account: node scripts/reset-admin.mjs --email=you@example.com'); process.exit(1); }

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const admins = (await pool.query("SELECT id, email, role, is_active, password_hash FROM admins ORDER BY id")).rows;
  console.log(`Admin accounts: ${admins.length}`);
  for (const a of admins) console.log(`  #${a.id} ${hide(a.email)} · ${a.role} · ${a.is_active ? "active" : "SWITCHED OFF"}${a.email === email ? "  <- this one" : ""}`);
  const me = admins.find((a) => a.email === email);
  if (!me) console.log(`\nNo account uses ${hide(email)}.${reset ? " It will be created as an owner." : ""}`);
  else if (!reset && process.env.ADMIN_PASSWORD) console.log(`\nADMIN_PASSWORD in .env.local ${verifyPassword(process.env.ADMIN_PASSWORD, me.password_hash) ? "matches" : "does not match"} this account's password (it does not need to: only the panel's password counts).`);

  const [lock] = (await pool.query("SELECT COALESCE(sum(n), 0)::int AS n FROM rate_limits WHERE key = $1 AND created_at > now() - interval '15 minutes'", [`login:${email}`])).rows;
  console.log(`Sign-in tries in the last 15 minutes: ${lock.n}${lock.n >= 8 ? " (LOCKED for now)" : ""}`);

  if (!reset) {
    console.log("\nNothing was changed. Add --reset to set a new password and clear the lockout.");
  } else {
    let password;
    if (fromEnv) {
      password = String(process.env.ADMIN_PASSWORD || "");
      if (!password) { console.log("ADMIN_PASSWORD is not set in .env.local."); process.exit(1); }
    } else {
      password = await askHidden("New password: ");
      const again = await askHidden("Same password again: ");
      if (password !== again) { console.log("The two passwords are not the same. Nothing was changed."); process.exit(1); }
    }
    if (password.length < 8) { console.log("Use at least 8 characters. Nothing was changed."); process.exit(1); }
    const hash = hashPassword(password);
    if (me) await pool.query("UPDATE admins SET password_hash = $2, is_active = true WHERE id = $1", [me.id, hash]);
    else await pool.query("INSERT INTO admins (email, name, password_hash, role, is_active) VALUES ($1, 'Owner', $2, 'owner', true)", [email, hash]);
    await pool.query("DELETE FROM rate_limits WHERE key LIKE 'login%'");
    console.log(`\nDone: ${hide(email)} can sign in with the new password. Login lockouts were cleared.`);
  }
} finally {
  await pool.end();
}

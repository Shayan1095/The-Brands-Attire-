// `npm run dev:local` - a safe local copy of the shop.
// Uses the embedded database in ./.data instead of DATABASE_URL and sends no real email or WhatsApp,
// so test orders never reach the live store or real customers, even when .env.local holds production values.
import { spawn } from "node:child_process";

const child = spawn("npx next dev", { stdio: "inherit", shell: true, env: { ...process.env, LOCAL_DB: "1" } });
child.on("exit", (code) => process.exit(code ?? 0));

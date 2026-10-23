// `npm run preview:local` - the shop exactly as it runs live (production build), but on the local
// embedded database with no real email or WhatsApp, on http://localhost:3005.
// Use this to judge speed: `npm run dev` / `dev:local` are development builds and several times slower.
// Never use plain `npm run build` for this: it migrates the production database in .env.local first.
import { spawnSync, spawn } from "node:child_process";

// own build folder (.next-preview): safe to run while a dev server is up
const env = { ...process.env, LOCAL_DB: "1", NEXT_DIST_DIR: ".next-preview" };
const build = spawnSync("npx next build", { stdio: "inherit", shell: true, env });
if (build.status !== 0) process.exit(build.status ?? 1);
const server = spawn("npx next start -p 3005", { stdio: "inherit", shell: true, env });
server.on("exit", (code) => process.exit(code ?? 0));

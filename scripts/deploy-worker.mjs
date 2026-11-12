// Nasadí Worker a označí verzi na Cloudflare číslem z package.json (v přehledu verzí je vidět „v1.0.1“ místo náhodného id).
import { spawnSync } from "child_process";
import fs from "fs";
const { version } = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const r = spawnSync("npx", ["wrangler", "deploy", "--tag", `v${version}`, "--message", version], { stdio: "inherit", shell: true });
process.exit(r.status ?? 1);

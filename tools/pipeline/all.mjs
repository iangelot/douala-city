import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS } from "./config.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ids = process.argv.includes("--compile-only")
  ? Object.keys(AREAS)
  : Object.keys(AREAS);

function run(script, area) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, "tools/pipeline", script), `--area=${area}`], {
      stdio: "inherit",
      cwd: root,
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} ${area} ${code}`))));
  });
}

for (const id of ids) {
  if (!process.argv.includes("--compile-only")) {
    console.log("\n=== fetch", id, "===");
    await run("fetch.mjs", id);
  }
  console.log("=== compile", id, "===");
  await run("compile.mjs", id);
}

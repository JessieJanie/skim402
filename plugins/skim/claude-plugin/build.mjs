// Maintainer-only check: production launches the committed readable source directly.
// There is deliberately no bundler or compiler that can recreate an opaque bundle.
import { readFile, writeFile } from "node:fs/promises";
import { checkPlugin } from "./check.mjs";

await checkPlugin();
const root = new URL("../", import.meta.url);
for (const [source, target] of [[".claude-plugin/plugin.json", "plugin.json"], [".mcp.json", "mcp.json"]]) {
  await writeFile(new URL(target, root), await readFile(new URL(source, root)));
}
console.log("Plugin source checked; legacy metadata synchronized. No runtime code generated.");

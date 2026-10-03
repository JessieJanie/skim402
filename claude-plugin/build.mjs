// Maintainer-only build. Never executed when installing or starting the plugin.
// In the Replit workspace use the existing, lockfile-pinned dependencies.
import { createRequire } from "node:module";
import { readFile, writeFile, readdir, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = resolve(here, "../../..");
const localRequire = createRequire(import.meta.url);
let require = localRequire;
let modules = resolve(here, "node_modules");
try {
  localRequire.resolve("esbuild");
  localRequire.resolve("@modelcontextprotocol/sdk/server/mcp.js");
} catch {
  // Monorepo source workspace: use its existing lockfile-resolved packages.
  require = createRequire(resolve(workspace, "artifacts/api-server/package.json"));
  modules = resolve(workspace, "lib/skim-mcp/node_modules");
}
const { build } = require("esbuild");
const entry = await readFile(resolve(here, "src/index.ts"), "utf8");
// CJS permits a self-contained SDK bundle without ESM dynamic-require shims.
// Main is invoked explicitly; it never starts jobs or makes startup requests.
const input = entry.replace(/^#!.*\n/, "").replace(
  "await server.connect(transport);",
  "server.connect(transport).catch(() => { process.stderr.write('MCP startup failed.\\n'); process.exitCode = 1; });",
);
const result = await build({
  stdin: { contents: input, resolveDir: here, sourcefile: "src/index.ts", loader: "ts" },
  nodePaths: [modules],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: resolve(here, "server.cjs"),
  minify: false,
  legalComments: "eof",
  metafile: true,
});
await writeFile(resolve(here, "build-inputs.json"), JSON.stringify({
  esbuild: require("esbuild/package.json").version,
  sdk: JSON.parse(await readFile(resolve(modules, "@modelcontextprotocol/sdk/package.json"), "utf8")).version,
  zod: JSON.parse(await readFile(resolve(modules, "zod/package.json"), "utf8")).version,
  inputs: Object.keys(result.metafile.inputs).map(p => p.replace(/^.*node_modules\//, "node_modules/")),
}, null, 2) + "\n");

// Preserve the licenses of every package actually included in the bundle.
const packages = new Map();
for (const name of Object.keys(result.metafile.inputs)) {
  if (!name.includes("node_modules/")) continue;
  let directory = dirname(await realpath(resolve(name)));
  while (directory !== dirname(directory)) {
    try {
      const pkg = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
      if (pkg.name) {
        packages.set(directory, pkg);
        break;
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    directory = dirname(directory);
  }
}
const notices = [];
for (const [directory, pkg] of [...packages].sort((a,b) => a[1].name.localeCompare(b[1].name))) {
  const names = (await readdir(directory)).filter(name => /^(license|licence|notice)(\.|$)/i.test(name));
  if (!names.length) throw new Error(`Missing license for ${pkg.name}`);
  notices.push(`${pkg.name}@${pkg.version} (${pkg.license})\n` +
    (await Promise.all(names.map(name => readFile(resolve(directory, name), "utf8")))).join("\n"));
}
await writeFile(resolve(here, "THIRD-PARTY-NOTICES.txt"), notices.join("\n\n--------------------\n\n"));
// The directory submission originally read the legacy root metadata.
// Keep both formats identical so the submitted folder need not change.
await writeFile(resolve(here, "../plugin.json"), await readFile(resolve(here, "../.claude-plugin/plugin.json")));
await writeFile(resolve(here, "../mcp.json"), await readFile(resolve(here, "../.mcp.json")));
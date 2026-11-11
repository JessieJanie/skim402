// Maintainer-only directory regression checks. This file is not launched by MCP.
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
export async function checkPlugin(root = defaultRoot) {
  const parse = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
  const manifest = await parse(".claude-plugin/plugin.json");
  const config = await parse(".mcp.json");
  const allowed = new Set([
    "name", "displayName", "version", "description", "author", "homepage",
    "repository", "license", "icon", "userConfig",
  ]);
  for (const key of Object.keys(manifest)) assert(allowed.has(key), `Unexpected manifest field: ${key}`);
  assert.equal(manifest.name, "skim");
  assert.equal(manifest.version, "1.0.1");
  assert.equal(manifest.userConfig.skim_api_key.sensitive, true);
  assert.equal(manifest.userConfig.skim_api_key.required, true);
  assert.deepEqual(config, { mcpServers: { skim: {
    type: "stdio", command: "node",
    args: ["${CLAUDE_PLUGIN_ROOT}/claude-plugin/src/server.mjs"],
    env: { SKIM_PLUGIN_CONFIGURED_API_KEY: "${user_config.skim_api_key}" },
  } } });
  assert(manifest.icon.startsWith("./") && !manifest.icon.includes(".."), "Icon must be inside the plugin.");
  assert((await stat(join(root, manifest.icon))).isFile(), "Icon is missing.");
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert(readme.replace(/```[\s\S]*?```/g, "").trim().split(/\s+/).length >= 40, "README must have 40 words.");
  // Even documentation must not forward an existing machine credential.
  for (const name of ["README.md", "CLAUDE-PLUGIN.md"]) {
    const doc = await readFile(join(root, name), "utf8");
    assert(!/\$(?:\{)?(?:SKIM_API_KEY|SKIM_WALLET_PRIVATE_KEY|GITHUB_TOKEN)\b/.test(doc),
      `${name} references an inherited credential.`);
    assert(!/process\.env\.(?:SKIM_API_KEY|SKIM_WALLET_PRIVATE_KEY|GITHUB_TOKEN)\b/.test(doc),
      `${name} reads an inherited credential.`);
  }
  const entry = resolve(root, "claude-plugin/src/server.mjs");
  const visited = new Set();
  async function follow(file) {
    if (visited.has(file)) return;
    visited.add(file);
    assert(!relative(root, file).startsWith(".."), "Runtime import leaves the plugin.");
    const source = await readFile(file, "utf8");
    assert(!/child_process|readFile|writeFile|eval\s*\(|import\s*\(/.test(source),
      "Runtime must not execute other programs, read files, or load dynamic code.");
    const reads = [...source.matchAll(/process\.env(?:\.([A-Z_]+)|\[)/g)].map((m) => m[1]);
    assert.deepEqual(reads, file === entry ? ["SKIM_PLUGIN_CONFIGURED_API_KEY"] : [],
      "Runtime must only read the explicit plugin-configured input.");
    for (const match of source.matchAll(/from\s+["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (specifier.startsWith("node:")) continue;
      assert(specifier.startsWith("./"), "Runtime must not import installed packages.");
      await follow(resolve(dirname(file), specifier));
    }
  }
  await follow(entry);
  assert.equal(visited.size, 3, "Review changes to the runtime import graph.");
  let count = 0;
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if ([".git", "node_modules"].includes(item.name)) continue;
      assert(!item.isSymbolicLink(), "Directory files must not be symlinks.");
      const file = join(directory, item.name);
      if (item.isDirectory()) { await walk(file); continue; }
      count++;
      const bytes = await readFile(file);
      assert(bytes.length < 5 * 1024 * 1024, `${relative(root, file)} exceeds directory maximum.`);
      const exempt = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".woff", ".woff2", ".ttf", ".otf"].includes(extname(file).toLowerCase());
      assert(exempt || bytes.length < 256 * 1024, `${relative(root, file)} exceeds the review threshold.`);
      assert(exempt || !bytes.includes(0), `${relative(root, file)} is not readable text.`);
      if (!exempt) {
        const source = bytes.toString("utf8");
        // Also scan tests and docs: synthetic values can still block the portal.
        // Format descriptions/validators are fine; complete key-shaped values are not.
        const credentialPatterns = [
          /\b(?:sk402_|sk_live_|sk_test_|ghp_|github_pat_|sk-ant-)[A-Za-z0-9_-]+\b/,
          /\b(?:0x)?[a-fA-F0-9]{64}\b/,
          /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/,
          /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
          /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
        ];
        assert(!credentialPatterns.some((pattern) => pattern.test(source)),
          `${relative(root, file)} contains a credential-like value; use YOUR_API_KEY or another explicit placeholder.`);
        for (const match of source.matchAll(/(["'])([a-fA-F0-9]+)\1\s*\.repeat\(\s*(\d+)\s*\)/g)) {
          assert(match[2].length * Number(match[3]) < 64,
            `${relative(root, file)} constructs credential-like wallet material; use an explicit placeholder.`);
        }
      }
      if (item.name === ".gitattributes") {
        assert(!/\b(?:export-ignore|export-subst|filter)\b/.test(bytes.toString()), "Git attributes must not rewrite files.");
      }
    }
  }
  await walk(root);
  assert(count <= 512, "Plugin contains too many files.");
  for (const forbidden of ["server.cjs", "build-inputs.json"]) {
    const names = await readdir(join(root, "claude-plugin"));
    assert(!names.includes(forbidden), `Obsolete generated runtime returned: ${forbidden}`);
  }
  console.log(`Directory regression checks passed: ${count} files; three readable runtime modules; no inherited API/wallet credential.`);
  return { files: count, runtimeModules: visited.size };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkPlugin();
}

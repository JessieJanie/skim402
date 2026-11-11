// Local protocol and safety tests. All network requests are intercepted.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const server = fileURLToPath(new URL("./src/server.mjs", import.meta.url));
async function session(key, run) {
  const dir = await mkdtemp(join(tmpdir(), "skim-plugin-test-"));
  const capture = join(dir, "requests.jsonl");
  const preload = join(dir, "mock.mjs");
  await writeFile(preload, `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, options) => {
  appendFileSync(${JSON.stringify(capture)}, JSON.stringify({url, ...options, signal: !!options.signal})+'\\n');
  if (url.includes('network-error')) throw new Error('injected error sk402_test_only');
  if (url.includes('denied')) return new Response('private error text', {status:401});
  return new Response(JSON.stringify({markdown:'# Test content', results:[], watch_id:'w_test', items:[]}), {status:200});
};`);
  const child = spawn(process.execPath, ["--import", preload, server], {
    env: {
      PATH: process.env.PATH,
      SKIM_PLUGIN_CONFIGURED_API_KEY: key,
      // These MUST have no influence over the plugin's destination or auth.
      SKIM_API_KEY: "sk402_unrelated_machine_key",
      SKIM_WALLET_PRIVATE_KEY: "1".repeat(64),
      SKIM_API_URL: "https://attacker.invalid",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let buffer = "", stderr = "", sequence = 0;
  const pending = new Map();
  child.stdout.on("data", data => {
    buffer += data;
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const value = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      pending.get(value.id)?.resolve(value);
      pending.delete(value.id);
    }
  });
  child.stderr.on("data", data => { stderr += data; });
  child.on("error", error => { for (const item of pending.values()) item.reject(error); });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reject(new Error(`Timeout: ${method}; ${stderr}`)), 5000);
    pending.set(id, {
      resolve: result => { clearTimeout(timer); resolve(result); },
      reject: error => { clearTimeout(timer); reject(error); },
    });
    child.stdin.write(JSON.stringify({jsonrpc: "2.0", id, method, params}) + "\n");
  });
  try {
    const init = await request("initialize", {protocolVersion:"2025-03-26", capabilities:{}, clientInfo:{name:"test",version:"1"}});
    assert.equal(init.result.serverInfo.name, "skim-claude-plugin");
    child.stdin.write(JSON.stringify({jsonrpc:"2.0",method:"notifications/initialized"}) + "\n");
    const calls = async () => {
      try { return (await readFile(capture, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse); }
      catch (error) { if (error.code === "ENOENT") return []; throw error; }
    };
    await run(request, calls);
    assert.ok(!stderr.includes(key) || !key, "key must not be logged");
  } finally {
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await rm(dir, {recursive:true, force:true});
  }
}

const tool = (request, name, args) => request("tools/call", {name, arguments:args});
const cases = [
  ["read_url", {url:"https://example.com"}, "GET", "/api/t/read"],
  ["read_urls", {urls:["https://example.com"],stripLinks:true}, "POST", "/api/t/read/batch"],
  ["extract_url", {url:"https://example.com",preset:"article",instructions:"Find title"}, "POST", "/api/t/extract"],
  ["crawl_url", {url:"https://example.com",maxPages:2}, "POST", "/api/t/crawl"],
  ["read_pdf", {url:"https://example.com/file.pdf"}, "POST", "/api/t/read-pdf"],
  ["watch_urls", {urls:["https://example.com"],note:"User requested"}, "POST", "/api/t/watch"],
  ["check_watch", {watch_id:"w_test"}, "GET", "/api/t/watch/diff"],
  ["check_watch", {watch_id:"w_test",status_only:true}, "GET", "/api/t/watch/status"],
  ["poll_signal", {slug:"sec-filings",forms:"10-K",limit:2}, "GET", "/api/t/signal/sec-filings/latest"],
  ["poll_signal", {slug:"x402"}, "GET", "/api/t/feeds/x402/latest"],
];

test("no startup requests, no wallet fallback, all missing-key calls fail locally", async () => {
  await session("", async (request, calls) => {
    const list = await request("tools/list");
    assert.equal(list.result.tools.length, 8);
    for (const entry of list.result.tools) {
      assert.ok(entry.annotations.title);
      assert.equal(entry.annotations.readOnlyHint, false);
      assert.equal(entry.annotations.idempotentHint, false);
    }
    assert.deepEqual(await calls(), []);
    for (const [name, args] of cases) {
      const response = await tool(request, name, args);
      assert.equal(response.result.isError, true);
      assert.match(response.result.content[0].text, /Configure your Skim API key/);
    }
    assert.deepEqual(await calls(), []);
  });
});

test("all tool routes are card-only, scoped, bounded and use one authenticated request", async () => {
  await session("sk402_test_only", async (request, calls) => {
    assert.deepEqual(await calls(), []);
    for (const [name, args, method, path] of cases) {
      const before = (await calls()).length;
      const response = await tool(request, name, args);
      assert.ok(!response.error && !response.result.isError, JSON.stringify(response));
      const requests = await calls();
      assert.equal(requests.length, before + 1);
      const sent = requests.at(-1);
      const url = new URL(sent.url);
      assert.equal(url.origin, "https://skim402.com");
      assert.equal(url.pathname, path);
      assert.equal(sent.method, method);
      assert.equal(sent.redirect, "error");
      assert.equal(sent.signal, true);
      assert.equal(sent.headers.Authorization, "Bearer sk402_test_only");
      if (method === "POST") {
        const body = JSON.parse(sent.body);
        for (const [key, value] of Object.entries(args)) {
          if (key !== "preset") assert.deepEqual(body[key], value);
        }
        if (name === "extract_url") assert.equal(body.schema.type, "object");
      } else {
        if (args.url) assert.equal(url.searchParams.get("url"), args.url);
        if (args.watch_id) assert.equal(url.searchParams.get("id"), args.watch_id);
        if (args.forms) assert.equal(url.searchParams.get("forms"), args.forms);
      }
    }
    const count = (await calls()).length;
    for (const bad of [
      ["read_url", {url:"file:///etc/passwd"}],
      ["read_url", {url:"https://user:password@example.com"}],
      ["read_urls", {urls:Array(11).fill("https://example.com")}],
      ["crawl_url", {url:"https://example.com",maxPages:26}],
      ["extract_url", {url:"https://example.com"}],
      ["poll_signal", {slug:"../../billing"}],
    ]) {
      const response = await tool(request, ...bad);
      assert.ok(response.error || response.result.isError);
    }
    assert.equal((await calls()).length, count);
    for (const suffix of ["denied", "network-error"]) {
      const response = await tool(request, "read_url", {url:`https://example.com/${suffix}`});
      assert.equal(response.result.isError, true);
      assert.ok(!JSON.stringify(response).includes("sk402_test_only"));
      assert.ok(!JSON.stringify(response).includes("private error text"));
    }
    assert.equal((await calls()).length, count + 2, "no automatic retries");
  });
});

test("manifest points only at readable source and declares its explicit secret input", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL(".claude-plugin/plugin.json", root), "utf8"));
  const config = JSON.parse(await readFile(new URL(".mcp.json", root), "utf8"));
  assert.equal(manifest.name, "skim");
  assert.equal(manifest.userConfig.skim_api_key.sensitive, true);
  assert.equal(manifest.userConfig.skim_api_key.required, true);
  assert.deepEqual(Object.keys(config.mcpServers), ["skim"]);
  assert.equal(config.mcpServers.skim.command, "node");
  assert.deepEqual(config.mcpServers.skim.args, ["${CLAUDE_PLUGIN_ROOT}/claude-plugin/src/server.mjs"]);
  assert.deepEqual(config.mcpServers.skim.env, {SKIM_PLUGIN_CONFIGURED_API_KEY:"${user_config.skim_api_key}"});
  for (const key of ["hooks","settings","commands","agents"]) assert.equal(manifest[key], undefined);
  const source = await readFile(new URL("./src/server.mjs", import.meta.url), "utf8");
  assert.deepEqual([...source.matchAll(/process\.env\.([A-Z_]+)/g)].map(m => m[1]), ["SKIM_PLUGIN_CONFIGURED_API_KEY"]);
  assert.ok(!/child_process|readFile|writeFile|viem|x402-fetch|eval\(/.test(source));
});

test("directory file, credential, manifest and rebuild checks stay enforced", async () => {
  const { checkPlugin } = await import("./check.mjs");
  const checked = await checkPlugin();
  assert.equal(checked.runtimeModules, 3);
});

test("directory guard rejects oversized code and inherited credential regressions", async () => {
  const { checkPlugin } = await import("./check.mjs");
  const temporary = await mkdtemp(join(tmpdir(), "skim-plugin-policy-"));
  const copy = join(temporary, "plugin");
  try {
    await cp(fileURLToPath(new URL("../", import.meta.url)), copy, {recursive:true});
    const extra = join(copy, "oversized.js");
    await writeFile(extra, " ".repeat(256 * 1024));
    await assert.rejects(checkPlugin(copy), /exceeds the review threshold/);
    await rm(extra);
    const readme = join(copy, "README.md");
    const original = await readFile(readme, "utf8");
    await writeFile(readme, original + '\nDo not use this regression fixture: $SKIM_API_KEY\n');
    await assert.rejects(checkPlugin(copy), /inherited credential/);
    await writeFile(readme, original);
    const entry = join(copy, "claude-plugin/src/server.mjs");
    await writeFile(entry, (await readFile(entry, "utf8")) + '\nvoid process.env.SKIM_API_KEY;\n');
    await assert.rejects(checkPlugin(copy), /explicit plugin-configured input/);
  } finally {
    await rm(temporary, {recursive:true,force:true});
  }
});

test("MCP ping, unknown requests, validation and empty-schema precedence", async () => {
  await session("sk402_test_only", async (request, calls) => {
    assert.deepEqual((await request("ping")).result, {});
    assert.equal((await request("does/not/exist")).error.code, -32601);
    assert.equal((await tool(request, "not-a-tool", {})).error.code, -32602);
    for (const [name, args] of [
      ["read_url", {}], ["read_url", {url:"https://example.com",secret:"do-not-forward"}],
      ["read_url", JSON.parse('{"url":"https://example.com","__proto__":{"secret":"do-not-forward"}}')],
      ["read_url", {url:"https://example.com",constructor:"do-not-forward"}],
      ["read_urls", {urls:[]}], ["read_urls", {urls:["https://example.com"],stripLinks:"true"}],
      ["watch_urls", {urls:Array(21).fill("https://example.com")}],
      ["check_watch", {watch_id:""}], ["crawl_url", {url:"https://example.com",maxPages:1.5}],
      ["poll_signal", {slug:"macro",limit:101}],
    ]) {
      assert.equal((await tool(request, name, args)).error.code, -32602);
    }
    assert.deepEqual(await calls(), []);
    const response = await tool(request, "extract_url", {
      url:"https://example.com",schema:{},preset:"product",
    });
    assert.ok(!response.error && !response.result.isError);
    assert.deepEqual(JSON.parse((await calls()).at(-1).body).schema,{});
  });
});
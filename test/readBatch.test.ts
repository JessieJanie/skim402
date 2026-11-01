import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  READ_BATCH_CONCURRENCY,
  READ_BATCH_SIZE,
  READ_URLS_MAX,
  readUrlsInBatches,
} from "../src/readBatch.ts";

const href = (index: number) => `https://example.com/page-${index}`;

function pages(count: number): string[] {
  return Array.from({ length: count }, (_, index) => href(index));
}

test("25 urls produce 3 overlapping batches of 10 merged in order", async () => {
  const urls = pages(READ_BATCH_SIZE * 2 + 5);
  assert.equal(urls.length, 25);

  let inFlight = 0;
  let maxInFlight = 0;
  const seen: string[][] = [];

  const results = await readUrlsInBatches(urls, async (chunk) => {
    seen.push([...chunk]);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight -= 1;
    return chunk.map((url) => ({ url, ok: true, data: { markdown: url } }));
  });

  assert.equal(seen.length, 3);
  assert.equal(maxInFlight, 3);
  assert.equal(maxInFlight, READ_BATCH_CONCURRENCY);
  assert.deepEqual(seen[0], urls.slice(0, 10));
  assert.deepEqual(seen[1], urls.slice(10, 20));
  assert.deepEqual(seen[2], urls.slice(20));
  assert.deepEqual(
    results.map((item) => item.url),
    urls,
  );
  assert.deepEqual(
    results.map((item) => item.data?.markdown),
    urls,
  );
});

test("a fourth batch waits so at most 3 batch calls run at once", async () => {
  const urls = pages(31);
  let inFlight = 0;
  let maxInFlight = 0;
  let calls = 0;

  const results = await readUrlsInBatches(urls, async (chunk) => {
    calls += 1;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight -= 1;
    return chunk.map((url) => ({ url, ok: true, data: { markdown: url } }));
  });

  assert.equal(calls, 4);
  assert.equal(maxInFlight, READ_BATCH_CONCURRENCY);
  assert.deepEqual(
    results.map((item) => item.url),
    urls,
  );
});

test("a failed middle chunk becomes per-url errors and the other chunks stay in order", async () => {
  const urls = pages(25);
  const calls: number[] = [];

  const results = await readUrlsInBatches(urls, async (chunk) => {
    calls.push(chunk.length);
    if (chunk[0] === urls[10]) throw new Error("chunk 2 down");
    return chunk.map((url) => ({
      url,
      ok: true,
      data: { markdown: `ok ${url}` },
    }));
  });

  assert.deepEqual(calls, [10, 10, 5]);
  assert.equal(results.length, 25);
  for (let index = 0; index < results.length; index += 1) {
    const item = results[index]!;
    assert.equal(item.url, urls[index]);
    if (index >= 10 && index < 20) {
      assert.equal(item.ok, false);
      assert.equal(item.error?.message, "chunk 2 down");
    } else {
      assert.equal(item.ok, true);
      assert.equal(item.data?.markdown, `ok ${urls[index]}`);
    }
  }
});

test("a per-item error inside one chunk stays in input order", async () => {
  const urls = pages(15);
  const results = await readUrlsInBatches(urls, async (chunk) =>
    chunk.map((url) =>
      url.endsWith("/page-12")
        ? { url, ok: false, error: { status: 422, message: "unreadable" } }
        : { url, ok: true, data: { markdown: url } },
    ),
  );

  assert.deepEqual(
    results.map((item) => item.url),
    urls,
  );
  assert.equal(results[11]?.ok, true);
  assert.equal(results[12]?.ok, false);
  assert.equal(results[12]?.error?.status, 422);
  assert.equal(results[12]?.error?.message, "unreadable");
  assert.equal(results[13]?.ok, true);
});

test("a single failing batch still throws", async () => {
  await assert.rejects(
    () =>
      readUrlsInBatches(["https://example.com/a"], async () => {
        throw new Error("batch down");
      }),
    /batch down/,
  );
});

test("every chunk failing throws the first chunk error", async () => {
  const urls = pages(25);
  await assert.rejects(
    () =>
      readUrlsInBatches(urls, async (chunk) => {
        throw new Error(`down ${chunk[0]}`);
      }),
    /down https:\/\/example.com\/page-0/,
  );
});

test("ten urls stay a single batch call", async () => {
  const urls = pages(READ_BATCH_SIZE);
  let calls = 0;
  const results = await readUrlsInBatches(urls, async (chunk) => {
    calls += 1;
    assert.deepEqual(chunk, urls);
    return chunk.map((url) => ({ url, ok: true, data: { markdown: url } }));
  });
  assert.equal(calls, 1);
  assert.equal(results.length, READ_BATCH_SIZE);
});

test("tool descriptions tell agents to batch two or more urls", async () => {
  const npm = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const plugin = await readFile(
    new URL("../claude-plugin/src/index.ts", import.meta.url),
    "utf8",
  );
  for (const source of [npm, plugin]) {
    const readUrl = source.slice(source.indexOf('"read_url"'), source.indexOf('"read_urls"'));
    const readUrls = source.slice(
      source.indexOf('"read_urls"'),
      source.indexOf('"extract_url"'),
    );
    assert.match(readUrl, /read_urls/);
    assert.match(readUrl, /two or more URLs/);
    assert.match(readUrls, /batches of 10/);
    assert.match(readUrls, /\/api\/t\/read\/batch/);
    assert.match(readUrls, new RegExp(String(READ_URLS_MAX)));
  }
});

test("published version fields stay in lockstep", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  const server = JSON.parse(
    await readFile(new URL("../server.json", import.meta.url), "utf8"),
  ) as { version: string; packages: Array<{ version: string }> };
  const plugin = JSON.parse(
    await readFile(new URL("../.claude-plugin/plugin.json", import.meta.url), "utf8"),
  ) as { version: string };
  const npmSource = await readFile(new URL("../src/index.ts", import.meta.url), "utf8");
  const pluginSource = await readFile(
    new URL("../claude-plugin/src/index.ts", import.meta.url),
    "utf8",
  );
  assert.equal(server.version, pkg.version);
  assert.equal(server.packages[0]?.version, pkg.version);
  assert.match(npmSource, new RegExp(`const VERSION = "${pkg.version}"`));
  assert.match(pluginSource, new RegExp(`const VERSION = "${plugin.version}"`));
  assert.equal(plugin.version, "1.0.1");
  assert.equal(pkg.version, "0.2.6");
});

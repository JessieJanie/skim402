#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";
const VERSION = "0.2.1";
const BASE_URL = (process.env.SKIM_API_URL ?? "https://skim402.com").replace(/\/+$/, "");
const API_KEY = process.env.SKIM_API_KEY ?? "";
const PRIVATE_KEY = process.env.SKIM_WALLET_PRIVATE_KEY ?? "";
const MAX_PRICE_USD = process.env.SKIM_MAX_PRICE_USD ?? "0.01";
const TIMEOUT_MS = (() => {
    const parsed = Number(process.env.SKIM_TIMEOUT_MS ?? "90000");
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 90_000;
})();
const cardLane = API_KEY.length > 0;
let payFetch = fetch;
let walletAddress = null;
if (cardLane) {
    const key = API_KEY;
    payFetch = (input, init) => fetch(input, {
        ...init,
        headers: {
            ...(init?.headers ?? {}),
            Authorization: `Bearer ${key}`,
        },
    });
}
else if (PRIVATE_KEY) {
    const normalized = PRIVATE_KEY.startsWith("0x")
        ? PRIVATE_KEY.slice(2)
        : PRIVATE_KEY;
    if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
        process.stderr.write("skim-mcp: SKIM_WALLET_PRIVATE_KEY must be a 64-character hex string (with or without 0x prefix). Refusing to start.\n");
        process.exit(1);
    }
    const account = privateKeyToAccount(`0x${normalized}`);
    walletAddress = account.address;
    const maxPrice = Number(MAX_PRICE_USD);
    if (!Number.isFinite(maxPrice) || maxPrice <= 0) {
        process.stderr.write("skim-mcp: SKIM_MAX_PRICE_USD must be a positive number, e.g. 0.01.\n");
        process.exit(1);
    }
    payFetch = wrapFetchWithPayment(fetch, account, BigInt(Math.round(maxPrice * 1_000_000)));
}
const hasAuth = cardLane || walletAddress !== null;
/**
 * Convenience schemas for extract_url presets. Card lane has no live
 * /api/t/extract/{preset} routes today, so presets are sent as `schema`
 * to POST /api/t/extract (or POST /api/v1/extract on the wallet lane).
 * Field lists match skim402.com/docs extraction presets.
 */
const PRESET_SCHEMAS = {
    article: {
        type: "object",
        properties: {
            title: { type: "string" },
            author: { type: "string" },
            published: { type: "string" },
            summary: { type: "string" },
            key_points: { type: "array", items: { type: "string" } },
            language: { type: "string" },
        },
        required: ["title"],
    },
    product: {
        type: "object",
        properties: {
            name: { type: "string" },
            brand: { type: "string" },
            price: { type: "number" },
            currency: { type: "string" },
            availability: { type: "string" },
            rating: { type: "number" },
            reviewCount: { type: "number" },
            description: { type: "string" },
        },
        required: ["name"],
    },
    job: {
        type: "object",
        properties: {
            title: { type: "string" },
            company: { type: "string" },
            location: { type: "string" },
            remote: { type: "boolean" },
            employmentType: { type: "string" },
            salaryMin: { type: "number" },
            salaryMax: { type: "number" },
            requirements: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
    },
    review: {
        type: "object",
        properties: {
            item: { type: "string" },
            rating: { type: "number" },
            scale: { type: "number" },
            author: { type: "string" },
            verdict: { type: "string" },
            pros: { type: "array", items: { type: "string" } },
            cons: { type: "array", items: { type: "string" } },
        },
        required: ["item"],
    },
    event: {
        type: "object",
        properties: {
            name: { type: "string" },
            startDate: { type: "string" },
            endDate: { type: "string" },
            venue: { type: "string" },
            city: { type: "string" },
            country: { type: "string" },
            organizer: { type: "string" },
            ticketPrice: { type: "string" },
        },
        required: ["name"],
    },
    table: {
        type: "object",
        properties: {
            tables: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        caption: { type: "string" },
                        headers: { type: "array", items: { type: "string" } },
                        rows: {
                            type: "array",
                            items: { type: "array", items: { type: "string" } },
                        },
                    },
                },
            },
        },
        required: ["tables"],
    },
};
function fail(text) {
    return {
        isError: true,
        content: [{ type: "text", text }],
    };
}
function ok(text) {
    return { content: [{ type: "text", text }] };
}
function authMissing() {
    return fail("Skim needs a payment method. Set SKIM_API_KEY (card plan, free tier at skim402.com/pricing) or SKIM_WALLET_PRIVATE_KEY (Base wallet with USDC). Card is easier — no crypto setup required.");
}
function cardLaneOnly(tool, path) {
    return fail(`${tool} is card-lane only (${path}) — there is no x402 /v1 twin. Set SKIM_API_KEY (sk402_..., free tier at skim402.com/pricing). Wallet pay still works for read_url, read_urls, extract_url, and watch.`);
}
function buildUrl(path, query) {
    const url = new URL(path, `${BASE_URL}/`);
    if (query) {
        for (const [key, value] of Object.entries(query)) {
            url.searchParams.set(key, value);
        }
    }
    return url.toString();
}
async function skimFetch(method, path, opts = {}) {
    const attempt = payFetch(buildUrl(path, opts.query), {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? JSON.stringify(opts.body ?? {}) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    let watchdog;
    const deadline = new Promise((_, reject) => {
        watchdog = setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS}ms (SKIM_TIMEOUT_MS) — the request or payment client stalled`)), TIMEOUT_MS + 5_000);
    });
    try {
        return await Promise.race([attempt, deadline]);
    }
    finally {
        clearTimeout(watchdog);
        attempt.catch(() => { });
    }
}
function requestFailedMessage(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return cardLane
        ? `Skim request failed: ${msg}. Check that your SKIM_API_KEY is valid (skim402.com/pricing).`
        : `Skim request failed: ${msg}. Common causes: wallet has no USDC on Base, the price exceeds SKIM_MAX_PRICE_USD (${MAX_PRICE_USD}), or a stalled network/payment connection (retry is safe — you are not charged for unsettled calls). Wallet-lane batch/extract/watch cost more than a single read — raise SKIM_MAX_PRICE_USD (e.g. 0.05) if the cap is rejecting the call.`;
}
async function readJson(res) {
    const body = await res.text();
    if (!res.ok) {
        throw new Error(`Skim returned ${res.status} ${res.statusText}: ${body || "(no body)"}`);
    }
    if (!body)
        return {};
    try {
        return JSON.parse(body);
    }
    catch {
        return body;
    }
}
function formatRead(data) {
    const metaLines = data.metadata
        ? Object.entries(data.metadata)
            .filter(([, v]) => v != null && v !== "")
            .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        : [];
    const frontmatter = metaLines.length > 0 ? `---\n${metaLines.join("\n")}\n---\n\n` : "";
    return frontmatter + (data.markdown ?? data.text ?? "");
}
function formatCrawl(data) {
    const meta = {};
    if (data.url)
        meta.url = data.url;
    if (data.origin)
        meta.origin = data.origin;
    if (data.pageCount != null)
        meta.pageCount = data.pageCount;
    if (data.discovered != null)
        meta.discovered = data.discovered;
    if (data.capped != null)
        meta.capped = data.capped;
    if (data.maxPages != null)
        meta.maxPages = data.maxPages;
    if (data.sources?.length)
        meta.sources = data.sources.join(", ");
    if (data.charged != null)
        meta.charged = data.charged;
    if (data.fetchedAt)
        meta.fetchedAt = data.fetchedAt;
    const blocks = (data.pages ?? []).map((page) => {
        if (page.ok !== false && (page.markdown || page.title)) {
            const heading = page.title ? `${page.title} — ${page.url}` : page.url;
            return `## ${heading}\n\n${page.markdown ?? ""}`;
        }
        const err = page.error;
        const detail = typeof err === "string"
            ? err
            : err
                ? `${err.status ?? ""} ${err.message ?? ""}`.trim()
                : "unknown error";
        return `## ${page.url}\n\nERROR: ${detail}`;
    });
    return (formatRead({ metadata: meta, markdown: blocks.join("\n\n---\n\n") }) ||
        JSON.stringify(data, null, 2));
}
const server = new McpServer({
    name: "skim-mcp",
    version: VERSION,
});
server.tool("read_url", "Fetch any URL and return clean, agent-ready Markdown via Skim (skim402.com). Output is ~4x smaller than raw HTML — fewer tokens, faster processing. Strips nav, ads, and boilerplate; preserves the article body plus structured metadata (title, byline, published date, language, excerpt). Use this whenever you need to read web content: articles, docs, blog posts, GitHub READMEs, research papers, etc.", {
    url: z
        .string()
        .url()
        .describe("The fully-qualified URL to fetch and clean (https://...)."),
}, async ({ url }) => {
    if (!hasAuth)
        return authMissing();
    try {
        const res = cardLane
            ? await skimFetch("GET", "/api/t/read", { query: { url } })
            : await skimFetch("POST", "/api/v1/read", {
                body: { url, mode: "basic" },
            });
        const data = (await readJson(res));
        return ok(formatRead(data));
    }
    catch (err) {
        return fail(requestFailedMessage(err));
    }
});
server.tool("read_urls", "Read up to 10 URLs in one Skim call and return per-URL clean Markdown plus metadata. Use this instead of calling read_url in a loop. Card lane: POST /api/t/read/batch. Wallet lane: POST /api/v1/read/batch.", {
    urls: z
        .array(z.string().url())
        .min(1)
        .max(10)
        .describe("1–10 fully-qualified http(s) URLs to read."),
    stripLinks: z
        .boolean()
        .optional()
        .describe("If true, flatten markdown links to their anchor text."),
    stripImages: z
        .boolean()
        .optional()
        .describe("If true, drop image markup from the markdown."),
}, async ({ urls, stripLinks, stripImages }) => {
    if (!hasAuth)
        return authMissing();
    try {
        const path = cardLane ? "/api/t/read/batch" : "/api/v1/read/batch";
        const res = await skimFetch("POST", path, {
            body: {
                urls,
                ...(stripLinks !== undefined ? { stripLinks } : {}),
                ...(stripImages !== undefined ? { stripImages } : {}),
            },
        });
        const data = (await readJson(res));
        const blocks = (data.results ?? []).map((item) => {
            if (item.ok && item.data) {
                return `## ${item.url}\n\n${formatRead(item.data)}`;
            }
            const err = item.error;
            const detail = err
                ? `${err.status ?? ""} ${err.message ?? ""}`.trim()
                : "unknown error";
            return `## ${item.url}\n\nERROR: ${detail}`;
        });
        return ok(blocks.join("\n\n---\n\n") || JSON.stringify(data, null, 2));
    }
    catch (err) {
        return fail(requestFailedMessage(err));
    }
});
server.tool("extract_url", "Extract structured JSON (or tables) from a URL via Skim. Pass a JSON Schema, or a preset (article, product, job, review, event, table). Values come only from the page — missing fields are omitted or null, never invented. Card lane: POST /api/t/extract. Wallet lane: POST /api/v1/extract.", {
    url: z
        .string()
        .url()
        .describe("The fully-qualified URL to fetch and extract from."),
    schema: z
        .record(z.unknown())
        .optional()
        .describe("JSON Schema (type: object) describing the output. Required unless preset is set. Wins if both are set."),
    preset: z
        .enum(["article", "product", "job", "review", "event", "table"])
        .optional()
        .describe("Built-in extraction shape. Use table for data tables on the page. Ignored when schema is set."),
    instructions: z
        .string()
        .optional()
        .describe("Optional natural-language hint (e.g. only quote prices from the article body)."),
}, async ({ url, schema, preset, instructions }) => {
    if (!hasAuth)
        return authMissing();
    const resolved = schema ?? (preset ? PRESET_SCHEMAS[preset] : undefined);
    if (!resolved) {
        return fail("extract_url needs a JSON Schema (`schema`) or a `preset` (article, product, job, review, event, table).");
    }
    try {
        const path = cardLane ? "/api/t/extract" : "/api/v1/extract";
        const res = await skimFetch("POST", path, {
            body: {
                url,
                schema: resolved,
                ...(instructions ? { instructions } : {}),
            },
        });
        const data = await readJson(res);
        return ok(JSON.stringify(data, null, 2));
    }
    catch (err) {
        return fail(requestFailedMessage(err));
    }
});
server.tool("crawl_url", "Crawl a site (origin or start URL) and return clean Markdown for the important pages. Discovers sitemap.xml / robots.txt sitemaps plus same-origin links. Cap 25 pages. 1 credit per successful page; failed pages are not charged. Card lane only: POST /api/t/crawl. No x402 /v1 twin.", {
    url: z
        .string()
        .min(1)
        .describe("Site origin or start URL. Bare hosts like example.com are treated as https://example.com."),
    maxPages: z
        .number()
        .int()
        .min(1)
        .max(25)
        .optional()
        .describe("Optional page cap, 1–25. Default 25."),
    stripLinks: z
        .boolean()
        .optional()
        .describe("If true, flatten markdown links to their anchor text on every page."),
    stripImages: z
        .boolean()
        .optional()
        .describe("If true, drop image markup from every page."),
}, async ({ url, maxPages, stripLinks, stripImages }) => {
    if (!hasAuth)
        return authMissing();
    if (!cardLane)
        return cardLaneOnly("crawl_url", "POST /api/t/crawl");
    try {
        const res = await skimFetch("POST", "/api/t/crawl", {
            body: {
                url,
                ...(maxPages !== undefined ? { maxPages } : {}),
                ...(stripLinks !== undefined ? { stripLinks } : {}),
                ...(stripImages !== undefined ? { stripImages } : {}),
            },
        });
        const data = (await readJson(res));
        return ok(formatCrawl(data));
    }
    catch (err) {
        return fail(requestFailedMessage(err));
    }
});
server.tool("read_pdf", "Fetch a public PDF URL and return clean Markdown plus an optional bookmark outline. Text comes only from the file — nothing is invented. Image-only scans return 422 (no OCR). Files larger than 8 MB return 413. 3 credits; failed conversions are not charged. Card lane only: POST /api/t/read-pdf. No x402 /v1 twin.", {
    url: z
        .string()
        .url()
        .describe("Absolute http(s) PDF URL to fetch and convert."),
    outline: z
        .boolean()
        .optional()
        .describe("If true (default), include the PDF bookmark outline when present. Set false to omit it."),
}, async ({ url, outline }) => {
    if (!hasAuth)
        return authMissing();
    if (!cardLane)
        return cardLaneOnly("read_pdf", "POST /api/t/read-pdf");
    try {
        const res = await skimFetch("POST", "/api/t/read-pdf", {
            body: {
                url,
                ...(outline !== undefined ? { outline } : {}),
            },
        });
        const data = (await readJson(res));
        return ok(formatRead({
            markdown: data.markdown,
            text: data.text,
            metadata: {
                ...(data.url ? { url: data.url } : {}),
                ...(data.finalUrl ? { finalUrl: data.finalUrl } : {}),
                ...(data.pageCount != null ? { pageCount: data.pageCount } : {}),
                ...(data.charged != null ? { charged: data.charged } : {}),
                ...(data.fetchedAt ? { fetchedAt: data.fetchedAt } : {}),
                ...(data.outline != null ? { outline: data.outline } : {}),
            },
        }));
    }
    catch (err) {
        return fail(requestFailedMessage(err));
    }
});
server.tool("watch_urls", "Register a private Skim Watch on 1–20 URLs. Returns a watch_id (treat it as a secret) used with check_watch. First check baselines each page; later checks report content diffs. Card lane: POST /api/t/watch. Wallet lane: POST /api/v2/watch.", {
    urls: z
        .array(z.string().url())
        .min(1)
        .max(20)
        .describe("1–20 fully-qualified http(s) URLs to watch."),
    note: z
        .string()
        .optional()
        .describe("Optional label for this watch (e.g. competitor pricing)."),
}, async ({ urls, note }) => {
    if (!hasAuth)
        return authMissing();
    try {
        const path = cardLane ? "/api/t/watch" : "/api/v2/watch";
        const res = await skimFetch("POST", path, {
            body: { urls, ...(note ? { note } : {}) },
        });
        const data = await readJson(res);
        return ok(JSON.stringify(data, null, 2));
    }
    catch (err) {
        return fail(requestFailedMessage(err));
    }
});
server.tool("check_watch", "Poll a Skim Watch for content changes (or fetch registration status). Pass the watch_id from watch_urls. Card lane: GET /api/t/watch/diff?id= (or /status). Wallet lane: GET /api/v2/watch/diff?id= (or /status, which is free).", {
    watch_id: z
        .string()
        .min(1)
        .describe("Watch id returned by watch_urls (treat as a secret)."),
    status_only: z
        .boolean()
        .optional()
        .describe("If true, return registration status only (no diff). Wallet-lane status is free."),
}, async ({ watch_id, status_only }) => {
    if (!hasAuth)
        return authMissing();
    try {
        const kind = status_only ? "status" : "diff";
        const path = cardLane
            ? `/api/t/watch/${kind}`
            : `/api/v2/watch/${kind}`;
        const res = await skimFetch("GET", path, { query: { id: watch_id } });
        const data = await readJson(res);
        return ok(JSON.stringify(data, null, 2));
    }
    catch (err) {
        return fail(requestFailedMessage(err));
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);
if (cardLane) {
    process.stderr.write(`skim-mcp ready — card key (SKIM_API_KEY) → ${BASE_URL}\n`);
}
else if (walletAddress) {
    process.stderr.write(`skim-mcp ready — paying from ${walletAddress} (max $${MAX_PRICE_USD}/call) → ${BASE_URL}\n`);
}
else {
    process.stderr.write(`skim-mcp ready (NO AUTH) — set SKIM_API_KEY or SKIM_WALLET_PRIVATE_KEY to enable tools → ${BASE_URL}\n`);
}

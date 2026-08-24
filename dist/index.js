import { createTool } from "@mastra/core/tools";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";
const inputSchema = z.object({
    url: z
        .string()
        .url()
        .describe("The fully-qualified URL to fetch and clean (https://...)."),
});
const outputSchema = z.object({
    markdown: z.string().describe("Clean, agent-ready Markdown of the page."),
    metadata: z
        .record(z.string(), z.unknown())
        .describe("Structured page metadata (title, byline, published date, language, excerpt)."),
    source: z.string().describe("The URL that was read."),
});
/**
 * Create a Mastra tool that reads any URL as clean Markdown via Skim
 * (https://skim402.com). Output is ~4x smaller than raw HTML.
 *
 * Two ways to pay: card plan API key (SKIM_API_KEY, recommended — free tier at
 * skim402.com/pricing) or x402 wallet ($0.002/read in USDC on Base,
 * SKIM_WALLET_PRIVATE_KEY). Card takes priority when both are set.
 */
export function createSkimReaderTool(options = {}) {
    const baseUrl = (options.apiUrl ??
        process.env.SKIM_API_URL ??
        "https://skim402.com").replace(/\/+$/, "");
    const timeoutMs = (() => {
        const parsed = Number(options.timeoutMs ?? process.env.SKIM_TIMEOUT_MS ?? "90000");
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 90_000;
    })();
    // Resolve auth method once at tool-creation time
    const apiKey = options.apiKey ?? process.env.SKIM_API_KEY ?? "";
    let payFetch = null;
    let cardLane = false;
    if (apiKey) {
        // Card lane: plain fetch + Bearer token
        cardLane = true;
        const key = apiKey;
        payFetch = (input, init) => fetch(input, {
            ...init,
            headers: {
                ...(init?.headers ?? {}),
                Authorization: `Bearer ${key}`,
            },
        });
    }
    else {
        // Wallet lane: x402 pay-per-call
        const rawKey = options.walletPrivateKey ?? process.env.SKIM_WALLET_PRIVATE_KEY ?? "";
        if (rawKey) {
            const normalized = rawKey.startsWith("0x") ? rawKey.slice(2) : rawKey;
            if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
                throw new Error("mastra-skim: wallet private key must be a 64-character hex string (with or without 0x prefix).");
            }
            const account = privateKeyToAccount(`0x${normalized}`);
            const maxPrice = Number(options.maxPriceUsd ?? process.env.SKIM_MAX_PRICE_USD ?? "0.01");
            if (!Number.isFinite(maxPrice) || maxPrice <= 0) {
                throw new Error("mastra-skim: maxPriceUsd (or SKIM_MAX_PRICE_USD) must be a positive number, e.g. 0.01.");
            }
            payFetch = wrapFetchWithPayment(fetch, account, BigInt(Math.round(maxPrice * 1_000_000)));
        }
    }
    return createTool({
        id: "skim_read",
        description: "Fetch any URL and return clean, agent-ready Markdown via Skim (skim402.com). Output is ~4x smaller than raw HTML — fewer tokens, faster processing. Strips nav, ads, and boilerplate; preserves the article body plus structured metadata (title, byline, published date, language, excerpt). Use this whenever you need to read web content: articles, docs, blog posts, GitHub READMEs, research papers, etc.",
        inputSchema,
        outputSchema,
        execute: async ({ url }) => {
            if (!payFetch) {
                throw new Error("Skim needs a payment method. Set SKIM_API_KEY (card plan, free tier at skim402.com/pricing) or SKIM_WALLET_PRIVATE_KEY (Base wallet with USDC, $0.002/call). Card is easier — no crypto setup required.");
            }
            const endpoint = cardLane
                ? `${baseUrl}/api/t/read?url=${encodeURIComponent(url)}`
                : `${baseUrl}/api/v1/read`;
            let res;
            try {
                const attempt = cardLane
                    ? payFetch(endpoint, {
                        method: "GET",
                        signal: AbortSignal.timeout(timeoutMs),
                    })
                    : payFetch(endpoint, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url, mode: "basic" }),
                        signal: AbortSignal.timeout(timeoutMs),
                    });
                let watchdog;
                const deadline = new Promise((_, reject) => {
                    watchdog = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms (SKIM_TIMEOUT_MS) — the request or payment client stalled`)), timeoutMs + 5_000);
                });
                try {
                    res = await Promise.race([attempt, deadline]);
                }
                finally {
                    clearTimeout(watchdog);
                    attempt.catch(() => { });
                }
            }
            catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                throw new Error(cardLane
                    ? `Skim request failed: ${msg}. Check that your SKIM_API_KEY is valid (skim402.com/pricing).`
                    : `Skim request failed: ${msg}. Common causes: wallet has no USDC on Base, the price exceeds the max price cap, or a stalled network/payment connection (retry is safe — you are not charged for unsettled calls).`);
            }
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                throw new Error(`Skim returned ${res.status} ${res.statusText}: ${body || "(no body)"}`);
            }
            const data = (await res.json());
            return {
                markdown: data.markdown ?? data.text ?? "",
                metadata: data.metadata ?? {},
                source: url,
            };
        },
    });
}
/**
 * Ready-made Skim reader tool using environment-variable configuration
 * (SKIM_API_KEY, SKIM_WALLET_PRIVATE_KEY, SKIM_API_URL, SKIM_MAX_PRICE_USD,
 * SKIM_TIMEOUT_MS). Card key takes priority when both SKIM_API_KEY and
 * SKIM_WALLET_PRIVATE_KEY are set.
 */
export const skimReaderTool = createSkimReaderTool();

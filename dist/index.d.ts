export interface SkimReaderToolOptions {
    /**
     * Card-plan API key (sk402_...). Defaults to the SKIM_API_KEY environment
     * variable. Get a free key (1,000 reads/month) at skim402.com/pricing.
     * Takes priority over walletPrivateKey when both are set.
     */
    apiKey?: string;
    /**
     * Hex private key of a Base wallet funded with USDC (with or without 0x
     * prefix). Defaults to the SKIM_WALLET_PRIVATE_KEY environment variable.
     * Pay-per-call via x402 at $0.002/read. Ignored when apiKey is set.
     */
    walletPrivateKey?: string;
    /** Base URL of the Skim API. Defaults to SKIM_API_URL or https://skim402.com */
    apiUrl?: string;
    /**
     * Maximum price in USD you allow per call (wallet lane only). Defaults to
     * SKIM_MAX_PRICE_USD or "0.01".
     */
    maxPriceUsd?: string | number;
    /** Request timeout in milliseconds. Defaults to SKIM_TIMEOUT_MS or 90000. */
    timeoutMs?: number;
}
/**
 * Create a Mastra tool that reads any URL as clean Markdown via Skim
 * (https://skim402.com). Output is ~4x smaller than raw HTML.
 *
 * Two ways to pay: card plan API key (SKIM_API_KEY, recommended — free tier at
 * skim402.com/pricing) or x402 wallet ($0.002/read in USDC on Base,
 * SKIM_WALLET_PRIVATE_KEY). Card takes priority when both are set.
 */
export declare function createSkimReaderTool(options?: SkimReaderToolOptions): import("@mastra/core/tools").Tool<{
    url: string;
}, {
    markdown: string;
    metadata: Record<string, unknown>;
    source: string;
}, unknown, unknown, import("@mastra/core/tools").ToolExecutionContext<unknown, unknown, unknown>, "skim_read", unknown>;
/**
 * Ready-made Skim reader tool using environment-variable configuration
 * (SKIM_API_KEY, SKIM_WALLET_PRIVATE_KEY, SKIM_API_URL, SKIM_MAX_PRICE_USD,
 * SKIM_TIMEOUT_MS). Card key takes priority when both SKIM_API_KEY and
 * SKIM_WALLET_PRIVATE_KEY are set.
 */
export declare const skimReaderTool: import("@mastra/core/tools").Tool<{
    url: string;
}, {
    markdown: string;
    metadata: Record<string, unknown>;
    source: string;
}, unknown, unknown, import("@mastra/core/tools").ToolExecutionContext<unknown, unknown, unknown>, "skim_read", unknown>;

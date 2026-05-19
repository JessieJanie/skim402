#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { z } from "zod";

const BASE_URL = (process.env.SKIM_API_URL ?? "https://skim402.com").replace(
  /\/+$/,
  "",
);
const PRIVATE_KEY = process.env.SKIM_WALLET_PRIVATE_KEY;
const MAX_PRICE_USD = process.env.SKIM_MAX_PRICE_USD ?? "0.01";

let payFetch: typeof fetch = fetch;
let walletAddress: string | null = null;

if (PRIVATE_KEY) {
  const normalized = PRIVATE_KEY.startsWith("0x")
    ? PRIVATE_KEY.slice(2)
    : PRIVATE_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    process.stderr.write(
      "skim-mcp: SKIM_WALLET_PRIVATE_KEY must be a 64-character hex string (with or without 0x prefix). Refusing to start.\n",
    );
    process.exit(1);
  }
  const account = privateKeyToAccount(`0x${normalized}` as `0x${string}`);
  walletAddress = account.address;
  payFetch = wrapFetchWithPayment(
    fetch,
    account,
    BigInt(Math.round(Number(MAX_PRICE_USD) * 1_000_000)),
  ) as unknown as typeof fetch;
}

const server = new McpServer({
  name: "skim-mcp",
  version: "0.1.0",
});

server.tool(
  "read_url",
  "Fetch any URL and return clean, agent-ready Markdown via Skim (skim402.com). Strips nav, ads, and boilerplate; preserves the article body plus structured metadata (title, byline, published date, language, excerpt). Pays $0.002 per call in USDC on Base over the x402 protocol — no API keys, no signup. Use this whenever you need to read web content: articles, docs, blog posts, GitHub READMEs, research papers, etc.",
  {
    url: z
      .string()
      .url()
      .describe("The fully-qualified URL to fetch and clean (https://...)."),
  },
  async ({ url }) => {
    if (!PRIVATE_KEY) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "Skim requires payment via x402. Set the SKIM_WALLET_PRIVATE_KEY environment variable to a Base wallet funded with USDC. See https://skim402.com for details.",
          },
        ],
      };
    }

    let res: Response;
    try {
      res = await payFetch(`${BASE_URL}/api/v1/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode: "basic" }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Skim request failed: ${msg}. Common causes: wallet has no USDC on Base, or the price exceeds SKIM_MAX_PRICE_USD (${MAX_PRICE_USD}).`,
          },
        ],
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Skim returned ${res.status} ${res.statusText}: ${body || "(no body)"}`,
          },
        ],
      };
    }

    const data = (await res.json()) as {
      markdown?: string;
      text?: string;
      metadata?: Record<string, unknown>;
    };

    const metaLines = data.metadata
      ? Object.entries(data.metadata)
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
      : [];
    const frontmatter =
      metaLines.length > 0 ? `---\n${metaLines.join("\n")}\n---\n\n` : "";

    return {
      content: [
        {
          type: "text",
          text: frontmatter + (data.markdown ?? data.text ?? ""),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

// Surface startup status on stderr so MCP clients can show it in their logs
// without interfering with the stdio JSON-RPC stream.
if (walletAddress) {
  process.stderr.write(
    `skim-mcp ready — paying from ${walletAddress} (max $${MAX_PRICE_USD}/call) → ${BASE_URL}\n`,
  );
} else {
  process.stderr.write(
    `skim-mcp ready (NO WALLET) — set SKIM_WALLET_PRIVATE_KEY to enable paid reads → ${BASE_URL}\n`,
  );
}

# skim-mcp

**Give your AI agent the ability to read any URL — clean Markdown, ~4x smaller than raw HTML. No ads, no nav, no boilerplate.**

[![npm version](https://img.shields.io/npm/v/skim-mcp.svg)](https://www.npmjs.com/package/skim-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=skim402)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

`skim-mcp` is the official Model Context Protocol server for [Skim](https://skim402.com) — the clean reader API for AI agents. It exposes one tool, `read_url`, that your agent can call to fetch any web page as agent-ready Markdown plus structured metadata (title, byline, published date, language, excerpt).

> **See it before you wire it:** [try Skim free in your browser](https://freeskims.skim402.com) — 10 free skims a day, no signup. Paste a URL, see exactly what your agent gets back.

![Skim in action — one URL in, clean Markdown out](https://raw.githubusercontent.com/JessieJanie/skim402/main/demo.gif)

---

## Quickstart (60 seconds)

### Option A — Card API key (recommended)

**1.** Get a free key at **[skim402.com/pricing](https://skim402.com/pricing)** — 1,000 reads/month, card required at signup.

**2.** Add to your MCP client config:

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "skim": {
      "command": "npx",
      "args": ["-y", "skim-mcp"],
      "env": {
        "SKIM_API_KEY": "sk402_your_key_here"
      }
    }
  }
}
```

**Cursor** — edit `~/.cursor/mcp.json` (or **Settings → MCP**) with the same JSON block.

**Cline, Continue, Zed, or any other MCP client** — same shape; the binary is `npx skim-mcp` with one env var.

**3.** Restart your client and ask it to read something:

```
Claude, read https://en.wikipedia.org/wiki/HTTP_402 and summarize it.
```

---

### Option B — Pay per call with a crypto wallet

If you prefer x402 pay-per-call ($0.002 USDC on Base, no monthly plan):

```json
{
  "mcpServers": {
    "skim": {
      "command": "npx",
      "args": ["-y", "skim-mcp"],
      "env": {
        "SKIM_WALLET_PRIVATE_KEY": "0xYOUR_BASE_WALLET_PRIVATE_KEY"
      }
    }
  }
}
```

Fund a dedicated Base wallet with a small USDC balance ($1 ≈ 500 reads). Full setup guide with screenshots: **<https://skim402.com/wallet>**.

> **Use a fresh wallet, not your personal one.** This wallet's private key lives in a plaintext config file on your machine — treat it like a hot-wallet for paying $0.002 tolls, not a savings account.

---

## Try it without an agent

Test the endpoint directly. With a card key:

```bash
curl -X POST https://skim402.com/api/t/read \
  -H 'Authorization: Bearer sk402_your_key_here' \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/HTTP_402"}'
```

Or without a key (returns a 402 challenge so you can see the x402 protocol):

```bash
curl -i -X POST https://skim402.com/api/v1/read \
  -H 'content-type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/HTTP_402"}'
```

---

## The tool

### `read_url`

Reads any URL and returns clean Markdown with a YAML frontmatter block.

**Input:**

```json
{ "url": "https://example.com/article" }
```

**Output:**

```
---
title: Example article
byline: Jane Doe
published: 2025-01-15
lang: en
excerpt: A short summary...
---

# Example article

The cleaned article body in Markdown...
```

That's it. One tool, one input, one shape of output. Designed to drop into any agent's tool-calling loop with zero ceremony.

---

## Configuration

| Variable                  | Required              | Default               | Notes                                                                                                                                                                              |
| ------------------------- | --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKIM_API_KEY`            | **yes** (or wallet)   | —                     | Card-plan API key (`sk402_...`). Get one free at [skim402.com/pricing](https://skim402.com/pricing). Takes priority over `SKIM_WALLET_PRIVATE_KEY`.                                |
| `SKIM_WALLET_PRIVATE_KEY` | **yes** (or card key) | —                     | Hex private key for the Base wallet that pays x402 reads ($0.002 USDC/call). Ignored when `SKIM_API_KEY` is set. Use a dedicated wallet — never your personal one.                |
| `SKIM_MAX_PRICE_USD`      | no                    | `0.01`                | Wallet lane only. Hard cap on per-call price in USD. Skim is `$0.002`/call — leave alone unless tuning.                                                                            |
| `SKIM_API_URL`            | no                    | `https://skim402.com` | Override the API base URL. For self-hosting or local development.                                                                                                                  |
| `SKIM_TIMEOUT_MS`         | no                    | `90000`               | Hard deadline per call in milliseconds. Aborts stalled requests so a single bad call can never hang your agent. Unsettled calls are never charged, so retry is safe.               |

---

## How it actually works

**Card lane:**

```
your agent ──► skim-mcp ──► POST https://skim402.com/api/t/read
                                 Authorization: Bearer sk402_...
                                        │
                                        ▼
                                200 OK + clean Markdown
```

**Wallet lane (x402):**

```
your agent ──► skim-mcp ──► POST https://skim402.com/api/v1/read
                   ▲                       │
                   │                       ▼
                   │              402 Payment Required
                   │                  (x402 challenge)
                   │                       │
                   ▼                       │
   x402-fetch signs EIP-3009 ◄────────────┘
   USDC transfer authorization
                   │
                   ▼
        retry POST with X-PAYMENT header
                   │
                   ▼
   Skim verifies + settles via Coinbase CDP
                   │
                   ▼
        200 OK + clean Markdown
```

End-to-end latency is typically **1.5–2 seconds** including settlement. Wallet-lane private keys never leave your machine — they only sign authorizations locally.

---

## Security

- **Card key:** stored in your MCP client's JSON config. Anyone with read access to that file can use your key. Keep your key small-balance or use the free plan.
- **Wallet key:** lives in the same JSON config in plaintext. Anyone with access to your home directory can drain the wallet. Keep it funded with only as much USDC as you're willing to spend in a runaway loop.
- **No outbound telemetry from this package.** `skim-mcp` only talks to `skim402.com` (or whatever you set as `SKIM_API_URL`). No analytics, no error reporting, no phone-home.

---

## Troubleshooting

**"No tool named `read_url` shows up in Claude/Cursor."**
Restart the client fully (quit, don't just reload the window). MCP servers are spawned at client startup. If still missing, run `npx skim-mcp` directly in a terminal — if you get a stack trace, it's likely Node < 18.

**"401 Unauthorized" with card key.**
Your `SKIM_API_KEY` is invalid or expired. Get a fresh one at [skim402.com/pricing](https://skim402.com/pricing).

**"402 Payment Required loops forever" (wallet lane).**
Your wallet is out of USDC on Base mainnet. Check the balance on [BaseScan](https://basescan.org/), top up if needed.

**"USDC is on Ethereum, not Base."**
This is the most common funding mistake. USDC on Ethereum mainnet does not work — Skim only accepts USDC on Base. See <https://skim402.com/wallet> for the bridging walkthrough.

---

## Links

- **Skim website** — <https://skim402.com>
- **Pricing & free key** — <https://skim402.com/pricing>
- **Wallet setup guide** — <https://skim402.com/wallet>
- **API docs** — <https://skim402.com/docs>
- **x402 protocol** — <https://x402.org>
- **Model Context Protocol** — <https://modelcontextprotocol.io>
- **GitHub** — <https://github.com/JessieJanie/skim402>

---

## License

MIT

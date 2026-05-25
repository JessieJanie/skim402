# skim-mcp

**Give your AI agent the ability to read any URL — clean Markdown, no ads, no nav, no boilerplate. Pays itself per call. No signup, no API key.**

[![npm version](https://img.shields.io/npm/v/skim-mcp.svg)](https://www.npmjs.com/package/skim-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=skim402)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

`skim-mcp` is the official Model Context Protocol server for [Skim](https://skim402.com) — the canonical [x402](https://x402.org) clean reader API. It exposes one tool, `read_url`, that your agent can call to fetch any web page as agent-ready Markdown plus structured metadata (title, byline, published date, language, excerpt). Each call costs **$0.002 in USDC on Base**, paid automatically by your local wallet over HTTP 402.

> _A 30-second demo GIF coming here soon._

---

## Quickstart (60 seconds)

### 1. Add to your MCP-compatible client

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

**Cursor** — edit `~/.cursor/mcp.json` (or **Settings → MCP**) with the same JSON block.

**Cline, Continue, Zed, or any other MCP client** — same shape; the binary is `npx skim-mcp` with one env var.

### 2. Fund a Base wallet with $1 of USDC

A dollar funds roughly 500 reads. Full step-by-step (with screenshots, for non-crypto-native devs): **<https://skim402.com/wallet>**.

> **Use a fresh wallet, not your personal one.** This wallet's private key lives in a plaintext config file on your machine — treat it like a hot-wallet for paying $0.002 tolls, not a savings account.

### 3. Restart your client and ask it to read something

```
Claude, read https://en.wikipedia.org/wiki/HTTP_402 and summarize it.
```

The agent will call `read_url`, your local wallet will sign an EIP-3009 USDC authorization for $0.002, Skim returns clean Markdown, and Claude summarizes. You'll see the payment receipt in your wallet's transaction history on [BaseScan](https://basescan.org/).

---

## Try it without an agent

Skeptical? Test the upstream endpoint directly — it'll return a 402 challenge so you can see the protocol in action:

```bash
curl -i -X POST https://skim402.com/api/v1/read \
  -H 'content-type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/HTTP_402"}'
```

You'll get back `HTTP/1.1 402 Payment Required` with the x402 challenge in the response body. To then *pay* the challenge from a script (not an agent), see [x402-fetch](https://www.npmjs.com/package/x402-fetch).

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

| Variable                  | Required | Default               | Notes                                                                                                                                                                              |
| ------------------------- | -------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKIM_WALLET_PRIVATE_KEY` | **yes**  | —                     | Hex private key for the Base wallet that pays for reads. With or without `0x` prefix. Use a dedicated wallet — never your personal one.                                            |
| `SKIM_MAX_PRICE_USD`      | no       | `0.01`                | Hard cap on per-call price in USD. The wallet refuses to sign for anything above this. Skim is currently `$0.002`/call, well under the default cap — leave it alone unless tuning. |
| `SKIM_API_URL`            | no       | `https://skim402.com` | Override the API base URL. For self-hosting or local development.                                                                                                                  |

---

## How it actually works

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
   Skim verifies + settles via Coinbase CDP facilitator
                  │
                  ▼
        200 OK + clean Markdown
```

End-to-end latency is typically **1.5–2 seconds** including settlement. Your private key never leaves your machine — it only signs authorizations locally.

---

## Security

- **Dedicated wallet, always.** Fund it with only as much USDC as you're willing to spend in a runaway loop. The `SKIM_MAX_PRICE_USD` cap catches accidental price escalations on the server side.
- **Plaintext config caveat.** MCP clients read the private key from a JSON file on disk in plaintext. Anyone with read access to your home directory can drain the wallet. This is a property of every MCP server that needs credentials — keep the wallet small.
- **No outbound telemetry from this package.** `skim-mcp` only talks to `skim402.com` (or whatever you set as `SKIM_API_URL`). No analytics, no error reporting, no phone-home.

---

## Troubleshooting

**"No tool named `read_url` shows up in Claude/Cursor."**
Restart the client fully (quit, don't just reload the window). MCP servers are spawned at client startup. If still missing, run `npx skim-mcp` directly in a terminal — if you get a stack trace, it's likely Node < 18.

**"402 Payment Required loops forever."**
Your wallet is out of USDC on Base mainnet (or you set `SKIM_API_URL` to a server expecting payment on a different network). Check the balance on [BaseScan](https://basescan.org/), top up if needed.

**"insufficient funds for gas"**
Counter-intuitive but: x402 USDC transfers are gasless from your wallet's perspective (the facilitator pays gas, you only sign the authorization). If you see this error, you almost certainly funded the wrong wallet or the wrong network — verify the address in your config matches the one holding the USDC.

**"USDC is on Ethereum, not Base."**
This is the most common funding mistake. USDC on Ethereum mainnet does not work — Skim only accepts USDC on Base. See <https://skim402.com/wallet> for the bridging walkthrough.

---

## Links

- **Skim website** — <https://skim402.com>
- **Wallet setup guide** — <https://skim402.com/wallet>
- **API docs** — <https://skim402.com/docs>
- **x402 protocol** — <https://x402.org>
- **Model Context Protocol** — <https://modelcontextprotocol.io>
- **GitHub** — <https://github.com/JessieJanie/skim402>

---

## License

MIT

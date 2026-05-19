# skim-mcp

MCP (Model Context Protocol) server for [Skim](https://skim402.com) — clean web
reader for AI agents. Pays **$0.002 per call in USDC on Base** over the
[x402](https://x402.org) protocol. No signup. No API keys. No monthly bills.

Give your agent the ability to read any URL and get back clean, agent-ready
Markdown (no nav, no ads, no boilerplate) plus structured metadata (title,
byline, published date, language, excerpt).

## What you need

1. **Node.js 18+**
2. A **Base wallet private key** with a small amount of **USDC** in it. A dollar
   funds ~500 reads. Use a fresh wallet — not your personal one.

> Don't have one? Create a key with `cast wallet new` (Foundry) or any EVM
> wallet, then send USDC to it on Base mainnet from Coinbase, an exchange, or
> another wallet.

## Install in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop. You'll see a new `read_url` tool. Ask Claude to read
any article and it'll fetch it through Skim and pay automatically.

## Install in Cursor

Edit `~/.cursor/mcp.json` (or the in-app **Settings → MCP** panel):

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

## Install in Cline / Continue / Zed

All MCP-compatible clients use the same shape. Run the binary as:

```bash
npx skim-mcp
```

with the same `SKIM_WALLET_PRIVATE_KEY` env var.

## Tools

### `read_url`

Reads any URL and returns clean Markdown plus a YAML frontmatter block with
metadata.

**Input:**

```json
{ "url": "https://example.com/article" }
```

**Output (text):**

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

## Environment variables

| Variable                   | Required | Default                | Notes                                                                                                                          |
| -------------------------- | -------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `SKIM_WALLET_PRIVATE_KEY`  | **yes**  | —                      | Hex private key for the Base wallet that pays for reads. With or without `0x` prefix.                                          |
| `SKIM_MAX_PRICE_USD`       | no       | `0.01`                 | Maximum USD per call. Caps how much the wallet will sign for in a single read. Skim is currently $0.002/call, well under this. |
| `SKIM_API_URL`             | no       | `https://skim402.com`  | Override the API base URL. Mostly for development.                                                                             |

## Security

- Use a **dedicated wallet**, not your personal one. Fund it with only as much
  USDC as you're willing to spend.
- The private key never leaves your machine. It's only used locally to sign
  EIP-3009 payment authorizations consumed by the Skim API.
- Sweep the receive side periodically if you're running Skim yourself.

## How it works

1. The MCP server receives a `read_url` call from your AI agent.
2. It POSTs to `https://skim402.com/api/v1/read`.
3. The server replies `402 Payment Required` with x402 payment details.
4. [`x402-fetch`](https://www.npmjs.com/package/x402-fetch) signs an EIP-3009
   USDC transfer authorization using your wallet, attaches it as the
   `X-PAYMENT` header, and retries.
5. Skim verifies + settles via the Coinbase CDP facilitator and returns the
   cleaned content.

End-to-end latency is typically <2 seconds.

## Links

- Skim — https://skim402.com
- x402 protocol — https://x402.org
- Model Context Protocol — https://modelcontextprotocol.io

## License

MIT

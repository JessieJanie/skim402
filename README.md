# skim-mcp

**Skim turns URLs into clean markdown for agents. Get a free card key at [https://skim402.com](https://skim402.com) (`sk402_`). Wallet/x402 is optional.**

[![npm version](https://img.shields.io/npm/v/skim-mcp.svg)](https://www.npmjs.com/package/skim-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=skim402)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

`skim-mcp` is the official Model Context Protocol server for [Skim](https://skim402.com). It turns any URL into clean, agent-ready Markdown (no ads, no nav, no boilerplate).

**Default path: a card-plan API key.** Get a free `sk402_` key at [skim402.com](https://skim402.com) ([pricing](https://skim402.com/pricing)). Paste it as `SKIM_API_KEY`. A crypto wallet is **not** required.

**Optional path: x402 wallet pay.** If you prefer pay-per-call in USDC on Base, you can set `SKIM_WALLET_PRIVATE_KEY` instead. Ignore this unless you want it.

**Tools in this package:** `read_url`, `read_urls`, `extract_url`, `crawl_url`, `read_pdf`, `watch_urls`, `check_watch`, `poll_signal`.

> **Try it in the browser:** [freeskims.skim402.com](https://freeskims.skim402.com) — 10 free skims a day. Paste a URL and see what your agent gets back.

![Skim in action — one URL in, clean Markdown out](https://raw.githubusercontent.com/JessieJanie/skim402/main/demo.gif)

---

## Quickstart (60 seconds)

### Card API key (recommended)

**1.** Get a free key at **[skim402.com](https://skim402.com)** — it starts with `sk402_`. Card required at signup; 1,000 reads/month on the free plan. Details: [skim402.com/pricing](https://skim402.com/pricing).

**2.** Add this to your MCP client. **Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows). **Cursor** — `~/.cursor/mcp.json` (or **Settings → MCP**). Same JSON works in Cline, Continue, Zed, and other MCP clients:

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

**3.** Restart the client and ask it to read a URL:

```
Read https://en.wikipedia.org/wiki/HTTP_402 and summarize it.
```

---

### Wallet / x402 (optional)

Only if you prefer pay-per-call ($0.002 USDC on Base) instead of a card key. You can skip this entire block.

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

Fund a **dedicated** Base wallet with a small USDC balance ($1 ≈ 500 reads). Setup guide: **<https://skim402.com/wallet>**.

> **Use a fresh wallet, not your personal one.** This private key lives in a plaintext config file on your machine — treat it like a hot wallet for $0.002 tolls, not a savings account.

---

## FAQ

**Do I need an API key?**  
Yes for the default path. Get a free `sk402_` key at [https://skim402.com](https://skim402.com). A wallet is optional.

**Is this wallet-only? Do I need crypto?**  
No. Card API key is the default. x402 wallet pay is optional.

**What tools can my agent call?**  
`read_url`, `read_urls` (batch), `extract_url`, `crawl_url`, `read_pdf`, `watch_urls`, `check_watch`, and `poll_signal`.

---

## Try it without an agent

With a card key:

```bash
curl -H 'Authorization: Bearer sk402_your_key_here' \
  'https://skim402.com/api/t/read?url=https://en.wikipedia.org/wiki/HTTP_402'
```

Wallet / x402 challenge (optional — returns HTTP 402 if you send no payment):

```bash
curl -i -X POST https://skim402.com/api/v1/read \
  -H 'content-type: application/json' \
  -d '{"url":"https://en.wikipedia.org/wiki/HTTP_402"}'
```

---

## The tools

### `read_url`

Reads any URL and returns clean Markdown with a YAML frontmatter block.

**Input:** `{ "url": "https://example.com/article" }`

**Routes:** `GET /api/t/read?url=` (API key) · `POST /api/v1/read` (wallet)

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

### `read_urls`

Batch-read 1–10 URLs in one call. Optional `stripLinks` / `stripImages`.

**Input:** `{ "urls": ["https://a.example", "https://b.example"] }`

**Routes:** `POST /api/t/read/batch` · `POST /api/v1/read/batch`

### `extract_url`

Structured JSON from a page. Pass a JSON Schema, or a preset: `article`, `product`, `job`, `review`, `event`, `table`.

**Input:** `{ "url": "https://example.com/product", "preset": "product" }`

**Routes:** `POST /api/t/extract` · `POST /api/v1/extract`

Presets are sent as schemas on those extract routes.

### `crawl_url`

Crawl a site (origin or start URL) and return clean Markdown per page. Discovers `sitemap.xml` / `robots.txt` sitemaps plus same-origin links. Cap 25 pages. **1 credit per successful page**; failed pages are not charged.

**Input:** `{ "url": "https://example.com", "maxPages": 10 }`

Optional: `stripLinks`, `stripImages`. Bare hosts like `example.com` are treated as `https://example.com`.

**Route:** `POST /api/t/crawl` (API key). No x402 `/v1` twin — set `SKIM_API_KEY`.

```
Crawl https://example.com (max 10 pages) and list the page titles.
```

### `read_pdf`

Fetch a public PDF URL and return clean Markdown plus an optional bookmark outline. Text comes only from the file. Image-only scans return **422** (no OCR). Files larger than **8 MB** return **413**. **3 credits**; failed conversions are not charged.

**Input:** `{ "url": "https://example.com/paper.pdf" }`

Optional: `outline` (default `true`).

**Route:** `POST /api/t/read-pdf` (API key). No x402 `/v1` twin — set `SKIM_API_KEY`.

```
Read the PDF at https://example.com/paper.pdf and summarize the outline.
```

### `poll_signal`

Poll a [Skim Signal](https://skim402.com/signals) and return the latest structured items (title, summary, source, timestamp, link, entities). **2 credits** per successful poll; failed polls are refunded.

**Requires `SKIM_API_KEY`.** Wallet-only configs get a clear error.

**Input:** `{ "slug": "ai-news", "limit": 20 }`

Optional filters (pass only those the feed documents): `forms` (sec-filings, campaign-finance), `categories` (deals), `fields` (research), `states` (film-incentives), `committees` (campaign-finance).

**Slugs:** `ai-news`, `sec-filings`, `crypto-news`, `macro`, `security`, `regulations`, `courts`, `recalls`, `deals`, `launches`, `trending`, `research`, `energy`, `entertainment`, `studio-jobs`, `campaign-finance`, `film-incentives`. Use `x402` for the ecosystem feed.

**Routes (API key):** `GET /api/t/signal/{slug}/latest?limit=` · `GET /api/t/feeds/x402/latest?limit=` (x402 is not `/signal/x402`)

```bash
curl -H 'Authorization: Bearer sk402_your_key_here' \
  'https://skim402.com/api/t/signal/ai-news/latest?limit=20'
```

```
Poll the ai-news signal for the latest 20 items.
```

### `watch_urls` / `check_watch`

Register 1–20 URLs, then poll for content diffs. `watch_id` is a secret.

**Input:** `{ "urls": ["https://competitor.com/pricing"], "note": "pricing" }` then `{ "watch_id": "w_…" }` (optional `status_only: true`)

**Routes (API key):** `POST /api/t/watch` · `GET /api/t/watch/diff?id=` · `GET /api/t/watch/status?id=`

**Routes (wallet):** `POST /api/v2/watch` · `GET /api/v2/watch/diff?id=` · `GET /api/v2/watch/status?id=`

### Example agent prompts

```
Read https://en.wikipedia.org/wiki/HTTP_402 and summarize it.

Read these three pages and compare their pricing: https://a.example/pricing https://b.example/pricing https://c.example/pricing

Extract the product name, price, and availability from https://example.com/products/notebook as JSON.

Crawl https://example.com (max 10 pages) and list the page titles.

Read the PDF at https://example.com/paper.pdf and summarize it.

Poll the ai-news signal for the latest 20 items.

Watch https://competitor.com/pricing and https://competitor.com/changelog, then check the watch for changes.
```

---

## Configuration

| Variable                  | Required              | Default               | Notes                                                                                                                                                                              |
| ------------------------- | --------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKIM_API_KEY`            | **yes** (or wallet)   | —                     | Card-plan API key (`sk402_...`). Get one free at [skim402.com](https://skim402.com) / [pricing](https://skim402.com/pricing). Takes priority over `SKIM_WALLET_PRIVATE_KEY`.       |
| `SKIM_WALLET_PRIVATE_KEY` | optional              | —                     | Only if you are not using a card key. Hex private key for a dedicated Base wallet that pays x402 reads ($0.002 USDC/call). Ignored when `SKIM_API_KEY` is set. Never use a personal wallet. |
| `SKIM_MAX_PRICE_USD`      | no                    | `0.01`                | Wallet lane only. Hard cap on per-call price in USD. Single reads are `$0.002`. Batch / extract / watch cost more — raise this (e.g. `0.05`) if the wallet lane rejects those calls. |
| `SKIM_API_URL`            | no                    | `https://skim402.com` | Override the API base URL. For self-hosting or local development.                                                                                                                  |
| `SKIM_TIMEOUT_MS`         | no                    | `90000`               | Hard deadline per call in milliseconds. Aborts stalled requests so a single bad call can never hang your agent. Unsettled calls are never charged, so retry is safe.               |

---

## How it actually works

**Card lane (default):**

```
your agent ──► skim-mcp ──► GET https://skim402.com/api/t/read?url=…
                                 Authorization: Bearer sk402_...
                                        │
                                        ▼
                                200 OK + clean Markdown
```

**Wallet lane (x402, optional):**

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

- **Card key:** stored in your MCP client's JSON config. Anyone with read access to that file can use your key. Keep your key on the free plan or a small-balance plan.
- **Wallet key (only if you use the optional wallet path):** lives in the same JSON config in plaintext. Anyone with access to your home directory can drain the wallet. Keep it funded with only as much USDC as you're willing to spend in a runaway loop.
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

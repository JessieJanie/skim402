# Skim — Grok Build Plugin

Read webpages as clean, agent-ready Markdown inside Grok Build. Skim removes
navigation, ads, scripts, and other page chrome so Grok can work from the
content that matters.

This is a **card-key-only** plugin. It never asks for, reads, or configures a
wallet private key, and it never makes an x402 payment. The MCP process only
calls `https://skim402.com` (or the URL configured by `SKIM_API_URL` in a
self-hosted setup).

## Setup

1. Create a Skim card API key at
   [skim402.com/pricing](https://skim402.com/pricing). The key starts with
   `sk402_`.
2. Put the key in the environment before starting Grok Build:

   ```bash
   export SKIM_API_KEY="sk402_your_key_here"
   ```

3. Install and enable this plugin from the Grok Build Marketplace. Grok
   expands `${SKIM_API_KEY}` when it starts the local MCP server.

The key stays in your environment and is passed to the local MCP process as an
`Authorization: Bearer` header. It is not stored in this plugin's files.

## Free reads and credit-consuming features

The card key unlocks Skim's included plan allowance; it is the only
authentication path exposed by this plugin.

- **Included/free allowance:** use `read_url` for one page or `read_urls` for
  a small batch of pages. These consume the reads included with the Skim card
  plan.
- **Credit-consuming features:** `extract_url`, `crawl_url`, `read_pdf`,
  `watch_urls`, `check_watch`, and `poll_signal` use the plan's feature
  credits. Check [pricing](https://skim402.com/pricing) before using them for
  larger jobs.
- **No automatic wallet fallback:** if a key is missing, invalid, or out of
  allowance, the tool reports that state. It does not request a wallet,
  private key, USDC, or x402 payment.

## Available tools

| Tool | Use it for |
| --- | --- |
| `read_url` | One URL → clean Markdown |
| `read_urls` | 1–10 URLs → clean Markdown per URL |
| `extract_url` | Structured JSON using a preset or JSON Schema |
| `crawl_url` | Same-origin site crawl, up to 25 pages |
| `read_pdf` | Text and outline from a public PDF |
| `watch_urls` | Register URLs for later change checks |
| `check_watch` | Read a watch diff or status |
| `poll_signal` | Read a structured Skim Signal feed |

Use `read_url` or `read_urls` for ordinary reading. Ask before starting a
crawl, PDF conversion, watch, signal poll, or structured extraction when the
user has not requested that operation.

## Example prompts

```text
Read https://en.wikipedia.org/wiki/HTTP_402 and summarize it.
```

```text
Read these two pages and compare their pricing:
https://example.com/pricing https://example.org/pricing
```

```text
Extract the product name, price, and availability from
https://example.com/product as JSON.
```

## Privacy and security

- The plugin has no hooks, agents, shell scripts, telemetry, or filesystem
  access.
- The MCP server receives only the URL and requested extraction parameters,
  plus the card key in an authorization header.
- Do not put the key in a repository, prompt, or shared project file. Rotate
  it at [skim402.com/pricing](https://skim402.com/pricing) if it is exposed.

See the [Skim API docs](https://skim402.com/docs) for endpoint behavior and
limits.
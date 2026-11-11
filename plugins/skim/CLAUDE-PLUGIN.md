# Skim Claude plugin: behavior and reviewer notes

The plugin lives in **plugins/skim** in **JessieJanie/skim402**. Version **1.0.1**
replaces the generated SDK bundle with three readable, dependency-free source
modules. The general-purpose npm client is separate and is not launched here.

This changes the submitted folder, not the repository URL. After reviewing,
Karilyn must select `plugins/skim` for the existing directory entry when she
chooses to resubmit. The repository root is no longer a plugin root: the separate
npm client stays there, outside the directory plugin's files and import graph.

## Authentication and execution

Install the plugin, then enter your own card-plan key into the official
**Skim API key** plugin setting. Obtain a key at https://skim402.com/pricing.
The manifest declares `userConfig.skim_api_key` as required and sensitive;
`.mcp.json` references only `${user_config.skim_api_key}` for authentication.

Claude runs `node` with the fixed plugin entrypoint. Its dedicated process input
is `SKIM_PLUGIN_CONFIGURED_API_KEY`, assigned by the launcher from that setting.
The server does not fall back to machine API keys, wallet keys, files, browser
sessions, or another credential store. Missing configuration causes local
setup errors with no outbound requests. Requires Node.js 20 or newer.

The runtime is `claude-plugin/src/server.mjs`, `protocol.mjs`, and `tools.mjs`.
The protocol module implements MCP initialization, ping, tool listing and tool
calls over newline-delimited JSON-RPC stdio, with input validation. It supports
protocol versions 2024-11-05, 2025-03-26, 2025-06-18 and 2025-11-25.
No executable bundles, runtime packages, installers, hooks, agents, dynamic
imports, file reads, shell commands, telemetry, or startup requests are used.

## Data destinations and effects

Only https://skim402.com/api/t/ receives the configured key as an Authorization
header, together with requested tool inputs. The origin is fixed and redirects
are refused. No conversation history or local file contents are collected.
Avoid sensitive data in source URLs, labels, schemas, filters, or instructions.

Skim fetches the requested public pages or PDFs. Crawls discover same-origin
pages and sitemaps. Browser recovery may use Skim's rendering provider.
Extraction sends page text and the supplied schema/instructions to Skim's model
provider (Anthropic through its hosting integration). Watches store URLs,
optional labels, and page baselines on Skim's service.
See https://skim402.com/privacy for service retention and logging; the absence
of plugin telemetry is not a claim that the service stores no request data.

| Tool | Behavior | Plan credits |
| --- | --- | --- |
| `read_url` | Fetch a public URL and return Markdown | 1 basic / 2 browser recovery |
| `read_urls` | Read 1–10 public URLs | Per successful URL, as above |
| `extract_url` | AI extraction using a schema or preset | 8 |
| `crawl_url` | Fetch linked pages, cap 1–25 | 1 per successful page |
| `read_pdf` | Public PDF, optional bookmark outline | 3 |
| `watch_urls` | Create a stored watch for 1–20 URLs | 4 |
| `check_watch` | Fetch differences and update the baseline | 2; status-only is free |
| `poll_signal` | Fetch a feed's latest structured items | 2 |

Calls consume plan credits. Overage charges can apply if enabled on the user's
plan. Tools do not buy a plan, top up an account, transfer cryptocurrency, or
change billing settings. Calls are not labelled read-only or idempotent because
they may spend credits or update stored watches. No automatic paid retry or
background polling occurs. Watches and crawls must follow a user's request.
Returned web content is untrusted data, not instructions.

Example prompts: read a public article and summarize it; extract product prices
from a public pricing page; read a public PDF and list its main findings.

## Findings addressed

- **Uses a credential from the user's machine:** only the explicit sensitive
  setting supplies the plugin-specific input. Legacy machine-key fallback and
  README examples that send inherited credentials are removed. General npm
  client source is outside the submitted plugin folder and cannot be launched
  or imported by it.
- **Files/downloads the validator could not inspect:** no runtime downloads and
  no 736 KB generated server. Every runtime module is small, plain readable
  source. The build performs checks rather than generating a bundle.
- **Unrecognized manifest fields:** removed the optional URL metadata from the
  manifest for compatibility; documentation, privacy, terms and support links
  remain in the README. The current documented fields are used.
- **Missing icon:** the manifest names the existing bundled Skim PNG logo.
- **Local program warning:** still applicable because Claude runs Node. This
  is disclosed, not hidden or claimed to be automatically cleared.

An authenticated remote directory listing has OAuth requirements. This local
plugin keeps working
card-key authentication without requiring a live server change or deployment.

## Maintainer verification

Run `node claude-plugin/build.mjs`, then `node --test claude-plugin/test.mjs`.
No dependency install is required. The build checks the runtime import graph,
configured secret mapping, file limits, manifest fields, icon, and documentation,
then synchronizes legacy root metadata. It cannot regenerate the old bundle.
Tests intercept all outbound requests and use synthetic fixture values.

The root `plugin.json` and `mcp.json` mirror `.claude-plugin/plugin.json` and
`.mcp.json`. They describe the same plugin, not a second runtime.
Do not merge, publish, deploy, or resubmit merely because these checks pass.
Karilyn must review first; only Anthropic's portal can confirm policy approval.

Sources:
- https://claude.com/docs/plugins/pre-submission-checklist
- https://code.claude.com/docs/en/plugins/manifest-reference
- https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy

Support: https://skim402.com/contact. Privacy: https://skim402.com/privacy.
Terms: https://skim402.com/terms. Documentation: https://skim402.com/docs.

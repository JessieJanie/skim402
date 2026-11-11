# Skim

Skim gives agents clean Markdown from public web pages and PDFs, structured extraction, site crawls, page watches and on-demand Signals. It uses a Skim card-plan key for the Claude plugin.

## Claude directory plugin

The plugin is now isolated in **plugins/skim**. Select that folder, not the repository root, for the existing Claude directory entry after Karilyn reviews and approves this change. No directory resubmission is performed by this branch.

- [Plugin installation and working examples](plugins/skim/README.md)
- [Authentication, data-use, credit costs and reviewer notes](plugins/skim/CLAUDE-PLUGIN.md)
- [Readable server source](plugins/skim/claude-plugin/src/server.mjs)

From the repository root, run:

```sh
node plugins/skim/claude-plugin/build.mjs
node --test plugins/skim/claude-plugin/test.mjs
```

No dependency install is required. The build checks committed readable source instead of generating a bundle. The plugin has its own sensitive user-config setting; it does not inherit a machine API key or wallet. A local Node program may still need human review. Passing local checks is not directory approval.

## Separate npm client

The existing general-purpose skim-mcp client remains in src/ and dist/, outside the Claude plugin folder, and is not imported or launched by the plugin. Its implementation, package entrypoint, wallet support, and Glama/Smithery launch configuration are unchanged. See the [published npm package](https://www.npmjs.com/package/skim-mcp) for that separate client.

[Documentation](https://skim402.com/docs) · [Support](https://skim402.com/contact) · [Privacy](https://skim402.com/privacy) · [Terms](https://skim402.com/terms)

MIT License.

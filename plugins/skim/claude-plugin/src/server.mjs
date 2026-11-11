#!/usr/bin/env node
// The launcher explicitly sets this plugin-only variable from sensitive userConfig.
// Never fall back to an existing machine API key, wallet, file, or another secret.
import { startStdio } from "./protocol.mjs";
import { tools, createToolCaller } from "./tools.mjs";

const configuredKey = process.env.SKIM_PLUGIN_CONFIGURED_API_KEY ?? "";
startStdio(tools, createToolCaller(configuredKey));
process.stderr.write("Skim Claude plugin ready; configure the API key in plugin settings.\n");

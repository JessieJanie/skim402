# Dockerfile for Glama (and any container host) to run the Skim MCP server.
#
# The server starts and responds to MCP introspection (initialize + tools/list)
# with no configuration, which is all Glama needs to evaluate quality.
#
# To enable paid reads at runtime, pass a funded Base wallet key:
#   docker run -e SKIM_WALLET_PRIVATE_KEY=0x... skim-mcp
FROM node:22-slim
# Pin the exact version so each rebuild busts Docker's layer cache and installs
# the intended release (prevents a stale cached `npm install` layer from
# reusing an older broken version). Bump this in lockstep with package.json.
RUN npm install -g skim-mcp@0.1.5
ENTRYPOINT ["skim-mcp"]

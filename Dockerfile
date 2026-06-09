# Dockerfile for Glama (and any container host) to run the Skim MCP server.
#
# The server starts and responds to MCP introspection (initialize + tools/list)
# with no configuration, which is all Glama needs to evaluate quality.
#
# To enable paid reads at runtime, pass a funded Base wallet key:
#   docker run -e SKIM_WALLET_PRIVATE_KEY=0x... skim-mcp
FROM node:22-slim
RUN npm install -g skim-mcp@latest
ENTRYPOINT ["skim-mcp"]

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { registerTools } from "./tools/definitions.js"
import { logger } from "./utils/logger.js"

const server = new McpServer(
  { name: "project-excel-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

registerTools(server)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info("MCP server corriendo")
}

main().catch((err) => {
  logger.error(err, "Error fatal")
  process.exit(1)
})

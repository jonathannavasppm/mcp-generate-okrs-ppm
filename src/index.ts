import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { toolDefinitions } from "./tools/definitions.js"
import { logger } from "./utils/logger.js"

const server = new Server(
  { name: "project-excel-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}))

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = toolDefinitions.find((t) => t.name === request.params.name)
  if (!tool) throw new Error(`Tool desconocida: ${request.params.name}`)
  return tool.handler(request.params.arguments as any)
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info("MCP server corriendo")
}

main().catch((err) => {
  logger.error(err, "Error fatal")
  process.exit(1)
})

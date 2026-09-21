import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { verifyConfig } from "./verify-config.js"
import { validateOriginFile } from "./validate-origin-file.js"

const validateOriginFileSchema = z.object({
  runId: z.string(),
})

export const registerTools = (server: McpServer) => {
  server.registerTool(
    "verifyConfig",
    {
      description:
        "Valida que PROJECTS y las env vars de Excel estén bien configuradas",
      inputSchema: z.object({}),
    },
    async () => verifyConfig()
  )

  server.registerTool(
    "validateOriginFile",
    {
      description:
        "Valida acceso real a fuentes y que la plantilla de Excel sea válida",
      inputSchema: validateOriginFileSchema,
    },
    async ({ runId }) => validateOriginFile(runId)
  )
}

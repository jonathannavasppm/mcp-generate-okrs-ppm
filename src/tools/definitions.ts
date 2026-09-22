import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { verifyConfig } from "./verify-config.js"
import { validateOriginFile } from "./validate-origin-file.js"
import { generateOKR } from "./generate-okr.js"

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

  server.registerTool(
    "generateOKR",
    {
      title: "Generar reporte OKR",
      description: "Recolecta todas las fuentes y genera el Excel consolidado",
      inputSchema: { runId: z.string() },
    },
    async ({ runId }) => generateOKR(runId)
  )
}

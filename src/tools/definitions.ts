import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { verifyConfig } from "./verify-config.js"
import { validateOriginFile } from "./validate-origin-file.js"
import { generateOKR } from "./generate-okr.js"
import { analyzeJiraSprints } from "./analyze-jira.js"

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

  server.registerTool(
    "analyzeJiraSprints",
    {
      title: "Analizar Sprints de Jira",
      description:
        "Calcula puntos de historia de HU comprometidos vs cumplidos para sprints cerrados durante el último mes o un mes específico",
      inputSchema: z.object({
        projectName: z
          .string()
          .optional()
          .describe("Nombre del proyecto configurado en PROJECTS"),
        projectKey: z.string().optional().describe("Clave del proyecto en Jira"),
        boardId: z.number().optional().describe("ID del Scrum board en Jira"),
        month: z
          .number()
          .min(1)
          .max(12)
          .optional()
          .describe("Mes a analizar (1-12). Por defecto: último mes"),
        year: z
          .number()
          .min(2000)
          .max(2100)
          .optional()
          .describe("Año a analizar (ej. 2026)"),
      }),
    },
    async (params) => analyzeJiraSprints(params)
  )
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { verifyConfig } from "./verify-config.js"
import { validateOriginFile } from "./validate-origin-file.js"
import { generateOKR } from "./generate-okr.js"
import { analyzeJiraSprints } from "./analyze-jira.js"
import { fillQuality } from "./fill-quality.js"

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
      title: "Generar Indicador de Cumplimiento (Jira)",
      description:
        "Calcula el cumplimiento de Sprints de Jira (KPI6) y genera automáticamente el archivo de Excel en la ruta configurada (EXCEL_OUTPUT_DIR) usando la plantilla",
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

  server.registerTool(
    "fillQuality",
    {
      title: "Llenar Calidad de Código (SonarQube)",
      description:
        "Llena el tab KPI3_CalidadCodigo con métricas de SonarQube. Si no se pasan repos, lee automáticamente los proyectos con sonarqube.enabled=true de PROJECTS.",
      inputSchema: z.object({
        repos: z
          .array(
            z.object({
              projectKey: z
                .string()
                .min(1)
                .describe("SonarQube project key"),
              baseUrl: z.string().min(1).describe("SonarQube base URL"),
              branch: z.string().min(1).describe("Branch a analizar"),
              apiKeyEnv: z
                .string()
                .optional()
                .describe(
                  "Nombre de la variable de entorno con el API key (por defecto SONARQUBE_API_KEY)"
                ),
            })
          )
          .optional()
          .describe(
            "Lista de repos SonarQube (opcional). Si se omite, se leen de PROJECTS los que tengan sonarqube.enabled=true. Cada repo llena una columna (B, C, D...)"
          ),
      }),
    },
    async (params) => fillQuality(params)
  )
}

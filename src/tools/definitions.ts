import { verifyConfig } from "./verify-config.js"
import { validateOriginFile } from "./validate-origin-file.js"

export const toolDefinitions = [
  {
    name: "verifyConfig",
    description:
      "Valida que PROJECTS y las env vars de Excel estén bien configuradas",
    inputSchema: { type: "object", properties: {} },
    handler: () => verifyConfig(),
  },
  {
    name: "validateOriginFile",
    description:
      "Valida acceso real a fuentes y que la plantilla de Excel sea válida",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string" } },
      required: ["runId"],
    },
    handler: (args: { runId: string }) => validateOriginFile(args.runId),
  },
]

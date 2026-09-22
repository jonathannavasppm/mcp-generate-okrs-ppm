import fs from "node:fs/promises"
import ExcelJS from "exceljs"
import { loadExcelEnv, loadProjects } from "../core/config-loader.js"
import { registry } from "../core/provider-registry.js"

import { loadState, requireStepOk, saveStep } from "../core/pipeline-state.js"
import type { ToolResponse } from "../types/types.js"

export async function validateOriginFile(runId: string): Promise<ToolResponse> {
  const state = await loadState(runId)
  requireStepOk(state, "verifyConfig")

  const errors: string[] = []
  const { EXCEL_TEMPLATE_PATH } = loadExcelEnv()

  try {
    await fs.access(EXCEL_TEMPLATE_PATH)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(EXCEL_TEMPLATE_PATH)
  } catch {
    errors.push(
      `Plantilla de Excel inválida o inaccesible: ${EXCEL_TEMPLATE_PATH}`
    )
  }

  const projects = loadProjects()
  for (const project of projects) {
    for (const provider of registry.getEnabledFor(project)) {
      const rawConfig: unknown = (project as unknown as Record<string, unknown>)[provider.key]
      const config = provider.configSchema.parse(rawConfig)
      const result = await provider.validateAccess(config, {
        projectName: project.name,
        projectPath: project.path,
      })
      if (!result.ok) {
        errors.push(`[${project.name}/${provider.key}] ${result.detail ?? "sin acceso"}`)
      }
    }
  }

  const ok = errors.length === 0
  await saveStep(runId, "validateOriginFile", { ok, errors })

  return {
    content: [
      { type: "text", text: JSON.stringify({ runId, ok, errors }, null, 2) },
    ],
    isError: !ok,
  }
}

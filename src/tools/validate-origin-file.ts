import fs from "node:fs/promises"
import ExcelJS from "exceljs"
import { loadExcelEnv } from "../core/config-loader.js"
import { loadState, requireStepOk, saveStep } from "../core/pipeline-state.js"
import type { ToolResponse } from "../types/types.js"

export async function validateOriginFile(runId: string): Promise<ToolResponse> {
  const state = await loadState(runId)
  requireStepOk(state, "verifyConfig")

  const errors: string[] = []
  const { EXCEL_TEMPLATE_PATH } = loadExcelEnv()

  try {
    await fs.access(EXCEL_TEMPLATE_PATH)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(EXCEL_TEMPLATE_PATH)
  } catch {
    errors.push(
      `Plantilla de Excel inválida o inaccesible: ${EXCEL_TEMPLATE_PATH}`
    )
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

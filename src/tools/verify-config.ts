import crypto from "node:crypto"
import { loadProjects, loadExcelEnv } from "../core/config-loader.js"
import { saveStep } from "../core/pipeline-state.js"
import type { ToolResponse } from "../types/types.js"

export async function verifyConfig(): Promise<ToolResponse> {
  const runId = crypto.randomUUID()
  const errors: string[] = []

  try {
    loadProjects()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  try {
    loadExcelEnv()
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  const ok = errors.length === 0
  await saveStep(runId, "verifyConfig", { ok, errors })

  return {
    content: [
      { type: "text", text: JSON.stringify({ runId, ok, errors }, null, 2) },
    ],
    isError: !ok,
  }
}

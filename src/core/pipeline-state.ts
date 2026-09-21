import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { McpAppError } from "../utils/errors.js"

export interface StepResult {
  ok: boolean
  timestamp: string
  errors: string[]
}

export interface PipelineState {
  runId: string
  steps: {
    verifyConfig?: StepResult
    validateOriginFile?: StepResult
  }
}

const statePath = (runId: string) =>
  path.join(os.tmpdir(), `mcp-run-${runId}.json`)

export async function loadState(runId: string): Promise<PipelineState> {
  try {
    const raw = await fs.readFile(statePath(runId), "utf-8")
    return JSON.parse(raw)
  } catch {
    return { runId, steps: {} }
  }
}

export async function saveStep(
  runId: string,
  step: keyof PipelineState["steps"],
  result: { ok: boolean; errors: string[] }
): Promise<void> {
  const state = await loadState(runId)
  state.steps[step] = { ...result, timestamp: new Date().toISOString() }
  await fs.writeFile(statePath(runId), JSON.stringify(state, null, 2))
}

export function requireStepOk(
  state: PipelineState,
  step: keyof PipelineState["steps"]
): void {
  const result = state.steps[step]
  if (!result)
    throw new McpAppError(`Debes ejecutar "${step}" antes de continuar`)
  if (!result.ok)
    throw new McpAppError(
      `El paso "${step}" falló, revisa sus errores antes de continuar`
    )
}

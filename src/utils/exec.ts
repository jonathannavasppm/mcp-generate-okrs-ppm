import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export interface ExecJsonResult<T> {
  data: T | null
  raw: string
  exitCode: number
}

interface ExecFileError extends Error {
  stdout?: string
  code?: number | string
}

function isExecFileError(error: unknown): error is ExecFileError {
  return error instanceof Error
}

export async function execNpmJson<T>(
  args: string[],
  cwd: string
): Promise<ExecJsonResult<T>> {
  try {
    const { stdout } = await execFileAsync("npm", args, {
      cwd,
      maxBuffer: 1024 * 1024 * 20,
    })
    return { data: JSON.parse(stdout) as T, raw: stdout, exitCode: 0 }
  } catch (error: unknown) {
    if (isExecFileError(error) && error.stdout) {
      try {
        const exitCode = typeof error.code === "number" ? error.code : 1
        return {
          data: JSON.parse(error.stdout) as T,
          raw: error.stdout,
          exitCode,
        }
      } catch {
        // stdout no era JSON parseable → cae al error real de abajo
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Fallo ejecutando "npm ${args.join(" ")}" en ${cwd}: ${message}`
    )
  }
}

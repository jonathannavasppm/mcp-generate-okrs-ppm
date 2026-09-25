import type { ZodType } from "zod"
import type ExcelJS from "exceljs"

export interface ToolResponse extends Record<string, unknown> {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export interface ProjectConfig {
  name: string
  path: string
  branch: string
  timeToCompare: string
  [key: string]: unknown // permite bloques opcionales por fuente (sonarqube, jira, npm-audit...)
}

export interface ValidationResult {
  ok: boolean
  detail?: string
}

export interface ProviderContext {
  projectName: string
  projectPath: string
  timeToCompare: string
  projectIndex?: number
  projectCount?: number
}

export interface DataProvider<TConfig = unknown> {
  readonly key: string
  readonly excelSheetName: string
  readonly configSchema: ZodType<TConfig>

  validateAccess(
    config: TConfig,
    ctx: ProviderContext
  ): Promise<ValidationResult>
  fetchData(config: TConfig, ctx: ProviderContext): Promise<unknown>
  writeToExcel(
    sheet: ExcelJS.Worksheet,
    data: unknown,
    ctx: ProviderContext
  ): void

  buildSharedDetailReport?(
    entries: Array<{ ctx: ProviderContext; data: unknown }>,
    runOutputDir: string
  ): Promise<string>
}

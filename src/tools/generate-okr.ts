import "../providers/index.js"
import ExcelJS from "exceljs"
import path from "node:path"
import fs from "node:fs/promises"
import { registry } from "../core/provider-registry.js"
import { loadProjects, loadExcelEnv } from "../core/config-loader.js"
import { loadState, requireStepOk } from "../core/pipeline-state.js"
import type { DataProvider, ProviderContext, ToolResponse } from "../types/types.ts"

interface StepResult {
  step: string
  ok: boolean
  error?: string
}

const PROVIDER_ORDER = [
  "npm-audit",
  "uptimeRobot",
  "jira",
  "sonarqube",
] as const

function providerRank(key: string): number {
  const index = (PROVIDER_ORDER as readonly string[]).indexOf(key)
  return index === -1 ? PROVIDER_ORDER.length : index
}

async function resolveMasterOutputPath(baseDir: string): Promise<string> {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, "0")
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const yyyy = now.getFullYear()
  const runDir = path.join(baseDir, "Indicadores", `${dd}-${mm}-${yyyy}`)
  await fs.mkdir(runDir, { recursive: true })
  return path.join(runDir, `reporte-okr-${dd}-${mm}-${yyyy}.xlsx`)
}

export async function generateOKR(runId: string): Promise<ToolResponse> {
  const state = await loadState(runId)
  requireStepOk(state, "verifyConfig")
  requireStepOk(state, "validateOriginFile")

  const projects = loadProjects()
  const { EXCEL_TEMPLATE_PATH, EXCEL_OUTPUT_DIR } = loadExcelEnv()

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(EXCEL_TEMPLATE_PATH)

  const stepResults: StepResult[] = []
  const sharedReportEntries = new Map<
    string,
    Array<{ ctx: ProviderContext; data: unknown }>
  >()

  for (const project of projects) {
    const providers = registry
      .getEnabledFor(project)
      .slice()
      .sort(
        (a: DataProvider, b: DataProvider) =>
          providerRank(a.key) - providerRank(b.key)
      )

    for (const provider of providers) {
      const stepLabel = `${project.name}/${provider.key}`
      const ctx: ProviderContext = {
        projectName: project.name,
        projectPath: project.path,
      }
      try {
        const rawConfig: unknown = (
          project as unknown as Record<string, unknown>
        )[provider.key]
        const config = provider.configSchema.parse(rawConfig)
        const data = await provider.fetchData(config, ctx)

        const sheet = workbook.getWorksheet(provider.excelSheetName)
        if (!sheet)
          throw new Error(
            `Tab "${provider.excelSheetName}" no existe en la plantilla`
          )
        provider.writeToExcel(sheet, data, ctx)

        if (provider.buildSharedDetailReport) {
          const list = sharedReportEntries.get(provider.key) ?? []
          list.push({ ctx, data })
          sharedReportEntries.set(provider.key, list)
        }
        stepResults.push({ step: stepLabel, ok: true })
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        stepResults.push({ step: stepLabel, ok: false, error: message })
        continue
      }
    }
  }

  const masterOutputPath = await resolveMasterOutputPath(EXCEL_OUTPUT_DIR)
  const runOutputDir = path.dirname(masterOutputPath)
  const detailReportPaths: Record<string, string> = {}

  for (const [providerKey, entries] of sharedReportEntries) {
    const provider = registry.get(providerKey)
    if (!provider?.buildSharedDetailReport) continue
    detailReportPaths[providerKey] = await provider.buildSharedDetailReport(
      entries,
      runOutputDir
    )
  }

  const vulSheet = workbook.getWorksheet("Vul")
  if (vulSheet && detailReportPaths["npm-audit"]) {
    const relativePath = path.relative(
      runOutputDir,
      detailReportPaths["npm-audit"]
    )
    let linkRow = 2
    while (vulSheet.getCell(linkRow, 1).value != null) linkRow++
    vulSheet.getCell(linkRow, 1).value = {
      text: "Ver detalle de vulnerabilidades por proyecto",
      hyperlink: relativePath,
    }
  }

  await workbook.xlsx.writeFile(masterOutputPath)

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            runId,
            outputPath: masterOutputPath,
            detailReportPaths,
            success: stepResults.every((s) => s.ok),
            steps: stepResults,
          },
          null,
          2
        ),
      },
    ],
  }
}

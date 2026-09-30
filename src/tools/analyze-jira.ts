import fs from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"
import { loadProjects, loadExcelEnv } from "../core/config-loader.js"
import { JiraConfigSchema } from "../providers/jira/config.schema.js"
import { collectJiraSprintData } from "../providers/jira/client.js"
import { jiraProvider, writeJiraEvidence } from "../providers/jira/provider.js"
import type { JiraProjectReport } from "../providers/jira/types.js"
import type { ProviderContext, ToolResponse } from "../types/types.js"

export interface AnalyzeJiraParams {
  projectName?: string
  projectKey?: string
  boardId?: number
  month?: number
  year?: number
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

export async function analyzeJiraSprints(
  params: AnalyzeJiraParams = {}
): Promise<ToolResponse> {
  try {
    const projects = loadProjects()
    const { EXCEL_TEMPLATE_PATH, EXCEL_OUTPUT_DIR } = loadExcelEnv()

    // 1. Filtrar proyectos con Jira habilitado
    const targetProjects = params.projectName
      ? projects.filter((p) => p.name === params.projectName)
      : projects.filter((p) => {
          const jiraBlock = (p as unknown as Record<string, unknown>).jira as
            | { enabled?: boolean }
            | undefined
          return jiraBlock?.enabled === true
        })

    if (targetProjects.length === 0) {
      throw new Error(
        `No se encontró ningún proyecto con Jira habilitado en PROJECTS ${
          params.projectName ? `con nombre "${params.projectName}"` : ""
        }`
      )
    }

    // 2. Preparar el archivo de Excel maestro
    const masterOutputPath = await resolveMasterOutputPath(EXCEL_OUTPUT_DIR)
    const runOutputDir = path.dirname(masterOutputPath)
    const workbook = new ExcelJS.Workbook()

    let fileToRead = EXCEL_TEMPLATE_PATH
    try {
      await fs.access(masterOutputPath)
      fileToRead = masterOutputPath
    } catch {
      fileToRead = EXCEL_TEMPLATE_PATH
    }

    await workbook.xlsx.readFile(fileToRead)

    let sheet = workbook.getWorksheet(jiraProvider.excelSheetName)
    if (!sheet) {
      sheet = workbook.addWorksheet(jiraProvider.excelSheetName)
    }

    const sharedReportEntries: Array<{ ctx: ProviderContext; data: JiraProjectReport }> = []
    const projectSummaries: Array<{
      projectName: string
      sprintsCount: number
      totalCommittedStoryPoints: number
      totalCompletedStoryPoints: number
      overallCompletionPercentage: number
    }> = []

    // 3. Procesar cada proyecto
    for (let index = 0; index < targetProjects.length; index++) {
      const project = targetProjects[index]
      const rawJiraConfig = (project as unknown as Record<string, unknown>).jira
      const baseConfig = JiraConfigSchema.parse(rawJiraConfig)

      const finalConfig = {
        ...baseConfig,
        projectKey: params.projectKey ?? baseConfig.projectKey,
        boardId: params.boardId ?? baseConfig.boardId,
        targetMonth: params.month ?? baseConfig.targetMonth,
        targetYear: params.year ?? baseConfig.targetYear,
      }

      const report = await collectJiraSprintData(finalConfig, project.name)

      const ctx: ProviderContext = {
        projectName: project.name,
        projectPath: project.path,
        timeToCompare: project.timeToCompare,
        projectIndex: index,
        projectCount: targetProjects.length,
      }

      jiraProvider.writeToExcel(sheet, report, ctx)
      sharedReportEntries.push({ ctx, data: report })

      projectSummaries.push({
        projectName: project.name,
        sprintsCount: report.sprints.length,
        totalCommittedStoryPoints: report.totalCommittedStoryPoints,
        totalCompletedStoryPoints: report.totalCompletedStoryPoints,
        overallCompletionPercentage: report.overallCompletionPercentage,
      })
    }

    // 4. Generar reporte secundario de sprints
    let detailReportPath = ""
    if (jiraProvider.buildSharedDetailReport) {
      detailReportPath = await jiraProvider.buildSharedDetailReport(
        sharedReportEntries,
        runOutputDir
      )
      writeJiraEvidence(workbook, sharedReportEntries, detailReportPath, runOutputDir)
    }

    // 5. Guardar el archivo Excel maestro
    await workbook.xlsx.writeFile(masterOutputPath)

    const periodLabel = sharedReportEntries[0]?.data.period.label || ""

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message: "Reporte de cumplimiento (KPI6) generado exitosamente en Excel",
              period: periodLabel,
              outputPath: masterOutputPath,
              detailReportPath,
              projects: projectSummaries,
            },
            null,
            2
          ),
        },
      ],
      isError: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: `Error al generar reporte de cumplimiento de Jira: ${message}`,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    }
  }
}

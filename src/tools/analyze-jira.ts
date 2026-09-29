import { loadProjects } from "../core/config-loader.js"
import { JiraConfigSchema } from "../providers/jira/config.schema.js"
import { collectJiraSprintData } from "../providers/jira/client.js"
import type { JiraProjectReport } from "../providers/jira/types.js"
import type { ToolResponse } from "../types/types.js"

export interface AnalyzeJiraParams {
  projectName?: string
  projectKey?: string
  boardId?: number
  month?: number
  year?: number
}

function formatMarkdownTable(report: JiraProjectReport): string {
  let md = `## Análisis de Sprints Jira - ${report.projectName}\n`
  md += `**Período evaluado:** ${report.period.label} (${new Date(report.period.startDate).toISOString().slice(0, 10)} al ${new Date(report.period.endDate).toISOString().slice(0, 10)})\n`
  md += `**Filtro:** Únicamente Historias de Usuario (HU / Stories). Se excluyen Bugs, Tareas y Subtareas.\n`
  md += `**Criterio:** Sprints cerrados durante el mes.\n\n`

  md += `| Sprint | Fecha Inicio | Fecha Cierre | Puntos Comprometidos (HU) | Puntos Cumplidos (HU) | % Cumplimiento | Total HU | HU Cumplidas |\n`
  md += `| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n`

  for (const sprint of report.sprints) {
    const startDate = sprint.startDate
      ? new Date(sprint.startDate).toLocaleDateString("es-ES")
      : "-"
    const completeDate = sprint.completeDate
      ? new Date(sprint.completeDate).toLocaleDateString("es-ES")
      : sprint.endDate
        ? new Date(sprint.endDate).toLocaleDateString("es-ES")
        : "-"

    md += `| **${sprint.sprintName}** | ${startDate} | ${completeDate} | ${sprint.committedStoryPoints} SP | ${sprint.completedStoryPoints} SP | **${sprint.completionPercentage.toFixed(2)}%** | ${sprint.totalStories} | ${sprint.completedStories} |\n`
  }

  const totalStories = report.sprints.reduce((a, s) => a + s.totalStories, 0)
  const totalCompletedStories = report.sprints.reduce(
    (a, s) => a + s.completedStories,
    0
  )

  md += `| **TOTAL / GENERAL** | — | — | **${report.totalCommittedStoryPoints} SP** | **${report.totalCompletedStoryPoints} SP** | **${report.overallCompletionPercentage.toFixed(2)}%** | **${totalStories}** | **${totalCompletedStories}** |\n\n`

  if (report.sprints.length === 0) {
    md += `> *No se encontraron sprints cerrados en el período especificado.*\n\n`
  }

  return md
}

export async function analyzeJiraSprints(
  params: AnalyzeJiraParams = {}
): Promise<ToolResponse> {
  try {
    const projects = loadProjects()
    const targetProject = params.projectName
      ? projects.find((p) => p.name === params.projectName)
      : projects.find((p) => {
          const jiraBlock = (p as unknown as Record<string, unknown>).jira as
            | { enabled?: boolean }
            | undefined
          return jiraBlock?.enabled === true
        })

    if (!targetProject) {
      throw new Error(
        `No se encontró ningún proyecto con Jira habilitado en PROJECTS ${params.projectName ? `con nombre "${params.projectName}"` : ""}`
      )
    }

    const rawJiraConfig = (targetProject as unknown as Record<string, unknown>).jira
    const baseConfig = JiraConfigSchema.parse(rawJiraConfig)

    const finalConfig = {
      ...baseConfig,
      projectKey: params.projectKey ?? baseConfig.projectKey,
      boardId: params.boardId ?? baseConfig.boardId,
      targetMonth: params.month ?? baseConfig.targetMonth,
      targetYear: params.year ?? baseConfig.targetYear,
    }

    const report = await collectJiraSprintData(finalConfig, targetProject.name)
    const tableMarkdown = formatMarkdownTable(report)

    return {
      content: [
        {
          type: "text",
          text: tableMarkdown,
        },
        {
          type: "text",
          text: JSON.stringify(report, null, 2),
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
          text: `Error al analizar sprints de Jira: ${message}`,
        },
      ],
      isError: true,
    }
  }
}

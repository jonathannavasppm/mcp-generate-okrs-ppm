import fs from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"
import { JiraConfigSchema, type JiraConfig } from "./config.schema.js"
import { collectJiraSprintData, validateJiraAccess } from "./client.js"
import type {
  DataProvider,
  ProviderContext,
  ValidationResult,
} from "../../types/types.js"
import type { JiraProjectReport } from "./types.js"

function asJiraReport(data: unknown): JiraProjectReport {
  if (!data || typeof data !== "object" || !("sprints" in data)) {
    throw new Error("Se esperaba JiraProjectReport")
  }
  return data as JiraProjectReport
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF2E75B6" },
}

const SUMMARY_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1F4E79" },
}

const TOTAL_ROW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" },
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD3D3D3" } },
  left: { style: "thin", color: { argb: "FFD3D3D3" } },
  bottom: { style: "thin", color: { argb: "FFD3D3D3" } },
  right: { style: "thin", color: { argb: "FFD3D3D3" } },
}

function styleHeaderCell(
  cell: ExcelJS.Cell,
  text: string,
  fill: ExcelJS.Fill = HEADER_FILL
): void {
  cell.value = text
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 }
  cell.fill = fill
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
  cell.border = THIN_BORDER
}

function styleDataCell(
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  alignment: Partial<ExcelJS.Alignment> = { vertical: "middle", horizontal: "center" },
  numFmt?: string
): void {
  cell.value = value
  cell.font = { size: 10 }
  cell.alignment = alignment
  cell.border = THIN_BORDER
  if (numFmt) cell.numFmt = numFmt
}

function styleTotalCell(
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  alignment: Partial<ExcelJS.Alignment> = { vertical: "middle", horizontal: "center" },
  numFmt?: string
): void {
  cell.value = value
  cell.font = { bold: true, size: 10 }
  cell.fill = TOTAL_ROW_FILL
  cell.alignment = alignment
  cell.border = THIN_BORDER
  if (numFmt) cell.numFmt = numFmt
}

export const jiraProvider: DataProvider<JiraConfig> = {
  key: "jira",
  excelSheetName: "KPI6_Cumplimiento",
  configSchema: JiraConfigSchema,

  async validateAccess(
    config: JiraConfig,
    _ctx: ProviderContext
  ): Promise<ValidationResult> {
    const result = await validateJiraAccess(config)
    return {
      ok: result.ok,
      detail: result.detail,
    }
  },

  async fetchData(
    config: JiraConfig,
    ctx: ProviderContext
  ): Promise<JiraProjectReport> {
    return collectJiraSprintData(config, ctx.projectName)
  },

  writeToExcel(
    sheet: ExcelJS.Worksheet,
    data: unknown,
    ctx: ProviderContext
  ): void {
    const report = asJiraReport(data)
    const projectIndex = ctx.projectIndex ?? 0
    const projectCount = ctx.projectCount ?? 1

    // Configuración de anchos de columna en la primera pasada
    if (projectIndex === 0) {
      sheet.getColumn(1).width = 4 // Margen A
      sheet.getColumn(2).width = 24 // B: Sprint
      sheet.getColumn(3).width = 15 // C: Fecha Inicio
      sheet.getColumn(4).width = 15 // D: Fecha Cierre
      sheet.getColumn(5).width = 25 // E: Puntos Comprometidos (HU)
      sheet.getColumn(6).width = 22 // F: Puntos Cumplidos (HU)
      sheet.getColumn(7).width = 16 // G: % Cumplimiento
      sheet.getColumn(8).width = 12 // H: Total HU
      sheet.getColumn(9).width = 14 // I: HU Cumplidas
      sheet.getColumn(10).width = 5 // J: Separador vacío
      sheet.getColumn(11).width = 22 // K: Proyecto
      sheet.getColumn(12).width = 22 // L: Puntos Comprometidos
      sheet.getColumn(13).width = 20 // M: Puntos Cumplidos
      sheet.getColumn(14).width = 16 // N: % Cumplimiento
      sheet.getColumn(15).width = 12 // O: Total HU
      sheet.getColumn(16).width = 14 // P: HU Cumplidas
      sheet.getColumn(17).width = 12 // Q: Meta

      // Título principal
      sheet.getCell("B2").value =
        "KPI 6 - CUMPLIMIENTO DE ENTREGAS POR SPRINT (JIRA)"
      sheet.getCell("B2").font = {
        bold: true,
        size: 14,
        color: { argb: "FF1F497D" },
      }

      sheet.getCell("B3").value =
        `Período: ${report.period.label} | Criterio: Sprints cerrados en el mes | Métrica: Solo Historias de Usuario (HU)`
      sheet.getCell("B3").font = { italic: true, size: 10, color: { argb: "FF595959" } }

      // Encabezados Tabla 2: Resumen por Proyecto (Lado Derecho: Columnas K a Q)
      const summaryHeaders = [
        "Proyecto",
        "Puntos Comprometidos",
        "Puntos Cumplidos",
        "% Cumplimiento",
        "Total HU",
        "HU Cumplidas",
        "Meta",
      ]
      summaryHeaders.forEach((text, i) => {
        styleHeaderCell(sheet.getCell(5, 11 + i), text, SUMMARY_HEADER_FILL)
      })
      sheet.getRow(5).height = 28
    }

    // Determinar la fila de inicio para la tabla de Sprints de este proyecto (Lado Izquierdo: Columnas B a I)
    let sprintHeaderRow = 5
    if (projectIndex > 0) {
      let maxLeftRow = 5
      sheet.eachRow((row, rowNumber) => {
        if (row.getCell(2).value) {
          maxLeftRow = Math.max(maxLeftRow, rowNumber)
        }
      })
      sprintHeaderRow = maxLeftRow + 3
    }

    // Encabezado del bloque del proyecto en Sprints (si hay más de 1 proyecto o projectIndex > 0)
    if (projectCount > 1 || projectIndex > 0) {
      const bannerCell = sheet.getCell(sprintHeaderRow - 1, 2)
      bannerCell.value = `PROYECTO: ${report.projectName}`
      bannerCell.font = { bold: true, size: 11, color: { argb: "FF1F4E79" } }
    }

    // Encabezados Tabla de Sprints
    const sprintHeaders = [
      "Sprint",
      "Fecha Inicio",
      "Fecha Cierre",
      "Puntos Comprometidos (HU)",
      "Puntos Cumplidos (HU)",
      "% Cumplimiento",
      "Total HU",
      "HU Cumplidas",
    ]
    sprintHeaders.forEach((text, i) => {
      styleHeaderCell(sheet.getCell(sprintHeaderRow, 2 + i), text, HEADER_FILL)
    })
    sheet.getRow(sprintHeaderRow).height = 28

    // Filas de datos de Sprints
    let currentSprintRow = sprintHeaderRow + 1
    for (const sprint of report.sprints) {
      const startDateStr = sprint.startDate
        ? new Date(sprint.startDate).toLocaleDateString("es-ES")
        : "-"
      const completeDateStr = sprint.completeDate
        ? new Date(sprint.completeDate).toLocaleDateString("es-ES")
        : sprint.endDate
          ? new Date(sprint.endDate).toLocaleDateString("es-ES")
          : "-"

      styleDataCell(
        sheet.getCell(currentSprintRow, 2),
        sprint.sprintName,
        { vertical: "middle", horizontal: "left" }
      )
      styleDataCell(sheet.getCell(currentSprintRow, 3), startDateStr)
      styleDataCell(sheet.getCell(currentSprintRow, 4), completeDateStr)
      styleDataCell(
        sheet.getCell(currentSprintRow, 5),
        sprint.committedStoryPoints,
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleDataCell(
        sheet.getCell(currentSprintRow, 6),
        sprint.completedStoryPoints,
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleDataCell(
        sheet.getCell(currentSprintRow, 7),
        {
          formula: `IF(E${currentSprintRow}=0,0,ROUND((F${currentSprintRow}/E${currentSprintRow})*100,2))`,
          result: sprint.completionPercentage,
        },
        { vertical: "middle", horizontal: "right" },
        '0.00"%"'
      )
      styleDataCell(
        sheet.getCell(currentSprintRow, 8),
        sprint.totalStories,
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleDataCell(
        sheet.getCell(currentSprintRow, 9),
        sprint.completedStories,
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      sheet.getRow(currentSprintRow).height = 20
      currentSprintRow++
    }

    // Fila Total Sprints del Proyecto
    const sprintTotalRow = currentSprintRow
    styleTotalCell(
      sheet.getCell(sprintTotalRow, 2),
      `TOTAL ${report.projectName}`,
      { vertical: "middle", horizontal: "left" }
    )
    styleTotalCell(sheet.getCell(sprintTotalRow, 3), "-")
    styleTotalCell(sheet.getCell(sprintTotalRow, 4), "-")

    if (report.sprints.length > 0) {
      const dataStart = sprintHeaderRow + 1
      const dataEnd = sprintTotalRow - 1
      styleTotalCell(
        sheet.getCell(sprintTotalRow, 5),
        {
          formula: `SUM(E${dataStart}:E${dataEnd})`,
          result: report.totalCommittedStoryPoints,
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleTotalCell(
        sheet.getCell(sprintTotalRow, 6),
        {
          formula: `SUM(F${dataStart}:F${dataEnd})`,
          result: report.totalCompletedStoryPoints,
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleTotalCell(
        sheet.getCell(sprintTotalRow, 7),
        {
          formula: `IF(E${sprintTotalRow}=0,0,ROUND((F${sprintTotalRow}/E${sprintTotalRow})*100,2))`,
          result: report.overallCompletionPercentage,
        },
        { vertical: "middle", horizontal: "right" },
        '0.00"%"'
      )
      styleTotalCell(
        sheet.getCell(sprintTotalRow, 8),
        {
          formula: `SUM(H${dataStart}:H${dataEnd})`,
          result: report.sprints.reduce((acc, s) => acc + s.totalStories, 0),
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleTotalCell(
        sheet.getCell(sprintTotalRow, 9),
        {
          formula: `SUM(I${dataStart}:I${dataEnd})`,
          result: report.sprints.reduce((acc, s) => acc + s.completedStories, 0),
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
    } else {
      styleTotalCell(sheet.getCell(sprintTotalRow, 5), 0, { vertical: "middle", horizontal: "right" })
      styleTotalCell(sheet.getCell(sprintTotalRow, 6), 0, { vertical: "middle", horizontal: "right" })
      styleTotalCell(sheet.getCell(sprintTotalRow, 7), 0, { vertical: "middle", horizontal: "right" }, '0.00"%"')
      styleTotalCell(sheet.getCell(sprintTotalRow, 8), 0, { vertical: "middle", horizontal: "right" })
      styleTotalCell(sheet.getCell(sprintTotalRow, 9), 0, { vertical: "middle", horizontal: "right" })
    }
    sheet.getRow(sprintTotalRow).height = 22

    // Llenar Fila en la Tabla 2: Resumen por Proyecto (Columnas K a Q)
    const summaryRow = 6 + projectIndex
    styleDataCell(
      sheet.getCell(summaryRow, 11),
      report.projectName,
      { vertical: "middle", horizontal: "left" }
    )
    styleDataCell(
      sheet.getCell(summaryRow, 12),
      report.totalCommittedStoryPoints,
      { vertical: "middle", horizontal: "right" },
      "#,##0"
    )
    styleDataCell(
      sheet.getCell(summaryRow, 13),
      report.totalCompletedStoryPoints,
      { vertical: "middle", horizontal: "right" },
      "#,##0"
    )
    styleDataCell(
      sheet.getCell(summaryRow, 14),
      {
        formula: `IF(L${summaryRow}=0,0,ROUND((M${summaryRow}/L${summaryRow})*100,2))`,
        result: report.overallCompletionPercentage,
      },
      { vertical: "middle", horizontal: "right" },
      '0.00"%"'
    )
    styleDataCell(
      sheet.getCell(summaryRow, 15),
      report.sprints.reduce((acc, s) => acc + s.totalStories, 0),
      { vertical: "middle", horizontal: "right" },
      "#,##0"
    )
    styleDataCell(
      sheet.getCell(summaryRow, 16),
      report.sprints.reduce((acc, s) => acc + s.completedStories, 0),
      { vertical: "middle", horizontal: "right" },
      "#,##0"
    )
    styleDataCell(
      sheet.getCell(summaryRow, 17),
      "≥ 85%",
      { vertical: "middle", horizontal: "center" }
    )
    sheet.getRow(summaryRow).height = 20

    // Si es el último proyecto, agregar la fila TOTAL GENERAL en el resumen por proyecto
    if (projectIndex === projectCount - 1) {
      const summaryTotalRow = 6 + projectCount
      styleTotalCell(
        sheet.getCell(summaryTotalRow, 11),
        "TOTAL / PROMEDIO",
        { vertical: "middle", horizontal: "left" }
      )
      styleTotalCell(
        sheet.getCell(summaryTotalRow, 12),
        {
          formula: `SUM(L6:L${summaryTotalRow - 1})`,
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleTotalCell(
        sheet.getCell(summaryTotalRow, 13),
        {
          formula: `SUM(M6:M${summaryTotalRow - 1})`,
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleTotalCell(
        sheet.getCell(summaryTotalRow, 14),
        {
          formula: `IF(L${summaryTotalRow}=0,0,ROUND((M${summaryTotalRow}/L${summaryTotalRow})*100,2))`,
        },
        { vertical: "middle", horizontal: "right" },
        '0.00"%"'
      )
      styleTotalCell(
        sheet.getCell(summaryTotalRow, 15),
        {
          formula: `SUM(O6:O${summaryTotalRow - 1})`,
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleTotalCell(
        sheet.getCell(summaryTotalRow, 16),
        {
          formula: `SUM(P6:P${summaryTotalRow - 1})`,
        },
        { vertical: "middle", horizontal: "right" },
        "#,##0"
      )
      styleTotalCell(
        sheet.getCell(summaryTotalRow, 17),
        "≥ 85%",
        { vertical: "middle", horizontal: "center" }
      )
      sheet.getRow(summaryTotalRow).height = 22
    }
  },

  async buildSharedDetailReport(
    entries: Array<{ ctx: ProviderContext; data: unknown }>,
    runOutputDir: string
  ): Promise<string> {
    const jiraDir = path.join(runOutputDir, "jira")
    await fs.mkdir(jiraDir, { recursive: true })

    const workbook = new ExcelJS.Workbook()

    for (const entry of entries) {
      const report = asJiraReport(entry.data)
      const sheet = workbook.addWorksheet(
        entry.ctx.projectName.slice(0, 31) || "Jira Sprints"
      )

      sheet.getColumn(1).width = 24
      sheet.getColumn(2).width = 16
      sheet.getColumn(3).width = 16
      sheet.getColumn(4).width = 25
      sheet.getColumn(5).width = 22
      sheet.getColumn(6).width = 16
      sheet.getColumn(7).width = 12
      sheet.getColumn(8).width = 14

      // Section 1: Summary Table
      sheet.addRow([`Reporte Jira - ${report.projectName} (${report.period.label})`])
      sheet.getRow(1).font = { bold: true, size: 14, color: { argb: "FF1F497D" } }
      sheet.addRow([])

      const headerRow = sheet.addRow([
        "Sprint",
        "Fecha Inicio",
        "Fecha Cierre",
        "Puntos Comprometidos (HU)",
        "Puntos Cumplidos (HU)",
        "% Cumplimiento",
        "Total HU",
        "HU Cumplidas",
      ])
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
      headerRow.eachCell((cell) => {
        cell.fill = HEADER_FILL
        cell.alignment = { vertical: "middle", horizontal: "center" }
      })

      for (const sprint of report.sprints) {
        sheet.addRow([
          sprint.sprintName,
          sprint.startDate ? new Date(sprint.startDate).toLocaleDateString("es-ES") : "-",
          sprint.completeDate ? new Date(sprint.completeDate).toLocaleDateString("es-ES") : "-",
          sprint.committedStoryPoints,
          sprint.completedStoryPoints,
          `${sprint.completionPercentage}%`,
          sprint.totalStories,
          sprint.completedStories,
        ])
      }

      const totRow = sheet.addRow([
        "TOTAL",
        "-",
        "-",
        report.totalCommittedStoryPoints,
        report.totalCompletedStoryPoints,
        `${report.overallCompletionPercentage}%`,
        report.sprints.reduce((acc, s) => acc + s.totalStories, 0),
        report.sprints.reduce((acc, s) => acc + s.completedStories, 0),
      ])
      totRow.font = { bold: true }
      totRow.fill = TOTAL_ROW_FILL

      sheet.addRow([])
      sheet.addRow([])

      // Section 2: Detailed User Stories per Sprint
      const detailTitle = sheet.addRow(["Detalle de Historias de Usuario (HU) por Sprint"])
      detailTitle.font = { bold: true, size: 12, color: { argb: "FF1F497D" } }

      const dHeader = sheet.addRow([
        "Sprint",
        "Key",
        "Resumen",
        "Tipo",
        "Estado",
        "Puntos de Historia",
        "¿Cumplida?",
      ])
      dHeader.font = { bold: true, color: { argb: "FFFFFFFF" } }
      dHeader.eachCell((cell) => {
        cell.fill = SUMMARY_HEADER_FILL
        cell.alignment = { vertical: "middle", horizontal: "center" }
      })

      for (const sprint of report.sprints) {
        for (const story of sprint.stories) {
          sheet.addRow([
            sprint.sprintName,
            story.key,
            story.summary,
            story.issueType,
            story.status,
            story.storyPoints,
            story.isCompleted ? "Sí" : "No",
          ])
        }
      }
    }

    const now = new Date()
    const dd = String(now.getDate()).padStart(2, "0")
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const yyyy = now.getFullYear()
    const outputPath = path.join(jiraDir, `jira-sprints-${dd}-${mm}-${yyyy}.xlsx`)

    await workbook.xlsx.writeFile(outputPath)
    return outputPath
  },
}

export function writeJiraEvidence(
  workbook: ExcelJS.Workbook,
  entries: Array<{ ctx: ProviderContext; data: unknown }>,
  detailPath: string,
  runOutputDir: string
): void {
  const sheet = workbook.getWorksheet(jiraProvider.excelSheetName)
  if (!sheet) return

  const detailRelative = path.relative(runOutputDir, detailPath)

  let lastRow = 15
  sheet.eachRow((_row, rowNumber) => {
    lastRow = Math.max(lastRow, rowNumber)
  })

  const evidenceHeaderRow = lastRow + 3
  sheet.getCell(evidenceHeaderRow, 2).value = "EVIDENCIAS Y REPORTES DETALLADOS (JIRA)"
  sheet.getCell(evidenceHeaderRow, 2).font = { bold: true, size: 11, color: { argb: "FF1F4E79" } }

  const linkRow = evidenceHeaderRow + 1
  sheet.getCell(linkRow, 2).value = "Reporte Detallado de Sprints e Historias:"
  sheet.getCell(linkRow, 2).font = { bold: true, size: 10 }

  sheet.getCell(linkRow, 5).value = {
    text: path.basename(detailPath),
    hyperlink: detailRelative,
  }
  sheet.getCell(linkRow, 5).font = { color: { argb: "FF0563C1" }, underline: true, size: 10 }
}

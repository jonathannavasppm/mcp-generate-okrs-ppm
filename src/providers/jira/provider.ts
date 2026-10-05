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

const CENTER_ALIGNMENT: Partial<ExcelJS.Alignment> = {
  vertical: "middle",
  horizontal: "center",
}

function styleHeaderCell(
  cell: ExcelJS.Cell,
  text: string,
  fill: ExcelJS.Fill = SUMMARY_HEADER_FILL
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
  alignment: Partial<ExcelJS.Alignment> = CENTER_ALIGNMENT,
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
  alignment: Partial<ExcelJS.Alignment> = CENTER_ALIGNMENT,
  numFmt?: string
): void {
  cell.value = value
  cell.font = { bold: true, size: 10 }
  cell.fill = TOTAL_ROW_FILL
  cell.alignment = alignment
  cell.border = THIN_BORDER
  if (numFmt) cell.numFmt = numFmt
}

const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
]

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
    const projectIndex = ctx.providerProjectIndex ?? ctx.projectIndex ?? 0

    // 1. Configuración de datos del mes en la plantilla (A5, B5, C5, D5, B6)
    const monthName = MONTH_NAMES_ES[report.period.month - 1] || "Mes"
    sheet.getCell("B5").value = monthName
    sheet.getCell("D5").value = report.period.year
    sheet.getCell("B6").value = report.sprints.length

    // 2. Si es el primer proyecto o proyecto único, rellenar los sprints en la tabla base (filas 11 en adelante)
    if (projectIndex === 0) {
      const sprintCount = report.sprints.length
      const startRow = 11

      for (let i = 0; i < Math.max(sprintCount, 4); i++) {
        const r = startRow + i
        if (i < sprintCount) {
          const sp = report.sprints[i]
          sheet.getCell(r, 1).value = sp.sprintName
          sheet.getCell(r, 2).value = sp.committedStoryPoints
          sheet.getCell(r, 3).value = sp.completedStoryPoints
          sheet.getCell(r, 4).value = {
            formula: `IF(B${r}=0,0,C${r}/B${r})`,
            result:
              sp.committedStoryPoints > 0
                ? sp.completedStoryPoints / sp.committedStoryPoints
                : 0,
          }
          sheet.getCell(r, 4).numFmt = "0.00%"
          sheet.getCell(r, 5).value = "-"
        } else {
          // Limpiar filas sobrantes de la plantilla original
          sheet.getCell(r, 1).value = ""
          sheet.getCell(r, 2).value = ""
          sheet.getCell(r, 3).value = ""
          sheet.getCell(r, 4).value = ""
          sheet.getCell(r, 5).value = ""
        }
      }

      // Actualizar fórmulas de resumen de la plantilla con el rango real
      const endRow = sprintCount > 0 ? startRow + sprintCount - 1 : startRow
      sheet.getCell("B18").value = {
        formula: `AVERAGE(D11:D${endRow})`,
        result: report.overallCompletionPercentage / 100,
      }
      sheet.getCell("B18").numFmt = "0.00%"

      sheet.getCell("B19").value = {
        formula: `AVERAGE(B11:B${endRow})`,
      }
      sheet.getCell("B19").numFmt = "#,##0.0"

      sheet.getCell("B20").value = {
        formula: `AVERAGE(C11:C${endRow})`,
      }
      sheet.getCell("B20").numFmt = "#,##0.0"

      sheet.getCell("B24").value = {
        formula: `COUNTIF(D11:D${endRow},">=0.95")`,
      }
      sheet.getCell("B25").value = {
        formula: `SUMPRODUCT((D11:D${endRow}>=0.85)*(D11:D${endRow}<0.95))`,
      }
      sheet.getCell("B26").value = {
        formula: `SUMPRODUCT((D11:D${endRow}>=0.7)*(D11:D${endRow}<0.85))`,
      }
      sheet.getCell("B27").value = {
        formula: `COUNTIF(D11:D${endRow},"<0.70")`,
      }
    }
  },

  async buildSharedDetailReport(
    entries: Array<{ ctx: ProviderContext; data: unknown }>,
    runOutputDir: string
  ): Promise<string> {
    const jiraDir = path.join(runOutputDir, "jira")
    await fs.mkdir(jiraDir, { recursive: true })

    const workbook = new ExcelJS.Workbook()

    // Si hay más de un proyecto, agregar una hoja de "Resumen General" al inicio
    if (entries.length > 1) {
      const summarySheet = workbook.addWorksheet("Resumen General")
      summarySheet.getColumn(1).width = 24
      summarySheet.getColumn(2).width = 22
      summarySheet.getColumn(3).width = 20
      summarySheet.getColumn(4).width = 16
      summarySheet.getColumn(5).width = 12
      summarySheet.getColumn(6).width = 14
      summarySheet.getColumn(7).width = 12

      summarySheet.addRow(["RESUMEN GENERAL POR PROYECTO (JIRA)"])
      summarySheet.getRow(1).font = { bold: true, size: 14, color: { argb: "FF1F497D" } }
      summarySheet.addRow([])

      const sumHeader = summarySheet.addRow([
        "Proyecto",
        "Puntos Comprometidos",
        "Puntos Cumplidos",
        "% Cumplimiento",
        "Total HU",
        "HU Cumplidas",
        "Meta",
      ])
      sumHeader.font = { bold: true, color: { argb: "FFFFFFFF" } }
      sumHeader.eachCell((c) => {
        c.fill = SUMMARY_HEADER_FILL
        c.alignment = { vertical: "middle", horizontal: "center" }
      })

      let totalCommittedAll = 0
      let totalCompletedAll = 0
      let totalStoriesAll = 0
      let totalCompletedStoriesAll = 0

      for (const entry of entries) {
        const report = asJiraReport(entry.data)
        const totalStories = report.sprints.reduce((acc, s) => acc + s.totalStories, 0)
        const completedStories = report.sprints.reduce((acc, s) => acc + s.completedStories, 0)

        totalCommittedAll += report.totalCommittedStoryPoints
        totalCompletedAll += report.totalCompletedStoryPoints
        totalStoriesAll += totalStories
        totalCompletedStoriesAll += completedStories

        summarySheet.addRow([
          report.projectName,
          report.totalCommittedStoryPoints,
          report.totalCompletedStoryPoints,
          `${report.overallCompletionPercentage}%`,
          totalStories,
          completedStories,
          "≥ 85%",
        ])
      }

      const totalPercentageAll =
        totalCommittedAll > 0
          ? Number(((totalCompletedAll / totalCommittedAll) * 100).toFixed(2))
          : 0

      const sumTotalRow = summarySheet.addRow([
        "TOTAL / PROMEDIO",
        totalCommittedAll,
        totalCompletedAll,
        `${totalPercentageAll}%`,
        totalStoriesAll,
        totalCompletedStoriesAll,
        "≥ 85%",
      ])
      sumTotalRow.font = { bold: true }
      sumTotalRow.fill = TOTAL_ROW_FILL
    }

    // Hoja por cada proyecto con Detalle de Sprints y Resumen por Proyecto
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

      // Título y Detalle de Sprints
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

      // Tabla: RESUMEN POR PROYECTO
      sheet.addRow([])
      sheet.addRow([])

      const sumSectionTitle = sheet.addRow(["RESUMEN POR PROYECTO"])
      sumSectionTitle.font = { bold: true, size: 12, color: { argb: "FF1F4E79" } }

      const projectSummaryHeader = sheet.addRow([
        "Proyecto",
        "Puntos Comprometidos",
        "Puntos Cumplidos",
        "% Cumplimiento",
        "Total HU",
        "HU Cumplidas",
        "Meta",
      ])
      projectSummaryHeader.font = { bold: true, color: { argb: "FFFFFFFF" } }
      projectSummaryHeader.eachCell((c) => {
        c.fill = SUMMARY_HEADER_FILL
        c.alignment = { vertical: "middle", horizontal: "center" }
      })

      const totalStories = report.sprints.reduce((acc, s) => acc + s.totalStories, 0)
      const completedStories = report.sprints.reduce((acc, s) => acc + s.completedStories, 0)

      sheet.addRow([
        report.projectName,
        report.totalCommittedStoryPoints,
        report.totalCompletedStoryPoints,
        `${report.overallCompletionPercentage}%`,
        totalStories,
        completedStories,
        "≥ 85%",
      ])
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

  let reportRow = 0
  sheet.eachRow((row, rowNumber) => {
    const cellValue = row.getCell(1).value
    const label = typeof cellValue === "string" ? cellValue.trim() : ""
    if (label.startsWith("Reportes de Sprint")) {
      reportRow = rowNumber
    }
  })

  if (reportRow > 0) {
    sheet.getCell(reportRow, 2).value = {
      text: path.basename(detailPath),
      hyperlink: detailRelative,
    }
    sheet.getCell(reportRow, 2).font = {
      color: { argb: "FF0563C1" },
      underline: true,
      size: 10,
    }
  } else {
    let lastRow = 30
    sheet.eachRow((_row, rowNumber) => {
      lastRow = Math.max(lastRow, rowNumber)
    })
    const evidenceHeaderRow = lastRow + 2
    sheet.getCell(evidenceHeaderRow, 1).value = "EVIDENCIAS (JIRA)"
    sheet.getCell(evidenceHeaderRow, 1).font = { bold: true, size: 11, color: { argb: "FF1F4E79" } }

    const linkRow = evidenceHeaderRow + 1
    sheet.getCell(linkRow, 1).value = "Reporte Detallado de Sprints (Jira):"
    sheet.getCell(linkRow, 2).value = {
      text: path.basename(detailPath),
      hyperlink: detailRelative,
    }
    sheet.getCell(linkRow, 2).font = { color: { argb: "FF0563C1" }, underline: true, size: 10 }
  }
}

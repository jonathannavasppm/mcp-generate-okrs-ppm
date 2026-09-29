import fs from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"
import {
  UptimeRobotConfigSchema,
  type UptimeRobotConfig,
} from "./config.schema.js"
import { collectUptimeData, fetchPublicMonitor } from "./client.js"
import type { UptimeProjectData } from "./types.js"
import type {
  DataProvider,
  ProviderContext,
  ValidationResult,
} from "../../types/types.js"

const KPI4_SHEET_NAME = "KPI4_Disponibilidad"
const DEFAULT_BLOCK_WIDTH = 6
const EXCEL_DATE_FORMAT = "dd/mm/yyyy hh:mm"
const PERCENT_FORMAT = "0.0000%"
const DETAIL_COLUMN_WIDTHS = [22, 22, 14, 42, 24] as const

function asUptimeData(data: unknown): UptimeProjectData {
  if (!data || typeof data !== "object" || !("incidents" in data)) {
    throw new Error("Se esperaba información de disponibilidad")
  }
  return data as UptimeProjectData
}

function normalizeLabel(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("es")
    : ""
}

function getAddressSeparator(address: string): number {
  for (let index = 0; index < address.length; index += 1) {
    const code = address.codePointAt(index)
    if (code !== undefined && code >= 48 && code <= 57) return index
  }
  throw new Error(`Dirección de celda inválida: ${address}`)
}

function getCellRow(cell: ExcelJS.Cell): number {
  const separator = getAddressSeparator(cell.address)
  return Number(cell.address.slice(separator))
}

function getCellCol(cell: ExcelJS.Cell): number {
  const separator = getAddressSeparator(cell.address)
  let column = 0
  for (let index = 0; index < separator; index += 1) {
    const code = cell.address.codePointAt(index)
    if (code === undefined) {
      throw new Error(`Dirección de celda inválida: ${cell.address}`)
    }
    column = column * 26 + code - 64
  }
  return column
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    return JSON.stringify(error) ?? "Error desconocido"
  } catch {
    return "Error desconocido"
  }
}

function findLabelCell(
  sheet: ExcelJS.Worksheet,
  label: string,
  startCol: number,
  endCol: number
): ExcelJS.Cell | undefined {
  const normalized = label.toLocaleLowerCase("es")
  for (let row = 1; row <= sheet.rowCount; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      const cell = sheet.getCell(row, col)
      if (normalizeLabel(cell.value).startsWith(normalized)) return cell
    }
  }
  return undefined
}

function getValueCell(
  sheet: ExcelJS.Worksheet,
  labelCell: ExcelJS.Cell
): ExcelJS.Cell {
  const masterAddress = labelCell.master.address
  const row = getCellRow(labelCell)
  let col = getCellCol(labelCell) + 1
  while (
    col <= sheet.columnCount + DEFAULT_BLOCK_WIDTH &&
    sheet.getCell(row, col).isMerged &&
    sheet.getCell(row, col).master.address === masterAddress
  ) {
    col += 1
  }
  return sheet.getCell(row, col)
}

function findBlockStarts(sheet: ExcelJS.Worksheet): number[] {
  const starts = new Set<number>()
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (normalizeLabel(cell.value) === "mes:") starts.add(getCellCol(cell))
    })
  })
  return [...starts].sort((a, b) => a - b)
}

function cloneBlock(
  sheet: ExcelJS.Worksheet,
  sourceStart: number,
  targetStart: number,
  width: number
): void {
  for (let offset = 0; offset < width; offset += 1) {
    const sourceColumn = sheet.getColumn(sourceStart + offset)
    const targetColumn = sheet.getColumn(targetStart + offset)
    targetColumn.width = sourceColumn.width

    for (let row = 1; row <= sheet.rowCount; row += 1) {
      const source = sheet.getCell(row, sourceStart + offset)
      const target = sheet.getCell(row, targetStart + offset)
      target.value = source.value
      target.style = { ...source.style }
      target.numFmt = source.numFmt
      target.alignment = source.alignment
      target.border = source.border
      target.fill = source.fill
      target.font = source.font
      target.protection = source.protection
    }
  }
}

function ensureBlockStart(
  sheet: ExcelJS.Worksheet,
  index: number
): { start: number; width: number } {
  const starts = findBlockStarts(sheet)
  if (starts.length === 0) {
    throw new Error('No se encontró la etiqueta "Mes:" en KPI4_Disponibilidad')
  }
  const width = starts.length > 1
    ? starts[1] - starts[0]
    : DEFAULT_BLOCK_WIDTH
  if (starts[index] !== undefined) return { start: starts[index], width }

  const targetStart = starts[0] + index * width
  cloneBlock(sheet, starts[0], targetStart, width)
  return { start: targetStart, width }
}

function setNumberFormat(cell: ExcelJS.Cell, numFmt: string): void {
  cell.style = { ...cell.style, numFmt }
}

function formatDuration(durationHours: number): string {
  const totalMinutes = Math.floor(durationHours * 60)
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0")
  const minutes = String(totalMinutes % 60).padStart(2, "0")
  return `${hours}:${minutes}`
}

function setLabeledValue(
  sheet: ExcelJS.Worksheet,
  label: string,
  startCol: number,
  endCol: number,
  value: ExcelJS.CellValue
): ExcelJS.Cell {
  const labelCell = findLabelCell(sheet, label, startCol, endCol)
  if (!labelCell) throw new Error(`No se encontró "${label}" en el bloque KPI4`)
  const valueCell = getValueCell(sheet, labelCell)
  valueCell.value = value
  return valueCell
}

function writeIncidentTable(
  sheet: ExcelJS.Worksheet,
  data: UptimeProjectData,
  startCol: number,
  endCol: number
): void {
  const startHeader = findLabelCell(
    sheet,
    "fecha/hora inicio",
    startCol,
    endCol
  )
  const evidence = findLabelCell(sheet, "d. evidencias", startCol, endCol)
  if (!startHeader || !evidence) return

  const firstRow = getCellRow(startHeader) + 1
  const capacity = Math.max(0, getCellRow(evidence) - firstRow)
  const firstCol = getCellCol(startHeader)
  for (let index = 0; index < capacity; index += 1) {
    const row = firstRow + index
    const incident = data.incidents[index]
    for (let col = startCol; col <= endCol; col += 1) {
      sheet.getCell(row, col).value = null
    }
    if (!incident) continue

    const startCell = sheet.getCell(row, firstCol)
    const endCell = sheet.getCell(row, firstCol + 1)
    const durationCell = sheet.getCell(row, firstCol + 2)
    startCell.value = incident.startedAt
    setNumberFormat(startCell, EXCEL_DATE_FORMAT)
    endCell.value = incident.endedAt ?? "Abierto"
    if (incident.endedAt) setNumberFormat(endCell, EXCEL_DATE_FORMAT)
    durationCell.value = formatDuration(incident.durationHours)
    sheet.getCell(row, firstCol + 3).value = incident.cause
  }
}

function getUniqueSheetName(
  workbook: ExcelJS.Workbook,
  projectName: string
): string {
  const base = projectName.replace(/[\\/?*:[\]]/g, "-").slice(0, 31) || "Proyecto"
  let candidate = base
  let suffix = 2
  while (workbook.getWorksheet(candidate)) {
    const marker = `-${suffix}`
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`
    suffix += 1
  }
  return candidate
}

export const uptimeRobotProvider: DataProvider<UptimeRobotConfig> = {
  key: "uptimeRobot",
  excelSheetName: KPI4_SHEET_NAME,
  configSchema: UptimeRobotConfigSchema,

  async validateAccess(config): Promise<ValidationResult> {
    try {
      const response = await fetchPublicMonitor(config)
      return {
        ok: true,
        detail: `${response.title}/${response.monitor.name}`,
      }
    } catch (error: unknown) {
      return {
        ok: false,
        detail: formatUnknownError(error),
      }
    }
  },

  async fetchData(config): Promise<UptimeProjectData> {
    return collectUptimeData(config)
  },

  writeToExcel(sheet, rawData, ctx: ProviderContext): void {
    const data = asUptimeData(rawData)
    const index = ctx.providerProjectIndex ?? ctx.projectIndex ?? 0
    const { start, width } = ensureBlockStart(sheet, index)
    const end = start + width - 1

    setLabeledValue(sheet, "mes:", start, end, data.monthName)
    setLabeledValue(sheet, "días:", start, end, data.dayCount)
    setLabeledValue(
      sheet,
      "horas totales del mes:",
      start,
      end,
      data.totalHours
    )
    const downtimeCell = setLabeledValue(
      sheet,
      "horas de indisponibilidad:",
      start,
      end,
      formatDuration(data.downtimeHours)
    )
    downtimeCell.style = {
      ...downtimeCell.style,
      alignment: {
        ...downtimeCell.alignment,
        horizontal: "right",
      },
    }
    const availabilityCell = setLabeledValue(
      sheet,
      "% disponibilidad:",
      start,
      end,
      data.availability / 100
    )
    setNumberFormat(availabilityCell, PERCENT_FORMAT)
    setLabeledValue(
      sheet,
      "número de incidentes críticos:",
      start,
      end,
      data.incidents.length
    )

    const availabilityLabel = findLabelCell(
      sheet,
      "% disponibilidad:",
      start,
      end
    )
    if (availabilityLabel && getCellRow(availabilityLabel) > 1) {
      sheet.getCell(
        getCellRow(availabilityLabel) - 1,
        getCellCol(availabilityCell)
      ).value = ctx.projectName
    }
    writeIncidentTable(sheet, data, start, end)
  },

  async buildSharedDetailReport(entries, runOutputDir): Promise<string> {
    const outputDir = path.join(runOutputDir, "disponibilidad")
    await fs.mkdir(outputDir, { recursive: true })
    const workbook = new ExcelJS.Workbook()

    for (const entry of entries) {
      const data = asUptimeData(entry.data)
      const sheetName = getUniqueSheetName(workbook, entry.ctx.projectName)
      const sheet = workbook.addWorksheet(sheetName)
      sheet.addRow([
        "Fecha/Hora Inicio",
        "Fecha/Hora Fin",
        "Duración (h)",
        "Causa",
        "Proyecto UptimeRobot",
      ])
      DETAIL_COLUMN_WIDTHS.forEach((width, index) => {
        sheet.getColumn(index + 1).width = width
      })
      sheet.getRow(1).font = { bold: true }
      sheet.getRow(1).alignment = { vertical: "middle", wrapText: true }
      for (const incident of data.incidents) {
        sheet.addRow([
          incident.startedAt,
          incident.endedAt ?? "Abierto",
          formatDuration(incident.durationHours),
          incident.cause,
          data.projectId,
        ])
      }
      sheet.getColumn(1).numFmt = EXCEL_DATE_FORMAT
      sheet.getColumn(2).numFmt = EXCEL_DATE_FORMAT
    }

    const date = new Date().toISOString().slice(0, 10)
    const outputPath = path.join(outputDir, `disponibilidad-${date}.xlsx`)
    await workbook.xlsx.writeFile(outputPath)
    return outputPath
  },
}

export function writeUptimeRobotEvidence(
  workbook: ExcelJS.Workbook,
  entries: Array<{ ctx: ProviderContext; data: unknown }>,
  detailPath: string,
  runOutputDir: string
): void {
  const sheet = workbook.getWorksheet(KPI4_SHEET_NAME)
  if (!sheet) return
  const relativePath = path.relative(runOutputDir, detailPath)

  for (const [entryIndex, entry] of entries.entries()) {
    const data = asUptimeData(entry.data)
    const index = entry.ctx.providerProjectIndex ?? entryIndex
    const { start, width } = ensureBlockStart(sheet, index)
    const end = start + width - 1
    const reportLabel = findLabelCell(
      sheet,
      "reporte uptimerobot:",
      start,
      end
    )
    const detailLabel = findLabelCell(
      sheet,
      "detalle de incidentes",
      start,
      end
    )
    const dashboardLabel = findLabelCell(
      sheet,
      "dashboard monitoreo",
      start,
      end
    )

    if (reportLabel) {
      getValueCell(sheet, reportLabel).value = {
        text: "Portal UptimeRobot",
        hyperlink: data.publicUrl,
      }
    }
    if (detailLabel) {
      getValueCell(sheet, detailLabel).value = {
        text: path.basename(detailPath),
        hyperlink: relativePath,
      }
    }
    if (dashboardLabel) {
      getValueCell(sheet, dashboardLabel).value = "[Pegar link OneDrive]"
    }
  }
}

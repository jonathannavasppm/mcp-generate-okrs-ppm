import fs from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"
import { NpmAuditConfigSchema, type NpmAuditConfig } from "./config.schema.js"
import { collectDependencyData, type DependencyRow } from "./client.js"
import type {
  DataProvider,
  ProviderContext,
  ValidationResult,
} from "../../types/types.js"

function asDependencyRows(data: unknown): DependencyRow[] {
  if (!Array.isArray(data)) throw new Error("Se esperaba DependencyRow[]")
  return data as DependencyRow[]
}

const KPI5 = {
  headerRow: 4,
  totalRow: 5,
  withSupportRow: 6,
  noSupportRow: 7,
  percentRow: 11,
  averageRow: 12,
  startCol: 2, // columna B
  stride: 3, // valor + anotación + separación
} as const

export function kpi5ValueColumn(index: number): number {
  return KPI5.startCol + index * KPI5.stride
}

function colLetter(col: number): string {
  let letter = ""
  let n = col
  while (n > 0) {
    const rem = (n - 1) % 26
    letter = String.fromCodePoint(65 + rem) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

export const npmAuditProvider: DataProvider<NpmAuditConfig> = {
  key: "npm-audit",
  excelSheetName: "KPI5_Componentes",
  configSchema: NpmAuditConfigSchema,

  async validateAccess(_config, ctx): Promise<ValidationResult> {
    try {
      await fs.access(path.join(ctx.projectPath, "package.json"))
    } catch {
      return {
        ok: false,
        detail: `package.json no encontrado en ${ctx.projectPath}`,
      }
    }
    return { ok: true }
  },

  async fetchData(_config, ctx): Promise<DependencyRow[]> {
    return collectDependencyData(ctx.projectPath, ctx.timeToCompare)
  },

  writeToExcel(sheet, data, ctx: ProviderContext): void {
    const deps = asDependencyRows(data)
    const withSupportCount = deps.filter(
      (d) => d.supportStatus === "Actualizada" || d.supportStatus === "Desactualizada"
    ).length

    const index = ctx.projectIndex ?? 0
    const count = ctx.projectCount ?? index + 1
    const col = KPI5.startCol + index * KPI5.stride
    const letter = colLetter(col)

    sheet.getCell(KPI5.headerRow, col).value = ctx.projectName
    sheet.getCell(KPI5.totalRow, col).value = deps.length
    sheet.getCell(KPI5.withSupportRow, col).value = withSupportCount
    sheet.getCell(KPI5.noSupportRow, col).value = {
      formula: `${letter}${KPI5.totalRow}-${letter}${KPI5.withSupportRow}`,
    }
    sheet.getCell(KPI5.percentRow, col).value = {
      formula:
        `IF(${letter}${KPI5.totalRow}=0,0,` +
        `${letter}${KPI5.withSupportRow}/${letter}${KPI5.totalRow}*100)`,
    }

    const annotationCol = col + 1
    sheet.getCell(KPI5.totalRow, annotationCol).value = "Conteo total"
    sheet.getCell(KPI5.withSupportRow, annotationCol).value =
      "Componentes actualizados"
    sheet.getCell(KPI5.noSupportRow, annotationCol).value =
      "Se calcula automáticamente"
    sheet.getCell(KPI5.percentRow, annotationCol).value = "Meta: ≥90%"

    if (index === count - 1) {
      const percentCells = Array.from({ length: count }, (_, i) =>
        `${colLetter(KPI5.startCol + i * KPI5.stride)}${KPI5.percentRow}`
      ).join(",")

      sheet.getCell(KPI5.averageRow, 1).value = "Promedio"
      sheet.getCell(KPI5.averageRow, KPI5.startCol).value = {
        formula: `AVERAGE(${percentCells})`,
      }
      sheet.getCell(KPI5.averageRow, KPI5.startCol + 1).value = "Meta: ≥90%"
    }
  },

  async buildSharedDetailReport(entries, runOutputDir): Promise<string> {
    const vulDir = path.join(runOutputDir, "vulnerabilidades")
    await fs.mkdir(vulDir, { recursive: true })

    const workbook = new ExcelJS.Workbook()

    for (const entry of entries) {
      const deps = asDependencyRows(entry.data)
      const sheet = workbook.addWorksheet(entry.ctx.projectName.slice(0, 31))
      sheet.addRow([
        "Librería",
        "Tipo de dependencia",
        "Version declarada",
        "Version instalada",
        "Version más reciente",
        "¿Está deprecada?",
        "¿Tiene vulnerabilidades?",
        "Última actualización",
        "Estado",
      ])
      for (const dep of deps) {
        sheet.addRow([
          dep.packageName,
          dep.dependencyType,
          dep.declaredVersion,
          dep.installedVersion,
          dep.latestVersion,
          dep.isDeprecated ? "Sí" : "No",
          dep.hasVulnerabilities ? "Sí" : "No",
          dep.lastPublishedDate ?? "N/D",
          dep.supportStatus,
        ])
      }

      try {
        await fs.copyFile(
          path.join(entry.ctx.projectPath, "package.json"),
          path.join(vulDir, `${entry.ctx.projectName}-package.json`)
        )
      } catch {
        // el usuario linkea manualmente; si falla la copia se omite
      }
    }

    const now = new Date()
    const dd = String(now.getDate()).padStart(2, "0")
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const yyyy = now.getFullYear()
    const outputPath = path.join(
      vulDir,
      `vulnerabilidades-${dd}-${mm}-${yyyy}.xlsx`
    )
    await workbook.xlsx.writeFile(outputPath)
    return outputPath
  },
}

export function writeNpmAuditEvidence(
  workbook: ExcelJS.Workbook,
  entries: Array<{ ctx: ProviderContext; data: unknown }>,
  detailPath: string,
  runOutputDir: string
): void {
  const sheet = workbook.getWorksheet(npmAuditProvider.excelSheetName)
  if (!sheet) return

  let inventoryRow = 0
  let auditRow = 0
  let packageRow = 0
  sheet.eachRow((row, rowNumber) => {
    const label = row.getCell(1).value
    if (typeof label !== "string") return
    if (label.startsWith("Inventario completo")) inventoryRow = rowNumber
    if (label.startsWith("npm audit")) auditRow = rowNumber
    if (label.startsWith("package.json")) packageRow = rowNumber
  })

  const detailRelative = path.relative(runOutputDir, detailPath)
  if (inventoryRow) {
    sheet.getCell(inventoryRow, KPI5.startCol).value = {
      text: path.basename(detailPath),
      hyperlink: detailRelative,
    }
  }

  for (const { ctx } of entries) {
    const col = kpi5ValueColumn(ctx.projectIndex ?? 0)
    const tabName = ctx.projectName.slice(0, 31)
    if (auditRow) {
      sheet.getCell(auditRow, col).value = {
        formula:
          `HYPERLINK("${detailRelative}#'${tabName}'!A1",` +
          `"${ctx.projectName}")`,
      }
    }
    if (packageRow) {
      sheet.getCell(packageRow, col).value = "[Pegar link OneDrive]"
    }
  }
}

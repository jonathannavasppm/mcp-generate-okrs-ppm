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

export const npmAuditProvider: DataProvider<NpmAuditConfig> = {
  key: "npm-audit",
  excelSheetName: "Vul",
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
    return collectDependencyData(ctx.projectPath)
  },

  writeToExcel(sheet, data, ctx: ProviderContext): void {
    const deps = asDependencyRows(data)
    const vulnerableCount = deps.filter((d) => d.hasVulnerabilities).length
    const deprecatedCount = deps.filter((d) => d.isDeprecated).length

    let row = 2
    while (sheet.getCell(row, 1).value != null) row++

    sheet.getCell(row, 1).value = ctx.projectName
    sheet.getCell(row, 2).value = deps.length
    sheet.getCell(row, 3).value = vulnerableCount
    sheet.getCell(row, 4).value = deprecatedCount
  },

  async buildSharedDetailReport(entries, runOutputDir): Promise<string> {
    const vulDir = path.join(runOutputDir, "vulnerabilidades")
    await fs.mkdir(vulDir, { recursive: true })

    const workbook = new ExcelJS.Workbook()

    for (const entry of entries) {
      const deps = asDependencyRows(entry.data)
      const sheet = workbook.addWorksheet(entry.ctx.projectName.slice(0, 31))
      sheet.addRow([
        "Package",
        "Dependency Type",
        "Declared Version",
        "Installed Version",
        "Latest Version",
        "Deprecated",
        "Vulnerable",
        "Last Updated",
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
        ])
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

import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { uptimeRobotProvider } from "../../../../src/providers/uptime-robot/provider.js"
import type { UptimeProjectData } from "../../../../src/providers/uptime-robot/types.js"

function createTemplate(): ExcelJS.Worksheet {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet("KPI4_Disponibilidad")
  sheet.getCell("A2").value = "Mes:"
  sheet.getCell("C2").value = "Días:"
  sheet.getCell("A3").value = "Horas totales del mes:"
  sheet.getCell("A4").value = "Horas de indisponibilidad:"
  sheet.getCell("A7").value = "% Disponibilidad:"
  sheet.getCell("A8").value = "Número de incidentes críticos:"
  sheet.getCell("A11").value = "Fecha/Hora Inicio"
  sheet.getCell("B11").value = "Fecha/Hora Fin"
  sheet.getCell("C11").value = "Duración (h)"
  sheet.getCell("D11").value = "Causa"
  sheet.getCell("E11").value = "Ticket JIRA"
  sheet.getCell("A15").value = "D. EVIDENCIAS"
  sheet.getCell("A16").value = "Reporte UptimeRobot:"
  sheet.getCell("A17").value = "Detalle de incidentes (Excel):"
  sheet.getCell("A18").value = "Dashboard monitoreo (captura):"
  return sheet
}

const data: UptimeProjectData = {
  companyId: "company",
  projectId: "123",
  monitorName: "Web",
  monthName: "septiembre",
  dayCount: 30,
  totalHours: 720,
  downtimeHours: 1.5,
  availability: 99.7917,
  incidents: [
    {
      startedAt: new Date("2026-09-02T01:00:00Z"),
      endedAt: new Date("2026-09-02T02:00:00Z"),
      durationHours: 1,
      cause: "500: Server error",
    },
  ],
  publicUrl: "https://stats.uptimerobot.com/company/123",
}

describe("uptimeRobotProvider", () => {
  it("writes projects into independent horizontal blocks", () => {
    const sheet = createTemplate()
    const context = {
      projectName: "web",
      projectPath: "/tmp/web",
      timeToCompare: "180",
      providerProjectIndex: 0,
      providerProjectCount: 2,
    }
    uptimeRobotProvider.writeToExcel(sheet, data, context)
    uptimeRobotProvider.writeToExcel(sheet, data, {
      ...context,
      projectName: "app",
      providerProjectIndex: 1,
    })

    expect(sheet.getCell("B2").value).toBe("septiembre")
    expect(sheet.getCell("H2").value).toBe("septiembre")
    expect(sheet.getCell("B3").value).toBe(720)
    expect(sheet.getCell("B4").value).toBe("01:30")
    expect(sheet.getCell("B4").alignment.horizontal).toBe("right")
    expect(sheet.getCell("H3").value).toBe(720)
    expect(sheet.getCell("H4").value).toBe("01:30")
    expect(sheet.getCell("H4").alignment.horizontal).toBe("right")
    expect(sheet.getCell("A12").value).toBeInstanceOf(Date)
    expect(sheet.getCell("A12").numFmt).toBe("dd/mm/yyyy hh:mm")
    expect(sheet.getCell("C12").value).toBe("01:00")
    expect(sheet.getCell("G12").value).toBeInstanceOf(Date)
    expect(sheet.getCell("G12").numFmt).toBe("dd/mm/yyyy hh:mm")
    expect(sheet.getCell("I12").value).toBe("01:00")
  })
})

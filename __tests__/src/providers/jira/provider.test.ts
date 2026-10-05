import ExcelJS from "exceljs"
import { describe, expect, it } from "vitest"
import { jiraProvider } from "../../../../src/providers/jira/provider.js"
import type { JiraProjectReport } from "../../../../src/providers/jira/types.js"

const report: JiraProjectReport = {
  projectName: "bendo-web",
  projectKey: "BENDO",
  boardId: 1,
  period: {
    month: 9,
    year: 2026,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    label: "Septiembre 2026",
  },
  sprints: [
    {
      sprintId: 1,
      sprintName: "Sprint 1",
      state: "closed",
      committedStoryPoints: 53,
      completedStoryPoints: 13,
      completionPercentage: 24.53,
      totalStories: 10,
      completedStories: 3,
      stories: [],
    },
  ],
  totalCommittedStoryPoints: 53,
  totalCompletedStoryPoints: 13,
  overallCompletionPercentage: 24.53,
}

describe("jiraProvider", () => {
  it("writes the first Jira project regardless of its global index", () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("KPI6_Cumplimiento")

    jiraProvider.writeToExcel(sheet, report, {
      projectName: "bendo-web",
      projectPath: "/tmp/bendo-web",
      timeToCompare: "180",
      projectIndex: 1,
      projectCount: 2,
      providerProjectIndex: 0,
      providerProjectCount: 1,
    })

    expect(sheet.getCell("B5").value).toBe("Septiembre")
    expect(sheet.getCell("D5").value).toBe(2026)
    expect(sheet.getCell("A11").value).toBe("Sprint 1")
    expect(sheet.getCell("B11").value).toBe(53)
    expect(sheet.getCell("C11").value).toBe(13)
  })
})

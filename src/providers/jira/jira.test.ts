import { describe, it, expect } from "vitest"
import {
  isUserStory,
  extractStoryPoints,
  filterSprintsByMonth,
  getMonthPeriod,
  isIssueCompleted,
  formatSprintName,
} from "./client.js"
import { jiraProvider } from "./provider.js"
import ExcelJS from "exceljs"
import type { JiraIssue, JiraSprint, JiraProjectReport } from "./types.js"

describe("Jira Provider", () => {
  it("debe formatear nombres de sprint eliminando la palabra SCRUM y dejando 'Sprint X'", () => {
    expect(formatSprintName("SCRUM Sprint 47")).toBe("Sprint 47")
    expect(formatSprintName("SCRUM Sprint 48")).toBe("Sprint 48")
    expect(formatSprintName("Sprint 49")).toBe("Sprint 49")
    expect(formatSprintName("SCRUM 50")).toBe("Sprint 50")
    expect(formatSprintName("Tablero Sprint 51")).toBe("Sprint 51")
  })

  it("debe filtrar solo Historias de Usuario excluyendo Bugs, Tareas y Epics", () => {
    const storyIssue: JiraIssue = {
      id: "1",
      key: "PROJ-1",
      fields: {
        summary: "Historia de usuario 1",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    const bugIssue: JiraIssue = {
      id: "2",
      key: "PROJ-2",
      fields: {
        summary: "Bug critico",
        issuetype: { id: "1", name: "Bug", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    const taskIssue: JiraIssue = {
      id: "3",
      key: "PROJ-3",
      fields: {
        summary: "Tarea de configuracion",
        issuetype: { id: "2", name: "Task", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    const subtaskIssue: JiraIssue = {
      id: "4",
      key: "PROJ-4",
      fields: {
        summary: "Subtarea",
        issuetype: { id: "5", name: "Sub-task", subtask: true },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    expect(isUserStory(storyIssue)).toBe(true)
    expect(isUserStory(bugIssue)).toBe(false)
    expect(isUserStory(taskIssue)).toBe(false)
    expect(isUserStory(subtaskIssue)).toBe(false)
  })

  it("debe extraer Story Points correctamente de campos custom y numericos", () => {
    const issueWithField: JiraIssue = {
      id: "1",
      key: "PROJ-1",
      fields: {
        summary: "Story 1",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
        customfield_10041: 8,
      },
    }

    const issueWithString: JiraIssue = {
      id: "2",
      key: "PROJ-2",
      fields: {
        summary: "Story 2",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
        customfield_10041: "5",
      },
    }

    expect(extractStoryPoints(issueWithField, "customfield_10041")).toBe(8)
    expect(extractStoryPoints(issueWithString, "customfield_10041")).toBe(5)
  })

  it("debe determinar correctamente si un issue está completado / cumplido considerando cancelaciones y fechas", () => {
    const doneIssue: JiraIssue = {
      id: "1",
      key: "PROJ-1",
      fields: {
        summary: "Story 1",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
        resolution: { id: "10000", name: "Listo" },
        resolutiondate: "2026-08-25T15:00:00.000Z",
      },
    }

    const canceledIssue: JiraIssue = {
      id: "2",
      key: "PROJ-2",
      fields: {
        summary: "Story Cancelada",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "4",
          name: "CANCELED",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
        resolution: { id: "10001", name: "Won't Do" },
        resolutiondate: "2026-08-25T15:00:00.000Z",
      },
    }

    const laterResolvedIssue: JiraIssue = {
      id: "3",
      key: "PROJ-3",
      fields: {
        summary: "Story resuelta después del sprint",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
        resolution: { id: "10000", name: "Listo" },
        resolutiondate: "2026-09-15T10:00:00.000Z",
      },
    }

    const inProgressIssue: JiraIssue = {
      id: "4",
      key: "PROJ-4",
      fields: {
        summary: "Story en progreso",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "2",
          name: "In Progress",
          statusCategory: { id: 2, key: "indeterminate", name: "In Progress" },
        },
      },
    }

    const sprintCloseDate = "2026-08-31T15:18:53.205Z"

    expect(isIssueCompleted(doneIssue, sprintCloseDate)).toBe(true)
    expect(isIssueCompleted(canceledIssue, sprintCloseDate)).toBe(false)
    expect(isIssueCompleted(laterResolvedIssue, sprintCloseDate)).toBe(false)
    expect(isIssueCompleted(inProgressIssue, sprintCloseDate)).toBe(false)
  })

  it("debe filtrar solo sprints cerrados dentro del mes evaluado", () => {
    const period = getMonthPeriod(2026, 8) // Agosto 2026

    const sprints: JiraSprint[] = [
      {
        id: 50,
        name: "Sprint 50 (Inició antes pero cerró en agosto)",
        self: "",
        state: "closed",
        startDate: "2026-07-20T00:00:00.000Z",
        completeDate: "2026-08-03T10:00:00.000Z",
      },
      {
        id: 51,
        name: "Sprint 51 (Cerró en agosto)",
        self: "",
        state: "closed",
        startDate: "2026-08-03T10:00:00.000Z",
        completeDate: "2026-08-18T10:00:00.000Z",
      },
      {
        id: 52,
        name: "Sprint 52 (Cerró en septiembre - NO DEBE CONTAR)",
        self: "",
        state: "closed",
        startDate: "2026-08-18T10:00:00.000Z",
        completeDate: "2026-09-02T10:00:00.000Z",
      },
      {
        id: 53,
        name: "Sprint 53 (Activo - NO DEBE CONTAR)",
        self: "",
        state: "active",
        startDate: "2026-08-25T10:00:00.000Z",
      },
    ]

    const filtered = filterSprintsByMonth(sprints, period)
    expect(filtered).toHaveLength(2)
    expect(filtered.map((s) => s.id)).toEqual([50, 51])
  })

  it("debe escribir correctamente en Excel en la hoja KPI6_Cumplimiento", () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("KPI6_Cumplimiento")

    const mockReport: JiraProjectReport = {
      projectName: "my-next-app",
      projectKey: "MCBPE",
      boardId: 116,
      period: {
        month: 8,
        year: 2026,
        startDate: "2026-08-01T00:00:00.000Z",
        endDate: "2026-08-31T23:59:59.999Z",
        label: "Agosto 2026",
      },
      sprints: [
        {
          sprintId: 47,
          sprintName: "Sprint 47",
          startDate: "2026-07-20T23:09:09.766Z",
          completeDate: "2026-08-03T15:14:48.156Z",
          state: "closed",
          committedStoryPoints: 134,
          completedStoryPoints: 29,
          completionPercentage: 21.64,
          totalStories: 27,
          completedStories: 6,
          stories: [],
        },
        {
          sprintId: 49,
          sprintName: "Sprint 49",
          startDate: "2026-08-17T15:10:34.719Z",
          completeDate: "2026-08-31T15:18:53.205Z",
          state: "closed",
          committedStoryPoints: 13,
          completedStoryPoints: 5,
          completionPercentage: 38.46,
          totalStories: 2,
          completedStories: 1,
          stories: [],
        },
      ],
      totalCommittedStoryPoints: 147,
      totalCompletedStoryPoints: 34,
      overallCompletionPercentage: 23.13,
    }

    jiraProvider.writeToExcel(sheet, mockReport, {
      projectName: "my-next-app",
      projectPath: "/tmp",
      timeToCompare: "180",
      projectCount: 1,
      projectIndex: 0,
    })

    // Validar datos de mes y sprints en la tabla base
    expect(sheet.getCell("B5").value).toBe("Agosto")
    expect(sheet.getCell("D5").value).toBe(2026)
    expect(sheet.getCell("B6").value).toBe(2)
    expect(sheet.getCell("A11").value).toBe("Sprint 47")
    expect(sheet.getCell("B11").value).toBe(134)
    expect(sheet.getCell("C11").value).toBe(29)
  })
})

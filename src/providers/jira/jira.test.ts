import { describe, it, expect } from "vitest"
import ExcelJS from "exceljs"
import {
  filterSprintsByMonth,
  isUserStory,
  extractStoryPoints,
  isIssueCompleted,
  getMonthPeriod,
} from "./client.js"
import { jiraProvider } from "./provider.js"
import type { JiraIssue, JiraProjectReport, JiraSprint } from "./types.js"
import { registry } from "../../core/provider-registry.js"
import "../../providers/index.js"

describe("Jira Provider - Reglas de Negocio", () => {
  it("debe registrar el provider de Jira en el registry con la hoja KPI6_Cumplimiento", () => {
    const provider = registry.get("jira")
    expect(provider).toBeDefined()
    expect(provider?.key).toBe("jira")
    expect(provider?.excelSheetName).toBe("KPI6_Cumplimiento")
  })

  it("debe filtrar únicamente los sprints cerrados durante el mes especificado (ejemplo del usuario)", () => {
    const period = getMonthPeriod(2026, 9)

    const sprints: JiraSprint[] = [
      {
        id: 50,
        name: "Sprint 50",
        self: "https://jira/sprint/50",
        state: "closed",
        startDate: "2026-08-15T09:00:00.000Z",
        completeDate: "2026-09-05T18:00:00.000Z",
      },
      {
        id: 51,
        name: "Sprint 51",
        self: "https://jira/sprint/51",
        state: "closed",
        startDate: "2026-09-06T09:00:00.000Z",
        completeDate: "2026-09-20T18:00:00.000Z",
      },
      {
        id: 52,
        name: "Sprint 52",
        self: "https://jira/sprint/52",
        state: "active",
        startDate: "2026-09-21T09:00:00.000Z",
        completeDate: undefined,
      },
      {
        id: 53,
        name: "Sprint 53 (Cierra en Octubre)",
        self: "https://jira/sprint/53",
        state: "closed",
        startDate: "2026-09-21T09:00:00.000Z",
        completeDate: "2026-10-04T18:00:00.000Z",
      },
    ]

    const filtered = filterSprintsByMonth(sprints, period)
    expect(filtered.map((s) => s.id)).toEqual([50, 51])
  })

  it("debe considerar únicamente Historias de Usuario (HU) y descartar Bugs, Tareas y Subtareas", () => {
    const storyIssue: JiraIssue = {
      id: "1",
      key: "PROJ-1",
      fields: {
        summary: "Como usuario quiero loguearme",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    const huIssue: JiraIssue = {
      id: "2",
      key: "PROJ-2",
      fields: {
        summary: "Historia de usuario para checkout",
        issuetype: { id: "11", name: "Historia de usuario", subtask: false },
        status: {
          id: "3",
          name: "En Progreso",
          statusCategory: { id: 2, key: "indeterminate", name: "In Progress" },
        },
      },
    }

    const bugIssue: JiraIssue = {
      id: "3",
      key: "PROJ-3",
      fields: {
        summary: "Error al renderizar botón",
        issuetype: { id: "1", name: "Bug", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    const taskIssue: JiraIssue = {
      id: "4",
      key: "PROJ-4",
      fields: {
        summary: "Configurar pipeline CI/CD",
        issuetype: { id: "2", name: "Task", subtask: false },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    const subtaskIssue: JiraIssue = {
      id: "5",
      key: "PROJ-5",
      fields: {
        summary: "Crear componente de input",
        issuetype: { id: "5", name: "Sub-task", subtask: true },
        status: {
          id: "3",
          name: "Done",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    expect(isUserStory(storyIssue)).toBe(true)
    expect(isUserStory(huIssue)).toBe(true)
    expect(isUserStory(bugIssue)).toBe(false)
    expect(isUserStory(taskIssue)).toBe(false)
    expect(isUserStory(subtaskIssue)).toBe(false)
  })

  it("debe extraer correctamente los puntos de historia de distintos campos", () => {
    const issueWithCustom10016: JiraIssue = {
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
        customfield_10016: 8,
      },
    }

    const issueWithStringSP: JiraIssue = {
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
        customfield_10026: "5",
      },
    }

    expect(extractStoryPoints(issueWithCustom10016, "customfield_10016")).toBe(8)
    expect(extractStoryPoints(issueWithStringSP, "customfield_10026")).toBe(5)
  })

  it("debe determinar correctamente si un issue está completado / cumplido", () => {
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
      },
    }

    const closedIssue: JiraIssue = {
      id: "2",
      key: "PROJ-2",
      fields: {
        summary: "Story 2",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "4",
          name: "Cerrado",
          statusCategory: { id: 3, key: "done", name: "Done" },
        },
      },
    }

    const inProgressIssue: JiraIssue = {
      id: "3",
      key: "PROJ-3",
      fields: {
        summary: "Story 3",
        issuetype: { id: "10", name: "Story", subtask: false },
        status: {
          id: "2",
          name: "In Progress",
          statusCategory: { id: 2, key: "indeterminate", name: "In Progress" },
        },
      },
    }

    expect(isIssueCompleted(doneIssue)).toBe(true)
    expect(isIssueCompleted(closedIssue)).toBe(true)
    expect(isIssueCompleted(inProgressIssue)).toBe(false)
  })

  it("debe escribir correctamente en Excel en la hoja KPI6_Cumplimiento con tabla de Sprints y tabla Resumen por Proyecto", () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet(jiraProvider.excelSheetName)

    const mockReport: JiraProjectReport = {
      projectName: "my-next-app",
      projectKey: "MCBPE",
      boardId: 1,
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
          sprintName: "SCRUM Sprint 47",
          startDate: "2026-07-20T09:00:00.000Z",
          completeDate: "2026-08-03T18:00:00.000Z",
          state: "closed",
          committedStoryPoints: 134,
          completedStoryPoints: 134,
          completionPercentage: 100,
          totalStories: 27,
          completedStories: 27,
          stories: [],
        },
        {
          sprintId: 48,
          sprintName: "SCRUM Sprint 48",
          startDate: "2026-08-03T09:00:00.000Z",
          completeDate: "2026-08-18T18:00:00.000Z",
          state: "closed",
          committedStoryPoints: 125,
          completedStoryPoints: 125,
          completionPercentage: 100,
          totalStories: 27,
          completedStories: 27,
          stories: [],
        },
      ],
      totalCommittedStoryPoints: 259,
      totalCompletedStoryPoints: 259,
      overallCompletionPercentage: 100,
    }

    const ctx = {
      projectName: "my-next-app",
      projectPath: "/some/path",
      timeToCompare: "180",
      projectIndex: 0,
      projectCount: 1,
    }

    jiraProvider.writeToExcel(sheet, mockReport, ctx)

    // Validar Títulos
    expect(sheet.getCell("B2").value).toBe("KPI 6 - CUMPLIMIENTO DE ENTREGAS POR SPRINT (JIRA)")

    // Validar Encabezados de Sprints (Col B a I)
    expect(sheet.getCell(5, 2).value).toBe("Sprint")
    expect(sheet.getCell(5, 5).value).toBe("Puntos Comprometidos (HU)")
    expect(sheet.getCell(5, 6).value).toBe("Puntos Cumplidos (HU)")
    expect(sheet.getCell(5, 7).value).toBe("% Cumplimiento")

    // Validar Datos de Sprint 1
    expect(sheet.getCell(6, 2).value).toBe("SCRUM Sprint 47")
    expect(sheet.getCell(6, 5).value).toBe(134)
    expect(sheet.getCell(6, 6).value).toBe(134)

    // Validar Datos de Sprint 2
    expect(sheet.getCell(7, 2).value).toBe("SCRUM Sprint 48")
    expect(sheet.getCell(7, 5).value).toBe(125)
    expect(sheet.getCell(7, 6).value).toBe(125)

    // Validar Fila Total Sprints
    expect(sheet.getCell(8, 2).value).toBe("TOTAL my-next-app")

    // Validar Tabla Resumen por Proyecto (Lado Derecho: Col K a Q)
    expect(sheet.getCell(5, 11).value).toBe("Proyecto")
    expect(sheet.getCell(5, 12).value).toBe("Puntos Comprometidos")
    expect(sheet.getCell(5, 13).value).toBe("Puntos Cumplidos")
    expect(sheet.getCell(5, 14).value).toBe("% Cumplimiento")

    // Validar Fila de Proyecto en Resumen
    expect(sheet.getCell(6, 11).value).toBe("my-next-app")
    expect(sheet.getCell(6, 12).value).toBe(259)
    expect(sheet.getCell(6, 13).value).toBe(259)
    expect(sheet.getCell(6, 17).value).toBe("≥ 85%")

    // Validar Total General en Resumen
    expect(sheet.getCell(7, 11).value).toBe("TOTAL / PROMEDIO")
  })
})

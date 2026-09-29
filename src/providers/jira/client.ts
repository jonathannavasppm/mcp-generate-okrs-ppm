import type {
  JiraBoard,
  JiraIssue,
  JiraProjectReport,
  JiraSprint,
  JiraStoryDetail,
  SprintMetrics,
} from "./types.js"
import { type JiraConfig } from "./config.schema.js"
import { logger } from "../../utils/logger.js"

interface ResolvedAuth {
  baseUrl: string
  headers: Record<string, string>
}

export function resolveJiraAuth(config: JiraConfig): ResolvedAuth {
  const rawUrl =
    config.url ||
    config.baseUrl ||
    process.env.JIRA_URL ||
    process.env.JIRA_BASE_URL ||
    "https://qphcorp.atlassian.net"
  const baseUrl = rawUrl.replace(/\/+$/, "")

  const token =
    config.token ||
    (config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined) ||
    process.env.JIRA_API_TOKEN ||
    process.env.JIRA_TOKEN ||
    ""

  const email =
    config.email ||
    (config.emailEnv ? process.env[config.emailEnv] : undefined) ||
    process.env.JIRA_EMAIL ||
    ""

  let authHeader = ""
  if (email && token) {
    const credentials = Buffer.from(`${email.trim()}:${token.trim()}`).toString("base64")
    authHeader = `Basic ${credentials}`
  } else if (token.startsWith("Basic ") || token.startsWith("Bearer ")) {
    authHeader = token.trim()
  } else if (token.includes(":")) {
    authHeader = `Basic ${Buffer.from(token.trim()).toString("base64")}`
  } else if (token) {
    authHeader = `Bearer ${token.trim()}`
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  }

  if (authHeader) {
    headers["Authorization"] = authHeader
  }

  return { baseUrl, headers }
}

async function jiraFetch<T>(
  url: string,
  headers: Record<string, string>
): Promise<T> {
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "")
    throw new Error(
      `Jira API request failed [${res.status} ${res.statusText}] at ${url}: ${errorBody.slice(0, 300)}`
    )
  }
  return (await res.json()) as T
}

export async function validateJiraAccess(
  config: JiraConfig
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { baseUrl, headers } = resolveJiraAuth(config)
    if (!headers["Authorization"]) {
      return {
        ok: false,
        detail:
          "No se proporcionó token o credenciales de Jira (token / apiKeyEnv / JIRA_API_TOKEN)",
      }
    }

    try {
      await jiraFetch<{ accountId?: string; emailAddress?: string }>(
        `${baseUrl}/rest/api/3/myself`,
        headers
      )
    } catch {
      await jiraFetch<{ values: unknown[] }>(
        `${baseUrl}/rest/agile/1.0/board?maxResults=1`,
        headers
      )
    }

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function detectStoryPointField(
  baseUrl: string,
  headers: Record<string, string>,
  configuredField?: string
): Promise<string> {
  if (configuredField) return configuredField

  try {
    const fields = await jiraFetch<
      Array<{
        id: string
        name: string
        custom?: boolean
        schema?: { custom?: string; customId?: number }
      }>
    >(`${baseUrl}/rest/api/3/field`, headers)

    const match = fields.find((f) => {
      const name = (f.name || "").toLowerCase()
      const customType = (f.schema?.custom || "").toLowerCase()
      return (
        name === "story points" ||
        name === "story point estimate" ||
        name === "puntos de historia" ||
        name === "estimación de puntos de historia" ||
        customType.includes("story-points") ||
        customType.includes("storypoints") ||
        f.id === "customfield_10016" ||
        f.id === "customfield_10026"
      )
    })

    if (match) {
      logger.info({ fieldId: match.id, fieldName: match.name }, "Campo Story Points detectado")
      return match.id
    }
  } catch (err) {
    logger.warn({ err }, "No se pudo auto-detectar campo de Story Points, usando customfield_10016 por defecto")
  }

  return "customfield_10016"
}

export async function findBoard(
  baseUrl: string,
  headers: Record<string, string>,
  projectKey?: string,
  projectName?: string,
  configuredBoardId?: number
): Promise<JiraBoard> {
  if (configuredBoardId) {
    return await jiraFetch<JiraBoard>(
      `${baseUrl}/rest/agile/1.0/board/${configuredBoardId}`,
      headers
    )
  }

  if (projectKey) {
    try {
      const res = await jiraFetch<{ values: JiraBoard[] }>(
        `${baseUrl}/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=10`,
        headers
      )
      if (res.values && res.values.length > 0) {
        return res.values[0]
      }
    } catch {
      // ignore and search all boards
    }
  }

  const boardsRes = await jiraFetch<{ values: JiraBoard[] }>(
    `${baseUrl}/rest/agile/1.0/board?maxResults=50`,
    headers
  )

  if (!boardsRes.values || boardsRes.values.length === 0) {
    throw new Error(`No se encontraron boards de Jira en ${baseUrl}`)
  }

  if (projectKey || projectName) {
    const searchTarget = (projectKey || projectName || "").toLowerCase()
    const matchingBoard = boardsRes.values.find((b) => {
      const bName = (b.name || "").toLowerCase()
      const locKey = (b.location?.projectKey || "").toLowerCase()
      const locName = (b.location?.projectName || "").toLowerCase()
      return (
        bName.includes(searchTarget) ||
        locKey === searchTarget ||
        locName.includes(searchTarget)
      )
    })
    if (matchingBoard) return matchingBoard
  }

  return boardsRes.values[0]
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

export function getMonthPeriod(
  targetYear?: number,
  targetMonth?: number
): {
  month: number
  year: number
  startDate: Date
  endDate: Date
  label: string
} {
  const now = new Date()
  let year = targetYear ?? now.getFullYear()
  let month: number

  if (targetMonth !== undefined) {
    month = targetMonth
  } else {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    month = prev.getMonth() + 1
    year = targetYear ?? prev.getFullYear()
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  const label = `${MONTH_NAMES_ES[month - 1]} ${year}`

  return { month, year, startDate, endDate, label }
}

export async function getClosedSprints(
  baseUrl: string,
  headers: Record<string, string>,
  boardId: number
): Promise<JiraSprint[]> {
  const sprints: JiraSprint[] = []
  let startAt = 0
  let isLast = false

  while (!isLast) {
    const url = `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=closed&startAt=${startAt}&maxResults=50`
    const res = await jiraFetch<{
      values: JiraSprint[]
      isLast?: boolean
      total?: number
    }>(url, headers)

    if (res.values && res.values.length > 0) {
      sprints.push(...res.values)
    }

    if (res.isLast === true || !res.values || res.values.length === 0) {
      isLast = true
    } else {
      startAt += res.values.length
    }
  }

  return sprints
}

export function filterSprintsByMonth(
  sprints: JiraSprint[],
  period: { startDate: Date; endDate: Date }
): JiraSprint[] {
  return sprints.filter((sprint) => {
    if (sprint.state !== "closed") return false

    const closedDateStr = sprint.completeDate || sprint.endDate
    if (!closedDateStr) return false

    const closedDate = new Date(closedDateStr)
    return closedDate >= period.startDate && closedDate <= period.endDate
  })
}

export function isUserStory(issue: JiraIssue): boolean {
  const typeName = (issue.fields.issuetype?.name || "").trim().toLowerCase()
  const isSubtask = Boolean(issue.fields.issuetype?.subtask)
  if (isSubtask) return false

  const excluded = [
    "bug",
    "task",
    "tarea",
    "sub-task",
    "subtask",
    "subtarea",
    "epic",
    "épica",
    "spike",
    "error",
    "incidencia",
    "technical debt",
    "deuda técnica",
  ]

  if (excluded.includes(typeName)) return false

  const isStory =
    typeName === "story" ||
    typeName === "historia" ||
    typeName === "historia de usuario" ||
    typeName === "user story" ||
    typeName === "hu" ||
    typeName.includes("story") ||
    typeName.includes("historia") ||
    typeName.includes("hu")

  return isStory || !excluded.some((t) => typeName.startsWith(t))
}

export function extractStoryPoints(
  issue: JiraIssue,
  storyPointField: string
): number {
  const raw =
    issue.fields[storyPointField] ??
    issue.fields.customfield_10016 ??
    issue.fields.customfield_10026 ??
    issue.fields.customfield_10028 ??
    issue.fields.customfield_10004 ??
    issue.fields.storyPoints

  if (typeof raw === "number") return raw
  if (typeof raw === "string" && raw.trim() !== "" && !isNaN(Number(raw))) {
    return Number(raw)
  }
  return 0
}

export function isIssueCompleted(issue: JiraIssue): boolean {
  const statusCategory = (
    issue.fields.status?.statusCategory?.key || ""
  ).toLowerCase()
  const statusName = (issue.fields.status?.name || "").trim().toLowerCase()

  return (
    statusCategory === "done" ||
    [
      "done",
      "cerrado",
      "cerrada",
      "resuelto",
      "resuelta",
      "finalizado",
      "finalizada",
      "completado",
      "completada",
      "closed",
      "resolved",
    ].includes(statusName)
  )
}

export async function getSprintIssues(
  baseUrl: string,
  headers: Record<string, string>,
  boardId: number,
  sprintId: number
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = []
  let startAt = 0
  let total = 1

  while (startAt < total) {
    const url = `${baseUrl}/rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue?startAt=${startAt}&maxResults=100`
    const res = await jiraFetch<{
      issues: JiraIssue[]
      total: number
      startAt: number
      maxResults: number
    }>(url, headers)

    if (res.issues && res.issues.length > 0) {
      issues.push(...res.issues)
    }

    total = res.total ?? 0
    startAt += (res.issues?.length || 100)
    if (!res.issues || res.issues.length === 0) break
  }

  return issues
}

export async function analyzeSprint(
  baseUrl: string,
  headers: Record<string, string>,
  boardId: number,
  sprint: JiraSprint,
  storyPointField: string
): Promise<SprintMetrics> {
  const allIssues = await getSprintIssues(baseUrl, headers, boardId, sprint.id)
  const stories = allIssues.filter(isUserStory)

  let committedStoryPoints = 0
  let completedStoryPoints = 0
  const storyDetails: JiraStoryDetail[] = []

  for (const story of stories) {
    const points = extractStoryPoints(story, storyPointField)
    const completed = isIssueCompleted(story)

    committedStoryPoints += points
    if (completed) {
      completedStoryPoints += points
    }

    storyDetails.push({
      key: story.key,
      summary: story.fields.summary,
      issueType: story.fields.issuetype?.name || "Story",
      status: story.fields.status?.name || "Unknown",
      statusCategory: story.fields.status?.statusCategory?.name || "",
      storyPoints: points,
      isCompleted: completed,
    })
  }

  const completionPercentage =
    committedStoryPoints > 0
      ? Number(((completedStoryPoints / committedStoryPoints) * 100).toFixed(2))
      : 0

  return {
    sprintId: sprint.id,
    sprintName: sprint.name,
    startDate: sprint.startDate,
    endDate: sprint.endDate,
    completeDate: sprint.completeDate,
    state: sprint.state,
    committedStoryPoints,
    completedStoryPoints,
    completionPercentage,
    totalStories: stories.length,
    completedStories: storyDetails.filter((s) => s.isCompleted).length,
    stories: storyDetails,
  }
}

export async function collectJiraSprintData(
  config: JiraConfig,
  projectName: string
): Promise<JiraProjectReport> {
  const { baseUrl, headers } = resolveJiraAuth(config)
  const projectKey = config.projectKey || config.proyectKey
  const storyPointField = await detectStoryPointField(
    baseUrl,
    headers,
    config.storyPointField
  )

  const board = await findBoard(
    baseUrl,
    headers,
    projectKey,
    projectName,
    config.boardId
  )

  const period = getMonthPeriod(config.targetYear, config.targetMonth)
  const allClosedSprints = await getClosedSprints(baseUrl, headers, board.id)
  const monthSprints = filterSprintsByMonth(allClosedSprints, period)

  monthSprints.sort((a, b) => {
    const da = new Date(a.completeDate || a.endDate || 0).getTime()
    const db = new Date(b.completeDate || b.endDate || 0).getTime()
    return da - db
  })

  const sprintMetricsList: SprintMetrics[] = []
  let totalCommitted = 0
  let totalCompleted = 0

  for (const sprint of monthSprints) {
    const metrics = await analyzeSprint(
      baseUrl,
      headers,
      board.id,
      sprint,
      storyPointField
    )
    sprintMetricsList.push(metrics)
    totalCommitted += metrics.committedStoryPoints
    totalCompleted += metrics.completedStoryPoints
  }

  const overallPercentage =
    totalCommitted > 0
      ? Number(((totalCompleted / totalCommitted) * 100).toFixed(2))
      : 0

  return {
    projectName,
    projectKey,
    boardId: board.id,
    period: {
      month: period.month,
      year: period.year,
      startDate: period.startDate.toISOString(),
      endDate: period.endDate.toISOString(),
      label: period.label,
    },
    sprints: sprintMetricsList,
    totalCommittedStoryPoints: totalCommitted,
    totalCompletedStoryPoints: totalCompleted,
    overallCompletionPercentage: overallPercentage,
  }
}

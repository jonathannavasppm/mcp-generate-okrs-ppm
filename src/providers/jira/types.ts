export interface JiraBoard {
  id: number
  name: string
  type: string
  location?: {
    projectId?: number
    projectKey?: string
    projectName?: string
  }
}

export interface JiraSprint {
  id: number
  self: string
  state: "active" | "closed" | "future"
  name: string
  startDate?: string
  endDate?: string
  completeDate?: string
  originBoardId?: number
  goal?: string
}

export interface JiraIssueType {
  id: string
  name: string
  subtask: boolean
  description?: string
}

export interface JiraStatusCategory {
  id: number
  key: string
  name: string
}

export interface JiraStatus {
  id: string
  name: string
  statusCategory: JiraStatusCategory
}

export interface JiraIssue {
  id: string
  key: string
  fields: {
    summary: string
    issuetype: JiraIssueType
    status: JiraStatus
    resolutiondate?: string
    created?: string
    [key: string]: unknown
  }
}

export interface JiraStoryDetail {
  key: string
  summary: string
  issueType: string
  status: string
  statusCategory: string
  storyPoints: number
  isCompleted: boolean
}

export interface SprintMetrics {
  sprintId: number
  sprintName: string
  startDate?: string
  endDate?: string
  completeDate?: string
  state: string
  committedStoryPoints: number
  completedStoryPoints: number
  completionPercentage: number
  totalStories: number
  completedStories: number
  stories: JiraStoryDetail[]
}

export interface JiraProjectReport {
  projectName: string
  projectKey?: string
  boardId?: number
  period: {
    month: number
    year: number
    startDate: string
    endDate: string
    label: string
  }
  sprints: SprintMetrics[]
  totalCommittedStoryPoints: number
  totalCompletedStoryPoints: number
  overallCompletionPercentage: number
}

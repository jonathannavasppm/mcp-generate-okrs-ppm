import { z } from "zod"

export const JiraConfigSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().optional(),
  baseUrl: z.string().optional(),
  token: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  email: z.string().optional(),
  emailEnv: z.string().optional(),
  projectKey: z.string().optional(),
  proyectKey: z.string().optional(),
  boardId: z.number().optional(),
  storyPointField: z.string().optional(),
  targetMonth: z.number().min(1).max(12).optional(),
  targetYear: z.number().min(2000).max(2100).optional(),
  excelSheetName: z.string().optional(),
})

export type JiraConfig = z.infer<typeof JiraConfigSchema>

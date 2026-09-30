import { z } from "zod"

const identifierSchema = z.string().trim().regex(/^[A-Za-z0-9]+$/)

export const UptimeRobotConfigSchema = z.object({
  enabled: z.boolean().default(false),
  companyId: identifierSchema,
  projectId: z.string().trim().regex(/^\d+$/),
})

export type UptimeRobotConfig = z.infer<typeof UptimeRobotConfigSchema>

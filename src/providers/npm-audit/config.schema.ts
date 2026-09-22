import { z } from "zod"

export const NpmAuditConfigSchema = z.object({
  enabled: z.boolean().default(false),
})

export type NpmAuditConfig = z.infer<typeof NpmAuditConfigSchema>

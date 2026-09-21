import { z } from "zod"
import dotenv from "dotenv"
dotenv.config()

const projectSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  branch: z.string().min(1),
  timeToCompare: z.string().min(1),
  sonarqube: z.record(z.string(), z.unknown()).optional(),
  uptimeRobot: z.record(z.string(), z.unknown()).optional(),
  jira: z.record(z.string(), z.unknown()).optional(),
})

const projectsEnvSchema = z.array(projectSchema).min(1)

export type ProjectConfig = z.infer<typeof projectSchema>

export function loadProjects(): ProjectConfig[] {
  const raw = process.env.PROJECTS
  if (!raw) throw new Error("Falta la variable de entorno PROJECTS")

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("PROJECTS no es un JSON válido")
  }

  return projectsEnvSchema.parse(parsed)
}

const excelEnvSchema = z.object({
  EXCEL_TEMPLATE_PATH: z.string().min(1),
  EXCEL_OUTPUT_DIR: z.string().min(1),
})

export function loadExcelEnv() {
  return excelEnvSchema.parse({
    EXCEL_TEMPLATE_PATH: process.env.EXCEL_TEMPLATE_PATH,
    EXCEL_OUTPUT_DIR: process.env.EXCEL_OUTPUT_DIR,
  })
}

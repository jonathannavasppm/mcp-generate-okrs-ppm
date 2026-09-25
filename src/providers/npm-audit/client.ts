import fs from "node:fs/promises"
import path from "node:path"
import { execNpmJson } from "../../utils/exec.js"
import { parseTimeToCompare } from "../../utils/time-compare.js"
import { fetchRegistryMetadata } from "./registry-client.js"
import {
  classifySupportStatus,
  type SupportStatus,
} from "./support-status.js"
import type { NpmAuditReport, NpmOutdatedReport } from "./types.js"

export interface DependencyRow {
  packageName: string
  dependencyType: "dependency" | "devDependency"
  declaredVersion: string
  installedVersion: string
  latestVersion: string
  isDeprecated: boolean
  hasVulnerabilities: boolean
  vulnerabilitySeverity: string | null
  lastPublishedDate: string | null
  supportStatus: SupportStatus
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function isPackageJson(value: unknown): value is PackageJson {
  return typeof value === "object" && value !== null
}

async function readPackageJson(projectPath: string): Promise<PackageJson> {
  const raw = await fs.readFile(path.join(projectPath, "package.json"), "utf-8")
  const parsed: unknown = JSON.parse(raw)
  if (!isPackageJson(parsed))
    throw new Error(`package.json inválido en ${projectPath}`)
  return parsed
}

export async function collectDependencyData(
  projectPath: string,
  timeToCompare: string
): Promise<DependencyRow[]> {
  const thresholdMs = parseTimeToCompare(timeToCompare)
  const packageJson = await readPackageJson(projectPath)

  const deps = Object.entries(packageJson.dependencies ?? {})
  const allPackages = deps.map(([name, range]) => ({
    name,
    range,
    type: "dependency" as const,
  }))

  const [auditResult, outdatedResult] = await Promise.all([
    execNpmJson<NpmAuditReport>(["audit", "--json"], projectPath),
    execNpmJson<NpmOutdatedReport>(["outdated", "--json"], projectPath),
  ])

  const vulnerabilities = auditResult.data?.vulnerabilities ?? {}
  const outdated = outdatedResult.data ?? {}

  const rows: DependencyRow[] = []
  const CONCURRENCY = 10

  for (let i = 0; i < allPackages.length; i += CONCURRENCY) {
    const batch = allPackages.slice(i, i + CONCURRENCY)
    const batchRows = await Promise.all(
      batch.map(async ({ name, range, type }): Promise<DependencyRow> => {
        const outdatedEntry = outdated[name]
        const declaredVersion = range
        const installedVersion =
          outdatedEntry?.current ?? range.replace(/^[\^~>=<\s]+/, "")
        const latestVersion = outdatedEntry?.latest ?? installedVersion
        const vulnerability = vulnerabilities[name]
        const registryMeta = await fetchRegistryMetadata(
          name,
          installedVersion
        )

        return {
          packageName: name,
          dependencyType: type,
          declaredVersion,
          installedVersion,
          latestVersion,
          isDeprecated: registryMeta.deprecated,
          hasVulnerabilities: Boolean(vulnerability),
          vulnerabilitySeverity: vulnerability?.severity ?? null,
          lastPublishedDate: registryMeta.lastPublishedDate,
          supportStatus: classifySupportStatus({
            deprecated: registryMeta.deprecated,
            installedVersion,
            latestVersion,
            latestPublishedDate: registryMeta.latestPublishedDate,
            thresholdMs,
          }),
        }
      })
    )
    rows.push(...batchRows)
  }

  return rows
}

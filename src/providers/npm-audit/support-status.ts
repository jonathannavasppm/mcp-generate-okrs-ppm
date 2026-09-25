export type SupportStatus =
  | "Actualizada"
  | "Desactualizada"
  | "Sin soporte"
  | "Deprecated"
  | "Unknown"

interface ClassifyInput {
  deprecated: boolean
  installedVersion: string
  latestVersion: string
  latestPublishedDate: string | null
  thresholdMs: number
  now?: Date
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "")
}

export function classifySupportStatus(input: ClassifyInput): SupportStatus {
  if (input.deprecated) return "Deprecated"
  if (!input.latestPublishedDate) return "Unknown"

  const publishedAt = Date.parse(input.latestPublishedDate)
  if (Number.isNaN(publishedAt)) return "Unknown"

  const now = input.now ?? new Date()
  const ageMs = now.getTime() - publishedAt
  if (ageMs > input.thresholdMs) return "Sin soporte"

  const isUpToDate =
    normalizeVersion(input.installedVersion) ===
    normalizeVersion(input.latestVersion)
  return isUpToDate ? "Actualizada" : "Desactualizada"
}

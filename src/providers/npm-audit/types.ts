export interface NpmAuditVulnerability {
  name: string
  severity: "info" | "low" | "moderate" | "high" | "critical"
  via: Array<string | { title: string; severity: string }>
  range: string
  fixAvailable: boolean | { name: string; version: string }
}

export interface NpmAuditReport {
  vulnerabilities: Record<string, NpmAuditVulnerability>
}

export interface NpmOutdatedEntry {
  current?: string
  wanted: string
  latest: string
  dependent: string
  location?: string
}

export type NpmOutdatedReport = Record<string, NpmOutdatedEntry>

export interface NpmRegistryPackument {
  "dist-tags"?: { latest?: string }
  versions?: Record<string, { deprecated?: string | boolean }>
  time?: Record<string, string>
}

export interface RegistryMetadata {
  deprecated: boolean
  lastPublishedDate: string | null
}

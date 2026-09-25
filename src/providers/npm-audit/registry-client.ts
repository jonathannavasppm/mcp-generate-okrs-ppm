import type { NpmRegistryPackument, RegistryMetadata } from "./types.js"

function isNpmRegistryPackument(value: unknown): value is NpmRegistryPackument {
  return typeof value === "object" && value !== null
}

const EMPTY_METADATA: RegistryMetadata = {
  deprecated: false,
  lastPublishedDate: null,
  latestPublishedDate: null,
}

export async function fetchRegistryMetadata(
  packageName: string,
  version: string
): Promise<RegistryMetadata> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
    )
    if (!response.ok) return { ...EMPTY_METADATA }

    const json: unknown = await response.json()
    if (!isNpmRegistryPackument(json)) return { ...EMPTY_METADATA }

    const latestTag = json["dist-tags"]?.latest
    const versionInfo = json.versions?.[version]
    const latestInfo = latestTag ? json.versions?.[latestTag] : undefined

    const deprecated =
      Boolean(versionInfo?.deprecated) || Boolean(latestInfo?.deprecated)
    const lastPublishedDate =
      json.time?.[version] ?? json.time?.modified ?? null
    const latestPublishedDate =
      (latestTag ? json.time?.[latestTag] : undefined) ??
      json.time?.modified ??
      null

    return { deprecated, lastPublishedDate, latestPublishedDate }
  } catch {
    return { ...EMPTY_METADATA }
  }
}

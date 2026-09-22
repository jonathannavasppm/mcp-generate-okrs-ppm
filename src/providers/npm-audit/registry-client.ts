import type { NpmRegistryPackument, RegistryMetadata } from "./types.js"

function isNpmRegistryPackument(value: unknown): value is NpmRegistryPackument {
  return typeof value === "object" && value !== null
}

export async function fetchRegistryMetadata(
  packageName: string,
  version: string
): Promise<RegistryMetadata> {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`
    )
    if (!response.ok) return { deprecated: false, lastPublishedDate: null }

    const json: unknown = await response.json()
    if (!isNpmRegistryPackument(json))
      return { deprecated: false, lastPublishedDate: null }

    const latestTag = json["dist-tags"]?.latest
    const versionInfo = json.versions?.[version]
    const latestInfo = latestTag ? json.versions?.[latestTag] : undefined

    const deprecated =
      Boolean(versionInfo?.deprecated) || Boolean(latestInfo?.deprecated)
    const lastPublishedDate =
      json.time?.[version] ?? json.time?.modified ?? null

    return { deprecated, lastPublishedDate }
  } catch {
    return { deprecated: false, lastPublishedDate: null }
  }
}

import type { DataProvider, ProjectConfig } from "../types/types.ts"

class ProviderRegistry {
  private providers = new Map<string, DataProvider>()

  register(provider: DataProvider): void {
    if (this.providers.has(provider.key)) {
      throw new Error(`Provider "${provider.key}" ya registrado`)
    }
    this.providers.set(provider.key, provider)
  }

  get(key: string): DataProvider | undefined {
    return this.providers.get(key)
  }

  getEnabledFor(project: ProjectConfig): DataProvider[] {
    return [...this.providers.values()].filter((p) => {
      const block = (project as unknown as Record<string, unknown>)[p.key] as
        | { enabled?: boolean }
        | undefined
      return block?.enabled === true
    })
  }
}

export const registry = new ProviderRegistry()

const MS_PER_DAY = 86_400_000
const DAY_UNITS = new Set(["day", "days", "dia", "dias", "d"])

export function parseTimeToCompare(value: string): number {
  const match = value.trim().toLowerCase().match(/^(\d+)\s*(\p{L}*)$/u)
  if (!match) {
    throw new Error(
      `timeToCompare inválido: "${value}". Formato esperado: número de días ` +
        `(ej. "180")`
    )
  }
  const unit = (match[2] ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  if (unit && !DAY_UNITS.has(unit)) {
    throw new Error(
      `Unidad de tiempo no soportada en timeToCompare: "${match[2]}". ` +
        `Usa días (ej. "180" o "180 days")`
    )
  }
  return Number(match[1]) * MS_PER_DAY
}

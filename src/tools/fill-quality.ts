import fs from "node:fs/promises"
import path from "node:path"
import ExcelJS from "exceljs"
import { loadExcelEnv } from "../core/config-loader.js"
import { logger } from "../utils/logger.js"
import type { ToolResponse } from "../types/types.js"

const SHEET_NAME = "KPI3_CalidadCodigo"

const QUALITY_METRICS = [
  "alert_status",
  "sqale_rating",
  "sqale_debt_ratio",
  "coverage",
  "reliability_rating",
  "vulnerabilities",
]

const RATING_MAP: Record<string, string> = {
  "1.0": "A",
  "1": "A",
  "2.0": "B",
  "2": "B",
  "3.0": "C",
  "3": "C",
  "4.0": "D",
  "4": "D",
  "5.0": "E",
  "5": "E",
}

const QUALITY_GATE_MAP: Record<string, string> = {
  OK: "PASS",
  ERROR: "FAIL",
  WARN: "WARN",
}

interface SonarMeasureResponse {
  component?: {
    measures?: Array<{
      metric: string
      value?: string
      period?: { value?: string }
    }>
  }
}

interface QualityData {
  projectKey: string
  branch: string
  analysisDate: string
  qualityGate?: string
  maintainabilityRating?: string
  technicalDebtRatio?: string
  coverage?: string
  reliabilityRating?: string
  vulnerabilities?: string
}

export interface FillQualityParams {
  repos: Array<{
    projectKey: string
    baseUrl: string
    branch: string
    apiKeyEnv?: string
  }>
}

async function fetchSonarMetrics(repo: {
  projectKey: string
  baseUrl: string
  branch: string
  apiKeyEnv?: string
}): Promise<Array<{ metric: string; value: string | number }>> {
  const envVar = repo.apiKeyEnv || "SONARQUBE_API_KEY"
  const apiKey = process.env[envVar]
  if (!apiKey) {
    throw new Error(`Falta la variable de entorno ${envVar}`)
  }

  const baseUrl = repo.baseUrl.replace(/\/$/, "")
  const metricsParam = QUALITY_METRICS.join(",")
  const url = `${baseUrl}/api/measures/component?component=${encodeURIComponent(
    repo.projectKey
  )}&branch=${encodeURIComponent(repo.branch)}&metricKeys=${encodeURIComponent(
    metricsParam
  )}`

  logger.info({ projectKey: repo.projectKey, url }, "Fetching SonarQube metrics")

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    throw new Error(
      `SonarQube API returned ${response.status}: ${response.statusText}`
    )
  }

  const data = (await response.json()) as SonarMeasureResponse
  const measures = data.component?.measures || []

  return measures.map((m) => ({
    metric: m.metric,
    value: m.value ?? m.period?.value ?? "N/A",
  }))
}

function mapMetricsToQuality(
  metrics: Array<{ metric: string; value: string | number }>,
  projectKey: string,
  branch: string
): QualityData {
  const data: QualityData = {
    projectKey,
    branch,
    analysisDate: new Date().toISOString(),
  }

  for (const m of metrics) {
    const val = String(m.value)
    switch (m.metric) {
      case "alert_status":
        data.qualityGate = QUALITY_GATE_MAP[val] ?? val
        break
      case "sqale_rating":
        data.maintainabilityRating = RATING_MAP[val] ?? val
        break
      case "sqale_debt_ratio":
        data.technicalDebtRatio = val
        break
      case "coverage":
        data.coverage = val
        break
      case "reliability_rating":
        data.reliabilityRating = RATING_MAP[val] ?? val
        break
      case "vulnerabilities":
        data.vulnerabilities = val
        break
    }
  }

  return data
}

function setCellValue(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number | Date
): void {
  const cell = ws.getCell(row, col)
  if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
    return
  }
  cell.value = value
}

async function resolveMasterOutputPath(baseDir: string): Promise<string> {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, "0")
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const yyyy = now.getFullYear()
  const runDir = path.join(baseDir, "Indicadores", `${dd}-${mm}-${yyyy}`)
  await fs.mkdir(runDir, { recursive: true })
  return path.join(runDir, `reporte-okr-${dd}-${mm}-${yyyy}.xlsx`)
}

export async function fillQuality(
  params: FillQualityParams
): Promise<ToolResponse> {
  try {
    const { EXCEL_TEMPLATE_PATH, EXCEL_OUTPUT_DIR } = loadExcelEnv()

    const masterOutputPath = await resolveMasterOutputPath(EXCEL_OUTPUT_DIR)
    const workbook = new ExcelJS.Workbook()

    let fileToRead = EXCEL_TEMPLATE_PATH
    try {
      await fs.access(masterOutputPath)
      fileToRead = masterOutputPath
    } catch {
      fileToRead = EXCEL_TEMPLATE_PATH
    }

    await workbook.xlsx.readFile(fileToRead)

    const ws = workbook.getWorksheet(SHEET_NAME)
    if (!ws) {
      throw new Error(
        `Sheet "${SHEET_NAME}" not found in template "${fileToRead}"`
      )
    }

    const reposWritten: string[] = []
    const errors: string[] = []

    for (let i = 0; i < params.repos.length; i++) {
      const repo = params.repos[i]
      const col = 2 + i // B=2, C=3, D=4...

      try {
        const metrics = await fetchSonarMetrics(repo)
        const quality = mapMetricsToQuality(metrics, repo.projectKey, repo.branch)

        setCellValue(ws, 4, col, quality.projectKey)
        setCellValue(ws, 5, col, quality.branch)
        setCellValue(ws, 6, col, new Date(quality.analysisDate))

        if (quality.qualityGate) {
          setCellValue(ws, 10, col, quality.qualityGate)
        }
        if (quality.maintainabilityRating) {
          setCellValue(ws, 11, col, quality.maintainabilityRating)
        }
        if (quality.technicalDebtRatio) {
          setCellValue(ws, 12, col, parseFloat(quality.technicalDebtRatio) / 100)
        }
        if (quality.coverage) {
          setCellValue(ws, 13, col, parseFloat(quality.coverage) / 100)
        }
        if (quality.reliabilityRating) {
          setCellValue(ws, 14, col, quality.reliabilityRating)
        }

        // Row 15: Reliability Score formula
        const colLetter = String.fromCharCode(64 + col)
        const cell15 = ws.getCell(15, col)
        if (
          !cell15.value ||
          !(typeof cell15.value === "object" && "formula" in cell15.value)
        ) {
          cell15.value = {
            formula: `IF(${colLetter}14="A",1,IF(${colLetter}14="B",0.8,IF(${colLetter}14="C",0.6,IF(${colLetter}14="D",0.4,IF(${colLetter}14="E",0.2,0)))))`,
          } as ExcelJS.CellFormulaValue
        }

        if (quality.vulnerabilities) {
          setCellValue(ws, 16, col, parseInt(quality.vulnerabilities, 10))
        }

        reposWritten.push(repo.projectKey)
        logger.info(
          { projectKey: repo.projectKey, metricsCollected: metrics.length },
          "SonarQube metrics written to quality template"
        )
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error"
        errors.push(`Repo "${repo.projectKey}": ${message}`)
      }
    }

    if (reposWritten.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: `No quality data collected. Errors:\n${errors.join("\n")}`,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      }
    }

    await workbook.xlsx.writeFile(masterOutputPath)

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              message:
                "Datos de calidad (KPI3) escritos exitosamente en el Excel",
              outputPath: masterOutputPath,
              reposWritten,
              errors: errors.length > 0 ? errors : undefined,
            },
            null,
            2
          ),
        },
      ],
      isError: false,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: `Error al llenar calidad de código: ${message}`,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    }
  }
}

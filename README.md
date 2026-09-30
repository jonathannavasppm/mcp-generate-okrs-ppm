# mcp-generate-okrs-ppm

MCP server que recolecta indicadores de múltiples fuentes
(SonarQube, UptimeRobot, Jira, npm-audit) para los proyectos
configurados y genera un reporte consolidado en Excel.

## Objetivo

- Leer la configuración de proyectos desde la env `PROJECTS`
  (`name`, `path`, `branch`, `timeToCompare` — número de días,
  ej. `"180"` — y bloques opcionales por fuente).
- Exponer tools para **validar acceso** a cada fuente habilitada
  antes de correr la recolección.
- Recolectar datos de cada fuente, por proyecto, de forma
  secuencial y orquestada.
- Escribir los resultados en un Excel partiendo de una plantilla
  limpia (`EXCEL_TEMPLATE_PATH`), donde cada fuente llena su propia
  tab/sección, y guardar la salida en `EXCEL_OUTPUT_DIR`.
- Ser extensible: agregar una fuente nueva solo implica crear
  `providers/<nueva-fuente>/` y una línea en `providers/index.ts`.

## Stack

- TypeScript + Node.js (ESM)
- `@modelcontextprotocol/sdk` (server MCP)
- `zod` (validación de config)
- `exceljs` (escritura del Excel)
- `pino` (logging)
- `vitest` (tests)

## Tools expuestas

| Tool | Descripción |
|------|-------------|
| `verifyConfig` | Valida forma de `PROJECTS` y presencia de env vars de Excel (Zod, sin red). Devuelve el `runId`. |
| `validateOriginFile` | Valida acceso real: ping a cada fuente habilitada + que `EXCEL_TEMPLATE_PATH` exista y sea un `.xlsx` válido. Requiere `runId`. |
| `generateOKR` | Ejecuta la recolección orquestada fuente por fuente (orden explícito), escribe el Excel consolidado y reportes de detalle. Un fallo en una fuente no detiene las demás. |
| `analyzeJiraSprints` | Ejecuta de forma directa el análisis de **KPI6 (Indicador de Cumplimiento de Sprints Jira)**, filtrando solo Historias de Usuario para los sprints cerrados en el mes y escribe los resultados directamente en la hoja `KPI6_Cumplimiento` de la plantilla de Excel, generando además el archivo de evidencia secundario en `EXCEL_OUTPUT_DIR`. |

## Variables de entorno

```dotenv
PROJECTS=[{"name":"...","path":"...","branch":"...","timeToCompare":"180","jira":{...},"npm-audit":{...}}]
EXCEL_TEMPLATE_PATH=/ruta/al/template_okrs.xlsx
EXCEL_OUTPUT_DIR=/ruta/reportes-generados

# Credenciales globales de Jira (opcionales si se configuran por bloque en PROJECTS)
JIRA_URL=https://mi-empresa.atlassian.net
JIRA_TOKEN=mi_api_token_de_jira
JIRA_EMAIL=usuario@mi-empresa.com
```

`timeToCompare` se expresa en **días** (ej. `"180"`). Opcionalmente
acepta el sufijo `days`/`días` (`"180 days"`). Se usa para clasificar
el estado de soporte de cada dependencia en el reporte de
vulnerabilidades:

| Estado | Regla |
|--------|-------|
| `Deprecated` | Marcada como deprecated en el registry de npm |
| `Sin soporte` | La versión `latest` se publicó hace más de `timeToCompare` días |
| `Desactualizada` | `latest` es reciente pero la versión instalada es anterior |
| `Actualizada` | Versión instalada igual a `latest` y dentro del periodo |
| `Unknown` | El registry no devolvió fecha de publicación |

### Bloques opcionales por fuente

Cada proyecto puede habilitar fuentes con un bloque cuyo nombre es la
key del provider y con `enabled: true`. Si el bloque no existe o
`enabled` es `false`, la fuente se omite para ese proyecto.

```dotenv
PROJECTS=[
  {
    "name": "my-next-app",
    "path": "/ruta/al/proyecto",
    "branch": "develop",
    "timeToCompare": "180",

    "npm-audit": {
      "enabled": true
    },

    "sonarqube": {
      "enabled": false,
      "baseUrl": "https://sonarqube.mi-empresa.com",
      "projectKey": "my-next-app",
      "metrics": ["coverage", "bugs", "vulnerabilities"],
      "apiKeyEnv": "SONARQUBE_API_KEY"
    },

    "uptimeRobot": {
      "enabled": false,
      "companyId": "AbC123XyZ9",
      "projectId": "123456789"
    },

    "jira": {
      "enabled": true,
      "projectKey": "MCBPE"
    }
  }
]
```

| Bloque | Estado | Campos |
|--------|--------|--------|
| `npm-audit` | ✅ Implementado | `enabled` |
| `sonarqube` | ⏳ Pendiente | `enabled`, `baseUrl`, `projectKey`, `metrics`, `apiKeyEnv` |
| `uptimeRobot` | ✅ Implementado | `enabled`, `companyId`, `projectId` |
| `jira` | ✅ Implementado | `enabled`, `projectKey` (o `proyectKey`), `boardId` (opc.), `targetMonth` (opc.), `targetYear` (opc.), `storyPointField` (opc.), `token` (opc.), `url` (opc.), `email` (opc.) |

> **Nota de credenciales:** Para Jira se pueden definir `JIRA_URL`, `JIRA_TOKEN` y `JIRA_EMAIL` a nivel global en el archivo `.env`, permitiendo que en `PROJECTS` solo se requiera `{"jira": {"enabled": true, "projectKey": "CLAVE"}}`.

---

## Indicador de Cumplimiento (KPI6 - Jira)

El provider de Jira calcula el porcentaje de cumplimiento de sprints cerrados durante el mes evaluado y actualiza la hoja **`KPI6_Cumplimiento`** de la plantilla de Excel.

### Reglas de Negocio y Criterios de Evaluación

1. **Filtro exclusivo de Historias de Usuario (HU / Stories):**
   - Únicamente se evalúan issues de tipo `Story`, `Historia`, `Historia de usuario` o `HU`.
   - Se excluyen automáticamente **Bugs**, **Tareas (Tasks)**, **Subtareas (Sub-tasks)** y **Épicas (Epics)**.
2. **Sprints evaluados por mes:**
   - Se consideran únicamente los sprints cuyo cierre (`completeDate` o `endDate`) ocurrió dentro del mes analizado (por defecto, el último mes cerrado). Si un sprint inició el mes anterior pero cerró en el mes evaluado, se incluye.
3. **Cálculo de Story Points Comprometidos vs. Cumplidos:**
   - **Comprometidos:** Suma de puntos de historia de todas las Historias de Usuario del sprint.
   - **Cumplidos:** Suma de puntos de historia de las Historias de Usuario completadas en dicho sprint.
   - **Criterio de completitud:**
     - La historia debe pertenecer a la categoría `done` de Jira.
     - Se excluyen estados y resoluciones de descarte o cancelación (`Canceled`, `Won't Do`, `Rechazado`, `Descartado`, `Incomplete`, `No se hace`).
     - La fecha de resolución (`resolutiondate`) debe ser menor o igual a la fecha de cierre del sprint (`completeDate`). Si una HU se finalizó en un sprint posterior, no suma como cumplida en el sprint previo.
4. **Nomenclatura limpia:**
   - Los nombres de sprint se limpian para mostrar el formato estándar **`Sprint <número>`** (ej. `Sprint 47`), eliminando prefijos redundantes como `SCRUM`.

### Archivos de Salida Generados

1. **Excel Maestro (`reporte-okr-dd-mm-yyyy.xlsx` en `EXCEL_OUTPUT_DIR/Indicadores/<fecha>/`):**
   - **Sección A (Datos del Mes):** Asigna el nombre del mes evaluado (`B5`), el año (`D5`) y la cantidad de sprints cerrados (`B6`).
   - **Sección B (Detalle por Sprint):** Completa las filas 11 en adelante con `Sprint`, `Puntos Comprometidos`, `Puntos Completados`, fórmula dinámica de `% Cumplimiento` (`=IF(B11=0,0,C11/B11)`) y observaciones (`-`).
   - **Secciones C y D (Resultado Mensual y Análisis):** Fórmulas dinámicas vinculadas al rango real de sprints (`AVERAGE`, `COUNTIF`, `SUMPRODUCT`).
   - **Sección E (Evidencias):** Inserta un hipervínculo en la fila 32 (`Reportes de Sprint (Excel):`) apuntando al reporte secundario detallado.
2. **Reporte Secundario de Evidencia (`jira/jira-sprints-dd-mm-yyyy.xlsx`):**
   - Generado en la subcarpeta `jira/`.
   - Contiene la tabla de detalle de Sprints (Fechas, Puntos Comprometidos, Puntos Cumplidos, % Cumplimiento, Total HU y HU Cumplidas) y la tabla de **Resumen por Proyecto**.

---

### UptimeRobot multiproyecto

Cada proyecto habilitado consulta el endpoint público que utiliza el portal:
`/api/getMonitor/{companyId}?m={projectId}`. En
`KPI4_Disponibilidad` se crea o reutiliza un bloque horizontal por proyecto,
en el orden definido en `PROJECTS`. El porcentaje mensual se calcula con los
ratios diarios del mes calendario; `30dRatio` no se usa porque es una ventana
móvil.

El reporte incluye horas totales e indisponibles, disponibilidad, incidentes
y enlaces a la página pública y al Excel de detalle.

---

## Plan de implementación por fases

| Fase | Entregable | Criterio de "hecho" | Estado |
|------|-----------|----------------------|--------|
| **1** | Scaffolding: `package.json`, TypeScript, MCP SDK, entrypoint mínimo. | `npm run dev` levanta el server sin errores. | ✅ Completada |
| **2** | `core/config-loader.ts` con Zod parseando `PROJECTS` (campos base). | Test que carga un `PROJECTS` de ejemplo y valida forma correcta e incorrecta. | ✅ Completada |
| **3** | `core/provider-registry.ts` + contrato `DataProvider`. | Test que registra un provider dummy y lo recupera con `getEnabledFor`. | ✅ Completada |
| **4** | Primer provider real: SonarQube (`config.schema.ts`, `client.ts`, `provider.ts` con `validateAccess` + `fetchData` + `writeToExcel`). | `validateAccess` contra SonarQube real (o mock) devuelve `ok` correctamente. | ⏳ Pendiente |
| **5** | Tool de validación end-to-end con SonarQube. | Invocar la tool devuelve el reporte esperado. | ⏳ Pendiente |
| **5.5** | `core/pipeline-state.ts` + tools `verifyConfig` / `validateOriginFile` encadenadas por `runId`, y `generateOKR` con orden explícito de pasos y `continue`-on-error. | Las tools rechazan ejecutarse si el paso anterior no corrió o falló. | ✅ Completada |
| **6** | `core/excel-builder.ts` + tool `generateOKR` que orquesta la recolección y genera el `.xlsx` desde `EXCEL_TEMPLATE_PATH` hacia `EXCEL_OUTPUT_DIR/Indicadores/<dd-MM-yyyy>/`. | Se genera un Excel con secciones reales sin modificar la plantilla base. | ✅ Completada |
| **7** | Implementación de providers: UptimeRobot, Jira (KPI6) y npm-audit. | Cada uno pasa sus propios tests unitarios e integración en plantilla Excel. | ✅ npm-audit, UptimeRobot y Jira implementados |
| **8** | Manejo de errores transversal: branch mismatch, rate limiting, timeouts por fuente. | Un fallo en una fuente no detiene el reporte completo. | ⏳ Pendiente |
| **9** | Documentación: README con configuración de `PROJECTS` y herramientas. | Documentación completa de tools y variables de entorno. | ✅ Completada |

## Estructura de carpetas

```
src/
  core/
    config-loader.ts       # parsea y valida la env PROJECTS y EXCEL_*
    provider-registry.ts   # registro auto-registrable de fuentes
    pipeline-state.ts      # estado compartido entre tools (runId)
    excel-builder.ts       # utilidades de construcción Excel
  providers/
    jira/                  # provider KPI6 (Indicador de Cumplimiento)
    npm-audit/             # provider KPI de vulnerabilidades
    uptimerobot/           # provider KPI4 (Disponibilidad)
  tools/
    definitions.ts         # registro de tools en el McpServer
    verifyConfig.ts
    validateOriginFile.ts
    generateOKR.ts
    analyzeJiraSprints.ts  # tool directa para KPI6 de Jira
  types/types.ts           # contratos y tipos del pipeline
  utils/                   # env, errors, logger
  index.ts                 # entrypoint del server MCP
```

## Comandos

```bash
npm run dev        # levanta el server en desarrollo (tsx)
npm run build      # compila a dist/
npm start          # corre el build
npm test           # vitest (tests unitarios)
npm run typecheck  # tsc --noEmit
```

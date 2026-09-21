# mcp-generate-okrs-ppm

MCP server que recolecta indicadores de múltiples fuentes
(SonarQube, UptimeRobot, Jira, npm-audit) para los proyectos
configurados y genera un reporte consolidado en Excel.

## Objetivo

- Leer la configuración de proyectos desde la env `PROJECTS`
  (`name`, `path`, `branch`, `timeToCompare` y bloques opcionales
  por fuente).
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

## Tools expuestas (pipeline secuencial)

Las tools se invocan en orden; cada una exige que el paso anterior
haya pasado (estado compartido vía `core/pipeline-state.ts` con un
`runId` generado por `verifyConfig`):

| Tool | Descripción |
|------|-------------|
| `verifyConfig` | Valida forma de `PROJECTS` y presencia de env vars de Excel (Zod, sin red). Devuelve el `runId`. |
| `validateOriginFile` | Valida acceso real: ping a cada fuente habilitada + que `EXCEL_TEMPLATE_PATH` exista y sea un `.xlsx` válido. Requiere `runId`. |
| `generateOKR` | Ejecuta la recolección real fuente por fuente (orden explícito), escribe el Excel consolidado y reportes de detalle. Un fallo en una fuente no detiene las demás. |

## Variables de entorno

```dotenv
PROJECTS=[{"name":"...","path":"...","branch":"...","timeToCompare":"...","sonarqube":{...}}]
EXCEL_TEMPLATE_PATH=/ruta/al/reporte-base.xlsx
EXCEL_OUTPUT_DIR=/ruta/reportes-generados
```

La salida se organiza por ejecución:
`EXCEL_OUTPUT_DIR/Indicadores/<dd-MM-yyyy>/` con el Excel maestro en
la raíz y reportes de detalle (ej. `vulnerabilidades/`) en
subcarpetas.

## Plan de implementación por fases

| Fase | Entregable | Criterio de "hecho" | Estado |
|------|-----------|----------------------|--------|
| **1** | Scaffolding: `package.json`, TypeScript, MCP SDK, entrypoint mínimo. | `npm run dev` levanta el server sin errores. | ✅ Completada |
| **2** | `core/config-loader.ts` con Zod parseando `PROJECTS` (campos base). | Test que carga un `PROJECTS` de ejemplo y valida forma correcta e incorrecta. | ✅ Completada |
| **3** | `core/provider-registry.ts` + contrato `DataProvider`. | Test que registra un provider dummy y lo recupera con `getEnabledFor`. | ✅ Completada |
| **4** | Primer provider real: SonarQube (`config.schema.ts`, `client.ts`, `provider.ts` con `validateAccess` + `fetchData` + `writeToExcel`). | `validateAccess` contra SonarQube real (o mock) devuelve `ok` correctamente. | 🔶 **Fase actual** |
| **5** | Tool de validación end-to-end con SonarQube. | Invocar la tool devuelve el reporte esperado. | ⏳ Parcial (estructura lista, falta provider real) |
| **5.5** | `core/pipeline-state.ts` + tools `verifyConfig` / `validateOriginFile` encadenadas por `runId`, y `generateOKR` con orden explícito de pasos y `continue`-on-error. | Las tools rechazan ejecutarse si el paso anterior no corrió o falló. | ✅ Completada (verifyConfig + validateOriginFile operativas) |
| **6** | `core/excel-builder.ts` + tool `generateOKR` que orquesta la recolección y genera el `.xlsx` desde `EXCEL_TEMPLATE_PATH` hacia `EXCEL_OUTPUT_DIR/Indicadores/<dd-MM-yyyy>/`. | Se genera un Excel con al menos una sección real sin modificar la plantilla. | ⏳ Pendiente (`excel-builder.ts` vacío) |
| **7** | Agregar UptimeRobot, Jira y npm-audit siguiendo el mismo patrón, uno a la vez. | Cada uno pasa sus propios tests antes de integrar el siguiente. | ⏳ Pendiente |
| **8** | Manejo de errores transversal: branch mismatch, rate limiting, timeouts por fuente. | Un fallo en una fuente no detiene el reporte completo. | ⏳ Pendiente |
| **9** | Documentación: README con configuración de `PROJECTS` y checklist "cómo agregar una fuente nueva". | Alguien nuevo puede agregar un provider siguiendo solo el README. | ⏳ Pendiente |

## Estructura de carpetas

```
src/
  core/
    config-loader.ts       # parsea y valida la env PROJECTS
    provider-registry.ts   # registro auto-registrable de fuentes
    pipeline-state.ts      # estado compartido entre tools (runId)
    excel-builder.ts       # arma el Excel desde la plantilla
  providers/               # una carpeta por fuente (pendiente)
  tools/
    definitions.ts         # registro de tools en el McpServer
    verify-config.ts
    validate-origin-file.ts
  types/types.ts           # contrato DataProvider
  utils/                   # env, errors, logger
  index.ts                 # entrypoint del server MCP
```

## Comandos

```bash
npm run dev        # levanta el server en desarrollo (tsx)
npm run build      # compila a dist/
npm start          # corre el build
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

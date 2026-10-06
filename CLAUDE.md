# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Servidor MCP (Model Context Protocol) que recolecta indicadores (KPIs) de múltiples fuentes (Jira, UptimeRobot, npm-audit, SonarQube) y genera reportes consolidados en Excel. Se comunica vía `stdio` y se distribuye como ejecutable npm.

## Comandos

```bash
npm run dev        # levanta el server MCP en desarrollo (tsx)
npm run build      # compila TypeScript a dist/
npm start          # ejecuta el build compilado
npm test           # vitest run __tests__
npm run typecheck  # tsc --noEmit
npm run inspector  # abre el inspector MCP para depuración
```

## Arquitectura

- **ESM + TypeScript** (target ES2022, module NodeNext). Imports usan extensión `.js` incluso para archivos `.ts`.
- **Entrypoint:** `src/index.ts` — crea un `McpServer`, registra tools y conecta vía `StdioServerTransport`.

### Pipeline de ejecución

Las tools siguen un flujo encadenado por `runId` (estado persistido en archivos JSON en `$TMPDIR`):

1. `verifyConfig` — valida env vars (`PROJECTS`, `EXCEL_TEMPLATE_PATH`, `EXCEL_OUTPUT_DIR`) con Zod. Genera el `runId`.
2. `validateOriginFile` — valida acceso real a fuentes habilitadas y que la plantilla Excel exista. Requiere `runId`.
3. `generateOKR` — recolecta datos de todos los providers habilitados y escribe el Excel consolidado. Requiere `runId`.

Tools independientes (no requieren `runId`): `analyzeJiraSprints`, `fillQuality`.

### Providers (patrón plugin)

Cada provider implementa la interfaz `DataProvider` (`types/types.ts`):
- `validateAccess()` — verifica conectividad
- `fetchData()` — obtiene datos de la fuente
- `writeToExcel()` — escribe en la hoja correspondiente del Excel
- `buildSharedDetailReport?()` — genera reporte de detalle secundario (opcional)

Para agregar un nuevo provider:
1. Crear `src/providers/<nombre>/` con `client.ts`, `provider.ts`, `config.schema.ts`, `types.ts`, `index.ts`
2. En el `index.ts` del provider, registrar con `registry.register(provider)`
3. Importar el nuevo provider en `src/providers/index.ts`

Providers implementados:
- `npm-audit` → hoja de vulnerabilidades
- `uptime-robot` → `KPI4_Disponibilidad`
- `jira` → `KPI6_Cumplimiento` (sprints)
- `sonarqube` → `KPI3_CalidadCodigo` (solo vía tool `fillQuality`)

### Core

- `config-loader.ts` — parsea `PROJECTS` (JSON en env var) con Zod
- `provider-registry.ts` — singleton `registry` que almacena providers por key; `getEnabledFor(project)` filtra por `{ enabled: true }` en el bloque del proyecto
- `pipeline-state.ts` — persiste estado de cada `runId` en `$TMPDIR/mcp-run-{runId}.json`; `requireStepOk()` impone orden de ejecución
- `excel-builder.ts` — utilidades para construir el Excel desde la plantilla

### Tools

Definidas en `src/tools/definitions.ts` y registradas en el `McpServer`. Cada tool tiene su propio archivo en `src/tools/`.

## Configuración

Variables de entorno principales (ver `.env.example`):
- `PROJECTS` — JSON array con proyectos y bloques de providers habilitados
- `EXCEL_TEMPLATE_PATH` — ruta absoluta a plantilla `.xlsx`
- `EXCEL_OUTPUT_DIR` — directorio de salida para reportes
- `JIRA_URL`, `JIRA_TOKEN`, `JIRA_EMAIL` — credenciales Jira globales

Cada proyecto en `PROJECTS` habilita providers con bloques `{ "enabled": true }` bajo la key del provider.

## Convenciones

- Los tests están en `__tests__/` (espejo de la estructura de `src/`) y colocados junto al código en `src/providers/` (ej. `jira.test.ts`).
- Errores de aplicación usan `McpAppError` (`src/utils/errors.ts`).
- Logging con `pino` (`src/utils/logger.ts`).
- Un fallo en un provider no detiene la recolección de los demás.

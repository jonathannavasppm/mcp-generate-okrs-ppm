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

## Tools expuestas (pipeline secuencial)

Las tools se invocan en orden; cada una exige que el paso anterior
haya pasado (estado compartido vía `core/pipeline-state.ts` con un
`runId` generado por `verifyConfig`):

| Tool | Descripción |
|------|-------------|
| `verifyConfig` | Valida forma de `PROJECTS` y presencia de env vars de Excel (Zod, sin red). Devuelve el `runId`. |
| `validateOriginFile` | Valida acceso real: ping a cada fuente habilitada + que `EXCEL_TEMPLATE_PATH` exista y sea un `.xlsx` válido. Requiere `runId`. |
| `generateOKR` | Ejecuta la recolección real fuente por fuente (orden explícito), escribe el Excel consolidado y reportes de detalle. Un fallo en una fuente no detiene las demás. |
| `analyzeJiraSprints` | Analiza el cumplimiento de Story Points en Historias de Usuario (HU) para sprints cerrados en el mes evaluado y devuelve la tabla formateada. |

## Variables de entorno

```dotenv
PROJECTS=[{"name":"...","path":"...","branch":"...","timeToCompare":"180","sonarqube":{...}}]
EXCEL_TEMPLATE_PATH=/ruta/al/reporte-base.xlsx
EXCEL_OUTPUT_DIR=/ruta/reportes-generados
```

`timeToCompare` se expresa en **días** (ej. `"180"`). Opcionalmente
acepta el sufijo `days`/`días` (`"180 days"`). Se usa para clasificar
el estado de soporte de cada dependencia en el reporte de
vulnerabilidades.

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

    "jira": {
      "enabled": true,
      "url": "https://qphcorp.atlassian.net",
      "token": "ATATT...",
      "email": "usuario@empresa.com",
      "projectKey": "FE"
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
      "apiKeyEnv": "UPTIMEROBOT_API_KEY",
      "monitorIds": ["123456789"]
    }
  }
]
```

| Bloque | Estado | Campos |
|--------|--------|--------|
| `npm-audit` | ✅ Implementado | `enabled` |
| `jira` | ✅ Implementado | `enabled`, `url` / `baseUrl`, `token`, `email`, `apiKeyEnv`, `projectKey`, `boardId`, `targetMonth`, `targetYear` |
| `sonarqube` | ⏳ Pendiente | `enabled`, `baseUrl`, `projectKey`, `metrics`, `apiKeyEnv` |
| `uptimeRobot` | ⏳ Pendiente | `enabled`, `apiKeyEnv`, `monitorIds` |

### Reglas de Negocio - Jira Provider
1. **Filtro de HU**: Solo se consideran Historias de Usuario (`Story`, `Historia`, `HU`). Se excluyen Bugs, Tareas (`Task`), Subtareas (`Sub-task`) y Épicas.
2. **Filtro de Sprints**: Únicamente sprints que fueron cerrados (`state: closed`) dentro del mes a evaluar (tomando como base `completeDate`).
3. **Métricas**:
   - Puntos Comprometidos: Suma de Story Points asignados a las HU en el sprint.
   - Puntos Cumplidos: Suma de Story Points de HU con estado finalizado (`Done`, `Cerrado`, `Resuelto`).
   - % Cumplimiento: `(Puntos Cumplidos / Puntos Comprometidos) * 100`.

La salida se organiza por ejecución:
`EXCEL_OUTPUT_DIR/Indicadores/<dd-MM-yyyy>/` con el Excel maestro en
la raíz y reportes de detalle (ej. `vulnerabilidades/`, `jira/`) en
subcarpetas.

## Estructura de carpetas

```
src/
  core/
    config-loader.ts       # parsea y valida la env PROJECTS
    provider-registry.ts   # registro auto-registrable de fuentes
    pipeline-state.ts      # estado compartido entre tools (runId)
    excel-builder.ts       # arma el Excel desde la plantilla
  providers/
    npm-audit/
    jira/                  # provider de Jira (Sprint metrics & HU)
  tools/
    definitions.ts         # registro de tools en el McpServer
    verifyConfig.ts
    validateOriginFile.ts
    generateOKR.ts
    analyzeJiraSprints.ts
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

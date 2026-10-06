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

## Requisitos

- Node.js 20 o superior.
- Una plantilla Excel `.xlsx` compatible, distribuida fuera del paquete.
- Acceso de lectura a los proyectos configurados en `PROJECTS`.
- Acceso de escritura a `EXCEL_OUTPUT_DIR`.
- Credenciales y acceso de red para los providers habilitados.

## Instalación desde npm

El servidor se distribuye como un ejecutable MCP por `stdio`. La versión
estable actual es `1.0.1`. Para entornos controlados se recomienda fijar esa
versión exacta:

```bash
npx -y mcp-generate-okrs-ppm@1.0.1
```

También puede instalar la versión publicada con el dist-tag `latest`:

```bash
npm install -g mcp-generate-okrs-ppm@latest
```

Usar una versión exacta evita que una actualización de `latest` cambie el
comportamiento del servidor sin una validación previa. El cliente MCP debe
ejecutarse en la misma máquina donde existen los proyectos, la plantilla y el
directorio de salida configurados.

### Cambios en `1.0.1`

- `generateOKR` actualiza directamente la hoja `KPI6_Cumplimiento` para el
  primer proyecto que tenga Jira habilitado, aunque no sea el primer proyecto
  definido en `PROJECTS`.
- El reporte consolidado y el reporte de evidencia de Jira se generan dentro
  del mismo flujo; no es necesario ejecutar `analyzeJiraSprints` después de
  `generateOKR`.
- `analyzeJiraSprints` se conserva como herramienta independiente para
  regenerar o analizar Jira de forma puntual.

## Configuración en clientes MCP

Las configuraciones compartidas no deben contener tokens ni credenciales. Use
la configuración local o el gestor de secretos del cliente para valores como
`JIRA_TOKEN`.

### Devin CLI

Guarde la configuración personal en `.devin/mcp_config.local.json`:

```json
{
  "mcpServers": {
    "generate-okrs-ppm": {
      "command": "npx",
      "args": ["-y", "mcp-generate-okrs-ppm@1.0.1"],
      "env": {
        "PROJECTS": "[{\"name\":\"web\",\"path\":\"/absolute/path/to/web\",\"branch\":\"main\",\"timeToCompare\":\"180\",\"npm-audit\":{\"enabled\":true}}]",
        "EXCEL_TEMPLATE_PATH": "/absolute/path/to/template_okrs.xlsx",
        "EXCEL_OUTPUT_DIR": "/absolute/path/to/output",
        "JIRA_URL": "https://your-company.atlassian.net",
        "JIRA_EMAIL": "your-email@example.com",
        "JIRA_TOKEN": "your-local-secret"
      }
    }
  }
}
```

También puede registrar el comando desde la terminal:

```bash
devin mcp add generate-okrs-ppm -- \
  npx -y mcp-generate-okrs-ppm@1.0.1
```

Use `.devin/mcp_config.json` únicamente para definiciones no sensibles que se
compartirán con el equipo.

### Claude Code

Registre el servidor con scope local:

```bash
claude mcp add --transport stdio --scope local generate-okrs-ppm \
  -- npx -y mcp-generate-okrs-ppm@1.0.1
```

También puede utilizar `.mcp.json` para configuración de proyecto o
`~/.claude.json` para configuración de usuario:

```json
{
  "mcpServers": {
    "generate-okrs-ppm": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-generate-okrs-ppm@1.0.1"],
      "env": {
        "PROJECTS": "[...]",
        "EXCEL_TEMPLATE_PATH": "/absolute/path/to/template_okrs.xlsx",
        "EXCEL_OUTPUT_DIR": "/absolute/path/to/output"
      }
    }
  }
}
```

Compruebe la conexión mediante `/mcp` o `claude mcp list`.

### Antigravity

Use `~/.gemini/config/mcp_config.json` para configuración global o
`.agents/mcp_config.json` para el workspace:

```json
{
  "mcpServers": {
    "generate-okrs-ppm": {
      "command": "npx",
      "args": ["-y", "mcp-generate-okrs-ppm@1.0.1"],
      "env": {
        "PROJECTS": "[...]",
        "EXCEL_TEMPLATE_PATH": "/absolute/path/to/template_okrs.xlsx",
        "EXCEL_OUTPUT_DIR": "/absolute/path/to/output"
      }
    }
  }
}
```

En Antigravity IDE puede abrir esta configuración desde **MCP Servers → Manage
MCP Servers → View raw config**.

### Flujo de verificación

Después de reiniciar o recargar el cliente:

1. Confirme que aparecen las cinco tools del servidor.
2. Ejecute `verifyConfig` y conserve el `runId` devuelto.
3. Ejecute `validateOriginFile` con ese `runId`.
4. Ejecute `generateOKR` con el mismo `runId`.
5. (Opcional) Ejecute `fillQuality` para llenar KPI3 con métricas de SonarQube.
6. Confirme que la plantilla original no cambió y que el reporte se creó en
   `EXCEL_OUTPUT_DIR`.

## Tools expuestas

| Tool | Descripción |
|------|-------------|
| `verifyConfig` | Valida forma de `PROJECTS` y presencia de env vars de Excel (Zod, sin red). Devuelve el `runId`. |
| `validateOriginFile` | Valida acceso real: ping a cada fuente habilitada + que `EXCEL_TEMPLATE_PATH` exista y sea un `.xlsx` válido. Requiere `runId`. |
| `generateOKR` | Ejecuta la recolección orquestada fuente por fuente (orden explícito), incluida la actualización de Jira en `KPI6_Cumplimiento`, y escribe el Excel consolidado y los reportes de detalle. Un fallo en una fuente no detiene las demás. |
| `analyzeJiraSprints` | Regenera de forma independiente el análisis de **KPI6 (Indicador de Cumplimiento de Sprints Jira)**. Es opcional después de `generateOKR` y resulta útil para ejecutar Jira de forma puntual con filtros de proyecto o periodo. |
| `fillQuality` | Llena la hoja **`KPI3_CalidadCodigo`** con métricas de SonarQube (Quality Gate, Maintainability Rating, Technical Debt Ratio, Coverage, Reliability Rating/Score y Vulnerabilidades). Si no se pasan repos manualmente, lee automáticamente los proyectos con `sonarqube.enabled=true` de `PROJECTS`. Cada repo ocupa una columna (B, C, D…). No requiere `runId`. |

## Variables de entorno

```dotenv
PROJECTS=[{"name":"...","path":"...","branch":"...","timeToCompare":"180","jira":{...},"npm-audit":{...}}]
EXCEL_TEMPLATE_PATH=/ruta/al/template_okrs.xlsx
EXCEL_OUTPUT_DIR=/ruta/reportes-generados

# Credenciales globales de Jira (opcionales si se configuran por bloque en PROJECTS)
JIRA_URL=https://mi-empresa.atlassian.net
JIRA_TOKEN=mi_api_token_de_jira
JIRA_EMAIL=usuario@mi-empresa.com

# Token de SonarQube (sobreescribible por repo con apiKeyEnv en PROJECTS)
SONARQUBE_API_KEY=mi_token_de_sonarqube
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
| `sonarqube` | ✅ Implementado | `enabled`, `baseUrl`, `projectKey`, `metrics`, `apiKeyEnv` |
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

## Calidad de Código (KPI3 - SonarQube)

La tool `fillQuality` consulta la API `api/measures/component` de SonarQube para
cada repositorio y escribe los resultados en la hoja **`KPI3_CalidadCodigo`**.
Cada repo ocupa una columna consecutiva (B, C, D…), permitiendo comparación lado
a lado de múltiples proyectos.

Si no se pasan repos como parámetro, la tool lee automáticamente los proyectos
con `sonarqube.enabled=true` de `PROJECTS`.

### Métricas recolectadas por repositorio

| Fila | Métrica | Fuente SonarQube | Transformación |
|------|---------|-----------------|----------------|
| 4 | Project Key | — | Identificador del repo en SonarQube |
| 5 | Branch | — | Branch analizado (parámetro de entrada) |
| 6 | Fecha de análisis | — | Timestamp de ejecución (ISO 8601) |
| 10 | Quality Gate | `alert_status` | OK → PASS, ERROR → FAIL, WARN → WARN |
| 11 | Maintainability Rating | `sqale_rating` | 1 → A, 2 → B, 3 → C, 4 → D, 5 → E |
| 12 | Technical Debt Ratio | `sqale_debt_ratio` | Valor / 100 (se almacena como porcentaje) |
| 13 | Coverage | `coverage` | Valor / 100 (se almacena como porcentaje) |
| 14 | Reliability Rating | `reliability_rating` | 1 → A, 2 → B, 3 → C, 4 → D, 5 → E |
| 15 | Reliability Score | — (fórmula Excel) | A=1, B=0.8, C=0.6, D=0.4, E=0.2 (IF anidado) |
| 16 | Vulnerabilities | `vulnerabilities` | Cantidad (valor entero) |

### Configuración

Requiere la variable `SONARQUBE_API_KEY` (o la especificada en `apiKeyEnv` por
repo) y el bloque `sonarqube` habilitado en `PROJECTS`:

```json
{
  "sonarqube": {
    "enabled": true,
    "baseUrl": "https://sonarqube.mi-empresa.com",
    "projectKey": "mi-proyecto",
    "apiKeyEnv": "SONARQUBE_API_KEY"
  }
}
```

---

## Plan de implementación por fases

| Fase | Entregable | Criterio de "hecho" | Estado |
|------|-----------|----------------------|--------|
| **1** | Scaffolding: `package.json`, TypeScript, MCP SDK, entrypoint mínimo. | `npm run dev` levanta el server sin errores. | ✅ Completada |
| **2** | `core/config-loader.ts` con Zod parseando `PROJECTS` (campos base). | Test que carga un `PROJECTS` de ejemplo y valida forma correcta e incorrecta. | ✅ Completada |
| **3** | `core/provider-registry.ts` + contrato `DataProvider`. | Test que registra un provider dummy y lo recupera con `getEnabledFor`. | ✅ Completada |
| **4** | Tool `fillQuality` para SonarQube: consulta métricas de calidad y escribe en `KPI3_CalidadCodigo`. Lee repos de `PROJECTS` automáticamente. | La tool llena una columna por repo con Quality Gate, ratings, coverage y vulnerabilidades. | ✅ Completada |
| **5** | Validación end-to-end con SonarQube multiproyecto. | Invocar `fillQuality` sin parámetros toma todos los proyectos con `sonarqube.enabled=true`. | ✅ Completada |
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
    fillQuality.ts         # tool para KPI3 de SonarQube
  types/types.ts           # contratos y tipos del pipeline
  utils/                   # env, errors, logger
  index.ts                 # entrypoint del server MCP
```

## Publicación inicial controlada

La publicación inicial se realiza manualmente para revisar el artefacto exacto
antes de registrarlo en npm.

1. Use una cuenta npm con email verificado y 2FA habilitado.
2. Confirme que el repositorio esté limpio y la versión no exista en npm.
3. Ejecute las validaciones:

   ```bash
   npm ci
   npm run typecheck
   npm test
   npm run build
   npm pack --dry-run
   ```

4. Inspeccione el contenido del tarball. No debe contener `.env`, tokens,
   reportes, tests ni archivos locales.
5. Publique desde el commit validado:

   ```bash
   npm publish
   ```

6. Verifique la versión publicada desde un directorio limpio:

   ```bash
   npm view mcp-generate-okrs-ppm
   npx -y mcp-generate-okrs-ppm@1.0.1
   ```

Una versión publicada no puede sobrescribirse ni reutilizarse. Cualquier
corrección requiere incrementar la versión siguiendo SemVer.

## Mejora futura: publicación con GitHub Actions

Se contempla automatizar las siguientes versiones mediante GitHub Actions,
pero esta automatización todavía no está implementada. La evolución propuesta
incluye:

- Crear un workflow dedicado que se active solo con tags SemVer o GitHub
  Releases, nunca con cada push a `main`.
- Configurar npm Trusted Publishing para autenticar GitHub Actions mediante
  OIDC y evitar un `NPM_TOKEN` persistente.
- Otorgar al job únicamente `contents: read` e `id-token: write`.
- Ejecutar `npm ci`, typecheck, tests, build y `npm pack --dry-run` antes de
  publicar.
- Verificar que el tag coincide con `package.json` y que la versión no existe.
- Usar un GitHub Environment con aprobación manual, control de concurrencia y
  provenance del artefacto.

Esta mejora debe abordarse después de crear el paquete mediante la publicación
inicial controlada y asociar el Trusted Publisher en npm.

## Comandos

```bash
npm run dev        # levanta el server en desarrollo (tsx)
npm run build      # compila a dist/
npm start          # corre el build
npm test           # vitest (tests unitarios)
npm run typecheck  # tsc --noEmit
```

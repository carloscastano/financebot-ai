# FINANCEBOT-IA

Asistente financiero personal sobre **Google Apps Script**: procesa movimientos bancarios Bancolombia (email + extracto), clasifica con **Gemini**, controla presupuestos y metas, y conversa por **Telegram**.

---

## Estructura del proyecto

```
financebot-ai/
├── src/                    # Código Apps Script (lo que se publica con clasp)
│   ├── appsscript.json
│   ├── FinanceBot.gs       # Orquestador principal
│   ├── EmailParser.gs      # Parsing de notificaciones Bancolombia
│   ├── Extractor.gs        # Importa extractos .xlsx/.zip
│   ├── Sheets.gs           # Capa de acceso a Google Sheets
│   ├── Telegram.gs         # Bot + comandos
│   ├── Chat.gs             # Conversación libre con Gemini
│   ├── Advisor.gs          # Métricas y reporte mensual
│   ├── WeeklyReport.gs     # Reporte semanal automático
│   ├── Budget.gs           # Alertas de presupuesto
│   ├── Goals.gs            # Metas de ahorro
│   ├── Subscriptions.gs    # Detección de suscripciones fantasma
│   ├── Features.gs         # Feature flags
│   ├── Config.gs           # Constantes del sistema
│   ├── Ops.gs              # Operación / health checks / triggers
│   ├── FinancialInsights.gs
│   └── FinancialSkill.gs   # Skill IA centralizada
│
├── scripts/                # Herramientas locales (Node, no se publican)
│   ├── gas-run.js          # Ejecuta funciones GAS desde CLI
│   ├── deploy.js           # push + healthcheck + commit + perf
│   ├── perf.js             # Métricas post-deploy
│   ├── load2025.js         # Carga histórica mes a mes
│   └── reauth.js           # Re-autoriza clasp con todos los scopes
│
├── docs/                   # Documentación de usuario
│   ├── INSTALACION.md
│   ├── GUIA_USO.md
│   └── OPERACION_SOPORTE.md
│
├── .github/workflows/      # CI/CD (push → clasp deploy)
├── .clasp.json             # Config clasp (rootDir → ./src)
├── credentials.json        # OAuth client (gitignored)
├── package.json            # Scripts npm
└── README.md
```

---

## Comandos rápidos

```bash
npm run health      # Health check remoto del sistema
npm run deploy      # Push + healthcheck + commit + perf
npm run perf        # Métricas de pipeline
npm run reauth      # Re-autorizar clasp si caducó el token
npm run gas <fn>    # Ejecutar cualquier función GAS desde CLI
npm run load        # Carga histórica de emails Gmail
```

---

## Stack

- **Runtime:** Google Apps Script V8
- **Datos:** Google Sheets (Transactions, Configurations, Dashboard, Goals, Pending Payments, Errors)
- **IA:** Gemini 2.5 Flash-Lite (clasificación + chat + insights)
- **Notificaciones:** Telegram Bot API
- **Email:** Gmail API + label `FinanceBot-Procesado`
- **CLI / deploy:** clasp + `scripts/gas-run.js` (Execution API, devMode)

---

## CI/CD

Workflow en `.github/workflows/ci-cd.yml`. Cada push a `master` ejecuta:

1. **QA** — checks de calidad
2. **Performance** — métricas de pipeline
3. **Deploy** — `clasp push --force` + `clasp deploy`
4. **Notify** — alerta Telegram si algún job falla

Secrets requeridos en GitHub: `CLASPRC_JSON`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

---

## Documentación

- [docs/INSTALACION.md](docs/INSTALACION.md) — Setup paso a paso (compartible)
- [docs/GUIA_USO.md](docs/GUIA_USO.md) — Comandos del bot y ejemplos
- [docs/OPERACION_SOPORTE.md](docs/OPERACION_SOPORTE.md) — Runbook ante fallos

---

## Backlog

### Completado

- [x] #1 Importar extracto Bancolombia (.xlsx/.zip)
- [x] #2 Clasificación automática con Gemini
- [x] #3 Alertas Telegram por gasto alto
- [x] #4 Registro manual de gastos/ingresos
- [x] #5 Recordatorio de pagos pendientes
- [x] #6 Reporte financiero mensual con IA
- [x] #7 Dashboard en Google Sheets
- [x] #8 Suscripciones fantasma (`/suscripciones`)
- [x] #9 Metas de ahorro v2 (`/metas`, `/meta estado`)
- [x] #10 Recordatorio mensual metas + viabilidad
- [x] #11 Alertas presupuesto en tiempo real
- [x] #12 Reporte semanal automático
- [x] #13 `/presupuesto` — estado por categoría
- [x] #14 Feature flags (`/config`, `/activar`, `/desactivar`)
- [x] #15 Chat conversacional financiero
- [x] #19 Setup wizard no-técnico
- [x] #21 Guía de uso (GUIA_USO.md)
- [x] #23 Mejorar filtro suscripciones
- [x] Reorganización por carpetas (`src/`, `scripts/`, `docs/`)

### Pendiente

- [ ] #16 Carga histórica Gmail completa (mes a mes)

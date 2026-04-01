# FinanceBot AI — Contexto para Claude Code
# Actualizado: 2026-03-28 — v1.0 EN PRODUCCIÓN

## Qué es este proyecto
Pipeline automatizado gratuito: Gmail (Bancolombia) → Gemini 2.5 Flash-Lite → Google Sheets → Telegram.
Corre 100% en **Google Apps Script** (no n8n, no Docker, no servidor local). Costo: $0/mes.

## Archivos del proyecto
| Archivo | Rol |
|---------|-----|
| Config.gs | CONFIG object, credenciales via Script Properties |
| FinanceBot.gs | Función principal, trigger cada 5 min + cargarHistoricoEmails() |
| Sheets.gs | Escritura en Google Sheets, Dashboard, configuración de hojas |
| Telegram.gs | Alertas por monto + recordatorios Pending Payments |

## Credenciales (en Script Properties de Apps Script — NUNCA en código)
- `GEMINI_API_KEY`: configurada
- `SPREADSHEET_ID`: 15TLFbQ8mp7Wyv0_QsxCwc8RZ-iXP_O-848xZx59nrtM
- `TELEGRAM_BOT_TOKEN`: configurado
- `TELEGRAM_CHAT_ID`: configurado

## Stack
- **LLM**: Gemini 2.5 Flash-Lite (gratis, 1000 req/día, 15 RPM)
- **Storage**: Google Sheets (7 hojas)
- **Trigger**: Apps Script time-based trigger cada 5 minutos
- **Alertas**: Telegram Bot (umbral configurable en hoja Configurations)
- **Versionamiento**: GitHub (carloscastano/financebot-ai, PRIVADO) + clasp

## Hojas de Google Sheets (en este orden)
1. Dashboard — KPIs mes actual + histórico
2. Transactions — 17 columnas, auto-sort fecha desc
3. Configurations — parámetros editables
4. Pending Payments — pagos recurrentes + recordatorios Telegram
5. Search Products — lista de compras futuras
6. Errors — log de errores del bot
7. DataDictionary — glosario de campos

## Herramientas de desarrollo
### clasp (Google Apps Script CLI)
- Script ID: `19hEt199VG1WMvRagXGwrjJ-O7EqRisKshfhHLo_sEYXMWn-2BFA5uSI2`
- Push a Apps Script: `clasp push`
- Pull desde Apps Script: `clasp pull`

### GitHub
- Repo: carloscastano/financebot-ai (PRIVADO)
- Branch: master
- .gitignore incluye: secrets.env

### Workflow de desarrollo
1. Editar en VS Code
2. `clasp push` → sube a Apps Script
3. `git add . && git commit -m "mensaje" && git push`

Si se editó en Apps Script directo:
1. `clasp pull` primero para bajar los cambios
2. Luego `git commit && git push`

## REGLAS CRÍTICAS — Fórmulas Google Sheets (locale español)

### NUNCA usar con setFormula():
- `IF(a,b,c)` → falla por separador punto y coma en locale español
- `IFERROR(a,b)` → mismo problema
- `ARRAYFORMULA(...)` dentro de `SUMPRODUCT` → causa #ERROR!
- `DATEVALUE()` sobre fechas nativas → falla (ya son Date, no texto)

### En su lugar usar:
- División segura: `B4/(B4+(B4=0))` en vez de `IF(B4=0,0,B4/X)`
- Ratio con 0: `(B5-B4)/(B5+(B5=0))*(B5>0)` en vez de `IFERROR((B5-B4)/B5,0)`
- Fechas: `YEAR(B2:B5000)` y `MONTH(B2:B5000)` directo — las fechas en Transactions son Date nativos
- Para fórmulas que SÍ necesitan IF/IFERROR: usar `setFormulaR1C1()` (ignora locale)

### Fórmula mes actual correcta:
```
=SUMPRODUCT((D2:D5000="egreso")*(YEAR(B2:B5000)=YEAR(TODAY()))*(MONTH(B2:B5000)=MONTH(TODAY()))*F2:F5000)
```

## Remitente Bancolombia
- `alertasynotificaciones@an.notificacionesbancolombia.com`
- Query Gmail: `from:(@notificacionesbancolombia.com OR @bancolombia.com.co)`

## Cuentas del usuario
- Tarjeta crédito: `*8352`
- Cuenta ahorros: `*8191`

## BACKLOG PRIORIZADO

1. ✅ Bancos/senders configurables desde Configurations
2. ✅ Recordatorios Pending Payments → Telegram
3. ✅ Soporte Nequi + entrada manual por Telegram (texto libre)
4. ✅ Dashboard BI: filtro por periodo + consolidado histórico mensual
5. Limpiar credenciales de Config.gs y hacer repo público
6. Bitácora de configuración — log de cambios en la hoja Configurations (quién cambió qué y cuándo)
7. Setup simplificado para usuarios no técnicos — wizard de configuración en pocos clics (meta: cualquier persona puede instalarlo en su Gmail sin saber código)
8. Configurar Remote Control de Claude Code para celular (iPhone)
9. Asesor Financiero AI: análisis de flujo de caja + recomendaciones inversión/ahorro → Telegram + hoja Financial Insights
10. Cargar data histórica desde 2024/01/01 (función ya existe: cargarHistoricoEmails)

## Usuario
Ingeniera de sistemas, Manizales Colombia, Bancolombia (TC *8352, Aho *8191), iPhone 11, meta: $0 costo.

# FinanceBot AI

Bot personal de finanzas para Telegram + Google Sheets + Google Apps Script.
Procesa movimientos bancarios Bancolombia via email y extracto, clasifica con Gemini y genera reportes personalizados.

---

## Backlog

### Completado

- [x] #1  Importar extracto Bancolombia (.xlsx/.zip)
- [x] #2  Clasificacion automatica con Gemini
- [x] #3  Alertas Telegram por gasto alto
- [x] #4  Registro manual de gastos/ingresos
- [x] #5  Recordatorio de pagos pendientes
- [x] #6  Reporte financiero mensual con IA
- [x] #7  Dashboard en Google Sheets
- [x] #8  Suscripciones fantasma (/suscripciones)
- [x] #9  Metas de ahorro v2 (/metas, /meta estado)
- [x] #10 Recordatorio mensual metas + viabilidad
- [x] #11 Alertas presupuesto en tiempo real
- [x] #12 Reporte semanal automatico
- [x] #13 /presupuesto - estado por categoria
- [x] #14 Feature flags (/config /activar /desactivar)
- [x] #15 Chat conversacional financiero

### Pendiente

- [ ] #19 Manual de instalacion
- [ ] #20 Limpieza de codigo (funciones debug)
- [ ] #21 Guia de uso del bot para el usuario
- [ ] #6  Carga historico desde Gmail automatico (ultimo, ID legado del backlog)
- [ ] #23 Mejorar filtro suscripciones (esperar 6-12 meses de datos)

---

## Stack

- **Runtime**: Google Apps Script
- **Sheets**: Google Sheets (Transactions, Config, Budgets)
- **IA**: Gemini 2.5 Flash-Lite
- **Notificaciones**: Telegram Bot API
- **Email**: Gmail API (etiqueta Bancolombia)
- **Deploy local**: clasp + gas-run.js (Execution API)

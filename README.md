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
- [x] #13 /presupuesto — estado por categoria
- [x] #14 Feature flags (/config, /activar, /desactivar)
- [x] #15 Chat conversacional financiero

### Pendiente — Producto

- [ ] #19 Manual de instalacion (no tecnico, checklist)
- [ ] #21 Guia de uso del bot (usuario final, comandos + ejemplos)
- [ ] #16 Carga historica Gmail automatica (ultimo, mas complejo)
- [ ] #23 Mejorar filtro suscripciones (cuando haya 6-12 meses de data)

### Pendiente — Limpieza (#20)

- [x] Header norm: _calcularFlujoCaja_() case-insensitive
- [x] Sort optimization: ordenarTransaccionesSheet_() + skip extracto/historico
- [x] Centralized AI skill: construirSkillFinancieroObjetivo_() en FinancialSkill.gs
- [x] Markdown fallback en enviarMensajeTelegram_()
- [x] Gemini texto helper: _llamarGeminiTexto_() para Chat + Advisor + WeeklyReport
- [x] Funciones probar* comentadas (5 funciones en 4 archivos)
- [x] Dashboard rangos dinamicos (D2:D en vez de D2:D5000)
- [ ] Gemini JSON helper: _llamarGeminiJson_() para Extractor + Telegram + FinanceBot (retry/backoff unificado)
- [ ] Estandarizar manejo de errores y logs (formato unico por modulo)
- [ ] Normalizar nombres/acentos de headers y constantes en todo el repo
- [ ] Hardening Markdown: estandarizar fallback en todos los mensajes formateados
- [ ] Checklist de operacion y soporte (que ejecutar cuando falla X)
- [ ] Depurar run_probarAsesor (apunta a funcion comentada)

---

## Stack

- **Runtime**: Google Apps Script
- **Sheets**: Google Sheets (Transactions, Configurations, Dashboard, Goals, Pending Payments)
- **IA**: Gemini 2.5 Flash-Lite
- **Notificaciones**: Telegram Bot API
- **Email**: Gmail API (etiqueta Bancolombia)
- **Deploy local**: clasp + gas-run.js (Execution API)

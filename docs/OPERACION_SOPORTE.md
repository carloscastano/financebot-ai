# FinanceBot AI - Checklist de Operacion y Soporte

Documento operativo para mantener el bot estable en produccion (Apps Script + Google Sheets + Telegram + Gemini).

## 1) Checklist diario (5-10 min)

1. Verificar que el bot responda en Telegram con `/ayuda` o `/config`.
2. Revisar ejecuciones recientes en Apps Script:
   - `procesarMensajesTelegram`
   - `procesarEmailsBancolombia`
   - `recordarPagosPendientes`
3. Confirmar que no haya picos en hoja `Errors`.
4. Validar que entren nuevas filas en `Transactions` (email o registro manual).
5. Si hay errores de red/Gemini, confirmar reintento en la siguiente corrida.

## 2) Checklist semanal (15 min)

1. Verificar entrega de `reporteSemanal` (lunes).
2. Revisar categorias "Otro" inusualmente altas en `Transactions`.
3. Revisar presupuesto por categoria con `/presupuesto`.
4. Confirmar que `recordatorio_pagos` este activo si el usuario lo usa.
5. Revisar crecimiento de filas en `Transactions` y salud general del Dashboard.

## 3) Checklist mensual (20-30 min)

1. Confirmar envio de `analizarFinanzas` (reporte mensual).
2. Confirmar envio de `recordarMetasSinAbono` (dia 1).
3. Revisar hoja `Configurations`:
   - Presupuesto mensual
   - Presupuestos por categoria (columna C)
   - Umbrales de alerta
4. Ejecutar una importacion de extracto de prueba si hubo cambios recientes.
5. Revisar si hace falta archivado historico (si `Transactions` crece mucho).

## 4) Matriz rapida de sintomas

1. Bot no responde Telegram:
   - Revisar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`.
   - Revisar trigger `procesarMensajesTelegram` (cada 1 min).
2. No se procesan emails:
   - Revisar trigger `procesarEmailsBancolombia`.
   - Validar query de bancos/senders en `Configurations`.
   - Revisar label `FinanceBot-Procesado` en Gmail.
3. Fallo al importar extracto:
   - Confirmar archivo `.zip` o `.xlsx` valido.
   - Revisar logs de `EXTRACTOR` y respuesta de Gemini.
4. Alertas o reportes no llegan:
   - Verificar feature flags (`/config`).
   - Verificar triggers de funciones `run_*`.
5. Dashboard inconsistente:
   - Ejecutar `run_configurarDashboard`.
   - Verificar estructura de headers en `Transactions`.

## 5) Playbook de incidentes

### Incidente A - Gemini rate limit o error temporal

1. Confirmar error en logs (`429`, `503`, `unavailable`).
2. Esperar siguiente corrida automatica (ya existe reintento/backoff).
3. Si persiste por varias corridas, bajar temporalmente carga:
   - Reducir lotes en historico/importaciones.
4. Registrar hora de inicio y fin del incidente.

### Incidente B - Mensajes Markdown fallan en Telegram

1. Verificar logs `TELEGRAM` con fallback sin Markdown.
2. Revisar ultimo mensaje con datos dinamicos del usuario/comercio.
3. Confirmar uso de `mdEscape_` en el flujo afectado.

### Incidente C - Errores repetidos en una misma funcion

1. Tomar muestra de 3-5 errores consecutivos.
2. Identificar modulo (`EMAIL_PIPELINE`, `EXTRACTOR`, `WEEKLY`, etc).
3. Aplicar fix puntual y probar con `run_*` manual.
4. Monitorear 24h.

## 6) Cambios seguros en produccion

1. Cambiar una cosa a la vez.
2. Probar manualmente con wrapper `run_*` antes de dejar trigger activo.
3. Si se tocan mensajes Telegram, validar un caso real de:
   - registro manual
   - comando (`/metas` o `/presupuesto`)
   - alerta automatica
4. Documentar en README que se cambio y por que.

## 7) Datos minimos para soporte rapido

Cuando algo falle, guardar:

1. Funcion que fallo.
2. Timestamp de Bogota.
3. Mensaje de error exacto.
4. Input usado (email, comando o extracto).
5. Impacto (que no se registro/envio).

Con eso se puede reproducir y corregir mucho mas rapido.

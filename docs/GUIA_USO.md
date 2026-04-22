# FinanceBot — Guía de Uso

Tu asistente financiero personal en Telegram. Procesa gastos, responde preguntas sobre tus finanzas y te manda reportes automáticos.

---

## Registrar gastos e ingresos

Escríbele al bot en lenguaje natural, como si le mandaras un mensaje a un amigo:

**Egresos:**
```
gasté 15000 en la frutería
almuerzo 12000
pagué 94900 en Smart Fit
taxi 8000
compré mercado 180000
```

**Ingresos:**
```
ingresé 200000 de Juan Nequi
me pagaron el arriendo 1500000
recibí salario 3200000
```

El bot responde con la transacción confirmada, la categoría asignada y un consejo breve. Si la categoría no queda bien, puedes re-registrar con más contexto.

---

## Chat financiero

Hazle preguntas sobre tus finanzas reales. Usa el signo `?` o empieza con pregunta:

```
¿cuánto llevo gastado este mes?
¿en qué estoy gastando más?
¿cómo voy con el presupuesto de alimentación?
¿tengo para ahorrar este mes?
¿cuál es mi categoría más cara?
¿qué porcentaje de mis ingresos estoy gastando?
```

Responde con datos reales de tu hoja. No inventa cifras.

---

## Metas de ahorro

### Ver todas las metas
```
/metas
```
Muestra progreso, monto ahorrado, faltante y fecha límite de cada meta activa.

### Alertas rápidas
```
/meta estado
```
Resalta metas sin abono este mes y las que están cerca de su fecha límite.

### Crear una meta
```
/meta nueva Carro 50000000 2026-12-31
/meta nueva Viaje Europa 8000000
/meta nueva Fondo emergencia 6000000 2025-06-30
```
Formato: `/meta nueva <nombre> <monto objetivo> [fecha límite YYYY-MM-DD]`
La fecha es opcional.

### Registrar un abono
```
/meta abonar Carro 500000
/meta abonar Viaje Europa 200000
```
Formato: `/meta abonar <nombre> <monto>`
El abono queda registrado como transacción en la hoja con categoría *Financiero / Ahorro*.

### Marcar como completada
```
/meta completar Carro
```

---

## Presupuesto por categoría

```
/presupuesto
```
Muestra el gasto del mes vs el presupuesto configurado para cada categoría, con barra de progreso y porcentaje.

**Para configurar presupuestos:** abre la hoja *Configurations* en Google Sheets y agrega el monto en la columna C de cada categoría. Ejemplo:

| Categoría | (col B) | Presupuesto mensual (col C) |
|-----------|---------|----------------------------|
| Alimentación | | 400000 |
| Transporte | | 300000 |
| Entretenimiento | | 200000 |

El bot te avisa automáticamente cuando llegas al 80% y al 100% de cualquier categoría con presupuesto configurado.

---

## Suscripciones fantasma

```
/suscripciones
```
Detecta cobros recurrentes de los últimos 90 días (mensual, quincenal, semanal) y calcula el costo mensual estimado total.

Incluye alerta `⚠️` para suscripciones que no han cobrado en más de 1.5 períodos — útil para detectar servicios que dejaste de usar pero siguen activos.

Mejora con más historial: con 6+ meses de datos los resultados son más precisos.

---

## Importar extracto Bancolombia

Descarga el extracto desde la app del banco (formato `.zip` o `.xlsx`) y envíalo directamente al chat del bot.

El bot:
1. Parsea las transacciones del archivo
2. Las clasifica con Gemini (categoría, tipo, necesidad)
3. Deduplica contra lo que ya está en la hoja
4. Confirma cuántas fueron importadas y cuántas eran duplicadas

---

## Pagos pendientes

Cuando el bot te manda el recordatorio de pagos, cada pago tiene un ID. Para marcarlo como pagado:

```
ID 1 pagada
ID 3 pagada
```

El bot registra la fecha de pago y no vuelve a recordarte ese pago en el mes actual.

---

## Funcionalidades automáticas

Estas llegan solas, sin que hagas nada:

| Cuándo | Qué llega |
|--------|-----------|
| Cada lunes ~7am | Reporte semanal: gasto vs semana anterior, top categorías, consejo Gemini |
| Día 1 de cada mes | Análisis mensual con score financiero, proyección y recomendación |
| Día 1 de cada mes | Recordatorio de metas sin abono del mes anterior |
| Día 25 de cada mes | Revisión consolidada de presupuestos (solo categorías al 70%+) |
| Días antes del vencimiento | Recordatorio de pagos pendientes configurados |
| Al registrar un gasto | Alerta si ese gasto lleva la categoría al 80% o 100% del presupuesto |
| Al procesar un email Bancolombia | Alerta si el monto supera el umbral configurado |

---

## Activar y desactivar funcionalidades

### Ver estado actual
```
/config
```

### Desactivar
```
/desactivar Reporte Semanal
/desactivar Alerta Presupuesto
/desactivar Chat Financiero
```

### Activar
```
/activar Reporte Semanal
/activar Alerta Gasto Alto
```

**Funcionalidades disponibles:**
- `Reporte Semanal` — pulso financiero cada lunes
- `Reporte Mensual` — análisis con score y proyección
- `Alerta Presupuesto` — aviso en tiempo real al 80% / 100%
- `Revisión día 25` — consolidado de presupuestos a fin de mes
- `Recordatorio Pagos` — facturas y pagos próximos
- `Recordatorio Metas` — revisión mensual de metas
- `Alerta Gasto Alto` — aviso cuando un gasto supera el umbral
- `Chat Financiero` — responde preguntas sobre tus finanzas

---

## Si algo no funciona

| Síntoma | Qué revisar |
|---------|-------------|
| El bot no responde | Verifica que el trigger `procesarMensajesTelegram` esté activo (cada 1 minuto) |
| No llegan reportes automáticos | Verifica los triggers: `run_reporteSemanal` (lunes), `run_analizarFinanzas` (mensual), `run_recordarPagosPendientes` (diario) |
| Categoría incorrecta | Re-registra el gasto con más contexto. Ejemplo: "gasté 50000 en D1 supermercado" |
| Presupuesto no aparece | Verifica que esté configurado en col C de la hoja Configurations |
| Error al importar extracto | El archivo debe ser el extracto oficial Bancolombia (.zip o .xlsx). PDFs no son compatibles |
| Chat responde "no disponible" | Gemini puede estar con alta demanda. Intenta de nuevo en 1-2 minutos |
| Gasto duplicado | Si el mismo movimiento viene del extracto Y fue registrado manualmente, elimina la entrada manual de la hoja |

# FinanceBot AI — Guía de Instalación

> Tiempo estimado: **15 minutos**. Sin terminal. Sin código. Sin instalaciones.

---

## En resumen, solo necesitas hacer 4 cosas

1. Crear tu clave de IA en Google (gratis)
2. Crear tu bot de Telegram (gratis)
3. Copiar la hoja de FinanceBot a tu Drive
4. Ejecutar el asistente de configuración

---

## Antes de empezar

Asegúrate de tener:

- Tu cuenta de **Gmail** — la misma que recibe los correos de notificación de tu banco
- **Telegram** instalado en tu celular o computador
- 15 minutos sin interrupciones

---

## Privacidad y seguridad

Tus datos financieros viven únicamente en **tu** Google Sheets personal. Nadie más tiene acceso.

- Las claves que configures quedan guardadas en tu propia cuenta de Google — ni el creador del template ni ningún tercero puede verlas.
- El bot solo lee los correos de notificación de tu banco. No accede a otros correos.
- Puedes eliminar el bot en cualquier momento borrando tu copia de la hoja.

---

## Paso 1 — Crear tu clave de IA de Google (Gemini)

La clave de IA (API Key) es la "llave" que le permite al bot entender y clasificar tus gastos automáticamente. Es gratuita.

1. Entra a **[aistudio.google.com](https://aistudio.google.com)** con tu cuenta de Google
2. Clic en **"Get API Key"** (arriba a la izquierda)
3. Clic en **"Create API key"** → **"Create API key in new project"**
4. Copia la clave que aparece — se ve así: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX`

Guárdala en un lugar temporal (bloc de notas). La necesitas en el Paso 4.

> El plan gratuito incluye 1.500 consultas al día — más que suficiente para uso personal.

---

## Paso 2 — Crear tu bot de Telegram

El bot es tu asistente personal en Telegram. Telegram te da una "contraseña técnica" (token) para conectarlo con tu hoja.

1. Abre **Telegram** y busca el usuario **@BotFather**
2. Escribe `/newbot` y envía
3. BotFather te pregunta el **nombre** del bot: escribe algo como `Mi FinanceBot`
4. BotFather te pregunta el **usuario** del bot (debe terminar en `bot`): escribe algo como `mifinancebot_bot`
5. BotFather te responde con una contraseña técnica (token) que se ve así:

   ```text
   7234567890:AAF-XXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

6. Copia ese token — lo necesitas en el Paso 4

> Si el nombre de usuario ya existe en Telegram, prueba con otro. Por ejemplo: `financebot_tunombre_bot`.

---

## Paso 3 — Copiar la hoja de FinanceBot

> 👉 **[Abrir template de FinanceBot AI](https://docs.google.com/spreadsheets/d/11wCqYnWxWEjnZGyLg2nB2nOJhRBleI_Xl_vUqCflPXw/copy)**

1. Abre el link de arriba
2. Google muestra la ventana **"Crear una copia"**
3. Ponle un nombre: `FinanceBot AI — Tu Nombre`
4. Elige dónde guardarla en tu Drive
5. Clic en **"Hacer una copia"**

Se abre tu hoja personal. Verás varias pestañas abajo (`Transactions`, `Configurations`, etc.) y en el menú superior aparece **🤖 FinanceBot**.

---

## Paso 4 — Configurar el bot

### 4.1 — Abrir el asistente

1. Clic en el menú **🤖 FinanceBot** en la barra superior
2. Clic en **"🚀 Paso 1 — Crear formulario de configuración"**

### 4.2 — Permisos de Google (solo la primera vez)

Google te pedirá permisos para que el script funcione. Esto es normal y necesario:

- Aparece *"Este script necesita permisos"* → clic en **"Revisar permisos"**
- Selecciona tu cuenta de Google
- Si aparece **"Google no verificó esta app"** → clic en **"Opciones avanzadas"** → **"Ir a FinanceBot AI (no seguro)"** → **"Permitir"**

> **¿Por qué aparece esa advertencia?** Google muestra este mensaje cuando un script no ha pasado su proceso de verificación comercial — lo mismo que pasa con cualquier herramienta personal o de código abierto. No significa que sea inseguro. El código es visible y puedes revisarlo en cualquier momento desde el menú Extensiones → Apps Script.

Después de aceptar, se crea una pestaña **🔧 Setup**.

### 4.3 — Llenar tus datos

En la pestaña **🔧 Setup** encontrarás una tabla. Llena las celdas amarillas:

| Campo | Qué escribir |
| ----- | ------------ |
| `GEMINI_API_KEY` | La clave que copiaste en el Paso 1 |
| `SPREADSHEET_ID` | Ya aparece llenado automáticamente — no tocar ✅ |
| `TELEGRAM_BOT_TOKEN` | El token que copiaste en el Paso 2 |
| `TELEGRAM_CHAT_ID` | Lo detectamos en el siguiente punto |

### 4.4 — Detectar tu Chat ID de Telegram

El Chat ID es el identificador interno de tu cuenta en Telegram. El bot lo necesita para saber a quién enviarle mensajes.

1. Abre Telegram y busca el bot que acabas de crear (por el nombre de usuario que elegiste)
2. Envíale cualquier mensaje — por ejemplo: `hola`
3. Vuelve a tu hoja de Google Sheets
4. Menú **🤖 FinanceBot → "🔑 Paso 1b — Detectar mi Chat ID de Telegram"**
5. Aparece un popup: **✅ Chat ID detectado y guardado: 123456789**

El Chat ID queda guardado automáticamente. No necesitas copiarlo.

### 4.5 — Activar todo

1. Menú **🤖 FinanceBot → "✅ Paso 2 — Aplicar configuración"**

Esto puede tardar 15–30 segundos. Durante ese tiempo el sistema:

- Guarda tus claves de forma segura (quedan ocultas, solo tú puedes accederlas)
- Crea todas las pestañas necesarias (`Dashboard`, `Goals`, `Pending Payments`, etc.)
- Activa las automatizaciones:
  - Revisa correos del banco cada 5 minutos
  - Lee mensajes de Telegram cada 1 minuto
  - Recordatorio de pagos pendientes a las 9am
  - Reporte semanal los lunes a las 7am
- Borra la pestaña Setup (para que tus claves no queden visibles)
- Envía un mensaje de bienvenida a tu Telegram

---

## Paso 5 — Verificar que funciona

Abre Telegram. Debería haber llegado este mensaje de tu bot:

```text
🎉 FinanceBot AI activado

Hola! Tu bot está configurado y listo.
Escribe /ayuda para ver todos los comandos disponibles.
```

**Si llegó: instalación completa.** Escribe `/ayuda` para explorar todos los comandos.

### Primer test recomendado

Prueba enviando estos mensajes a tu bot uno por uno:

```text
gasté 15000 en almuerzo
```

```text
/presupuesto
```

```text
/metas
```

Si el bot responde correctamente a los tres, todo está funcionando bien.

---

## (Opcional) Ajustar tu banco y presupuestos

Si usas **Bancolombia**, no necesitas cambiar nada — el bot ya viene configurado para leer sus correos.

Si usas otro banco, abre la pestaña **Configurations** y ajusta:

| Campo | Qué poner |
| ----- | --------- |
| `Banco 1 sender` | El dominio del remitente del correo de tu banco (ej: `@davivienda.com`) |
| `Tarjeta crédito` | Últimos 4 dígitos de tu tarjeta (ej: `*8352`) |
| `Presupuesto mensual` | Tu límite de gasto mensual en pesos |
| `Meta ahorro` | Cuánto quieres ahorrar al mes |

---

## Solución de problemas

| Problema | Solución |
| -------- | -------- |
| No aparece el menú 🤖 FinanceBot | Cierra y vuelve a abrir la hoja |
| El popup de permisos no avanza | Asegúrate de seleccionar la misma cuenta de Gmail que recibe correos del banco |
| No llegó el mensaje de bienvenida | Verifica que enviaste un mensaje al bot (Paso 4.4) antes de aplicar la configuración. Luego re-ejecuta el Paso 4.5 |
| Chat ID dice "Sin mensajes detectados" | Envíale un mensaje a tu bot en Telegram y vuelve a ejecutar el Paso 4.4 |
| El bot no responde a mis mensajes | Menú FinanceBot → "Estado de triggers". Verifica que exista uno llamado `procesarMensajesTelegram` |
| Error "Gemini quota exceeded" | La cuota gratuita se agotó por hoy. Se recupera automáticamente al día siguiente |
| No detecta correos del banco | Abre Configurations y verifica que `Banco 1 sender` coincida con el remitente real de los correos de tu banco |

---

---

## Para el administrador — Preparar el template para compartir

> Esta sección es solo para quien administra el template. Los usuarios finales no necesitan leerla.

### A. Crear la copia limpia

1. Abre tu Google Sheets del FinanceBot
2. Menú **Archivo → Hacer una copia**
3. Nombre: `FinanceBot AI — Template`
4. Casilla "Copiar comentarios" → NO
5. Clic en **Hacer una copia**

En la copia que se abre, limpia los datos personales:

- **Transactions**: elimina todas las filas de datos. Deja solo los encabezados.
- **Goals**: elimina todas las metas.
- **Pending Payments**: elimina todos los pagos.
- **Configurations**: borra los valores de `Tarjeta crédito` y `Tarjeta debito`. Deja los demás — son genéricos y sirven para cualquier usuario de Bancolombia.
- **Errors / Financial Insights / Dashboard**: borra el contenido si tiene datos.

### B. Obtener el link de instalación

En la barra de dirección del navegador verás:

```text
https://docs.google.com/spreadsheets/d/XXXXXXXXXX/edit
```

Cambia `/edit` por `/copy`:

```text
https://docs.google.com/spreadsheets/d/XXXXXXXXXX/copy
```

Ese es el link que compartes. Cuando alguien lo abre, Google les pide hacer una copia — no ven tus datos ni tus claves.

### C. Configurar permisos de la hoja original

1. Clic en **Compartir** (botón azul arriba a la derecha)
2. "Acceso general" → **"Cualquier persona con el link"**
3. Permiso: **"Lector"**
4. Comparte el link `/copy` — no el `/edit`

# FinanceBot AI — Guía de Instalación

> Tiempo estimado: **15–20 minutos** para el usuario final.
> No se requiere conocimiento técnico ni terminal.

---

## PARTE 1 — Lo que hace Carlos (una sola vez, para preparar el template)

> Haces esto una vez. El resultado es un link que puedes compartir con quien quieras.

### Paso 1.1 — Crear la copia limpia (template)

1. Abre tu Google Sheets del FinanceBot
2. Menú superior: **Archivo → Hacer una copia**
3. Nombre: `FinanceBot AI — Template`
4. Marca la casilla **"Copiar comentarios"** → NO
5. Clic en **Hacer una copia**

Se abre la copia. Ahora limpia los datos personales:

### Paso 1.2 — Limpiar datos personales de la copia

En la copia que se acaba de abrir:

**Hoja `Transactions`:**
- Selecciona todas las filas de datos (desde fila 2 hacia abajo)
- Elimínalas. Deja solo la fila de encabezados.

**Hoja `Goals`:**
- Elimina todas las metas personales (deja los encabezados)

**Hoja `Pending Payments`:**
- Elimina todos los pagos (deja los encabezados)

**Hoja `Configurations`:**
- Fila `Tarjeta crédito`: borra el número de tu tarjeta, deja vacío o escribe `*0000`
- Fila `Tarjeta debito`: igual
- Fila `Meta ahorro`: cambia a `1000000` (valor ejemplo)
- Fila `Presupuesto mensual`: cambia a `5000000` (valor ejemplo)
- Los **bancos y categorías** puedes dejarlos — son genéricos y sirven para cualquier usuario Bancolombia

**Hojas `Errors`, `Logs`, `Financial Insights`, `Dashboard`:**
- Borra todo el contenido si tiene datos. Deja los encabezados.

### Paso 1.3 — Obtener el link de instalación directa

1. En la barra de dirección del navegador verás algo como:
   ```
   https://docs.google.com/spreadsheets/d/XXXXXXXXXX/edit
   ```
2. Cambia `/edit` por `/copy`:
   ```
   https://docs.google.com/spreadsheets/d/XXXXXXXXXX/copy
   ```
3. Copia esa URL — ese es el **link que compartes con tus amigos**

Cuando alguien abre ese link, Google les pregunta automáticamente si quieren hacer una copia. No ven tus datos ni tus claves.

### Paso 1.4 — Configurar permisos de la hoja

1. Clic en **Compartir** (botón azul arriba a la derecha)
2. En "Acceso general": cambia a **"Cualquier persona con el link"**
3. Permiso: **"Lector"** (no necesitan editar el original)
4. Clic en **Copiar link** y comparte ese link con tus amigos

> El link `/copy` hace que al abrirlo se copie directo. El link normal `/edit` solo lo muestra. Usa el `/copy`.

---

## PARTE 2 — Lo que hace el usuario X (instalación completa)

> Sigue estos pasos en orden. Cada uno toma pocos minutos.

---

### Paso 2.1 — Requisitos previos

Antes de empezar necesitas:

- [x] Una cuenta de **Gmail** activa (la que recibe notificaciones del banco)
- [x] **Telegram** instalado en tu celular
- [x] Una cuenta en **Google** (seguramente ya la tienes si usas Gmail)

---

### Paso 2.2 — Obtener tu API Key de Gemini (IA gratuita)

1. Entra a **[aistudio.google.com](https://aistudio.google.com)** con tu cuenta de Google
2. Clic en el botón **"Get API Key"** (arriba a la izquierda)
3. Clic en **"Create API key"**
4. Selecciona **"Create API key in new project"**
5. Copia la clave que aparece — se ve así: `AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXX`

> Guárdala en un lugar temporal (bloc de notas). La necesitas en el Paso 2.5.
> Es gratuita. El plan free incluye 1500 consultas/día — más que suficiente.

---

### Paso 2.3 — Crear tu bot de Telegram

1. Abre **Telegram** en tu celular o computador
2. Busca el usuario **@BotFather** y ábrelo
3. Escribe `/newbot` y envía
4. BotFather te pregunta el **nombre** del bot: escribe algo como `Mi FinanceBot`
5. BotFather te pregunta el **username** (debe terminar en `bot`): escribe algo como `mifinancebot_bot`
6. BotFather te responde con un **token** que se ve así:
   ```
   7234567890:AAF-XXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```
7. Copia ese token — lo necesitas en el Paso 2.5

> El username debe ser único en Telegram. Si dice "ya existe", prueba con otro nombre.

---

### Paso 2.4 — Copiar la hoja del FinanceBot

1. Abre el link que te pasó Carlos (termina en `/copy`)
2. Google te muestra una ventana: **"Crear una copia"**
3. Ponle un nombre a tu copia: `FinanceBot AI — Mi Nombre`
4. Elige dónde guardarla en tu Drive
5. Clic en **"Hacer una copia"**

Se abre tu copia personal. Verás varias hojas abajo (`Transactions`, `Configurations`, etc.) y en el menú superior aparece **🤖 FinanceBot** — ese es el menú de instalación.

---

### Paso 2.5 — Ejecutar el formulario de configuración

1. Clic en el menú **🤖 FinanceBot** en la barra superior
2. Clic en **"🚀 Paso 1 — Crear formulario de configuración"**

**Primera vez: Google te pedirá permisos** — esto es normal y necesario:
- Aparece una ventana: *"Este script necesita permisos"*
- Clic en **"Revisar permisos"**
- Selecciona tu cuenta de Google
- Puede aparecer **"Google no verificó esta app"** — clic en **"Opciones avanzadas"**
- Clic en **"Ir a FinanceBot AI (no seguro)"**
- Clic en **"Permitir"**

> Esta advertencia aparece porque el script no está verificado por Google (solo los apps comerciales lo están). Es normal en proyectos personales. Solo tú y Carlos tienen acceso al código.

Después de aceptar, se crea una hoja llamada **🔧 Setup** con una tabla de configuración.

---

### Paso 2.6 — Llenar los datos en la hoja Setup

La hoja Setup tiene una tabla con 4 filas. Solo necesitas llenar **2 celdas** (en amarillo):

| Parámetro | Qué escribir |
|-----------|-------------|
| `GEMINI_API_KEY` | La clave que copiaste en el Paso 2.2 |
| `SPREADSHEET_ID` | **No tocar** — ya aparece llenado automáticamente ✅ |
| `TELEGRAM_BOT_TOKEN` | El token que copiaste en el Paso 2.3 |
| `TELEGRAM_CHAT_ID` | Lo detectamos automáticamente en el siguiente paso |

**Para el Chat ID de Telegram** (tu número de usuario):
1. Abre Telegram y busca el bot que acabas de crear (por el username que elegiste)
2. Envíale cualquier mensaje, por ejemplo: `hola`
3. Vuelve a la hoja de Google Sheets
4. Menú **Extensiones → Apps Script** → se abre el editor de código
5. En la barra superior del editor, donde dice "Seleccionar función", busca **`detectarMiChatId`**
6. Clic en **▶ Ejecutar**
7. En el registro de ejecución (abajo) verás: `✅ Chat ID detectado: 123456789`
8. Cierra el editor — el Chat ID ya quedó guardado automáticamente

---

### Paso 2.7 — Aplicar la configuración

1. Vuelve a la hoja de Google Sheets
2. Menú **🤖 FinanceBot → "✅ Paso 2 — Aplicar configuración"**

El sistema automáticamente:
- Guarda tus claves de forma segura (invisibles, en Script Properties)
- Crea todas las hojas necesarias (`Transactions`, `Dashboard`, `Goals`, etc.)
- Configura los 5 activadores automáticos:
  - Revisión de emails del banco cada 5 minutos
  - Lectura de mensajes Telegram cada 1 minuto
  - Recordatorio de pagos diario a las 9am
  - Reporte semanal los lunes a las 7am
  - Revisión de presupuesto mensual
- Elimina la hoja Setup (para que tus claves no queden visibles)
- **Envía un mensaje de bienvenida a tu Telegram** ✅

---

### Paso 2.8 — Verificar que funciona

Abre Telegram y busca tu bot. Debería haber llegado:

```
🎉 FinanceBot AI activado

Hola! Tu bot está configurado y listo.
Escribe /ayuda para ver todos los comandos disponibles.
```

Si llegó el mensaje: **¡listo, el bot está funcionando!** 🎉

Escribe `/ayuda` para ver todos los comandos.

---

### Paso 2.9 — Configurar tu banco en la hoja Configurations

Abre la hoja **Configurations** y ajusta estos valores a los tuyos:

| Parámetro | Qué poner |
|-----------|-----------|
| `Banco` | Nombre de tu banco (ej: `Bancolombia`) |
| `Banco 1 sender` | Dominio del email del banco (ej: `@notificacionesbancolombia.com`) |
| `Tarjeta crédito` | Últimos 4 dígitos de tu tarjeta (ej: `*8352`) |
| `Meta ahorro` | Cuánto quieres ahorrar al mes en COP |
| `Presupuesto mensual` | Tu límite de gasto mensual en COP |
| Categorías | Ajusta los nombres y presupuestos por categoría |

> Para Bancolombia los dominios ya están configurados por defecto. Solo verifica que sean correctos.

---

## Solución de problemas comunes

| Problema | Solución |
|----------|---------|
| No aparece el menú 🤖 FinanceBot | Cierra y vuelve a abrir la hoja. Si sigue sin aparecer, Extensiones → Apps Script → Ejecutar `onOpen` |
| "Este script necesita permisos" | Normal. Sigue las instrucciones del Paso 2.5 |
| No llegó el mensaje de bienvenida | Verifica que le enviaste un mensaje al bot antes de detectarMiChatId. Luego re-ejecuta el Paso 2.7 |
| Chat ID dice "No se encontraron mensajes" | Envíale un mensaje a tu bot en Telegram y vuelve a ejecutar `detectarMiChatId` |
| El bot no responde a mis mensajes | Menú FinanceBot → Estado de triggers. Debe haber un trigger de `procesarMensajesTelegram`. Si no hay, ejecuta Paso 2.7 de nuevo |
| Error "Gemini quota exceeded" | Espera hasta el día siguiente. La cuota gratuita es diaria |
| No detecta emails del banco | Verifica en Configurations que el dominio del sender coincide con el remitente real de los emails de tu banco |

---

## Resumen: lo que necesita el usuario X

```
✅ Gmail activo (el que recibe emails del banco)
✅ Telegram instalado
✅ API key de Gemini → aistudio.google.com (gratis)
✅ Token del bot → @BotFather en Telegram (gratis)
✅ 15 minutos
```

**Sin terminal. Sin código. Sin instalaciones.**

// ============================================================
// FINANCEBOT AI - LÓGICA PRINCIPAL
// Orquesta: Gmail → Gemini → Google Sheets → Telegram
// ============================================================

// ------------------------------------------------------------
// WRAPPERS PARA clasp run
// clasp run solo detecta funciones del archivo principal.
// Estas funciones delegan a los otros archivos.
// Uso: clasp run <nombreFuncion>
// ------------------------------------------------------------
function run_agregarConfigCategorias()  { agregarConfigCategorias(); }
function run_sincronizarCategorias()    { sincronizarCategorias(); }
function run_normalizarCategorias()     { normalizarCategorias(); }
function run_configurarDashboard()      { reconstruirDashboard(); }
function run_analizarFinanzas()         { analizarFinanzas(); }
function run_recordarPagosPendientes()  { recordarPagosPendientes(); }
function run_procesarEmails()           { procesarEmailsBancolombia(); }
function run_cargarHistorico()          { cargarHistoricoEmails(); }
function run_probarAsesor()             { probarAsesorFinanciero(); }
function run_resetearTelegram()         { resetearOffsetTelegram(); }
function run_procesarMensajes()         { procesarMensajesTelegram(); }

// ------------------------------------------------------------
// FUNCIÓN PRINCIPAL
// Esta es la que se ejecuta automáticamente cada 5 minutos
// También puedes correrla manualmente desde Apps Script
// ------------------------------------------------------------
function procesarEmailsBancolombia() {
  const label = obtenerOCrearLabel_(CONFIG.GMAIL_LABEL);
  const cfg = leerConfiguracion_();

  // Buscar emails no leídos de los bancos configurados en Configurations
  const query = `${cfg.gmailQuery} is:unread -label:${CONFIG.GMAIL_LABEL}`;
  const threads = GmailApp.search(query, 0, CONFIG.MAX_EMAILS_POR_EJECUCION);

  if (threads.length === 0) {
    Logger.log('No hay emails nuevos de Bancolombia.');
    return;
  }

  Logger.log(`Encontrados ${threads.length} hilo(s) de Bancolombia.`);

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetTxn = ss.getSheetByName('Transactions');
  const sheetErr = ss.getSheetByName('Errors');

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      if (!message.isUnread()) continue;

      const asunto    = message.getSubject();
      const fechaEmail = message.getDate();
      const emailId   = message.getId();

      try {
        // Paso 1: Limpiar y extraer texto del email
        const textoLimpio = extraerTextoEmail_(message);
        Logger.log(`Procesando: ${asunto}`);

        // Paso 2: Verificar que sea transaccional (filtro rápido)
        if (!esEmailTransaccional_(textoLimpio)) {
          Logger.log('Email no transaccional, se omite.');
          message.markRead();
          continue;
        }

        // Paso 3: Llamar a Gemini para clasificar
        const transaccion = llamarGemini_(textoLimpio);
        transaccion.email_asunto = asunto;
        transaccion.email_id     = emailId;
        transaccion.fuente       = 'email';
        transaccion.banco        = detectarBanco_(message.getFrom(), cfg);

        // Paso 4: Guardar en Google Sheets
        escribirTransaccion_(sheetTxn, transaccion);
        Logger.log(`✅ Guardado: ${transaccion.comercio} - $${transaccion.monto} COP`);

        // Paso 5: Alerta Telegram si monto supera umbral (leído desde hoja Configuración)
        if (
          transaccion.monto > cfg.umbralAlerta &&
          transaccion.tipo === 'egreso' &&
          CONFIG.TELEGRAM_BOT_TOKEN
        ) {
          enviarTelegram_(transaccion);
        }

        // Marcar como procesado
        message.markRead();
        thread.addLabel(label);

      } catch (e) {
        Logger.log(`❌ Error procesando email ${emailId}: ${e.message}`);
        // Si es error temporal de servidor (503/502/red), NO marcar como leído
        // → el trigger lo reintentará automáticamente en la próxima ejecución
        const esErrorTemporal = e.message.includes('503') ||
                                e.message.includes('502') ||
                                e.message.includes('server error') ||
                                e.message.includes('unavailable');
        if (esErrorTemporal) {
          Logger.log(`⏳ Error temporal — email ${emailId} se reintentará en la próxima ejecución.`);
        } else {
          registrarError_(sheetErr, e.message, asunto, emailId);
          message.markRead();
        }
      }
    }
  }
}

// ------------------------------------------------------------
// EXTRAE TEXTO LIMPIO DEL EMAIL
// Prioriza texto plano, si no hay limpia el HTML
// ------------------------------------------------------------
function extraerTextoEmail_(message) {
  let texto = message.getPlainBody();

  if (!texto || texto.trim().length < 20) {
    texto = message.getBody()
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#\d+;/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return texto.substring(0, 2000);
}

// ------------------------------------------------------------
// FILTRA EMAILS TRANSACCIONALES
// Evita procesar emails de marketing o informativos
// ------------------------------------------------------------
function esEmailTransaccional_(texto) {
  const lower = texto.toLowerCase();
  const keywords = [
    'compraste', 'compra por', 'transferiste', 'transferencia',
    'recibiste', 'abono', 'retiro', 'cajero', 'pse',
    'factura', 'vence', 'pago exitoso', 'pagaste', 'cop',
    'enviaste', 'bre-b', 'nequi', 'enviaste plata',
    'pago tarjeta', 'tarjeta de crédito', 'pago tc',
  ];
  return keywords.some(k => lower.includes(k));
}

// ------------------------------------------------------------
// LLAMA A GEMINI API
// Retorna objeto JSON con la transacción clasificada
// ------------------------------------------------------------
function llamarGemini_(textoEmail) {
  const prompt = construirPrompt_(textoEmail);

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
      responseMimeType: 'application/json'
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const url = `${CONFIG.GEMINI_URL}?key=${CONFIG.GEMINI_API_KEY}`;
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    throw new Error(`Gemini respondió con código ${responseCode}: ${response.getContentText()}`);
  }

  const json = JSON.parse(response.getContentText());

  // Extraer el texto de la respuesta de Gemini
  let responseText = '';
  if (json.candidates && json.candidates[0]?.content?.parts) {
    responseText = json.candidates[0].content.parts
      .map(p => p.text || '')
      .join('');
  }

  // Limpiar backticks si Gemini los incluye
  responseText = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const transaccion = JSON.parse(responseText);

  // Validar campos mínimos requeridos
  if (!transaccion.fecha || !transaccion.tipo || !transaccion.categoria) {
    throw new Error('Respuesta de Gemini incompleta: faltan campos obligatorios');
  }

  return transaccion;
}

// ------------------------------------------------------------
// CONSTRUYE EL PROMPT PARA GEMINI
// Sistema calibrado para patrones de Bancolombia Colombia
// ------------------------------------------------------------
function construirPrompt_(textoEmail) {
  const cfg = leerConfiguracion_();
  const listaCats = cfg.categorias.join(', ');
  return `Eres un analista financiero personal experto en notificaciones de Bancolombia (Colombia).

Tu trabajo: parsear el mensaje bancario y devolver SOLO un JSON válido (sin markdown, sin explicaciones).

REGLAS:
- Montos en COP (pesos colombianos), solo número entero sin decimales
- Fechas en formato YYYY-MM-DD
- Si no puedes extraer un campo, usa null

ADVERTENCIA CRÍTICA SOBRE "tipo":
- Los emails de Bancolombia tienen encabezados visuales como "Notificación Informativa" que son DECORATIVOS — NO los uses para clasificar tipo.
- Clasifica tipo SOLO según el contenido real de la transacción (si hay un monto y un movimiento de dinero).
- "Bancolombia informa pago..." = egreso (dinero que salió de tu cuenta)
- "Bancolombia informa pago Factura Programada..." = egreso, tipo_transaccion = pago_servicio
- Solo usa "informativo" si el mensaje NO implica ningún movimiento de dinero (ej: bloqueo de tarjeta, cambio de clave).

PATRONES BANCOLOMBIA:
• Compra TC: "Compraste COP[monto] en [COMERCIO] con tu T.Cred *[4dig], el [DD/MM/YYYY] a las [HH:MM]"
• Compra TD: "Compraste COP[monto] en [COMERCIO] con tu T.Deb *[4dig]..."
• Transferencia enviada: "Transferiste $[monto] desde tu cuenta [orig] a la cuenta *[dest] el [DD/MM/YYYY]"
• Ingreso: "Recibiste COP[monto] en tu cuenta..."
• Factura pendiente: "su factura inscrita [SERVICIO] con referencia [REF] se vence el [DD/MM/YYYY]" → tipo=informativo, tipo_transaccion=factura_pendiente
• Pago PSE: "pago exitoso de [SERVICIO] por COP[monto]" → tipo=egreso
• Pago factura programada: "Bancolombia informa pago Factura Programada [SERVICIO] Ref [REF] por $[monto] desde [cuenta]" → tipo=egreso, tipo_transaccion=pago_servicio
• Pago tarjeta de crédito: "Bancolombia informa pago Tarjeta de Crédito *[4dig] por $[monto]" o "pago de tu tarjeta de crédito" → tipo=egreso, tipo_transaccion=pago_tc, categoria=Financiero, subcategoria=Pago Tarjeta, comercio="Pago TC *[4dig]"
• Nequi envío Bre-B: "Enviaste de manera exitosa [monto] a la llave [número] de [NOMBRE] el [fecha] a la [hora]" → tipo=egreso, tipo_transaccion=transferencia_enviada, comercio=nombre del destinatario, referencia=número de llave, categoria=Transferencia
• Nequi ingreso: "Recibiste [monto] de [NOMBRE]" → tipo=ingreso, tipo_transaccion=transferencia_recibida, comercio=nombre del remitente, categoria=Transferencia

REGLAS PARA TRANSFERENCIAS:
- comercio = nombre del destinatario si aparece, o "Transferencia Nequi/Daviplata/Bancolombia" según el número destino
- referencia = número de cuenta destino (el que aparece después de "a la cuenta *")
- cuenta = número de cuenta origen (el que aparece después de "desde tu cuenta")

CATEGORÍAS — USA EXACTAMENTE UNA DE ESTAS (sin variantes ni sinónimos):
${listaCats}

Si el gasto no encaja claramente en ninguna → usa "Otro".
NUNCA inventes categorías fuera de esta lista.

SUBCATEGORÍAS:
- Alimentación: Supermercados, Restaurantes, Domicilios, Tiendas
- Transporte: Gasolina, Peajes, Apps, Público
- Vivienda: Arriendo, Servicios públicos, Mantenimiento
- Salud: EPS, Medicamentos, Gimnasio, Consultas
- Hogar: Ferretería, Muebles, Electrodomésticos

DICCIONARIO COMERCIOS COLOMBIANOS:
D1, ARA, ÉXITO, JUMBO, CARULLA → Alimentación/Supermercados
RAPPI, IFOOD, DOMICILIOS → Alimentación/Domicilios
SMART FIT, BODYTECH → Salud/Gimnasio
HOMECENTER, EASY → Hogar/Ferretería
TERPEL, PRIMAX, TEXACO → Transporte/Gasolina
NETFLIX, SPOTIFY, DISNEY, HBO → Entretenimiento/Streaming
CLARO, MOVISTAR, TIGO → Servicios/Telefonía
AGUAS, ENEL, EPM, CODENSA, GAS NATURAL, CENTRAL HIDROEL, CHEC, EEPP → Vivienda/Servicios públicos
AVÍCOLA, SURTIPOLLOS, MERCALDAS, SULTANA → Alimentación/Tiendas
Pago TC, Pago Tarjeta, Tarjeta de Crédito → Financiero/Pago Tarjeta

Responde SOLO este JSON (sin nada más):
{
  "fecha": "YYYY-MM-DD",
  "hora": "HH:MM",
  "tipo": "ingreso|egreso|informativo",
  "tipo_transaccion": "compra_tc|compra_td|transferencia_enviada|transferencia_recibida|pago_pse|pago_servicio|factura_pendiente|retiro_cajero|ingreso_nomina|otro",
  "monto": 94900,
  "moneda": "COP",
  "comercio": "Nombre del comercio o servicio",
  "cuenta": "últimos 4 dígitos",
  "categoria": "Categoría",
  "subcategoria": "Subcategoría",
  "necesidad": "necesario|prescindible|lujo|n/a",
  "sugerencia": "Consejo breve de ahorro en español",
  "referencia": null,
  "confianza": 0.95
}

--- MENSAJE A PARSEAR ---
${textoEmail}`;
}

// ------------------------------------------------------------
// DETECTA EL BANCO DESDE EL REMITENTE DEL EMAIL
// Compara el from contra los senders configurados en Configurations
// ------------------------------------------------------------
function detectarBanco_(from, cfg) {
  if (!from) return '';
  const fromLower = from.toLowerCase();
  for (let i = 1; i <= 10; i++) {
    const nombre = cfg['Banco ' + i + ' nombre'] || cfg['banco' + i + 'nombre'];
    const sender = cfg['Banco ' + i + ' sender'] || cfg['banco' + i + 'sender'];
    if (!sender) continue;
    const dominios = String(sender).split(',');
    for (let j = 0; j < dominios.length; j++) {
      if (fromLower.includes(dominios[j].trim().replace('@', ''))) {
        return nombre || 'Banco ' + i;
      }
    }
  }
  return '';
}

// ------------------------------------------------------------
// OBTIENE O CREA LABEL EN GMAIL
// Evita crear duplicados
// ------------------------------------------------------------
function obtenerOCrearLabel_(nombre) {
  let label = GmailApp.getUserLabelByName(nombre);
  if (!label) {
    label = GmailApp.createLabel(nombre);
    Logger.log(`Label creada: ${nombre}`);
  }
  return label;
}

// ------------------------------------------------------------
// CARGA HISTÓRICA DE EMAILS
// Procesa emails de Bancolombia desde una fecha inicial,
// sin importar si están leídos. Salta los ya etiquetados.
// Ejecutar manualmente — NO configurar como trigger automático.
//
// Parámetros ajustables:
//   FECHA_INICIO  : desde qué fecha buscar (formato YYYY/MM/DD)
//   LOTE          : cuántos hilos procesar por ejecución (máx ~50
//                   para evitar timeout de 6 min de Apps Script)
// ------------------------------------------------------------
function cargarHistoricoEmails() {
  const FECHA_INICIO = '2024/01/01';  // ← cambia si quieres otro rango
  const LOTE         = 50;            // ← baja a 20 si hay timeout

  const label = obtenerOCrearLabel_(CONFIG.GMAIL_LABEL);
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetTxn = ss.getSheetByName('Transactions');
  const sheetErr = ss.getSheetByName('Errors');

  // Busca todos los emails del período SIN filtro is:unread,
  // usando los bancos/senders configurados en la hoja Configurations
  const cfg2 = leerConfiguracion_();
  const query = `${cfg2.gmailQuery} after:${FECHA_INICIO} -label:${CONFIG.GMAIL_LABEL}`;
  const threads = GmailApp.search(query, 0, LOTE);

  if (threads.length === 0) {
    Logger.log('✅ No hay emails históricos pendientes por procesar.');
    return;
  }

  Logger.log(`📦 Histórico: encontrados ${threads.length} hilo(s) sin procesar desde ${FECHA_INICIO}`);

  let procesados = 0;
  let errores    = 0;
  let omitidos   = 0;

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      const asunto  = message.getSubject();
      const emailId = message.getId();

      try {
        const textoLimpio = extraerTextoEmail_(message);

        if (!esEmailTransaccional_(textoLimpio)) {
          Logger.log(`⏭️ Omitido (no transaccional): ${asunto}`);
          thread.addLabel(label);  // marcar para no reprocesar
          omitidos++;
          continue;
        }

        const transaccion = llamarGemini_(textoLimpio);
        transaccion.email_asunto = asunto;
        transaccion.email_id     = emailId;
        transaccion.fuente       = 'historico';
        transaccion.banco        = detectarBanco_(message.getFrom(), cfg2);

        escribirTransaccion_(sheetTxn, transaccion);
        thread.addLabel(label);
        procesados++;
        Logger.log(`✅ [${procesados}] ${transaccion.fecha} | ${transaccion.comercio} | $${transaccion.monto} COP`);

        // Pausa corta para no saturar la API de Gemini
        Utilities.sleep(500);

      } catch (e) {
        errores++;
        Logger.log(`❌ Error en email ${emailId}: ${e.message}`);
        registrarError_(sheetErr, e.message, asunto, emailId);
        // Si Gemini devuelve 503 (alta demanda), espera más antes de continuar
        if (e.message.includes('503')) Utilities.sleep(3000);
      }
    }
  }

  Logger.log('');
  Logger.log(`📊 Resumen histórico:`);
  Logger.log(`   ✅ Procesados : ${procesados}`);
  Logger.log(`   ⏭️ Omitidos   : ${omitidos}`);
  Logger.log(`   ❌ Errores    : ${errores}`);
  Logger.log(`   📬 Pendientes : ejecuta de nuevo si quedan más de ${LOTE}`);

  if (procesados > 0) {
    ordenarTransaccionesSheet_(sheetTxn);
    Logger.log('✅ Transactions ordenadas al cerrar lote histórico.');
  }
}

// ------------------------------------------------------------
// FUNCIÓN DE PRUEBA MANUAL
/* PRUEBA — descomentar para verificar el parsing de emails
// ------------------------------------------------------------
function probarConEmailFalso() {
  const textoTest = `Bancolombia: Compraste COP50.000,00 en TIENDA D1 MANIZALES con tu T.Cred *8352, el 22/03/2026 a las 14:30. Si tienes dudas, encuentranos aqui: 6045109095. Estamos cerca.`;

  Logger.log('=== PRUEBA MANUAL FinanceBot AI ===');
  Logger.log('Texto de prueba: ' + textoTest);

  try {
    const resultado = llamarGemini_(textoTest);
    Logger.log('✅ Gemini respondió correctamente:');
    Logger.log(JSON.stringify(resultado, null, 2));
  } catch (e) {
    Logger.log('❌ Error: ' + e.message);
  }
}
*/

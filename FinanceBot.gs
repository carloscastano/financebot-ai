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
function run_contarHistorico()          { return contarHistoricoPorMes_(); }
function run_cargarMes()                { return cargarMesEspecifico_(); }
function run_probarAsesor()             { analizarFinanzas(); }
function run_resetearTelegram()         { resetearOffsetTelegram(); }
function run_procesarMensajes()         { procesarMensajesTelegram(); }
function run_testHistoricoTelegram()    { enviarMensajeTelegram_(contarHistoricoPorMes_()); }
function run_cargarMesCLI(mes, lote)    { var r = cargarMesEspecifico_(mes, lote); Logger.log(r); return r; }
function run_limpiarTriggers()          {
  var borrados = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    var fn = t.getHandlerFunction();
    if (fn === 'run_cargarMesAsync') { ScriptApp.deleteTrigger(t); borrados++; }
  });
  var msg = 'Triggers run_cargarMesAsync eliminados: ' + borrados;
  Logger.log(msg);
  return msg;
}

// Ejecutor async de carga histórica — llamado por trigger de un solo disparo.
// No llamar directamente. Lo programa procesarComandoHistorico_() vía ScriptApp.
function run_cargarMesAsync() {
  // Eliminar este trigger para no re-ejecutarse
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'run_cargarMesAsync') ScriptApp.deleteTrigger(t);
  });
  var mes = PropertiesService.getScriptProperties().getProperty('HISTORICO_CARGAR_MES_PENDING');
  if (!mes) return;
  PropertiesService.getScriptProperties().deleteProperty('HISTORICO_CARGAR_MES_PENDING');
  try {
    var resultado = cargarMesEspecifico_(mes);
    enviarMensajeTelegram_('✅ ' + mdEscape_(resultado));
  } catch(e) {
    enviarMensajeTelegram_('❌ Error cargando ' + mes + ': ' + mdEscape_(_safeErrMsg_(e)));
  }
}

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
    logInfo_('EMAIL_PIPELINE', 'No hay emails nuevos de Bancolombia');
    return;
  }

  logInfo_('EMAIL_PIPELINE', `Encontrados ${threads.length} hilo(s) de Bancolombia`);

  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetTxn = ss.getSheetByName(SHEETS.TRANSACTIONS);
  const sheetErr = ss.getSheetByName(SHEETS.ERRORS);

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
        logInfo_('EMAIL_PIPELINE', `Procesando: ${asunto}`);

        // Paso 2: Verificar que sea transaccional (filtro rápido)
        if (!esEmailTransaccional_(textoLimpio)) {
          logInfo_('EMAIL_PIPELINE', 'Email no transaccional, se omite');
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
        logInfo_('EMAIL_PIPELINE', `Guardado: ${transaccion.comercio} - $${transaccion.monto} COP`);

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
        logError_('EMAIL_PIPELINE', `Error procesando email ${emailId}`, e);
        // Si es error temporal de servidor (503/502/red), NO marcar como leído
        // → el trigger lo reintentará automáticamente en la próxima ejecución
        const esErrorTemporal = e.message.includes('503') ||
                                e.message.includes('502') ||
                                e.message.includes('server error') ||
                                e.message.includes('unavailable');
        if (esErrorTemporal) {
          logWarn_('EMAIL_PIPELINE', `Error temporal en email ${emailId}, se reintentará`);
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

  const transaccion = _llamarGeminiJson_(prompt, { temperature: 0.1, maxOutputTokens: 512 });

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
    logInfo_('EMAIL_PIPELINE', `Label creada: ${nombre}`);
  }
  return label;
}

// ------------------------------------------------------------
// CARGA HISTÓRICA DE EMAILS — función core
//
// fechaInicio : 'YYYY/MM/DD' — desde cuándo buscar
// fechaFin    : 'YYYY/MM/DD' — hasta cuándo ('' = sin límite)
// soloContar  : true = dry-run, no llama a Gemini ni escribe nada
//
// Ejecutar manualmente. NO configurar como trigger automático.
// Usar run_contarHistorico() primero para ver qué hay.
// Usar run_cargarMes() para cargar de a un mes.
// ------------------------------------------------------------
function cargarHistoricoEmails(fechaInicio, fechaFin, soloContar, loteOverride) {
  const INICIO = fechaInicio || '2024/01/01';
  const FIN    = fechaFin    || '';
  const DRY    = soloContar  === true;
  const LOTE   = loteOverride || 10;  // con 4s/email: 10 threads × 2 emails × 4s ≈ 80s

  const cfg      = leerConfiguracion_();
  const label    = obtenerOCrearLabel_(CONFIG.GMAIL_LABEL);
  const ss       = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetTxn = ss.getSheetByName(SHEETS.TRANSACTIONS);
  const sheetErr = DRY ? null : ss.getSheetByName(SHEETS.ERRORS);

  // Construir query con ventana de fechas
  let query = `${cfg.gmailQuery} after:${INICIO} -label:${CONFIG.GMAIL_LABEL}`;
  if (FIN) query += ` before:${FIN}`;

  const threads = GmailApp.search(query, 0, LOTE);

  if (threads.length === 0) {
    const msg = `Sin emails pendientes | ${INICIO}${FIN ? ' → ' + FIN : ''}`;
    logInfo_('HISTORICO', (DRY ? '[DRY] ' : '') + msg);
    return msg;
  }

  logInfo_('HISTORICO', `[${DRY ? 'DRY' : 'CARGA'}] ${threads.length} hilo(s) | ${INICIO}${FIN ? ' → ' + FIN : ''}`);

  // Construir set fecha+monto de lo ya existente en Transactions — una sola lectura
  const existentes = {};
  if (!DRY && sheetTxn && sheetTxn.getLastRow() > 1) {
    const lastRow = sheetTxn.getLastRow();
    const fechas  = sheetTxn.getRange(2, 2, lastRow - 1, 1).getValues();
    const montos  = sheetTxn.getRange(2, 6, lastRow - 1, 1).getValues();
    for (let i = 0; i < fechas.length; i++) {
      const f = fechas[i][0];
      const m = montos[i][0];
      if (!f || !m) continue;
      const fs = (f instanceof Date)
        ? Utilities.formatDate(f, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : String(f).substring(0, 10);
      existentes[fs + '|' + Number(m)] = true;
    }
    logInfo_('HISTORICO', `Set de dedup cargado: ${Object.keys(existentes).length} transacciones existentes`);
  }

  let procesados = 0, omitidos = 0, duplicados = 0, errores = 0, transaccionales = 0;

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      const asunto  = message.getSubject();
      const emailId = message.getId();

      try {
        const texto = extraerTextoEmail_(message);

        if (!esEmailTransaccional_(texto)) {
          omitidos++;
          if (!DRY) thread.addLabel(label);
          continue;
        }

        transaccionales++;
        if (DRY) continue;  // solo contamos, sin llamar a Gemini

        const txn = llamarGemini_(texto);
        txn.email_asunto = asunto;
        txn.email_id     = emailId;
        txn.fuente       = 'historico';
        txn.banco        = detectarBanco_(message.getFrom(), cfg);

        // Dedup contra Transactions existentes (fecha+monto)
        const key = String(txn.fecha).substring(0, 10) + '|' + Number(txn.monto);
        if (existentes[key]) {
          duplicados++;
          thread.addLabel(label);  // marcar para no reprocesar
          logInfo_('HISTORICO', `Dup: ${txn.fecha} ${txn.comercio} $${txn.monto}`);
          continue;
        }
        existentes[key] = true;  // registrar para dedup dentro del mismo lote

        escribirTransaccion_(sheetTxn, txn);
        thread.addLabel(label);
        procesados++;
        logInfo_('HISTORICO', `[${procesados}] ${txn.fecha} | ${txn.comercio} | $${txn.monto} COP`);

        Utilities.sleep(4000);  // 4s entre calls = ~15 RPM, respeta límite free tier Gemini

      } catch (e) {
        errores++;
        logError_('HISTORICO', `Email ${emailId}`, e);
        if (!DRY) registrarError_(sheetErr, e.message, asunto, emailId);
        // Pausa extra si Gemini está bajo presión
        if (e.message.includes('503') || e.message.includes('429')) Utilities.sleep(10000);
      }
    }
  }

  if (!DRY && procesados > 0) {
    ordenarTransaccionesSheet_(sheetTxn);
    logInfo_('HISTORICO', 'Transactions ordenadas');
  }

  const resumen = DRY
    ? `[DRY] ${INICIO}${FIN ? '→' + FIN : ''} | Hilos=${threads.length} Transaccionales≈${transaccionales} Omitidos=${omitidos}`
    : `[CARGA] ${INICIO}${FIN ? '→' + FIN : ''} | OK=${procesados} Dup=${duplicados} Omitidos=${omitidos} Err=${errores}`;

  logInfo_('HISTORICO', resumen);
  return resumen;
}

// ------------------------------------------------------------
// CUENTA HILOS POR MES — rápido, sin leer contenido de emails
// Solo cuenta threads por mes (no clasifica). Es seguro para
// llamar desde Telegram (no lee mensajes, no llama a Gemini).
// Lee la fecha de inicio desde Configurations > "Historico Desde".
// ------------------------------------------------------------
function contarHistoricoPorMes_() {
  const cfg       = leerConfiguracion_();
  const DESDE     = cfg.historicoDesde || '2024/01';
  const hoyCal    = new Date();
  const hastaAnio = hoyCal.getFullYear();
  const hastaMes  = hoyCal.getMonth() + 1;

  const [desdeAnio, desdeMes] = DESDE.split('/').map(Number);

  const filas = [];
  let totalHilos = 0;

  let anio = desdeAnio, mes = desdeMes;
  while (anio < hastaAnio || (anio === hastaAnio && mes <= hastaMes)) {
    const inicio = `${anio}/${String(mes).padStart(2,'0')}/01`;
    const mesF   = mes === 12 ? 1    : mes + 1;
    const anioF  = mes === 12 ? anio + 1 : anio;
    const fin    = `${anioF}/${String(mesF).padStart(2,'0')}/01`;

    const q       = `${cfg.gmailQuery} after:${inicio} before:${fin} -label:${CONFIG.GMAIL_LABEL}`;
    const threads = GmailApp.search(q, 0, 100);

    const etiqueta = `${anio}/${String(mes).padStart(2,'0')}`;
    if (threads.length > 0) {
      // ~1.8 msgs/hilo promedio Bancolombia (estimado fijo, evita llamadas extra de API)
      const emailsEst = Math.round(threads.length * 1.8);
      filas.push(`  ${etiqueta}: ${threads.length} hilos, ~${emailsEst} emails`);
      totalHilos += threads.length;
    }

    if (mes === 12) { anio++; mes = 1; } else { mes++; }
  }

  const mesesConData = filas.length;
  var recomendacion = '';
  if (totalHilos === 0) {
    recomendacion = '✅ No hay emails pendientes de procesar.';
  } else if (totalHilos <= 50) {
    recomendacion = `💡 Carga ligera (~${Math.ceil(totalHilos / 25)} runs). Puedes cargar todos los meses sin problemas.`;
  } else if (totalHilos <= 200) {
    recomendacion = `⚡ Carga moderada. Recomiendo cargar mes a mes con /historico cargar YYYY/MM (~${Math.ceil(totalHilos / 25)} runs de 25).`;
  } else {
    recomendacion = `⚠️ Carga alta (${totalHilos} hilos). Carga mes a mes para evitar timeouts (~${Math.ceil(totalHilos / 25)} runs de 25 en total).`;
  }
  const resumen =
    `📊 *Histórico pendiente* (${DESDE} → hoy)\n\n` +
    (filas.length > 0 ? filas.join('\n') : '  _(sin emails pendientes)_') + '\n\n' +
    `*Total: ${totalHilos} hilos* en ${mesesConData} meses\n\n` +
    recomendacion + '\n\n' +
    `_/historico cargar YYYY/MM — carga un mes_`;

  Logger.log(resumen);
  return resumen;
}

// ------------------------------------------------------------
// CARGA UN MES ESPECÍFICO
// mes: 'YYYY/MM' — si no se pasa, lee Historico Desde de Configurations.
// ------------------------------------------------------------
function cargarMesEspecifico_(mes, lote) {
  const MES = mes || leerConfiguracion_().historicoDesde || '2024/01';

  const [anio, m] = MES.split('/').map(Number);
  const mesF  = m === 12 ? 1    : m + 1;
  const anioF = m === 12 ? anio + 1 : anio;

  const inicio = `${anio}/${String(m).padStart(2,'0')}/01`;
  const fin    = `${anioF}/${String(mesF).padStart(2,'0')}/01`;

  Logger.log(`▶ Cargando mes ${MES}: ${inicio} → ${fin}${lote ? ' (lote=' + lote + ')' : ''}`);
  return cargarHistoricoEmails(inicio, fin, false, lote);
}

// ------------------------------------------------------------
// PROCESA COMANDOS /historico desde Telegram
// ------------------------------------------------------------
function procesarComandoHistorico_(texto) {
  const partes = texto.trim().split(/\s+/);
  const sub    = (partes[1] || '').toLowerCase();

  if (sub === 'contar') {
    return contarHistoricoPorMes_();
  }

  if (sub === 'cargar') {
    const mes = partes[2] || '';
    if (!mes || !/^\d{4}\/\d{2}$/.test(mes)) {
      return (
        '❓ Formato: `/historico cargar YYYY/MM`\n' +
        'Ejemplo: `/historico cargar 2024/01`\n\n' +
        '_Ejecuta de nuevo si quedan más emails en ese mes_'
      );
    }
    // Programar carga async — no correr inline (excedería los 6 min del trigger de Telegram)
    // Primero limpiar triggers huérfanos para no acumular
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === 'run_cargarMesAsync') ScriptApp.deleteTrigger(t);
    });
    PropertiesService.getScriptProperties().setProperty('HISTORICO_CARGAR_MES_PENDING', mes);
    ScriptApp.newTrigger('run_cargarMesAsync').timeBased().after(5000).create();
    return '⏳ Iniciando carga de *' + mes + '*\\.\\.\\.\n_En ~2 min te aviso el resultado\\._';
  }

  const cfg   = leerConfiguracion_();
  const desde = cfg.historicoDesde || '2024/01';
  return (
    '📂 *Carga Histórica*\n\n' +
    '• `/historico contar` — muestra emails pendientes por mes\n' +
    '• `/historico cargar YYYY/MM` — carga ese mes\n\n' +
    '⚙️ Fecha inicio configurada: *' + desde + '*\n' +
    '_Cambia en Configurations → Historico Desde_'
  );
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

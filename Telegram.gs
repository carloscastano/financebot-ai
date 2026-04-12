// ============================================================
// FINANCEBOT AI - ALERTAS TELEGRAM
// ============================================================

// ------------------------------------------------------------
// RESETEAR OFFSET TELEGRAM
// Ejecuta esto si el bot está reprocesando mensajes viejos.
// Marca todos los mensajes actuales como leídos sin procesarlos.
// ------------------------------------------------------------
function resetearOffsetTelegram() {
  const token = CONFIG.TELEGRAM_BOT_TOKEN;
  const url   = 'https://api.telegram.org/bot' + token + '/getUpdates?offset=-1';
  const resp  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data  = JSON.parse(resp.getContentText());
  if (data.ok && data.result.length > 0) {
    const lastId = data.result[data.result.length - 1].update_id;
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_UPDATE_ID', String(lastId));
    Logger.log('✅ Offset reseteado al update_id: ' + lastId + '. Mensajes anteriores ignorados.');
  } else {
    Logger.log('ℹ️ No hay mensajes pendientes. Offset reseteado a 0.');
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_LAST_UPDATE_ID', '0');
  }
}

// ------------------------------------------------------------
// ENTRADA MANUAL POR TELEGRAM
// Configura un trigger cada 1 minuto para esta función.
// Escríbele al bot cualquier gasto/ingreso en texto libre:
//   "gasté 15000 en la frutería con efectivo"
//   "ingresé 50000 de Juan por Nequi"
//   "almuerzo 12000 restaurante"
// El bot lo parsea con Gemini y lo guarda en Transactions.
// ------------------------------------------------------------
function procesarMensajesTelegram() {
  const token  = CONFIG.TELEGRAM_BOT_TOKEN;
  const chatId = String(CONFIG.TELEGRAM_CHAT_ID);
  if (!token || !chatId) return;

  // Leer el último update_id procesado para no reprocesar mensajes
  const props       = PropertiesService.getScriptProperties();
  const lastUpdate  = parseInt(props.getProperty('TELEGRAM_LAST_UPDATE_ID') || '0');

  const url = 'https://api.telegram.org/bot' + token +
              '/getUpdates?offset=' + (lastUpdate + 1) + '&limit=10&timeout=0';
  let resp;
  try {
    resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  } catch(e) {
    Logger.log('⚠️ Telegram no disponible (red): ' + e.message);
    return;
  }
  if (resp.getResponseCode() !== 200) return;

  const data = JSON.parse(resp.getContentText());
  if (!data.ok || !data.result.length) return;

  const ss       = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheetTxn = ss.getSheetByName('Transactions');
  let maxId      = lastUpdate;

  data.result.forEach(function(update) {
    maxId = Math.max(maxId, update.update_id);
    const msg = update.message;
    if (!msg) return;

    // Solo procesar mensajes del chat autorizado
    if (String(msg.chat.id) !== chatId) return;

    // Mensajes de voz — próximamente
    if (msg.voice) {
      enviarMensajeTelegram_('🎤 Notas de voz próximamente. Por ahora envía texto libre.');
      return;
    }

    // Documentos (extractos bancarios .zip o .xlsx)
    if (msg.document) {
      var doc      = msg.document;
      var docName  = (doc.file_name || '').toLowerCase();
      if (docName.endsWith('.zip') || docName.endsWith('.xlsx')) {
        try {
          enviarMensajeTelegram_('📊 Procesando extracto, un momento...');
          var resExtracto = procesarExtractoTelegram_(doc.file_id, doc.file_name);
          enviarMensajeTelegram_(resExtracto);
        } catch(eDoc) {
          Logger.log('❌ Extracto: ' + eDoc.message);
          enviarMensajeTelegram_('❌ Error procesando el extracto: ' + eDoc.message);
        }
      } else {
        enviarMensajeTelegram_('📎 Solo acepto extractos en formato .zip o .xlsx\nDescárgalo desde la app del banco y envíalo aquí.');
      }
      return;
    }

    if (!msg.text) return;

    // Comando: "ID X pagada" — marca pago pendiente
    const matchPago = msg.text.match(/^id\s+(\d+)\s+pagad[ao]/i);
    if (matchPago) {
      marcarPagoPendiente_(matchPago[1]);
      maxId = Math.max(maxId, update.update_id);
      return;
    }

    // Comandos especiales
    if (msg.text === '/metas' || (msg.text && msg.text.startsWith('/meta '))) {
      try { enviarMensajeTelegram_(procesarComandoMeta_(msg.text)); } catch(e) { enviarMensajeTelegram_('❌ ' + e.message); }
      return;
    }

    if (msg.text === '/suscripciones') {
      try { reporteSuscripciones(); } catch(e) { enviarMensajeTelegram_('❌ ' + e.message); }
      return;
    }

    if (msg.text === '/presupuesto') {
      try { enviarMensajeTelegram_(construirMensajePresupuesto_()); } catch(e) { enviarMensajeTelegram_('❌ ' + e.message); }
      return;
    }

    if (msg.text === '/config' ||
        (msg.text && (msg.text.startsWith('/activar ') || msg.text.startsWith('/desactivar ')))) {
      try { enviarMensajeTelegram_(procesarComandoConfig_(msg.text)); } catch(e) { enviarMensajeTelegram_('❌ ' + e.message); }
      return;
    }

    if (msg.text === '/ayuda' || msg.text === '/help') {
      enviarMensajeTelegram_(
        '🤖 *FinanceBot — Comandos*\n\n' +
        '*Gastos manuales* — escríbeme directamente:\n' +
        '• `gasté 15000 en la frutería`\n' +
        '• `ingresé 200000 de Juan Nequi`\n' +
        '• `almuerzo 12000`\n\n' +
        '*Comandos:*\n' +
        '• /metas — ver progreso de metas de ahorro\n' +
        '• /meta estado — alertas rápidas (sin abono / cerca de fecha)\n' +
        '• /meta nueva <nombre> <monto> [fecha] — crear meta\n' +
        '• /meta abonar <nombre> <monto> — registrar abono\n' +
        '• /presupuesto — estado de presupuestos por categoría\n' +
        '• /suscripciones — detecta cargos recurrentes\n' +
        '• /config — ver y activar/desactivar funcionalidades\n' +
        '• /ayuda — este menú\n\n' +
        '*Archivos:*\n' +
        '• Envía un .zip o .xlsx con tu extracto Bancolombia para importarlo'
      );
      return;
    }

    // Comando no reconocido → mostrar ayuda
    if (msg.text && msg.text.startsWith('/')) {
      enviarMensajeTelegram_(
        '❓ Comando no reconocido.\n\n' +
        '🤖 *Lo que puedo hacer:*\n\n' +
        '*Registrar gastos:*\n' +
        '• `gasté 15000 en la frutería`\n' +
        '• `ingresé 200000 de Juan Nequi`\n' +
        '• `almuerzo 12000`\n\n' +
        '*Comandos:*\n' +
        '• /metas — metas de ahorro\n' +
        '• /meta estado — alertas rápidas\n' +
        '• /meta nueva <nombre> <monto> [fecha] — crear meta\n' +
        '• /meta abonar <nombre> <monto> — abonar\n' +
        '• /presupuesto — presupuestos por categoría\n' +
        '• /suscripciones — detecta cargos recurrentes\n' +
        '• /ayuda — este menú\n\n' +
        '*Archivos:*\n' +
        '• Envía .zip o .xlsx para importar extracto Bancolombia'
      );
      return;
    }

    // Chat conversacional: detectar pregunta antes de intentar parsear como transacción
    if (_esPreguntaFinanciera_(msg.text)) {
      try { enviarMensajeTelegram_(responderChat_(msg.text)); } catch(e) { enviarMensajeTelegram_('❌ ' + e.message); }
      return;
    }

    try {
      const transaccion  = parsearTransaccionManual_(msg.text);
      transaccion.fuente = 'telegram';

      if (!transaccion.monto || transaccion.monto <= 0) {
        enviarMensajeTelegram_('❓ No entendí el monto. Intenta así:\n`gasté 15000 en la frutería`\n`ingresé 200000 de Juan`');
        return;
      }

      escribirTransaccion_(sheetTxn, transaccion);

      const monto = Number(transaccion.monto).toLocaleString('es-CO');
      const emoji = transaccion.tipo === 'ingreso' ? '💚' : '🔴';
      enviarMensajeTelegram_(
        emoji + ' *Registrado*\n' +
        '💰 $' + monto + ' COP\n' +
        '🏪 ' + (transaccion.comercio || 'Sin comercio') + '\n' +
        '📂 ' + (transaccion.categoria || '') + (transaccion.subcategoria ? ' › ' + transaccion.subcategoria : '') + '\n' +
        '🏷️ ' + transaccion.tipo + ' · ' + (transaccion.necesidad || '') + '\n' +
        '💡 _' + (transaccion.sugerencia || '') + '_'
      );
    } catch(e) {
      Logger.log('❌ Telegram manual: ' + e.message);
      enviarMensajeTelegram_('❌ No pude registrar eso. Intenta: "gasté 15000 en la frutería"');
    }
  });

  // Guardar el último update_id para la próxima ejecución
  props.setProperty('TELEGRAM_LAST_UPDATE_ID', String(maxId));
}

// ------------------------------------------------------------
// PARSEA UN MENSAJE DE TEXTO LIBRE CON GEMINI
// Prompt calibrado para lenguaje coloquial colombiano
// ------------------------------------------------------------
function parsearTransaccionManual_(texto) {
  const hoy    = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
  const prompt =
    'Eres el asistente financiero personal de un colombiano. ' +
    'El usuario te envió este mensaje describiendo un gasto o ingreso:\n\n' +
    '"' + texto + '"\n\n' +
    'Fecha de hoy: ' + hoy + '\n\n' +
    'Extrae la información y devuelve SOLO un JSON válido (sin markdown).\n' +
    'Si el usuario no menciona fecha, usa hoy. Si no menciona hora, usa null.\n' +
    'Si no queda claro si es ingreso o egreso, asume egreso.\n\n' +
    'REGLAS ESPECIALES:\n' +
    '- Arriendo, canon, renta de apartamento/local → tipo=ingreso, tipo_transaccion=transferencia_recibida, categoria=Salario, subcategoria=Arriendo\n' +
    '- "me pagaron el arriendo", "ingresó el arriendo", "canon apartamento" → misma regla anterior\n\n' +
    'CATEGORÍAS (usa exactamente una de estas): ' + leerConfiguracion_().categorias.join(', ') + '\n\n' +
    'JSON a retornar:\n' +
    '{"fecha":"' + hoy + '","hora":null,"tipo":"egreso|ingreso",' +
    '"tipo_transaccion":"compra_td|transferencia_enviada|transferencia_recibida|otro",' +
    '"monto":0,"moneda":"COP","comercio":"nombre del lugar o persona",' +
    '"cuenta":null,"categoria":"Categoría","subcategoria":"Subcategoría",' +
    '"necesidad":"necesario|prescindible|lujo|n/a",' +
    '"sugerencia":"consejo breve en español","referencia":null,"confianza":0.8,' +
    '"banco":"Efectivo|Nequi|Bancolombia|otro"}';

  return _llamarGeminiJson_(prompt, { temperature: 0.1, maxOutputTokens: 512 });
}

// ------------------------------------------------------------
// RECORDATORIO DE PAGOS PENDIENTES
// Estructura de la hoja Pending Payments (9 columnas):
// Servicio | Monto Aprox | Día Vencimiento | Frecuencia |
// Cuenta/Referencia | Recordar (días antes) | Estado | Notas | Último Pago
//
// Responde "ID X pagada" en Telegram para marcar como pagado.
// ------------------------------------------------------------
function recordarPagosPendientes() {
  if (!isFeatureEnabled_('recordatorio_pagos')) { Logger.log('⏸️ recordatorio_pagos desactivado.'); return; }
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    Logger.log('⚠️ Telegram no configurado.');
    return;
  }

  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Pending Payments');
  if (!sheet || sheet.getLastRow() < 2) return;

  // Asegurar que exista la columna "Último Pago" en el header
  _asegurarColumnaUltimoPago_(sheet);

  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  const hoy   = new Date();
  hoy.setHours(0, 0, 0, 0);

  const pagosARecordar = [];

  datos.forEach(function(fila, idx) {
    const servicio        = fila[0];
    const monto           = fila[1];
    const diaVencimiento  = parseInt(fila[2]);
    const frecuencia      = fila[3];
    const referencia      = fila[4];
    const diasAnticipacion= parseInt(fila[5]) || 3;
    const estado          = fila[6];
    const notas           = fila[7];
    const ultimoPago      = fila[8]; // col I — fecha último pago
    const filaNum         = idx + 2; // fila real en la hoja (1-indexed, +1 header)

    if (!servicio || estado !== 'Activo' || !diaVencimiento) return;

    // Si ya fue pagado este mes, no recordar
    if (ultimoPago instanceof Date && !isNaN(ultimoPago)) {
      if (ultimoPago.getMonth() === hoy.getMonth() && ultimoPago.getFullYear() === hoy.getFullYear()) {
        Logger.log('✅ ' + servicio + ': ya pagado este mes (' + Utilities.formatDate(ultimoPago,'America/Bogota','dd/MM/yyyy') + ')');
        return;
      }
    }

    const mes  = hoy.getMonth() + 1;
    const anio = hoy.getFullYear();
    const fechaPago = new Date(anio, mes - 1, diaVencimiento);
    fechaPago.setHours(0, 0, 0, 0);

    const diasParaVencer = Math.round((fechaPago - hoy) / (1000 * 60 * 60 * 24));

    // Si ya venció este mes y no está pagado → recordar como VENCIDO hasta que lo marquen
    // Si aún no ha vencido → recordar dentro del umbral de días
    const vencidoSinPagar = diasParaVencer < 0;
    const proximoAVencer  = diasParaVencer >= 0 && diasParaVencer <= diasAnticipacion;

    Logger.log(servicio + ': faltan ' + diasParaVencer + ' día(s), umbral ' + diasAnticipacion + (vencidoSinPagar ? ' ⚠️ VENCIDO' : ''));

    if (vencidoSinPagar || proximoAVencer) {
      pagosARecordar.push({ servicio, monto, fechaPago, diasParaVencer, referencia, notas, filaNum });
    }
  });

  if (pagosARecordar.length === 0) {
    Logger.log('ℹ️ No hay pagos próximos a vencer.');
    return;
  }

  // Guardar mapa ID → fila. ID es fijo = filaNum - 1 (fila 2 = ID 1, fila 3 = ID 2, etc.)
  const mapa = {};
  pagosARecordar.forEach(function(p) { mapa[p.filaNum - 1] = p.filaNum; });
  PropertiesService.getScriptProperties().setProperty('PENDING_PAYMENT_MAP', JSON.stringify(mapa));

  // Construir mensaje con IDs fijos por fila
  const lineas = pagosARecordar.map(function(p) {
    const id       = p.filaNum - 1;  // ID permanente basado en fila
    const fecha    = Utilities.formatDate(p.fechaPago, 'America/Bogota', 'dd/MM/yyyy');
    const montoStr = p.monto ? '\n💰 $' + Number(p.monto).toLocaleString('es-CO') + ' COP' : '';
    const ref      = p.referencia ? '\n🔑 Ref: ' + p.referencia : '';
    let estado;
    if (p.diasParaVencer < 0)     estado = '🚨 VENCIDO hace ' + Math.abs(p.diasParaVencer) + ' día(s)';
    else if (p.diasParaVencer === 0) estado = '⚠️ HOY';
    else                           estado = 'en ' + p.diasParaVencer + ' día(s)';
    return '🧾 *ID ' + id + ': ' + p.servicio + '*\n📆 Vence: ' + fecha + ' (' + estado + ')' + montoStr + ref;
  });

  const mensaje =
    '📅 *Recordatorio de Pagos FinanceBot*\n\n' +
    'Tienes ' + pagosARecordar.length + ' pago(s) próximo(s):\n\n' +
    lineas.join('\n\n') + '\n\n' +
    '_Responde "ID 1 pagada" para marcar como pagado_';

  enviarMensajeTelegram_(mensaje);
  Logger.log('📱 Recordatorio enviado: ' + pagosARecordar.length + ' pago(s).');
}

// ------------------------------------------------------------
// MARCA UN PAGO COMO PAGADO
// Guarda la fecha de hoy en la columna "Último Pago"
// ------------------------------------------------------------
function marcarPagoPendiente_(idStr) {
  const id = parseInt(idStr);
  Logger.log('💳 marcarPagoPendiente_ llamado con ID: ' + id);

  if (!id || id <= 0) {
    enviarMensajeTelegram_('❓ ID no válido. Ejemplo: *ID 1 pagada*');
    return;
  }

  const mapaStr = PropertiesService.getScriptProperties().getProperty('PENDING_PAYMENT_MAP');
  Logger.log('🗺️ PENDING_PAYMENT_MAP: ' + mapaStr);

  if (!mapaStr) {
    enviarMensajeTelegram_('❓ No hay recordatorios activos. Vuelve a ejecutar el recordatorio y luego responde el ID.');
    return;
  }

  const mapa    = JSON.parse(mapaStr);
  const filaNum = mapa[String(id)];
  Logger.log('📍 Fila encontrada: ' + filaNum);

  if (!filaNum) {
    enviarMensajeTelegram_('❓ ID ' + id + ' no encontrado. IDs disponibles: ' + Object.keys(mapa).join(', '));
    return;
  }

  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Pending Payments');
  if (!sheet) return;

  // Leer nombre del servicio para confirmar
  const servicio = sheet.getRange(filaNum, 1).getValue();

  // Escribir fecha de hoy en columna 9 (Último Pago)
  sheet.getRange(filaNum, 9).setValue(new Date());

  enviarMensajeTelegram_(
    '✅ *Pago registrado*\n' +
    '🧾 ' + servicio + '\n' +
    '📅 Pagado: ' + Utilities.formatDate(new Date(), 'America/Bogota', 'dd/MM/yyyy') + '\n\n' +
    '_No recibirás recordatorio de este pago hasta el próximo mes._'
  );
  Logger.log('✅ Pago marcado: ' + servicio + ' (fila ' + filaNum + ')');
}

// ------------------------------------------------------------
// PRUEBA DIRECTA — ejecuta esto desde Apps Script para diagnosticar
/* PRUEBA — descomentar para simular respuesta "ID 1 pagada"
// ------------------------------------------------------------
function probarMarcarPago() {
  Logger.log('=== PRUEBA marcarPagoPendiente_ ===');
  const mapaStr = PropertiesService.getScriptProperties().getProperty('PENDING_PAYMENT_MAP');
  Logger.log('PENDING_PAYMENT_MAP guardado: ' + mapaStr);
  if (!mapaStr) {
    Logger.log('❌ El mapa está vacío. Ejecuta primero recordarPagosPendientes()');
    return;
  }
  marcarPagoPendiente_('1');
  Logger.log('=== FIN PRUEBA ===');
}
*/

// Agrega la columna "Último Pago" al header si no existe
function _asegurarColumnaUltimoPago_(sheet) {
  const header = sheet.getRange(1, 9).getValue();
  if (!header || String(header).trim() === '') {
    sheet.getRange(1, 9).setValue('Último Pago');
  }
}

// Parsea fecha en formato DD/MM/YYYY o Date object de Sheets
function parsearFecha_(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const str = valor.toString().trim();
  const partes = str.split('/');
  if (partes.length === 3) {
    return new Date(parseInt(partes[2]), parseInt(partes[1]) - 1, parseInt(partes[0]));
  }
  return null;
}

// Envía cualquier mensaje de texto a Telegram
function enviarMensajeTelegram_(texto) {
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: texto, parse_mode: 'Markdown' }),
      muteHttpExceptions: true
    });

    if (resp.getResponseCode() !== 200) {
      // Fallback: si falla Markdown (u otro error), reintentar en texto plano
      UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: _limpiarMarkdownBasico_(texto) }),
        muteHttpExceptions: true
      });
    }
  } catch(e) {
    Logger.log('⚠️ Telegram no disponible al enviar mensaje: ' + e.message);
  }
}

function _limpiarMarkdownBasico_(texto) {
  return String(texto || '').replace(/[*_`\[\]()]/g, '');
}

// ------------------------------------------------------------
// ENVÍA ALERTA DE GASTO ALTO A TELEGRAM
// ------------------------------------------------------------
function enviarTelegram_(txn) {
  if (!isFeatureEnabled_('alerta_gasto_alto')) return;
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) return;

  const monto = Number(txn.monto).toLocaleString('es-CO');
  const emoji = obtenerEmojiCategoria_(txn.categoria);

  const mensaje =
    `🚨 *Alerta FinanceBot*\n\n` +
    `${emoji} *${txn.comercio || 'Comercio desconocido'}*\n` +
    `💰 $${monto} COP\n` +
    `📂 ${txn.categoria} › ${txn.subcategoria || ''}\n` +
    `🏷️ ${txn.necesidad || 'sin clasificar'}\n` +
    `💡 _${txn.sugerencia || ''}_\n` +
    `📅 ${txn.fecha || ''} ${txn.hora || ''}`;

  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const payload = {
    chat_id: CONFIG.TELEGRAM_CHAT_ID,
    text: mensaje,
    parse_mode: 'Markdown'
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  let response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch(e) {
    Logger.log('⚠️ Telegram no disponible (alerta): ' + e.message);
    return;
  }
  const code = response.getResponseCode();

  if (code !== 200) {
    Logger.log(`⚠️ Telegram error ${code}: ${response.getContentText()} (reintentando sin Markdown)`);
    try {
      UrlFetchApp.fetch(url, {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          chat_id: CONFIG.TELEGRAM_CHAT_ID,
          text: _limpiarMarkdownBasico_(mensaje)
        }),
        muteHttpExceptions: true
      });
    } catch(e2) {
      Logger.log('⚠️ Telegram fallback error: ' + e2.message);
    }
  } else {
    Logger.log(`📱 Alerta Telegram enviada: ${txn.comercio} $${monto}`);
  }
}

// ------------------------------------------------------------
// PRUEBA DE TELEGRAM
/* PRUEBA — descomentar para verificar que el bot envía mensajes
// ------------------------------------------------------------
function probarTelegram() {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    Logger.log('⚠️ Configura TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en Config.gs');
    return;
  }

  const txnPrueba = {
    comercio: 'SMART FIT MAYORCA',
    monto: 94900,
    categoria: 'Salud',
    subcategoria: 'Gimnasio',
    necesidad: 'necesario',
    sugerencia: 'Considera si usas el gimnasio suficiente para justificar el costo.',
    fecha: '2026-03-22',
    hora: '06:05'
  };

  enviarTelegram_(txnPrueba);
  Logger.log('Prueba enviada. Revisa tu Telegram.');
}
*/

// ------------------------------------------------------------
// EMOJIS POR CATEGORÍA (para mensajes más visuales)
// ------------------------------------------------------------
function obtenerEmojiCategoria_(categoria) {
  const emojis = {
    'Alimentación':    '🍽️',
    'Transporte':      '🚗',
    'Vivienda':        '🏠',
    'Salud':           '❤️',
    'Educación':       '📚',
    'Entretenimiento': '🎬',
    'Servicios':       '📡',
    'Ropa y Personal': '👕',
    'Hogar':           '🛠️',
    'Financiero':      '🏦',
    'Transferencia':   '💸',
    'Salario':         '💼',
    'Otro':            '📌',
  };
  return emojis[categoria] || '💳';
}

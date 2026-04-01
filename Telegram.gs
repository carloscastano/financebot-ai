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
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
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

    if (!msg.text) return;

    // Comandos especiales
    if (msg.text === '/ayuda' || msg.text === '/help') {
      enviarMensajeTelegram_(
        '🤖 *FinanceBot — Entrada manual*\n\n' +
        'Escríbeme cualquier gasto o ingreso:\n\n' +
        '• `gasté 15000 en la frutería`\n' +
        '• `ingresé 200000 de Juan Nequi`\n' +
        '• `almuerzo 12000 efectivo`\n' +
        '• `gasolina 80000 terpel`\n\n' +
        'Clasifico automáticamente y guardo en tu hoja.'
      );
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
    'CATEGORÍAS: Alimentación, Transporte, Vivienda, Salud, Educación, Entretenimiento, ' +
    'Servicios, Ropa y Personal, Hogar, Financiero, Transferencia, Salario, Otro\n\n' +
    'JSON a retornar:\n' +
    '{"fecha":"' + hoy + '","hora":null,"tipo":"egreso|ingreso",' +
    '"tipo_transaccion":"compra_td|transferencia_enviada|transferencia_recibida|otro",' +
    '"monto":0,"moneda":"COP","comercio":"nombre del lugar o persona",' +
    '"cuenta":null,"categoria":"Categoría","subcategoria":"Subcategoría",' +
    '"necesidad":"necesario|prescindible|lujo|n/a",' +
    '"sugerencia":"consejo breve en español","referencia":null,"confianza":0.8,' +
    '"banco":"Efectivo|Nequi|Bancolombia|otro"}';

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512, responseMimeType: 'application/json' }
  };
  const options = {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  };
  const resp = UrlFetchApp.fetch(CONFIG.GEMINI_URL + '?key=' + CONFIG.GEMINI_API_KEY, options);
  if (resp.getResponseCode() !== 200) throw new Error('Gemini ' + resp.getResponseCode());

  const json = JSON.parse(resp.getContentText());
  let text = json.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('');
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(text);
}

// ------------------------------------------------------------
// RECORDATORIO DE PAGOS PENDIENTES
// Ejecutar con un trigger diario (ej: cada día a las 9am).
// Lee la hoja "Pending Payments" y avisa por Telegram si
// FechaPago está dentro de DiasAnticipacion días Y Estado=Activo.
// ------------------------------------------------------------
// ------------------------------------------------------------
// RECORDATORIO DE PAGOS PENDIENTES
// Estructura de la hoja Pending Payments:
// Servicio | Monto Aprox | Día Vencimiento | Frecuencia |
// Cuenta/Referencia | Recordar (días antes) | Estado | Mes | Notas
// ------------------------------------------------------------
function recordarPagosPendientes() {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    Logger.log('⚠️ Telegram no configurado.');
    return;
  }

  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Pending Payments');
  if (!sheet || sheet.getLastRow() < 2) return;

  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  const hoy   = new Date();
  hoy.setHours(0, 0, 0, 0);

  const pagosARecordar = [];

  datos.forEach(function(fila) {
    const servicio        = fila[0];
    const monto           = fila[1];
    const diaVencimiento  = parseInt(fila[2]);
    const frecuencia      = fila[3];
    const referencia      = fila[4];
    const diasAnticipacion= parseInt(fila[5]) || 3;
    const estado          = fila[6];
    const notas           = fila[7];
    const mes             = hoy.getMonth() + 1;  // siempre mes actual

    if (!servicio || estado !== 'Activo' || !diaVencimiento) return;

    // Construir fecha de vencimiento con día + mes + año actual
    const anio = hoy.getFullYear();
    const fechaPago = new Date(anio, mes - 1, diaVencimiento);
    fechaPago.setHours(0, 0, 0, 0);

    // Si la fecha ya pasó este año, proyectar al siguiente mes/año
    if (fechaPago < hoy) {
      fechaPago.setMonth(fechaPago.getMonth() + 1);
    }

    const diasParaVencer = Math.round((fechaPago - hoy) / (1000 * 60 * 60 * 24));

    Logger.log(`${servicio}: vence ${Utilities.formatDate(fechaPago,'America/Bogota','dd/MM/yyyy')}, faltan ${diasParaVencer} día(s), umbral ${diasAnticipacion}`);

    if (diasParaVencer >= 0 && diasParaVencer <= diasAnticipacion) {
      pagosARecordar.push({ servicio, monto, fechaPago, diasParaVencer, referencia, notas });
    }
  });

  if (pagosARecordar.length === 0) {
    Logger.log('ℹ️ No hay pagos próximos a vencer.');
    return;
  }

  // Construir mensaje Telegram
  const lineas = pagosARecordar.map(function(p) {
    const fecha = Utilities.formatDate(p.fechaPago, 'America/Bogota', 'dd/MM/yyyy');
    const montoStr = p.monto ? '\n💰 $' + Number(p.monto).toLocaleString('es-CO') + ' COP' : '';
    const ref      = p.referencia ? '\n🔑 Ref: ' + p.referencia : '';
    const dias     = p.diasParaVencer === 0 ? '⚠️ HOY' : 'en ' + p.diasParaVencer + ' día(s)';
    return '🧾 *' + p.servicio + '*\n📆 Vence: ' + fecha + ' (' + dias + ')' + montoStr + ref;
  });

  const mensaje =
    '📅 *Recordatorio de Pagos FinanceBot*\n\n' +
    'Tienes ' + pagosARecordar.length + ' pago(s) próximo(s):\n\n' +
    lineas.join('\n\n');

  enviarMensajeTelegram_(mensaje);
  Logger.log('📱 Recordatorio enviado: ' + pagosARecordar.length + ' pago(s).');
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
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: CONFIG.TELEGRAM_CHAT_ID, text: texto, parse_mode: 'Markdown' }),
    muteHttpExceptions: true
  });
}

// ------------------------------------------------------------
// ENVÍA ALERTA DE GASTO ALTO A TELEGRAM
// ------------------------------------------------------------
function enviarTelegram_(txn) {
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

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();

  if (code !== 200) {
    Logger.log(`⚠️ Telegram error ${code}: ${response.getContentText()}`);
  } else {
    Logger.log(`📱 Alerta Telegram enviada: ${txn.comercio} $${monto}`);
  }
}

// ------------------------------------------------------------
// PRUEBA DE TELEGRAM
// Ejecuta esto para verificar que el bot funciona
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

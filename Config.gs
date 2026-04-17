// ============================================================
// FINANCEBOT AI - CONFIGURACIÓN
// Las claves sensibles se guardan en Script Properties de Apps Script.
// NUNCA escribas credenciales reales en este archivo.
// Ejecuta crearHojaSetup() y luego aplicarSetup() para configurar.
// ============================================================

const CONFIG = {

  GMAIL_LABEL:              'FinanceBot-Procesado',
  MAX_EMAILS_POR_EJECUCION: 20,
  GEMINI_URL:               'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent',

  // Credenciales — se leen desde Script Properties (nunca del código)
  get GEMINI_API_KEY()     { return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');     },
  get SPREADSHEET_ID()     { return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');     },
  get TELEGRAM_BOT_TOKEN() { return PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN'); },
  get TELEGRAM_CHAT_ID()   { return PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');   },
};

const SETUP_SHEET_NAME_ = '🔧 Setup';

// ============================================================
// MENÚ PERSONALIZADO — aparece automáticamente al abrir la hoja
// El usuario nunca necesita abrir el editor de código.
// ============================================================
function onOpen() {
  SpreadsheetApp.getActiveSpreadsheet().addMenu('🤖 FinanceBot', [
    { name: '🚀 Paso 1 — Crear formulario de configuración', functionName: 'crearHojaSetup'       },
    { name: '✅ Paso 2 — Aplicar configuración',             functionName: 'aplicarSetup'          },
    { name: '─────────────────────',                         functionName: 'menuSeparador_'         },
    { name: '📊 Reconstruir dashboard',                      functionName: 'reconstruirDashboard'   },
    { name: '🔍 Verificar credenciales',                     functionName: 'verificarCredenciales'  },
    { name: '⚙️  Estado de triggers',                        functionName: 'mostrarEstadoTriggers'  },
    { name: '🔑 Detectar Chat ID manualmente',               functionName: 'detectarMiChatId'       },
  ]);
}
function menuSeparador_() { /* separador visual */ }

// ============================================================
// PASO 1 — Crear hoja de configuración
// Ejecuta esto primero. Crea una hoja temporal "Setup" en tu Spreadsheet.
// Llena los campos y luego ejecuta aplicarSetup().
// ============================================================
function crearHojaSetup() {
  const ss    = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') ||
    _detectarSpreadsheetId_()
  );

  // Eliminar hoja Setup anterior si existe
  const existente = ss.getSheetByName(SETUP_SHEET_NAME_);
  if (existente) ss.deleteSheet(existente);

  const sheet = ss.insertSheet(SETUP_SHEET_NAME_);
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(1);

  const datos = [
    ['FINANCEBOT AI — CONFIGURACIÓN INICIAL', '', ''],
    ['', '', ''],
    ['📋 INSTRUCCIONES:', '1) Llena las 2 celdas amarillas  2) Envíale "hola" a tu bot en Telegram  3) Menú FinanceBot → Paso 2 Aplicar', ''],
    ['🔒 Seguridad:', 'Esta hoja se elimina sola al aplicar. Las claves quedan guardadas en tu cuenta de Google (invisibles).', ''],
    ['', '', ''],
    ['Parámetro', 'Tu valor (edita esta columna)', 'Cómo obtenerlo — paso a paso'],
    ['GEMINI_API_KEY',
     '',
     '→ Entra a aistudio.google.com → botón "Get API Key" → "Create API key" → copia la clave (empieza con AIzaSy...)'],
    ['SPREADSHEET_ID',
     _detectarSpreadsheetId_(),
     '✅ Detectado automáticamente — no tocar'],
    ['TELEGRAM_BOT_TOKEN',
     '',
     '→ Abre Telegram → busca @BotFather → escribe /newbot → sigue los pasos → copia el token (formato 123456789:AAF-XXXX...)'],
  ];

  sheet.getRange(1, 1, datos.length, 3).setValues(datos);

  // Formato visual
  sheet.getRange('A1').setFontWeight('bold').setFontSize(14).setBackground('#1a73e8').setFontColor('#ffffff');
  sheet.getRange('A6:C6').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange('A7:A9').setFontWeight('bold');
  sheet.getRange('B7:B9').setBackground('#fffde7').setFontWeight('bold');  // celdas a llenar (B8 es auto)
  sheet.getRange('B8').setBackground('#e8f4e8');  // verde = auto-detectado, no tocar
  sheet.getRange('A3:C4').setFontStyle('italic').setFontColor('#555555');
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 420);
  sheet.setFrozenRows(6);

  logInfo_('SETUP', 'Hoja "' + SETUP_SHEET_NAME_ + '" creada en tu Spreadsheet');
  logInfo_('SETUP', 'Abre el Spreadsheet, llena los valores en la columna B y ejecuta aplicarSetup()');
}

// ============================================================
// PASO 2 — Aplicar configuración desde la hoja Setup
// Ejecuta esto DESPUÉS de llenar la hoja Setup.
// Lee los valores, los guarda en Script Properties y elimina la hoja.
// ============================================================
function aplicarSetup() {
  var ui    = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  // ── 1. Localizar spreadsheet y hoja Setup ──────────────────
  var spreadsheetId = props.getProperty('SPREADSHEET_ID') || _detectarSpreadsheetId_();
  if (!spreadsheetId) {
    ui.alert('❌ Error', 'No se pudo detectar el Spreadsheet. Ejecuta el Paso 1 primero.', ui.ButtonSet.OK);
    return;
  }
  var ss    = SpreadsheetApp.openById(spreadsheetId);
  var sheet = ss.getSheetByName(SETUP_SHEET_NAME_);
  if (!sheet) {
    ui.alert('❌ Error', 'No se encontró la hoja Setup. Ejecuta el Paso 1 primero.', ui.ButtonSet.OK);
    return;
  }

  // ── 2. Leer valores (filas 7-9, columna B) ─────────────────
  var valores   = sheet.getRange(7, 2, 3, 1).getValues().flat();
  var geminiKey = String(valores[0]).trim();
  var sheetId   = String(valores[1]).trim();
  var tgToken   = String(valores[2]).trim();

  // ── 3. Validar campos obligatorios ─────────────────────────
  if (!geminiKey) {
    ui.alert('⚠️ Falta la clave de Gemini',
      'Llena el campo GEMINI_API_KEY en la hoja Setup y vuelve a ejecutar el Paso 2.',
      ui.ButtonSet.OK);
    return;
  }
  if (!tgToken) {
    ui.alert('⚠️ Falta el token de Telegram',
      'Llena el campo TELEGRAM_BOT_TOKEN en la hoja Setup y vuelve a ejecutar el Paso 2.',
      ui.ButtonSet.OK);
    return;
  }

  // ── 4. Validar token de Telegram (getMe) ───────────────────
  logInfo_('SETUP', 'Validando token de Telegram...');
  if (!_validarTelegramToken_(tgToken)) {
    ui.alert('❌ Token de Telegram inválido',
      'El token que pegaste no funciona. Verifica que lo copiaste completo desde @BotFather (formato: 123456789:AAF-XXXX...).',
      ui.ButtonSet.OK);
    return;
  }
  logInfo_('SETUP', 'Token de Telegram ✅');

  // ── 5. Validar clave de Gemini ─────────────────────────────
  logInfo_('SETUP', 'Validando clave de Gemini...');
  if (!_validarGeminiKey_(geminiKey)) {
    ui.alert('❌ Clave de Gemini inválida',
      'La API Key de Gemini no funciona. Verifica que la copiaste completa desde aistudio.google.com (empieza con AIzaSy...).',
      ui.ButtonSet.OK);
    return;
  }
  logInfo_('SETUP', 'Clave de Gemini ✅');

  // ── 6. Auto-detectar Chat ID ───────────────────────────────
  logInfo_('SETUP', 'Detectando Chat ID de Telegram...');
  var chatId = _detectarChatIdSilencioso_(tgToken);
  if (!chatId) {
    ui.alert('⚠️ No se detectó tu Chat ID',
      'Abre Telegram, busca tu bot y envíale cualquier mensaje (ej: "hola").\n\nLuego vuelve aquí y ejecuta el Paso 2 de nuevo.',
      ui.ButtonSet.OK);
    return;
  }
  logInfo_('SETUP', 'Chat ID detectado: ' + chatId + ' ✅');

  // ── 7. Guardar todas las propiedades ───────────────────────
  props.setProperty('GEMINI_API_KEY',     geminiKey);
  props.setProperty('SPREADSHEET_ID',     sheetId || spreadsheetId);
  props.setProperty('TELEGRAM_BOT_TOKEN', tgToken);
  props.setProperty('TELEGRAM_CHAT_ID',   chatId);
  logInfo_('SETUP', 'Credenciales guardadas');

  // ── 8. Eliminar hoja Setup ─────────────────────────────────
  ss.deleteSheet(sheet);
  logInfo_('SETUP', 'Hoja Setup eliminada');

  // ── 9. Crear hojas del Spreadsheet ────────────────────────
  logInfo_('SETUP', 'Creando hojas...');
  try { configurarSpreadsheet(); } catch(e) { logWarn_('SETUP', 'configurarSpreadsheet: ' + e.message); }

  // ── 10. Crear triggers ────────────────────────────────────
  logInfo_('SETUP', 'Activando automatizaciones...');
  configurarTriggers();

  // ── 11. Mensaje de bienvenida ─────────────────────────────
  try {
    enviarMensajeTelegram_(
      '🎉 *FinanceBot AI activado*\n\n' +
      'Hola\\! Tu bot está configurado y listo\\.\n' +
      'Escribe /ayuda para ver todos los comandos disponibles\\.'
    );
    logInfo_('SETUP', 'Mensaje de bienvenida enviado ✅');
  } catch(e) {
    logWarn_('SETUP', 'Bienvenida no enviada: ' + e.message);
  }

  logInfo_('SETUP', '');
  logInfo_('SETUP', '✅ SETUP COMPLETO — tu FinanceBot está activo');
  logInfo_('SETUP', '  → Escribe /ayuda en Telegram para explorar el bot');
  logInfo_('SETUP', '  → Gmail monitorizado: ' + Session.getEffectiveUser().getEmail());

  verificarCredenciales();
}

// ============================================================
// CONFIGURAR TRIGGERS — crea todos los triggers automáticamente
// Idempotente: elimina duplicados antes de crear.
// ============================================================
function configurarTriggers() {
  var funciones = [
    'procesarEmailsBancolombia',
    'procesarMensajesTelegram',
    'recordarPagosPendientes',
    'run_reporteSemanal',
    'run_verificarPresupuestoMensual',
    'run_recordarMetasMensual',
  ];

  // Eliminar triggers existentes para estas funciones (evita duplicados)
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (funciones.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  // Emails del banco — cada 5 min
  ScriptApp.newTrigger('procesarEmailsBancolombia')
    .timeBased().everyMinutes(5).create();

  // Mensajes Telegram — cada 1 min
  ScriptApp.newTrigger('procesarMensajesTelegram')
    .timeBased().everyMinutes(1).create();

  // Recordatorio pagos pendientes — diario 9am
  ScriptApp.newTrigger('recordarPagosPendientes')
    .timeBased().atHour(9).everyDays(1).create();

  // Reporte semanal — lunes 7am
  ScriptApp.newTrigger('run_reporteSemanal')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();

  // Revisión presupuesto mensual — diario 8am (la función chequea si es día 25)
  ScriptApp.newTrigger('run_verificarPresupuestoMensual')
    .timeBased().atHour(8).everyDays(1).create();

  logInfo_('SETUP', 'Triggers configurados: emails(5m), Telegram(1m), pagos(9am diario), reporte(lunes 7am), presupuesto(8am diario)');
}

// ============================================================
// PAUSAR / REANUDAR TRIGGERS DE TIEMPO REAL
// Usar durante carga histórica para liberar cuota Gemini.
// run_pausarTriggers()   → elimina email (5m) y Telegram (1m)
// run_reanudarTriggers() → los restaura con las frecuencias originales
// ============================================================
function run_pausarTriggers() {
  var pausar = ['procesarEmailsBancolombia', 'procesarMensajesTelegram'];
  var eliminados = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (pausar.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
      eliminados++;
      logInfo_('SETUP', 'Trigger pausado: ' + t.getHandlerFunction());
    }
  });
  logInfo_('SETUP', '⏸ Triggers de tiempo real pausados (' + eliminados + ')');
  logInfo_('SETUP', '  → Los correos y mensajes Telegram NO se procesarán hasta reanudar');
  logInfo_('SETUP', '  → Ejecuta run_reanudarTriggers() cuando termines la carga histórica');
}

function run_reanudarTriggers() {
  // Eliminar primero por si quedó alguno duplicado
  var funciones = ['procesarEmailsBancolombia', 'procesarMensajesTelegram'];
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (funciones.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('procesarEmailsBancolombia')
    .timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('procesarMensajesTelegram')
    .timeBased().everyMinutes(1).create();

  logInfo_('SETUP', '▶ Triggers de tiempo real reanudados');
  logInfo_('SETUP', '  → procesarEmailsBancolombia: cada 5 min');
  logInfo_('SETUP', '  → procesarMensajesTelegram: cada 1 min');
}

// ============================================================
// ESTADO DE TRIGGERS — muestra qué hay activo
// ============================================================
function mostrarEstadoTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  if (triggers.length === 0) {
    logInfo_('SETUP', 'No hay triggers configurados. Ejecuta Paso 2 — Aplicar configuración.');
    return;
  }
  logInfo_('SETUP', '=== TRIGGERS ACTIVOS (' + triggers.length + ') ===');
  triggers.forEach(function(t) {
    logInfo_('SETUP', '  • ' + t.getHandlerFunction() + ' — ' + t.getTriggerSource());
  });
}

// ============================================================
// DETECTAR CHAT ID — el usuario le escribe al bot y esta función
// llama getUpdates para extraer el chat_id automáticamente.
// ============================================================
function detectarMiChatId() {
  var ui = SpreadsheetApp.getUi();

  var token = CONFIG.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // Intentar leerlo desde la hoja Setup si aún no se aplicó
    try {
      var ss    = SpreadsheetApp.getActiveSpreadsheet();
      var setup = ss.getSheetByName(SETUP_SHEET_NAME_);
      if (setup) token = String(setup.getRange(9, 2).getValue()).trim(); // fila TELEGRAM_BOT_TOKEN
    } catch(e) { /* ignorar */ }
  }

  if (!token) {
    ui.alert('⚠️ Token no encontrado',
      'Primero completa el TELEGRAM_BOT_TOKEN en la hoja Setup (Paso 1).',
      ui.ButtonSet.OK);
    return;
  }

  var url  = 'https://api.telegram.org/bot' + token + '/getUpdates?limit=10&allowed_updates=message';
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var data;
  try { data = JSON.parse(resp.getContentText()); } catch(e) {
    ui.alert('❌ Error', 'No se pudo conectar a Telegram. Verifica que el token sea correcto.', ui.ButtonSet.OK);
    return;
  }

  if (!data.ok || !data.result || data.result.length === 0) {
    ui.alert('⚠️ Sin mensajes detectados',
      '1. Abre Telegram\n2. Busca tu bot por su nombre de usuario\n3. Envíale cualquier mensaje (ej: "hola")\n4. Vuelve aquí y ejecuta este paso de nuevo.',
      ui.ButtonSet.OK);
    return;
  }

  // Buscar el primer mensaje válido
  var chatId = null, nombre = '';
  for (var i = 0; i < data.result.length; i++) {
    var msg = data.result[i].message || data.result[i].channel_post;
    if (msg && msg.chat && msg.chat.id) {
      chatId = msg.chat.id;
      nombre = msg.chat.first_name || msg.chat.username || '';
      break;
    }
  }

  if (!chatId) {
    ui.alert('⚠️ No se encontró el Chat ID',
      'Envía un mensaje a tu bot en Telegram y vuelve a ejecutar este paso.',
      ui.ButtonSet.OK);
    return;
  }

  // Guardar en Script Properties
  PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', String(chatId));

  // También escribirlo en la hoja Setup si está abierta
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var setup = ss.getSheetByName(SETUP_SHEET_NAME_);
    if (setup) setup.getRange(10, 2).setValue(String(chatId)); // fila TELEGRAM_CHAT_ID
  } catch(e) { /* ignorar si Setup ya no existe */ }

  ui.alert('✅ Chat ID detectado y guardado',
    'Tu Chat ID es: ' + chatId + (nombre ? ' (' + nombre + ')' : '') + '\n\n' +
    'Ya está guardado automáticamente. Continúa con el Paso 2 — Aplicar configuración.',
    ui.ButtonSet.OK);
}

// ============================================================
// VERIFICAR CREDENCIALES — muestra estado sin revelar valores
// ============================================================
function verificarCredenciales() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys  = ['GEMINI_API_KEY', 'SPREADSHEET_ID', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

  logInfo_('SETUP', '=== ESTADO DE CREDENCIALES ===');
  keys.forEach(function(k) {
    const val = props[k];
    if (!val) {
      logWarn_('SETUP', k + ': NO CONFIGURADA');
    } else {
      const preview = val.substring(0, 4) + '****' + val.substring(val.length - 4);
      logInfo_('SETUP', k + ': ' + preview);
    }
  });
}

// ============================================================
// HELPERS PRIVADOS DE VALIDACIÓN Y DETECCIÓN
// ============================================================

// Verifica que el token de Telegram sea válido llamando getMe
function _validarTelegramToken_(token) {
  try {
    var resp = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + token + '/getMe',
      { muteHttpExceptions: true }
    );
    var data = JSON.parse(resp.getContentText());
    return data.ok === true;
  } catch(e) { return false; }
}

// Verifica que la API Key de Gemini sea válida con una llamada mínima
function _validarGeminiKey_(key) {
  try {
    var resp = UrlFetchApp.fetch(
      CONFIG.GEMINI_URL + '?key=' + key,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({ contents: [{ parts: [{ text: 'ok' }] }] }),
        muteHttpExceptions: true,
      }
    );
    return resp.getResponseCode() === 200;
  } catch(e) { return false; }
}

// Detecta el chat_id del primer mensaje recibido por el bot. Sin UI.
// Retorna el chatId como string, o null si no hay mensajes.
function _detectarChatIdSilencioso_(token) {
  try {
    var resp = UrlFetchApp.fetch(
      'https://api.telegram.org/bot' + token + '/getUpdates?limit=10',
      { muteHttpExceptions: true }
    );
    var data = JSON.parse(resp.getContentText());
    if (!data.ok || !data.result || data.result.length === 0) return null;
    for (var i = 0; i < data.result.length; i++) {
      var msg = data.result[i].message || data.result[i].channel_post;
      if (msg && msg.chat && msg.chat.id) return String(msg.chat.id);
    }
  } catch(e) { /* ignorar */ }
  return null;
}

// Detecta el ID del spreadsheet activo o desde la URL del proyecto
function _detectarSpreadsheetId_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getId();
  } catch(e) {
    return '';
  }
}

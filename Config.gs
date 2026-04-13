// ============================================================
// FINANCEBOT AI - CONFIGURACIÓN
// Las claves sensibles se guardan en Script Properties de Apps Script.
// NUNCA escribas credenciales reales en este archivo.
// Ejecuta crearHojaSetup() y luego aplicarSetup() para configurar.
// ============================================================

const CONFIG = {

  GMAIL_LABEL:              'FinanceBot-Procesado',
  MAX_EMAILS_POR_EJECUCION: 20,
  GEMINI_URL:               'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',

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
    { name: '🔑 Paso 1b — Detectar mi Chat ID de Telegram',  functionName: 'detectarMiChatId'      },
    { name: '✅ Paso 2 — Aplicar configuración',             functionName: 'aplicarSetup'          },
    { name: '─────────────────────',                         functionName: 'menuSeparador_'         },
    { name: '📊 Reconstruir dashboard',                      functionName: 'reconstruirDashboard'   },
    { name: '🔍 Verificar credenciales',                     functionName: 'verificarCredenciales'  },
    { name: '⚙️  Estado de triggers',                        functionName: 'mostrarEstadoTriggers'  },
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
    ['📋 INSTRUCCIONES:', '1) Llena la columna B con tus valores  2) Menú FinanceBot → Paso 2 Aplicar', ''],
    ['🔒 Seguridad:', 'Esta hoja se elimina sola al aplicar. Las claves quedan en Script Properties (invisibles).', ''],
    ['', '', ''],
    ['Parámetro', 'Tu valor (edita esta columna)', 'Cómo obtenerlo — paso a paso'],
    ['GEMINI_API_KEY',
     '',
     '→ Entra a aistudio.google.com → botón "Get API Key" → "Create API key" → copia'],
    ['SPREADSHEET_ID',
     _detectarSpreadsheetId_(),
     '✅ Detectado automáticamente — no tocar'],
    ['TELEGRAM_BOT_TOKEN',
     '',
     '→ Abre Telegram → busca @BotFather → escribe /newbot → sigue los pasos → copia el token (formato 123456:ABC-DEF...)'],
    ['TELEGRAM_CHAT_ID',
     '',
     '→ Después de crear el bot, escríbele cualquier mensaje → vuelve aquí y corre detectarMiChatId() desde el menú Extensiones → Apps Script → Ejecutar'],
  ];

  sheet.getRange(1, 1, datos.length, 3).setValues(datos);

  // Formato visual
  sheet.getRange('A1').setFontWeight('bold').setFontSize(14).setBackground('#1a73e8').setFontColor('#ffffff');
  sheet.getRange('A6:C6').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange('A7:A10').setFontWeight('bold');
  sheet.getRange('B7:B10').setBackground('#fffde7').setFontWeight('bold');  // celdas a llenar
  sheet.getRange('A3:C4').setFontStyle('italic').setFontColor('#555555');
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 280);
  sheet.setColumnWidth(3, 380);
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
  const props = PropertiesService.getScriptProperties();

  // Detectar spreadsheet
  const spreadsheetId = props.getProperty('SPREADSHEET_ID') || _detectarSpreadsheetId_();
  if (!spreadsheetId) {
    logError_('SETUP', 'No se pudo detectar el Spreadsheet. Ejecuta crearHojaSetup() primero');
    return;
  }

  const ss    = SpreadsheetApp.openById(spreadsheetId);
  const sheet = ss.getSheetByName(SETUP_SHEET_NAME_);
  if (!sheet) {
    logError_('SETUP', 'No se encontro la hoja "' + SETUP_SHEET_NAME_ + '". Ejecuta crearHojaSetup() primero');
    return;
  }

  // Leer valores (filas 7-10, columna B = col 2)
  const valores = sheet.getRange(7, 2, 4, 1).getValues().flat();
  const geminiKey    = String(valores[0]).trim();
  const sheetId      = String(valores[1]).trim();
  const tgToken      = String(valores[2]).trim();
  const tgChatId     = String(valores[3]).trim();

  let errores = 0;

  if (geminiKey && geminiKey !== '') {
    props.setProperty('GEMINI_API_KEY', geminiKey);
    logInfo_('SETUP', 'GEMINI_API_KEY guardada');
  } else {
    logWarn_('SETUP', 'GEMINI_API_KEY vacia - no se actualizo');
    errores++;
  }

  if (sheetId && sheetId !== '') {
    props.setProperty('SPREADSHEET_ID', sheetId);
    logInfo_('SETUP', 'SPREADSHEET_ID guardado');
  } else {
    logWarn_('SETUP', 'SPREADSHEET_ID vacio - no se actualizo');
    errores++;
  }

  if (tgToken && tgToken !== '') {
    props.setProperty('TELEGRAM_BOT_TOKEN', tgToken);
    logInfo_('SETUP', 'TELEGRAM_BOT_TOKEN guardado');
  } else {
    logInfo_('SETUP', 'TELEGRAM_BOT_TOKEN vacio - Telegram desactivado');
  }

  if (tgChatId && tgChatId !== '') {
    props.setProperty('TELEGRAM_CHAT_ID', tgChatId);
    logInfo_('SETUP', 'TELEGRAM_CHAT_ID guardado');
  }

  // Eliminar hoja Setup para no dejar credenciales visibles
  ss.deleteSheet(sheet);
  logInfo_('SETUP', 'Hoja Setup eliminada');

  if (errores > 0) {
    logWarn_('SETUP', 'Setup incompleto — abre el menú FinanceBot → Paso 1 y completa los campos faltantes');
    return;
  }

  // Auto: crear hojas si no existen
  logInfo_('SETUP', 'Creando hojas del Spreadsheet...');
  try { configurarSpreadsheet(); } catch(e) { logWarn_('SETUP', 'configurarSpreadsheet: ' + e.message); }

  // Auto: crear todos los triggers
  logInfo_('SETUP', 'Configurando triggers automáticos...');
  configurarTriggers();

  // Auto: enviar mensaje de bienvenida a Telegram
  try {
    enviarMensajeTelegram_(
      '🎉 *FinanceBot AI activado*\n\n' +
      'Hola\\! Tu bot está configurado y listo\\.\n' +
      'Escribe /ayuda para ver todos los comandos disponibles\\.'
    );
    logInfo_('SETUP', 'Mensaje de bienvenida enviado a Telegram ✅');
  } catch(e) {
    logWarn_('SETUP', 'Telegram no disponible: ' + e.message + ' — verifica TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID');
  }

  logInfo_('SETUP', '');
  logInfo_('SETUP', '✅ SETUP COMPLETO — tu FinanceBot está activo');
  logInfo_('SETUP', 'Próximos pasos:');
  logInfo_('SETUP', '  1) Abre la hoja Configurations y ajusta tus categorías y presupuestos');
  logInfo_('SETUP', '  2) Asegúrate que tu banco envía emails a ' + Session.getEffectiveUser().getEmail());
  logInfo_('SETUP', '  3) Escribe /ayuda en Telegram para explorar el bot');

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

// Detecta el ID del spreadsheet activo o desde la URL del proyecto
function _detectarSpreadsheetId_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getId();
  } catch(e) {
    return '';
  }
}

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
    ['Instrucciones:', 'Llena la columna B con tus valores y ejecuta aplicarSetup()', ''],
    ['DESPUÉS de ejecutar aplicarSetup(), esta hoja se elimina automáticamente.', '', ''],
    ['', '', ''],
    ['Parámetro', 'Tu valor', 'Cómo obtenerlo'],
    ['GEMINI_API_KEY',     '', 'aistudio.google.com → Get API Key → Create API Key'],
    ['SPREADSHEET_ID',     _detectarSpreadsheetId_(), 'Ya detectado automáticamente ✅'],
    ['TELEGRAM_BOT_TOKEN', '', 'Telegram → @BotFather → /newbot → copia el token'],
    ['TELEGRAM_CHAT_ID',   '', 'Escríbele a tu bot → api.telegram.org/bot<TOKEN>/getUpdates → busca "id"'],
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
    logWarn_('SETUP', 'Setup incompleto. Ejecuta crearHojaSetup() y completa los campos faltantes');
  } else {
    logInfo_('SETUP', 'Configuracion completa');
    logInfo_('SETUP', '1) Ejecuta configurarSpreadsheet() para crear las hojas');
    logInfo_('SETUP', '2) Configura triggers: procesarEmailsBancolombia(5m), procesarMensajesTelegram(1m), recordarPagosPendientes(diario 9am)');
  }

  verificarCredenciales();
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

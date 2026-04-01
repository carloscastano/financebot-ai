// ============================================================
// FINANCEBOT AI - CONFIGURACIÓN
// Las claves sensibles se guardan en Script Properties de Apps Script.
// NUNCA escribas credenciales reales en este archivo.
// Ejecuta wizardSetup() para configurar de forma segura.
// ============================================================

const CONFIG = {

  GMAIL_LABEL:             'FinanceBot-Procesado',
  MAX_EMAILS_POR_EJECUCION: 20,
  GEMINI_URL:              'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',

  // Credenciales — se leen desde Script Properties (nunca del código)
  get GEMINI_API_KEY()     { return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');     },
  get SPREADSHEET_ID()     { return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');     },
  get TELEGRAM_BOT_TOKEN() { return PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN'); },
  get TELEGRAM_CHAT_ID()   { return PropertiesService.getScriptProperties().getProperty('TELEGRAM_CHAT_ID');   },
};

// ============================================================
// WIZARD DE CONFIGURACIÓN
// Ejecuta esta función UNA SOLA VEZ para configurar el bot.
// Te pedirá cada credencial mediante un popup — nunca quedan en el código.
// ============================================================
function wizardSetup() {
  const ui    = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();

  ui.alert(
    '🤖 FinanceBot AI — Setup',
    'Bienvenido. Vamos a configurar tus credenciales paso a paso.\n\n' +
    'Necesitarás tener listos:\n' +
    '  1. Tu Gemini API Key (aistudio.google.com)\n' +
    '  2. El ID de este Spreadsheet\n' +
    '  3. Tu Telegram Bot Token (opcional)\n' +
    '  4. Tu Telegram Chat ID (opcional)\n\n' +
    'Presiona OK para comenzar.',
    ui.ButtonSet.OK
  );

  // Paso 1: Gemini API Key
  const geminiKey = _pedirValor(ui,
    '🔑 Paso 1 de 4 — Gemini API Key',
    'Obtén tu API key gratuita en:\nhttps://aistudio.google.com/app/apikey\n\nPega tu API key aquí:',
    props.getProperty('GEMINI_API_KEY') ? '(ya configurada — deja vacío para mantener)' : ''
  );
  if (geminiKey) props.setProperty('GEMINI_API_KEY', geminiKey.trim());

  // Paso 2: Spreadsheet ID
  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  const sheetId  = SpreadsheetApp.getActiveSpreadsheet().getId();
  const respSheet = ui.alert(
    '📊 Paso 2 de 4 — Spreadsheet ID',
    'Tu Spreadsheet ID es:\n\n' + sheetId + '\n\n¿Guardarlo automáticamente?',
    ui.ButtonSet.YES_NO
  );
  if (respSheet === ui.Button.YES) {
    props.setProperty('SPREADSHEET_ID', sheetId);
  }

  // Paso 3: Telegram Bot Token (opcional)
  const telegramToken = _pedirValor(ui,
    '📱 Paso 3 de 4 — Telegram Bot Token (opcional)',
    'Si no tienes Telegram bot, deja vacío y presiona OK.\n\n' +
    'Para crear uno: abre @BotFather en Telegram → /newbot\n\nPega tu token aquí:',
    props.getProperty('TELEGRAM_BOT_TOKEN') ? '(ya configurado — deja vacío para mantener)' : ''
  );
  if (telegramToken) props.setProperty('TELEGRAM_BOT_TOKEN', telegramToken.trim());

  // Paso 4: Telegram Chat ID (opcional)
  const telegramChat = _pedirValor(ui,
    '💬 Paso 4 de 4 — Telegram Chat ID (opcional)',
    'Para obtener tu Chat ID:\n' +
    '1. Escríbele cualquier mensaje a tu bot\n' +
    '2. Abre: https://api.telegram.org/bot<TOKEN>/getUpdates\n' +
    '3. Copia el valor de "chat" → "id"\n\nPega tu Chat ID aquí:',
    props.getProperty('TELEGRAM_CHAT_ID') ? '(ya configurado — deja vacío para mantener)' : ''
  );
  if (telegramChat) props.setProperty('TELEGRAM_CHAT_ID', telegramChat.trim());

  // Resumen final
  verificarCredenciales();
  ui.alert(
    '✅ Configuración completada',
    'Tus credenciales están guardadas de forma segura en Script Properties.\n\n' +
    'Próximos pasos:\n' +
    '1. Ejecuta configurarSpreadsheet() para crear las hojas\n' +
    '2. Configura el trigger: procesarEmailsBancolombia() cada 5 min\n' +
    '3. Configura el trigger: recordarPagosPendientes() diario a las 9am\n' +
    '4. Configura el trigger: procesarMensajesTelegram() cada 1 min',
    ui.ButtonSet.OK
  );
}

function _pedirValor(ui, titulo, mensaje, valorActual) {
  const resp = ui.prompt(titulo, mensaje + (valorActual ? '\n\n' + valorActual : ''), ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return null;
  const val = resp.getResponseText().trim();
  return val && !val.startsWith('(ya') ? val : null;
}

// ============================================================
// VERIFICAR CREDENCIALES
// Muestra el estado de cada credencial sin revelar los valores completos
// ============================================================
function verificarCredenciales() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const keys  = ['GEMINI_API_KEY', 'SPREADSHEET_ID', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];

  Logger.log('=== ESTADO DE CREDENCIALES ===');
  keys.forEach(function(k) {
    const val = props[k];
    if (!val) {
      Logger.log('⚠️  ' + k + ': NO CONFIGURADA');
    } else {
      const preview = val.substring(0, 4) + '****' + val.substring(val.length - 4);
      Logger.log('✅ ' + k + ': ' + preview);
    }
  });
}

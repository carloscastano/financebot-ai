// ============================================================
// FINANCEBOT AI - SKILL FINANCIERO OBJETIVO
// Base alineada con .claude/commands/finanzas.md
// ============================================================

// ------------------------------------------------------------
// TRACKER DE CUOTA GEMINI (auto-conteo diario en ScriptProperties)
// Límite configurable: ajusta GEMINI_RPD_LIMITE según tu cuenta.
// ------------------------------------------------------------
var GEMINI_RPD_LIMITE = 1000;

function _trackGeminiCall_() {
  var props = PropertiesService.getScriptProperties();
  var hoy   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var fecha = props.getProperty('GEMINI_QUOTA_FECHA') || '';
  var count = fecha === hoy ? parseInt(props.getProperty('GEMINI_QUOTA_COUNT') || '0', 10) : 0;
  count++;
  props.setProperties({ 'GEMINI_QUOTA_FECHA': hoy, 'GEMINI_QUOTA_COUNT': String(count) });
  return count;
}

function consultarCuotaGemini() {
  var props   = PropertiesService.getScriptProperties();
  var hoy     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var fecha   = props.getProperty('GEMINI_QUOTA_FECHA') || '';
  var usados  = fecha === hoy ? parseInt(props.getProperty('GEMINI_QUOTA_COUNT') || '0', 10) : 0;
  var restantes = Math.max(0, GEMINI_RPD_LIMITE - usados);
  return { usados: usados, limite: GEMINI_RPD_LIMITE, restantes: restantes,
           pct: Math.round(usados / GEMINI_RPD_LIMITE * 100) + '%' };
}

function construirSkillFinancieroObjetivo_(opts) {
  var nombreUsuario = (opts && opts.nombreUsuario) ? opts.nombreUsuario : 'el usuario';
  var fechaIso = (opts && opts.fechaIso) ? opts.fechaIso : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  return (
    'Rol: Eres un asistente experto en finanzas personales para Colombia, objetivo y prudente para ' + nombreUsuario + '.\n' +
    'Objetivo: responder con claridad, sin inventar datos, y con acciones concretas.\n' +
    '\n' +
    'Reglas de calidad (obligatorias):\n' +
    '1) Usa primero los datos del contexto. Si falta informacion, dilo claramente.\n' +
    '2) No inventes montos, fechas, categorias ni movimientos.\n' +
    '3) Distingue hechos de interpretaciones (ejemplo: "segun estos datos").\n' +
    '4) Da recomendaciones accionables, concretas y de bajo riesgo para los proximos 7-30 dias.\n' +
    '5) Si hay riesgo (balance negativo, sobrepresupuesto, gasto acelerado), prioriza liquidez y contencion de gasto.\n' +
    '6) Evita sesgo comercial: no promuevas bancos, brokers, criptos ni productos especificos.\n' +
    '7) Si preguntan de inversion, educa con opciones generales y riesgos; no des ordenes de compra/venta ni promesas de rentabilidad.\n' +
    '8) Si la consulta es legal/tributaria/credito complejo, sugiere validarlo con un profesional.\n' +
    '\n' +
    'Marco financiero Colombia:\n' +
    '- Regla 50/30/20 como guia inicial, ajustable al caso real.\n' +
    '- Fondo de emergencia objetivo: 3-6 meses de gastos esenciales.\n' +
    '- Tasa de ahorro saludable: referencia 10-20% del ingreso.\n' +
    '- Considera inflacion, tasas y TRM vigentes al decidir.\n' +
    '- Bolsillos/alcancias separan dinero, pero no garantizan rentabilidad real.\n' +
    '\n' +
    'Formato de respuesta:\n' +
    '- Espanol claro para Colombia, directo y sin lenguaje corporativo.\n' +
    '- Respuesta breve por defecto (maximo 5 lineas); amplia solo si la pregunta es compleja.\n' +
    '- Sin markdown ni relleno.\n' +
    '- Incluye al menos 1 accion concreta al final.\n' +
    '\n' +
    'Fecha de referencia: ' + fechaIso + '.'
  );
}

function construirPromptChatFinanciero_(pregunta, contexto) {
  var fechaIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var skill = construirSkillFinancieroObjetivo_({ nombreUsuario: 'Carlos', fechaIso: fechaIso });

  return (
    skill + '\n\n' +
    'Contexto financiero real disponible:\n' + contexto + '\n\n' +
    'Pregunta del usuario:\n' + pregunta + '\n\n' +
    'Responde usando unicamente este contexto y las reglas anteriores.'
  );
}

function construirPromptAnalisisMensual_(resumenMensual, nombreUsuario) {
  var fechaIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var skill = construirSkillFinancieroObjetivo_({ nombreUsuario: nombreUsuario || 'Carlos', fechaIso: fechaIso });

  return (
    skill + '\n\n' +
    'Contexto financiero mensual:\n' + resumenMensual + '\n\n' +
    'Tarea:\n' +
    '- Entrega un analisis mensual honesto y concreto.\n' +
    '- Maximo 3 oraciones cortas.\n' +
    '- Si faltan datos, dilo.\n' +
    '- Cierra con 1 accion concreta para el proximo mes.'
  );
}

function construirPromptInsightSemanal_(resumenSemanal, nombreUsuario) {
  var fechaIso = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var skill = construirSkillFinancieroObjetivo_({ nombreUsuario: nombreUsuario || 'Carlos', fechaIso: fechaIso });

  return (
    skill + '\n\n' +
    'Contexto financiero semanal:\n' + resumenSemanal + '\n\n' +
    'Tarea:\n' +
    '- Entrega 1 sola oracion corta, directa y util.\n' +
    '- Sin saludo, sin markdown.\n' +
    '- Debe incluir una recomendacion accionable.'
  );
}

// ------------------------------------------------------------
// HELPER GEMINI — respuestas JSON (parsear transacción, clasificar extracto)
// Incluye retry automático en 429. Lanza Error si falla.
// El caller hace el post-proceso del objeto/array retornado.
// ------------------------------------------------------------
function _llamarGeminiJson_(prompt, opts) {
  opts = opts || {};
  var payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:      opts.temperature     !== undefined ? opts.temperature     : 0.1,
      maxOutputTokens:  opts.maxOutputTokens !== undefined ? opts.maxOutputTokens : 512,
      responseMimeType: 'application/json'
    }
  });
  var fetchOpts = { method: 'post', contentType: 'application/json', payload: payload, muteHttpExceptions: true };
  var url = CONFIG.GEMINI_URL + '?key=' + CONFIG.GEMINI_API_KEY;

  // Retry exponencial: 1s, 2s, 4s para 5xx ; 65s una vez para 429-rate-limit ; abort para 429-cuota
  var MAX_INTENTOS_TRANSIENT = 3;
  var resp, httpCode, rawBody;
  var intento = 0;

  while (true) {
    resp     = UrlFetchApp.fetch(url, fetchOpts);
    httpCode = resp.getResponseCode();
    rawBody  = resp.getContentText();

    if (httpCode === 200) {
      _trackGeminiCall_();
      break;
    }

    // 429 → distinguir cuota DIARIA (abort) vs rate-limit POR MINUTO (esperar 65s una vez)
    if (httpCode === 429) {
      var esCuotaDiaria = rawBody.indexOf('current quota') !== -1 ||
                          rawBody.indexOf('quota exceeded') !== -1 ||
                          rawBody.indexOf('billing') !== -1 ||
                          rawBody.indexOf('PerDay') !== -1;
      if (esCuotaDiaria) {
        logError_('GEMINI_JSON', 'cuota diaria agotada — no se reintenta');
        throw new Error('GEMINI_QUOTA_DIARIA: cuota diaria agotada. Reintenta mañana.');
      }
      if (intento === 0) {
        logWarn_('GEMINI_JSON', '429 rate-limit por minuto, esperando 65s');
        Utilities.sleep(65000);
        intento++;
        continue;
      }
      throw new Error('Gemini 429 persistente tras reintento: ' + rawBody.substring(0, 200));
    }

    // 5xx → backoff exponencial (1s, 2s, 4s)
    if (httpCode >= 500 && httpCode < 600 && intento < MAX_INTENTOS_TRANSIENT) {
      var espera = Math.pow(2, intento) * 1000;
      logWarn_('GEMINI_JSON', httpCode + ' transient, intento ' + (intento+1) + '/' + MAX_INTENTOS_TRANSIENT + ' tras ' + espera + 'ms');
      Utilities.sleep(espera);
      intento++;
      continue;
    }

    // 4xx (no 429) o 5xx tras agotar reintentos → abortar
    throw new Error('Gemini HTTP ' + httpCode + ': ' + rawBody.substring(0, 300));
  }

  var json;
  try { json = JSON.parse(rawBody); } catch(e) {
    throw new Error('Gemini resp no es JSON válido: ' + rawBody.substring(0, 200));
  }
  if (!json.candidates || !json.candidates[0]) {
    throw new Error('Gemini sin candidates: ' + JSON.stringify(json).substring(0, 300));
  }
  if (!json.candidates[0].content) {
    var finish = json.candidates[0].finishReason || 'unknown';
    throw new Error('Gemini content vacío, finishReason: ' + finish);
  }

  var text = json.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('');
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  logInfo_('GEMINI_JSON', 'respuesta parseable (primeros 300): ' + text.substring(0, 300));

  try { return JSON.parse(text); } catch(e) {
    throw new Error('Gemini JSON parse error: ' + e.message + ' | ' + text.substring(0, 200));
  }
}

// ------------------------------------------------------------
// HELPER GEMINI — respuestas de texto (chat, análisis, insights)
// Retorna el texto limpio o null si falla/rate-limit.
// ------------------------------------------------------------
function _llamarGeminiTexto_(prompt, opts) {
  opts = opts || {};
  var payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature:     opts.temperature     !== undefined ? opts.temperature     : 0.4,
      maxOutputTokens: opts.maxOutputTokens !== undefined ? opts.maxOutputTokens : 512
    }
  };
  try {
    var resp = UrlFetchApp.fetch(CONFIG.GEMINI_URL + '?key=' + CONFIG.GEMINI_API_KEY, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code === 429) { logWarn_('GEMINI_TEXT', '429 rate-limit'); return null; }
    if (code !== 200) { logWarn_('GEMINI_TEXT', 'HTTP ' + code); return null; }
    _trackGeminiCall_();
    var json = JSON.parse(resp.getContentText());
    if (!json.candidates || !json.candidates[0] || !json.candidates[0].content) return null;
    return json.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('').trim();
  } catch(e) {
    logError_('GEMINI_TEXT', 'excepcion en llamada', e);
    return null;
  }
}

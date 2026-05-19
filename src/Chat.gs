// ============================================================
// FINANCEBOT AI - CHAT CONVERSACIONAL (#16)
// Detecta si el mensaje es una pregunta financiera y responde
// con datos reales de Transactions, Budgets y Goals.
//
// Flujo en Telegram.gs:
//   if (_esPreguntaFinanciera_(msg.text)) → responderChat_(msg.text)
//   else → parsearTransaccionManual_(msg.text)  (flujo actual)
// ============================================================

// ------------------------------------------------------------
// DETECTAR SI UN MENSAJE ES UNA PREGUNTA (no una transacción)
// ------------------------------------------------------------
function _esPreguntaFinanciera_(texto) {
  if (!texto) return false;
  var t = texto.toLowerCase().trim();

  // 1) Signo de pregunta -> es pregunta
  if (t.indexOf('?') >= 0) return true;

  // 2) Inicios conversacionales / interrogativos
  var inicios = [
    'cuánto','cuanto','cómo','como','cuál','cual','qué','que ',
    'dime','muéstrame','muestrame','resumen','analiza','análisis','analisis',
    'explícame','explicame','puedo','quiero saber','quiero ver',
    'qué tal','que tal','cómo voy','como voy','cómo estoy','como estoy',
    'en qué','en que','cuándo','cuando','por qué','por que','hay algo','se puede',
    'recomiéndame','recomiendame','ayúdame','ayudame','dame un','dame una',
    'dónde','donde','cuántas','cuantas','cuántos','cuantos',
    'saldo','balance','situación','situacion','estado actual','informe',
    'reporte','consejo','consejos','suger','tip ','tips',
    // conversacionales sin signo
    'pero','es que','fíjate','fijate','mira ','escucha','oye','hey',
    'no me','no entiendo','no sé','no se ','porque ','sabes','crees',
    'me puedes','podrías','podrias','quisiera','necesito que','ayúdame','ayudame'
  ];

  for (var i = 0; i < inicios.length; i++) {
    var pos = t.indexOf(inicios[i]);
    if (pos >= 0 && pos <= 5) {
      if (!_pareceTrransaccion_(t)) return true;
    }
  }

  // 3) Heuristica de longitud + conjunciones -> es conversacion
  // Una transaccion suele ser corta y directa. Si es larga y tiene conjunciones
  // o muchas comas, probablemente esta describiendo algo, no registrando.
  if (t.length > 60) {
    var conjConv = [', por ejemplo',', es más',', es mas',', porque ',', y si',
                    ', pero ',', sin embargo',', además',', ademas',
                    ' es que ',' o sea ',' osea '];
    for (var j = 0; j < conjConv.length; j++) {
      if (t.indexOf(conjConv[j]) >= 0) return true;
    }
    // 3+ comas en mensajes largos = conversacional
    var comas = (t.match(/,/g) || []).length;
    if (comas >= 3 && !_pareceTrransaccion_(t)) return true;
  }

  return false;
}

// Heurística: si tiene verbo de gasto/ingreso EN ACCION + número -> probable transacción
// Importante: 'tengo', 'llega', 'me dan' NO son verbos de transaccion (son hipoteticos/futuros)
function _pareceTrransaccion_(t) {
  var verbos = ['gasté','gaste','pagué','pague','compré','compre',
                'ingresé','ingrese','recibí','recibi','me llegó','me llego',
                'transferí','transferi','consigné','consigne','saqué','saque',
                'cobré','cobre','vendí','vendi','presté','preste',
                'me cobraron','me pagaron','acabo de'];
  for (var i = 0; i < verbos.length; i++) {
    if (t.indexOf(verbos[i]) >= 0) return true;
  }
  // Número con $ explicito o número grande SUELTO al inicio
  if (/^\s*\$?\s*\d{3,}/.test(t)) return true;
  // Numero >= 4 digitos PERO sin contexto conversacional largo
  // (mensajes cortos con cifras grandes = probable tx)
  return t.length < 50 && /\b\d{4,}\b/.test(t);
}

// ------------------------------------------------------------
// CONSTRUIR CONTEXTO FINANCIERO (snapshot del mes actual)
// ------------------------------------------------------------
function _contextoFinanciero_() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.TRANSACTIONS);
  var cfg   = leerConfiguracion_();
  var fmt   = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
  var hoy   = new Date();

  var ctx = '';

  // ── Transacciones del mes actual ──
  if (sheet && sheet.getLastRow() > 1) {
    var datos     = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    var inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    var txnMes  = [];
    var txnMes2 = []; // mes anterior
    var mesPrev = hoy.getMonth() === 0 ? 11 : hoy.getMonth() - 1;
    var anioPrev = hoy.getMonth() === 0 ? hoy.getFullYear() - 1 : hoy.getFullYear();

    datos.forEach(function(row) {
      var f = row[1];
      if (!f) return;
      var d = f instanceof Date ? f : new Date(f);
      if (isNaN(d.getTime())) return;
      var tipo = String(row[3]).toLowerCase();
      if (tipo === 'informativo') return;
      if (d >= inicioMes && d <= hoy) txnMes.push(row);
      if (d.getMonth() === mesPrev && d.getFullYear() === anioPrev) txnMes2.push(row);
    });

    // calcularMetricas_ está en Advisor.gs (scope global)
    var act  = calcularMetricas_(txnMes);
    var prev = calcularMetricas_(txnMes2);

    var mesesNombre = ['enero','febrero','marzo','abril','mayo','junio',
                       'julio','agosto','septiembre','octubre','noviembre','diciembre'];

    ctx += '## Finanzas de ' + mesesNombre[hoy.getMonth()] + ' (día ' + hoy.getDate() + ')\n';
    ctx += '- Egresos: ' + fmt(act.egresos) + ' | Ingresos: ' + fmt(act.ingresos) + '\n';
    ctx += '- Balance: ' + fmt(act.balance) + ' | Tasa ahorro: ' + act.tasaAhorro.toFixed(0) + '%\n';

    if (act.topCats.length > 0) {
      ctx += '- Top categorías: ';
      ctx += act.topCats.map(function(c) { return c[0] + ' ' + fmt(c[1]); }).join(', ') + '\n';
    }

    if (prev.egresos > 0) {
      var varPct = ((act.egresos - prev.egresos) / prev.egresos * 100);
      ctx += '- Vs mes anterior: ' + (varPct >= 0 ? '+' : '') + varPct.toFixed(0) + '% en egresos\n';
    }

    // Desglose completo de categorías del mes
    if (Object.keys(act.cats).length > 0) {
      ctx += '\n## Gasto por categoría este mes\n';
      Object.keys(act.cats).sort(function(a, b) { return act.cats[b] - act.cats[a]; }).forEach(function(cat) {
        ctx += '- ' + cat + ': ' + fmt(act.cats[cat]) + '\n';
      });
    }
  }

  // ── Presupuestos ──
  var presupuestos = cfg.presupuestos || {};
  if (Object.keys(presupuestos).length > 0 && sheet && sheet.getLastRow() > 1) {
    ctx += '\n## Presupuestos del mes\n';
    var gastosMes = {};
    var inicioMes2 = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    var datos2 = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
    datos2.forEach(function(row) {
      var f = row[1];
      if (!f) return;
      var d = f instanceof Date ? f : new Date(f);
      if (isNaN(d.getTime()) || d < inicioMes2) return;
      if (String(row[3]).toLowerCase() !== 'egreso') return;
      var cat = String(row[9]).trim();
      gastosMes[cat] = (gastosMes[cat] || 0) + (Number(row[5]) || 0);
    });
    Object.keys(presupuestos).forEach(function(cat) {
      var gastado = gastosMes[cat] || 0;
      var pct = Math.round(gastado / presupuestos[cat] * 100);
      ctx += '- ' + cat + ': ' + fmt(gastado) + ' / ' + fmt(presupuestos[cat]) + ' (' + pct + '%)\n';
    });
  }

  // ── Metas de ahorro ──
  var goalsSheet = ss.getSheetByName(SHEETS.GOALS);
  if (goalsSheet && goalsSheet.getLastRow() > 1) {
    var goals = goalsSheet.getRange(2, 1, goalsSheet.getLastRow() - 1, 7).getValues();
    var activas = goals.filter(function(r) { return String(r[5]).toLowerCase() === 'activo'; });
    if (activas.length > 0) {
      ctx += '\n## Metas de ahorro activas\n';
      activas.forEach(function(r) {
        var pct = r[2] > 0 ? Math.round(r[4] / r[2] * 100) : 0;
        ctx += '- ' + r[1] + ': ' + fmt(r[4]) + ' / ' + fmt(r[2]) + ' (' + pct + '%)';
        if (r[3]) ctx += ' · límite ' + String(r[3]).substring(0, 10);
        ctx += '\n';
      });
    }
  }

  // ── Config relevante ──
  ctx += '\n## Configuración\n';
  ctx += '- Presupuesto mensual global: ' + fmt(cfg.presupuestoMensual) + '\n';
  ctx += '- Meta ahorro mensual: ' + fmt(cfg.metaAhorro) + '\n';
  ctx += '- Fecha: ' + hoy.toISOString().substring(0, 10) + '\n';

  return ctx;
}

// ------------------------------------------------------------
// RESPONDER PREGUNTA FINANCIERA CON GEMINI + DATOS REALES
// ------------------------------------------------------------
function responderChat_(pregunta) {
  if (!isFeatureEnabled_('chat_financiero')) {
    return '⏸️ El chat financiero está desactivado. Actívalo con `/activar Chat Financiero`.';
  }

  var contexto = _contextoFinanciero_();

  var prompt = construirPromptChatFinanciero_(pregunta, contexto);

  // Más temperatura = respuesta más natural / variada
  var texto = _llamarGeminiTexto_(prompt, { temperature: 0.65, maxOutputTokens: 350 });
  if (texto === null) return '❌ No pude consultar el asistente ahora. Intenta de nuevo.';
  // No escapar para MarkdownV2 — el bot usa Markdown V1; texto plano sin asteriscos basta
  var limpio = texto.replace(/\*\*/g, '').replace(/\*/g, '').trim();
  return '🤖 ' + limpio;
}

function run_testChat() {
  var res = responderChat_('¿cuánto he gastado en alimentación este mes y cómo voy con ese presupuesto?');
  enviarMensajeTelegram_(res);
  return res;
}

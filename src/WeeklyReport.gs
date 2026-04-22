// ============================================================
// FINANCEBOT AI - REPORTE SEMANAL (#18)
// Envía cada lunes un pulso financiero conciso de la semana anterior.
//
// Activador: run_reporteSemanal() → Temporizador semanal, lunes, 7am-8am
// ============================================================

function reporteSemanal() {
  if (!isFeatureEnabled_('reporte_semanal')) { logInfo_('WEEKLY', 'reporte_semanal desactivado'); return; }
  enviarMensajeTelegram_(construirMensajeReporteSemanal_());
}

function run_reporteSemanal() {
  reporteSemanal();
  return 'OK';
}

// ------------------------------------------------------------
// CONSTRUYE EL MENSAJE SEMANAL (máx 7 líneas)
// ------------------------------------------------------------
function construirMensajeReporteSemanal_() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet || sheet.getLastRow() < 2) return '📊 Sin transacciones esta semana.';

  var datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var hoy   = new Date();

  // Ventanas de tiempo
  var hace7   = new Date(hoy.getTime() -  7 * 24 * 3600000);
  var hace14  = new Date(hoy.getTime() - 14 * 24 * 3600000);
  var inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  var semActual = [];
  var semPrev   = [];
  var txnMes    = [];

  datos.forEach(function(row) {
    var fechaVal = row[1];
    if (!fechaVal) return;
    var d = fechaVal instanceof Date ? fechaVal : new Date(fechaVal);
    if (isNaN(d.getTime())) return;
    var tipo = String(row[3]).toLowerCase();
    if (tipo === 'informativo') return;

    if (d >= hace7  && d <= hoy)   semActual.push(row);
    if (d >= hace14 && d < hace7)  semPrev.push(row);
    if (d >= inicioMes && d <= hoy) txnMes.push(row);
  });

  // calcularMetricas_ está definida en Advisor.gs (scope global GAS)
  var act  = calcularMetricas_(semActual);
  var prev = calcularMetricas_(semPrev);
  var mes  = calcularMetricas_(txnMes);

  var fmt  = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
  var fmtK = function(n) {
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1).replace('.0', '') + 'M';
    if (n >= 1000)    return '$' + Math.round(n / 1000) + 'K';
    return fmt(n);
  };

  // Variación vs semana anterior
  var variacion = '';
  if (prev.egresos > 0) {
    var pct    = ((act.egresos - prev.egresos) / prev.egresos * 100);
    var signo  = pct >= 0 ? '+' : '';
    var emoji  = pct > 10 ? '📈' : pct < -10 ? '📉' : '➡️';
    variacion  = ' · ' + emoji + ' ' + signo + Math.round(pct) + '% vs sem. ant.';
  }

  // Rango de la semana (7 días atrás → hoy)
  var mesesCortos = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  var diaInicio   = new Date(hoy.getTime() - 6 * 24 * 3600000);
  var rangoSem    = diaInicio.getDate() + '–' + hoy.getDate() + ' ' + mesesCortos[hoy.getMonth()];

  // Top 3 categorías — formato compacto
  var topStr = act.topCats.length > 0
    ? act.topCats.map(function(c) { return mdEscape_(c[0].split(' ')[0]) + ' ' + fmtK(c[1]); }).join(' · ')
    : 'Sin egresos';

  // Insight de Gemini (1 oración)
  var insight = _geminiInsightSemanal_(act);

  // Construir mensaje
  var msg = '📊 *Semana ' + rangoSem + '*\n\n';

  if (act.egresos > 0) {
    msg += '💸 Gastaste *' + fmt(act.egresos) + '*' + variacion + '\n';
    msg += '🏆 ' + topStr + '\n';
  } else {
    msg += '✅ No registraste egresos esta semana\n';
  }

  msg += '📈 Llevas *' + fmt(mes.egresos) + '* este mes';
  if (mes.ingresos > 0) msg += ' · ingresaste *' + fmt(mes.ingresos) + '*';
  msg += '\n';

  if (insight) msg += '\n💡 ' + mdEscape_(insight);

  return msg;
}

// ------------------------------------------------------------
// GEMINI — 1 oración de consejo basada en el gasto semanal
// ------------------------------------------------------------
function _geminiInsightSemanal_(act) {
  try {
    if (act.egresos === 0) return '';
    var topResumen = act.topCats.length > 0
      ? act.topCats.map(function(c) { return c[0] + ' $' + Math.round(c[1]).toLocaleString('es-CO'); }).join(', ')
      : 'sin categorías';

    var resumenSemanal =
      'Gasto total semanal: $' + Math.round(act.egresos).toLocaleString('es-CO') + '. ' +
      'Top categorias: ' + topResumen + '.';
    var prompt = construirPromptInsightSemanal_(resumenSemanal, 'Carlos');

    var texto = _llamarGeminiTexto_(prompt, { temperature: 0.4, maxOutputTokens: 80 });
    if (!texto) return '';
    return texto.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\n/g, ' ');
  } catch(e) {
    logError_('WEEKLY', '_geminiInsightSemanal_', e);
    return '';
  }
}

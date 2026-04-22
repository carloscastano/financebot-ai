// ============================================================
// FINANCEBOT-IA — DETECCIÓN DE TRANSACCIONES ATÍPICAS
// Compara cada egreso con la media+desvest histórica de su categoría.
// Si supera el umbral → alerta Telegram.
// Trigger sugerido: diario 8:30am, run_detectarAnomalias()
// ============================================================

var ANOMALY_VENTANA_MESES_      = 6;     // Histórico para calcular baseline
var ANOMALY_UMBRAL_DESVIACIONES_ = 3;    // |x - media| > 3*sigma → atípica
var ANOMALY_MIN_MUESTRAS_       = 8;     // Minimo de txns por categoria
var ANOMALY_MONTO_MINIMO_       = 50000; // Ignora gastos pequenos
var ANOMALY_DEDUP_PROP_         = 'ANOMALY_ALERTAS_NOTIFICADAS';
var ANOMALY_DEDUP_TTL_HORAS_    = 72;

function _leerAnomaliaDedup_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(ANOMALY_DEDUP_PROP_);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}
function _guardarAnomaliaDedup_(d) {
  PropertiesService.getScriptProperties().setProperty(ANOMALY_DEDUP_PROP_, JSON.stringify(d));
}
function _yaNotificada_(id) {
  var d = _leerAnomaliaDedup_();
  var ahora = Date.now();
  // Limpieza
  Object.keys(d).forEach(function(k) {
    if ((ahora - d[k]) / (1000 * 60 * 60) > ANOMALY_DEDUP_TTL_HORAS_) delete d[k];
  });
  if (d[id]) { _guardarAnomaliaDedup_(d); return true; }
  d[id] = ahora;
  _guardarAnomaliaDedup_(d);
  return false;
}

function detectarAnomalias_() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sh || sh.getLastRow() < 2) return [];

  var datos = sh.getRange(2, 1, sh.getLastRow() - 1, 18).getValues();
  var hoy = new Date();
  var ventanaMs = ANOMALY_VENTANA_MESES_ * 30 * 24 * 60 * 60 * 1000;
  var inicioVentana = hoy.getTime() - ventanaMs;
  var inicioRecientes = hoy.getTime() - (3 * 24 * 60 * 60 * 1000); // últimas 72h

  // Agrupar montos por categoría dentro de la ventana
  var porCategoria = {};
  var recientes = [];
  datos.forEach(function(row) {
    var fecha = row[1] instanceof Date ? row[1] : new Date(row[1]);
    if (isNaN(fecha)) return;
    var tipo  = String(row[3] || '').toLowerCase();
    var monto = Number(row[5]) || 0;
    var cat   = String(row[9] || '').trim();
    if (tipo !== 'egreso' || monto < ANOMALY_MONTO_MINIMO_ || !cat) return;

    var t = fecha.getTime();
    if (t >= inicioVentana) {
      if (!porCategoria[cat]) porCategoria[cat] = [];
      porCategoria[cat].push(monto);
    }
    if (t >= inicioRecientes) {
      recientes.push({ id: row[0], fecha: fecha, monto: monto, comercio: row[7], categoria: cat });
    }
  });

  // Calcular baseline por categoría
  var baseline = {};
  Object.keys(porCategoria).forEach(function(cat) {
    var arr = porCategoria[cat];
    if (arr.length < ANOMALY_MIN_MUESTRAS_) return;
    var n = arr.length;
    var sum = arr.reduce(function(a, b) { return a + b; }, 0);
    var mean = sum / n;
    var varSum = arr.reduce(function(a, b) { return a + (b - mean) * (b - mean); }, 0);
    var sigma = Math.sqrt(varSum / n);
    baseline[cat] = { mean: mean, sigma: sigma, n: n };
  });

  // Detectar atípicas
  var atipicas = [];
  recientes.forEach(function(t) {
    var b = baseline[t.categoria];
    if (!b || b.sigma === 0) return;
    var z = (t.monto - b.mean) / b.sigma;
    if (z >= ANOMALY_UMBRAL_DESVIACIONES_) {
      atipicas.push({
        id: t.id, fecha: t.fecha, monto: t.monto,
        comercio: t.comercio, categoria: t.categoria,
        media: Math.round(b.mean), desviaciones: Math.round(z * 10) / 10,
        muestras: b.n
      });
    }
  });
  return atipicas;
}

function run_detectarAnomalias() {
  var atipicas = detectarAnomalias_();
  if (!atipicas.length) {
    logInfo_('ANOMALY', 'sin transacciones atipicas');
    return { ok: true, encontradas: 0 };
  }
  var notificadas = 0;
  atipicas.forEach(function(a) {
    if (_yaNotificada_(a.id)) return;
    var fechaStr = Utilities.formatDate(a.fecha, Session.getScriptTimeZone(), 'dd/MM');
    var msg =
      '🔔 *Gasto atípico*\n' +
      a.categoria + ' — ' + (a.comercio || 'sin comercio') + '\n' +
      '$' + a.monto.toLocaleString('es-CO') + ' el ' + fechaStr + '\n' +
      'Promedio histórico: $' + a.media.toLocaleString('es-CO') + ' (' + a.desviaciones + 'σ sobre la media en ' + a.muestras + ' muestras)';
    try {
      enviarMensajeTelegram_(msg);
      notificadas++;
    } catch(e) { logWarn_('ANOMALY', 'envio fallo: ' + _safeErrMsg_(e)); }
  });
  logInfo_('ANOMALY', 'detectadas=' + atipicas.length + ' notificadas=' + notificadas);
  return { ok: true, encontradas: atipicas.length, notificadas: notificadas };
}

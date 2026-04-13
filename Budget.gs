// ============================================================
// FINANCEBOT AI - ALERTAS DE PRESUPUESTO (#17)
//
// Configura presupuestos en la hoja "Configurations":
//   Presupuesto Alimentación  | 400000
//   Presupuesto Transporte    | 300000
//   (una fila por categoría)
//
// Alertas en tiempo real: verificarAlertaPresupuesto_(txn)
//   → llamado desde escribirTransaccion_() en Sheets.gs
//   → solo para fuente 'telegram' o 'email' (no batch imports)
//
// Revisión mensual: run_verificarPresupuestoMensual()
//   → Activador: Temporizador diario, 8am-9am (actúa el día 25)
//
// Comando Telegram: /presupuesto → estado actual
// ============================================================

// ------------------------------------------------------------
// ALERTA EN TIEMPO REAL
// Llamado desde escribirTransaccion_() después del appendRow.
// Anti-spam: 1 alerta por nivel (80% / 100%) por categoría por mes.
// ------------------------------------------------------------
function verificarAlertaPresupuesto_(txn) {
  if (!isFeatureEnabled_('alerta_presupuesto')) return;
  if (!txn || String(txn.tipo).toLowerCase() !== 'egreso') return;

  var cfg          = leerConfiguracion_();
  var presupuestos = cfg.presupuestos || {};
  var cat          = String(txn.categoria || '').trim();

  if (!cat || !presupuestos[cat] || presupuestos[cat] <= 0) return;

  var presupuesto = presupuestos[cat];
  var umbral      = cfg.alertaPresupuestoPct || 0.8;

  // Sumar egresos de esta categoría en el mes actual
  var ss       = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet    = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet || sheet.getLastRow() < 2) return;

  var hoy       = new Date();
  var inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  var datos     = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();

  var totalMes = 0;
  datos.forEach(function(row) {
    var fechaVal = row[1];
    if (!fechaVal) return;
    var d = fechaVal instanceof Date ? fechaVal : new Date(fechaVal);
    if (isNaN(d.getTime()) || d < inicioMes) return;
    if (String(row[3]).toLowerCase() !== 'egreso') return;
    if (String(row[9]).trim() === cat) totalMes += Number(row[5]) || 0;
  });

  var pct = totalMes / presupuesto;
  if (pct < umbral) return;

  // Anti-spam: alertar solo 1 vez por nivel por mes
  var props    = PropertiesService.getScriptProperties();
  var mesKey   = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  var alertKey = 'BUDGET_' + cat.replace(/\s+/g, '_') + '_' + mesKey;
  var nivel    = pct >= 1.0 ? 100 : 80;
  var guardado = Number(props.getProperty(alertKey) || 0);
  if (guardado >= nivel) return;
  props.setProperty(alertKey, String(nivel));

  var fmt   = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
  var resta = Math.max(0, presupuesto - totalMes);
  var msg;

  if (pct >= 1.0) {
    msg = '🚨 *Presupuesto ' + mdEscape_(cat) + ' superado*\n' +
          fmt(totalMes) + ' / ' + fmt(presupuesto) + ' (' + Math.round(pct * 100) + '%)\n' +
          '+' + fmt(totalMes - presupuesto) + ' sobre el límite este mes';
  } else {
    msg = '⚠️ *Presupuesto ' + mdEscape_(cat) + '* — ' + Math.round(pct * 100) + '%\n' +
          fmt(totalMes) + ' / ' + fmt(presupuesto) + '\n' +
          'Te quedan ' + fmt(resta) + ' para el resto del mes';
  }

  enviarMensajeTelegram_(msg);
}

// ------------------------------------------------------------
// REVISIÓN CONSOLIDADA — DÍA 25 DE CADA MES
// ------------------------------------------------------------
function verificarPresupuestoMensual_() {
  if (!isFeatureEnabled_('revision_dia25')) { logInfo_('BUDGET', 'revision_dia25 desactivado'); return; }
  var hoy = new Date();
  if (hoy.getDate() !== 25) return; // Solo actúa el día 25
  var msg = construirMensajePresupuesto_();
  if (!msg) return;
  enviarMensajeTelegram_(msg);
}

function run_verificarPresupuestoMensual() {
  verificarPresupuestoMensual_();
  return 'OK';
}

// ------------------------------------------------------------
// ESTADO DE PRESUPUESTOS (comando /presupuesto + día 25)
// ------------------------------------------------------------
function construirMensajePresupuesto_() {
  var cfg          = leerConfiguracion_();
  var presupuestos = cfg.presupuestos || {};

  if (Object.keys(presupuestos).length === 0) {
    return (
      '📋 *Presupuestos por Categoría*\n\n' +
      'No tienes presupuestos configurados.\n\n' +
      'En la hoja *Configurations* agrega:\n' +
      '`Presupuesto Alimentación | 400000`\n' +
      '`Presupuesto Transporte | 300000`\n' +
      '_Una fila por categoría que quieras controlar_'
    );
  }

  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet || sheet.getLastRow() < 2) {
    return '📋 Sin transacciones este mes para comparar.';
  }

  var hoy       = new Date();
  var inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  var datos     = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();

  // Sumar egresos por categoría en el mes actual
  var gastosMes = {};
  datos.forEach(function(row) {
    var fechaVal = row[1];
    if (!fechaVal) return;
    var d = fechaVal instanceof Date ? fechaVal : new Date(fechaVal);
    if (isNaN(d.getTime()) || d < inicioMes) return;
    if (String(row[3]).toLowerCase() !== 'egreso') return;
    var cat = String(row[9]).trim() || 'Otro';
    gastosMes[cat] = (gastosMes[cat] || 0) + (Number(row[5]) || 0);
  });

  var fmt  = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
  var barra = function(pct) {
    var llenos = Math.round(Math.min(pct, 100) / 10);
    return '█'.repeat(llenos) + '░'.repeat(10 - llenos);
  };

  var mesesNombre = ['enero','febrero','marzo','abril','mayo','junio',
                     'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var diasMes    = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  var diasPasados = hoy.getDate();
  var diasRestan  = diasMes - diasPasados;

  // Ordenar: primero las excedidas, luego por % desc
  var cats = Object.keys(presupuestos).map(function(cat) {
    var gastado = gastosMes[cat] || 0;
    var pct     = presupuestos[cat] > 0 ? gastado / presupuestos[cat] : 0;
    return { cat: cat, gastado: gastado, presupuesto: presupuestos[cat], pct: pct };
  }).sort(function(a, b) { return b.pct - a.pct; });

  var lineas = cats.map(function(item) {
    var pctRound = Math.round(item.pct * 100);
    var icono = item.pct >= 1.0 ? '🚨' : item.pct >= 0.8 ? '⚠️' : item.pct >= 0.5 ? '🟡' : '✅';
    return (
      icono + ' *' + mdEscape_(item.cat) + '* — ' + pctRound + '%\n' +
      '   ' + barra(item.pct * 100) + '\n' +
      '   ' + fmt(item.gastado) + ' / ' + fmt(item.presupuesto)
    );
  });

  return (
    '📋 *Presupuestos — ' + mesesNombre[hoy.getMonth()] + '*\n' +
    '_Día ' + diasPasados + ' de ' + diasMes + ' · faltan ' + diasRestan + ' días_\n\n' +
    lineas.join('\n\n')
  );
}

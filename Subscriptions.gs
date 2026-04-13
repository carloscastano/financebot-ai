// ============================================================
// FINANCEBOT AI - DETECTOR DE SUSCRIPCIONES FANTASMA
// Analiza Transactions buscando cargos recurrentes por comercio.
// Frecuencias detectadas: mensual (~30d), quincenal (~15d), semanal (~7d)
// Comando Telegram: /suscripciones
// ============================================================

function reporteSuscripciones() {
  var subs = detectarSuscripciones_();
  var msg  = construirMensajeSuscripciones_(subs);
  enviarMensajeTelegram_(msg);
}

function run_reporteSuscripciones() {
  reporteSuscripciones();
  return 'OK';
}

// ------------------------------------------------------------
// DETECCIÓN
// Retorna array de { comercio, montoPromedio, frecuencia, ultimaCobro, diasDesdeUltimo, vecesEn90d }
// ------------------------------------------------------------
function detectarSuscripciones_() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var lastRow = sheet.getLastRow();
  // Cols: A=ID, B=Fecha, C=Hora, D=Tipo, E=TipoTxn, F=Monto, G=Moneda, H=Comercio, I=Cuenta
  var datos = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

  var hoy     = new Date();
  var hace90  = new Date(hoy.getTime() - 90 * 24 * 3600000);

  // Palabras clave que indican NO es una suscripción digital
  var EXCLUIR_COMERCIO = ['ATM', 'CAJERO', 'RETIRO', 'EFECTIVO', 'DAVIPLATA', 'CORRESPONSAL'];
  var EXCLUIR_CATEGORIA = ['transferencia', 'financiero', 'salario', 'ahorro'];
  var EXCLUIR_TIPO_TXN  = ['transferencia_enviada', 'transferencia_recibida'];

  // Agrupar egresos de los últimos 90 días por comercio normalizado
  var grupos = {};
  datos.forEach(function(row) {
    var fecha    = row[1];
    var tipo     = String(row[3]).toLowerCase();
    var tipoTxn  = String(row[4] || '').toLowerCase();
    var monto    = Number(row[5]);
    var comercio = String(row[7] || '').trim();
    var cat      = String(row[9] || '').toLowerCase();

    if (!fecha || !comercio || monto <= 0) return;
    if (tipo === 'ingreso') return;

    var d = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(d.getTime()) || d < hace90) return;

    // Excluir transferencias, retiros ATM y categorías no relevantes
    if (EXCLUIR_TIPO_TXN.indexOf(tipoTxn) >= 0) return;
    if (EXCLUIR_CATEGORIA.some(function(c) { return cat.indexOf(c) >= 0; })) return;
    var comercioUp = comercio.toUpperCase();
    if (EXCLUIR_COMERCIO.some(function(p) { return comercioUp.indexOf(p) >= 0; })) return;

    // Normalizar: quitar números de referencia, mayúsculas, espacios extra
    var clave = comercio.toUpperCase().replace(/\d+/g, '').replace(/\s+/g, ' ').trim();
    if (clave.length < 3) return;

    if (!grupos[clave]) grupos[clave] = { nombre: comercio, montos: [], fechas: [] };
    grupos[clave].montos.push(monto);
    grupos[clave].fechas.push(d.getTime());
  });

  var suscripciones = [];

  Object.keys(grupos).forEach(function(clave) {
    var g = grupos[clave];
    if (g.fechas.length < 2) return; // necesita al menos 2 ocurrencias

    // Ordenar fechas
    g.fechas.sort(function(a, b) { return a - b; });

    // Calcular intervalos entre cobros consecutivos (en días)
    var intervalos = [];
    for (var i = 1; i < g.fechas.length; i++) {
      intervalos.push((g.fechas[i] - g.fechas[i-1]) / (24 * 3600000));
    }

    var avgIntervalo = intervalos.reduce(function(s, x) { return s + x; }, 0) / intervalos.length;

    // Desviación estándar — si es muy alta, no es recurrente
    var varianza = intervalos.reduce(function(s, x) { return s + Math.pow(x - avgIntervalo, 2); }, 0) / intervalos.length;
    var stdDev   = Math.sqrt(varianza);
    var cv       = avgIntervalo > 0 ? stdDev / avgIntervalo : 1; // coeficiente de variación

    // Solo considerar patrones regulares (cv < 0.4)
    if (cv > 0.4 && g.fechas.length < 4) return;

    // Clasificar frecuencia
    var frecuencia;
    if      (avgIntervalo >= 25) frecuencia = 'mensual';
    else if (avgIntervalo >= 12) frecuencia = 'quincenal';
    else if (avgIntervalo >=  5) frecuencia = 'semanal';
    else return; // demasiado frecuente, no es suscripción

    // Monto promedio (ignorar outliers extremos)
    var montoPromedio = g.montos.reduce(function(s, x) { return s + x; }, 0) / g.montos.length;

    // Días desde último cobro
    var ultimaCobro      = new Date(g.fechas[g.fechas.length - 1]);
    var diasDesdeUltimo  = Math.floor((hoy.getTime() - ultimaCobro.getTime()) / (24 * 3600000));

    suscripciones.push({
      comercio:        g.nombre,
      montoPromedio:   Math.round(montoPromedio),
      frecuencia:      frecuencia,
      ultimaCobro:     ultimaCobro,
      diasDesdeUltimo: diasDesdeUltimo,
      vecesEn90d:      g.fechas.length
    });
  });

  // Ordenar por monto descendente
  suscripciones.sort(function(a, b) { return b.montoPromedio - a.montoPromedio; });
  return suscripciones;
}

// ------------------------------------------------------------
// CONSTRUIR MENSAJE
// ------------------------------------------------------------
function construirMensajeSuscripciones_(subs) {
  var fmt = function(n) { return '$' + Number(n).toLocaleString('es-CO'); };

  // Advertir si hay pocos datos (menos de 3 meses)
  var aviso = '';
  var primerFecha = null;
  if (subs.length > 0) {
    // Estimar rango de datos desde las fechas detectadas
    var hoyMs = new Date().getTime();
    var hace90Ms = hoyMs - 90 * 24 * 3600000;
    var hace60Ms = hoyMs - 60 * 24 * 3600000;
    // Si todas las suscripciones tienen ≤ 2 ocurrencias, datos probablemente escasos
    var maxVeces = subs.reduce(function(m, s) { return Math.max(m, s.vecesEn90d); }, 0);
    if (maxVeces <= 2) {
      aviso = '\n\n📌 _Tienes pocos meses de historial. Con 6-12 meses los resultados serán más precisos._';
    }
  }

  if (subs.length === 0) {
    return '👻 No detecté suscripciones recurrentes en los últimos 90 días.\n\n_Tip: la función mejora con 6+ meses de historial._';
  }

  // Calcular costo mensual estimado
  var totalMensual = 0;
  subs.forEach(function(s) {
    if      (s.frecuencia === 'mensual')    totalMensual += s.montoPromedio;
    else if (s.frecuencia === 'quincenal')  totalMensual += s.montoPromedio * 2;
    else if (s.frecuencia === 'semanal')    totalMensual += s.montoPromedio * 4.3;
  });

  var lineas = subs.map(function(s) {
    // Alerta si no ha cobrado en más de 1.5 períodos esperados
    var periodoEsperado = s.frecuencia === 'mensual' ? 30 : s.frecuencia === 'quincenal' ? 15 : 7;
    var alerta = s.diasDesdeUltimo > periodoEsperado * 1.5 ? ' ⚠️' : '';
    var ult    = Utilities.formatDate(s.ultimaCobro, Session.getScriptTimeZone(), 'dd/MM');
    return '• ' + mdEscape_(s.comercio.substring(0, 22).padEnd(22)) + ' ' +
           fmt(s.montoPromedio) + '/' + s.frecuencia.substring(0,3) +
           '  (último ' + ult + ')' + alerta;
  });

  return (
    '👻 *Suscripciones detectadas* (últimos 90 días)\n\n' +
    lineas.join('\n') + '\n\n' +
    '💰 Costo mensual estimado: *' + fmt(Math.round(totalMensual)) + '*\n\n' +
    '⚠️ = no ha cobrado en más de 1.5 períodos. ¿Sigue activo?' +
    aviso
  );
}

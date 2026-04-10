// ============================================================
// FINANCEBOT AI - METAS DE AHORRO
// Sheet "Goals": ID | Meta | Objetivo | FechaLimite | Ahorrado | Estado | Creado
// Cols:           A     B       C           D             E         F       G
//
// Comandos Telegram:
//   /metas                             → ver progreso
//   /meta nueva <nombre> <monto> [fecha] → crear meta
//   /meta abonar <nombre> <monto>      → registrar abono
//   /meta completar <nombre>           → marcar completada
// ============================================================

// ------------------------------------------------------------
// ASEGURAR QUE EXISTE LA HOJA GOALS
// ------------------------------------------------------------
function obtenerHojaGoals_() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.GOALS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.GOALS);
    sheet.appendRow(['ID','Meta','Objetivo','Fecha Limite','Ahorrado','Estado','Creado']);
    sheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sheet.setColumnWidth(2, 200);
    Logger.log('Hoja Goals creada.');
  }
  return sheet;
}

// ------------------------------------------------------------
// CREAR META NUEVA
// nombre: string, objetivo: number, fechaLimite: "YYYY-MM-DD" o ""
// ------------------------------------------------------------
function crearMeta_(nombre, objetivo, fechaLimite) {
  var sheet = obtenerHojaGoals_();
  var id    = 'META-' + Date.now().toString(36).toUpperCase();
  sheet.appendRow([id, nombre, objetivo, fechaLimite || '', 0, 'activo', new Date().toISOString().substring(0,10)]);
  return id;
}

// ------------------------------------------------------------
// ABONAR A UNA META (busca por nombre, case-insensitive parcial)
// Retorna { ok, meta, ahorrado, objetivo } o { ok: false, error }
// ------------------------------------------------------------
function abonarMeta_(nombreBusqueda, monto) {
  var sheet   = obtenerHojaGoals_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'No hay metas creadas.' };

  var datos = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var busq  = nombreBusqueda.toLowerCase();
  var fila  = -1;

  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][5]).toLowerCase() !== 'activo') continue;
    if (String(datos[i][1]).toLowerCase().indexOf(busq) >= 0) { fila = i; break; }
  }

  if (fila < 0) return { ok: false, error: 'No encontré una meta activa llamada "' + nombreBusqueda + '".' };

  var nuevoAhorrado = Number(datos[fila][4]) + Number(monto);
  var objetivo      = Number(datos[fila][2]);
  // Actualizar col E (col 5, índice 4) → fila en sheet = fila+2
  sheet.getRange(fila + 2, 5).setValue(nuevoAhorrado);

  // Marcar como completada si alcanzó el objetivo
  if (nuevoAhorrado >= objetivo) {
    sheet.getRange(fila + 2, 6).setValue('completado');
  }

  return { ok: true, meta: datos[fila][1], ahorrado: nuevoAhorrado, objetivo: objetivo };
}

// ------------------------------------------------------------
// REPORTE DE METAS → enviar a Telegram
// ------------------------------------------------------------
function reporteMetas() {
  var msg = construirMensajeMetas_();
  enviarMensajeTelegram_(msg);
}

function run_reporteMetas() {
  reporteMetas();
  return 'OK';
}

function construirMensajeMetas_() {
  var sheet   = obtenerHojaGoals_();
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return (
      '🎯 *Metas de Ahorro*\n\n' +
      'No tienes metas creadas aún.\n\n' +
      'Crea una con:\n`/meta nueva Vacaciones 2000000 2026-12-31`'
    );
  }

  var datos  = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var hoy    = new Date();
  var activas = datos.filter(function(r) { return String(r[5]).toLowerCase() === 'activo'; });
  var completadas = datos.filter(function(r) { return String(r[5]).toLowerCase() === 'completado'; });

  if (activas.length === 0) {
    return '🎯 *Metas de Ahorro*\n\n✅ ¡Todas tus metas están completadas!\n\nCrea una nueva con:\n`/meta nueva <nombre> <monto>`';
  }

  var fmt   = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
  var barra = function(pct) {
    var llenos = Math.round(Math.min(pct, 100) / 10);
    return '█'.repeat(llenos) + '░'.repeat(10 - llenos);
  };

  var lineas = activas.map(function(r) {
    var nombre    = String(r[1]);
    var objetivo  = Number(r[2]);
    var fechaLim  = r[3] ? String(r[3]).substring(0, 10) : '';
    var ahorrado  = Number(r[4]);
    var pct       = objetivo > 0 ? (ahorrado / objetivo * 100) : 0;
    var faltante  = Math.max(0, objetivo - ahorrado);

    var linea = '\n🎯 *' + nombre + '*\n';
    linea += '   ' + barra(pct) + ' ' + pct.toFixed(0) + '%\n';
    linea += '   ' + fmt(ahorrado) + ' / ' + fmt(objetivo);

    if (fechaLim) {
      var diasRestantes = Math.ceil((new Date(fechaLim) - hoy) / (24 * 3600000));
      if (diasRestantes > 0 && faltante > 0) {
        var porDia = faltante / diasRestantes;
        linea += '\n   📅 ' + diasRestantes + ' días · necesitas ' + fmt(porDia) + '/día';
      } else if (diasRestantes <= 0) {
        linea += '\n   ⚠️ Fecha vencida';
      } else {
        linea += '\n   ✅ Meta alcanzada';
      }
    }
    return linea;
  });

  var msg = '🎯 *Metas de Ahorro*\n' + lineas.join('\n');

  if (completadas.length > 0) {
    msg += '\n\n✅ Completadas: ' + completadas.map(function(r){ return r[1]; }).join(', ');
  }

  msg += '\n\n_Abona con:_ `/meta abonar <nombre> <monto>`';
  return msg;
}

// ------------------------------------------------------------
// PARSEAR COMANDOS /meta desde Telegram
// Retorna string para enviar al usuario
// ------------------------------------------------------------
function procesarComandoMeta_(texto) {
  // /meta nueva <nombre> <monto> [fecha]
  // /meta abonar <nombre> <monto>
  // /meta completar <nombre>
  var partes = texto.trim().split(/\s+/);
  // partes[0]='/meta', partes[1]=accion, partes[2..]=args

  if (partes.length < 2) return construirMensajeMetas_();

  var accion = partes[1].toLowerCase();
  var fmt    = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };

  if (accion === 'nueva') {
    // /meta nueva Vacaciones 2000000 2026-12-31
    if (partes.length < 4) return '❌ Formato: `/meta nueva <nombre> <monto> [YYYY-MM-DD]`';
    var monto = parsearMonto_(partes[partes.length - 2] + ' ' + (partes[partes.length - 1] || ''));
    // Detectar si el último param es fecha
    var fechaLim = '';
    var ultimoParte = partes[partes.length - 1];
    if (/^\d{4}-\d{2}-\d{2}$/.test(ultimoParte)) {
      fechaLim = ultimoParte;
      var nombrePartes = partes.slice(2, partes.length - 2);
      monto = Number(partes[partes.length - 2].replace(/[^0-9]/g, ''));
    } else {
      var nombrePartes = partes.slice(2, partes.length - 1);
      monto = Number(partes[partes.length - 1].replace(/[^0-9]/g, ''));
    }
    var nombre = nombrePartes.join(' ');
    if (!nombre || !monto || monto <= 0) return '❌ Formato: `/meta nueva <nombre> <monto> [YYYY-MM-DD]`\nEjemplo: `/meta nueva Vacaciones 2000000 2026-12-31`';
    crearMeta_(nombre, monto, fechaLim);
    return '✅ Meta *' + nombre + '* creada por ' + fmt(monto) + (fechaLim ? ' · fecha límite: ' + fechaLim : '') + '.';
  }

  if (accion === 'abonar') {
    // /meta abonar Vacaciones 200000
    if (partes.length < 4) return '❌ Formato: `/meta abonar <nombre> <monto>`';
    var monto   = Number(partes[partes.length - 1].replace(/[^0-9]/g, ''));
    var nombre  = partes.slice(2, partes.length - 1).join(' ');
    if (!nombre || !monto || monto <= 0) return '❌ Formato: `/meta abonar <nombre> <monto>`';
    var res = abonarMeta_(nombre, monto);
    if (!res.ok) return '❌ ' + res.error;
    var pct = res.objetivo > 0 ? (res.ahorrado / res.objetivo * 100).toFixed(0) : 0;
    var msg = '💰 Abono registrado en *' + res.meta + '*\n' +
              fmt(res.ahorrado) + ' / ' + fmt(res.objetivo) + ' (' + pct + '%)';
    if (res.ahorrado >= res.objetivo) msg += '\n\n🎉 ¡Meta completada!';
    return msg;
  }

  if (accion === 'completar') {
    var nombre = partes.slice(2).join(' ');
    var res    = abonarMeta_(nombre, 0); // solo para localizar la fila
    if (!res.ok) return '❌ ' + res.error;
    // Marcar directamente
    var sheet   = obtenerHojaGoals_();
    var lastRow = sheet.getLastRow();
    var datos   = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    var busq    = nombre.toLowerCase();
    for (var i = 0; i < datos.length; i++) {
      if (String(datos[i][1]).toLowerCase().indexOf(busq) >= 0 && String(datos[i][5]).toLowerCase() === 'activo') {
        sheet.getRange(i + 2, 6).setValue('completado');
        return '✅ Meta *' + datos[i][1] + '* marcada como completada.';
      }
    }
    return '❌ No encontré esa meta.';
  }

  // /metas sin subcomando → reporte
  return construirMensajeMetas_();
}

// Helper: parsear monto desde texto ("200000", "200k", "2 millones")
function parsearMonto_(texto) {
  var t = String(texto).toLowerCase().replace(/\./g,'').replace(/,/g,'.');
  if (t.indexOf('millon') >= 0 || t.indexOf('millón') >= 0) return parseFloat(t) * 1000000;
  if (t.indexOf('k') >= 0) return parseFloat(t) * 1000;
  return parseFloat(t.replace(/[^0-9.]/g,'')) || 0;
}

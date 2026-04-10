// ============================================================
// FINANCEBOT AI - METAS DE AHORRO v2
// Sheet "Goals": ID|Meta|Objetivo|FechaLimite|Ahorrado|Estado|Creado|ÚltimoAbono|Etiqueta
// Cols:           A    B    C         D           E       F      G        H           I
//
// Comandos Telegram:
//   /metas                              → progreso completo con barras
//   /meta nueva <nombre> <monto> [fecha] → crear meta
//   /meta abonar <nombre> <monto>       → registrar abono
//   /meta completar <nombre>            → marcar completada
//   /meta estado                        → resumen rápido de alertas
//
// Funciones automáticas (requieren activadores):
//   recordarMetasSinAbono()             → activador mensual (día 1, 8am)
// ============================================================

// ------------------------------------------------------------
// ASEGURAR QUE EXISTE LA HOJA GOALS (con migración de columnas)
// ------------------------------------------------------------
function obtenerHojaGoals_() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEETS.GOALS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEETS.GOALS);
    sheet.appendRow(['ID','Meta','Objetivo','Fecha Limite','Ahorrado','Estado','Creado','Último Abono','Etiqueta']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sheet.setColumnWidth(2, 200);
    sheet.setColumnWidth(8, 130);
    Logger.log('Hoja Goals creada (v2).');
  } else {
    // Migración: añadir cols H e I si no existen
    var lastCol = sheet.getLastColumn();
    if (lastCol < 8) {
      sheet.getRange(1, 8).setValue('Último Abono');
      sheet.getRange(1, 9).setValue('Etiqueta');
      sheet.getRange(1, 8, 1, 2).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    } else if (lastCol < 9) {
      sheet.getRange(1, 9).setValue('Etiqueta');
      sheet.getRange(1, 9).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    }
  }
  return sheet;
}

// ------------------------------------------------------------
// CREAR META NUEVA
// ------------------------------------------------------------
function crearMeta_(nombre, objetivo, fechaLimite) {
  var sheet = obtenerHojaGoals_();
  var id    = 'META-' + Date.now().toString(36).toUpperCase();
  sheet.appendRow([id, nombre, objetivo, fechaLimite || '', 0, 'activo',
                   new Date().toISOString().substring(0, 10), '', '']);
  return id;
}

// ------------------------------------------------------------
// ABONAR A UNA META
// - Actualiza Ahorrado y Último Abono
// - Registra la transacción en Transactions (C: auto-log)
// - Marca como completada si alcanzó el objetivo
// Retorna { ok, meta, ahorrado, objetivo } o { ok: false, error }
// ------------------------------------------------------------
function abonarMeta_(nombreBusqueda, monto) {
  var sheet   = obtenerHojaGoals_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: false, error: 'No hay metas creadas.' };

  var datos = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var busq  = nombreBusqueda.toLowerCase();
  var fila  = -1;

  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][5]).toLowerCase() !== 'activo') continue;
    if (String(datos[i][1]).toLowerCase().indexOf(busq) >= 0) { fila = i; break; }
  }

  if (fila < 0) return { ok: false, error: 'No encontré una meta activa llamada "' + nombreBusqueda + '".' };

  var nuevoAhorrado = Number(datos[fila][4]) + Number(monto);
  var objetivo      = Number(datos[fila][2]);
  var filaSheet     = fila + 2;
  var hoyStr        = new Date().toISOString().substring(0, 10);

  sheet.getRange(filaSheet, 5).setValue(nuevoAhorrado);
  sheet.getRange(filaSheet, 8).setValue(hoyStr); // Último Abono

  if (nuevoAhorrado >= objetivo) {
    sheet.getRange(filaSheet, 6).setValue('completado');
  }

  // C: Registrar como transacción de ahorro (solo si monto > 0)
  // Nota: si ya importas el extracto que incluye la transferencia al bolsillo,
  // no uses /meta abonar para ese mismo monto (evita doble conteo).
  if (monto > 0) {
    _registrarTransaccionAhorro_(datos[fila][1], monto, hoyStr);
  }

  return { ok: true, meta: datos[fila][1], ahorrado: nuevoAhorrado, objetivo: objetivo };
}

// C: Escribe la transacción de ahorro en Transactions
function _registrarTransaccionAhorro_(nombreMeta, monto, fechaStr) {
  try {
    var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Transactions');
    if (!sheet) return;
    escribirTransaccion_(sheet, {
      fecha: fechaStr, hora: null, tipo: 'egreso',
      tipo_transaccion: 'transferencia_enviada',
      monto: monto, moneda: 'COP',
      comercio: 'Meta: ' + nombreMeta,
      cuenta: null, categoria: 'Financiero', subcategoria: 'Ahorro',
      necesidad: 'necesario', sugerencia: 'Abono a meta de ahorro',
      referencia: null, confianza: 1.0, banco: 'Bancolombia',
      fuente: 'meta'
    });
  } catch(e) {
    Logger.log('⚠️ No se pudo registrar transacción de ahorro: ' + e.message);
  }
}

// ------------------------------------------------------------
// B: CALCULAR FLUJO DE CAJA PROMEDIO (últimos 3 meses)
// Retorna { ingresoPromedio, gastoPromedio, excedente, meses }
// ------------------------------------------------------------
function _calcularFlujoCaja_() {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var txnSh = ss.getSheetByName('Transactions');
  if (!txnSh || txnSh.getLastRow() < 2) return null;

  var header = txnSh.getRange(1, 1, 1, txnSh.getLastColumn()).getValues()[0];
  var iF = header.indexOf('fecha');
  var iT = header.indexOf('tipo');
  var iM = header.indexOf('monto');
  var iC = header.indexOf('categoria');
  if (iF < 0 || iT < 0 || iM < 0) return null;

  var datos  = txnSh.getRange(2, 1, txnSh.getLastRow() - 1, txnSh.getLastColumn()).getValues();
  var hoy    = new Date();
  var hace3m = new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1);

  var ingMes = {};
  var gasMes = {};

  datos.forEach(function(row) {
    if (!row[iF]) return;
    var fecha = row[iF] instanceof Date ? row[iF] : new Date(row[iF]);
    if (isNaN(fecha.getTime()) || fecha < hace3m) return;

    var mes   = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
    var monto = Math.abs(Number(row[iM]));
    var tipo  = String(row[iT]).toLowerCase();
    var cat   = iC >= 0 ? String(row[iC]).toLowerCase() : '';

    // Excluir transferencias entre cuentas propias y abonos de metas (evita doble conteo)
    if (cat === 'transferencia') return;
    if (cat === 'financiero' && String(row[iC + 1] || '').toLowerCase() === 'ahorro') return;

    if (tipo === 'ingreso') {
      ingMes[mes] = (ingMes[mes] || 0) + monto;
    } else if (tipo === 'egreso') {
      gasMes[mes] = (gasMes[mes] || 0) + monto;
    }
  });

  var meses = Object.keys(ingMes);
  if (meses.length === 0) return null;

  var totIng = meses.reduce(function(s, k) { return s + (ingMes[k] || 0); }, 0);
  var totGas = meses.reduce(function(s, k) { return s + (gasMes[k] || 0); }, 0);

  return {
    ingresoPromedio: totIng / meses.length,
    gastoPromedio:   totGas / meses.length,
    excedente:       (totIng - totGas) / meses.length,
    meses:           meses.length
  };
}

// ------------------------------------------------------------
// A: RECORDATORIO MENSUAL DE METAS
// Configura un activador de tiempo: recordarMetasSinAbono()
// → Tipo: Temporizador mensual (o diario con check de día 1)
// ------------------------------------------------------------
function recordarMetasSinAbono() {
  // Solo ejecutar el día 1 de cada mes si usas activador diario
  var hoy = new Date();
  if (hoy.getDate() !== 1) return;

  var sheet   = obtenerHojaGoals_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var datos   = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var activas = datos.filter(function(r) { return String(r[5]).toLowerCase() === 'activo'; });
  if (activas.length === 0) return;

  var mesHoy = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  var flujo  = _calcularFlujoCaja_();
  var fmt    = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };

  var lineas = activas.map(function(r) {
    var nombre   = String(r[1]);
    var objetivo = Number(r[2]);
    var fechaLim = r[3] ? String(r[3]).substring(0, 10) : '';
    var ahorrado = Number(r[4]);
    var ultimoAb = String(r[7] || '');
    var faltante = Math.max(0, objetivo - ahorrado);
    var pct      = objetivo > 0 ? Math.round(ahorrado / objetivo * 100) : 0;
    var sinAbono = !ultimoAb || ultimoAb.substring(0, 7) !== mesHoy;

    var icono = sinAbono ? '⚠️' : '✅';
    var linea = icono + ' *' + nombre + '* — ' + pct + '%\n';

    if (faltante > 0) {
      var mesesRest = 999;
      if (fechaLim) {
        mesesRest = Math.max(1, Math.ceil((new Date(fechaLim) - hoy) / (30 * 24 * 3600000)));
      }

      var necesitadoPorMes = faltante / mesesRest;

      // B: Calcular recomendado = máximo entre lo necesario y 10% del ingreso
      var recomendado = necesitadoPorMes;
      if (flujo && flujo.ingresoPromedio > 0) {
        var diezPct = flujo.ingresoPromedio * 0.10;
        recomendado = Math.max(necesitadoPorMes, diezPct);
      }

      if (fechaLim) {
        linea += '   Te faltan ' + fmt(faltante) + ' · ' + mesesRest + ' mes(es)\n';
      } else {
        linea += '   Te faltan ' + fmt(faltante) + ' · sin fecha límite\n';
      }

      linea += '   💡 Abona *' + fmt(recomendado) + '/mes* para llegar a tiempo';

      // Viabilidad según flujo real
      if (flujo) {
        if (flujo.excedente >= recomendado) {
          linea += '\n   ✅ Viable — te sobran aprox. ' + fmt(flujo.excedente) + '/mes';
        } else if (flujo.excedente > 0) {
          var deficit = recomendado - flujo.excedente;
          linea += '\n   ⚠️ Necesitas reducir gastos en ' + fmt(deficit) + '/mes para alcanzarla';
        } else {
          linea += '\n   🚨 Tus gastos superan tus ingresos este período — revisa primero tu flujo';
        }
      }
    } else {
      linea += '   ✅ Meta alcanzada, aún no marcada como completada';
    }

    if (sinAbono) linea += '\n   _Sin abono este mes_';
    return linea;
  });

  var sinAbono = activas.filter(function(r) {
    var u = String(r[7] || '');
    return !u || u.substring(0, 7) !== mesHoy;
  });

  var msg = '🎯 *Revisión mensual de Metas*\n\n' + lineas.join('\n\n');

  if (sinAbono.length > 0) {
    msg += '\n\n📌 ' + sinAbono.length + ' meta(s) sin abono este mes.\n';
    msg += '`/meta abonar <nombre> <monto>`';
  }

  if (flujo) {
    msg += '\n\n📊 _Análisis basado en ' + flujo.meses + ' mes(es) de historial_\n';
    msg += '_Ingreso prom: ' + fmt(flujo.ingresoPromedio) + ' · Excedente: ' + fmt(flujo.excedente) + '/mes_';
  }

  enviarMensajeTelegram_(msg);
}

function run_recordarMetasSinAbono() {
  // Para forzar el envío manualmente (ignora el check del día 1)
  var sheet   = obtenerHojaGoals_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { enviarMensajeTelegram_('No hay metas activas.'); return 'sin metas'; }

  var datos   = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var activas = datos.filter(function(r) { return String(r[5]).toLowerCase() === 'activo'; });
  if (activas.length === 0) { enviarMensajeTelegram_('No hay metas activas.'); return 'sin activas'; }

  // Forzar ejecución directa sin check de día
  var hoy    = new Date();
  var mesHoy = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  var flujo  = _calcularFlujoCaja_();
  var fmt    = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };

  var lineas = activas.map(function(r) {
    var nombre   = String(r[1]);
    var objetivo = Number(r[2]);
    var fechaLim = r[3] ? String(r[3]).substring(0, 10) : '';
    var ahorrado = Number(r[4]);
    var ultimoAb = String(r[7] || '');
    var faltante = Math.max(0, objetivo - ahorrado);
    var pct      = objetivo > 0 ? Math.round(ahorrado / objetivo * 100) : 0;
    var sinAbono = !ultimoAb || ultimoAb.substring(0, 7) !== mesHoy;

    var icono = sinAbono ? '⚠️' : '✅';
    var linea = icono + ' *' + nombre + '* — ' + pct + '%\n';

    if (faltante > 0) {
      var mesesRest = 999;
      if (fechaLim) {
        mesesRest = Math.max(1, Math.ceil((new Date(fechaLim) - hoy) / (30 * 24 * 3600000)));
      }
      var necesitadoPorMes = faltante / mesesRest;
      var recomendado      = necesitadoPorMes;
      if (flujo && flujo.ingresoPromedio > 0) {
        recomendado = Math.max(necesitadoPorMes, flujo.ingresoPromedio * 0.10);
      }
      if (fechaLim) {
        linea += '   Te faltan ' + fmt(faltante) + ' · ' + mesesRest + ' mes(es)\n';
      } else {
        linea += '   Te faltan ' + fmt(faltante) + ' · sin fecha límite\n';
      }
      linea += '   💡 Abona *' + fmt(recomendado) + '/mes*';
      if (flujo) {
        if (flujo.excedente >= recomendado) {
          linea += '\n   ✅ Viable — excedente ' + fmt(flujo.excedente) + '/mes';
        } else {
          linea += '\n   ⚠️ Déficit de ' + fmt(recomendado - flujo.excedente) + '/mes para alcanzarla';
        }
      }
    }
    if (sinAbono) linea += '\n   _Sin abono este mes_';
    return linea;
  });

  var msg = '🎯 *Revisión mensual de Metas*\n\n' + lineas.join('\n\n');
  if (flujo) {
    msg += '\n\n📊 _' + flujo.meses + ' mes(es) de historial · Excedente prom: ' + fmt(flujo.excedente) + '/mes_';
  }
  enviarMensajeTelegram_(msg);
  return 'OK';
}

// ------------------------------------------------------------
// REPORTE DE METAS (comando /metas)
// ------------------------------------------------------------
function reporteMetas() {
  enviarMensajeTelegram_(construirMensajeMetas_());
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

  var datos       = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var hoy         = new Date();
  var activas     = datos.filter(function(r) { return String(r[5]).toLowerCase() === 'activo'; });
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
    var nombre   = String(r[1]);
    var objetivo = Number(r[2]);
    var fechaLim = r[3] ? String(r[3]).substring(0, 10) : '';
    var ahorrado = Number(r[4]);
    var pct      = objetivo > 0 ? (ahorrado / objetivo * 100) : 0;
    var faltante = Math.max(0, objetivo - ahorrado);

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
    msg += '\n\n✅ Completadas: ' + completadas.map(function(r) { return r[1]; }).join(', ');
  }

  msg += '\n\n_Abona con:_ `/meta abonar <nombre> <monto>`';
  msg += '\n_Alertas rápidas:_ `/meta estado`';
  return msg;
}

// ------------------------------------------------------------
// D: RESUMEN RÁPIDO DE ALERTAS (/meta estado)
// Solo muestra metas sin abono este mes o cerca del deadline
// ------------------------------------------------------------
function construirMensajeEstadoMetas_() {
  var sheet   = obtenerHojaGoals_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '🎯 No tienes metas activas. Crea una con `/meta nueva`.';

  var datos   = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  var activas = datos.filter(function(r) { return String(r[5]).toLowerCase() === 'activo'; });
  if (activas.length === 0) return '🎯 No hay metas activas.';

  var hoy    = new Date();
  var mesHoy = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  var fmt    = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };
  var alertas = [];

  activas.forEach(function(r) {
    var nombre   = String(r[1]);
    var objetivo = Number(r[2]);
    var fechaLim = r[3] ? String(r[3]).substring(0, 10) : '';
    var ahorrado = Number(r[4]);
    var ultimoAb = String(r[7] || '');
    var faltante = Math.max(0, objetivo - ahorrado);
    var pct      = objetivo > 0 ? Math.round(ahorrado / objetivo * 100) : 0;

    var sinAbono      = !ultimoAb || ultimoAb.substring(0, 7) !== mesHoy;
    var diasRestantes = fechaLim ? Math.ceil((new Date(fechaLim) - hoy) / (24 * 3600000)) : null;
    var urgente       = diasRestantes !== null && diasRestantes <= 60 && faltante > 0;

    if (!sinAbono && !urgente) return; // está al día, omitir

    var icono;
    if (urgente && sinAbono) icono = '🚨';
    else if (urgente)        icono = '⏰';
    else                     icono = '⚠️';

    var linea = icono + ' *' + nombre + '* — ' + pct + '% (' + fmt(ahorrado) + '/' + fmt(objetivo) + ')';
    if (urgente)   linea += '\n   ⏰ ' + diasRestantes + ' días restantes';
    if (sinAbono)  linea += '\n   Sin abono este mes';
    alertas.push(linea);
  });

  if (alertas.length === 0) {
    return '✅ *Metas al día*\nTodas tienen abonos este mes y están en tiempo.\nUsa `/metas` para ver el detalle.';
  }

  return (
    '⚡ *Estado de Metas — ' + alertas.length + ' alerta(s)*\n\n' +
    alertas.join('\n\n') +
    '\n\n`/meta abonar <nombre> <monto>` · `/metas` para detalle'
  );
}

// ------------------------------------------------------------
// PARSEAR COMANDOS /meta desde Telegram
// ------------------------------------------------------------
function procesarComandoMeta_(texto) {
  var partes = texto.trim().split(/\s+/);
  // partes[0]='/meta' o '/metas', partes[1]=accion, partes[2..]=args

  if (partes[0] === '/metas' || partes.length < 2) return construirMensajeMetas_();

  var accion = partes[1].toLowerCase();
  var fmt    = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO'); };

  // D: /meta estado
  if (accion === 'estado') {
    return construirMensajeEstadoMetas_();
  }

  // /meta nueva <nombre> <monto> [YYYY-MM-DD]
  if (accion === 'nueva') {
    if (partes.length < 4) return '❌ Formato: `/meta nueva <nombre> <monto> [YYYY-MM-DD]`';
    var ultimoParte = partes[partes.length - 1];
    var fechaLim    = '';
    var nombrePartes, monto;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ultimoParte)) {
      fechaLim     = ultimoParte;
      nombrePartes = partes.slice(2, partes.length - 2);
      monto        = Number(partes[partes.length - 2].replace(/[^0-9]/g, ''));
    } else {
      nombrePartes = partes.slice(2, partes.length - 1);
      monto        = Number(partes[partes.length - 1].replace(/[^0-9]/g, ''));
    }
    var nombre = nombrePartes.join(' ');
    if (!nombre || !monto || monto <= 0) {
      return '❌ Formato: `/meta nueva <nombre> <monto> [YYYY-MM-DD]`\nEjemplo: `/meta nueva Vacaciones 2000000 2026-12-31`';
    }
    crearMeta_(nombre, monto, fechaLim);
    return '✅ Meta *' + nombre + '* creada por ' + fmt(monto) +
           (fechaLim ? ' · fecha límite: ' + fechaLim : '') + '.\n\n' +
           '_Abona con:_ `/meta abonar ' + nombre + ' <monto>`\n' +
           '_Ver estado:_ `/meta estado`';
  }

  // /meta abonar <nombre> <monto>
  if (accion === 'abonar') {
    if (partes.length < 4) return '❌ Formato: `/meta abonar <nombre> <monto>`';
    var monto  = Number(partes[partes.length - 1].replace(/[^0-9]/g, ''));
    var nombre = partes.slice(2, partes.length - 1).join(' ');
    if (!nombre || !monto || monto <= 0) return '❌ Formato: `/meta abonar <nombre> <monto>`';
    var res = abonarMeta_(nombre, monto);
    if (!res.ok) return '❌ ' + res.error;
    var pct = res.objetivo > 0 ? (res.ahorrado / res.objetivo * 100).toFixed(0) : 0;
    var barra = (function(p) {
      var llenos = Math.round(Math.min(p, 100) / 10);
      return '█'.repeat(llenos) + '░'.repeat(10 - llenos);
    })(Number(pct));
    var msg = '💰 Abono registrado en *' + res.meta + '*\n' +
              barra + ' ' + pct + '%\n' +
              fmt(res.ahorrado) + ' / ' + fmt(res.objetivo);
    if (res.ahorrado >= res.objetivo) msg += '\n\n🎉 ¡Meta completada!';
    return msg;
  }

  // /meta completar <nombre>
  if (accion === 'completar') {
    var nombre  = partes.slice(2).join(' ');
    var sheet   = obtenerHojaGoals_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return '❌ No hay metas creadas.';
    var datos = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    var busq  = nombre.toLowerCase();
    for (var i = 0; i < datos.length; i++) {
      if (String(datos[i][1]).toLowerCase().indexOf(busq) >= 0 &&
          String(datos[i][5]).toLowerCase() === 'activo') {
        sheet.getRange(i + 2, 6).setValue('completado');
        return '✅ Meta *' + datos[i][1] + '* marcada como completada. ¡Bien hecho!';
      }
    }
    return '❌ No encontré una meta activa con ese nombre.';
  }

  return construirMensajeMetas_();
}

// Helper: parsear monto desde texto ("200000", "200k", "2 millones")
function parsearMonto_(texto) {
  var t = String(texto).toLowerCase().replace(/\./g, '').replace(/,/g, '.');
  if (t.indexOf('millon') >= 0 || t.indexOf('millón') >= 0) return parseFloat(t) * 1000000;
  if (t.indexOf('k') >= 0) return parseFloat(t) * 1000;
  return parseFloat(t.replace(/[^0-9.]/g, '')) || 0;
}

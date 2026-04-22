// ============================================================
// FINANCEBOT IA — WEB APP ADMIN PANEL (v2)
// ============================================================

function doGet(e) {
  var tmpl = HtmlService.createTemplateFromFile('WebAdmin');
  tmpl.spreadsheetId  = CONFIG.SPREADSHEET_ID;
  tmpl.spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.SPREADSHEET_ID;
  return tmpl.evaluate()
    .setTitle('FinanceBot IA — Admin')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─── Util ────────────────────────────────────────────
function _ssWeb_()  { return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID); }
function _toStr_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'America/Bogota', 'dd/MM/yyyy');
  return String(v);
}

// ════════════════════════════════════════════════════════════
// DASHBOARD COMPLETO
// ════════════════════════════════════════════════════════════
function getDashboardCompleto(anioFiltro, mesFiltro) {
  try {
    var ss  = _ssWeb_();
    var shT = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!shT || shT.getLastRow() < 2) {
      return { ok: true, vacio: true, kpis: {gastos:0,ingresos:0,flujo:0,ratioAhorro:0,txnEsteMes:0}, distribucion:[], topCats:[], consolidado:[] };
    }

    var ahora = new Date();
    var anioA = anioFiltro ? Number(anioFiltro) : ahora.getFullYear();
    var mesA  = (mesFiltro !== undefined && mesFiltro !== null && mesFiltro !== '') ? Number(mesFiltro) - 1 : ahora.getMonth();

    var txns = shT.getDataRange().getValues();
    var totalEgresos = 0, totalIngresos = 0, txnEsteMes = 0;
    var porCategoria = {};
    var monthlyData = {};

    for (var j = 1; j < txns.length; j++) {
      var f = txns[j][1];
      if (!f) continue;
      var fd = f instanceof Date ? f : new Date(f);
      if (isNaN(fd.getTime())) continue;

      var tipo  = String(txns[j][3] || '');
      var monto = Number(txns[j][5]) || 0;
      var cat   = String(txns[j][9] || 'Otro');

      var mesKey = fd.getFullYear() + '-' + ('0' + (fd.getMonth() + 1)).slice(-2);
      if (!monthlyData[mesKey]) monthlyData[mesKey] = { ingresos: 0, egresos: 0, txnCount: 0, anio: fd.getFullYear(), mes: fd.getMonth() };
      monthlyData[mesKey].txnCount++;
      if (tipo === 'ingreso') monthlyData[mesKey].ingresos += monto;
      else if (tipo === 'egreso') monthlyData[mesKey].egresos += monto;

      if (fd.getMonth() === mesA && fd.getFullYear() === anioA) {
        txnEsteMes++;
        if (tipo === 'ingreso') totalIngresos += monto;
        else if (tipo === 'egreso') {
          totalEgresos += monto;
          porCategoria[cat] = (porCategoria[cat] || 0) + monto;
        }
      }
    }

    var distribucion = Object.keys(porCategoria).map(function(c) {
      return { cat: c, monto: porCategoria[c], pct: totalEgresos > 0 ? Math.round(porCategoria[c] / totalEgresos * 100) : 0 };
    }).sort(function(a, b) { return b.monto - a.monto; });

    var monthsKeys = Object.keys(monthlyData).sort();
    var ultimosMeses = monthsKeys.slice(-12).map(function(k) {
      var d = monthlyData[k];
      var nombreMes = new Date(d.anio, d.mes, 1).toLocaleString('es-CO', { month: 'short' });
      var mesShort = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1, 4);
      return {
        mes: mesShort + ' ' + String(d.anio).slice(-2),
        ingresos: d.ingresos,
        egresos: d.egresos,
        flujo: d.ingresos - d.egresos,
        txns: d.txnCount
      };
    });

    // Alertas activas: presupuesto por categoría >= 80%
    var cfg = leerConfiguracion_();
    var alertas = [];
    if (cfg.presupuestos) {
      Object.keys(cfg.presupuestos).forEach(function(catName) {
        var gastado = porCategoria[catName] || 0;
        var bud = cfg.presupuestos[catName];
        if (bud > 0 && gastado / bud >= 0.8) {
          alertas.push({
            cat: catName,
            gastado: gastado,
            presupuesto: bud,
            pct: Math.round(gastado / bud * 100)
          });
        }
      });
    }

    return {
      ok: true,
      kpis: {
        gastos:      totalEgresos,
        ingresos:    totalIngresos,
        flujo:       totalIngresos - totalEgresos,
        ratioAhorro: totalIngresos > 0 ? Math.round((totalIngresos - totalEgresos) / totalIngresos * 100) : 0,
        txnEsteMes:  txnEsteMes
      },
      distribucion: distribucion,
      topCats:      distribucion.slice(0, 6),
      consolidado:  ultimosMeses,
      alertas:      alertas,
      anio:         anioA,
      mes:          mesA + 1,
      mesNombre:    new Date(anioA, mesA, 1).toLocaleString('es-CO', { month: 'long' })
    };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
// CONFIGURACIONES INTELIGENTES (agrupadas, sin filas vacías)
// ════════════════════════════════════════════════════════════
function getConfiguracionesSmart() {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    if (!sh) return { ok: false, error: 'Hoja Configurations no encontrada' };

    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, general: [], bancos: [], categorias: [] };

    var data = sh.getRange(1, 1, lastRow, 4).getValues();
    var general = [], bancos = [], categorias = [];

    for (var i = 1; i < data.length; i++) {
      var clave = String(data[i][0] || '').trim();
      if (!clave || clave.indexOf('---') === 0) continue;

      var valor = data[i][1];
      var col3  = data[i][2];
      var desc  = data[i][3];

      var mBanco = clave.match(/^Banco\s+(\d+)\s+sender$/i);
      if (mBanco) {
        if (valor && String(valor).trim()) {
          bancos.push({
            n:     parseInt(mBanco[1], 10),
            valor: String(valor),
            clave: clave,
            desc:  String(desc || ''),
            row:   i + 1
          });
        }
        continue;
      }

      var mCat = clave.match(/^Categor[íi]a\s+(\d+)$/i);
      if (mCat) {
        if (valor && String(valor).trim()) {
          categorias.push({
            n:           parseInt(mCat[1], 10),
            valor:       String(valor),
            presupuesto: Number(col3) || 0,
            clave:       clave,
            desc:        String(desc || ''),
            row:         i + 1
          });
        }
        continue;
      }

      // No mostrar Presupuesto X (categoría) sueltos — los integramos en categorías
      if (/^Presupuesto\s+/i.test(clave) && clave !== 'Presupuesto mensual') continue;

      general.push({
        clave: clave,
        valor: _toStr_(valor),
        desc:  String(desc || ''),
        row:   i + 1
      });
    }

    bancos.sort(function(a, b) { return a.n - b.n; });
    categorias.sort(function(a, b) { return a.n - b.n; });

    return { ok: true, general: general, bancos: bancos, categorias: categorias };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

function guardarConfiguracion(clave, valor) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    var data = sh.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === clave) {
        sh.getRange(i + 1, 2).setValue(valor);
        return { ok: true };
      }
    }
    sh.appendRow([clave, valor, '', '']);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

function actualizarCategoria(row, nombre, presupuesto) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    sh.getRange(row, 2).setValue(nombre);
    sh.getRange(row, 3).setValue(presupuesto ? Number(presupuesto) : '');
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

function actualizarBanco(row, sender) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    sh.getRange(row, 2).setValue(sender);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

function agregarBanco(sender) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    var data = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    var maxN = 0;
    for (var i = 0; i < data.length; i++) {
      var m = String(data[i][0] || '').match(/^Banco\s+(\d+)\s+sender$/i);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    var n = maxN + 1;
    var clave = 'Banco ' + n + ' sender';
    sh.appendRow([clave, sender, '', 'Dominio email del banco para filtrar (separar con coma si son varios)']);
    return { ok: true, n: n, row: sh.getLastRow() };
  } catch(err) { return { ok: false, error: err.message }; }
}

function agregarCategoria(nombre, presupuesto) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    var data = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    var maxN = 0;
    for (var i = 0; i < data.length; i++) {
      var m = String(data[i][0] || '').match(/^Categor[íi]a\s+(\d+)$/i);
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    }
    var n = maxN + 1;
    var clave = 'Categoría ' + n;
    sh.appendRow([clave, nombre, presupuesto ? Number(presupuesto) : '', 'Categoría personalizada']);
    return { ok: true, n: n, row: sh.getLastRow() };
  } catch(err) { return { ok: false, error: err.message }; }
}

function eliminarFilaConfig(row) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    sh.deleteRow(row);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// LECTOR GENÉRICO DE HOJAS (transacciones, errores, etc.)
// ════════════════════════════════════════════════════════════
function getDatosHoja(nombreHoja, limit) {
  try {
    limit = limit || 100;
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(nombreHoja);
    if (!sh) return { ok: false, error: 'Hoja "' + nombreHoja + '" no encontrada' };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return { ok: true, headers: [], rows: [], total: 0 };

    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(_toStr_);
    var dataStart = Math.max(2, lastRow - limit + 1);
    var dataRows = lastRow >= 2 ? sh.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues() : [];

    var filas = dataRows
      .filter(function(r) { return r.some(function(c) { return c !== '' && c !== null; }); })
      .map(function(r) { return r.map(_toStr_); })
      .reverse(); // más recientes primero

    return { ok: true, headers: headers, filas: filas, total: lastRow - 1 };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// METAS / GOALS
// ════════════════════════════════════════════════════════════
function getMetas() {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.GOALS);
    if (!sh) return { ok: false, error: 'Hoja Goals no encontrada' };
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, metas: [], headers: [] };

    var lastCol = sh.getLastColumn();
    var data = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0].map(_toStr_);
    var metas = data.slice(1)
      .filter(function(r) { return r.some(function(c) { return c !== '' && c !== null; }); })
      .map(function(r, idx) {
        var obj = { _row: idx + 2 };
        headers.forEach(function(h, i) { obj[h] = _toStr_(r[i]); });
        return obj;
      });
    return { ok: true, metas: metas, headers: headers };
  } catch(err) { return { ok: false, error: err.message }; }
}

function agregarMeta(nombre, objetivo, fecha, descripcion) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.GOALS);
    if (!sh) return { ok: false, error: 'Hoja Goals no encontrada' };
    sh.appendRow([nombre, Number(objetivo) || 0, 0, fecha || '', descripcion || '', new Date()]);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// PAGOS PENDIENTES
// ════════════════════════════════════════════════════════════
function agregarPagoPendiente(descripcion, monto, fechaVencimiento, categoria) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.PENDING_PAYMENTS);
    if (!sh) return { ok: false, error: 'Hoja Pending Payments no encontrada' };
    sh.appendRow([descripcion, Number(monto) || 0, fechaVencimiento || '', categoria || '', 'pendiente', new Date()]);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// LISTA DE CATEGORÍAS (para selectores)
// ════════════════════════════════════════════════════════════
function getCategoriasLista() {
  try {
    var cfg = leerConfiguracion_();
    return { ok: true, categorias: cfg.categorias || [] };
  } catch(err) { return { ok: false, error: err.message }; }
}

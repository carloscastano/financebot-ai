// ============================================================
// FINANCEBOT IA — WEB APP ADMIN PANEL (v2)
// ============================================================

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? String(e.parameter.page).toLowerCase() : '';
  if (page === 'ayuda') {
    return HtmlService.createHtmlOutputFromFile('AYUDA')
      .setTitle('FinanceBot IA — Ayuda')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
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
// ════════════════════════════════════════════════════════════
// DOCUMENTACIÓN DE CONFIGURACIONES
// ════════════════════════════════════════════════════════════
function getConfigDocs() {
  try {
    return {
      ok: true,
      fields: {
        'Presupuesto mensual': 'Total máximo a gastar en el mes (COP). Base para alertas y análisis.',
        'Meta ahorro': 'Cantidad que quieres ahorrar mensualmente (COP).',
        'Umbral alerta Telegram': 'Monto de gasto único que dispara alerta — para no gastar sin darte cuenta.',
        'Alerta presupuesto %': 'Porcentaje (0.8 = 80%) al que se activan avisos por categoría.',
        'Dias recordatorio pagos': 'Días antes del vencimiento para recordarte pagar (Pending Payments).',
        'Tarjeta credito': 'Últimos dígitos o referencia de tu tarjeta de crédito principal.',
        'Tarjeta debito': 'Últimos dígitos o referencia de tu tarjeta de débito principal.',
        'Historico Desde': 'Fecha (YYYY/MM) desde la cual cargar historial de transacciones en Gmail.'
      }
    };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// ANÁLISIS HISTÓRICO DE PRESUPUESTOS POR CATEGORÍA
// Calcula gasto promedio mensual para sugerir presupuestos
// ════════════════════════════════════════════════════════════
function analizarPresupuestos() {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!sh || sh.getLastRow() < 2) return { ok: true, categorias: [], promedio: 0 };

    var data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var headers = data[0];
    var idxFecha = headers.findIndex(function(h) { return /fecha/i.test(h); });
    var idxTipo = headers.findIndex(function(h) { return /tipo/i.test(h); });
    var idxMonto = headers.findIndex(function(h) { return /monto/i.test(h); });
    var idxCat = headers.findIndex(function(h) { return /categor/i.test(h); });

    if (idxFecha < 0 || idxTipo < 0 || idxMonto < 0 || idxCat < 0) {
      return { ok: false, error: 'No se encontraron todas las columnas necesarias' };
    }

    var ahora = new Date();
    var mesesAtras = 3;
    var desde = new Date(ahora.getFullYear(), ahora.getMonth() - mesesAtras, 1);

    var porMes = {};
    var totalPorCat = {};

    for (var i = 1; i < data.length; i++) {
      var fila = data[i];
      var fecha = fila[idxFecha];
      if (!fecha) continue;
      var fd = fecha instanceof Date ? fecha : new Date(fecha);
      if (isNaN(fd.getTime()) || fd < desde) continue;

      var tipo = String(fila[idxTipo]).toLowerCase();
      if (tipo !== 'egreso') continue;

      var monto = Number(fila[idxMonto]) || 0;
      var cat = String(fila[idxCat] || 'Otro').trim();
      var mesKey = fd.getFullYear() + '-' + ('0' + (fd.getMonth() + 1)).slice(-2);

      if (!porMes[mesKey]) porMes[mesKey] = {};
      if (!porMes[mesKey][cat]) porMes[mesKey][cat] = 0;
      porMes[mesKey][cat] += monto;

      if (!totalPorCat[cat]) totalPorCat[cat] = { suma: 0, meses: 0 };
      totalPorCat[cat].suma += monto;
    }

    var mesesUnicos = Object.keys(porMes).length || 1;
    var cfg = leerConfiguracion_();
    var categoriasConfiguradas = (cfg.categorias || []).map(function(c) { return c; });

    var resultado = [];
    for (var cat in totalPorCat) {
      var promedio = Math.round(totalPorCat[cat].suma / mesesUnicos);
      resultado.push({
        categoria: cat,
        totalGastado: totalPorCat[cat].suma,
        mesesDatos: mesesUnicos,
        promedio: promedio,
        recomendacion: Math.round(promedio * 1.1)
      });
    }

    // Agregar categorías configuradas sin gasto en últimos 3 meses
    categoriasConfiguradas.forEach(function(c) {
      if (!resultado.find(function(r) { return r.categoria === c; })) {
        resultado.push({
          categoria: c,
          totalGastado: 0,
          mesesDatos: 0,
          promedio: 0,
          recomendacion: 0
        });
      }
    });

    resultado.sort(function(a, b) { return b.totalGastado - a.totalGastado; });

    return { ok: true, categorias: resultado, mesesAnalisis: mesesUnicos };
  } catch(err) { return { ok: false, error: err.message }; }
}

function aplicarPresupuestosAnalisis(presupuestos) {
  try {
    // presupuestos es un array: [{ categoria: "Alimentación", recomendacion: 500000 }, ...]
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    if (!sh) return { ok: false, error: 'Hoja Configurations no encontrada' };

    var data = sh.getRange(1, 1, sh.getLastRow(), 3).getValues();
    var actualizado = 0;

    for (var i = 1; i < data.length; i++) {
      var clave = String(data[i][0] || '').trim();
      if (!clave) continue;
      var m = clave.match(/^Categor[íi]a\s+(\d+)$/i);
      if (!m) continue;

      var catName = String(data[i][1] || '').trim();
      var presup = presupuestos.find(function(p) { return p.categoria === catName; });
      if (presup && presup.recomendacion > 0) {
        sh.getRange(i + 1, 3).setValue(Number(presup.recomendacion));
        actualizado++;
      }
    }

    return { ok: true, actualizado: actualizado };
  } catch(err) { return { ok: false, error: err.message }; }
}

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
// LECTOR GENÉRICO DE HOJAS — RETORNA TAMBIÉN ÍNDICES DE COLUMNAS
// fromTop=true  → lee desde fila 2 (hojas ya ordenadas desc como Transactions)
// fromTop=false → lee últimas N filas + reversa (hojas append-only como Errors)
// ════════════════════════════════════════════════════════════
function getDatosHoja(nombreHoja, limit, fromTop) {
  try {
    limit = limit || 100;
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(nombreHoja);
    if (!sh) return { ok: false, error: 'Hoja "' + nombreHoja + '" no encontrada' };

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return { ok: true, headers: [], filas: [], total: 0, columnMap: {} };

    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(_toStr_);
    // Crear map: nombre_header → índice (para búsquedas case-insensitive)
    var columnMap = {};
    headers.forEach(function(h, idx) {
      columnMap[h.toLowerCase()] = idx;
    });

    var rawRows = [];

    if (fromTop) {
      // Hoja ya ordenada desc (más reciente arriba) → leer desde fila 2
      var count = Math.min(lastRow - 1, limit);
      rawRows = count > 0 ? sh.getRange(2, 1, count, lastCol).getValues() : [];
    } else {
      // Hoja append-only (más reciente abajo) → tomar últimas N + invertir
      var dataStart = Math.max(2, lastRow - limit + 1);
      rawRows = lastRow >= 2 ? sh.getRange(dataStart, 1, lastRow - dataStart + 1, lastCol).getValues() : [];
      rawRows = rawRows.slice().reverse();
    }

    var filas = rawRows
      .filter(function(r) { return r.some(function(c) { return c !== '' && c !== null; }); })
      .map(function(r) { return r.map(_toStr_); });

    return { ok: true, headers: headers, filas: filas, total: lastRow - 1, columnMap: columnMap };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// PENDIENTES CON NÚMERO DE FILA (para edición)
// ════════════════════════════════════════════════════════════
function getPendingPayments() {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.PENDING_PAYMENTS);
    if (!sh) return { ok: false, error: 'Hoja Pending Payments no encontrada' };
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return { ok: true, headers: [], items: [] };

    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(_toStr_);
    var data    = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

    var items = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i].some(function(c) { return c !== '' && c !== null; })) continue;
      var obj = { _row: i + 2 };
      headers.forEach(function(h, j) { obj[h] = _toStr_(data[i][j]); });
      items.push(obj);
    }
    // Más recientes al tope: invertir (último appendRow = más nuevo)
    items.reverse();
    return { ok: true, headers: headers, items: items };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Cols reales: Servicio|Monto Aprox|Día Vencimiento|Frecuencia|Cuenta/Referencia|Recordar (días antes)|Estado|Notas|Último Pago
function actualizarPagoPendiente(row, servicio, monto, diaVencimiento, frecuencia, cuentaRef, diasAntes, estado, notas) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.PENDING_PAYMENTS);
    var existing = sh.getRange(row, 1, 1, 9).getValues()[0];
    sh.getRange(row, 1, 1, 9).setValues([[
      servicio       !== undefined ? servicio       : existing[0],
      monto          !== undefined ? Number(monto)  : existing[1],
      diaVencimiento !== undefined ? diaVencimiento : existing[2],
      frecuencia     !== undefined ? frecuencia     : existing[3],
      cuentaRef      !== undefined ? cuentaRef      : existing[4],
      diasAntes      !== undefined ? Number(diasAntes) : existing[5],
      estado         !== undefined ? estado         : existing[6],
      notas          !== undefined ? notas          : existing[7],
      existing[8]                                    // Último Pago sin cambio
    ]]);
    return { ok: true };
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

function actualizarMeta(row, nombre, objetivo, fechaLimite, ahorrado, estado) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.GOALS);
    if (!sh) return { ok: false, error: 'Hoja Goals no encontrada' };
    // Cols: ID | Meta | Objetivo | Fecha Limite | Ahorrado | Estado | Creado | Último Abono | Etiqueta
    var existing = sh.getRange(row, 1, 1, 9).getValues()[0];
    sh.getRange(row, 2).setValue(nombre || existing[1]);        // Meta
    sh.getRange(row, 3).setValue(Number(objetivo) || existing[2]); // Objetivo
    sh.getRange(row, 4).setValue(fechaLimite || existing[3]);   // Fecha Limite
    sh.getRange(row, 5).setValue(Number(ahorrado) || existing[4]); // Ahorrado
    sh.getRange(row, 6).setValue(estado || existing[5]);        // Estado
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

function agregarMeta(nombre, objetivo, fecha, descripcion) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.GOALS);
    if (!sh) return { ok: false, error: 'Hoja Goals no encontrada' };
    // Cols: ID | Meta | Objetivo | Fecha Limite | Ahorrado | Estado | Creado | Último Abono | Etiqueta
    var id = 'META-' + Date.now().toString(36).toUpperCase();
    sh.appendRow([id, nombre, Number(objetivo) || 0, fecha || '', 0, 'activo',
                  new Date().toISOString().substring(0, 10), '', descripcion || '']);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// PAGOS PENDIENTES
// ════════════════════════════════════════════════════════════
// Cols reales: Servicio|Monto Aprox|Día Vencimiento|Frecuencia|Cuenta/Referencia|Recordar (días antes)|Estado|Notas|Último Pago
function agregarPagoPendiente(servicio, monto, diaVencimiento, frecuencia, cuentaRef, diasAntes, estado, notas) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.PENDING_PAYMENTS);
    if (!sh) return { ok: false, error: 'Hoja Pending Payments no encontrada' };
    sh.appendRow([
      servicio       || '',
      Number(monto)  || 0,
      diaVencimiento || '',
      frecuencia     || 'Mensual',
      cuentaRef      || '',
      Number(diasAntes) || 3,
      estado         || 'Activo',
      notas          || '',
      ''              // Último Pago vacío al crear
    ]);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// FEATURE FLAGS
// ════════════════════════════════════════════════════════════
// Mapa feature → trigger (si null, no requiere trigger — es inline)
var FEATURE_TRIGGER_MAP_ = {
  reporte_semanal:     { handler: 'run_reporteSemanal',            schedule: 'weeklyMon7' },
  reporte_mensual:     { handler: 'analizarFinanzas',              schedule: 'daily7'     },
  revision_dia25:      { handler: 'run_verificarPresupuestoMensual', schedule: 'daily8'   },
  recordatorio_pagos:  { handler: 'recordarPagosPendientes',       schedule: 'daily9'     },
  recordatorio_metas:  { handler: 'recordarMetasSinAbono',         schedule: 'daily9'     },
  alerta_presupuesto:  null, // inline en cada tx
  alerta_gasto_alto:   null,
  chat_financiero:     null
};

function _crearTriggerPara_(handler, schedule) {
  var b = ScriptApp.newTrigger(handler).timeBased();
  if (schedule === 'weeklyMon7') return b.onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  if (schedule === 'daily7')     return b.atHour(7).everyDays(1).create();
  if (schedule === 'daily8')     return b.atHour(8).everyDays(1).create();
  if (schedule === 'daily9')     return b.atHour(9).everyDays(1).create();
  if (schedule === 'every5m')    return b.everyMinutes(5).create();
  if (schedule === 'every1m')    return b.everyMinutes(1).create();
  return null;
}

function _eliminarTriggersHandler_(handler) {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === handler) { ScriptApp.deleteTrigger(t); n++; }
  });
  return n;
}

function _triggerExiste_(handler) {
  return ScriptApp.getProjectTriggers().some(function(t) { return t.getHandlerFunction() === handler; });
}

function getFeatures() {
  try {
    var features = FEATURES_CATALOGO_.map(function(f) {
      var map = FEATURE_TRIGGER_MAP_[f.id];
      return {
        id:           f.id,
        nombre:       f.nombre,
        descripcion:  f.descripcion,
        activa:       isFeatureEnabled_(f.id),
        tieneTrigger: !!map,
        triggerOk:    map ? _triggerExiste_(map.handler) : true
      };
    });
    return { ok: true, features: features };
  } catch(err) { return { ok: false, error: err.message }; }
}

function toggleFeature(featureId, activa) {
  try {
    setFeature_(featureId, activa);
    // Sincronizar trigger asociado
    var map = FEATURE_TRIGGER_MAP_[featureId];
    var trigInfo = '';
    if (map) {
      _eliminarTriggersHandler_(map.handler); // siempre limpia antes
      if (activa) {
        _crearTriggerPara_(map.handler, map.schedule);
        trigInfo = 'trigger creado: ' + map.handler;
      } else {
        trigInfo = 'trigger eliminado: ' + map.handler;
      }
    }
    return { ok: true, id: featureId, activa: activa, trigInfo: trigInfo };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Sincroniza TODOS los triggers con el estado actual de los features
// (útil después de un reset, o como reparador)
function sincronizarTriggersConFeatures() {
  try {
    // Triggers base que siempre van (ingesta de datos)
    var baseFijos = {
      'procesarEmailsBancolombia': 'every5m',
      'procesarMensajesTelegram':  'every1m'
    };
    // Limpia todo y reconstruye
    ScriptApp.getProjectTriggers().forEach(function(t) { ScriptApp.deleteTrigger(t); });
    var creados = [];
    Object.keys(baseFijos).forEach(function(h) {
      _crearTriggerPara_(h, baseFijos[h]); creados.push(h);
    });
    FEATURES_CATALOGO_.forEach(function(f) {
      var map = FEATURE_TRIGGER_MAP_[f.id];
      if (map && isFeatureEnabled_(f.id)) {
        _crearTriggerPara_(map.handler, map.schedule); creados.push(map.handler);
      }
    });
    return { ok: true, creados: creados, count: creados.length };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// SETUP WIZARD — para usuarios no técnicos
// ════════════════════════════════════════════════════════════
function getSetupStatus() {
  try {
    var props = PropertiesService.getScriptProperties();
    var hasToken   = !!props.getProperty('TELEGRAM_BOT_TOKEN');
    var hasChat    = !!props.getProperty('TELEGRAM_CHAT_ID');
    var hasGemini  = !!props.getProperty('GEMINI_API_KEY');
    var hasSheet   = !!props.getProperty('SPREADSHEET_ID');
    var setupDone  = props.getProperty('SETUP_COMPLETE') === 'true';
    var triggers   = ScriptApp.getProjectTriggers().length;
    return {
      ok: true,
      setupComplete: setupDone && hasToken && hasChat && hasGemini,
      steps: {
        sheet:    hasSheet,
        telegram: hasToken,
        chat:     hasChat,
        gemini:   hasGemini,
        triggers: triggers > 0
      }
    };
  } catch(err) { return { ok: false, error: err.message }; }
}

function validarTokenTelegram(token) {
  try {
    token = String(token || '').trim();
    if (!token) return { ok: false, error: 'Token vacío' };
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getMe', { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());
    if (!data.ok) return { ok: false, error: data.description || 'Token inválido' };
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_BOT_TOKEN', token);
    return { ok: true, botName: data.result.first_name, username: data.result.username };
  } catch(err) { return { ok: false, error: err.message }; }
}

function detectarChatIdTelegram() {
  try {
    var token = PropertiesService.getScriptProperties().getProperty('TELEGRAM_BOT_TOKEN');
    if (!token) return { ok: false, error: 'Primero valida el token del bot' };
    var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates', { muteHttpExceptions: true });
    var data = JSON.parse(resp.getContentText());
    if (!data.ok || !data.result || data.result.length === 0) {
      return { ok: false, error: 'No hay mensajes. Abre Telegram, busca tu bot y envía /start.' };
    }
    var ultimo = data.result[data.result.length - 1];
    var chat = ultimo.message && ultimo.message.chat;
    if (!chat) return { ok: false, error: 'No se detectó chat. Envía /start al bot.' };
    PropertiesService.getScriptProperties().setProperty('TELEGRAM_CHAT_ID', String(chat.id));
    return { ok: true, chatId: String(chat.id), nombre: chat.first_name || chat.username || 'tu cuenta' };
  } catch(err) { return { ok: false, error: err.message }; }
}

function validarApiKeyGemini(apiKey) {
  try {
    apiKey = String(apiKey || '').trim();
    if (!apiKey) return { ok: false, error: 'API key vacía' };
    var url = (CONFIG.GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent') + '?key=' + apiKey;
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ contents: [{ parts: [{ text: 'di hola en una palabra' }] }] }),
      muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code !== 200) {
      var err = JSON.parse(resp.getContentText());
      return { ok: false, error: (err.error && err.error.message) || ('HTTP ' + code) };
    }
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

function finalizarSetup() {
  try {
    var props = PropertiesService.getScriptProperties();
    if (!props.getProperty('SPREADSHEET_ID')) {
      props.setProperty('SPREADSHEET_ID', CONFIG.SPREADSHEET_ID || SpreadsheetApp.getActiveSpreadsheet().getId());
    }
    try { configurarTriggers(); } catch(e) { Logger.log('triggers: ' + e.message); }
    props.setProperty('SETUP_COMPLETE', 'true');
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// TRANSACCIONES — lectura con row numbers + edición
// ════════════════════════════════════════════════════════════
function getTransacciones(limit) {
  try {
    limit = limit || 100;
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!sh) return { ok: false, error: 'Hoja Transactions no encontrada' };
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) return { ok: true, headers: [], items: [], total: 0 };

    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(_toStr_);
    var count   = Math.min(lastRow - 1, limit);
    var data    = sh.getRange(2, 1, count, lastCol).getValues();

    var items = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i].some(function(c) { return c !== '' && c !== null; })) continue;
      var obj = { _row: i + 2 };
      headers.forEach(function(h, j) {
        var val = j < data[i].length ? data[i][j] : '';
        obj[h] = _toStr_(val);
      });
      // Alias robustos por posición (columna H = idx 7 es Comercio; columna J = idx 9 Categoria; etc.)
      // Esto asegura que el frontend encuentre la columna aunque el header tenga otro nombre
      if (data[i].length > 7)  obj['Comercio']     = _toStr_(data[i][7]);
      if (data[i].length > 9)  obj['Categoria']    = _toStr_(data[i][9]);
      if (data[i].length > 10) obj['Subcategoria'] = _toStr_(data[i][10]);
      if (data[i].length > 11) obj['Necesidad']    = _toStr_(data[i][11]);
      if (data[i].length > 13) obj['Referencia']   = _toStr_(data[i][13]);
      items.push(obj);
    }

    var cfg = leerConfiguracion_();
    return { ok: true, headers: headers, items: items, total: lastRow - 1, categorias: cfg.categorias || [] };
  } catch(err) { return { ok: false, error: err.message }; }
}

// Cols editables: Fecha(2) Tipo(4) Monto(6) Comercio/Destino(8) Categoria(10) Subcategoria(11) Necesidad(12) Referencia(14)
function actualizarTransaccion(row, fecha, tipo, monto, comercio, categoria, subcategoria, necesidad, referencia) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!sh) return { ok: false, error: 'Hoja Transactions no encontrada' };
    var existing = sh.getRange(row, 1, 1, 18).getValues()[0];
    var updates = existing.slice(); // copia
    if (fecha      !== undefined && fecha      !== '') updates[1]  = fecha;
    if (tipo       !== undefined && tipo       !== '') updates[3]  = tipo;
    if (monto      !== undefined && monto      !== '') updates[5]  = Number(monto);
    if (comercio   !== undefined && comercio   !== '') updates[7]  = comercio;
    if (categoria  !== undefined && categoria  !== '') updates[9]  = categoria;
    if (subcategoria !== undefined)                    updates[10] = subcategoria;
    if (necesidad  !== undefined && necesidad  !== '') updates[11] = necesidad;
    if (referencia !== undefined)                      updates[13] = referencia;
    sh.getRange(row, 1, 1, 18).setValues([updates]);
    return { ok: true };
  } catch(err) { return { ok: false, error: err.message }; }
}

function eliminarTransaccion(row) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!sh) return { ok: false, error: 'Hoja Transactions no encontrada' };
    sh.deleteRow(row);
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

// URL pública del web app (la del /exec) — para abrir ?page=ayuda en nueva pestaña
function getWebAppUrl() {
  try {
    return { ok: true, url: ScriptApp.getService().getUrl() };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// TRIGGERS — estado y activación desde el panel web
// ════════════════════════════════════════════════════════════
function getTriggersEstado() {
  try {
    var ts = ScriptApp.getProjectTriggers();
    var items = ts.map(function(t) {
      return { handler: t.getHandlerFunction(), source: String(t.getTriggerSource()) };
    });
    return { ok: true, count: ts.length, items: items };
  } catch(err) { return { ok: false, error: err.message }; }
}

function activarTodosLosTriggers() {
  try {
    var r = sincronizarTriggersConFeatures();
    if (!r.ok) return r;
    return { ok: true, mensaje: r.count + ' triggers sincronizados con features activas' };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// CUENTAS DISTINTAS (para filtro de Transactions)
// ════════════════════════════════════════════════════════════
function getCuentasDistintas() {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!sh || sh.getLastRow() < 2) return { ok: true, cuentas: [] };
    // Columna O (índice 14) — Cuenta; si no existe, intenta deducir de Referencia (idx 13)
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(_toStr_);
    var idxCuenta = -1;
    headers.forEach(function(h, i) {
      var hl = String(h).toLowerCase();
      if (hl.indexOf('cuenta') !== -1 || hl.indexOf('tarjeta') !== -1) idxCuenta = i;
    });
    var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    var set = {};
    for (var i = 0; i < data.length; i++) {
      var val = idxCuenta >= 0 ? data[i][idxCuenta] : data[i][13];
      var s = String(val || '').trim();
      // Capturar patrones tipo *8352, **8191, 4444
      var m = s.match(/\*+\s*(\d{3,5})/);
      var key = m ? '*' + m[1] : (s && /^\d{3,5}$/.test(s) ? '*' + s : '');
      if (key) set[key] = (set[key] || 0) + 1;
    }
    var cuentas = Object.keys(set).map(function(k) { return { cuenta: k, count: set[k] }; })
      .sort(function(a, b) { return b.count - a.count; });
    return { ok: true, cuentas: cuentas };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// AGREGAR TRANSACCIÓN MANUAL desde el panel web
// ════════════════════════════════════════════════════════════
function agregarTransaccionWeb(fecha, tipo, monto, comercio, categoria, subcategoria, necesidad, referencia, cuenta) {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!sh) return { ok: false, error: 'Hoja Transactions no encontrada' };
    var nowIso = new Date();
    var fechaParse;
    if (fecha) {
      // Soporta dd/MM/yyyy o yyyy-MM-dd
      var m1 = String(fecha).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      var m2 = String(fecha).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m1) fechaParse = new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]));
      else if (m2) fechaParse = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]));
      else fechaParse = nowIso;
    } else fechaParse = nowIso;

    var id = 'TX-WEB-' + Utilities.formatDate(nowIso, 'America/Bogota', 'yyyyMMddHHmmss');
    var row = new Array(18).fill('');
    row[0] = id;
    row[1] = fechaParse;
    row[2] = '';                            // Hora
    row[3] = tipo || 'egreso';
    row[4] = '';                            // Origen
    row[5] = Number(monto) || 0;
    row[6] = 'COP';
    row[7] = comercio || '';
    row[8] = '';
    row[9] = categoria || 'Otro';
    row[10] = subcategoria || '';
    row[11] = necesidad || 'necesario';
    row[12] = '';
    row[13] = referencia || '';
    row[14] = cuenta || '';
    row[15] = 'web';
    row[16] = Utilities.formatDate(nowIso, 'America/Bogota', 'yyyy-MM-dd HH:mm:ss');
    row[17] = 'manual';
    sh.appendRow(row);
    return { ok: true, row: sh.getLastRow(), id: id };
  } catch(err) { return { ok: false, error: err.message }; }
}

// ════════════════════════════════════════════════════════════
// EXPORT CSV — devuelve string CSV de todas las transacciones
// ════════════════════════════════════════════════════════════
function exportarTransaccionesCSV() {
  try {
    var ss = _ssWeb_();
    var sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
    if (!sh || sh.getLastRow() < 2) return { ok: true, csv: '' };
    var data = sh.getDataRange().getValues();
    var rows = data.map(function(r) {
      return r.map(function(c) {
        var s = (c instanceof Date) ? Utilities.formatDate(c, 'America/Bogota', 'yyyy-MM-dd') : String(c == null ? '' : c);
        if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
          s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      }).join(',');
    });
    return { ok: true, csv: rows.join('\n'), total: data.length - 1 };
  } catch(err) { return { ok: false, error: err.message }; }
}

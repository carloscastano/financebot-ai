// ============================================================
// FINANCEBOT AI - OPERACIONES GOOGLE SHEETS
// ============================================================

// Nombres de hojas — referencia centralizada
const SHEETS = {
  TRANSACTIONS:       'Transactions',
  ERRORS:             'Errors',
  DASHBOARD:          'Dashboard',
  CONFIGURATIONS:     'Configurations',
  PENDING_PAYMENTS:   'Pending Payments',
  SEARCH_PRODUCTS:    'Search Products',
  DATA_DICTIONARY:    'DataDictionary',
  FINANCIAL_INSIGHTS: 'Financial Insights',
  GOALS:              'Goals',
};

// ------------------------------------------------------------
// ESCRIBE UNA TRANSACCIÓN EN LA HOJA "Transactions"
// Después de insertar, reordena por Fecha desc + Hora desc
// ------------------------------------------------------------
function escribirTransaccion_(sheet, txn) {
  const id = 'TXN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  const procesadoEn = new Date().toISOString();

  // Validar categoría contra la lista maestra de Configurations
  // Si no está en la lista → forzar 'Otro' para mantener consistencia
  const cfg = leerConfiguracion_();
  const listaLower = cfg.categorias.map(function(c) { return c.toLowerCase(); });
  const catOriginal = String(txn.categoria || '').trim();
  if (catOriginal && !listaLower.includes(catOriginal.toLowerCase())) {
    logWarn_('SHEETS', 'Categoria "' + catOriginal + '" no esta en la lista; se guarda como "Otro"');
    txn.categoria = 'Otro';
  }

  sheet.appendRow([
    id,                          // A - ID
    txn.fecha        || '',      // B - Fecha
    txn.hora         || '',      // C - Hora
    txn.tipo         || '',      // D - Tipo
    txn.tipo_transaccion || '',  // E - Tipo Transaccion
    txn.monto        || 0,       // F - Monto
    txn.moneda       || 'COP',   // G - Moneda
    txn.comercio     || '',      // H - Comercio/Destino
    txn.cuenta       || '',      // I - Cuenta Origen
    txn.categoria    || '',      // J - Categoria
    txn.subcategoria || '',      // K - Subcategoria
    txn.necesidad    || '',      // L - Necesidad
    txn.sugerencia   || '',      // M - Sugerencia
    txn.referencia   || '',      // N - Referencia
    txn.confianza    || 0,       // O - Confianza
    txn.fuente       || 'email', // P - Fuente
    procesadoEn,                 // Q - Procesado
    txn.banco        || '',      // R - Banco Origen
  ]);

  // Hook alertas de presupuesto (solo entradas en tiempo real, no imports masivos)
  if (txn.fuente === 'telegram' || txn.fuente === 'email') {
    try { verificarAlertaPresupuesto_(txn); } catch(e) { logWarn_('BUDGET', 'Budget alert error: ' + _safeErrMsg_(e)); }
  }

  // Ordenar: más reciente arriba (excepto cargas masivas)
  const fuente = String(txn.fuente || '').toLowerCase();
  if (fuente !== 'historico' && fuente !== 'extracto') {
    ordenarTransaccionesSheet_(sheet);
  }
}

function ordenarTransaccionesSheet_(sheet) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn())
         .sort([{ column: 2, ascending: false }, { column: 3, ascending: false }]);
  }
}

// ------------------------------------------------------------
// NORMALIZA CATEGORÍAS EN TRANSACTIONS
// Corrige categorías no estándar que Gemini inventó.
// Ejecutar manualmente una vez desde Apps Script.
// ------------------------------------------------------------
function normalizarCategorias() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet || sheet.getLastRow() < 2) return;

  // Mapa: valor incorrecto → valor estándar
  const MAPA = {
    'home':           'Hogar',
    'hogar':          'Hogar',
    'comida':         'Alimentación',
    'alimentacion':   'Alimentación',
    'restaurantes':   'Alimentación',
    'ropa':           'Ropa y Personal',
    'ropa y personal':'Ropa y Personal',
    'viviendas':      'Vivienda',
    'vivienda':       'Vivienda',
    'prestamo':       'Financiero',
    'préstamo':       'Financiero',
    'pago tarjeta':   'Financiero',
    'impuestos':      'Servicios',
    'ejercicio':      'Salud',
    'salud':          'Salud',
    'servicios':      'Servicios',
    'transporte':     'Transporte',
    'transferencia':  'Transferencia',
    'salario':        'Salario',
    'educacion':      'Educación',
    'educación':      'Educación',
    'entretenimiento':'Entretenimiento',
    'financiero':     'Financiero',
    'otro':           'Otro',
  };

  const lastRow = sheet.getLastRow();
  const colCat  = 10; // columna J = Categoría
  const rango   = sheet.getRange(2, colCat, lastRow - 1, 1);
  const valores = rango.getValues();

  let corregidos = 0;
  valores.forEach(function(fila, i) {
    const original = String(fila[0]).trim();
    const clave    = original.toLowerCase();
    if (MAPA[clave] && MAPA[clave] !== original) {
      valores[i][0] = MAPA[clave];
      corregidos++;
      logInfo_('SHEETS', 'Fila ' + (i + 2) + ': "' + original + '" -> "' + MAPA[clave] + '"');
    }
  });

  if (corregidos > 0) {
    rango.setValues(valores);
    logInfo_('SHEETS', 'Categorias normalizadas: ' + corregidos + ' correcciones');
  } else {
    logInfo_('SHEETS', 'Todas las categorias ya estan correctas');
  }
}

// ------------------------------------------------------------
// ORDENA TRANSACTIONS MANUALMENTE — ejecutar desde Apps Script
// ------------------------------------------------------------
function ordenarTransacciones() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet) return;
  ordenarTransaccionesSheet_(sheet);
  logInfo_('SHEETS', 'Transactions ordenadas: mas reciente arriba');
}

// ------------------------------------------------------------
// REGISTRA UN ERROR EN LA HOJA "Errors"
// ------------------------------------------------------------
function registrarError_(sheet, mensajeError, asunto, emailId) {
  sheet.appendRow([
    'ERR-' + Date.now(),
    mensajeError,
    asunto,
    emailId,
    new Date().toISOString(),
  ]);
}

// ------------------------------------------------------------
// LEE LA CONFIGURACIÓN DESDE LA HOJA "Configurations"
// ------------------------------------------------------------
function leerConfiguracion_() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.CONFIGURATIONS);
    if (!sheet) return configuracionPorDefecto_();
    const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
    const cfg = {};
    const budgetPorCategoria = {}; // col C en filas de Categoría N
    datos.forEach(([p, v, b]) => {
      if (p) {
        cfg[p.trim()] = v;
        // Si es una fila "Categoría N" con presupuesto en col C
        if (/^Categor[íi]a\s+\d+$/i.test(String(p).trim()) && b && Number(b) > 0) {
          budgetPorCategoria[String(v).trim()] = Number(b);
        }
      }
    });

    // Construir query de Gmail desde los senders activos en la hoja
    // Cada "Banco N sender" puede tener múltiples dominios separados por coma
    const dominios = [];
    for (let i = 1; i <= 10; i++) {
      const sender = cfg['Banco ' + i + ' sender'];
      if (sender && String(sender).trim()) {
        String(sender).split(',').forEach(function(s) {
          const d = s.trim();
          if (d) dominios.push(d);
        });
      }
    }
    const gmailQuery = dominios.length > 0
      ? 'from:(' + dominios.join(' OR ') + ')'
      : 'from:(@notificacionesbancolombia.com OR @bancolombia.com.co)';

    // Leer categorías: "Categoría 1", "Categoría 2", ...
    const categorias = [];
    for (let i = 1; i <= 20; i++) {
      const cat = cfg['Categoría ' + i] || cfg['Categoria ' + i];
      if (cat && String(cat).trim()) categorias.push(String(cat).trim());
    }
    if (categorias.length === 0) {
      // Fallback si aún no se han configurado
      categorias.push(...CATEGORIAS_DEFECTO_);
    }

    // Presupuestos: col C en la fila de categoría (nuevo formato)
    // Fallback: fila separada "Presupuesto Alimentación" (formato anterior)
    const presupuestos = {};
    categorias.forEach(function(cat) {
      if (budgetPorCategoria[cat]) {
        presupuestos[cat] = budgetPorCategoria[cat];
      } else {
        const val = cfg['Presupuesto ' + cat];
        if (val && Number(val) > 0) presupuestos[cat] = Number(val);
      }
    });

    return {
      presupuestoMensual:   cfg['Presupuesto mensual']     || 3000000,
      metaAhorro:           cfg['Meta ahorro']             || 500000,
      umbralAlerta:         cfg['Umbral alerta Telegram']  || 200000,
      alertaPresupuestoPct: cfg['Alerta presupuesto %']    || 0.8,
      diasRecordatorio:     cfg['Dias recordatorio pagos'] || 3,
      tarjetaCredito:       cfg['Tarjeta credito']         || '',
      tarjetaDebito:        cfg['Tarjeta debito']          || '',
      historicoDesde: (function() {
        var v = cfg['Historico Desde'];
        if (!v) return '2024/01';
        if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy/MM');
        return String(v).trim();
      })(),
      gmailQuery:           gmailQuery,
      categorias:           categorias,
      presupuestos:         presupuestos,
      // Exponer claves raw para que detectarBanco_() pueda matchear
      'Banco 1 nombre':     cfg['Banco 1 nombre'] || 'Bancolombia',
      'Banco 1 sender':     cfg['Banco 1 sender'] || '@notificacionesbancolombia.com,@bancolombia.com.co',
      'Banco 2 nombre':     cfg['Banco 2 nombre'] || '',
      'Banco 2 sender':     cfg['Banco 2 sender'] || '',
      'Banco 3 nombre':     cfg['Banco 3 nombre'] || '',
      'Banco 3 sender':     cfg['Banco 3 sender'] || '',
    };
  } catch(e) {
    logWarn_('SHEETS', 'Config no disponible, usando defaults: ' + _safeErrMsg_(e));
    return configuracionPorDefecto_();
  }
}

// Lista de categorías estándar — usada como fallback
const CATEGORIAS_DEFECTO_ = [
  'Alimentación', 'Transporte', 'Vivienda', 'Salud', 'Educación',
  'Entretenimiento', 'Servicios', 'Ropa y Personal', 'Hogar',
  'Financiero', 'Transferencia', 'Salario', 'Otro',
];

function configuracionPorDefecto_() {
  return {
    presupuestoMensual: 3000000, metaAhorro: 500000, umbralAlerta: 200000,
    alertaPresupuestoPct: 0.8, diasRecordatorio: 3,
    tarjetaCredito: '', tarjetaDebito: '',
    gmailQuery: 'from:(@notificacionesbancolombia.com OR @bancolombia.com.co)',
    categorias: CATEGORIAS_DEFECTO_.slice(),
    presupuestos: {},
  };
}

// ------------------------------------------------------------
// MIGRACIÓN: agrega categorías a la hoja Configurations existente
// Ejecutar UNA SOLA VEZ. Las categorías quedan editables por el usuario.
// ------------------------------------------------------------
function agregarConfigCategorias() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.CONFIGURATIONS);
  if (!sheet) { logError_('SHEETS', 'Hoja Configurations no encontrada'); return; }

  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  if (datos.some(function(p) { return String(p).startsWith('Categoría'); })) {
    logInfo_('SHEETS', 'Categorias ya configuradas. No se hicieron cambios');
    return;
  }

  // Separador visual
  sheet.appendRow(['--- Categorías ---', '', 'Edita, agrega o elimina categorías. El bot y el dashboard usarán esta lista.']);

  CATEGORIAS_DEFECTO_.forEach(function(cat, i) {
    sheet.appendRow(['Categoría ' + (i + 1), cat, '']);
  });

  logInfo_('SHEETS', CATEGORIAS_DEFECTO_.length + ' categorias agregadas a Configurations');
}

// ------------------------------------------------------------
// SINCRONIZA CATEGORÍAS: renombra en Transactions cuando cambias
// un nombre en Configurations. Uso: modifica el valor en la hoja
// y llama sincronizarCategorias({viejo: 'Home', nuevo: 'Hogar'})
// O ejecuta sin parámetros para normalizar con el mapa estándar.
// ------------------------------------------------------------
function sincronizarCategorias(opciones) {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.TRANSACTIONS);
  if (!sheet || sheet.getLastRow() < 2) return;

  const cfg       = leerConfiguracion_();
  const listaSet  = new Set(cfg.categorias.map(function(c) { return c.toLowerCase(); }));

  const lastRow = sheet.getLastRow();
  const rango   = sheet.getRange(2, 10, lastRow - 1, 1); // col J = Categoría
  const valores = rango.getValues();

  // Mapa de normalización heredado + renombre puntual si se pasa opciones
  const MAPA_NORM = {
    'home': 'Hogar', 'comida': 'Alimentación', 'restaurantes': 'Alimentación',
    'ropa': 'Ropa y Personal', 'viviendas': 'Vivienda', 'prestamo': 'Financiero',
    'préstamo': 'Financiero', 'pago tarjeta': 'Financiero', 'impuestos': 'Servicios',
    'ejercicio': 'Salud', 'alimentacion': 'Alimentación',
  };
  if (opciones && opciones.viejo && opciones.nuevo) {
    MAPA_NORM[opciones.viejo.toLowerCase()] = opciones.nuevo;
  }

  let corregidos = 0;
  valores.forEach(function(fila, i) {
    const original = String(fila[0]).trim();
    const clave    = original.toLowerCase();

    // 1. Aplicar mapa de normalización
    if (MAPA_NORM[clave] && MAPA_NORM[clave] !== original) {
      logInfo_('SHEETS', 'Fila ' + (i + 2) + ': "' + original + '" -> "' + MAPA_NORM[clave] + '"');
      valores[i][0] = MAPA_NORM[clave];
      corregidos++;
      return;
    }
    // 2. Si la categoría no está en la lista maestra → 'Otro'
    if (original && !listaSet.has(clave)) {
      logWarn_('SHEETS', 'Fila ' + (i + 2) + ': "' + original + '" no reconocida -> "Otro"');
      valores[i][0] = 'Otro';
      corregidos++;
    }
  });

  if (corregidos > 0) {
    rango.setValues(valores);
    logInfo_('SHEETS', 'Sincronizacion completa: ' + corregidos + ' filas actualizadas');
  } else {
    logInfo_('SHEETS', 'Todas las categorias ya estan alineadas');
  }
}

// ------------------------------------------------------------
// MIGRACIÓN: agrega filas de bancos/senders a la hoja Configurations existente
// Ejecutar UNA SOLA VEZ en producción
// ------------------------------------------------------------
function agregarConfigBancos() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.CONFIGURATIONS);
  if (!sheet) { logError_('SHEETS', 'Hoja Configurations no encontrada'); return; }

  // Verificar si ya existen las filas de bancos
  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  if (datos.some(p => String(p).startsWith('Banco 1'))) {
    logInfo_('SHEETS', 'Configuracion de bancos ya existe. No se hicieron cambios');
    return;
  }

  const nuevasFilas = [
    ['Banco 1 nombre', 'Bancolombia',                                         'Nombre del banco (referencia visual)'],
    ['Banco 1 sender', '@notificacionesbancolombia.com,@bancolombia.com.co',   'Dominios del remitente separados por coma. El bot construye la query de Gmail con estos valores.'],
    ['Banco 2 nombre', '',                                                     'Vacío = banco no activo. Ejemplo: Nequi'],
    ['Banco 2 sender', '',                                                     'Ejemplo: @nequi.com.co — vacío = se ignora en la búsqueda de Gmail'],
    ['Banco 3 nombre', '',                                                     'Ejemplo: Davivienda, Daviplata, etc.'],
    ['Banco 3 sender', '',                                                     'Ejemplo: @davivienda.com'],
  ];

  nuevasFilas.forEach(function(fila) {
    sheet.appendRow(fila);
  });

  logInfo_('SHEETS', 'Configuracion de bancos agregada (' + nuevasFilas.length + ' filas)');
  logInfo_('SHEETS', 'Puedes agregar Nequi u otros bancos editando Banco 2/3 en Configurations');
}

// ------------------------------------------------------------
// MIGRA NOMBRES DE HOJAS AL ESQUEMA ACTUAL
// Ejecutar UNA SOLA VEZ
// ------------------------------------------------------------
function migrarNombresHojas() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const renombrar = [
    ['Transacciones',   SHEETS.TRANSACTIONS],
    ['Configuración',   SHEETS.CONFIGURATIONS],
    ['Configurations',  SHEETS.CONFIGURATIONS],
    ['PendienteXPagar', SHEETS.PENDING_PAYMENTS],
    ['PendientesXpagar',SHEETS.PENDING_PAYMENTS],
    ['ListadoCompras',  SHEETS.SEARCH_PRODUCTS],
    ['Errores',         SHEETS.ERRORS],
  ];
  renombrar.forEach(([viejo, nuevo]) => {
    const s = ss.getSheetByName(viejo);
    if (s && viejo !== nuevo) { s.setName(nuevo); logInfo_('SHEETS', viejo + ' -> ' + nuevo); }
  });
  reordenarHojas_(ss);
  logInfo_('SHEETS', 'Migracion completa. Ejecuta reconstruirDashboard()');
}

// ------------------------------------------------------------
// CREA TODAS LAS HOJAS SI NO EXISTEN
// ------------------------------------------------------------
function configurarSpreadsheet() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  _crearSiNoExiste(ss, SHEETS.TRANSACTIONS, sheetTransactions_);
  _crearSiNoExiste(ss, SHEETS.ERRORS,       sheetErrors_);
  _crearSiNoExiste(ss, SHEETS.CONFIGURATIONS, sheetConfigurations_);
  _crearSiNoExiste(ss, SHEETS.PENDING_PAYMENTS, sheetPendingPayments_);
  _crearSiNoExiste(ss, SHEETS.SEARCH_PRODUCTS,  sheetSearchProducts_);
  _crearSiNoExiste(ss, SHEETS.DATA_DICTIONARY,  sheetDataDictionary_);
  _crearSiNoExiste(ss, SHEETS.FINANCIAL_INSIGHTS, configurarFinancialInsights_);

  let dash = ss.getSheetByName(SHEETS.DASHBOARD);
  if (!dash) dash = ss.insertSheet(SHEETS.DASHBOARD);
  configurarDashboard_(dash);

  reordenarHojas_(ss);
  logInfo_('SHEETS', 'Spreadsheet listo');
}

function _crearSiNoExiste(ss, nombre, fn) {
  let sheet = ss.getSheetByName(nombre);
  if (!sheet) { sheet = ss.insertSheet(nombre); fn(sheet); logInfo_('SHEETS', 'Hoja creada: ' + nombre); }
}

// ------------------------------------------------------------
// RECONSTRUYE EL DASHBOARD
// ------------------------------------------------------------
function reconstruirDashboard() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.DASHBOARD);
  if (!sheet) sheet = ss.insertSheet(SHEETS.DASHBOARD);
  sheet.clearContents();
  sheet.clearFormats();
  configurarDashboard_(sheet);
  logInfo_('SHEETS', 'Dashboard reconstruido');
}

function reconstruirDataDictionary() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEETS.DATA_DICTIONARY);
  if (!sheet) sheet = ss.insertSheet(SHEETS.DATA_DICTIONARY);
  sheet.clearContents();
  sheet.clearFormats();
  sheetDataDictionary_(sheet);
  logInfo_('SHEETS', 'DataDictionary reconstruido');
}

// ------------------------------------------------------------
// DASHBOARD — LOCALE-PROOF
// REGLA: cero funciones con argumentos (no IF, no IFERROR)
// Solo SUMPRODUCT, YEAR, MONTH, TODAY, COUNTA + operadores matemáticos
// Para evitar /0: (denominador+(denominador=0)) — si es 0 suma 1
// ------------------------------------------------------------
function configurarDashboard_(sheet) {
  const T = SHEETS.TRANSACTIONS;
  const C = SHEETS.CONFIGURATIONS;

  // Suma por tipo (egreso/ingreso) — para totales del mes
  function fMes(tipo) {
    const filtroTipo  = '(' + T + '!D2:D="' + tipo + '")';
    const filtroYear  = '*(YEAR(' + T + '!B2:B)=YEAR(TODAY()))';
    const filtroMonth = '*(MONTH(' + T + '!B2:B)=MONTH(TODAY()))';
    return '=SUMPRODUCT(' + filtroTipo + filtroYear + filtroMonth + '*' + T + '!F2:F)';
  }

  // Suma por categoría sin filtrar tipo — muestra el total real (ingresos Y egresos)
  function fMesCat(categoria) {
    const filtroNoInfo = '(' + T + '!D2:D<>"informativo")';
    const filtroCat    = '*(' + T + '!J2:J="' + categoria + '")';
    const filtroYear   = '*(YEAR(' + T + '!B2:B)=YEAR(TODAY()))';
    const filtroMonth  = '*(MONTH(' + T + '!B2:B)=MONTH(TODAY()))';
    return '=SUMPRODUCT(' + filtroNoInfo + filtroCat + filtroYear + filtroMonth + '*' + T + '!F2:F)';
  }

  // ── TITULO ──
  sheet.getRange('A1').setValue('💸 FINANCEBOT AI - DASHBOARD').setFontWeight('bold').setFontSize(16).setBackground('#e3f2fd');

  // ── MES ACTUAL ──
  sheet.getRange('A3').setValue('📅 MES ACTUAL').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange('B3').setValue('Valor COP').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange('C3').setValue('% Meta').setFontWeight('bold').setBackground('#e8f0fe');

  sheet.getRange('A4').setValue('💸 Total Egresos').setFontWeight('bold').setFontColor('#d32f2f');
  sheet.getRange('B4').setFormula(fMes('egreso')).setFontColor('#d32f2f');
  sheet.getRange('C4').setFormula('=B4/' + C + '!B2');

  sheet.getRange('A5').setValue('💰 Total Ingresos').setFontWeight('bold').setFontColor('#388e3c');
  sheet.getRange('B5').setFormula(fMes('ingreso')).setFontColor('#388e3c');

  sheet.getRange('A6').setValue('💡 Flujo de Caja').setFontWeight('bold');
  sheet.getRange('B6').setFormula('=B5-B4');

  sheet.getRange('A7').setValue('💡 Ratio Ahorro').setFontWeight('bold');
  sheet.getRange('B7').setFormula('=(B5-B4)/(B5+(B5=0))*(B5>0)');
  sheet.getRange('C7').setFormula('=(B5-B4)/(B5+(B5=0))*(B5>0)');
  sheet.getRange('B7').setNote('Porcentaje de tus ingresos que lograste ahorrar este mes. Si es negativo, gastaste más de lo que ingresó.');

  // ── GASTO POR CATEGORIA ──
  sheet.getRange('A9').setValue('📊 GASTO POR CATEGORIA').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange('B9').setValue('Total COP').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange('C9').setValue('% del gasto').setFontWeight('bold').setBackground('#e8f0fe');

  // Leer categorías desde Configurations (fuente de verdad)
  const cfg = leerConfiguracion_();
  var cats  = cfg.categorias.slice().sort();

  cats.forEach(function(cat, i) {
    const row = 10 + i;
    sheet.getRange(row, 1).setValue(cat);
    sheet.getRange(row, 2).setFormula(fMesCat(cat));
    sheet.getRange(row, 3).setFormula('=B' + row + '/(B4+(B4=0))');
    // Nota para "Otro"
    if (cat.toLowerCase() === 'otro') {
      sheet.getRange(row, 1, 1, 3).setBackground('#ffebee');
      sheet.getRange(row, 3).setNote('⚠️ Si este valor supera 10%, revisa la clasificación de tus transacciones.');
    }
  });

  // Gráfico de pastel: Gasto por Categoría
  try {
    var chartRange = sheet.getRange(10, 1, cats.length, 2);
    var chart = sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(chartRange)
      .setOption('title', 'Distribución de Gasto por Categoría')
      .setPosition(10, 5, 0, 0)
      .build();
    sheet.insertChart(chart);
  } catch(e) {}

  // ── ACUMULADO HISTORICO ──
  const fh = 10 + cats.length + 1;
  sheet.getRange(fh, 1).setValue('📈 ACUMULADO HISTORICO').setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(fh+1, 1).setValue('💸 Total Egresos Historico').setFontWeight('bold').setFontColor('#d32f2f');
  sheet.getRange(fh+1, 2).setFormula('=SUMPRODUCT((' + T + '!D2:D="egreso")*' + T + '!F2:F)').setFontColor('#d32f2f');
  sheet.getRange(fh+2, 1).setValue('💰 Total Ingresos Historico').setFontWeight('bold').setFontColor('#388e3c');
  sheet.getRange(fh+2, 2).setFormula('=SUMPRODUCT((' + T + '!D2:D="ingreso")*' + T + '!F2:F)').setFontColor('#388e3c');
  sheet.getRange(fh+3, 1).setValue('N de Transacciones').setFontWeight('bold');
  sheet.getRange(fh+3, 2).setFormula('=COUNTA(' + T + '!A2:A)');

  // ── CONSOLIDADO MENSUAL DEL AÑO ──
  const fc = fh + 5;
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  sheet.getRange(fc, 1).setValue('📅 CONSOLIDADO MENSUAL').setFontWeight('bold').setBackground('#e8f4e8');
  sheet.getRange(fc, 2).setValue('Egresos').setFontWeight('bold').setBackground('#e8f4e8');
  sheet.getRange(fc, 3).setValue('Ingresos').setFontWeight('bold').setBackground('#e8f4e8');
  sheet.getRange(fc, 4).setValue('Flujo').setFontWeight('bold').setBackground('#e8f4e8');
  sheet.getRange(fc, 5).setValue('# Txn').setFontWeight('bold').setBackground('#e8f4e8');
  meses.forEach(function(mes, i) {
    const row = fc + 1 + i;
    const m   = i + 1;
    sheet.getRange(row, 1).setValue(mes);
    sheet.getRange(row, 2).setFormula(
      '=SUMPRODUCT((' + T + '!D2:D="egreso")*(YEAR(' + T + '!B2:B)=E2)*(MONTH(' + T + '!B2:B)=' + m + ')*' + T + '!F2:F)');
    sheet.getRange(row, 3).setFormula(
      '=SUMPRODUCT((' + T + '!D2:D="ingreso")*(YEAR(' + T + '!B2:B)=E2)*(MONTH(' + T + '!B2:B)=' + m + ')*' + T + '!F2:F)');
    sheet.getRange(row, 4).setFormula('=C' + row + '-B' + row);
    sheet.getRange(row, 5).setFormula(
      '=SUMPRODUCT((' + T + '!A2:A<>"")*(YEAR(' + T + '!B2:B)=E2)*(MONTH(' + T + '!B2:B)=' + m + '))');
  });

  // Gráfico de barras: Consolidado Mensual
  try {
    var chartRange2 = sheet.getRange(fc+1, 1, 12, 4);
    var chart2 = sheet.newChart()
      .setChartType(Charts.ChartType.COLUMN)
      .addRange(chartRange2)
      .setOption('title', 'Egresos, Ingresos y Flujo por Mes')
      .setPosition(fc+1, 7, 0, 0)
      .build();
    sheet.insertChart(chart2);
  } catch(e) {}

  // ── FILTRO POR PERIODO (columnas E-G) ──
  // E2: Año editable | E3: Mes editable
  const Y = 'E2';  // celda año
  const M = 'E3';  // celda mes

  function fPer(tipo) {
    return '=SUMPRODUCT((' + T + '!D2:D="' + tipo + '")*(YEAR(' + T + '!B2:B)=' + Y + ')*(MONTH(' + T + '!B2:B)=' + M + ')*' + T + '!F2:F)';
  }
  function fPerCat(cat) {
    return '=SUMPRODUCT((' + T + '!D2:D<>"informativo")*(' + T + '!J2:J="' + cat + '")*(YEAR(' + T + '!B2:B)=' + Y + ')*(MONTH(' + T + '!B2:B)=' + M + ')*' + T + '!F2:F)';
  }

  sheet.getRange('D1').setValue('🔎 FILTRO PERIODO').setFontWeight('bold').setFontSize(14).setBackground('#fff8e1');
  sheet.getRange('D2').setValue('Año').setFontWeight('bold').setBackground('#fff8e1');
  sheet.getRange('E2').setValue(new Date().getFullYear()).setBackground('#fffde7').setFontWeight('bold').setNote('Edita el año para filtrar el consolidado mensual.');
  sheet.getRange('D3').setValue('Mes (1-12)').setFontWeight('bold').setBackground('#fff8e1');
  sheet.getRange('E3').setValue(new Date().getMonth() + 1).setBackground('#fffde7').setFontWeight('bold').setNote('Edita el mes (1-12) para filtrar el periodo.');

  sheet.getRange('D5').setValue('PERIODO').setFontWeight('bold').setBackground('#fff8e1');
  sheet.getRange('E5').setValue('Valor COP').setFontWeight('bold').setBackground('#fff8e1');
  sheet.getRange('F5').setValue('% Meta').setFontWeight('bold').setBackground('#fff8e1');

  sheet.getRange('D6').setValue('Total Egresos').setFontWeight('bold').setFontColor('#d32f2f');
  sheet.getRange('E6').setFormula(fPer('egreso')).setFontColor('#d32f2f');
  sheet.getRange('F6').setFormula('=E6/' + C + '!B2');

  sheet.getRange('D7').setValue('Total Ingresos').setFontWeight('bold').setFontColor('#388e3c');
  sheet.getRange('E7').setFormula(fPer('ingreso')).setFontColor('#388e3c');

  sheet.getRange('D8').setValue('Flujo de Caja').setFontWeight('bold');
  sheet.getRange('E8').setFormula('=E7-E6');

  sheet.getRange('D9').setValue('Ratio Ahorro').setFontWeight('bold');
  sheet.getRange('E9').setFormula('=(E7-E6)/(E7+(E7=0))*(E7>0)');

  sheet.getRange('D11').setValue('POR CATEGORIA').setFontWeight('bold').setBackground('#fff8e1');
  sheet.getRange('E11').setValue('Total COP').setFontWeight('bold').setBackground('#fff8e1');
  sheet.getRange('F11').setValue('% del gasto').setFontWeight('bold').setBackground('#fff8e1');

  cats.forEach(function(cat, i) {
    const row = 12 + i;
    sheet.getRange(row, 4).setValue(cat);
    sheet.getRange(row, 5).setFormula(fPerCat(cat));
    sheet.getRange(row, 6).setFormula('=E' + row + '/(E6+(E6=0))');
    if (cat.toLowerCase() === 'otro') {
      sheet.getRange(row, 4, 1, 3).setBackground('#ffebee');
      sheet.getRange(row, 6).setNote('⚠️ Si este valor supera 10%, revisa la clasificación de tus transacciones.');
    }
  });

  // Gráfico de pastel: Gasto por Categoría (periodo)
  try {
    var chartRange3 = sheet.getRange(12, 4, cats.length, 2);
    var chart3 = sheet.newChart()
      .setChartType(Charts.ChartType.PIE)
      .addRange(chartRange3)
      .setOption('title', 'Gasto por Categoría (Periodo)')
      .setPosition(12, 8, 0, 0)
      .build();
    sheet.insertChart(chart3);
  } catch(e) {}

  // Formatos y anchos de columna (igual que antes)
  sheet.getRange('B4:B6').setNumberFormat('#,##0');
  sheet.getRange('B7').setNumberFormat('0.0%');
  sheet.getRange('C4').setNumberFormat('0.0%');
  sheet.getRange('C7').setNumberFormat('0.0%');
  sheet.getRange(10, 2, cats.length, 1).setNumberFormat('#,##0');
  sheet.getRange(10, 3, cats.length, 1).setNumberFormat('0.0%');
  sheet.getRange(fh+1, 2, 3, 1).setNumberFormat('#,##0');
  sheet.getRange(fc+1, 2, 12, 3).setNumberFormat('#,##0');
  sheet.getRange('E6:E8').setNumberFormat('#,##0');
  sheet.getRange('E9').setNumberFormat('0.0%');
  sheet.getRange('F6').setNumberFormat('0.0%');
  sheet.getRange('F9').setNumberFormat('0.0%');
  sheet.getRange(12, 5, cats.length, 1).setNumberFormat('#,##0');
  sheet.getRange(12, 6, cats.length, 1).setNumberFormat('0.0%');

  // Anchos de columna y filas congeladas
  sheet.setColumnWidth(1, 210); sheet.setColumnWidth(2, 160); sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 180); sheet.setColumnWidth(5, 160); sheet.setColumnWidth(6, 120);
  sheet.setFrozenRows(1);

  // Formato condicional: Ratio Ahorro negativo (rojo)
  try {
    var rules = sheet.getConditionalFormatRules();
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setBackground('#ffebee')
      .setFontColor('#d32f2f')
      .setRanges([sheet.getRange('B7'), sheet.getRange('E9')])
      .build());
    // Formato condicional: % "Otro" > 10%
    var rowOtro = cats.findIndex(function(c) { return c.toLowerCase() === 'otro'; });
    if (rowOtro !== -1) {
      var r1 = 10 + rowOtro, r2 = 12 + rowOtro;
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(0.1)
        .setBackground('#ffcdd2')
        .setFontColor('#b71c1c')
        .setRanges([sheet.getRange(r1, 3), sheet.getRange(r2, 6)])
        .build());
    }
    sheet.setConditionalFormatRules(rules);
  } catch(e) {}

  // Notas explicativas en celdas clave
  sheet.getRange('B4').setNote('Suma de todos los egresos del mes actual.');
  sheet.getRange('B5').setNote('Suma de todos los ingresos del mes actual.');
  sheet.getRange('B6').setNote('Ingresos menos egresos del mes actual.');
  sheet.getRange('B7').setNote('Porcentaje de ahorro sobre ingresos.');
  sheet.getRange('C4').setNote('Porcentaje del presupuesto mensual gastado.');
  sheet.getRange('C7').setNote('Porcentaje de ahorro sobre ingresos.');
  sheet.getRange('E6').setNote('Egresos del periodo filtrado.');
  sheet.getRange('E7').setNote('Ingresos del periodo filtrado.');
  sheet.getRange('E8').setNote('Flujo de caja del periodo filtrado.');
  sheet.getRange('E9').setNote('Porcentaje de ahorro sobre ingresos en el periodo.');
  sheet.getRange('F6').setNote('Porcentaje del presupuesto gastado en el periodo.');
  sheet.getRange('F9').setNote('Porcentaje de ahorro sobre ingresos en el periodo.');
}

// ------------------------------------------------------------
// HOJA: Transactions
// ------------------------------------------------------------
function sheetTransactions_(sheet) {
  const headers = ['ID','Fecha','Hora','Tipo','Tipo Transaccion','Monto','Moneda',
                   'Comercio/Destino','Cuenta Origen','Categoria','Subcategoria',
                   'Necesidad','Sugerencia','Referencia','Confianza','Fuente','Procesado','Banco Origen'];
  const notas   = [
    'Identificador único de la transacción (generado automáticamente)',
    'Fecha de la transacción en formato YYYY-MM-DD',
    'Hora de la transacción en formato HH:MM',
    'Flujo del dinero: ingreso / egreso / informativo',
    'Tipo específico: compra_tc, compra_td, transferencia_enviada, transferencia_recibida, pago_pse, pago_servicio, factura_pendiente, retiro_cajero, ingreso_nomina, otro',
    'Monto en pesos colombianos (COP), número entero',
    'Moneda — siempre COP',
    'Nombre del comercio, servicio o destinatario de la transferencia',
    'Últimos 4 dígitos de la cuenta o tarjeta de origen',
    'Categoría principal asignada por Gemini (Alimentación, Transporte, Vivienda, etc.)',
    'Subcategoría (Supermercados, Restaurantes, Gasolina, Gimnasio, etc.)',
    'Clasificación de necesidad: necesario / prescindible / lujo / n/a',
    'Consejo de ahorro generado por Gemini para esta transacción',
    'Referencia adicional: número de cuenta destino en transferencias, código de factura, etc.',
    'Nivel de confianza del parsing de Gemini (0 a 1)',
    'Origen del dato: email o historico',
    'Fecha y hora en que el bot procesó este email (ISO 8601)',
    'Banco o entidad que originó la transacción (Bancolombia, Nequi, Davivienda, etc.)',
  ];
  sheet.appendRow(headers);
  const rng = sheet.getRange(1, 1, 1, headers.length);
  rng.setFontWeight('bold').setBackground('#e8f0fe');
  headers.forEach((_, i) => sheet.getRange(1, i+1).setNote(notas[i]));
  sheet.setFrozenRows(1);
  [1,2,3,4,5,7,8,9,10,11,12,13,16].forEach(c => sheet.setColumnWidth(c, 130));
  sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(14, 180);
  sheet.setColumnWidth(15, 90);
  sheet.setColumnWidth(17, 180);
  sheet.setColumnWidth(18, 130);
}

// ------------------------------------------------------------
// HOJA: Errors
// ------------------------------------------------------------
function sheetErrors_(sheet) {
  const headers = ['ID','Error','Asunto Email','Email ID','Procesado'];
  const notas   = [
    'Identificador único del error',
    'Descripción del error: puede ser fallo de Gemini, JSON inválido, campos faltantes, etc.',
    'Asunto del email que falló — útil para identificar qué transacción no se procesó',
    'ID del mensaje en Gmail — puedes buscarlo manualmente con este código',
    'Fecha y hora en que ocurrió el error',
  ];
  sheet.appendRow(headers);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#ffe0e0');
  headers.forEach((_, i) => sheet.getRange(1, i+1).setNote(notas[i]));
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 130); sheet.setColumnWidth(2, 300);
  sheet.setColumnWidth(3, 200); sheet.setColumnWidth(4, 160); sheet.setColumnWidth(5, 180);
}

// ------------------------------------------------------------
// HOJA: Configurations
// ------------------------------------------------------------
function sheetConfigurations_(sheet) {
  const datos = [
    ['Parametro', 'Valor', 'Descripcion'],
    ['Presupuesto mensual',     3000000, 'COP — limite total de gasto al mes. El Dashboard muestra cuanto has usado.'],
    ['Meta ahorro',              500000, 'COP — cuanto quieres ahorrar al mes.'],
    ['Umbral alerta Telegram',   200000, 'COP — si un egreso supera este valor, el bot te avisa por Telegram inmediatamente.'],
    ['Alerta presupuesto %',        0.8, 'Porcentaje del presupuesto mensual que dispara alerta (0.8 = avisa cuando llevas 80% gastado).'],
    ['Dias recordatorio pagos',       3, 'Dias antes del vencimiento en Pending Payments para enviar recordatorio por Telegram.'],
    ['Banco',               'Bancolombia', 'Banco monitoreado. Solo referencia informativa por ahora.'],
    ['Tarjeta credito',         '', 'Ultimos 4 digitos de la tarjeta de credito. Ejemplo: *1234'],
    ['Tarjeta debito',              '',  'Ultimos 4 digitos de la tarjeta debito (opcional).'],
    ['Presupuesto Alimentacion',  800000, 'COP — limite mensual para categoria Alimentacion.'],
    ['Presupuesto Transporte',    300000, 'COP — limite mensual para Transporte.'],
    ['Presupuesto Salud',         300000, 'COP — limite mensual para Salud.'],
    ['Presupuesto Entretenimiento',200000,'COP — limite mensual para Entretenimiento.'],
    ['Presupuesto Hogar',         300000, 'COP — limite mensual para Hogar.'],
    ['Presupuesto Servicios',     400000, 'COP — limite mensual para Servicios.'],
    ['Banco 1 nombre', 'Bancolombia',                                       'Nombre del banco (referencia visual)'],
    ['Banco 1 sender', '@notificacionesbancolombia.com,@bancolombia.com.co', 'Dominios del remitente separados por coma. El bot construye la query de Gmail con estos valores.'],
    ['Banco 2 nombre', '',                                                   'Vacío = banco no activo. Ejemplo: Nequi'],
    ['Banco 2 sender', '',                                                   'Ejemplo: @nequi.com.co — vacío = se ignora en la búsqueda de Gmail'],
    ['Banco 3 nombre', '',                                                   'Ejemplo: Davivienda, Daviplata, etc.'],
    ['Banco 3 sender', '',                                                   'Ejemplo: @davivienda.com'],
    ['Historico Desde', (function() {
      var d = new Date(); d.setFullYear(d.getFullYear() - 1);
      return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2,'0');
    })(),                                                                     'AñoMes de inicio para /historico contar y /historico cargar. Formato: YYYY/MM. Cambia según tu historial disponible.'],
  ];
  sheet.getRange(1, 1, datos.length, 3).setValues(datos);
  sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8f0fe');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 230); sheet.setColumnWidth(2, 150); sheet.setColumnWidth(3, 400);
}

// ------------------------------------------------------------
// HOJA: Pending Payments
// ------------------------------------------------------------
function sheetPendingPayments_(sheet) {
  const headers = ['Servicio','Nombre','Valor','FechaPago','FechaLimitePago',
                   'Frecuencia','DiasAnticipacion','Estado','Referencia','Notas'];
  const notas   = [
    'Categoria del pago: Servicios publicos, Salud, Vivienda, Suscripcion, Credito, etc.',
    'Nombre especifico del servicio o proveedor (Empresa de Agua, Smart Fit, Netflix, etc.)',
    'Monto aproximado a pagar en COP. Puede quedar en blanco si varia mes a mes.',
    'Fecha del proximo pago en formato DD/MM/YYYY. Este campo dispara el recordatorio de Telegram.',
    'Hasta cuando debes pagar este servicio. Usa 31/12/2090 si es un pago recurrente sin fecha limite.',
    'Con que frecuencia se repite: Mensual, Bimestral, Trimestral, Anual, Unico.',
    'Cuantos dias ANTES de FechaPago quieres recibir el recordatorio por Telegram.',
    'Estado actual: Activo (envia recordatorio), Inactivo (pausado), Pagado (ya pagado este periodo).',
    'Numero de referencia, cuenta o codigo de pago. Util para incluirlo en el recordatorio.',
    'Notas adicionales: banco, metodo de pago, observaciones.',
  ];
  // Fechas ejemplo: próximo mes para que no lleguen como vencidos
  var tz  = Session.getScriptTimeZone();
  var hoy = new Date();
  var prox = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  var f1  = Utilities.formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1,  1), tz, 'dd/MM/yyyy');
  var f2  = Utilities.formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 15), tz, 'dd/MM/yyyy');
  var f3  = Utilities.formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1,  5), tz, 'dd/MM/yyyy');
  var f4  = Utilities.formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 20), tz, 'dd/MM/yyyy');
  var ejemplos = [
    ['Servicios publicos', 'Empresa de Agua',    '', f1, '31/12/2090', 'Mensual', 3, 'Activo', '', 'Ejemplo — reemplaza con tus datos'],
    ['Salud',              'Gimnasio',             0, f4, '31/12/2090', 'Mensual', 3, 'Activo', '', 'Ejemplo — reemplaza con tus datos'],
    ['Vivienda',           'Administración',      '', f3, '31/12/2090', 'Mensual', 5, 'Activo', '', 'Ejemplo — reemplaza con tus datos'],
    ['Servicios publicos', 'Internet / Cable',    '', f2, '31/12/2090', 'Mensual', 3, 'Activo', '', 'Ejemplo — reemplaza con tus datos'],
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
  headers.forEach((_, i) => sheet.getRange(1, i+1).setNote(notas[i]));
  sheet.getRange(2, 1, ejemplos.length, headers.length).setValues(ejemplos);
  sheet.setFrozenRows(1);
  sheet.getRange(2, 3, 50, 1).setNumberFormat('#,##0');
  [1,2,5,6,8,10].forEach(c => sheet.setColumnWidth(c, 160));
  sheet.setColumnWidth(3, 110); sheet.setColumnWidth(4, 110);
  sheet.setColumnWidth(7, 130); sheet.setColumnWidth(9, 150);
}

// ------------------------------------------------------------
// HOJA: Search Products
// ------------------------------------------------------------
function sheetSearchProducts_(sheet) {
  const headers = ['Producto','Descripcion','Precio Objetivo','Prioridad',
                   'URL Referencia','Estado','Fecha Agregado','Notas'];
  const notas   = [
    'Nombre del producto que quieres comprar.',
    'Descripcion detallada: modelo, especificaciones, marca.',
    'COP — precio maximo que estas dispuesto a pagar.',
    'Alta / Media / Baja — para priorizar cuando comprar.',
    'URL de referencia del producto (tienda, marketplace).',
    'Pendiente / Comprado / Descartado.',
    'Fecha en que agregaste este producto a la lista.',
    'Notas: por que lo necesitas, alternativas, observaciones.',
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
  headers.forEach((_, i) => sheet.getRange(1, i+1).setNote(notas[i]));
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 130); sheet.setColumnWidth(4, 90);
  sheet.setColumnWidth(5, 260); sheet.setColumnWidth(6, 100);
  sheet.setColumnWidth(7, 120); sheet.setColumnWidth(8, 220);
}

// ------------------------------------------------------------
// HOJA: DataDictionary
// ------------------------------------------------------------
function sheetDataDictionary_(sheet) {
  const headers = ['Hoja','Campo','Tipo','Descripcion','Valores posibles / Ejemplo'];
  const datos = [
    // ── TRANSACTIONS ──────────────────────────────────────────────────────────
    ['Transactions','ID','Texto','Identificador unico generado automaticamente','TXN-1711234567-A3F9B'],
    ['Transactions','Fecha','Texto YYYY-MM-DD','Fecha de la transaccion extraida del email o extracto','2026-03-22'],
    ['Transactions','Hora','Texto HH:MM','Hora de la transaccion (vacia si no viene en el email)','14:30'],
    ['Transactions','Tipo','Texto','Flujo de dinero clasificado por Gemini','ingreso | egreso | informativo'],
    ['Transactions','Tipo Transaccion','Texto','Tipo especifico de operacion bancaria',
     'compra_tc | compra_debito | transferencia_enviada | transferencia_recibida | retiro_cajero | pago_servicio | ingreso_nomina | otro'],
    ['Transactions','Monto','Numero','Valor absoluto en COP sin decimales','50000'],
    ['Transactions','Moneda','Texto','Moneda de la transaccion','COP'],
    ['Transactions','Comercio','Texto','Nombre del comercio o destinatario/remitente de transferencia','TIENDA D1 MANIZALES'],
    ['Transactions','Cuenta','Texto','Ultimos 4 digitos de la cuenta o tarjeta usada','8352'],
    ['Transactions','Categoria','Texto','Categoria principal — configurada en Configurations','Alimentación | Transporte | Vivienda | ...'],
    ['Transactions','Subcategoria','Texto','Subcategoria especifica asignada por Gemini','Supermercados | Gasolina | Servicios públicos | ...'],
    ['Transactions','Necesidad','Texto','Nivel de necesidad clasificado por Gemini','necesario | prescindible | lujo | n/a'],
    ['Transactions','Sugerencia','Texto','Consejo de ahorro personalizado de Gemini','Compara precios en otras tiendas'],
    ['Transactions','Referencia','Texto','Cuenta destino, llave Nequi o codigo de factura','3225768527'],
    ['Transactions','Confianza','Numero 0-1','Certeza del parsing de Gemini (1 = muy seguro)','0.95 | 0.98'],
    ['Transactions','Fuente','Texto','Como entro este registro al sistema',
     'email — procesado automaticamente del inbox\nextracto — importado desde ZIP/XLSX Bancolombia\ntelegram — registrado manualmente via chat\nhistorico — cargado desde historial de Gmail'],
    ['Transactions','Procesado','Texto ISO 8601','Timestamp exacto de cuando el bot proceso la transaccion','2026-03-22T21:38:28.000Z'],
    ['Transactions','Banco Origen','Texto','Banco que genero la notificacion (detectado por remitente del email)','Bancolombia | Nequi | Davivienda | ...'],
    // ── GOALS ─────────────────────────────────────────────────────────────────
    ['Goals','ID','Texto','Identificador unico de la meta','GOAL-1711234567-X9A'],
    ['Goals','Meta','Texto','Nombre descriptivo de la meta de ahorro','Vacaciones Europa'],
    ['Goals','Objetivo','Numero','Monto total en COP a alcanzar','5000000'],
    ['Goals','Fecha Limite','Texto DD/MM/YYYY','Fecha objetivo para completar la meta (opcional)','31/12/2026'],
    ['Goals','Ahorrado','Numero','Monto acumulado hasta ahora (suma de abonos registrados)','1250000'],
    ['Goals','Estado','Texto','Estado actual de la meta','activa | completada | pausada'],
    ['Goals','Creado','Texto ISO 8601','Cuando se creo la meta','2026-01-15T10:00:00.000Z'],
    ['Goals','Último Abono','Texto ISO 8601','Fecha del ultimo abono registrado via /meta abonar','2026-03-20T15:30:00.000Z'],
    ['Goals','Etiqueta','Texto','Etiqueta libre para agrupar metas','viaje | emergencia | hogar'],
    // ── ERRORS ────────────────────────────────────────────────────────────────
    ['Errors','ID','Texto','Identificador unico del error','ERR-1711234567'],
    ['Errors','Error','Texto','Descripcion del error ocurrido','Gemini HTTP 429: quota exceeded'],
    ['Errors','Asunto Email','Texto','Asunto del email que no se pudo procesar','Alertas y Notificaciones Transaccionales'],
    ['Errors','Email ID','Texto','ID del mensaje en Gmail — buscar con este ID si necesitas reprocesar','18e8a1b2c3d4e5f6'],
    ['Errors','Procesado','Texto ISO 8601','Cuando ocurrio el error','2026-03-22T21:38:28.000Z'],
    // ── GOALS ─────────────────────────────────────────────────────────────────
    ['Goals','ID','Texto','Identificador unico generado automaticamente al crear la meta','META-LK3F2A8B'],
    ['Goals','Meta','Texto','Nombre descriptivo de la meta de ahorro — editable','Vacaciones Europa'],
    ['Goals','Objetivo','Numero COP','Monto total en COP que quieres alcanzar','5000000'],
    ['Goals','Fecha Limite','Texto DD/MM/YYYY','Fecha objetivo para completar la meta (opcional — puede quedar vacia)','31/12/2026'],
    ['Goals','Ahorrado','Numero COP','Monto acumulado hasta ahora. Suma de todos los abonos registrados via /meta abonar','1250000'],
    ['Goals','Estado','Texto','Estado actual de la meta — el bot lo actualiza automaticamente',
     'activa — en progreso\ncompletada — llego al 100%\npausada — no recibe recordatorios'],
    ['Goals','Creado','Texto ISO 8601','Timestamp de cuando se creo la meta con /meta nueva','2026-01-15T10:00:00.000Z'],
    ['Goals','Último Abono','Texto ISO 8601','Fecha del ultimo abono registrado — se usa para calcular si hay metas sin actividad','2026-03-20T15:30:00.000Z'],
    ['Goals','Etiqueta','Texto','Etiqueta libre para clasificar metas — util para agrupar en /metas','viaje | emergencia | hogar | vehiculo'],
    // ── FINANCIAL INSIGHTS ────────────────────────────────────────────────────
    ['Financial Insights','Fecha Registro','Texto ISO 8601','Timestamp de cuando se genero este snapshot del asesor financiero','2026-03-22T21:38:28.000Z'],
    ['Financial Insights','Periodo','Texto YYYY-MM','Mes al que corresponde el analisis','2026-03'],
    ['Financial Insights','Ingresos COP','Numero COP','Total de ingresos del periodo calculado desde Transactions','4500000'],
    ['Financial Insights','Egresos COP','Numero COP','Total de egresos del periodo calculado desde Transactions','2800000'],
    ['Financial Insights','Balance COP','Numero COP','Diferencia Ingresos - Egresos. Positivo = ahorro, negativo = deficit','1700000'],
    ['Financial Insights','Tasa Ahorro %','Numero 0-100','Porcentaje ahorrado sobre el ingreso total del periodo','37.8'],
    ['Financial Insights','Score (0-100)','Numero entero','Puntaje de salud financiera calculado por Gemini. 80+ excelente, 60-79 bueno, <60 alerta','74'],
    ['Financial Insights','Escenario Optimista','Numero COP','Proyeccion de cierre de mes asumiendo el menor gasto diario de los ultimos 6 meses','1200000'],
    ['Financial Insights','Escenario Base','Numero COP','Proyeccion de cierre de mes asumiendo el gasto diario promedio de los ultimos 6 meses','1800000'],
    ['Financial Insights','Escenario Pesimista','Numero COP','Proyeccion de cierre de mes asumiendo el mayor gasto diario de los ultimos 6 meses','2900000'],
    ['Financial Insights','Proyección Fin Mes','Numero COP','Egresos totales proyectados al cierre del mes corriente segun ritmo actual','2400000'],
    ['Financial Insights','Ritmo Diario COP','Numero COP','Promedio de gasto por dia en el periodo — base para las proyecciones','93333'],
    ['Financial Insights','Categoría Principal','Texto','Categoria con mayor gasto en el periodo','Alimentación ($520.000)'],
    ['Financial Insights','Análisis IA','Texto largo','Parrafo de analisis generado por Gemini con observaciones, patrones y recomendaciones',
     'Tu gasto en Alimentación subió 18% vs. el mes pasado...'],
    // ── CONFIGURATIONS ────────────────────────────────────────────────────────
    ['Configurations','Parametro','Texto','Nombre del parametro de configuracion',
     'Presupuesto mensual | Umbral alerta Telegram | Banco 1 sender | ...'],
    ['Configurations','Valor','Variable','Valor actual del parametro — edita esta columna para personalizar el bot',
     '3000000 | 200000 | @notificacionesbancolombia.com'],
    ['Configurations','Descripcion','Texto','Que hace este parametro y como afecta el comportamiento del bot',
     'COP — envia alerta si un egreso supera este valor'],
    ['Configurations','— Parametros principales —','','',''],
    ['Configurations','Presupuesto mensual','Numero COP','Limite total de gasto al mes. El Dashboard muestra cuanto llevas gastado vs este limite.','3000000'],
    ['Configurations','Meta ahorro','Numero COP','Cuanto quieres ahorrar al mes. Se usa en el Dashboard (% Meta) y en el asesor financiero.','500000'],
    ['Configurations','Umbral alerta Telegram','Numero COP','Si un egreso supera este valor, el bot envia alerta inmediata por Telegram.','200000'],
    ['Configurations','Alerta presupuesto %','Decimal 0-1','Fraccion del presupuesto que dispara alerta de categoria. 0.8 = avisa al llegar al 80%.','0.8'],
    ['Configurations','Dias recordatorio pagos','Numero','Dias de anticipacion para recordatorios de Pending Payments.','3'],
    ['Configurations','Tarjeta credito','Texto','Ultimos 4 digitos de la TC. El bot los incluye en mensajes de alerta.','*8352'],
    ['Configurations','Tarjeta debito','Texto','Ultimos 4 digitos de la tarjeta debito (opcional).','*1234'],
    ['Configurations','Banco','Texto','Nombre del banco principal. Solo referencia visual por ahora.','Bancolombia'],
    ['Configurations','— Bancos (senders de Gmail) —','','',''],
    ['Configurations','Banco 1 nombre','Texto','Nombre del primer banco monitorizado.','Bancolombia'],
    ['Configurations','Banco 1 sender','Texto','Dominios del remitente del banco 1 separados por coma. El bot construye la query Gmail con esto.',
     '@notificacionesbancolombia.com,@bancolombia.com.co'],
    ['Configurations','Banco 2/3 nombre','Texto','Nombre del segundo/tercer banco. Dejar vacio si no aplica.','Nequi'],
    ['Configurations','Banco 2/3 sender','Texto','Dominio del remitente del banco 2/3. Dejar vacio si no aplica.','@nequi.com.co'],
    ['Configurations','— Categorias —','','',''],
    ['Configurations','Categoria X','Texto','Nombre de una categoria de gasto — el bot valida contra esta lista al clasificar.','Alimentación | Transporte | Salud | Hogar | ...'],
    ['Configurations','[col C] Presupuesto cat.','Numero COP','Presupuesto mensual para esa categoria especifica. El bot alerta cuando se acerca al limite.',
     '800000'],
    ['Configurations','— Carga historica —','','',''],
    ['Configurations','Historico Desde','Texto YYYY/MM','Mes de inicio para /historico contar y /historico cargar. Cambia segun tu historial disponible.',
     '2024/01'],
    // ── DASHBOARD ─────────────────────────────────────────────────────────────
    ['Dashboard','— MES ACTUAL (col A-C) —','','',''],
    ['Dashboard','Total Egresos','Formula','Suma de todos los egresos del mes en curso. Fuente: Transactions col Tipo=egreso.','B4'],
    ['Dashboard','Total Ingresos','Formula','Suma de todos los ingresos del mes en curso. Fuente: Transactions col Tipo=ingreso.','B5'],
    ['Dashboard','Flujo de Caja','Formula','Ingresos - Egresos del mes. Positivo = ahorro neto, negativo = deficit.','B6'],
    ['Dashboard','Ratio Ahorro','Formula %','Porcentaje del ingreso que fue a ahorro. 0 si no hay ingresos registrados.','B7'],
    ['Dashboard','% Meta (col C)','Formula %','Que porcentaje del Presupuesto mensual de Configurations ya usaste.','C4'],
    ['Dashboard','Gasto por Categoria','Formula','Una fila por cada categoria activa en Configurations. Total COP y % del gasto total.','fila 10+'],
    ['Dashboard','Total Egresos Historico','Formula','Suma historica de todos los egresos en Transactions (todos los meses).','fila fh+1'],
    ['Dashboard','Total Ingresos Historico','Formula','Suma historica de todos los ingresos en Transactions.','fila fh+2'],
    ['Dashboard','N de Transacciones','Formula','Cuenta total de filas en Transactions con ID (A2:A).','fila fh+3'],
    ['Dashboard','— CONSOLIDADO MENSUAL (col A-E) —','','',''],
    ['Dashboard','Ene..Dic','Formula','Una fila por mes. Columnas: Egresos | Ingresos | Flujo | # Txn. Filtrado por el año en E2.','filas fc+1 a fc+12'],
    ['Dashboard','— FILTRO PERIODO (col D-F) —','','',''],
    ['Dashboard','E2 — Año','Celda editable','Año que se muestra en el Consolidado Mensual y en el bloque Periodo. Cambia este valor para ver otro año.',String(new Date().getFullYear())],
    ['Dashboard','E3 — Mes','Celda editable','Mes (1-12) para el bloque Periodo (columnas D-F). Independiente del mes actual.',String(new Date().getMonth()+1)],
    ['Dashboard','Total Egresos Periodo','Formula','Egresos del año+mes seleccionado en E2/E3.','E6'],
    ['Dashboard','Total Ingresos Periodo','Formula','Ingresos del año+mes seleccionado en E2/E3.','E7'],
    ['Dashboard','Por Categoria Periodo','Formula','Gasto por categoria del periodo seleccionado.','filas 12+'],
    // ── PENDING PAYMENTS ──────────────────────────────────────────────────────
    ['Pending Payments','Servicio','Texto','Categoria del pago recurrente','Servicios publicos | Salud | Vivienda | Suscripcion | Credito'],
    ['Pending Payments','Nombre','Texto','Nombre especifico del proveedor o servicio','Empresa de Agua | Gimnasio | Netflix | Credito hipotecario'],
    ['Pending Payments','Valor','Numero COP','Monto aproximado a pagar. Puede quedar en blanco si varia mes a mes.','140000'],
    ['Pending Payments','FechaPago','Fecha DD/MM/YYYY','Proximo vencimiento — este campo dispara el recordatorio de Telegram.','01/05/2026'],
    ['Pending Payments','FechaLimitePago','Fecha DD/MM/YYYY','Hasta cuando aplica este pago. Usa 31/12/2090 para pagos recurrentes sin fecha de fin.','31/12/2090'],
    ['Pending Payments','Frecuencia','Texto','Con que frecuencia se repite el pago','Mensual | Bimestral | Trimestral | Anual | Unico'],
    ['Pending Payments','DiasAnticipacion','Numero','Cuantos dias antes del vencimiento quieres recibir el recordatorio por Telegram.','3'],
    ['Pending Payments','Estado','Texto','Control del recordatorio',
     'Activo — envia recordatorio\nInactivo — pausado\nPagado — ya pagado este periodo'],
    ['Pending Payments','Referencia','Texto','Codigo de pago, numero de cuenta o referencia bancaria del servicio.','140715 | PSE-2341'],
    ['Pending Payments','Notas','Texto','Observaciones adicionales: banco, metodo de pago, etc.','Debito automatico TC *8352'],
    // ── SEARCH PRODUCTS ───────────────────────────────────────────────────────
    ['Search Products','Producto','Texto','Nombre del producto que quieres comprar','iPhone 16 | Nevera Samsung | Bicicleta'],
    ['Search Products','Descripcion','Texto','Modelo, marca, especificaciones relevantes','128GB, Negro, Face ID'],
    ['Search Products','Precio Objetivo','Numero COP','Maximo que estas dispuesto a pagar','3500000'],
    ['Search Products','Prioridad','Texto','Urgencia de compra','Alta | Media | Baja'],
    ['Search Products','URL Referencia','Texto','Link de referencia del producto en tienda o marketplace','https://...'],
    ['Search Products','Estado','Texto','Estado de seguimiento','Pendiente | Comprado | Descartado'],
    ['Search Products','Fecha Agregado','Fecha DD/MM/YYYY','Cuando agregaste este producto a la lista','23/03/2026'],
    ['Search Products','Notas','Texto','Por que lo necesitas, alternativas evaluadas, observaciones.','Para reemplazar el que se daño'],
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(2, 1, datos.length, headers.length).setValues(datos);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 180); sheet.setColumnWidth(2, 190);
  sheet.setColumnWidth(3, 150); sheet.setColumnWidth(4, 420); sheet.setColumnWidth(5, 220);

  const colores = {
    'Transactions':     '#e8f4e8',
    'Goals':            '#e8f9f0',
    'Financial Insights':'#fce8ff',
    'Errors':           '#ffe8e8',
    'Configurations':   '#e8f0fe',
    'Dashboard':        '#fff3e0',
    'Pending Payments': '#fff8e1',
    'Search Products':  '#f3e8ff',
  };
  datos.forEach((fila, i) => {
    const color = colores[fila[0]] || '#ffffff';
    sheet.getRange(i + 2, 1, 1, headers.length).setBackground(color);
    // filas separadoras (campo vacío = separador de sección)
    if (fila[1].startsWith('—')) {
      sheet.getRange(i + 2, 1, 1, headers.length)
        .setFontWeight('bold')
        .setFontStyle('italic')
        .setFontColor('#555555');
    }
  });
}

// ------------------------------------------------------------
// REORDENA LAS HOJAS
// ------------------------------------------------------------
function reordenarHojas() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  reordenarHojas_(ss);
  logInfo_('SHEETS', 'Hojas reordenadas');
}

function reordenarHojas_(ss) {
  const orden = [SHEETS.DASHBOARD, SHEETS.TRANSACTIONS, SHEETS.CONFIGURATIONS,
                 SHEETS.PENDING_PAYMENTS, SHEETS.SEARCH_PRODUCTS,
                 SHEETS.ERRORS, SHEETS.DATA_DICTIONARY, SHEETS.FINANCIAL_INSIGHTS];
  orden.forEach((nombre, i) => {
    const s = ss.getSheetByName(nombre);
    if (s) { ss.setActiveSheet(s); ss.moveActiveSheet(i + 1); }
  });
}

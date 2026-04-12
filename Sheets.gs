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
    Logger.log('⚠️ Categoría "' + catOriginal + '" no está en la lista → se guarda como "Otro"');
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
    try { verificarAlertaPresupuesto_(txn); } catch(e) { Logger.log('Budget alert error: ' + e.message); }
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
      Logger.log('✏️ Fila ' + (i + 2) + ': "' + original + '" → "' + MAPA[clave] + '"');
    }
  });

  if (corregidos > 0) {
    rango.setValues(valores);
    Logger.log('✅ Categorías normalizadas: ' + corregidos + ' correcciones.');
  } else {
    Logger.log('✅ Todas las categorías ya están correctas.');
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
  Logger.log('✅ Transactions ordenadas: más reciente arriba.');
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
    Logger.log('⚠️ Config no disponible, usando defaults: ' + e.message);
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
  if (!sheet) { Logger.log('❌ Hoja Configurations no encontrada.'); return; }

  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  if (datos.some(function(p) { return String(p).startsWith('Categoría'); })) {
    Logger.log('ℹ️ Categorías ya configuradas. No se hicieron cambios.');
    return;
  }

  // Separador visual
  sheet.appendRow(['--- Categorías ---', '', 'Edita, agrega o elimina categorías. El bot y el dashboard usarán esta lista.']);

  CATEGORIAS_DEFECTO_.forEach(function(cat, i) {
    sheet.appendRow(['Categoría ' + (i + 1), cat, '']);
  });

  Logger.log('✅ ' + CATEGORIAS_DEFECTO_.length + ' categorías agregadas a Configurations.');
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
      Logger.log('✏️ Fila ' + (i+2) + ': "' + original + '" → "' + MAPA_NORM[clave] + '"');
      valores[i][0] = MAPA_NORM[clave];
      corregidos++;
      return;
    }
    // 2. Si la categoría no está en la lista maestra → 'Otro'
    if (original && !listaSet.has(clave)) {
      Logger.log('⚠️ Fila ' + (i+2) + ': "' + original + '" no reconocida → "Otro"');
      valores[i][0] = 'Otro';
      corregidos++;
    }
  });

  if (corregidos > 0) {
    rango.setValues(valores);
    Logger.log('✅ Sincronización completa: ' + corregidos + ' filas actualizadas.');
  } else {
    Logger.log('✅ Todas las categorías ya están alineadas.');
  }
}

// ------------------------------------------------------------
// MIGRACIÓN: agrega filas de bancos/senders a la hoja Configurations existente
// Ejecutar UNA SOLA VEZ en producción
// ------------------------------------------------------------
function agregarConfigBancos() {
  const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.CONFIGURATIONS);
  if (!sheet) { Logger.log('❌ Hoja Configurations no encontrada.'); return; }

  // Verificar si ya existen las filas de bancos
  const datos = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().flat();
  if (datos.some(p => String(p).startsWith('Banco 1'))) {
    Logger.log('ℹ️ Configuración de bancos ya existe. No se hicieron cambios.');
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

  Logger.log('✅ Configuración de bancos agregada (' + nuevasFilas.length + ' filas).');
  Logger.log('💡 Ahora puedes agregar Nequi u otros bancos editando Banco 2/3 en la hoja Configurations.');
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
    if (s && viejo !== nuevo) { s.setName(nuevo); Logger.log(`✅ ${viejo} → ${nuevo}`); }
  });
  reordenarHojas_(ss);
  Logger.log('🎉 Migración completa. Ejecuta reconstruirDashboard() ahora.');
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
  Logger.log('🎉 Spreadsheet listo.');
}

function _crearSiNoExiste(ss, nombre, fn) {
  let sheet = ss.getSheetByName(nombre);
  if (!sheet) { sheet = ss.insertSheet(nombre); fn(sheet); Logger.log('✅ ' + nombre); }
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
  Logger.log('✅ Dashboard reconstruido.');
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
  sheet.getRange('A1').setValue('FINANCEBOT AI - DASHBOARD');

  // ── MES ACTUAL ──
  sheet.getRange('A3').setValue('MES ACTUAL');
  sheet.getRange('B3').setValue('Valor COP');
  sheet.getRange('C3').setValue('% Meta');

  sheet.getRange('A4').setValue('Total Egresos');
  sheet.getRange('B4').setFormula(fMes('egreso'));
  sheet.getRange('C4').setFormula('=B4/' + C + '!B2');

  sheet.getRange('A5').setValue('Total Ingresos');
  sheet.getRange('B5').setFormula(fMes('ingreso'));

  sheet.getRange('A6').setValue('Flujo de Caja');
  sheet.getRange('B6').setFormula('=B5-B4');

  sheet.getRange('A7').setValue('Ratio Ahorro');
  sheet.getRange('B7').setFormula('=(B5-B4)/(B5+(B5=0))*(B5>0)');
  sheet.getRange('C7').setFormula('=(B5-B4)/(B5+(B5=0))*(B5>0)');

  // ── GASTO POR CATEGORIA ──
  sheet.getRange('A9').setValue('GASTO POR CATEGORIA');
  sheet.getRange('B9').setValue('Total COP');
  sheet.getRange('C9').setValue('% del gasto');

  // Leer categorías desde Configurations (fuente de verdad)
  const cfg = leerConfiguracion_();
  var cats  = cfg.categorias.slice().sort();

  cats.forEach(function(cat, i) {
    const row = 10 + i;
    sheet.getRange(row, 1).setValue(cat);
    sheet.getRange(row, 2).setFormula(fMesCat(cat));
    sheet.getRange(row, 3).setFormula('=B' + row + '/(B4+(B4=0))');
  });

  // ── ACUMULADO HISTORICO ──
  const fh = 10 + cats.length + 1;
  sheet.getRange(fh, 1).setValue('ACUMULADO HISTORICO');
  sheet.getRange(fh+1, 1).setValue('Total Egresos Historico');
  sheet.getRange(fh+1, 2).setFormula('=SUMPRODUCT((' + T + '!D2:D="egreso")*' + T + '!F2:F)');
  sheet.getRange(fh+2, 1).setValue('Total Ingresos Historico');
  sheet.getRange(fh+2, 2).setFormula('=SUMPRODUCT((' + T + '!D2:D="ingreso")*' + T + '!F2:F)');
  sheet.getRange(fh+3, 1).setValue('N de Transacciones');
  sheet.getRange(fh+3, 2).setFormula('=COUNTA(' + T + '!A2:A)');

  // ── CONSOLIDADO MENSUAL DEL AÑO ──
  // Referencia la celda E2 (año editable del filtro por periodo)
  const fc = fh + 5;
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  sheet.getRange(fc, 1).setValue('CONSOLIDADO MENSUAL');
  sheet.getRange(fc, 2).setValue('Egresos');
  sheet.getRange(fc, 3).setValue('Ingresos');
  sheet.getRange(fc, 4).setValue('Flujo');
  sheet.getRange(fc, 5).setValue('# Txn');
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

  sheet.getRange('D1').setValue('FILTRO PERIODO');
  sheet.getRange('D2').setValue('Año');
  sheet.getRange('E2').setValue(new Date().getFullYear());
  sheet.getRange('D3').setValue('Mes (1-12)');
  sheet.getRange('E3').setValue(new Date().getMonth() + 1);

  sheet.getRange('D5').setValue('PERIODO');
  sheet.getRange('E5').setValue('Valor COP');
  sheet.getRange('F5').setValue('% Meta');

  sheet.getRange('D6').setValue('Total Egresos');
  sheet.getRange('E6').setFormula(fPer('egreso'));
  sheet.getRange('F6').setFormula('=E6/' + C + '!B2');

  sheet.getRange('D7').setValue('Total Ingresos');
  sheet.getRange('E7').setFormula(fPer('ingreso'));

  sheet.getRange('D8').setValue('Flujo de Caja');
  sheet.getRange('E8').setFormula('=E7-E6');

  sheet.getRange('D9').setValue('Ratio Ahorro');
  sheet.getRange('E9').setFormula('=(E7-E6)/(E7+(E7=0))*(E7>0)');

  sheet.getRange('D11').setValue('POR CATEGORIA');
  sheet.getRange('E11').setValue('Total COP');
  sheet.getRange('F11').setValue('% del gasto');

  cats.forEach(function(cat, i) {
    const row = 12 + i;
    sheet.getRange(row, 4).setValue(cat);
    sheet.getRange(row, 5).setFormula(fPerCat(cat));
    sheet.getRange(row, 6).setFormula('=E' + row + '/(E6+(E6=0))');
  });

  // ── FORMATOS ──
  sheet.getRange('A1').setFontWeight('bold').setFontSize(14);
  [3, 9, fh].forEach(function(r) {
    sheet.getRange(r, 1, 1, 3).setFontWeight('bold').setBackground('#e8f0fe');
  });
  sheet.getRange('D1').setFontWeight('bold').setFontSize(14);
  sheet.getRange('D1').setBackground('#fff8e1');
  sheet.getRange('D2:D3').setBackground('#fff8e1');
  sheet.getRange('E2:E3').setBackground('#fffde7').setFontWeight('bold');  // celdas editables destacadas
  [5, 11].forEach(function(r) {
    sheet.getRange(r, 4, 1, 3).setFontWeight('bold').setBackground('#fff8e1');
  });
  sheet.getRange(fc, 1, 1, 5).setFontWeight('bold').setBackground('#e8f4e8');

  // Formatos numéricos — izquierda
  sheet.getRange('B4:B6').setNumberFormat('#,##0');
  sheet.getRange('B7').setNumberFormat('0.0%');
  sheet.getRange('C4').setNumberFormat('0.0%');
  sheet.getRange('C7').setNumberFormat('0.0%');
  sheet.getRange(10, 2, cats.length, 1).setNumberFormat('#,##0');
  sheet.getRange(10, 3, cats.length, 1).setNumberFormat('0.0%');
  sheet.getRange(fh+1, 2, 3, 1).setNumberFormat('#,##0');
  sheet.getRange(fc+1, 2, 12, 3).setNumberFormat('#,##0');

  // Formatos numéricos — derecha (filtro periodo)
  sheet.getRange('E6:E8').setNumberFormat('#,##0');
  sheet.getRange('E9').setNumberFormat('0.0%');
  sheet.getRange('F6').setNumberFormat('0.0%');
  sheet.getRange('F9').setNumberFormat('0.0%');
  sheet.getRange(12, 5, cats.length, 1).setNumberFormat('#,##0');
  sheet.getRange(12, 6, cats.length, 1).setNumberFormat('0.0%');

  // Anchos de columna
  sheet.setColumnWidth(1, 210); sheet.setColumnWidth(2, 160); sheet.setColumnWidth(3, 130);
  sheet.setColumnWidth(4, 180); sheet.setColumnWidth(5, 160); sheet.setColumnWidth(6, 120);
  sheet.setFrozenRows(1);
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
    'Nombre especifico del servicio o proveedor (Aguas de Manizales, Smart Fit, etc.)',
    'Monto aproximado a pagar en COP. Puede quedar en blanco si varia mes a mes.',
    'Fecha del proximo pago en formato DD/MM/YYYY. Este campo dispara el recordatorio de Telegram.',
    'Hasta cuando debes pagar este servicio. Usa 31/12/2090 si es un pago recurrente sin fecha limite.',
    'Con que frecuencia se repite: Mensual, Bimestral, Trimestral, Anual, Unico.',
    'Cuantos dias ANTES de FechaPago quieres recibir el recordatorio por Telegram.',
    'Estado actual: Activo (envia recordatorio), Inactivo (pausado), Pagado (ya pagado este periodo).',
    'Numero de referencia, cuenta o codigo de pago. Util para incluirlo en el recordatorio.',
    'Notas adicionales: banco, metodo de pago, observaciones.',
  ];
  const ejemplos = [
    ['Servicios publicos','Aguas de Manizales','','01/04/2026','31/12/2090','Mensual',3,'Activo','140715','Factura agua Manizales'],
    ['Salud','Smart Fit / Gimnasio',0,'20/04/2026','31/12/2090','Mensual',3,'Activo','','Ejemplo — reemplaza con tus datos'],
    ['Vivienda','Administracion','','05/04/2026','31/12/2090','Mensual',5,'Activo','',''],
    ['Servicios publicos','Internet/Cable','','15/04/2026','31/12/2090','Mensual',3,'Activo','',''],
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
  const headers = ['Hoja','Campo','Tipo','Descripcion','Ejemplo'];
  const datos = [
    ['Transactions','ID','Texto','Identificador unico generado automaticamente','TXN-1711234567-A3F9B'],
    ['Transactions','Fecha','Texto YYYY-MM-DD','Fecha de la transaccion segun el email de Bancolombia','2026-03-22'],
    ['Transactions','Hora','Texto HH:MM','Hora de la transaccion','14:30'],
    ['Transactions','Tipo','Texto','Flujo: ingreso / egreso / informativo','egreso'],
    ['Transactions','Tipo Transaccion','Texto','Tipo especifico de operacion bancaria','compra_tc'],
    ['Transactions','Monto','Numero','Valor en COP sin decimales','50000'],
    ['Transactions','Moneda','Texto','Siempre COP','COP'],
    ['Transactions','Comercio/Destino','Texto','Nombre del comercio o destinatario de transferencia','TIENDA D1 MANIZALES'],
    ['Transactions','Cuenta Origen','Texto','Ultimos 4 digitos de la cuenta o tarjeta que realizo el pago','1234'],
    ['Transactions','Categoria','Texto','Categoria principal asignada por Gemini','Alimentación'],
    ['Transactions','Subcategoria','Texto','Subcategoria especifica','Supermercados'],
    ['Transactions','Necesidad','Texto','Clasificacion: necesario / prescindible / lujo / n/a','necesario'],
    ['Transactions','Sugerencia','Texto','Consejo de ahorro de Gemini para esta transaccion','Compara precios en otras tiendas'],
    ['Transactions','Referencia','Texto','Cuenta destino en transferencias o codigo de factura','3225768527'],
    ['Transactions','Confianza','Numero 0-1','Nivel de certeza del parsing de Gemini','0.95'],
    ['Transactions','Fuente','Texto','Origen del dato (siempre email en esta version)','email'],
    ['Transactions','Procesado','Texto ISO 8601','Timestamp de cuando el bot proceso este email','2026-03-22T21:38:28.000Z'],
    ['Errors','ID','Texto','Identificador unico del error','ERR-1711234567'],
    ['Errors','Error','Texto','Descripcion del error ocurrido','Gemini respondio con codigo 429'],
    ['Errors','Asunto Email','Texto','Asunto del email que no se pudo procesar','Alertas y Notificaciones'],
    ['Errors','Email ID','Texto','ID del mensaje en Gmail para buscarlo manualmente','18e8a1b2c3d4e5f6'],
    ['Errors','Procesado','Texto ISO 8601','Cuando ocurrio el error','2026-03-22T21:38:28.000Z'],
    ['Configurations','Parametro','Texto','Nombre del parametro de configuracion','Umbral alerta Telegram'],
    ['Configurations','Valor','Variable','Valor actual del parametro','200000'],
    ['Configurations','Descripcion','Texto','Que hace este parametro y como afecta el comportamiento del bot','COP — envia alerta si un egreso supera este valor'],
    ['Pending Payments','Servicio','Texto','Categoria del pago recurrente','Servicios publicos'],
    ['Pending Payments','Nombre','Texto','Nombre especifico del proveedor o servicio','Aguas de Manizales'],
    ['Pending Payments','Valor','Numero','Monto aproximado en COP','140000'],
    ['Pending Payments','FechaPago','Fecha DD/MM/YYYY','Proximo vencimiento — dispara el recordatorio Telegram','01/04/2026'],
    ['Pending Payments','FechaLimitePago','Fecha DD/MM/YYYY','Hasta cuando aplica este pago. 31/12/2090 = sin limite','31/12/2090'],
    ['Pending Payments','Frecuencia','Texto','Con que frecuencia se repite','Mensual'],
    ['Pending Payments','DiasAnticipacion','Numero','Dias antes del vencimiento para recibir el recordatorio','3'],
    ['Pending Payments','Estado','Texto','Activo (recordatorio activo) / Inactivo / Pagado','Activo'],
    ['Pending Payments','Referencia','Texto','Codigo de pago, cuenta o referencia del servicio','140715'],
    ['Pending Payments','Notas','Texto','Observaciones adicionales','Debito automatico TC *1234'],
    ['Search Products','Producto','Texto','Nombre del producto que quieres comprar','iPhone 15'],
    ['Search Products','Descripcion','Texto','Modelo, marca, especificaciones','128GB, Negro'],
    ['Search Products','Precio Objetivo','Numero','Maximo que pagas en COP','3500000'],
    ['Search Products','Prioridad','Texto','Alta / Media / Baja','Media'],
    ['Search Products','URL Referencia','Texto','Link al producto en tienda o marketplace','https://...'],
    ['Search Products','Estado','Texto','Pendiente / Comprado / Descartado','Pendiente'],
    ['Search Products','Fecha Agregado','Fecha','Cuando lo agregaste a la lista','23/03/2026'],
    ['Search Products','Notas','Texto','Por que lo necesitas, alternativas','Para reemplazar iPhone 11'],
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#e8f0fe');
  sheet.getRange(2, 1, datos.length, headers.length).setValues(datos);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 160); sheet.setColumnWidth(2, 160);
  sheet.setColumnWidth(3, 140); sheet.setColumnWidth(4, 380); sheet.setColumnWidth(5, 200);

  const colores = {
    'Transactions':'#e8f4e8','Errors':'#ffe8e8',
    'Configurations':'#e8f0fe','Pending Payments':'#fff8e1','Search Products':'#f3e8ff'
  };
  datos.forEach((fila, i) => {
    const color = colores[fila[0]] || '#ffffff';
    sheet.getRange(i + 2, 1, 1, headers.length).setBackground(color);
  });
}

// ------------------------------------------------------------
// REORDENA LAS HOJAS
// ------------------------------------------------------------
function reordenarHojas() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  reordenarHojas_(ss);
  Logger.log('✅ Hojas reordenadas.');
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

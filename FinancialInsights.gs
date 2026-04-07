// ============================================================
// FINANCEBOT AI - HOJA FINANCIAL INSIGHTS
// Almacena el historial de reportes del Asesor Financiero.
// Cada vez que corre analizarFinanzas() se guarda un snapshot.
// ============================================================

// Nombre de la hoja — se agrega al objeto SHEETS en Sheets.gs
// ACCIÓN MANUAL: agregar esta línea al const SHEETS en Sheets.gs:
//   FINANCIAL_INSIGHTS: 'Financial Insights',

// ------------------------------------------------------------
// CREA Y CONFIGURA LA HOJA "Financial Insights"
// Se llama automáticamente si la hoja no existe al guardar
// También puedes ejecutarla manualmente para crearla ahora
// ------------------------------------------------------------
function configurarFinancialInsights_(ss) {
  const ssObj = ss || SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ssObj.getSheetByName('Financial Insights');

  if (!sheet) {
    sheet = ssObj.insertSheet('Financial Insights');
    Logger.log('✅ Hoja Financial Insights creada.');
  }

  // Headers (fila 1)
  const headers = [
    'Fecha Registro',    // A
    'Periodo',           // B
    'Ingresos COP',      // C
    'Egresos COP',       // D
    'Balance COP',       // E
    'Tasa Ahorro %',     // F
    'Score (0-100)',     // G
    'Escenario Optimista', // H — menor gasto histórico (últimos 6 meses)
    'Escenario Base',    // I — promedio histórico
    'Escenario Pesimista', // J — mayor gasto histórico
    'Proyección Fin Mes', // K — egresos proyectados al cierre del mes
    'Ritmo Diario COP',  // L
    'Categoría Principal', // M
    'Análisis IA',       // N
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Formato del header
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange
    .setBackground('#1a73e8')
    .setFontColor('#ffffff')
    .setFontWeight('bold');

  // Anchos de columna
  sheet.setColumnWidth(1, 140);  // Fecha Registro
  sheet.setColumnWidth(2, 120);  // Periodo
  sheet.setColumnWidth(3, 130);  // Ingresos
  sheet.setColumnWidth(4, 130);  // Egresos
  sheet.setColumnWidth(5, 130);  // Balance
  sheet.setColumnWidth(6, 110);  // Tasa Ahorro
  sheet.setColumnWidth(7, 110);  // Score
  sheet.setColumnWidth(8, 160);  // Optimista
  sheet.setColumnWidth(9, 140);  // Base
  sheet.setColumnWidth(10, 160); // Pesimista
  sheet.setColumnWidth(11, 165); // Proyección
  sheet.setColumnWidth(12, 140); // Ritmo Diario
  sheet.setColumnWidth(13, 160); // Categoría Principal
  sheet.setColumnWidth(14, 400); // Análisis IA

  // Formato numérico en columnas de montos (C-E, H-L)
  const formatoCOP = '#,##0';
  sheet.getRange(2, 3, 1000, 3).setNumberFormat(formatoCOP); // C-E
  sheet.getRange(2, 8, 1000, 5).setNumberFormat(formatoCOP); // H-L
  sheet.getRange(2, 6, 1000, 1).setNumberFormat('0.0"%"');   // Tasa ahorro
  sheet.getRange(2, 7, 1000, 1).setNumberFormat('0');        // Score

  // Congelar fila de headers
  sheet.setFrozenRows(1);

  Logger.log('✅ Financial Insights configurada con ' + headers.length + ' columnas.');
  return sheet;
}

// ------------------------------------------------------------
// FUNCIÓN DE PRUEBA — ejecutar para verificar que la hoja
// se crea y recibe datos correctamente
// ------------------------------------------------------------
function probarFinancialInsights() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet = configurarFinancialInsights_(ss);

  // Insertar fila de prueba
  sheet.appendRow([
    new Date(),
    'Prueba ' + new Date().toLocaleDateString('es-CO'),
    5000000,   // Ingresos
    3200000,   // Egresos
    1800000,   // Balance
    36.0,      // Tasa ahorro
    72,        // Score
    2800000,   // Escenario optimista
    3200000,   // Escenario base
    3800000,   // Escenario pesimista
    3500000,   // Proyección fin mes
    106666,    // Ritmo diario
    'Alimentación',
    'Fila de prueba — borrar después de verificar.',
  ]);

  Logger.log('✅ Fila de prueba insertada en Financial Insights. Verifica el Spreadsheet.');
}

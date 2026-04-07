// ============================================================
// FINANCEBOT AI - ASESOR FINANCIERO PERSONAL
// Análisis diario de finanzas → Telegram
// Configura un trigger diario (ej: 8am) para analizarFinanzas()
// ============================================================

// ------------------------------------------------------------
// FUNCIÓN PRINCIPAL — Genera y envía el reporte diario
// ------------------------------------------------------------
function analizarFinanzas() {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    Logger.log('⚠️ Telegram no configurado.');
    return;
  }

  const ss       = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet    = ss.getSheetByName(SHEETS.TRANSACTIONS);
  const lastRow  = sheet ? sheet.getLastRow() : 1;

  if (!sheet || lastRow < 2) {
    Logger.log('⚠️ No hay transacciones para analizar.');
    return;
  }

  // Leer todas las transacciones (col A–J: ID, Fecha, Hora, Tipo, TipoTxn, Monto, Moneda, Comercio, Cuenta, Categoria)
  const datos = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

  const hoy       = new Date();
  const mesAct    = hoy.getMonth();
  const anioAct   = hoy.getFullYear();
  const mesPrev   = mesAct === 0 ? 11 : mesAct - 1;
  const anioPrev  = mesAct === 0 ? anioAct - 1 : anioAct;

  // Separar transacciones por mes
  const txnAct  = [];
  const txnPrev = [];

  datos.forEach(function(row) {
    const fecha = row[1];
    if (!fecha) return;
    const d    = fecha instanceof Date ? fecha : new Date(fecha);
    const tipo = String(row[3]).toLowerCase();
    if (tipo === 'informativo') return;

    const m = d.getMonth();
    const y = d.getFullYear();
    if (m === mesAct  && y === anioAct)  txnAct.push(row);
    if (m === mesPrev && y === anioPrev) txnPrev.push(row);
  });

  const act  = calcularMetricas_(txnAct);
  const prev = calcularMetricas_(txnPrev);

  // Detectar transacciones anómalas (monto > 2x la media del mes)
  const anomalias = detectarAnomalias_(txnAct, act.promedioEgreso);

  // Llamar a Gemini para el análisis narrativo
  const analisis = generarAnalisisIA_(act, prev, anomalias, mesAct, anioAct, mesPrev, anioPrev);

  // Construir y enviar mensaje Telegram
  const mensaje = construirMensajeReporte_(act, prev, anomalias, analisis, mesAct, anioAct, mesPrev, anioPrev);
  enviarMensajeTelegram_(mensaje);

  Logger.log('✅ Reporte financiero enviado a Telegram.');
  Logger.log('   Ingresos: $' + act.ingresos.toLocaleString('es-CO'));
  Logger.log('   Egresos:  $' + act.egresos.toLocaleString('es-CO'));
  Logger.log('   Balance:  $' + act.balance.toLocaleString('es-CO'));
}

// ------------------------------------------------------------
// CALCULA MÉTRICAS A PARTIR DE UN ARREGLO DE TRANSACCIONES
// ------------------------------------------------------------
function calcularMetricas_(txns) {
  let ingresos = 0;
  let egresos  = 0;
  let countEg  = 0;
  const cats   = {};
  const comerciosAltos = [];

  txns.forEach(function(row) {
    const tipo  = String(row[3]).toLowerCase();
    const monto = Number(row[5]) || 0;
    const cat   = String(row[9]).trim() || 'Otro';
    const comercio = String(row[7]).trim();

    if (tipo === 'ingreso') {
      ingresos += monto;
    } else if (tipo === 'egreso') {
      egresos += monto;
      countEg++;
      cats[cat] = (cats[cat] || 0) + monto;
    }
  });

  const topCats      = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);
  const tasaAhorro   = ingresos > 0 ? ((ingresos - egresos) / ingresos * 100) : 0;
  const promedioEgreso = countEg > 0 ? egresos / countEg : 0;

  return {
    ingresos,
    egresos,
    balance:       ingresos - egresos,
    tasaAhorro:    tasaAhorro.toFixed(1),
    topCats,
    cats,
    count:         txns.length,
    countEgresos:  countEg,
    promedioEgreso,
  };
}

// ------------------------------------------------------------
// DETECTA TRANSACCIONES ANÓMALAS
// Un gasto es anómalo si supera 3x el promedio del mes
// ------------------------------------------------------------
function detectarAnomalias_(txns, promedio) {
  if (promedio <= 0) return [];
  const umbral = promedio * 3;
  const result = [];

  txns.forEach(function(row) {
    const tipo  = String(row[3]).toLowerCase();
    const monto = Number(row[5]) || 0;
    if (tipo === 'egreso' && monto > umbral && monto > 50000) {
      result.push({ comercio: String(row[7]), monto: monto, cat: String(row[9]) });
    }
  });

  // Máximo 2 anomalías para no saturar el mensaje
  return result.slice(0, 2);
}

// ------------------------------------------------------------
// LLAMA A GEMINI PARA ANÁLISIS NARRATIVO
// ------------------------------------------------------------
function generarAnalisisIA_(act, prev, anomalias, mesAct, anioAct, mesPrev, anioPrev) {
  const MESES = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];

  const fmt = function(n) { return '$' + Number(n).toLocaleString('es-CO') + ' COP'; };

  const varEgresos = prev.egresos > 0
    ? (((act.egresos - prev.egresos) / prev.egresos) * 100).toFixed(1)
    : null;

  const topCatsStr = act.topCats.map(function(item, i) {
    const pct = act.egresos > 0 ? (item[1] / act.egresos * 100).toFixed(0) : 0;
    return (i + 1) + '. ' + item[0] + ': ' + fmt(item[1]) + ' (' + pct + '%)';
  }).join('\n');

  const anomaliasStr = anomalias.length > 0
    ? anomalias.map(function(a) { return '• ' + a.comercio + ': ' + fmt(a.monto); }).join('\n')
    : 'Ninguna';

  const prompt =
    'Eres un asesor financiero personal colombiano, experto en finanzas personales y productos de inversión en Colombia. ' +
    'Tu respuesta debe ser en español, máximo 5 líneas, sin asteriscos ni markdown, tono amigable y directo.\n\n' +
    'DATOS DE ' + MESES[mesAct].toUpperCase() + ' ' + anioAct + ':\n' +
    '• Ingresos: ' + fmt(act.ingresos) + '\n' +
    '• Egresos: ' + fmt(act.egresos) + '\n' +
    '• Balance: ' + fmt(act.balance) + '\n' +
    '• Tasa de ahorro: ' + act.tasaAhorro + '%\n' +
    '• Transacciones: ' + act.count + '\n\n' +
    'TOP CATEGORÍAS DE GASTO:\n' + (topCatsStr || 'Sin datos') + '\n\n' +
    'COMPARADO CON ' + MESES[mesPrev].toUpperCase() + ' ' + anioPrev + ':\n' +
    '• Egresos: ' + fmt(prev.egresos) + (varEgresos ? ' (variación: ' + varEgresos + '%)' : '') + '\n' +
    '• Balance anterior: ' + fmt(prev.balance) + '\n\n' +
    'GASTOS INUSUALES:\n' + anomaliasStr + '\n\n' +
    'Con base en estos datos reales:\n' +
    '1. Da una observación clave sobre el patrón de gasto\n' +
    '2. Recomienda un producto de inversión colombiano concreto (CDTs, FICs, Fiducias de Bancolombia, etc.) con el superávit disponible\n' +
    '3. Da un consejo práctico para el próximo mes\n' +
    'Si el balance es negativo, enfócate en reducción de gastos antes de invertir.';

  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
    };
    const options = {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    };
    const resp = UrlFetchApp.fetch(CONFIG.GEMINI_URL + '?key=' + CONFIG.GEMINI_API_KEY, options);
    if (resp.getResponseCode() !== 200) throw new Error('Gemini ' + resp.getResponseCode());

    const json = JSON.parse(resp.getContentText());
    let texto = json.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('').trim();
    // Limpiar caracteres que rompen el Markdown de Telegram
    texto = texto.replace(/[*_`\[\]]/g, '').replace(/#+\s/g, '').trim();
    return texto;
  } catch(e) {
    Logger.log('⚠️ Error Gemini advisor: ' + e.message);
    return 'No se pudo generar el análisis IA en este momento.';
  }
}

// ------------------------------------------------------------
// CONSTRUYE EL MENSAJE DE TELEGRAM
// ------------------------------------------------------------
function construirMensajeReporte_(act, prev, anomalias, analisis, mesAct, anioAct, mesPrev, anioPrev) {
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const fmt = function(n) {
    const abs = Math.abs(n);
    const signo = n < 0 ? '-' : '';
    return signo + '$' + Number(abs).toLocaleString('es-CO') + ' COP';
  };

  // Balance emoji
  const balEmoji = act.balance >= 0 ? '💚' : '🔴';
  const ahorroEmoji = Number(act.tasaAhorro) >= 20 ? '🟢' : Number(act.tasaAhorro) >= 10 ? '🟡' : '🔴';

  // Variación egresos vs mes anterior
  let varLine = '';
  if (prev.egresos > 0) {
    const varPct  = ((act.egresos - prev.egresos) / prev.egresos * 100).toFixed(1);
    const arrow   = Number(varPct) > 0 ? '📈' : '📉';
    const signo   = Number(varPct) > 0 ? '+' : '';
    varLine = arrow + ' Egresos vs ' + MESES[mesPrev] + ': ' + signo + varPct + '%\n';
  }

  // Top categorías
  const topLine = act.topCats.length > 0
    ? act.topCats.map(function(item, i) {
        const pct = act.egresos > 0 ? (item[1] / act.egresos * 100).toFixed(0) : 0;
        return '  ' + (i + 1) + '. ' + item[0] + ': $' + Number(item[1]).toLocaleString('es-CO') + ' (' + pct + '%)';
      }).join('\n')
    : '  Sin datos';

  // Anomalías
  let anomaliasLine = '';
  if (anomalias.length > 0) {
    anomaliasLine = '\n⚠️ *Gastos inusuales*\n' +
      anomalias.map(function(a) {
        return '  • ' + a.comercio + ': $' + Number(a.monto).toLocaleString('es-CO');
      }).join('\n') + '\n';
  }

  // Alerta balance negativo
  let alertaBalance = '';
  if (act.balance < 0) {
    alertaBalance = '\n🚨 *Alerta:* los egresos superan los ingresos este mes.\n';
  }

  return (
    '📊 *Reporte Financiero — ' + MESES[mesAct] + ' ' + anioAct + '*\n\n' +
    '💚 Ingresos:  $' + Number(act.ingresos).toLocaleString('es-CO') + ' COP\n' +
    '🔴 Egresos:   $' + Number(act.egresos).toLocaleString('es-CO')  + ' COP\n' +
    balEmoji + ' Balance:   ' + fmt(act.balance) + '\n' +
    ahorroEmoji + ' Tasa ahorro: ' + act.tasaAhorro + '%\n' +
    '\n📂 *Top categorías*\n' + topLine + '\n' +
    '\n' + varLine +
    alertaBalance +
    anomaliasLine +
    '\n🧠 *Análisis IA*\n' + analisis
  );
}

// ------------------------------------------------------------
// PRUEBA RÁPIDA — Ejecutar manualmente para verificar
// ------------------------------------------------------------
function probarAsesorFinanciero() {
  Logger.log('🔍 Ejecutando análisis financiero de prueba...');
  analizarFinanzas();
}

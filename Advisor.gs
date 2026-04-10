// ============================================================
// FINANCEBOT AI - ASESOR FINANCIERO PERSONAL v2
// Módulos: proyección, escenarios, score 0-100, sensibilidad
// Trigger: diario a las 8am → analizarFinanzas()
// ============================================================

function analizarFinanzas() {
  if (!CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    Logger.log('⚠️ Telegram no configurado.');
    return;
  }

  const ss      = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const sheet   = ss.getSheetByName(SHEETS.TRANSACTIONS);
  const lastRow = sheet ? sheet.getLastRow() : 1;

  if (!sheet || lastRow < 2) {
    Logger.log('⚠️ No hay transacciones para analizar.');
    return;
  }

  // Leer todas las transacciones — col A–J
  const datos = sheet.getRange(2, 1, lastRow - 1, 10).getValues();

  const hoy      = new Date();
  const mesAct   = hoy.getMonth();
  const anioAct  = hoy.getFullYear();
  const mesPrev  = mesAct === 0 ? 11 : mesAct - 1;
  const anioPrev = mesAct === 0 ? anioAct - 1 : anioAct;

  // Separar por mes
  const txnAct  = [];
  const txnPrev = [];

  datos.forEach(function(row) {
    const fecha = row[1];
    if (!fecha) return;
    const d    = fecha instanceof Date ? fecha : new Date(fecha);
    const tipo = String(row[3]).toLowerCase();
    if (tipo === 'informativo') return;
    const m = d.getMonth(), y = d.getFullYear();
    if (m === mesAct  && y === anioAct)  txnAct.push(row);
    if (m === mesPrev && y === anioPrev) txnPrev.push(row);
  });

  const act        = calcularMetricas_(txnAct);
  const prev       = calcularMetricas_(txnPrev);
  const proyeccion = calcularProyeccionMes_(txnAct, hoy);
  const escenarios = calcularEscenarios_(datos, mesAct, anioAct);
  const anomalias  = detectarAnomalias_(txnAct, act.promedioEgreso);
  const score      = calcularScore_(act, prev, proyeccion, anomalias);
  const sensib     = calcularSensibilidad_(act);
  const analisis   = generarAnalisisIA_(act, prev, proyeccion, escenarios, score, anomalias, mesAct, anioAct, mesPrev, anioPrev);

  guardarInsight_(ss, act, score, proyeccion, escenarios, sensib, analisis, mesAct, anioAct);

  const mensaje = construirMensajeReporte_(act, prev, proyeccion, escenarios, score, anomalias, sensib, analisis, mesAct, anioAct, mesPrev, anioPrev);
  enviarMensajeTelegram_(mensaje);

  Logger.log('✅ Reporte financiero v2 enviado.');
}

// ------------------------------------------------------------
// MÉTRICAS BÁSICAS DEL MES
// ------------------------------------------------------------
function calcularMetricas_(txns) {
  let ingresos = 0, egresos = 0, countEg = 0;
  const cats = {};

  txns.forEach(function(row) {
    const tipo  = String(row[3]).toLowerCase();
    const monto = Number(row[5]) || 0;
    const cat   = String(row[9]).trim() || 'Otro';
    if (tipo === 'ingreso') {
      ingresos += monto;
    } else if (tipo === 'egreso') {
      egresos += monto;
      countEg++;
      cats[cat] = (cats[cat] || 0) + monto;
    }
  });

  const topCats        = Object.entries(cats).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 3);
  const tasaAhorro     = ingresos > 0 ? ((ingresos - egresos) / ingresos * 100) : 0;
  const promedioEgreso = countEg > 0 ? egresos / countEg : 0;

  return { ingresos, egresos, balance: ingresos - egresos, tasaAhorro, topCats, cats, count: txns.length, countEgresos: countEg, promedioEgreso };
}

// ------------------------------------------------------------
// PROYECCIÓN AL CIERRE DEL MES
// Calcula el ritmo diario actual y proyecta los egresos totales
// ------------------------------------------------------------
function calcularProyeccionMes_(txnAct, hoy) {
  const diasMes      = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const diaActual    = hoy.getDate();
  const diasRestantes = diasMes - diaActual;

  let egresosHastaHoy = 0;
  txnAct.forEach(function(row) {
    if (String(row[3]).toLowerCase() === 'egreso') egresosHastaHoy += Number(row[5]) || 0;
  });

  const ritmoDiario       = diaActual > 0 ? egresosHastaHoy / diaActual : 0;
  const proyeccionEgresos = egresosHastaHoy + (ritmoDiario * diasRestantes);
  const gastoPendiente    = ritmoDiario * diasRestantes;

  return { diasMes, diaActual, diasRestantes, ritmoDiario, egresosHastaHoy, proyeccionEgresos, gastoPendiente };
}

// ------------------------------------------------------------
// ESCENARIOS (últimos 6 meses históricos)
// Optimista = menor gasto, Base = promedio, Pesimista = mayor
// ------------------------------------------------------------
function calcularEscenarios_(datos, mesActual, anioActual) {
  const egresoPorMes = {};

  datos.forEach(function(row) {
    const fecha = row[1];
    if (!fecha) return;
    const d    = fecha instanceof Date ? fecha : new Date(fecha);
    const tipo = String(row[3]).toLowerCase();
    if (tipo !== 'egreso') return;

    const m = d.getMonth(), y = d.getFullYear();
    // Excluir mes actual
    if (m === mesActual && y === anioActual) return;

    const clave = y + '-' + m;
    egresoPorMes[clave] = (egresoPorMes[clave] || 0) + (Number(row[5]) || 0);
  });

  // Tomar los últimos 6 meses disponibles
  const valores = Object.values(egresoPorMes).sort(function(a, b) { return a - b; });
  const ultimos6 = valores.slice(-6);

  if (ultimos6.length === 0) return { optimista: 0, base: 0, pesimista: 0, mesesAnalizados: 0 };

  const suma = ultimos6.reduce(function(a, b) { return a + b; }, 0);
  return {
    optimista:       ultimos6[0],
    base:            suma / ultimos6.length,
    pesimista:       ultimos6[ultimos6.length - 1],
    mesesAnalizados: ultimos6.length,
  };
}

// ------------------------------------------------------------
// SCORE FINANCIERO 0–100
// Tasa ahorro 30pts | balance positivo 20pts | tendencia 20pts
// sin anomalías 15pts | proyección saludable 15pts
// ------------------------------------------------------------
function calcularScore_(act, prev, proyeccion, anomalias) {
  let score = 0;

  // 1. Tasa de ahorro (30 pts)
  const ahorro = Number(act.tasaAhorro);
  if      (ahorro >= 30) score += 30;
  else if (ahorro >= 20) score += 22;
  else if (ahorro >= 10) score += 14;
  else if (ahorro > 0)   score += 6;

  // 2. Balance positivo (20 pts)
  if (act.balance > 0) score += 20;

  // 3. Tendencia vs mes anterior (20 pts)
  if (prev.egresos > 0) {
    const varPct = (act.egresos - prev.egresos) / prev.egresos * 100;
    if      (varPct <= -10) score += 20;
    else if (varPct <= 0)   score += 14;
    else if (varPct <= 10)  score += 7;
  } else {
    score += 10; // sin datos del mes anterior
  }

  // 4. Sin anomalías (15 pts)
  if      (anomalias.length === 0) score += 15;
  else if (anomalias.length === 1) score += 7;

  // 5. Proyección saludable (15 pts)
  if (proyeccion.proyeccionEgresos > 0 && act.ingresos > 0) {
    const ratio = proyeccion.proyeccionEgresos / act.ingresos;
    if      (ratio <= 0.7) score += 15;
    else if (ratio <= 0.9) score += 8;
    else if (ratio <= 1.0) score += 3;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

// ------------------------------------------------------------
// SENSIBILIDAD — top 5 categorías con % de impacto
// ------------------------------------------------------------
function calcularSensibilidad_(act) {
  if (act.egresos === 0) return [];
  return Object.entries(act.cats)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 5)
    .map(function(item) {
      return { cat: item[0], monto: item[1], pct: (item[1] / act.egresos * 100).toFixed(1) };
    });
}

// ------------------------------------------------------------
// DETECTA GASTOS ANÓMALOS (> 3x el promedio del mes)
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
  return result.slice(0, 2);
}

// ------------------------------------------------------------
// GUARDA SNAPSHOT EN FINANCIAL INSIGHTS
// ------------------------------------------------------------
function guardarInsight_(ss, act, score, proyeccion, escenarios, sensib, analisis, mesAct, anioAct) {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  // Crear hoja si no existe
  configurarFinancialInsights_(ss);
  const sheet = ss.getSheetByName(SHEETS.FINANCIAL_INSIGHTS);
  if (!sheet) return;

  const catPrincipal = sensib.length > 0 ? sensib[0].cat : '';

  sheet.appendRow([
    new Date(),                          // A — Fecha Registro
    MESES[mesAct] + ' ' + anioAct,       // B — Periodo
    act.ingresos,                        // C — Ingresos
    act.egresos,                         // D — Egresos
    act.balance,                         // E — Balance
    Number(act.tasaAhorro.toFixed(1)),   // F — Tasa Ahorro %
    score,                               // G — Score
    escenarios.optimista,                // H — Escenario Optimista
    Math.round(escenarios.base),         // I — Escenario Base
    escenarios.pesimista,                // J — Escenario Pesimista
    Math.round(proyeccion.proyeccionEgresos), // K — Proyección fin mes
    Math.round(proyeccion.ritmoDiario),  // L — Ritmo diario
    catPrincipal,                        // M — Categoría principal
    analisis,                            // N — Análisis IA
  ]);

  Logger.log('✅ Insight guardado en Financial Insights.');
}

// ------------------------------------------------------------
// ANÁLISIS NARRATIVO CON GEMINI
// ------------------------------------------------------------
function generarAnalisisIA_(act, prev, proyeccion, escenarios, score, anomalias, mesAct, anioAct, mesPrev, anioPrev) {
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const fmt   = function(n) { return '$' + Number(Math.round(n)).toLocaleString('es-CO') + ' COP'; };

  const topStr = act.topCats.map(function(item, i) {
    const pct = act.egresos > 0 ? (item[1] / act.egresos * 100).toFixed(0) : 0;
    return (i + 1) + '. ' + item[0] + ': ' + fmt(item[1]) + ' (' + pct + '%)';
  }).join('\n');

  const escStr = escenarios.mesesAnalizados > 0
    ? 'Histórico ' + escenarios.mesesAnalizados + ' meses — Optimista: ' + fmt(escenarios.optimista) + ' | Base: ' + fmt(escenarios.base) + ' | Pesimista: ' + fmt(escenarios.pesimista)
    : 'Sin historial suficiente';

  const anomStr = anomalias.length > 0
    ? anomalias.map(function(a) { return '• ' + a.comercio + ': ' + fmt(a.monto); }).join('\n')
    : 'Ninguno';

  const varEgresos = prev.egresos > 0
    ? ((act.egresos - prev.egresos) / prev.egresos * 100).toFixed(1) + '%'
    : 'sin datos';

  const prompt =
    'Eres el mejor amigo de Carlos, colombiano, que casualmente sabe mucho de finanzas personales. ' +
    'Le hablas de tú, en tono cercano y directo, como por WhatsApp. Sin listas numeradas, sin términos corporativos. ' +
    'Máximo 3 oraciones cortas. Sin asteriscos ni markdown.\n\n' +
    'Sus finanzas de ' + MESES[mesAct] + ' ' + anioAct + ':\n' +
    '• Ingresos: ' + fmt(act.ingresos) + ', Egresos: ' + fmt(act.egresos) + ' (vs ' + MESES[mesPrev] + ': ' + varEgresos + ')\n' +
    '• Le sobró/faltó: ' + fmt(act.balance) + ', ahorra el ' + Number(act.tasaAhorro).toFixed(1) + '% de lo que gana\n' +
    '• Score: ' + score + '/100\n' +
    '• Más gasta en: ' + (topStr || 'sin datos') + '\n' +
    '• Gastos raros este mes: ' + anomStr + '\n' +
    '• Va a gastar aprox ' + fmt(proyeccion.proyeccionEgresos) + ' si sigue igual\n\n' +
    'Dale un comentario honesto y concreto sobre cómo le fue este mes y qué puede mejorar el próximo. ' +
    'Si le sobró plata, menciona algo concreto para hacer con ese excedente (no productos de inversión formales, sino ideas prácticas). ' +
    'Si gastó más de lo normal en algo, díselo sin rodeos.';

  try {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
    };
    const options = { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true };
    const resp = UrlFetchApp.fetch(CONFIG.GEMINI_URL + '?key=' + CONFIG.GEMINI_API_KEY, options);
    if (resp.getResponseCode() !== 200) throw new Error('Gemini ' + resp.getResponseCode());
    const json = JSON.parse(resp.getContentText());
    let texto = json.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('').trim();
    return texto.replace(/[*_`\[\]]/g, '').replace(/#+\s/g, '').trim();
  } catch(e) {
    Logger.log('⚠️ Gemini advisor error: ' + e.message);
    return 'Análisis no disponible en este momento.';
  }
}

// ------------------------------------------------------------
// CONSTRUYE EL MENSAJE DE TELEGRAM
// ------------------------------------------------------------
function construirMensajeReporte_(act, prev, proyeccion, escenarios, score, anomalias, sensib, analisis, mesAct, anioAct, mesPrev, anioPrev) {
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const fmt   = function(n) { return '$' + Number(Math.round(Math.abs(n))).toLocaleString('es-CO') + ' COP'; };

  // Score emoji
  const scoreEmoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : score >= 40 ? '🟠' : '🔴';
  const balEmoji   = act.balance >= 0 ? '💚' : '🔴';
  const ahorroEmoji = Number(act.tasaAhorro) >= 20 ? '🟢' : Number(act.tasaAhorro) >= 10 ? '🟡' : '🔴';

  // Variación egresos
  let varLine = '';
  if (prev.egresos > 0) {
    const varPct = ((act.egresos - prev.egresos) / prev.egresos * 100).toFixed(1);
    varLine = (Number(varPct) > 0 ? '📈' : '📉') + ' vs ' + MESES[mesPrev] + ': ' + (Number(varPct) > 0 ? '+' : '') + varPct + '%\n';
  }

  // Top categorías
  const topLine = act.topCats.map(function(item, i) {
    const pct = act.egresos > 0 ? (item[1] / act.egresos * 100).toFixed(0) : 0;
    return '  ' + (i + 1) + '. ' + item[0] + ': ' + fmt(item[1]) + ' (' + pct + '%)';
  }).join('\n') || '  Sin datos';

  // Proyección
  const proyLine =
    '  Ritmo diario: ' + fmt(proyeccion.ritmoDiario) + '\n' +
    '  Proyección fin de mes: ' + fmt(proyeccion.proyeccionEgresos) + '\n' +
    '  Días restantes: ' + proyeccion.diasRestantes;

  // Escenarios
  let escLine = '';
  if (escenarios.mesesAnalizados > 0) {
    escLine =
      '\n📐 *Escenarios históricos* (' + escenarios.mesesAnalizados + ' meses)\n' +
      '  🟢 Optimista: ' + fmt(escenarios.optimista) + '\n' +
      '  🟡 Base: ' + fmt(escenarios.base) + '\n' +
      '  🔴 Pesimista: ' + fmt(escenarios.pesimista) + '\n';
  }

  // Anomalías
  let anomLine = '';
  if (anomalias.length > 0) {
    anomLine = '\n⚠️ *Gastos inusuales*\n' +
      anomalias.map(function(a) { return '  • ' + a.comercio + ': ' + fmt(a.monto); }).join('\n') + '\n';
  }

  // Alerta balance negativo
  const alertaBalance = act.balance < 0 ? '\n🚨 *Alerta: egresos superan ingresos este mes*\n' : '';

  return (
    scoreEmoji + ' *Score: ' + score + '/100 — ' + MESES[mesAct] + ' ' + anioAct + '*\n\n' +
    '💚 Ingresos:  ' + fmt(act.ingresos) + '\n' +
    '🔴 Egresos:   ' + fmt(act.egresos) + '\n' +
    balEmoji + ' Balance:   ' + (act.balance < 0 ? '-' : '') + fmt(act.balance) + '\n' +
    ahorroEmoji + ' Tasa ahorro: ' + Number(act.tasaAhorro).toFixed(1) + '%\n' +
    '\n' + varLine +
    alertaBalance +
    '\n📂 *Top categorías*\n' + topLine + '\n' +
    '\n📊 *Proyección*\n' + proyLine + '\n' +
    escLine +
    anomLine +
    '\n🧠 *Análisis IA*\n' + analisis
  );
}

// ------------------------------------------------------------
// PRUEBA — ejecutar manualmente para verificar
// ------------------------------------------------------------
function probarAsesorFinanciero() {
  Logger.log('🔍 Ejecutando análisis financiero v2...');
  analizarFinanzas();
}

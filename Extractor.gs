// ============================================================
// FINANCEBOT AI - PROCESAMIENTO DE EXTRACTOS BANCARIOS
// Soporta ZIP (.zip con .xlsx) o XLSX directo enviado por Telegram.
// Flujo: descarga → unzip → Drive import → leer → Gemini → deduplicar → Sheets
// ============================================================

function procesarExtractoTelegram_(fileId, fileName) {
  var blob = descargarArchivoDeTelegram_(fileId, fileName);

  var xlsxBlob = fileName.toLowerCase().endsWith('.zip')
    ? extraerXlsxDeZip_(blob)
    : blob.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') || blob;

  // Leer filas limpias del extracto: [fecha, descripcion, valor]
  var resultado = leerMovimientosXlsx_(xlsxBlob);

  if (!resultado || resultado.filas.length === 0) {
    return '⚠️ No encontré movimientos en el extracto.\nVerifica que el archivo sea un extracto de Bancolombia con la sección "Movimientos".';
  }

  Logger.log('Movimientos a clasificar: ' + resultado.filas.length);

  // Clasificar con Gemini en chunks
  var transacciones = clasificarConGemini_(resultado.filas);

  if (!transacciones || transacciones.length === 0) {
    // Retornar info de diagnóstico para depurar
    var muestra5 = resultado.filas.slice(0, 3).join(' | ');
    return '⚠️ Gemini no clasificó (' + resultado.filas.length + ' filas leídas).\nMuestra: ' + muestra5;
  }

  // Deduplicar y escribir
  var dup      = deduplicarTransacciones_(transacciones);
  var nuevas   = dup.nuevas;
  var duplicadas = dup.duplicadas;

  if (nuevas.length > 0) {
    var ss       = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheetTxn = ss.getSheetByName('Transactions');
    nuevas.forEach(function(txn) {
      txn.fuente = 'extracto';
      txn.moneda = 'COP';
      txn.hora   = '';
      escribirTransaccion_(sheetTxn, txn);
    });
  }

  return construirMensajeExtracto_(nuevas, duplicadas);
}

// ------------------------------------------------------------
// LEER MOVIMIENTOS DEL XLSX — VÍA XML (sin locale de Google Sheets)
// El XLSX es un ZIP que contiene XML. Lo leemos directamente para
// obtener los números RAW sin ninguna interpretación de locale.
// Retorna { anio, filas: ["YYYY-MM-DD\tDESCRIPCION\tVALOR", ...] }
// ------------------------------------------------------------
function leerMovimientosXlsx_(xlsxBlob) {
  // XLSX = archivo ZIP con XML adentro
  xlsxBlob.setContentType('application/zip');
  var archivos = Utilities.unzip(xlsxBlob);

  var sheetXml = null, stringsXml = null;
  archivos.forEach(function(f) {
    var n = f.getName();
    if (/xl\/worksheets\/sheet\d+\.xml$/i.test(n) && !sheetXml) sheetXml   = f.getDataAsString('UTF-8');
    if (/xl\/sharedStrings\.xml$/i.test(n))                      stringsXml = f.getDataAsString('UTF-8');
  });

  if (!sheetXml) throw new Error('No encontré hoja en el XLSX. Verifica que sea un archivo .xlsx válido.');

  // Normalizar namespace: quitar prefijos tipo x: para simplificar parsing
  // <x:row> → <row>, </x:row> → </row>, etc.
  sheetXml = sheetXml.replace(/<(\/?)\w+:(\w)/g, '<$1$2');

  // --- Parsear shared strings (celdas de texto tipo t="s") ---
  var SS = [];
  if (stringsXml) {
    stringsXml = stringsXml.replace(/<(\/?)\w+:(\w)/g, '<$1$2');
    var siRe = /<si>([\s\S]*?)<\/si>/g, siM;
    while ((siM = siRe.exec(stringsXml)) !== null) {
      var partes = [], tRe = /<t[^>]*>([\s\S]*?)<\/t>/g, tM;
      while ((tM = tRe.exec(siM[1])) !== null) partes.push(tM[1]);
      SS.push(partes.join('')
        .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#(\d+);/g, function(_,n){return String.fromCharCode(parseInt(n));}));
    }
  }

  // Helper: índice de columna (0-based) → letra(s) A, B, ..., Z, AA...
  function idxToCol(i) {
    var s = '';
    i++;
    while (i > 0) { i--; s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26); }
    return s;
  }

  // --- Parsear filas del worksheet ---
  // Cada fila = objeto { colLetra: valor }
  var todasFilas = [];
  var rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g, rowM;
  while ((rowM = rowRe.exec(sheetXml)) !== null) {
    var fila = {};
    var cRe  = /<c\b([^>]*)>([\s\S]*?)<\/c>/g, cM;
    var colIdx = 0;
    while ((cM = cRe.exec(rowM[1])) !== null) {
      var attrs = cM[1];
      var inner = cM[2];
      // Columna: primero por atributo r="A1", luego por posición
      var rAttr = attrs.match(/\br="([A-Z]+)\d+"/);
      var col;
      if (rAttr) {
        col = rAttr[1];
        // Sincronizar colIdx con la columna real
        var idx = 0;
        for (var ci = 0; ci < col.length; ci++) idx = idx * 26 + col.charCodeAt(ci) - 64;
        colIdx = idx; // 1-based
      } else {
        col = idxToCol(colIdx);
        colIdx++;
      }
      var tipo   = (attrs.match(/\bt="([^"]+)"/) || [])[1] || 'n';
      var vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      var v = vMatch ? vMatch[1]
                         .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') : '';
      if      (tipo === 's')   fila[col] = SS[parseInt(v)] || '';
      else if (tipo === 'str') fila[col] = v;
      else                     fila[col] = v !== '' ? parseFloat(v) : '';
      if (!rAttr) colIdx = colIdx; // already incremented
    }
    todasFilas.push(fila);
  }

  // --- Detectar año (campo HASTA = año más reciente en las primeras 15 filas) ---
  var anio = new Date().getFullYear();
  todasFilas.slice(0, 15).forEach(function(fila) {
    Object.keys(fila).forEach(function(col) {
      var ym = String(fila[col]).match(/\b(20\d{2})\b/g);
      if (ym) ym.forEach(function(y) { if (parseInt(y) > anio) anio = parseInt(y); });
    });
  });

  // --- Extraer filas de movimiento ---
  var colDesc  = 'B';  // defaults
  var colValor = 'E';
  var activo   = false;
  var filas    = [];

  todasFilas.forEach(function(fila) {
    var allVals = Object.keys(fila).map(function(c) { return String(fila[c]); });

    // FIN ESTADO → parar
    if (allVals.some(function(v) { return v.indexOf('FIN ESTADO') >= 0; })) {
      activo = false;
      return;
    }

    // Header FECHA → mapear columnas dinámicamente
    var a = String(fila['A'] || '').trim().toUpperCase();
    if (a === 'FECHA') {
      Object.keys(fila).forEach(function(col) {
        var h = String(fila[col]).toUpperCase().trim()
                  .replace(/[ÁÉÍÓÚÜ]/g, function(c) {
                    return {Á:'A',É:'E',Í:'I',Ó:'O',Ú:'U',Ü:'U'}[c]||c; });
        if (h === 'VALOR')                                     colValor = col;
        if (h === 'DESCRIPCION' || h.indexOf('DESCRIP') === 0) colDesc  = col;
      });
      activo = true;
      return;
    }

    if (!activo) return;

    // Fecha en col A
    var fechaStr = normalizarFecha_(fila['A'], anio);
    if (!fechaStr) return;

    // Descripción
    var desc = String(fila[colDesc] || '').trim();
    if (!desc) return;

    // Valor: puede ser número o string "27.65" / "-40,000.00"
    var rawVal = fila[colValor];
    var val = (typeof rawVal === 'number')
      ? rawVal
      : parseFloat(String(rawVal).replace(/,/g, ''));
    if (isNaN(val) || val === 0) return;

    filas.push(fechaStr + '\t' + desc + '\t' + val);
  });

  Logger.log('XLSX: ' + filas.length + ' movimientos | año ' + anio);
  return { anio: anio, filas: filas };
}

// Convierte cualquier representación de fecha a "YYYY-MM-DD".
// Acepta: Date nativo, "D/MM", "DD/MM", "YYYY-MM-DD".
function normalizarFecha_(celda, anio) {
  if (celda instanceof Date) {
    var a = celda.getFullYear();
    if (a < 2015 || a > 2035) return '';
    // Si Sheets asignó el año actual pero difiere del extracto, corregir
    if (a === new Date().getFullYear() && a !== anio) a = anio;
    var mm = String(celda.getMonth() + 1).padStart(2, '0');
    var dd = String(celda.getDate()).padStart(2, '0');
    return a + '-' + mm + '-' + dd;
  }
  var s = String(celda).trim();
  // D/MM o DD/MM
  var m = s.match(/^(\d{1,2})\/(\d{2})$/);
  if (m) return anio + '-' + m[2] + '-' + m[1].padStart(2, '0');
  // YYYY-MM-DD ya formateado
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

// ------------------------------------------------------------
// DESCARGAR ARCHIVO DE TELEGRAM
// ------------------------------------------------------------
function descargarArchivoDeTelegram_(fileId, fileName) {
  var token = CONFIG.TELEGRAM_BOT_TOKEN;
  var info  = JSON.parse(UrlFetchApp.fetch(
    'https://api.telegram.org/bot' + token + '/getFile?file_id=' + fileId,
    { muteHttpExceptions: true }
  ).getContentText());

  if (!info.ok) throw new Error('No se pudo obtener info del archivo: ' + (info.description || ''));

  var resp = UrlFetchApp.fetch(
    'https://api.telegram.org/file/bot' + token + '/' + info.result.file_path,
    { muteHttpExceptions: true }
  );
  if (resp.getResponseCode() !== 200) throw new Error('No se pudo descargar el archivo');
  return resp.getBlob().setName(fileName);
}

// ------------------------------------------------------------
// EXTRAER XLSX DE ZIP
// ------------------------------------------------------------
function extraerXlsxDeZip_(zipBlob) {
  var archivos = Utilities.unzip(zipBlob);
  for (var i = 0; i < archivos.length; i++) {
    var n = archivos[i].getName().toLowerCase();
    if (n.endsWith('.xlsx') || n.endsWith('.xls')) {
      archivos[i].setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return archivos[i];
    }
  }
  throw new Error('No encontré un archivo .xlsx dentro del ZIP');
}

// ------------------------------------------------------------
// DIAGNÓSTICO — llama desde gas-run.js con el Drive file ID del XLSX
// Ejemplo: node gas-run.js run_diagnosticarExtracto '["1BxK...fileId"]'
// ------------------------------------------------------------
function diagnosticarExtracto(driveFileId) {
  var log = [];
  try {
    log.push('Descargando de Drive: ' + driveFileId);
    var blob = DriveApp.getFileById(driveFileId).getBlob();
    blob.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    log.push('Blob: ' + blob.getName() + ' (' + blob.getBytes().length + ' bytes)');

    var resultado = leerMovimientosXlsx_(blob);
    log.push('Año: ' + resultado.anio + ' | Movimientos: ' + resultado.filas.length);
    resultado.filas.slice(0, 5).forEach(function(f) { log.push('  ' + f); });

    if (resultado.filas.length === 0) return log.join('\n');

    var cfg = leerConfiguracion_();
    var txns = geminiClasificar_(resultado.filas.slice(0, 5), cfg.categorias.join(', '));
    log.push('Gemini OK: ' + txns.length + ' clasificadas');

    return log.join('\n');
  } catch(e) {
    log.push('EXCEPCION: ' + e.message);
    return log.join('\n');
  }
}

function run_diagnosticarExtracto(driveFileId) {
  var resultado = diagnosticarExtracto(driveFileId || '');
  Logger.log(resultado);
  return resultado;
}

// ------------------------------------------------------------
// CLASIFICAR TRANSACCIONES CON GEMINI
// Recibe filas "FECHA\tDESCRIPCION\tVALOR" (valor negativo=egreso)
// Retorna array de objetos txn en el formato de la app.
// ------------------------------------------------------------
function clasificarConGemini_(filas) {
  var cfg        = leerConfiguracion_();
  var categorias = cfg.categorias.join(', ');
  var CHUNK      = 70;
  var todas      = [];

  for (var i = 0; i < filas.length; i += CHUNK) {
    var chunk = filas.slice(i, i + CHUNK);
    var txns  = geminiClasificar_(chunk, categorias);
    todas     = todas.concat(txns);
    if (i + CHUNK < filas.length) Utilities.sleep(6000);
  }
  Logger.log('Transacciones clasificadas: ' + todas.length);
  return todas;
}

function geminiClasificar_(filas, categorias) {
  var tabla  = filas.join('\n');
  var prompt =
    'Clasifica estas transacciones bancarias colombianas.\n' +
    'Formato de entrada por línea: FECHA<tab>DESCRIPCION<tab>VALOR\n' +
    'VALOR negativo = egreso (gasto), positivo = ingreso.\n\n' +
    'CATEGORÍAS válidas: ' + categorias + '\n\n' +
    'Devuelve SOLO array JSON sin markdown:\n' +
    '[{"f":"YYYY-MM-DD","t":"egreso|ingreso","tt":"compra_td|transferencia_enviada|transferencia_recibida|otro",' +
    '"m":MONTO_POSITIVO,"c":"descripcion limpia","cat":"Categoria","sub":"Subcategoria"}]\n\n' +
    'DATOS:\n' + tabla;

  var resp = UrlFetchApp.fetch(CONFIG.GEMINI_URL + '?key=' + CONFIG.GEMINI_API_KEY, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' }
    }),
    muteHttpExceptions: true
  });

  var httpCode = resp.getResponseCode();
  var rawBody  = resp.getContentText();
  if (httpCode === 429) {
    // Rate limit → esperar 65s y reintentar una vez
    Logger.log('Gemini 429 — esperando 65s y reintentando...');
    Utilities.sleep(65000);
    resp    = UrlFetchApp.fetch(CONFIG.GEMINI_URL + '?key=' + CONFIG.GEMINI_API_KEY, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' }
      }),
      muteHttpExceptions: true
    });
    httpCode = resp.getResponseCode();
    rawBody  = resp.getContentText();
  }
  if (httpCode !== 200) {
    Logger.log('Gemini HTTP ' + httpCode + ': ' + rawBody.substring(0, 400));
    return [];
  }

  var json;
  try { json = JSON.parse(rawBody); } catch(e) {
    Logger.log('Gemini resp no es JSON: ' + rawBody.substring(0, 200));
    return [];
  }

  if (!json.candidates || !json.candidates[0] || !json.candidates[0].content) {
    Logger.log('Gemini sin candidates: ' + JSON.stringify(json).substring(0, 300));
    return [];
  }

  var text = json.candidates[0].content.parts.map(function(p) { return p.text || ''; }).join('');
  text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  Logger.log('Gemini resp (primeros 300): ' + text.substring(0, 300));

  var items;
  try { items = JSON.parse(text); } catch (e) {
    Logger.log('Parse error chunk: ' + e.message + ' | texto: ' + text.substring(0, 200));
    return [];
  }
  if (!Array.isArray(items)) return [];

  return items
    .filter(function(x) { return x.m && x.f; })
    .map(function(x) {
      return {
        fecha: String(x.f),
        tipo: x.t || 'egreso',
        tipo_transaccion: x.tt || 'otro',
        monto: Math.abs(Number(x.m)),
        comercio: x.c || '',
        categoria: x.cat || 'Otro',
        subcategoria: x.sub || '',
        referencia: '',
        necesidad: 'n/a',
        confianza: 0.8,
        banco: 'Bancolombia'
      };
    });
}

// ------------------------------------------------------------
// DEDUPLICAR: fecha exacta + monto exacto vs Transactions
// ------------------------------------------------------------
function deduplicarTransacciones_(transacciones) {
  var ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Transactions');

  if (!sheet || sheet.getLastRow() < 2) {
    return { nuevas: transacciones, duplicadas: [] };
  }

  var lastRow = sheet.getLastRow();
  var fechas  = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var montos  = sheet.getRange(2, 6, lastRow - 1, 1).getValues();

  var existentes = {};
  for (var i = 0; i < fechas.length; i++) {
    var f = fechas[i][0];
    var m = montos[i][0];
    if (!f || !m) continue;
    var fs = (f instanceof Date)
      ? Utilities.formatDate(f, 'America/Bogota', 'yyyy-MM-dd')
      : String(f).substring(0, 10);
    existentes[fs + '|' + Number(m)] = true;
  }

  var nuevas = [], duplicadas = [];
  transacciones.forEach(function(txn) {
    var key = String(txn.fecha).substring(0, 10) + '|' + Number(txn.monto);
    if (existentes[key]) {
      duplicadas.push(txn);
    } else {
      nuevas.push(txn);
      existentes[key] = true;
    }
  });
  return { nuevas: nuevas, duplicadas: duplicadas };
}

// ------------------------------------------------------------
// MENSAJE RESUMEN PARA TELEGRAM
// ------------------------------------------------------------
function construirMensajeExtracto_(nuevas, duplicadas) {
  var msg = '📊 *Extracto procesado*\n\n✅ *' + nuevas.length + ' transacciones importadas*\n';
  if (duplicadas.length === 0) {
    msg += '🔍 Sin duplicados.';
    return msg;
  }
  msg += '⚠️ *' + duplicadas.length + ' ya existían (no importadas):*\n';
  duplicadas.slice(0, 10).forEach(function(txn) {
    msg += '  • ' + txn.fecha + ' | $' + Number(txn.monto).toLocaleString('es-CO') + ' | ' + (txn.comercio || '').substring(0, 25) + '\n';
  });
  if (duplicadas.length > 10) msg += '  _...y ' + (duplicadas.length - 10) + ' más_\n';
  msg += '\n_Revisa las duplicadas si alguna es nueva._';
  return msg;
}

// ============================================================
// FINANCEBOT AI - PARSER REGEX PARA EMAILS BANCOLOMBIA/NEQUI
// Reemplaza Gemini en carga histórica. Sin consumo de cuota.
// Retorna objeto txn compatible con escribirTransaccion_()
// o null si el formato no es reconocido.
// ============================================================

function parsearEmailBancolombia_(texto) {
  if (!texto) return null;
  var t     = texto;
  var lower = t.toLowerCase();

  // Transacciones fallidas — no afectan saldo, ignorar
  if (lower.indexOf('no fue exitosa') !== -1 ||
      lower.indexOf('no se afecto')   !== -1 ||
      lower.indexOf('no se afectó')   !== -1) return null;

  // Facturas pendientes (informativo puro, sin movimiento real)
  if (/factura\s+inscrita|se\s+vence\s+el\s+\d/i.test(t) &&
      !/pago\s+exitoso|pago\s+factura\s+programada/i.test(t)) return null;

  // ── Helpers ────────────────────────────────────────────────

  function parseMonto(str) {
    // COP 1.234.567,00  |  $1.234.567  |  $448,000  |  1.234.567
    var m = str.match(/([\d]{1,3}(?:[\.,]\d{3})*(?:[\.,]\d{1,2})?)/);
    if (!m) return null;
    var raw = m[1];
    var s;
    // Si termina en separador + 1-2 dígitos → decimal (ej: "329.900,00")
    // Si termina en separador + 3 dígitos → miles (ej: "$448,000", "85.000")
    var decMatch = raw.match(/^([\d.,]+)[,.](\d{1,2})$/);
    if (decMatch) {
      s = decMatch[1].replace(/[.,]/g, '') + '.' + decMatch[2];
    } else {
      s = raw.replace(/[.,]/g, '');
    }
    var n = parseFloat(s);
    return (!isNaN(n) && n > 0) ? Math.round(n) : null;
  }

  function parseFechaStr(str) {
    var m = str.match(/(\d{1,2})\/(\d{2})\/(\d{4})/);
    if (m) return m[3] + '-' + m[2].padStart(2,'0') + '-' + m[1].padStart(2,'0');
    m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    return null;
  }

  function parseHoraStr(str) {
    var m = str.match(/\b(\d{1,2}):(\d{2})\b/);
    return m ? m[1].padStart(2,'0') + ':' + m[2] : null;
  }

  function parseCuenta(str) {
    var m = str.match(/\*(\d{4})/);
    return m ? m[1] : null;
  }

  function categorizar(nombre) {
    if (!nombre) return { cat: 'Otro', sub: null, necesidad: 'n/a' };
    var c = nombre.toUpperCase();
    var reglas = [
      [/\bD1\b|ARA\b|EXITO\b|JUMBO\b|CARULLA|OLIMPICA|SURTIMAX|MERQUE|LA14|COORATIENDA/,   'Alimentación',   'Supermercados',   'necesario'],
      [/RAPPI|IFOOD|DOMICILIOS|UBER\s*EATS/,                                                'Alimentación',   'Domicilios',      'prescindible'],
      [/RESTAURANTE|HAMBURGUESA|PIZZA|SUSHI|FRISBY|MC.*DONALD|KFC|SUBWAY|DOMINOS|CREPES/,   'Alimentación',   'Restaurantes',    'prescindible'],
      [/SMART\s*FIT|BODYTECH|GYM|GIMNASIO|FITNESS/,                                         'Salud',          'Gimnasio',        'necesario'],
      [/FARMACIA|DROGUERIA|DROGUER|FARMATODO|CRUZ\s*VERDE|MEDICAMENT/,                      'Salud',          'Medicamentos',    'necesario'],
      [/EPS|COLSANITAS|COMPENSAR|NUEVA\s*EPS|SANITAS|COOMEVA/,                              'Salud',          'EPS',             'necesario'],
      [/HOMECENTER|EASY\b|FERRETERIA|CORONA\b/,                                             'Hogar',          'Ferretería',      'n/a'],
      [/TERPEL|PRIMAX|TEXACO|MOBIL|CHEVRON|GASOLINA/,                                       'Transporte',     'Gasolina',        'necesario'],
      [/NETFLIX|SPOTIFY|DISNEY|HBO|AMAZON\s*PRIME|APPLE|YOUTUBE\s*PREMIUM/,                 'Entretenimiento','Streaming',       'prescindible'],
      [/CINE|CINEPOLIS|CINEMARK/,                                                            'Entretenimiento',null,              'prescindible'],
      [/AGUAS\s*DE|ACUEDUCTO|EPM\b|EMCALI|EAAB/,                                           'Vivienda',       'Servicios públicos','necesario'],
      [/EFIGAS|GAS\s*NATURAL|VANTI|GASES\s*DE|CENTRAL\s*HIDRO|HIDROELEC/,                  'Vivienda',       'Servicios públicos','necesario'],
      [/PROTECCION\s*SA|PORVENIR|COLPENSIONES/,                                             'Salario',        null,              'necesario'],
      [/CIA\s*SURAMERICANA|SURA\b|BOLIVAR\b|SEGUROS/,                                      'Financiero',     'Seguros',         'necesario'],
      [/PAGO\s*TC|TARJETA.*CREDITO/,                                                        'Financiero',     'Pago Tarjeta',    'necesario'],
      [/TRANSFERENCIA|NEQUI|DAVIPLATA/,                                                     'Transferencia',  null,              'n/a'],
    ];
    for (var i = 0; i < reglas.length; i++) {
      if (reglas[i][0].test(c)) return { cat: reglas[i][1], sub: reglas[i][2], necesidad: reglas[i][3] };
    }
    return { cat: 'Otro', sub: null, necesidad: 'n/a' };
  }

  function base(tipo, tt, monto, comercio, fecha, hora, cuenta) {
    var cat = categorizar(comercio);
    return {
      fecha:            fecha,
      hora:             hora || '',
      tipo:             tipo,
      tipo_transaccion: tt,
      monto:            monto,
      moneda:           'COP',
      comercio:         comercio || '',
      cuenta:           cuenta   || '',
      categoria:        cat.cat,
      subcategoria:     cat.sub  || '',
      necesidad:        cat.necesidad,
      sugerencia:       null,
      referencia:       '',
      confianza:        0.9,
    };
  }

  var m;

  // ── 1. COMPRA TC / TD ─────────────────────────────────────
  // "Compraste COP50.000,00 en TIENDA D1 con tu T.Cred *8352, el 22/03/2026 a las 14:30"
  m = t.match(/compraste\s+(?:cop\s*)?([\d.,]+)\s+en\s+(.+?)\s+con\s+tu\s+t\.(cred|deb)[^*]*\*(\d{4})[^,\n]*,?\s*el\s+(\d{1,2}\/\d{2}\/\d{4})\s+a\s+las?\s+(\d{1,2}:\d{2})/i);
  if (m) return base('egreso', m[3].toLowerCase()==='cred'?'compra_tc':'compra_td',
    parseMonto(m[1]), m[2].trim(), parseFechaStr(m[5]), m[6], m[4]);

  // ── 2. RETIRO CAJERO ──────────────────────────────────────
  // "Retiro por COP700.000 en MANIZ_PZA5, el 15/02/2026"
  m = t.match(/retiro\s+(?:de\s+|por\s+)?(?:cop\s*)?([\d.,]+)\s+en\s+([^,\n]+?)(?:[,\s]+el\s+(\d{1,2}\/\d{2}\/\d{4}))?/i);
  if (m) {
    var r = base('egreso','retiro_cajero', parseMonto(m[1]), m[2].trim(),
      m[3] ? parseFechaStr(m[3]) : parseFechaStr(t), parseHoraStr(t), parseCuenta(t));
    r.categoria = 'Otro'; r.subcategoria = 'Retiro efectivo';
    return r;
  }

  // ── 3. TRANSFERENCIA ENVIADA ──────────────────────────────
  // "Transferiste $85.000 desde tu cuenta *8191 a la cuenta *XXXX el DD/MM/YYYY"
  m = t.match(/transferiste\s+(?:\$|cop\s*)?([\d.,]+)[^.]*(?:a\s+la\s+cuenta\s+\*(\d+)|a\s+([\w\s]+?))\s+el\s+(\d{1,2}\/\d{2}\/\d{4})/i);
  if (m) {
    var dest = m[3] ? m[3].trim() : 'Transferencia Bancolombia';
    var r2 = base('egreso','transferencia_enviada', parseMonto(m[1]), dest,
      parseFechaStr(m[4]), parseHoraStr(t), parseCuenta(t));
    if (m[2]) r2.referencia = m[2];
    r2.categoria = 'Transferencia'; r2.subcategoria = '';
    return r2;
  }

  // ── 4. NEQUI ENVIASTE (Bre-B) ────────────────────────────
  // "Enviaste de manera exitosa 25.000 a la llave 3154567890 de SEBASTIAN NARVAEZ el DD/MM/YYYY"
  m = t.match(/enviaste\s+(?:de\s+manera\s+exitosa\s+)?(?:\$|cop\s*)?([\d.,]+)\s+a\s+la\s+llave\s+(\d+)\s+de\s+(.+?)\s+el\s+(\d{1,2}\/\d{2}\/\d{4})/i);
  if (m) {
    var r3 = base('egreso','transferencia_enviada', parseMonto(m[1]), m[3].trim(),
      parseFechaStr(m[4]), parseHoraStr(t), null);
    r3.referencia = m[2]; r3.categoria = 'Transferencia'; r3.subcategoria = '';
    return r3;
  }

  // ── 5a. RECIBISTE UN PAGO DE [tipo] DE [emisor] ──────────
  // "Recibiste un pago de Nomina de PUNTOS COLOMBIA por $3,518,827.00 en tu cuenta de Ahorros el 12/12/2025"
  // "Recibiste un pago de Dividendos de X por $..."
  m = t.match(/recibiste\s+un\s+pago\s+de\s+(\w+)\s+de\s+(.+?)\s+por\s+(?:\$|cop\s*)?([\d.,]+)[^.]*el\s+(\d{1,2}\/\d{2}\/\d{4})/i);
  if (m) {
    var tipoPago5a = m[1].trim();
    var emisor5a   = m[2].trim();
    var r5a = base('ingreso','transferencia_recibida', parseMonto(m[3]), emisor5a,
      parseFechaStr(m[4]), parseHoraStr(t), parseCuenta(t));
    if (/nomina|salario|sueldo/i.test(tipoPago5a) || /PROTECCION|PORVENIR|COLPENSIONES/i.test(emisor5a)) {
      r5a.categoria = 'Salario'; r5a.tipo_transaccion = 'otro';
    } else {
      r5a.categoria = 'Transferencia';
    }
    r5a.subcategoria = '';
    return r5a;
  }

  // ── 5b. RECIBISTE / INGRESO ───────────────────────────────
  // "Recibiste COP8.703.714 en tu cuenta *8191 de PROTECCION SA el DD/MM/YYYY"
  // Nequi: "Recibiste 25.000 de NOMBRE el DD/MM/YYYY a las HH:MM"
  m = t.match(/recibiste\s+(?:cop\s*)?([\d.,]+)[^.]*de\s+([\w\s]+?)(?:\s+el\s+(\d{1,2}\/\d{2}\/\d{4}))?/i);
  if (m) {
    var remitente = m[2].trim().replace(/\s*\*?\d{4}\s*$/, '');
    var fecha6 = m[3] ? parseFechaStr(m[3]) : parseFechaStr(t);
    var r4 = base('ingreso','transferencia_recibida', parseMonto(m[1]), remitente,
      fecha6, parseHoraStr(t), parseCuenta(t));
    if (/PROTECCION|PORVENIR|COLPENSIONES/i.test(remitente)) {
      r4.categoria = 'Salario'; r4.tipo_transaccion = 'otro';
    } else {
      r4.categoria = 'Transferencia';
    }
    r4.subcategoria = '';
    return r4;
  }

  // ── 6. PAGO SERVICIO PSE / FACTURA PROGRAMADA ─────────────
  // "pago exitoso de AGUAS DE MANIZA por COP47.395"
  // "Bancolombia informa pago Factura Programada EFIGAS... por $4.043 desde cuenta *8191"
  m = t.match(/pago\s+(?:exitoso\s+de|factura\s+programada)\s+([^$\n]+?)\s+(?:ref\s+\S+\s+)?por\s+(?:\$|cop\s*)?([\d.,]+)/i);
  if (m) {
    var serv = m[1].trim();
    var cat7 = categorizar(serv);
    var r5 = base('egreso','pago_servicio', parseMonto(m[2]), serv,
      parseFechaStr(t), parseHoraStr(t), parseCuenta(t));
    r5.categoria    = cat7.cat !== 'Otro' ? cat7.cat : 'Servicios';
    r5.subcategoria = cat7.sub || 'Servicios públicos';
    r5.necesidad    = 'necesario';
    return r5;
  }

  // ── 7. PAGO TARJETA DE CRÉDITO ───────────────────────────
  // "pago Tarjeta de Crédito *8352 por $940.450"
  m = t.match(/pago\s+(?:de\s+(?:tu\s+)?)?tarjeta\s+de\s+cr[eé]dito[^$\n]*(?:\$|cop\s*)?([\d.,]+)/i);
  if (!m) m = t.match(/pago\s+tc\s+\*\d{4}[^$\n]*(?:\$|cop\s*)?([\d.,]+)/i);
  if (m) {
    var cuenta7 = parseCuenta(t);
    var r6 = base('egreso','pago_tc', parseMonto(m[1]), 'Pago TC' + (cuenta7 ? ' *'+cuenta7 : ''),
      parseFechaStr(t), parseHoraStr(t), cuenta7);
    r6.categoria = 'Financiero'; r6.subcategoria = 'Pago Tarjeta'; r6.necesidad = 'necesario';
    return r6;
  }

  // ── 8. PAGASTE (formato corto) ────────────────────────────
  // "Bancolombia: pagaste COP47.395 a AGUAS DE MANIZA"
  m = t.match(/pagaste\s+(?:cop\s*)?([\d.,]+)\s+(?:a|en)\s+([^\n,]+)/i);
  if (m) {
    var r7 = base('egreso','pago_servicio', parseMonto(m[1]), m[2].trim(),
      parseFechaStr(t), parseHoraStr(t), parseCuenta(t));
    r7.necesidad = 'necesario';
    return r7;
  }

  return null; // Formato no reconocido
}

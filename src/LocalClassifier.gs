// ============================================================
// FINANCEBOT-IA — CLASIFICADOR LOCAL (FALLBACK)
// Reglas regex sobre la descripción del comercio. Sin llamadas a Gemini.
// Uso recomendado:
//   1. Intenta cache (Cache.gs)
//   2. Si miss, intenta clasificarLocal_()
//   3. Si miss, llama a Gemini (con retry/backoff)
// Si una regla matchea con confianza alta, evita la llamada a la API.
// ============================================================

// Cada regla = [regex, categoria, subcategoria, necesidad]
// Categorías deben coincidir con CATEGORIAS_DEFECTO_ en Sheets.gs
var REGLAS_LOCALES_ = [
  // ── Alimentación ────────────────────────────────────────────
  [/\bD1\b|\bARA\b|\bEXITO\b|\bJUMBO\b|CARULLA|OLIMPICA|SURTIMAX|MERQUE|LA\s*14|COORATIENDA|MERCALDAS|MERCAMAS|JUSTO\s*Y\s*BUENO|COLSUBSIDIO|MAKRO/i,
   'Alimentación', 'Supermercados', 'necesario'],
  [/RAPPI|IFOOD|UBER\s*EATS|DIDI\s*FOOD|MERCADO\s*PAGO|DOMICIL/i,
   'Alimentación', 'Domicilios', 'prescindible'],
  [/RESTAURANTE|HAMBURGUES|PIZZA|SUSHI|FRISBY|MC.*DONALD|KFC|SUBWAY|DOMINOS|CREPES|JENO|PRESTO|EL\s*CORRAL|JUAN\s*VALDEZ|STARBUCKS|TOSTAO|OMA|PANADER|REPOSTER/i,
   'Alimentación', 'Restaurantes', 'prescindible'],
  [/AVICOLA|SURTIPOLLO|FRUTERIA|FRUVER|CARNICER/i,
   'Alimentación', 'Tiendas', 'necesario'],

  // ── Salud / Gimnasio ────────────────────────────────────────
  [/SMART\s*FIT|BODYTECH|GYM|GIMNASIO|FITNESS|CROSSFIT|SPINNING|CLUB\s*ATLETIC/i,
   'Salud', 'Gimnasio', 'necesario'],
  [/FARMACIA|DROGUER|FARMATODO|CRUZ\s*VERDE|MEDICAMENT|COPIDROG|AHUMADA/i,
   'Salud', 'Medicamentos', 'necesario'],
  [/EPS|COLSANITAS|COMPENSAR|NUEVA\s*EPS|SANITAS|COOMEVA|FAMISANAR|SAVIA\s*SALUD/i,
   'Salud', 'EPS', 'necesario'],

  // ── Vivienda / Servicios públicos ───────────────────────────
  [/AGUAS\s*DE|ACUEDUCTO|EPM\b|EMCALI|EAAB|EMTELSA|CHEC\b|EEPP/i,
   'Vivienda', 'Servicios públicos', 'necesario'],
  [/EFIGAS|GAS\s*NATURAL|VANTI|GASES\s*DE|CENTRAL\s*HIDRO|HIDROELEC|CODENSA|ENEL|AIR-E/i,
   'Vivienda', 'Servicios públicos', 'necesario'],
  [/CONJUNTO\s*CERRADO|ADMINISTRACION|ARRIENDO|CUOTA\s*ADMIN/i,
   'Vivienda', 'Arriendo', 'necesario'],

  // ── Hogar / Ferretería ──────────────────────────────────────
  [/HOMECENTER|EASY\b|FERRETER|CORONA\b|FALABELLA|JUMBO\s*HOME/i,
   'Hogar', 'Ferretería', 'n/a'],

  // ── Transporte ──────────────────────────────────────────────
  [/TERPEL|PRIMAX|TEXACO|MOBIL|CHEVRON|GASOLINA|ESTACION|EDS\b/i,
   'Transporte', 'Gasolina', 'necesario'],
  [/UBER\b|CABIFY|DIDI\b|INDRIVE|TAXI|BEAT/i,
   'Transporte', 'Apps', 'prescindible'],
  [/PEAJE|CONCESI/i,
   'Transporte', 'Peajes', 'necesario'],
  [/TRANSMILEN|METRO\s*LINEA|TULLAVE|CIVICA/i,
   'Transporte', 'Público', 'necesario'],

  // ── Entretenimiento ─────────────────────────────────────────
  [/NETFLIX|SPOTIFY|DISNEY|HBO|AMAZON\s*PRIME|APPLE\.COM|YOUTUBE\s*PREMIUM|PARAMOUNT|STARZ|DEEZER/i,
   'Entretenimiento', 'Streaming', 'prescindible'],
  [/CINEPOLIS|CINEMARK|CINECOLOMBIA|ROYAL\s*FILMS/i,
   'Entretenimiento', 'Cine', 'prescindible'],
  [/STEAM|PLAYSTATION|XBOX|NINTENDO|EPIC\s*GAMES/i,
   'Entretenimiento', 'Videojuegos', 'prescindible'],

  // ── Servicios / Telco ───────────────────────────────────────
  [/CLARO|MOVISTAR|TIGO|WOM|ETB|UNE\b/i,
   'Servicios', 'Telefonía', 'necesario'],

  // ── Financiero ──────────────────────────────────────────────
  [/PROTECCION\s*SA|PORVENIR|COLPENSIONES/i,
   'Salario', 'Pensión', 'necesario'],
  [/SURA\b|SURAMERICANA|BOLIVAR\b|SEGUROS|MAPFRE|AXA/i,
   'Financiero', 'Seguros', 'necesario'],
  [/PAGO\s*TC|PAGO\s*TARJETA|TARJETA\s*DE\s*CREDITO|LEASING|CREDITO\s*ROTATIV/i,
   'Financiero', 'Pago Tarjeta', 'necesario'],
  [/DAVIVIENDA|BBVA|SCOTIA|COLPATRIA|BCSC|BANCAMIA/i,
   'Financiero', 'Banca', 'n/a'],

  // ── Transferencias ──────────────────────────────────────────
  [/TRANSFERENCIA|NEQUI|DAVIPLATA|DALE\b|MOVII|PAGADITO/i,
   'Transferencia', '', 'n/a'],

  // ── Ropa y Personal ─────────────────────────────────────────
  [/H\s*&\s*M|ZARA|FOREVER\s*21|MANGO|BERSHKA|PULL\s*&\s*BEAR|TOTTO|ARTURO\s*CALLE|OFFCORSS|PERMODA|VELEZ|BOSI/i,
   'Ropa y Personal', 'Ropa', 'prescindible'],
  [/BARBER|PELUQUER|SPA\b|ESTETICA|MANICUR|UNGLAS/i,
   'Ropa y Personal', 'Personal', 'prescindible'],

  // ── Educación ───────────────────────────────────────────────
  [/UNIVERSIDAD|COLEGIO|EDUCATIV|PLATZI|UDEMY|COURSERA|EDUCACION/i,
   'Educación', '', 'necesario'],
];

// Devuelve { categoria, subcategoria, necesidad, confianza } o null si ninguna regla aplica.
function clasificarLocal_(descripcion) {
  if (!descripcion) return null;
  var d = String(descripcion).toUpperCase();
  for (var i = 0; i < REGLAS_LOCALES_.length; i++) {
    var r = REGLAS_LOCALES_[i];
    if (r[0].test(d)) {
      return { categoria: r[1], subcategoria: r[2], necesidad: r[3], confianza: 0.85 };
    }
  }
  return null;
}

// Test rápido — corre con: node scripts/gas-run.js run_probarClasificadorLocal
function run_probarClasificadorLocal() {
  var casos = [
    'MERCALDAS PROVICENTR', 'CONJUNTO CERRADO PAI', 'MANIZALES',
    'MERCADOPAGO COLOMBIA', 'FRANQUIHER MALL PLAZ', 'SMART FIT',
    'TERPEL', 'NETFLIX', 'AGUAS DE MANIZALES', 'EFIGAS'
  ];
  var resultado = casos.map(function(c) {
    return { input: c, clasificado: clasificarLocal_(c) };
  });
  return resultado;
}

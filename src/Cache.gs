// ============================================================
// FINANCEBOT-IA — CACHE DE CLASIFICACIONES
// Guarda descripciones ya clasificadas para no volver a llamar a Gemini.
// Storage: ScriptProperties (key: "CLASIF_CACHE")
// TTL: 30 días, evict por LRU si pasa de MAX_CACHE_ENTRIES.
// API:
//   getCachedClasificacion_(descripcion) → { categoria, subcategoria, necesidad } | null
//   setCachedClasificacion_(descripcion, txn)
//   limpiarCacheClasificacion()  // mantenimiento manual
//   estadisticasCacheClasificacion()
// ============================================================

var CACHE_KEY_         = 'CLASIF_CACHE';
var CACHE_TTL_DIAS_    = 30;
var MAX_CACHE_ENTRIES_ = 500;

function _cacheKeyDescripcion_(desc) {
  if (!desc) return '';
  // Normaliza: lowercase, sin acentos, sin números (los códigos varían), sin caracteres extra
  return String(desc)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\d+/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _leerCacheClasif_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(CACHE_KEY_);
    return raw ? JSON.parse(raw) : {};
  } catch(e) { return {}; }
}

function _guardarCacheClasif_(cache) {
  try {
    PropertiesService.getScriptProperties().setProperty(CACHE_KEY_, JSON.stringify(cache));
  } catch(e) {
    logWarn_('CACHE', 'no se pudo guardar cache: ' + _safeErrMsg_(e));
  }
}

function getCachedClasificacion_(descripcion) {
  var key = _cacheKeyDescripcion_(descripcion);
  if (!key) return null;
  var cache = _leerCacheClasif_();
  var entry = cache[key];
  if (!entry) return null;
  // TTL
  var ageDias = (Date.now() - entry.t) / (1000 * 60 * 60 * 24);
  if (ageDias > CACHE_TTL_DIAS_) {
    delete cache[key];
    _guardarCacheClasif_(cache);
    return null;
  }
  return { categoria: entry.c, subcategoria: entry.s || '', necesidad: entry.n || 'n/a' };
}

function setCachedClasificacion_(descripcion, txn) {
  var key = _cacheKeyDescripcion_(descripcion);
  if (!key || !txn || !txn.categoria) return;
  // No cachear "Otro" — queremos seguir intentando clasificarlo
  if (String(txn.categoria).toLowerCase() === 'otro') return;
  var cache = _leerCacheClasif_();
  cache[key] = {
    c: txn.categoria,
    s: txn.subcategoria || '',
    n: txn.necesidad    || 'n/a',
    t: Date.now()
  };
  // LRU si superamos el límite
  var keys = Object.keys(cache);
  if (keys.length > MAX_CACHE_ENTRIES_) {
    keys.sort(function(a, b) { return cache[a].t - cache[b].t; });
    var sobrantes = keys.length - MAX_CACHE_ENTRIES_;
    for (var i = 0; i < sobrantes; i++) delete cache[keys[i]];
  }
  _guardarCacheClasif_(cache);
}

function limpiarCacheClasificacion() {
  PropertiesService.getScriptProperties().deleteProperty(CACHE_KEY_);
  logInfo_('CACHE', 'cache de clasificaciones eliminada');
}

function estadisticasCacheClasificacion() {
  var cache = _leerCacheClasif_();
  var keys = Object.keys(cache);
  var ahora = Date.now();
  var vivos = 0, expirados = 0;
  var porCategoria = {};
  keys.forEach(function(k) {
    var ageDias = (ahora - cache[k].t) / (1000 * 60 * 60 * 24);
    if (ageDias > CACHE_TTL_DIAS_) expirados++;
    else {
      vivos++;
      porCategoria[cache[k].c] = (porCategoria[cache[k].c] || 0) + 1;
    }
  });
  return { total: keys.length, vivos: vivos, expirados: expirados, porCategoria: porCategoria };
}

function run_estadisticasCacheClasificacion() { return estadisticasCacheClasificacion(); }
function run_limpiarCacheClasificacion()       { limpiarCacheClasificacion(); }

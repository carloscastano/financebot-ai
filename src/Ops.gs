// ============================================================
// FINANCEBOT AI - UTILIDADES OPERATIVAS
// Logs, errores y hardening de texto para mensajes Markdown.
// ============================================================

function _safeErrMsg_(e) {
  if (!e) return 'error desconocido';
  if (typeof e === 'string') return e;
  return e.message || String(e);
}

function _log_(nivel, scope, msg) {
  Logger.log('[' + nivel + '][' + scope + '] ' + msg);
}

function logInfo_(scope, msg) { _log_('INFO', scope, msg); }
function logWarn_(scope, msg) { _log_('WARN', scope, msg); }
function logError_(scope, msg, e) {
  var extra = e ? ' | ' + _safeErrMsg_(e) : '';
  _log_('ERROR', scope, msg + extra);
}

const HEADERS = {
  TRANSACTIONS: {
    DATE: 'Fecha',
    TYPE: 'Tipo',
    AMOUNT: 'Monto',
    CATEGORY: 'Categoria',
    SUBCATEGORY: 'Subcategoria',
  },
  PENDING_PAYMENTS: {
    LAST_PAYMENT: 'Ultimo Pago',
  }
};

function _normText_(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function _headerIndex_(headers, candidates) {
  var list = Array.isArray(candidates) ? candidates : [candidates];
  for (var i = 0; i < headers.length; i++) {
    var h = _normText_(headers[i]);
    for (var j = 0; j < list.length; j++) {
      if (h === _normText_(list[j])) return i;
    }
  }
  return -1;
}

// Escapa caracteres especiales para parse_mode=Markdown.
function mdEscape_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

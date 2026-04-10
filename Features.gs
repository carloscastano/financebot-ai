// ============================================================
// FINANCEBOT AI - FEATURE FLAGS
// Activa o desactiva funcionalidades desde Telegram.
//
// Comandos:
//   /config              → ver estado de todas las funcionalidades
//   /activar <feature>   → activar una funcionalidad
//   /desactivar <feature>→ desactivar una funcionalidad
//
// Los flags se guardan en ScriptProperties (persisten entre ejecuciones).
// Por defecto todas las funcionalidades están ACTIVAS.
// ============================================================

// Catálogo de funcionalidades — nombre interno, etiqueta, descripción
var FEATURES_CATALOGO_ = [
  {
    id:          'reporte_semanal',
    nombre:      'Reporte Semanal',
    descripcion: 'Mensaje automático cada lunes con el pulso de la semana'
  },
  {
    id:          'reporte_mensual',
    nombre:      'Reporte Mensual',
    descripcion: 'Análisis financiero mensual con proyección y score'
  },
  {
    id:          'alerta_presupuesto',
    nombre:      'Alerta Presupuesto',
    descripcion: 'Aviso en tiempo real al 80% / 100% del presupuesto por categoría'
  },
  {
    id:          'revision_dia25',
    nombre:      'Revisión día 25',
    descripcion: 'Revisión consolidada de presupuestos a fin de mes'
  },
  {
    id:          'recordatorio_pagos',
    nombre:      'Recordatorio Pagos',
    descripcion: 'Aviso de facturas y pagos próximos a vencer'
  },
  {
    id:          'recordatorio_metas',
    nombre:      'Recordatorio Metas',
    descripcion: 'Revisión mensual de metas de ahorro con análisis de viabilidad'
  },
  {
    id:          'alerta_gasto_alto',
    nombre:      'Alerta Gasto Alto',
    descripcion: 'Aviso cuando un gasto supera el umbral configurado'
  },
];

// ------------------------------------------------------------
// VERIFICAR SI UNA FUNCIONALIDAD ESTÁ ACTIVA
// Default: true (activa). Se desactiva solo si fue explícitamente desactivada.
// ------------------------------------------------------------
function isFeatureEnabled_(featureId) {
  var val = PropertiesService.getScriptProperties().getProperty('FEATURE_' + featureId);
  return val !== 'off'; // null o 'on' → activa
}

// ------------------------------------------------------------
// CAMBIAR ESTADO DE UNA FUNCIONALIDAD
// ------------------------------------------------------------
function setFeature_(featureId, enabled) {
  PropertiesService.getScriptProperties().setProperty('FEATURE_' + featureId, enabled ? 'on' : 'off');
}

// ------------------------------------------------------------
// CONSTRUIR MENSAJE /config
// ------------------------------------------------------------
function construirMensajeConfig_() {
  var lineas = FEATURES_CATALOGO_.map(function(f) {
    var activa = isFeatureEnabled_(f.id);
    var icono  = activa ? '✅' : '⏸️';
    return icono + ' *' + f.nombre + '*\n   _' + f.descripcion + '_';
  });

  return (
    '⚙️ *Funcionalidades FinanceBot*\n\n' +
    lineas.join('\n\n') +
    '\n\n' +
    '`/activar <nombre>` · `/desactivar <nombre>`\n' +
    '_Ejemplo: `/desactivar Reporte Semanal`_'
  );
}

// ------------------------------------------------------------
// PROCESAR COMANDOS /activar y /desactivar
// ------------------------------------------------------------
function procesarComandoConfig_(texto) {
  var partes  = texto.trim().split(/\s+/);
  var comando = partes[0].toLowerCase(); // '/activar' o '/desactivar'
  var busq    = partes.slice(1).join(' ').toLowerCase().trim();

  if (!busq) return construirMensajeConfig_();

  // Buscar feature por id o nombre (parcial, case-insensitive)
  var match = null;
  for (var i = 0; i < FEATURES_CATALOGO_.length; i++) {
    var f = FEATURES_CATALOGO_[i];
    if (f.id.indexOf(busq) >= 0 || f.nombre.toLowerCase().indexOf(busq) >= 0) {
      match = f;
      break;
    }
  }

  if (!match) {
    return (
      '❓ No encontré esa funcionalidad.\n\n' +
      'Nombres válidos:\n' +
      FEATURES_CATALOGO_.map(function(f) { return '• ' + f.nombre; }).join('\n') +
      '\n\nEjemplo: `/desactivar Reporte Semanal`'
    );
  }

  var activar = (comando === '/activar');
  setFeature_(match.id, activar);

  var icono  = activar ? '✅' : '⏸️';
  var accion = activar ? 'activada' : 'desactivada';
  return icono + ' *' + match.nombre + '* ' + accion + '.\n_' + match.descripcion + '_';
}

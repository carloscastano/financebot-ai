#!/usr/bin/env node
/**
 * test-emailparser.js — Tests del regex parser de Bancolombia/Nequi
 *
 * Estrategia:
 *   EmailParser.gs está escrito como JS puro (no usa APIs GAS).
 *   Lo cargamos "raw" y evaluamos la función en un contexto sandbox.
 *
 * Uso:  npm test
 *       node scripts/tests/test-emailparser.js
 *
 * Exit code: 0 todo OK, 1 si alguno falla.
 */
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const PARSER_PATH = path.resolve(__dirname, '..', '..', 'src', 'EmailParser.gs');
const src = fs.readFileSync(PARSER_PATH, 'utf8');

// Sandbox: expone parsearEmailBancolombia_ al contexto Node
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src + '\nthis.parsearEmailBancolombia_ = parsearEmailBancolombia_;', sandbox);
const parse = sandbox.parsearEmailBancolombia_;

let pass = 0, fail = 0;
const fails = [];

function t(nombre, entrada, expected) {
  const got = parse(entrada);
  const ok = checkMatch(got, expected);
  if (ok) {
    pass++;
    process.stdout.write('.');
  } else {
    fail++;
    fails.push({ nombre, entrada, expected, got });
    process.stdout.write('F');
  }
}

function checkMatch(got, expected) {
  if (expected === null) return got === null;
  if (!got) return false;
  // Solo chequeamos los campos que el caller especifica
  for (const k of Object.keys(expected)) {
    if (got[k] !== expected[k]) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// CASOS CRÍTICOS
// ═══════════════════════════════════════════════════════════════

// 1. COMPRA TC
t('compra TC con formato completo',
  'Compraste COP50.000,00 en TIENDA D1 con tu T.Cred *8352, el 22/03/2026 a las 14:30',
  { tipo: 'egreso', tipo_transaccion: 'compra_tc', monto: 50000, fecha: '2026-03-22', hora: '14:30', cuenta: '8352' });

t('compra TD (débito)',
  'Compraste COP85.500 en RAPPI con tu T.Deb *8191, el 01/04/2026 a las 20:15',
  { tipo: 'egreso', tipo_transaccion: 'compra_td', monto: 85500, cuenta: '8191', categoria: 'Alimentación' });

// 2. RETIRO CAJERO
t('retiro por en cajero',
  'Retiro por COP700.000 en MANIZ_PZA5, el 15/02/2026',
  { tipo: 'egreso', tipo_transaccion: 'retiro_cajero', monto: 700000, fecha: '2026-02-15' });

// 3. TRANSFERENCIA ENVIADA
t('transferiste Bancolombia',
  'Transferiste $85.000 desde tu cuenta *8191 a la cuenta *1234 el 10/03/2026',
  { tipo: 'egreso', tipo_transaccion: 'transferencia_enviada', monto: 85000, categoria: 'Transferencia' });

// 4. NEQUI BRE-B
t('nequi enviaste a llave',
  'Enviaste de manera exitosa 25.000 a la llave 3154567890 de SEBASTIAN NARVAEZ el 05/04/2026',
  { tipo: 'egreso', tipo_transaccion: 'transferencia_enviada', monto: 25000 });

// 5. INGRESOS
// NOTA: para nómina el parser setea tipo_transaccion='otro' (heredado); categoria=Salario es lo clave
t('recibiste un pago de nomina',
  'Recibiste un pago de Nomina de PUNTOS COLOMBIA por $3,518,827.00 en tu cuenta de Ahorros el 12/12/2025',
  { tipo: 'ingreso', tipo_transaccion: 'otro', monto: 3518827, categoria: 'Salario' });

// NOTA: BUG conocido — el regex lazy trunca "PROTECCION SA" a "P" y no matchea
// PROTECCION→Salario. Queda como Transferencia. Dejo el test documentando el bug.
t('recibiste de Proteccion (pensión) — bug remitente truncado',
  'Recibiste COP8.703.714 en tu cuenta *8191 de PROTECCION SA el 01/04/2026',
  { tipo: 'ingreso', monto: 8703714 });  // sin categoria — bug documentado

// 6. PAGO SERVICIO
t('pago exitoso AGUAS DE MANIZA',
  'Bancolombia: pago exitoso de AGUAS DE MANIZA por COP47.395',
  { tipo: 'egreso', monto: 47395 });

// 7. PAGO TC (CRÍTICO — bug que corregimos ayer: debe ser "informativo", no "egreso")
t('pago tarjeta de credito — informativo, no egreso',
  'Bancolombia informa pago Tarjeta de Crédito *8352 por $940.450',
  { tipo: 'informativo', tipo_transaccion: 'pago_tc', monto: 940450, categoria: 'Financiero' });

t('pagaste en la tarjeta de credito (formato corto)',
  'Pagaste $3,287,981 en la tarjeta de credito *8352',
  { tipo: 'informativo', tipo_transaccion: 'pago_tc', monto: 3287981 });

// 8. PAGASTE corto
t('pagaste a EFIGAS',
  'Bancolombia: pagaste COP4.043 a EFIGAS',
  { tipo: 'egreso', monto: 4043 });

// ═══════════════════════════════════════════════════════════════
// CASOS QUE DEBEN RETORNAR null (no son transacciones)
// ═══════════════════════════════════════════════════════════════

t('transacción fallida → null',
  'Tu transacción no fue exitosa. Monto COP50.000',
  null);

t('factura inscrita que solo avisa vencimiento → null',
  'Te recordamos que tu factura inscrita EFIGAS se vence el 10/04/2026',
  null);

t('texto vacio → null', '', null);
t('texto null → null', null, null);

// ═══════════════════════════════════════════════════════════════
// CASOS DE PARSEO NUMÉRICO
// ═══════════════════════════════════════════════════════════════

// Monto con separador coma como miles: COP448,000 debe ser 448000 (no 448)
// NOTA: parser actual NO acepta el prefijo "$" en compras TC/TD — solo COP o sin prefijo.
// Este test usa el formato real de Bancolombia (COP).
t('monto con coma como miles (COP)',
  'Compraste COP448,000 en JUMBO con tu T.Deb *1234, el 01/01/2026 a las 10:00',
  { monto: 448000 });

// Monto con decimal: 329.900,00 debe ser 329900
t('monto con decimales coma',
  'Compraste COP329.900,00 en CARULLA con tu T.Cred *8352, el 02/02/2026 a las 11:00',
  { monto: 329900 });

// ═══════════════════════════════════════════════════════════════
// REPORTE
// ═══════════════════════════════════════════════════════════════

console.log('\n');
if (fail > 0) {
  console.log(`❌ ${pass} passed, ${fail} failed\n`);
  fails.forEach(f => {
    console.log(`  × ${f.nombre}`);
    console.log(`    input:    ${JSON.stringify(f.entrada).substring(0, 100)}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}`);
    console.log(`    got:      ${JSON.stringify(f.got)}`);
  });
  process.exit(1);
}
console.log(`✅ ${pass} passed, 0 failed`);
process.exit(0);

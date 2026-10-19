// Convierte las filas de un balance de prueba (Excel o CSV ya leído como matriz) en una
// lista de cuentas auxiliares con su saldo en la naturaleza de la cuenta (débito para
// activos, costos y gastos; crédito para pasivos, patrimonio e ingresos), positivo cuando la
// cuenta tiene su saldo normal.

import { PLANES_DE_CUENTAS } from './config.js';

export const sinTildes = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export function aNumero(valor) {
  if (typeof valor === 'number') return valor;
  let s = String(valor ?? '').trim();
  if (!s) return 0;
  const negativo = /^\(.*\)$/.test(s) || s.startsWith('-') || s.endsWith('-');
  s = s.replace(/[()$\s-]/g, '');
  // Formato colombiano 1.234.567,89 frente a 1,234,567.89
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (negativo ? -n : n) : 0;
}

function buscarEncabezado(filas) {
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const celdas = filas[i].map(sinTildes);
    const codigo = celdas.findIndex((c) => /^(codigo|cuenta|cod\.?|codigo cuenta|cuenta contable)$/.test(c));
    if (codigo === -1) continue;
    const nombre = celdas.findIndex((c, j) => j !== codigo && /(nombre|descripcion|detalle)/.test(c));
    const saldo = celdas.findIndex((c) => /(saldo final|nuevo saldo|saldo actual|saldo a)/.test(c));
    const saldoSimple = celdas.findIndex((c) => c === 'saldo');
    const debito = celdas.findIndex((c) => /^(debito|debitos|saldo debito)$/.test(c));
    const credito = celdas.findIndex((c) => /^(credito|creditos|saldo credito)$/.test(c));
    return { fila: i, codigo, nombre, saldo: saldo !== -1 ? saldo : saldoSimple, debito, credito };
  }
  throw new Error('No encontré la fila de encabezados (se espera una columna "Código" o "Cuenta").');
}

export function leerBalanceDePrueba(filas, plan = PLANES_DE_CUENTAS['4i5c6g']) {
  const enc = buscarEncabezado(filas);
  const crudas = [];
  for (const fila of filas.slice(enc.fila + 1)) {
    const codigo = String(fila[enc.codigo] ?? '').replace(/\D/g, '');
    if (!codigo) continue;
    let saldo;
    if (enc.saldo !== -1) saldo = aNumero(fila[enc.saldo]);
    else if (enc.debito !== -1 && enc.credito !== -1) saldo = aNumero(fila[enc.debito]) - aNumero(fila[enc.credito]);
    else throw new Error('No encontré columna de saldo final ni columnas débito/crédito.');
    crudas.push({ codigo, nombre: String(fila[enc.nombre] ?? '').trim(), saldo });
  }
  return normalizarNaturaleza(soloAuxiliares(crudas), plan);
}

// Un balance de prueba trae niveles (clase, grupo, cuenta, subcuenta, auxiliar).
// Para no sumar dos veces, se usan solo las cuentas que no tienen hijas en el archivo.
export function soloAuxiliares(cuentas) {
  const codigos = cuentas.map((c) => c.codigo);
  return cuentas.filter((c) => !codigos.some((otro) => otro.length > c.codigo.length && otro.startsWith(c.codigo)));
}

// Algunos programas exportan saldos con signo (crédito negativo) y otros en la naturaleza
// de la cuenta. Se detecta mirando los ingresos: si suman negativo, vienen con signo.
export function normalizarNaturaleza(cuentas, plan) {
  const credito = new Set([plan.pasivo, plan.patrimonio, plan.ingresos]);
  const ingresos = cuentas.filter((c) => c.codigo.startsWith(plan.ingresos)).reduce((s, c) => s + c.saldo, 0);
  const conSigno = ingresos < 0;
  return cuentas.map((c) => ({
    ...c,
    valor: conSigno && credito.has(c.codigo[0]) ? -c.saldo : c.saldo,
  }));
}

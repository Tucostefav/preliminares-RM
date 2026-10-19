// Convierte las filas de un balance de prueba (Excel o CSV ya leído como matriz) en una
// lista de cuentas con su saldo en la naturaleza de la cuenta (débito para activos, costos
// y gastos; crédito para pasivos, patrimonio e ingresos), positivo cuando la cuenta tiene su
// saldo normal. Acepta exportaciones de QuickBooks (código y nombre en la misma columna,
// pares Débito/Crédito para saldo sin ajustar, ajustes y saldo ajustado).

import { PLANES_DE_CUENTAS, grupoDe, GRUPO_POR_NOMBRE } from './config.js';

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
  s = s.replace(/[()$\sB/-]/g, '');
  // 1.234.567,89 frente a 1,234,567.89
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (negativo ? -n : n) : 0;
}

const ES_DEBITO = /^(debito|debitos|saldo debito|debe)$/;
const ES_CREDITO = /^(credito|creditos|saldo credito|haber)$/;

// Busca la fila de títulos. Si los títulos Débito/Crédito están en la fila siguiente
// (como en QuickBooks), se usa el último par, que es el saldo ajustado.
function buscarEncabezado(filas) {
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const celdas = filas[i].map(sinTildes);
    const codigo = celdas.findIndex((c) => /^(codigo|cuenta|cod\.?|codigo cuenta|cuenta contable|no\.? cuenta)$/.test(c));
    const nombre = celdas.findIndex((c, j) => j !== codigo && /(nombre|descripcion|detalle)/.test(c));
    if (codigo === -1 && nombre === -1) continue;

    const saldo = celdas.findIndex((c) => /(saldo final|nuevo saldo|saldo actual|saldo ajustado|saldo a )/.test(c) && !ES_DEBITO.test(c));
    const saldoSimple = celdas.findIndex((c) => c === 'saldo');
    let filaDatos = i + 1;
    let debitos = celdas.flatMap((c, j) => (ES_DEBITO.test(c) ? [j] : []));
    let creditos = celdas.flatMap((c, j) => (ES_CREDITO.test(c) ? [j] : []));
    if (!debitos.length && filas[i + 1]) {
      const siguiente = filas[i + 1].map(sinTildes);
      debitos = siguiente.flatMap((c, j) => (ES_DEBITO.test(c) ? [j] : []));
      creditos = siguiente.flatMap((c, j) => (ES_CREDITO.test(c) ? [j] : []));
      if (debitos.length) filaDatos = i + 2;
    }
    const tieneSaldo = saldo !== -1 || saldoSimple !== -1;
    if (!tieneSaldo && !(debitos.length && creditos.length)) continue;
    return {
      filaDatos,
      codigo,
      nombre: nombre === -1 ? codigo : nombre,
      saldo: debitos.length && creditos.length ? -1 : saldo !== -1 ? saldo : saldoSimple,
      debito: debitos.at(-1) ?? -1,
      credito: creditos.at(-1) ?? -1,
    };
  }
  throw new Error('No encontré la fila de títulos del balance de prueba (cuenta, nombre y saldo o débito/crédito).');
}

// Separa "1000 Banco General" en código y nombre. Las cuentas sin código (por ejemplo
// "Sales" o "Retained Earnings" en QuickBooks) se ubican en su grupo por el nombre.
function separarCodigo(texto) {
  const m = String(texto ?? '').trim().match(/^(\d+(?:[.\-]\d+)*)\s+(.+)$/);
  return m ? { codigo: m[1], nombre: m[2].trim() } : { codigo: '', nombre: String(texto ?? '').trim() };
}

function grupoPorNombre(nombre) {
  const n = sinTildes(nombre);
  return GRUPO_POR_NOMBRE.find((r) => r.patron.test(n))?.grupo || null;
}

export function leerBalanceDePrueba(filas, plan = PLANES_DE_CUENTAS.estandar) {
  const enc = buscarEncabezado(filas);
  const crudas = [];
  let sinCodigo = 0;
  for (const fila of filas.slice(enc.filaDatos)) {
    const textoNombre = String(fila[enc.nombre] ?? '').trim();
    let { codigo, nombre } = enc.codigo !== -1 && enc.codigo !== enc.nombre
      ? { codigo: String(fila[enc.codigo] ?? '').trim(), nombre: textoNombre }
      : separarCodigo(textoNombre);
    if (!codigo && !nombre) continue;
    if (/^total/i.test(sinTildes(nombre)) || (!nombre && !codigo)) continue;

    let saldo;
    if (enc.saldo !== -1) saldo = aNumero(fila[enc.saldo]);
    else saldo = aNumero(fila[enc.debito]) - aNumero(fila[enc.credito]);

    if (!codigo) {
      if (!saldo) continue;
      const grupo = grupoPorNombre(nombre);
      if (!grupo) throw new Error(`No sé a qué grupo pertenece la cuenta sin código "${nombre}".`);
      // Código sintético: empieza con el dígito del grupo y no es prefijo de ninguna cuenta real.
      codigo = `${plan[grupo][0]}X${++sinCodigo}`;
    }
    if (!/^\d/.test(codigo)) continue;
    crudas.push({ codigo, nombre, saldo });
  }
  if (!crudas.length) throw new Error('El balance de prueba no tiene cuentas con saldo.');
  return normalizarNaturaleza(sinNivelesAgrupados(crudas), plan);
}

// Algunos balances traen niveles (clase, grupo, cuenta, subcuenta) además de los auxiliares.
// Una cuenta con subcuentas se descarta solo si su saldo es la suma de ellas; si no, es una
// cuenta propia (como 2001 y 2001.1 en QuickBooks) y se conserva.
export function sinNivelesAgrupados(cuentas) {
  const esHija = (hija, padre) => hija.codigo !== padre.codigo && hija.codigo.startsWith(padre.codigo);
  return cuentas.filter((c) => {
    const hijas = cuentas.filter((o) => esHija(o, c) && !cuentas.some((m) => esHija(m, o)));
    if (!hijas.length) return true;
    const suma = hijas.reduce((s, h) => s + h.saldo, 0);
    return Math.abs(suma - c.saldo) > 0.01;
  });
}

// Algunos programas exportan saldos con signo (crédito negativo) y otros en la naturaleza
// de la cuenta. Se detecta mirando los ingresos: si suman negativo, vienen con signo.
export function normalizarNaturaleza(cuentas, plan) {
  const credito = new Set(['pasivo', 'patrimonio', 'ingresos']);
  const ingresos = cuentas.filter((c) => grupoDe(plan, c.codigo) === 'ingresos').reduce((s, c) => s + c.saldo, 0);
  const conSigno = ingresos < 0;
  return cuentas.map((c) => ({
    ...c,
    valor: conSigno && credito.has(grupoDe(plan, c.codigo)) ? -c.saldo : c.saldo,
  }));
}

// Busca en un libro (varias hojas) la del balance de prueba: la primera que se pueda leer,
// prefiriendo las que dicen "balance de prueba", "comprobación" o "trial balance" en el título.
export function buscarHojaBalance(hojas, plan) {
  const titulo = (filas) => filas.slice(0, 5).flat().map(sinTildes).join(' ');
  const orden = [...hojas].sort(
    (a, b) => Number(/(prueba|comprobacion|trial balance)/.test(titulo(b.filas))) - Number(/(prueba|comprobacion|trial balance)/.test(titulo(a.filas))),
  );
  const errores = [];
  for (const hoja of orden) {
    try {
      return { nombre: hoja.nombre, cuentas: leerBalanceDePrueba(hoja.filas, plan) };
    } catch (err) {
      errores.push(`${hoja.nombre}: ${err.message}`);
    }
  }
  throw new Error(`No encontré un balance de prueba en el archivo. ${errores.join(' ')}`);
}

// Totales que trae el balance general y el estado de resultados, para cuadrar contra el
// balance de prueba. Toma la etiqueta de la fila y el último número de la misma fila.
const TOTALES = [
  { clave: 'totalActivos', patron: /^total (para |de )?(los )?activos$/ },
  { clave: 'utilidadContable', patron: /^(ganancias? netas?|utilidad neta|perdida neta|net income|resultado del (periodo|ejercicio)|utilidad \(perdida\) neta)$/ },
];

export function leerTotalesReportados(hojas, excluir) {
  const totales = {};
  for (const hoja of hojas) {
    if (hoja.nombre === excluir) continue;
    for (const fila of hoja.filas) {
      const etiqueta = sinTildes(fila.find((c) => typeof c === 'string' && c.trim()) || '');
      const regla = TOTALES.find((t) => t.patron.test(etiqueta));
      if (!regla || totales[regla.clave]) continue;
      const numeros = fila.filter((c) => typeof c === 'number' || (/\d/.test(String(c)) && !/[a-z]/i.test(String(c))));
      if (numeros.length) totales[regla.clave] = { valor: aNumero(numeros.at(-1)), hoja: hoja.nombre };
    }
  }
  return totales;
}

// Proyección de los meses que faltan para cerrar el año a partir del acumulado al corte.
// Las cuentas de resultado (ingresos, costos y gastos) se extienden con el promedio mensual
// del acumulado, ajustado por un crecimiento opcional. Las cuentas de balance se mantienen
// como están al corte.

import { liquidar } from './motor.js';
import { PLANES_DE_CUENTAS } from './config.js';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function extenderCuentas(cuentas, plan, mesesCorte, mesesExtra, crecimiento = 0) {
  const resultado = new Set([plan.ingresos, plan.costos, plan.gastos].filter(Boolean));
  return cuentas.map((c) => {
    if (!resultado.has(c.codigo[0])) return c;
    const promedio = c.valor / mesesCorte;
    return { ...c, valor: c.valor + promedio * (1 + crecimiento) * mesesExtra };
  });
}

/**
 * Devuelve la liquidación al corte y la de cada mes siguiente hasta `mesesAProyectar`.
 * @param {number} mesCorte  último mes incluido en los archivos (9 = septiembre)
 * @param {number} crecimiento  variación mensual esperada frente al promedio (0.05 = +5 %)
 */
export function proyectar(cuentas, anterior, ajustes, { mesCorte = 9, mesesAProyectar = 3, crecimiento = 0, plan = PLANES_DE_CUENTAS['4i5c6g'] } = {}) {
  const escenarios = [{ mes: MESES[mesCorte - 1], tipo: 'real', resultado: liquidar(cuentas, anterior, ajustes, { mes: mesCorte, plan }) }];
  for (let i = 1; i <= mesesAProyectar && mesCorte + i <= 12; i++) {
    const extendidas = extenderCuentas(cuentas, plan, mesCorte, i, crecimiento);
    // Las retenciones que se ingresan a mano se proyectan en la misma proporción.
    const ajustesMes = { ...ajustes, retenciones: (ajustes.retenciones || 0) * (mesCorte + i) / mesCorte };
    escenarios.push({
      mes: MESES[mesCorte - 1 + i],
      tipo: 'proyectado',
      resultado: liquidar(extendidas, anterior, ajustesMes, { mes: mesCorte + i, plan }),
    });
  }
  return escenarios;
}

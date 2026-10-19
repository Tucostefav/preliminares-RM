// Liquidación preliminar del impuesto sobre la renta de una persona jurídica en Panamá
// (declaración jurada de rentas ante la DGI) a partir del balance de prueba al corte y de
// los datos de la declaración del año anterior.

import {
  PARAMETROS_2026, PLANES_DE_CUENTAS, grupoDe, REGLAS_ACTIVO, REGLAS_INGRESO, REGLAS_GASTO, REGLAS_NO_DEDUCIBLES,
} from './config.js';
import { sinTildes } from './lector.js';

export const redondear = (v) => Math.round(v * 100) / 100;

const primeraRegla = (reglas, nombre) => reglas.find((r) => r.patron.test(nombre));

export function clasificarCuentas(cuentas, plan = PLANES_DE_CUENTAS.estandar) {
  const conceptos = {};
  const detalle = {};
  const noDeducibles = [];
  const sumar = (concepto, c, valor) => {
    conceptos[concepto] = (conceptos[concepto] || 0) + valor;
    (detalle[concepto] ||= []).push({ codigo: c.codigo, nombre: c.nombre, valor });
  };

  for (const c of cuentas) {
    const nombre = sinTildes(c.nombre);
    const grupo = grupoDe(plan, c.codigo);
    if (grupo === 'activo') {
      sumar(primeraRegla(REGLAS_ACTIVO, nombre)?.concepto || 'otrosActivos', c, c.valor);
    } else if (grupo === 'pasivo') {
      sumar('pasivos', c, c.valor);
    } else if (grupo === 'patrimonio') {
      sumar('patrimonioContable', c, c.valor);
    } else if (grupo === 'ingresos') {
      const concepto = primeraRegla(REGLAS_INGRESO, nombre)?.concepto || 'ingresosOperacion';
      sumar(concepto, c, concepto === 'devoluciones' ? Math.abs(c.valor) : c.valor);
    } else if (grupo === 'costos' || grupo === 'gastos') {
      let concepto = grupo === 'costos' || /costo/.test(nombre) ? 'costos' : 'gastosGenerales';
      if (concepto === 'gastosGenerales') concepto = primeraRegla(REGLAS_GASTO, nombre)?.concepto || concepto;
      let valor = c.valor;
      const regla = primeraRegla(REGLAS_NO_DEDUCIBLES, nombre);
      if (regla) {
        const monto = valor * regla.proporcion;
        noDeducibles.push({ codigo: c.codigo, nombre: c.nombre, regla: regla.nombre, monto });
        conceptos.noDeducibles = (conceptos.noDeducibles || 0) + monto;
        valor -= monto;
      }
      sumar(concepto, c, valor);
    }
  }
  return { conceptos, detalle, noDeducibles };
}

/**
 * @param {Array<{codigo:string,nombre:string,valor:number}>} cuentas  auxiliares normalizadas
 * @param {object} anterior  datos de la declaración del año pasado
 *   impuestoEstimado (estimado declarado para este año), estimadoPagado (si se conoce el valor exacto),
 *   saldoAFavor, arrastrePerdidas (cuotas del 20 % disponibles este año), noAplicarCAIR, tarifa
 * @param {object} ajustes  ingresosExentos, interesesExentos, costosGastosExentos, otrosNoDeducibles, retenciones,
 *   sinAvisoOperacion (la sociedad no ejerce actividad comercial, p. ej. arrienda bienes propios)
 * @param {object} opciones  mes (1-12) al que corresponde la liquidación, plan de cuentas
 */
export function liquidar(cuentas, anterior = {}, ajustes = {}, { mes = 12, plan, p = PARAMETROS_2026 } = {}) {
  const { conceptos: k, noDeducibles, detalle } = clasificarCuentas(cuentas, plan);
  const v = (x) => k[x] || 0;
  const a = (x) => ajustes[x] || 0;

  // Patrimonio
  const activos = {
    efectivo: v('efectivo'), inversiones: v('inversiones'), cuentasPorCobrar: v('cuentasPorCobrar'),
    impuestoEstimadoPagado: v('impuestoEstimadoPagado'), inventarios: v('inventarios'),
    propiedadesPlantaEquipo: v('propiedadesPlantaEquipo'), intangibles: v('intangibles'), otrosActivos: v('otrosActivos'),
  };
  const totalActivos = Object.values(activos).reduce((s, x) => s + x, 0);
  const pasivos = v('pasivos');
  const patrimonioNeto = totalActivos - pasivos;

  // Ingresos
  // Las cuentas de ingresos exentos o no gravables forman parte de los ingresos brutos y se restan abajo.
  const ingresosNoGravables = v('ingresosNoGravables');
  const ingresosOperacion = v('ingresosOperacion') + ingresosNoGravables;
  const ingresosFinancieros = v('ingresosFinancieros');
  const otrosIngresos = v('otrosIngresos');
  const ingresosBrutos = ingresosOperacion + ingresosFinancieros + otrosIngresos;
  const devoluciones = v('devoluciones');
  // Exentos, no gravables y de fuente extranjera. Los intereses de depósitos en bancos locales
  // son exentos (art. 708 C.F.), así que se excluyen por defecto.
  const ingresosExentos = a('ingresosExentos') + ingresosNoGravables + (ajustes.interesesExentos ? ingresosFinancieros : 0);
  const ingresosGravables = Math.max(0, ingresosBrutos - devoluciones - ingresosExentos);

  // Costos y gastos deducibles (sin los no deducibles detectados por nombre)
  const costos = v('costos');
  const gastosGenerales = Math.max(0, v('gastosGenerales') - a('otrosNoDeducibles'));
  const depreciacion = v('depreciacion');
  const gastosFinancieros = v('gastosFinancieros');
  const costosGastosExentos = a('costosGastosExentos'); // atribuibles a ingresos exentos o extranjeros
  const totalDeducibles = Math.max(0, costos + gastosGenerales + depreciacion + gastosFinancieros - costosGastosExentos);
  const totalNoDeducibles = (k.noDeducibles || 0) + Math.min(a('otrosNoDeducibles'), v('gastosGenerales')) + costosGastosExentos;
  const utilidadContable = ingresosBrutos - devoluciones - (costos + v('gastosGenerales') + depreciacion + gastosFinancieros + (k.noDeducibles || 0));

  // Renta
  const rentaNeta = ingresosGravables - totalDeducibles;
  const rentaNetaGravable = Math.max(0, rentaNeta);
  const perdida = Math.max(0, -rentaNeta);
  const arrastrePerdidas = Math.min(anterior.arrastrePerdidas || 0, rentaNetaGravable * p.arrastreTopeRenta);
  const rentaGravableNormal = rentaNetaGravable - arrastrePerdidas;
  const aplicaCAIR = ingresosGravables > p.cairUmbral && !anterior.noAplicarCAIR;
  const rentaGravableCAIR = aplicaCAIR ? ingresosGravables * p.cairPorcentajeIngresos : 0;
  const metodo = rentaGravableCAIR > rentaGravableNormal ? 'CAIR' : 'normal';
  const rentaGravable = Math.max(rentaGravableNormal, rentaGravableCAIR);

  // Impuesto y créditos
  const tarifa = anterior.tarifa ?? p.tarifaPersonaJuridica; // la de la declaración anterior si se leyó
  const impuestoCausado = rentaGravable * tarifa;
  const partidasVencidas = p.mesesPartidasEstimado.filter((m) => m <= mes).length;
  const estimadoPagado =
    anterior.estimadoPagado ??
    (anterior.impuestoEstimado != null
      ? (anterior.impuestoEstimado / p.mesesPartidasEstimado.length) * partidasVencidas
      : activos.impuestoEstimadoPagado);
  const retenciones = a('retenciones');
  const saldoAFavorAnterior = anterior.saldoAFavor || 0;
  const neto = impuestoCausado - estimadoPagado - retenciones - saldoAFavorAnterior;

  // El estimado del año siguiente no puede ser menor que el impuesto de la renta declarada.
  const impuestoEstimadoSiguiente = impuestoCausado;

  // Otros tributos que se preparan con la misma información
  const utilidadDespuesImpuesto = Math.max(0, rentaNetaGravable - arrastrePerdidas - impuestoCausado);
  const impuestoComplementario = utilidadDespuesImpuesto * p.baseComplementario * p.tarifaComplementario;
  // Las sociedades sin actividad comercial (p. ej. las que arriendan bienes propios) no tienen aviso de
  // operación y no pagan ese impuesto.
  const obligadoAviso = !ajustes.sinAvisoOperacion;
  const avisoOperacion = obligadoAviso
    ? Math.min(p.avisoOperacion.maximo, Math.max(p.avisoOperacion.minimo, Math.max(0, patrimonioNeto) * p.avisoOperacion.tarifa))
    : 0;

  const r = redondear;
  const todo = (o) => Object.fromEntries(Object.entries(o).map(([key, val]) => [key, r(val)]));
  return {
    patrimonio: todo({ ...activos, totalActivos, pasivos, patrimonioNeto }),
    ingresos: todo({ ingresosOperacion, ingresosFinancieros, otrosIngresos, ingresosBrutos, devoluciones, ingresosExentos, ingresosGravables }),
    costosGastos: todo({ costos, gastosGenerales, depreciacion, gastosFinancieros, costosGastosExentos, totalDeducibles, totalNoDeducibles, utilidadContable }),
    renta: {
      ...todo({ rentaNetaGravable, perdida, arrastrePerdidas, rentaGravableNormal, rentaGravableCAIR, rentaGravable }),
      aplicaCAIR, metodo,
    },
    liquidacion: {
      ...todo({
        impuestoCausado, estimadoPagado, retenciones, saldoAFavorAnterior,
        saldoAPagar: Math.max(0, neto), saldoAFavor: Math.max(0, -neto),
        impuestoEstimadoSiguiente, partidaEstimadoSiguiente: impuestoEstimadoSiguiente / p.mesesPartidasEstimado.length,
      }),
      partidasVencidas,
      tasaEfectiva: ingresosGravables - totalDeducibles > 0 ? impuestoCausado / (ingresosGravables - totalDeducibles) : null,
    },
    otros: { ...todo({ impuestoComplementario, avisoOperacion }), obligadoAviso },
    noDeducibles,
    detalle,
  };
}

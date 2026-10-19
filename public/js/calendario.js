// Calendario de pagos que le quedan al cliente según las fechas del Código Fiscal de Panamá,
// y análisis de si le aplica el cálculo alterno (CAIR).
//
// Fechas para personas jurídicas con período fiscal de año calendario:
// - Impuesto estimado: tres partidas, 30 de junio, 30 de septiembre y 31 de diciembre (art. 710).
// - Declaración jurada, saldo del ISR e impuesto de aviso de operación: 31 de marzo del año siguiente.
// - Impuesto complementario: 30 de junio del año siguiente.
// - Tasa única (B/. 300): 15 de enero o 15 de julio, según el semestre en que se inscribió la sociedad.

import { PARAMETROS_2026 } from './config.js';

const b = (x) => `B/. ${x.toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (anio, mes, dia) => new Date(Date.UTC(anio, mes - 1, dia));
const partir = (total, n) => {
  const base = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base));
};

/**
 * @param {object} cierre  liquidación proyectada al 31 de diciembre (resultado de liquidar)
 * @param {object} contexto  anio, mesCorte, anterior (impuestoEstimado, partidas), tasaUnica
 */
export function calendarioDePagos(cierre, { anio, mesCorte, anterior = {}, tasaUnica = 300, p = PARAMETROS_2026 }) {
  const pagos = [];
  const corte = fecha(anio, mesCorte + 1, 0); // último día del mes de corte

  // Partidas del estimado del año en curso, declaradas en la renta del año anterior.
  const estimadoActual = anterior.impuestoEstimado || 0;
  const partidasActuales = anterior.partidas?.length === 3 && anterior.partidas.some(Boolean)
    ? anterior.partidas
    : partir(estimadoActual, 3);
  p.mesesPartidasEstimado.forEach((mes, i) => {
    const f = fecha(anio, mes, mes === 12 ? 31 : 30);
    pagos.push({
      fecha: f, concepto: `${i + 1}.ª partida del impuesto estimado ${anio}`, monto: partidasActuales[i],
      estado: f <= corte ? 'vencida' : 'pendiente',
      nota: f <= corte ? 'Ya debió pagarse; revisar que esté en la cuenta de renta estimada.' : 'Monto fijado en la declaración del año anterior.',
    });
  });

  const l = cierre.liquidacion;
  const siguiente = anio + 1;
  pagos.push({
    fecha: fecha(siguiente, 3, 31), concepto: `Saldo del impuesto sobre la renta ${anio}`, monto: l.saldoAPagar, estado: 'proyectado',
    nota: l.saldoAFavor
      ? `Proyecta ${b(l.saldoAFavor)} a favor, que se abona al estimado de ${siguiente}.`
      : 'Impuesto causado menos las tres partidas del estimado.',
  });
  if (cierre.otros.obligadoAviso !== false) {
    pagos.push({
      fecha: fecha(siguiente, 3, 31), concepto: `Impuesto de aviso de operación (patrimonio ${anio})`, monto: cierre.otros.avisoOperacion, estado: 'proyectado',
      nota: '2 % del patrimonio al cierre. No admite prórroga.',
    });
  }
  pagos.push({
    fecha: fecha(siguiente, 6, 30), concepto: `Impuesto complementario ${anio}`, monto: cierre.otros.impuestoComplementario, estado: 'proyectado',
    nota: 'Se acredita contra el impuesto de dividendos cuando la sociedad los reparta.',
  });

  // Estimado del año siguiente: el impuesto causado proyectado, menos el saldo a favor que se le abona.
  const estimadoSiguiente = Math.max(0, l.impuestoEstimadoSiguiente - l.saldoAFavor);
  partir(estimadoSiguiente, 3).forEach((monto, i) => {
    const mes = p.mesesPartidasEstimado[i];
    pagos.push({
      fecha: fecha(siguiente, mes, mes === 12 ? 31 : 30), concepto: `${i + 1}.ª partida del impuesto estimado ${siguiente}`, monto, estado: 'proyectado',
      nota: i === 0 && l.saldoAFavor ? `Estimado de ${b(l.impuestoEstimadoSiguiente)} menos ${b(l.saldoAFavor)} de saldo a favor.` : '',
    });
  });

  if (tasaUnica) {
    pagos.push({
      fecha: null, concepto: `Tasa única ${siguiente}`, monto: tasaUnica, estado: 'anual',
      nota: '15 de enero si el pacto social se inscribió de julio a diciembre; 15 de julio si fue de enero a junio.',
    });
  }

  const hasta = fecha(siguiente, 3, 31);
  const pendientes = pagos.filter((x) => x.estado !== 'vencida' && x.fecha && x.fecha <= hasta);
  return {
    pagos,
    totalHastaDeclaracion: Math.round(pendientes.reduce((s, x) => s + x.monto, 0) * 100) / 100,
    proximo: pagos.find((x) => x.estado !== 'vencida' && x.fecha && x.monto > 0) || null,
  };
}

// ¿Le aplica el CAIR? Aplica cuando los ingresos gravables superan B/. 1.500.000, y solo cambia el
// impuesto si el 4,67 % de los ingresos es mayor que la renta normal, es decir, si el margen fiscal
// (renta neta gravable entre ingresos gravables) es menor que 4,67 %.
export function analizarCAIR(cierre, p = PARAMETROS_2026, tarifa = p.tarifaPersonaJuridica) {
  const ingresos = cierre.ingresos.ingresosGravables;
  const renta = cierre.renta.rentaGravableNormal;
  const margen = ingresos > 0 ? renta / ingresos : 0;
  const supera = ingresos > p.cairUmbral;
  const margenBajo = margen < p.cairPorcentajeIngresos;
  const impuestoNormal = renta * tarifa;
  const impuestoCAIR = ingresos * p.cairPorcentajeIngresos * tarifa;
  const pct = (x) => `${(x * 100).toFixed(2).replace('.', ',')} %`;

  let nivel;
  let conclusion;
  if (!supera && !margenBajo) {
    nivel = 'no';
    conclusion = `No le aplica. Proyecta ingresos gravables de ${b(ingresos)}, ${b(p.cairUmbral - ingresos)} por debajo del umbral de ${b(p.cairUmbral)}. Aunque lo superara, su margen fiscal (${pct(margen)}) es mayor que el 4,67 %, así que el CAIR no le subiría el impuesto.`;
  } else if (!supera) {
    nivel = 'riesgo';
    conclusion = `Hoy no le aplica, pero hay riesgo: si los ingresos gravables pasan de ${b(p.cairUmbral)} (le faltan ${b(p.cairUmbral - ingresos)}), su margen fiscal de ${pct(margen)} es menor que el 4,67 % y el CAIR le subiría el impuesto. Conviene preparar la solicitud de no aplicación ante la DGI.`;
  } else if (margenBajo) {
    nivel = 'si';
    conclusion = `Le aplica y le sube el impuesto: por CAIR pagaría ${b(impuestoCAIR)} frente a ${b(impuestoNormal)} por el método normal. Puede pedir a la DGI la no aplicación si el CAIR le genera pérdida o una tasa efectiva mayor a la tarifa.`;
  } else {
    nivel = 'neutro';
    conclusion = `Sus ingresos superan el umbral, así que debe hacer el cálculo alterno, pero el método normal da más impuesto (${b(impuestoNormal)} frente a ${b(impuestoCAIR)}), y ese es el que paga.`;
  }
  return { nivel, conclusion, ingresos, margen, supera, margenBajo, impuestoNormal, impuestoCAIR, faltante: Math.max(0, p.cairUmbral - ingresos) };
}

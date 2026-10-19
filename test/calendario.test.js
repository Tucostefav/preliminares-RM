import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerBalanceDePrueba } from '../public/js/lector.js';
import { liquidar } from '../public/js/motor.js';
import { proyectar } from '../public/js/proyeccion.js';
import { calendarioDePagos, analizarCAIR } from '../public/js/calendario.js';

const filas = [
  ['Cuenta', 'Descripción', 'Saldo final'],
  ['1101', 'Caja y bancos', 490000],
  ['2101', 'Cuentas por pagar', -0],
  ['4101', 'Ventas', -1910000],
  ['5101', 'Costo de ventas', 1000000],
  ['6101', 'Salarios', 350000],
];
const cuentas = leerBalanceDePrueba(filas);
const anterior = { impuestoEstimado: 120000 };

test('arma el calendario de pagos con las fechas legales', () => {
  const dic = proyectar(cuentas, anterior, {}, { mesCorte: 9 }).at(-1).resultado;
  assert.equal(dic.liquidacion.impuestoCausado, 186666.67);
  const { pagos, totalHastaDeclaracion, proximo } = calendarioDePagos(dic, { anio: 2026, mesCorte: 9, anterior });
  const fila = (concepto) => pagos.find((x) => x.concepto.startsWith(concepto));

  assert.equal(fila('2.ª partida del impuesto estimado 2026').estado, 'vencida');
  const tercera = fila('3.ª partida del impuesto estimado 2026');
  assert.equal(tercera.estado, 'pendiente');
  assert.equal(tercera.fecha.toISOString().slice(0, 10), '2026-12-31');
  assert.equal(tercera.monto, 40000);

  assert.equal(fila('Saldo del impuesto sobre la renta 2026').fecha.toISOString().slice(0, 10), '2027-03-31');
  assert.equal(fila('Saldo del impuesto sobre la renta 2026').monto, 66666.67);
  assert.equal(fila('Impuesto complementario 2026').fecha.toISOString().slice(0, 10), '2027-06-30');
  assert.equal(fila('Impuesto complementario 2026').monto, 22400);
  assert.deepEqual(pagos.filter((x) => x.concepto.includes('estimado 2027')).map((x) => x.monto), [62222.22, 62222.22, 62222.23]);

  // 3.ª partida + saldo del ISR + aviso de operación (2 % de 490.000)
  assert.equal(totalHastaDeclaracion, 40000 + 66666.67 + 9800);
  assert.equal(proximo, tercera);
});

test('el saldo a favor se abona al estimado del año siguiente', () => {
  const r = liquidar(cuentas, { impuestoEstimado: 300000 }, {}, { mes: 12 });
  const { pagos } = calendarioDePagos(r, { anio: 2026, mesCorte: 12, anterior: { impuestoEstimado: 300000 } });
  const estimado2027 = pagos.filter((x) => x.concepto.includes('estimado 2027')).reduce((s, x) => s + x.monto, 0);
  assert.equal(Math.round(estimado2027 * 100) / 100, Math.max(0, r.liquidacion.impuestoCausado - r.liquidacion.saldoAFavor));
});

test('dice si le aplica el CAIR', () => {
  const bajo = liquidar(leerBalanceDePrueba([['Cuenta', 'Nombre', 'Saldo'], ['4101', 'Ventas', -1000000], ['5101', 'Costo', 990000]]), {}, {});
  assert.equal(analizarCAIR(bajo).nivel, 'riesgo'); // margen 1 % y por debajo del umbral
  const holgado = liquidar(leerBalanceDePrueba([['Cuenta', 'Nombre', 'Saldo'], ['4101', 'Ventas', -1000000], ['5101', 'Costo', 900000]]), {}, {});
  assert.equal(analizarCAIR(holgado).nivel, 'no');
  const alto = liquidar(leerBalanceDePrueba([['Cuenta', 'Nombre', 'Saldo'], ['4101', 'Ventas', -2000000], ['5101', 'Costo', 1950000]]), {}, {});
  const a = analizarCAIR(alto);
  assert.equal(a.nivel, 'si');
  assert.equal(Math.round(a.impuestoCAIR * 100) / 100, 23350);
});

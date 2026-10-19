import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerBalanceDePrueba, aNumero } from '../public/js/lector.js';
import { liquidar } from '../public/js/motor.js';
import { proyectar } from '../public/js/proyeccion.js';

// Balance de prueba de ejemplo con saldos con signo (crédito negativo) y niveles agrupados.
const filas = [
  ['EMPRESA DE PRUEBA, S.A.'],
  ['Balance de comprobación enero - septiembre 2026'],
  ['Cuenta', 'Descripción', 'Saldo final'],
  ['1', 'ACTIVOS', 890000],
  ['1101', 'Caja y bancos', 100000],
  ['1201', 'Cuentas por cobrar clientes', 300000],
  ['1301', 'Inventario de mercancía', 200000],
  ['1401', 'Mobiliario y equipo', 300000],
  ['1402', 'Depreciación acumulada', -50000],
  ['1501', 'Impuesto estimado pagado', 40000],
  ['2101', 'Cuentas por pagar proveedores', -400000],
  ['3101', 'Capital', -100000],
  ['4101', 'Ventas', '-2,000,000.00'],
  ['4102', 'Devoluciones en ventas', 100000],
  ['4201', 'Intereses ganados', -10000],
  ['5101', 'Costo de ventas', 1000000],
  ['6101', 'Salarios', 300000],
  ['6102', 'Multas y recargos', 5000],
  ['6201', 'Intereses bancarios', 20000],
  ['6301', 'Depreciación', 30000],
];

const cuentas = leerBalanceDePrueba(filas);

test('lee números con distintos formatos', () => {
  assert.equal(aNumero('1.234.567,89'), 1234567.89);
  assert.equal(aNumero('(1,000.50)'), -1000.5);
  assert.ok(!cuentas.some((c) => c.codigo === '1'), 'ignora niveles agrupados');
});

test('liquida la renta al corte de septiembre', () => {
  const r = liquidar(cuentas, { impuestoEstimado: 120000 }, {}, { mes: 9 });
  assert.equal(r.ingresos.ingresosBrutos, 2010000);
  assert.equal(r.ingresos.ingresosGravables, 1910000);
  assert.equal(r.costosGastos.totalDeducibles, 1350000);
  assert.equal(r.costosGastos.totalNoDeducibles, 5000);
  assert.equal(r.renta.aplicaCAIR, true);
  assert.equal(r.renta.metodo, 'normal');
  assert.equal(r.renta.rentaGravable, 560000);
  assert.equal(r.liquidacion.impuestoCausado, 140000);
  assert.equal(r.liquidacion.partidasVencidas, 2);
  assert.equal(r.liquidacion.estimadoPagado, 80000);
  assert.equal(r.liquidacion.saldoAPagar, 60000);
  assert.equal(r.otros.impuestoComplementario, 42000);
  assert.equal(r.otros.avisoOperacion, 9800);
});

test('usa el CAIR cuando la renta normal es menor', () => {
  const filasCair = [
    ['Cuenta', 'Nombre', 'Saldo'],
    ['4101', 'Ventas', -2000000],
    ['5101', 'Costo de ventas', 1950000],
  ];
  const r = liquidar(leerBalanceDePrueba(filasCair), {}, {});
  assert.equal(r.renta.metodo, 'CAIR');
  assert.equal(r.renta.rentaGravable, 93400);
  assert.equal(r.liquidacion.impuestoCausado, 23350);
  const sinCair = liquidar(leerBalanceDePrueba(filasCair), { noAplicarCAIR: true }, {});
  assert.equal(sinCair.liquidacion.impuestoCausado, 12500);
});

test('limita el arrastre de pérdidas al 50 % de la renta', () => {
  const r = liquidar(cuentas, { arrastrePerdidas: 400000 }, {});
  assert.equal(r.renta.arrastrePerdidas, 280000);
  assert.equal(r.renta.rentaGravable, 280000);
});

test('proyecta octubre, noviembre y diciembre', () => {
  const esc = proyectar(cuentas, { impuestoEstimado: 120000 }, {}, { mesCorte: 9, mesesAProyectar: 3 });
  assert.deepEqual(esc.map((e) => e.mes), ['Septiembre', 'Octubre', 'Noviembre', 'Diciembre']);
  const dic = esc[3].resultado;
  assert.equal(dic.renta.rentaGravable, 746666.67);
  assert.equal(dic.liquidacion.estimadoPagado, 120000);
  assert.equal(dic.liquidacion.saldoAPagar, 66666.67);
});

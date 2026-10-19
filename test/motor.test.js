import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerBalanceDePrueba, aNumero, buscarHojaBalance, leerTotalesReportados } from '../public/js/lector.js';
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
  assert.equal(r.otros.impuestoComplementario, 16800); // 10 % sobre el 40 % de (560.000 - 140.000)
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

// Formato de QuickBooks: código y nombre en una columna, cuentas sin código, subcuentas con punto
// que no son niveles agrupados y tres pares Débito/Crédito (se usa el saldo ajustado).
const quickbooks = [
  ['EMPRESA QB, S.A.'],
  ['Adjusted Trial Balance'],
  ['A partir de 30 sep., 2026'],
  [],
  ['', 'Nombre de la cuenta', 'Saldo sin ajustar', '', 'Ajustes', '', 'Saldo ajustado', ''],
  ['', '', 'Débito', 'Crédito', 'Débito', 'Crédito', 'Débito', 'Crédito'],
  ['', '1000 Banco General', 1000, '', '', '', 1000, ''],
  ['', '1104 Reserva de cuentas malas', '', 100, '', '', '', 100],
  ['', '1100 Cuentas por cobrar clientes', 5000, '', '', '', 5000, ''],
  ['', '1612 Renta Juridica Estimada', 900, '', '', '', 900, ''],
  ['', '2001 Cuentas por pagar Proveedores', '', 3000, '', '', '', 3000],
  ['', '2001.1 Descuento por pagar', '', 200, '', '', '', 200],
  ['', 'VAT Control', 300, '', '', '', 300, ''],
  ['', '3000 Capital Social', '', 1000, '', '', '', 1000],
  ['', 'Retained Earnings', '', 1900, '', '', '', 1900],
  ['', 'Sales', '', 10000, '', '', '', 10000],
  ['', '4101 Ingresos por Intereses', '', 50, '', '', '', 50],
  ['', 'Costo de las ventas', 7000, '', '', '', 7000, ''],
  ['', '6000 Gasto de Salario', 1000, '', '', '', 1000, ''],
  ['', '8001 Servicios Adm y Contables', 750, '', '', '', 750, ''],
  ['', '6203 Cargos Bancarios', 100, '', '', '', 100, ''],
  ['', '', 16050, 16050, 0, 0, 16050, 16050],
];

test('lee un balance de prueba exportado de QuickBooks', () => {
  const hojas = [
    { nombre: 'Resultados', filas: [['Ganancias netas', '', 1200]] },
    { nombre: 'Balance', filas: [['Total para Activos', 6800]] },
    { nombre: 'Prueba', filas: quickbooks },
  ];
  const { nombre, cuentas: qb } = buscarHojaBalance(hojas);
  assert.equal(nombre, 'Prueba');
  assert.ok(qb.some((c) => c.codigo === '2001') && qb.some((c) => c.codigo === '2001.1'), 'conserva 2001 y 2001.1');

  const r = liquidar(qb, { impuestoEstimado: 1200 }, { interesesExentos: true }, { mes: 9 });
  assert.equal(r.patrimonio.totalActivos, 6800);
  assert.equal(r.patrimonio.impuestoEstimadoPagado, 900);
  assert.equal(r.patrimonio.pasivos, 2900); // proveedores + descuento - ITBMS a favor
  assert.equal(r.ingresos.ingresosGravables, 10000);
  assert.equal(r.costosGastos.utilidadContable, 1200);
  // Los intereses exentos son 50 de 10.050 de ingresos: esa parte de los 8.850 de gastos no se deduce.
  assert.equal(r.renta.rentaGravable, 1194.03);
  assert.equal(r.costosGastos.gastosFinancieros, 100);

  const reportados = leerTotalesReportados(hojas, nombre);
  assert.equal(reportados.totalActivos.valor, 6800);
  assert.equal(reportados.utilidadContable.valor, 1200);
});

test('una sociedad sin actividad comercial no paga aviso de operación ni lo tiene en el calendario', async () => {
  const { calendarioDePagos } = await import('../public/js/calendario.js');
  const cuentas = [
    { codigo: '1101', nombre: 'Banco', valor: 500000 },
    { codigo: '4101', nombre: 'Alquileres', valor: 120000 },
    { codigo: '6101', nombre: 'Mantenimiento', valor: 20000 },
  ];
  const conAviso = liquidar(cuentas, {}, {}, { mes: 12 });
  const sinAviso = liquidar(cuentas, {}, { sinAvisoOperacion: true }, { mes: 12 });
  assert.equal(conAviso.otros.avisoOperacion, 10000);
  assert.equal(sinAviso.otros.avisoOperacion, 0);
  assert.equal(sinAviso.otros.obligadoAviso, false);
  assert.equal(sinAviso.liquidacion.impuestoCausado, conAviso.liquidacion.impuestoCausado);
  const avisoEn = (r) => calendarioDePagos(r, { anio: 2026, mesCorte: 12, anterior: {} }).pagos.some((p) => /aviso de operación/.test(p.concepto));
  assert.ok(avisoEn(conAviso));
  assert.ok(!avisoEn(sinAviso));
});

test('lee el balance de QuickBooks con la columna de cuentas sin título y separa los ingresos no gravables', () => {
  const filas = [
    ['EMPRESA DE PRUEBA INC', '', '', '', '', '', ''],
    ['Balance general ajustado', '', '', '', '', '', ''],
    ['', 'Saldo sin ajustar', '', 'Ajustes', '', 'Saldo ajustado', ''],
    ['', 'Débito', 'Crédito', 'Débito', 'Crédito', 'Débito', 'Crédito'],
    ['10100 Banco', 50000, 0, 0, 0, 50000, 0],
    ['23000 Cuentas por pagar', 0, 5000, 0, 0, 0, 5000],
    ['Ganancias acumuladas', 0, 15000, 0, 0, 0, 15000],
    ['40300 Ingresos No gravables', 0, 60000, 0, 0, 0, 60000],
    ['40400 Servicios de asesoría', 0, 40000, 0, 0, 0, 40000],
    ['6120 Honorarios', 70000, 0, 0, 0, 70000, 0],
    ['TOTAL', 120000, 120000, 0, 0, 120000, 120000],
  ];
  const cuentas = leerBalanceDePrueba(filas);
  assert.equal(cuentas.length, 6);
  const r = liquidar(cuentas, {}, {}, { mes: 9 });
  assert.equal(r.ingresos.ingresosBrutos, 100000);
  assert.equal(r.ingresos.ingresosExentos, 60000);
  assert.equal(r.ingresos.ingresosGravables, 40000);
});

test('reparte los gastos en proporción a los ingresos exentos, salvo que se escriba el monto', () => {
  const cuentas = leerBalanceDePrueba([
    ['Cuenta', 'Descripción', 'Saldo final'],
    ['1101', 'Banco', 100000],
    ['4101', 'Ingresos no gravables', -60000],
    ['4102', 'Servicios', -40000],
    ['6101', 'Honorarios', 70000],
  ]);
  const auto = liquidar(cuentas, {}, {}, { mes: 12 });
  assert.equal(auto.costosGastos.costosGastosExentos, 42000);
  assert.equal(auto.costosGastos.totalDeducibles, 28000);
  assert.equal(auto.renta.rentaNetaGravable, 12000);
  const manual = liquidar(cuentas, {}, { costosGastosExentos: 10000 }, { mes: 12 });
  assert.equal(manual.costosGastos.totalDeducibles, 60000);
  const sinReparto = liquidar(cuentas, {}, { repartoProporcional: false }, { mes: 12 });
  assert.equal(sinReparto.costosGastos.totalDeducibles, 70000);
});

test('lee la balanza de comprobación de Zoho: secciones, subcuentas sin código y totales por grupo', () => {
  const filas = [
    ['Empresa SA\n  Balanza de comprobación\n  A partir de 30 sep 2026', '', '', ''],
    ['Cuenta ', 'Código de la cuenta ', 'Débito neto ', 'Crédito neto '],
    ['', '', '', ''],
    ['Activos', '', '', ''],
    ['          Caja Menuda', '', 1000, 0],
    ['          Maquinaria y Equipos', '1500', 5000, 0],
    ['                    Dep Acum Maquinaria & Equipos', '', 0, 2000],
    ['          Total para Maquinaria y Equipos', '1500', 3000, 0],
    ['Pasivo', '', '', ''],
    ['          Cuentas por pagar', '', 0, 500],
    ['Capital', '', '', ''],
    ['          Capital del propietario', '', 0, 1000],
    ['Ingresos', '', '', ''],
    ['          Venta de gas', '4001', 0, 10000],
    ['Gastos', '', '', ''],
    ['          Costes de productos vendidos', '', 6000, 0],
    ['          Salarios y otras Remuneraciones', '6010', 0, 0],
    ['                    Gasto de salarios', '6011', 1000, 0],
    ['                    Indemnizacion', '', 500, 0],
    ['          Total para Salarios y otras Remuneraciones', '6010', 1500, 0],
    ['Total para Balanza de comprobación', '', 13500, 13500],
  ];
  const cuentas = leerBalanceDePrueba(filas);
  const r = liquidar(cuentas, {}, {}, { mes: 9 });
  assert.equal(r.patrimonio.efectivo, 1000);
  assert.equal(r.patrimonio.propiedadesPlantaEquipo, 3000);
  assert.equal(r.patrimonio.pasivos, 500);
  assert.equal(r.ingresos.ingresosGravables, 10000);
  assert.equal(r.costosGastos.costos, 6000);
  assert.equal(r.costosGastos.gastosGenerales, 1500);
  assert.equal(r.costosGastos.utilidadContable, 2500);
});

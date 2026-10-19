import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerDeclaracion } from '../public/js/declaracion.js';

// Líneas como las entrega pdf.js: celdas con texto y posición horizontal.
const linea = (...celdas) => celdas.map(([s, x]) => ({ s, x }));
const lineas = [
  linea(['DIRECCION GENERAL DE INGRESOS', 241]),
  linea(['RENTA JURIDICA', 278]),
  linea(['RUC', 30], ['D.V.', 124], ['Razón Social', 219], ['Periodo Declarado', 503]),
  linea(['155000000­2­2020', 30], ['10', 124], ['EMPRESA DE PRUEBA, S.A.', 219], ['2025', 503]),
  linea(['Tarifa ISR (25%, 27.5%, 30%)', 408]),
  linea(['25­[25%] Regular', 408]),
  linea(['Aprobación No Cair', 503]),
  linea(['NO', 503]),
  linea(['Ventas y Prestación de Servicios', 33], ['1', 190], ['200,000.00', 263], ['Total de Ingresos', 313], ['20', 470], ['200,000.00', 544]),
  linea(['Fuente Extranjera', 313], ['25', 470], ['5,000.00', 554]),
  linea(['Total de Ingresos Gravables', 313], ['26', 470], ['195,000.00', 544]),
  linea(['Ley 16/2012', 391], ['88', 470]),
  linea(['Total de Costos Deducibles', 313], ['41', 470], ['120,000.00', 544]),
  linea(['Total de Gastos Deducibles', 313], ['82', 470], ['35,000.00', 554]),
  linea(['Renta Neta Gravable', 313], ['91', 470], ['40,000.00', 550]),
  linea(['Impuesto Causado', 33], ['93', 189], ['10,000.00', 272], ['Crédito Declaración Anterior', 313], ['99', 470], ['2,000.00', 554]),
  linea(['Menos: Crédito de Arrastre', 33], ['104', 189], ['500.00', 272]),
  linea(['Impuesto Jurado a Pagar', 33], ['128', 189], ['8,000.00', 272], ['Impuesto Estimado a Pagar', 313], ['130', 470], ['9,500.00', 554]),
  linea(['Impuesto Jurado a Favor', 33], ['129', 189], ['1,200.00', 272]),
  linea(['ISR Primera Partida', 33], ['132', 189], ['3,166.67', 272]),
  linea(['Renta Neta Extranjera', 33], ['137', 189], ['­3,598.86', 272]),
  linea(['Impuesto Complementario', 313], ['142', 470], ['1,200.00', 554]),
  linea(['Total de Patrimonio', 313], ['189', 470], ['50,000.00', 554]),
  linea(['Impuesto a Pagar Aviso de Operación Empresas', 313], ['191', 470], ['1,000.00', 554]),
  // El PDF repite filas al saltar de página: se queda el primer valor
  linea(['Total de Gastos Deducibles', 313], ['82', 470], ['99.00', 554]),
];

test('lee los renglones de la declaración jurada de rentas', () => {
  const d = leerDeclaracion(lineas);
  assert.equal(d.razonSocial, 'EMPRESA DE PRUEBA, S.A.');
  assert.equal(d.periodo, 2025);
  assert.equal(d.dv, '10');
  assert.equal(d.tarifa, 0.25);
  assert.equal(d.aprobacionNoCAIR, false);
  assert.equal(d.resumen.ingresosGravables, 195000);
  assert.equal(d.resumen.gastosDeducibles, 35000);
  assert.equal(d.resumen.impuestoCausado, 10000);
  assert.equal(d.renglones[137], -3598.86);
  assert.equal(d.renglones[88], undefined);
  assert.equal(d.paraLiquidar.impuestoEstimado, 9500);
  assert.equal(d.paraLiquidar.saldoAFavor, 700); // 1.200 a favor - 500 ya aplicados al estimado
  assert.equal(d.resumen.avisoOperacion, 1000);
  assert.ok(d.avisos.some((a) => a.includes('fuente extranjera')));
});

test('rechaza un PDF que no es la declaración', () => {
  assert.throws(() => leerDeclaracion([linea(['Factura', 10])]), /no parece una declaración/);
});

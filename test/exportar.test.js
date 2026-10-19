import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { leerBalanceDePrueba } from '../public/js/lector.js';
import { proyectar } from '../public/js/proyeccion.js';
import { calendarioDePagos, analizarCAIR } from '../public/js/calendario.js';
import { libroDelPreliminar, nombreDeArchivo } from '../public/js/exportar.js';
import { informeHtml } from '../public/js/informe.js';

const cuentas = leerBalanceDePrueba([
  ['Cuenta', 'Descripción', 'Saldo final'],
  ['1101', 'Caja y bancos', 100000],
  ['1501', 'Impuesto estimado pagado', 40000],
  ['2101', 'Cuentas por pagar', -60000],
  ['3101', 'Capital', -10000],
  ['4101', 'Ventas', -900000],
  ['5101', 'Costo de ventas', 600000],
  ['6101', 'Salarios', 230000],
]);

function informe(extra = {}) {
  const anterior = { impuestoEstimado: 60000 };
  const escenarios = proyectar(cuentas, anterior, {}, { mesCorte: 9, mesesAProyectar: 3 });
  const cierre = escenarios.at(-1).resultado;
  return {
    escenarios,
    cal: calendarioDePagos(cierre, { anio: 2026, mesCorte: 9, anterior }),
    cair: analizarCAIR(cierre),
    filas: [['Ingresos', null], ['Ingresos gravables', (r) => r.ingresos.ingresosGravables, 'total'], ['Impuesto causado', (r) => r.liquidacion.impuestoCausado]],
    contexto: { anio: 2026, mesCorte: 9 },
    cliente: 'Empresa de Prueba, S.A.',
    ruc: '123-45-6789',
    usuario: 'Ana Gómez',
    firma: { nombre: 'RM Contadores', detalle: 'Ciudad de Panamá', logo: null },
    borrador: false,
    ...extra,
  };
}

test('exporta el preliminar a Excel con membrete, números y una hoja por sección', async () => {
  const libro = libroDelPreliminar(ExcelJS, informe());
  assert.deepEqual(libro.worksheets.map((h) => h.name), ['Resumen', 'Calendario', 'Determinación', 'Proyección', 'Cuentas']);
  // Se escribe y se vuelve a leer para comprobar que el archivo abre.
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await libro.xlsx.writeBuffer());
  const hoja = leido.getWorksheet('Determinación');
  assert.equal(hoja.getCell('A1').value, 'RM Contadores');
  assert.match(hoja.getCell('A5').value, /Empresa de Prueba, S\.A\..*123-45-6789/);
  let fila = null;
  hoja.eachRow((r) => { if (r.getCell(1).value === 'Ingresos gravables') fila = r; });
  assert.equal(fila.getCell(2).value, 900000);
  assert.equal(fila.getCell(3).value, 1200000); // proyectado a diciembre con el promedio
  assert.ok(fila.getCell(2).font.bold, 'los totales van en negrita');
  const calendario = leido.getWorksheet('Calendario');
  assert.ok(calendario.getCell('A9').value instanceof Date);
  assert.equal(typeof calendario.getCell('D9').value, 'number');
  assert.equal(nombreDeArchivo({ cliente: 'Á/B: S.A.', mesCorte: 9, anio: 2026 }), 'Preliminar AB S.A. septiembre 2026');
});

test('el informe PDF numera las secciones en orden y marca los borradores', () => {
  const html = informeHtml(informe({ borrador: true }));
  const numeros = [...html.matchAll(/<h2 class="inf-h2"><span>(\d+)\.<\/span> ([^<]+)<\/h2>/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(numeros.slice(0, 3), ['1 Resumen ejecutivo', '2 Calendario de obligaciones fiscales', '3 Determinación del impuesto sobre la renta']);
  assert.match(html, /BORRADOR/);
  assert.match(html, /Preparado por/);
  assert.doesNotMatch(informeHtml(informe()), /inf-marca-agua/);
});

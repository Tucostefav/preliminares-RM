import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { leerBalanceDePrueba } from '../public/js/lector.js';
import { proyectar } from '../public/js/proyeccion.js';
import { calendarioDePagos, analizarCAIR } from '../public/js/calendario.js';
import { libroDelPreliminar, nombreDeArchivo } from '../public/js/exportar.js';

// SheetJS viene como script para el navegador; se carga igual que en la página, como global.
const contexto = { Uint8Array, ArrayBuffer, Date, Math, Buffer, TextEncoder, TextDecoder };
vm.runInNewContext(readFileSync(new URL('../public/vendor/xlsx.full.min.js', import.meta.url), 'utf8'), contexto);
const XLSX = contexto.XLSX;

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

test('exporta el preliminar a Excel con números y una hoja por sección', () => {
  const anterior = { impuestoEstimado: 60000 };
  const escenarios = proyectar(cuentas, anterior, {}, { mesCorte: 9, mesesAProyectar: 3 });
  const cierre = escenarios.at(-1).resultado;
  const libro = libroDelPreliminar(XLSX, {
    escenarios,
    cal: calendarioDePagos(cierre, { anio: 2026, mesCorte: 9, anterior }),
    cair: analizarCAIR(cierre),
    filas: [['Ingresos', null], ['Ingresos gravables', (r) => r.ingresos.ingresosGravables], ['Impuesto causado', (r) => r.liquidacion.impuestoCausado]],
    contexto: { anio: 2026, mesCorte: 9 },
    cliente: 'Empresa de Prueba, S.A.',
    ruc: '123-45-6789',
  });
  assert.deepEqual([...libro.SheetNames], ['Resumen', 'Declaración', 'Calendario de pagos', 'Base de la proyección', 'Cuentas']);
  // La copia por XLSX.write/read comprueba que el archivo se genera y se puede abrir.
  const leido = XLSX.read(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }));
  const declaracion = XLSX.utils.sheet_to_json(leido.Sheets['Declaración'], { header: 1 });
  const fila = declaracion.find((f) => f[0] === 'Ingresos gravables');
  assert.equal(fila[1], 900000);
  assert.equal(fila[2], 1200000); // proyectado a diciembre con el promedio
  const calendario = XLSX.utils.sheet_to_json(leido.Sheets['Calendario de pagos'], { header: 1 });
  assert.equal(typeof calendario[1][2], 'number');
  assert.equal(nombreDeArchivo({ cliente: 'Á/B: S.A.', mesCorte: 9, anio: 2026 }), 'Preliminar AB S.A. septiembre 2026');
});

// Exporta el preliminar que se está viendo a un libro de Excel, con números de verdad (no texto)
// para que el contador pueda seguir trabajando sobre ellos.

const FORMATO = '#,##0.00';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ESTADOS = { vencida: 'Vencida', pendiente: 'Por pagar', proyectado: 'Proyectado', anual: 'Anual' };
const neto = (l) => l.saldoAPagar - l.saldoAFavor;
const CONCEPTOS = {
  efectivo: 'Efectivo y bancos', inversiones: 'Inversiones', cuentasPorCobrar: 'Cuentas por cobrar',
  impuestoEstimadoPagado: 'Impuesto estimado pagado', inventarios: 'Inventarios', propiedadesPlantaEquipo: 'Propiedad, planta y equipo',
  intangibles: 'Intangibles', otrosActivos: 'Otros activos', pasivos: 'Pasivos', patrimonioContable: 'Patrimonio',
  ingresosOperacion: 'Ingresos de operación', ingresosFinancieros: 'Ingresos financieros', otrosIngresos: 'Otros ingresos',
  devoluciones: 'Devoluciones y descuentos', costos: 'Costos', gastosGenerales: 'Gastos generales y administrativos',
  depreciacion: 'Depreciación y amortización', gastosFinancieros: 'Gastos financieros',
};

// Hoja a partir de filas; los números quedan con dos decimales y las fechas como fechas.
function hoja(XLSX, filas, anchos) {
  const ws = XLSX.utils.aoa_to_sheet(filas, { cellDates: true });
  for (const ref of Object.keys(ws)) {
    if (ref[0] === '!') continue;
    if (ws[ref].t === 'n') {
      ws[ref].v = Math.round(ws[ref].v * 100) / 100;
      ws[ref].z = FORMATO;
    }
    if (ws[ref].t === 'd') ws[ref].z = 'dd/mm/yyyy';
  }
  ws['!cols'] = anchos.map((wch) => ({ wch }));
  return ws;
}

export function nombreDeArchivo({ cliente, mesCorte, anio }) {
  // Sin tildes: algunos navegadores descartan el nombre del archivo si las trae.
  const limpio = String(cliente || 'Cliente').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `Preliminar ${limpio} ${MESES[mesCorte - 1]} ${anio}`;
}

export function libroDelPreliminar(XLSX, informe) {
  const { escenarios, cuadre = [], cal, cair, filas, cliente, ruc, usuario } = informe;
  const { anio, mesCorte, crecimiento = 0 } = informe.contexto;
  const corte = escenarios[0];
  const cierre = escenarios[escenarios.length - 1];
  const lc = corte.resultado.liquidacion;
  const ll = cierre.resultado.liquidacion;
  const libro = XLSX.utils.book_new();
  const sentido = (v) => (v < 0 ? 'a favor' : 'por pagar');

  const resumen = [
    ['Renta preliminar · Impuesto sobre la renta, persona jurídica (Panamá)'],
    [],
    ['Cliente', cliente],
    ['RUC', ruc],
    ['Corte', `${MESES[mesCorte - 1]} ${anio}`],
    ['Proyección', `Al 31 de diciembre de ${anio}, con el promedio mensual de enero a ${MESES[mesCorte - 1]}${crecimiento ? ` ajustado ${(crecimiento * 100).toFixed(1)} %` : ''}`],
    ['Generado', new Date(), usuario ? `por ${usuario}` : ''],
    [],
    ['Cifra', 'Monto (B/.)', ''],
    ['ISR si declarara hoy', Math.abs(neto(lc)), sentido(neto(lc))],
    ['ISR proyectado al cierre', Math.abs(neto(ll)), sentido(neto(ll))],
    ['Impuesto causado al cierre', ll.impuestoCausado, ''],
    ['Impuesto complementario', cierre.resultado.otros.impuestoComplementario, ''],
    ['Impuesto de aviso de operación', cierre.resultado.otros.avisoOperacion, ''],
  ];
  if (cal) {
    resumen.push([`Pagos de aquí al 31 de marzo de ${anio + 1}`, cal.totalHastaDeclaracion, '']);
    if (cal.proximo) resumen.push(['Próximo pago', cal.proximo.monto, `${cal.proximo.concepto}, ${cal.proximo.fecha.toLocaleDateString('es-PA', { timeZone: 'UTC' })}`]);
  }
  resumen.push([], ['CAIR', cair.conclusion]);
  for (const c of cuadre) resumen.push([`Cuadre: ${c.nombre}`, c.calculado, `${c.cuadra ? 'Cuadra' : 'NO cuadra'} con "${c.hoja}" (${c.reportado.toFixed(2)})`]);
  resumen.push([], ['Cálculo preliminar para planeación; no reemplaza la declaración jurada definitiva.']);
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, resumen, [42, 18, 60]), 'Resumen');

  const columnas = escenarios.length > 1 ? [corte, cierre] : [corte];
  const declaracion = [['Concepto', `Al corte (ene–${MESES[mesCorte - 1].slice(0, 3)}), real`, ...(columnas.length > 1 ? ['Al cierre (ene–dic), proyectado'] : [])]];
  for (const [nombre, f] of filas) {
    if (f) declaracion.push([nombre, ...columnas.map((e) => f(e.resultado))]);
    else declaracion.push([], [nombre.toUpperCase()]); // título de sección con una fila en blanco antes
  }
  XLSX.utils.book_append_sheet(libro, hoja(XLSX, declaracion, [52, 24, 28]), 'Declaración');

  if (cal) {
    const calendario = [['Fecha', 'Concepto', 'Monto (B/.)', 'Estado', 'Nota']];
    for (const p of cal.pagos) calendario.push([p.fecha || 'Según inscripción', p.concepto, p.monto, ESTADOS[p.estado], p.nota]);
    calendario.push([], ['', `Total por pagar hasta el 31 de marzo de ${anio + 1}`, cal.totalHastaDeclaracion]);
    XLSX.utils.book_append_sheet(libro, hoja(XLSX, calendario, [14, 50, 14, 12, 70]), 'Calendario de pagos');
  }

  const faltan = escenarios.length - 1;
  if (faltan) {
    const lineas = [
      ['Ingresos gravables', (r) => r.ingresos.ingresosGravables],
      ['Costos', (r) => r.costosGastos.costos],
      ['Gastos deducibles', (r) => r.costosGastos.totalDeducibles - r.costosGastos.costos],
      ['Renta neta gravable', (r) => r.renta.rentaNetaGravable],
    ];
    const meses = MESES.slice(mesCorte, mesCorte + faltan).map((m) => `${m.slice(0, 3)} (proyectado)`);
    const base = [['Concepto', `Real ene–${MESES[mesCorte - 1].slice(0, 3)}`, 'Promedio mensual', ...meses, 'Total año']];
    for (const [nombre, f] of lineas) {
      const real = f(corte.resultado);
      const total = f(cierre.resultado);
      base.push([nombre, real, real / mesCorte, ...Array(faltan).fill((total - real) / faltan), total]);
    }
    XLSX.utils.book_append_sheet(libro, hoja(XLSX, base, [26, 18, 18, ...meses.map(() => 18), 18]), 'Base de la proyección');
  }

  // Cuenta por cuenta, cómo se clasificó (los cálculos viejos guardados no traen este detalle).
  if (corte.resultado.detalle) {
    const alCierre = new Map();
    for (const [concepto, cuentas] of Object.entries(cierre.resultado.detalle || {})) {
      for (const c of cuentas) alCierre.set(`${concepto}|${c.codigo}|${c.nombre}`, c.valor);
    }
    const cuentas = [['Clasificación', 'Código', 'Cuenta', 'Al corte', ...(columnas.length > 1 ? ['Al cierre'] : [])]];
    for (const [concepto, lista] of Object.entries(corte.resultado.detalle)) {
      for (const c of lista) {
        cuentas.push([CONCEPTOS[concepto] || concepto, c.codigo, c.nombre, c.valor, ...(columnas.length > 1 ? [alCierre.get(`${concepto}|${c.codigo}|${c.nombre}`) ?? c.valor] : [])]);
      }
    }
    XLSX.utils.book_append_sheet(libro, hoja(XLSX, cuentas, [26, 12, 46, 16, 16]), 'Cuentas');
  }
  return libro;
}

// Descarga el libro con un enlace propio: así el archivo conserva su nombre en todos los navegadores.
export function descargarLibro(XLSX, libro, nombre) {
  const datos = XLSX.write(libro, { type: 'array', bookType: 'xlsx', compression: true });
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

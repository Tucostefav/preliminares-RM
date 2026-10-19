// Exporta el preliminar a un libro de Excel con formato de firma: membrete en cada hoja, encabezados de
// tabla, totales con raya doble y configuración de impresión. Los montos son números, no texto.
// Usa ExcelJS (public/vendor/exceljs), que se carga solo al exportar.

import { MESES, fechaLarga, hoyLargo, segmentosDelResumen, ALCANCE } from './informe.js';

const ESTADOS = { vencida: 'Vencida', pendiente: 'Por pagar', proyectado: 'Proyectada', anual: 'Anual' };
const NUMERO = '#,##0.00;(#,##0.00);"–"';
// Identidad de la firma: el azul y el rojo del logo de Rose Molina, texto casi negro.
const TINTA = 'FF111111';
const GRIS = 'FF5A5F6E';
const AZUL = 'FF0000B8';
const FONDO = 'FFEDEEF9';
const LINEA = 'FFE3E4EE';
// Franja roja y azul bajo el membrete (PNG de 100 × 2 px que se estira al ancho de la hoja).
const FRANJA = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAAACCAIAAAAhLe5EAAAAGklEQVR42mP8z0AYMDLsYBgFDAxMo0FAPAAA9L8BvGzbId8AAAAASUVORK5CYII=';
const ALTO_LOGO = 58; // px

// Ancho y alto de un PNG o JPG en base64, para no deformar el logo.
function medidas(base64, extension) {
  const b = atob(base64.slice(0, extension === 'png' ? 40 : base64.length));
  const byte = (i) => b.charCodeAt(i);
  if (extension === 'png') return { ancho: (byte(16) << 24 | byte(17) << 16 | byte(18) << 8 | byte(19)), alto: (byte(20) << 24 | byte(21) << 16 | byte(22) << 8 | byte(23)) };
  for (let i = 2; i < b.length - 9;) {
    if (byte(i) !== 0xFF) { i++; continue; }
    const marca = byte(i + 1);
    if (marca >= 0xC0 && marca <= 0xC3) return { alto: byte(i + 5) << 8 | byte(i + 6), ancho: byte(i + 7) << 8 | byte(i + 8) };
    i += 2 + (byte(i + 2) << 8 | byte(i + 3));
  }
  return { ancho: 5, alto: 3 };
}

function imagenDelLogo(libro, logo) {
  if (!libro._logo) {
    const [, extension, base64] = (logo || '').match(/^data:image\/(png|jpeg);base64,(.+)$/) || [];
    libro._logo = base64 ? { id: libro.addImage({ base64, extension }), ...medidas(base64, extension) } : { id: null };
  }
  return libro._logo;
}
const neto = (l) => l.saldoAPagar - l.saldoAFavor;
const CONCEPTOS = {
  efectivo: 'Efectivo y bancos', inversiones: 'Inversiones', cuentasPorCobrar: 'Cuentas por cobrar',
  impuestoEstimadoPagado: 'Impuesto estimado pagado', inventarios: 'Inventarios', propiedadesPlantaEquipo: 'Propiedad, planta y equipo',
  intangibles: 'Intangibles', otrosActivos: 'Otros activos', pasivos: 'Pasivos', patrimonioContable: 'Patrimonio',
  ingresosOperacion: 'Ingresos de operación', ingresosFinancieros: 'Ingresos financieros', otrosIngresos: 'Otros ingresos',
  devoluciones: 'Devoluciones y descuentos', costos: 'Costos', gastosGenerales: 'Gastos generales y administrativos',
  depreciacion: 'Depreciación y amortización', gastosFinancieros: 'Gastos financieros',
};

export function nombreDeArchivo({ cliente, mesCorte, anio }) {
  // Sin tildes: algunos navegadores descartan el nombre del archivo si las trae.
  const limpio = String(cliente || 'Cliente').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return `Preliminar ${limpio} ${MESES[mesCorte - 1]} ${anio}`;
}

const redondear = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

// Una hoja con el membrete de la firma y los datos del cliente; devuelve la hoja y la siguiente fila libre.
function nuevaHoja(libro, d, nombre, titulo, anchos, { horizontal = false } = {}) {
  const hoja = libro.addWorksheet(nombre, {
    properties: { defaultRowHeight: 16 },
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 1, orientation: horizontal ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.7, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L&8&K0000B8${d.firma.nombre.replace(/&/g, '&&')} · Confidencial · Preparado para ${d.cliente.replace(/&/g, '&&')}&R&8&K566072Página &P de &N`,
    },
  });
  hoja.columns = anchos.map((width) => ({ width }));
  const ultima = anchos.length;
  const fila = (n, texto, fuente, { alto, derecha = false } = {}) => {
    hoja.mergeCells(n, 1, n, ultima);
    const c = hoja.getCell(n, 1);
    c.value = texto;
    c.font = { name: 'Calibri', ...fuente };
    c.alignment = { vertical: 'middle', horizontal: derecha ? 'right' : 'left' };
    if (alto) hoja.getRow(n).height = alto;
  };
  // Membrete: logo a la izquierda y el tipo de documento a la derecha; sin logo, el nombre de la firma.
  const logo = imagenDelLogo(libro, d.firma.logo);
  const informe = 'INFORME PRELIMINAR DEL IMPUESTO SOBRE LA RENTA';
  if (logo.id !== null) {
    hoja.addImage(logo.id, { tl: { col: 0, row: 0.1 }, ext: { width: Math.round(ALTO_LOGO * logo.ancho / logo.alto), height: ALTO_LOGO } });
    fila(1, informe, { size: 10, bold: true, color: { argb: AZUL } }, { alto: 18, derecha: true });
    fila(2, titulo, { size: 12, bold: true, color: { argb: TINTA } }, { alto: 18, derecha: true });
    fila(3, d.firma.detalle || ' ', { size: 8, color: { argb: GRIS } }, { alto: 14, derecha: true });
  } else {
    fila(1, d.firma.nombre, { size: 14, bold: true, color: { argb: TINTA } }, { alto: 20 });
    fila(2, `${informe} · ${titulo.toUpperCase()}`, { size: 9, bold: true, color: { argb: AZUL } }, { alto: 18 });
    fila(3, d.firma.detalle || ' ', { size: 8, color: { argb: GRIS } }, { alto: 14 });
  }
  hoja.getRow(4).height = 9;
  const anchoPx = anchos.reduce((t, w) => t + Math.round(w * 7 + 5), 0);
  if (!libro._franja) libro._franja = libro.addImage({ base64: FRANJA, extension: 'png' });
  hoja.addImage(libro._franja, { tl: { col: 0, row: 3.45 }, ext: { width: anchoPx, height: 4 } });
  const { anio, mesCorte } = d.contexto;
  fila(5, `Contribuyente: ${d.cliente}    RUC: ${d.ruc || '—'}`, { size: 10, bold: true, color: { argb: TINTA } }, { alto: 18 });
  fila(6, `Corte: ${fechaLarga(new Date(Date.UTC(anio, mesCorte, 0)))}  ·  Emitido: ${hoyLargo()}  ·  Preparado por: ${d.usuario || d.firma.nombre}  ·  ${d.borrador ? 'BORRADOR para revisión' : 'Versión final'}`,
    { size: 9, color: { argb: d.borrador ? 'FFC00000' : GRIS } });
  return { hoja, siguiente: 8 };
}

function cabecera(hoja, n, titulos, alinear = []) {
  const r = hoja.getRow(n);
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: alinear[i] || (i === 0 ? 'left' : 'right'), wrapText: true, indent: i === 0 ? 1 : 0 };
  });
  r.height = 30;
  return n + 1;
}

// Escribe una fila de datos. tipo: '' | 'seccion' | 'total' | 'final' | 'tenue'
function filaDatos(hoja, n, valores, tipo = '', { columnas = valores.length } = {}) {
  const r = hoja.getRow(n);
  for (let i = 0; i < columnas; i++) {
    const c = r.getCell(i + 1);
    const v = redondear(valores[i]);
    c.value = v ?? null;
    c.font = { name: 'Calibri', size: 10, color: { argb: tipo === 'tenue' ? 'FF8A93A3' : TINTA }, bold: tipo === 'total' || tipo === 'final' };
    c.alignment = { vertical: 'top', wrapText: typeof v === 'string', indent: i === 0 ? 1 : 0 };
    if (typeof v === 'number') c.numFmt = NUMERO;
    if (v instanceof Date) {
      c.numFmt = 'dd/mm/yyyy';
      c.alignment = { vertical: 'top', horizontal: 'left', indent: i === 0 ? 1 : 0 };
    }
    const borde = { bottom: { style: 'thin', color: { argb: LINEA } } };
    if (tipo === 'total') borde.top = { style: 'thin', color: { argb: TINTA } };
    if (tipo === 'final') {
      borde.top = { style: 'thin', color: { argb: TINTA } };
      borde.bottom = { style: 'double', color: { argb: AZUL } };
    }
    if (tipo === 'seccion') {
      c.font = { name: 'Calibri', size: 9, bold: true, color: { argb: GRIS } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FONDO } };
    }
    c.border = borde;
  }
  return n + 1;
}

function titulo(hoja, n, texto, columnas) {
  hoja.mergeCells(n, 1, n, columnas);
  const c = hoja.getCell(n, 1);
  c.value = texto;
  c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: AZUL } };
  for (let i = 1; i <= columnas; i++) hoja.getCell(n, i).border = { bottom: { style: 'thin', color: { argb: AZUL } } };
  hoja.getRow(n).height = 20;
  return n + 1;
}

function parrafo(hoja, n, texto, columnas, { alto = 60, tamano = 10, color = TINTA } = {}) {
  hoja.mergeCells(n, 1, n, columnas);
  const c = hoja.getCell(n, 1);
  c.value = Array.isArray(texto)
    ? { richText: texto.map(([t, negrita]) => ({ text: t, font: { name: 'Calibri', size: tamano, bold: Boolean(negrita), color: { argb: color } } })) }
    : texto;
  if (!Array.isArray(texto)) c.font = { name: 'Calibri', size: tamano, color: { argb: color } };
  c.alignment = { wrapText: true, vertical: 'top' };
  hoja.getRow(n).height = alto;
  return n + 1;
}

/**
 * @param {object} ExcelJS  la librería (global en el navegador, paquete en las pruebas)
 * @param {object} d  informe de la pantalla, con firma y borrador
 */
export function libroDelPreliminar(ExcelJS, d) {
  const { escenarios, cuadre = [], cal, cair, filas } = d;
  const { anio, mesCorte, crecimiento = 0 } = d.contexto;
  const corte = escenarios[0];
  const cierre = escenarios[escenarios.length - 1];
  const proyectado = escenarios.length > 1;
  const mes = MESES[mesCorte - 1];
  const libro = new ExcelJS.Workbook();
  libro.creator = d.usuario || d.firma.nombre;
  libro.company = d.firma.nombre;
  libro.title = `Informe preliminar ISR · ${d.cliente}`;
  libro.created = new Date();

  // Resumen
  {
    const { hoja, siguiente } = nuevaHoja(libro, d, 'Resumen', 'Resumen', [58, 16, 18]);
    let n = titulo(hoja, siguiente, 'Resumen ejecutivo', 3);
    n = parrafo(hoja, n + 1, segmentosDelResumen(d), 3, { alto: 96 });
    n = cabecera(hoja, n + 1, ['Cifras principales', 'Situación', 'Monto (B/.)']);
    const lc = corte.resultado.liquidacion;
    const ll = cierre.resultado.liquidacion;
    const sentido = (v) => (v < 0 ? 'A favor' : 'Por pagar');
    n = filaDatos(hoja, n, [`Impuesto sobre la renta al ${fechaLarga(new Date(Date.UTC(anio, mesCorte, 0)))}`, sentido(neto(lc)), Math.abs(neto(lc))]);
    if (proyectado) {
      n = filaDatos(hoja, n, ['Impuesto sobre la renta proyectado al 31 de diciembre', sentido(neto(ll)), Math.abs(neto(ll))]);
      n = filaDatos(hoja, n, ['Impuesto causado proyectado del período', '', ll.impuestoCausado]);
    }
    n = filaDatos(hoja, n, ['Impuesto complementario proyectado', '', cierre.resultado.otros.impuestoComplementario]);
    n = filaDatos(hoja, n, ['Impuesto de aviso de operación proyectado', '', cierre.resultado.otros.avisoOperacion]);
    if (cal) n = filaDatos(hoja, n, [`Total de pagos hasta el 31 de marzo de ${anio + 1}`, '', cal.totalHastaDeclaracion], 'final');

    n = titulo(hoja, n + 1, 'Cálculo alterno del impuesto sobre la renta (CAIR)', 3);
    n = parrafo(hoja, n + 1, cair.conclusion, 3, { alto: 48 });
    n = cabecera(hoja, n, ['Indicador', '', 'Valor']);
    n = filaDatos(hoja, n, [`Ingresos gravables ${proyectado ? 'proyectados' : 'al corte'}`, '', cair.ingresos]);
    n = filaDatos(hoja, n, ['Umbral para el cálculo alterno', '', 1500000]);
    n = filaDatos(hoja, n, ['Margen fiscal (renta neta gravable / ingresos gravables)', '', cair.margen]);
    hoja.getCell(n - 1, 3).value = cair.margen; // sin redondear a centésimos: es un porcentaje
    hoja.getCell(n - 1, 3).numFmt = '0.00%';
    n = filaDatos(hoja, n, ['Impuesto por el método normal', '', cair.impuestoNormal]);
    n = filaDatos(hoja, n, ['Impuesto por el CAIR (4,67 % de los ingresos)', '', cair.impuestoCAIR]);

    if (cuadre.length) {
      n = titulo(hoja, n + 1, 'Conciliación con los estados financieros', 3);
      n = cabecera(hoja, n + 1, ['Concepto', 'Balance de prueba', 'Estado reportado']);
      for (const c of cuadre) n = filaDatos(hoja, n, [`${c.nombre} (hoja "${c.hoja}") · ${c.cuadra ? 'Concilia' : 'No concilia'}`, c.calculado, c.reportado]);
    }
    n = titulo(hoja, n + 1, 'Alcance y limitaciones', 3);
    n = parrafo(hoja, n + 1, ALCANCE, 3, { alto: 92, tamano: 9, color: GRIS });
    // Firmas
    n += 2;
    for (const [col, rotulo, nombre] of [[1, 'Preparado por', d.usuario || ''], [3, 'Revisado por', '']]) {
      const c = hoja.getCell(n, col);
      c.value = nombre;
      c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: TINTA } };
      c.border = { top: { style: 'thin', color: { argb: TINTA } } };
      const r = hoja.getCell(n + 1, col);
      r.value = rotulo.toUpperCase();
      r.font = { name: 'Calibri', size: 8, color: { argb: GRIS } };
    }
  }

  // Calendario de obligaciones
  if (cal) {
    const { hoja, siguiente } = nuevaHoja(libro, d, 'Calendario', 'Calendario de obligaciones', [14, 46, 12, 16, 60], { horizontal: true });
    let n = cabecera(hoja, siguiente, ['Vencimiento', 'Obligación', 'Estado', 'Monto (B/.)', 'Observación'], ['left', 'left', 'left', 'right', 'left']);
    hoja.views = [{ showGridLines: false, state: 'frozen', ySplit: siguiente }];
    hoja.pageSetup.printTitlesRow = `${siguiente}:${siguiente}`;
    for (const p of cal.pagos) {
      n = filaDatos(hoja, n, [p.fecha || 'Según inscripción', p.concepto, ESTADOS[p.estado], p.monto, p.nota || ''], p.estado === 'vencida' ? 'tenue' : '');
    }
    filaDatos(hoja, n, [`Total a pagar hasta el 31 de marzo de ${anio + 1}`, '', '', cal.totalHastaDeclaracion, ''], 'final');
    hoja.mergeCells(n, 1, n, 3);
    // La observación va separada del monto, que está alineado a la derecha.
    hoja.getColumn(5).eachCell((c, fila) => { if (fila >= siguiente) c.alignment = { ...c.alignment, horizontal: 'left', indent: 2 }; });
  }

  // Determinación del impuesto
  {
    const columnas = proyectado ? [corte, cierre] : [corte];
    const { hoja, siguiente } = nuevaHoja(libro, d, 'Determinación', 'Determinación del impuesto', [56, 20, 20]);
    let n = cabecera(hoja, siguiente, ['Concepto', `Al ${new Date(Date.UTC(anio, mesCorte, 0)).getUTCDate()} de ${mes}\n(real)`, ...(proyectado ? ['Al 31 de diciembre\n(proyectado)'] : [])]);
    hoja.views = [{ showGridLines: false, state: 'frozen', ySplit: siguiente }];
    hoja.pageSetup.printTitlesRow = `${siguiente}:${siguiente}`;
    for (const [nombre, f, clase] of filas) {
      if (!f) n = filaDatos(hoja, n, [nombre.toUpperCase(), ...columnas.map(() => '')], 'seccion');
      else n = filaDatos(hoja, n, [nombre, ...columnas.map((e) => f(e.resultado))], clase === 'total' ? 'total' : clase === 'destacado' ? 'final' : '');
    }
  }

  // Base de la proyección
  const faltan = escenarios.length - 1;
  if (faltan) {
    const meses = MESES.slice(mesCorte, mesCorte + faltan).map((m) => `${m[0].toUpperCase()}${m.slice(1, 3)}\n(proyectado)`);
    const { hoja, siguiente } = nuevaHoja(libro, d, 'Proyección', 'Base de la proyección', [26, 16, 16, ...meses.map(() => 15), 17], { horizontal: true });
    let n = parrafo(hoja, siguiente, `Cada mes restante suma el promedio mensual de enero a ${mes}${crecimiento ? `, ajustado en ${(crecimiento * 100).toFixed(1).replace('.', ',')} %` : ''}. Las cuentas de balance se mantienen como están al corte.`, 4 + faltan, { alto: 30, tamano: 9, color: GRIS });
    n = cabecera(hoja, n + 1, ['Concepto', `Real\nene–${mes.slice(0, 3)}`, 'Promedio\nmensual', ...meses, 'Total del año']);
    const lineas = [
      ['Ingresos gravables', (r) => r.ingresos.ingresosGravables],
      ['Costos', (r) => r.costosGastos.costos],
      ['Gastos deducibles', (r) => r.costosGastos.totalDeducibles - r.costosGastos.costos],
      ['Renta neta gravable', (r) => r.renta.rentaNetaGravable, 'total'],
    ];
    for (const [nombre, f, tipo] of lineas) {
      const real = f(corte.resultado);
      const total = f(cierre.resultado);
      n = filaDatos(hoja, n, [nombre, real, real / mesCorte, ...Array(faltan).fill((total - real) / faltan), total], tipo || '');
    }
  }

  // Cuentas del balance y su clasificación (los cálculos viejos guardados no traen este detalle)
  if (corte.resultado.detalle) {
    const { hoja, siguiente } = nuevaHoja(libro, d, 'Cuentas', 'Cuentas del balance de prueba', [30, 12, 46, 18, ...(proyectado ? [18] : [])]);
    let n = cabecera(hoja, siguiente, ['Clasificación', 'Código', 'Cuenta', 'Al corte', ...(proyectado ? ['Al cierre'] : [])], ['left', 'left', 'left', 'right', 'right']);
    hoja.views = [{ showGridLines: false, state: 'frozen', ySplit: siguiente }];
    hoja.pageSetup.printTitlesRow = `${siguiente}:${siguiente}`;
    hoja.autoFilter = { from: { row: siguiente, column: 1 }, to: { row: siguiente, column: proyectado ? 5 : 4 } };
    const alCierre = new Map();
    for (const [concepto, cuentas] of Object.entries(cierre.resultado.detalle || {})) {
      for (const c of cuentas) alCierre.set(`${concepto}|${c.codigo}|${c.nombre}`, c.valor);
    }
    for (const [concepto, lista] of Object.entries(corte.resultado.detalle)) {
      for (const c of lista) {
        n = filaDatos(hoja, n, [CONCEPTOS[concepto] || concepto, c.codigo, c.nombre, c.valor,
          ...(proyectado ? [alCierre.get(`${concepto}|${c.codigo}|${c.nombre}`) ?? c.valor] : [])]);
      }
    }
  }
  return libro;
}

// ExcelJS pesa cerca de 1 MB: se carga la primera vez que alguien exporta.
let cargando = null;
export function cargarExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  cargando ||= new Promise((ok, mal) => {
    const script = Object.assign(document.createElement('script'), { src: 'vendor/exceljs/exceljs.min.js' });
    script.onload = () => ok(window.ExcelJS);
    script.onerror = () => {
      cargando = null;
      mal(new Error('No pude cargar el generador de Excel. Recarga la página con Ctrl+F5 y vuelve a intentar.'));
    };
    document.head.append(script);
  });
  return cargando;
}

// Descarga el libro con un enlace propio: así el archivo conserva su nombre en todos los navegadores.
export async function descargarLibro(libro, nombre) {
  const datos = await libro.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const enlace = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

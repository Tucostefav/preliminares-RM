import { buscarHojaBalance, leerTotalesReportados, aNumero } from './lector.js';
import { proyectar } from './proyeccion.js';
import { PLANES_DE_CUENTAS, PARAMETROS_2026 } from './config.js';
import { lineasDePdf, leerDeclaracion } from './declaracion.js';
import { calendarioDePagos, analizarCAIR } from './calendario.js';
import { api, cargarSesion } from './sesion.js';

const $ = (id) => document.getElementById(id);
const numero = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balboas = (v) => `B/. ${numero.format(v)}`;
let hojas = null; // hojas del libro cargado: [{ nombre, filas }]
let declaracion = null; // datos leídos del PDF de la declaración anterior
let ultimo = null; // último cálculo mostrado, para guardarlo en el historial

const FILAS = [
  ['Patrimonio', null],
  ['Efectivo y bancos', (r) => r.patrimonio.efectivo],
  ['Inversiones', (r) => r.patrimonio.inversiones],
  ['Cuentas por cobrar', (r) => r.patrimonio.cuentasPorCobrar],
  ['Impuesto estimado pagado', (r) => r.patrimonio.impuestoEstimadoPagado],
  ['Inventarios', (r) => r.patrimonio.inventarios],
  ['Propiedad, planta y equipo (neto)', (r) => r.patrimonio.propiedadesPlantaEquipo],
  ['Intangibles', (r) => r.patrimonio.intangibles],
  ['Otros activos', (r) => r.patrimonio.otrosActivos],
  ['Total activos', (r) => r.patrimonio.totalActivos, 'total'],
  ['Pasivos', (r) => r.patrimonio.pasivos],
  ['Patrimonio neto', (r) => r.patrimonio.patrimonioNeto, 'total'],
  ['Ingresos', null],
  ['Ingresos de operación', (r) => r.ingresos.ingresosOperacion],
  ['Ingresos financieros', (r) => r.ingresos.ingresosFinancieros],
  ['Otros ingresos', (r) => r.ingresos.otrosIngresos],
  ['Total ingresos brutos', (r) => r.ingresos.ingresosBrutos, 'total'],
  ['Devoluciones y descuentos', (r) => r.ingresos.devoluciones],
  ['Ingresos exentos, no gravables o extranjeros', (r) => r.ingresos.ingresosExentos],
  ['Ingresos gravables', (r) => r.ingresos.ingresosGravables, 'total'],
  ['Costos y gastos deducibles', null],
  ['Costos', (r) => r.costosGastos.costos],
  ['Gastos generales y administrativos', (r) => r.costosGastos.gastosGenerales],
  ['Depreciación y amortización', (r) => r.costosGastos.depreciacion],
  ['Gastos financieros', (r) => r.costosGastos.gastosFinancieros],
  ['Menos: costos y gastos de ingresos exentos o extranjeros', (r) => r.costosGastos.costosGastosExentos],
  ['Total costos y gastos deducibles', (r) => r.costosGastos.totalDeducibles, 'total'],
  ['Gastos no deducibles (excluidos)', (r) => r.costosGastos.totalNoDeducibles],
  ['Renta gravable', null],
  ['Renta neta gravable', (r) => r.renta.rentaNetaGravable],
  ['Pérdida del periodo', (r) => r.renta.perdida],
  ['Arrastre de pérdidas', (r) => r.renta.arrastrePerdidas],
  ['Renta gravable, método normal', (r) => r.renta.rentaGravableNormal],
  ['Renta gravable, CAIR (4,67 % de ingresos)', (r) => r.renta.rentaGravableCAIR],
  ['Renta gravable', (r) => r.renta.rentaGravable, 'total'],
  ['Liquidación', null],
  ['Impuesto causado', (r) => r.liquidacion.impuestoCausado, 'total'],
  ['Impuesto estimado pagado', (r) => r.liquidacion.estimadoPagado],
  ['Retenciones y créditos', (r) => r.liquidacion.retenciones],
  ['Saldo a favor del año anterior', (r) => r.liquidacion.saldoAFavorAnterior],
  ['Impuesto por pagar', (r) => r.liquidacion.saldoAPagar, 'destacado'],
  ['Saldo a favor', (r) => r.liquidacion.saldoAFavor, 'total'],
  ['Otros tributos a prever', null],
  ['Impuesto complementario (10 % sobre el 40 % de la utilidad)', (r) => r.otros.impuestoComplementario],
  ['Impuesto de aviso de operación (2 % del patrimonio)', (r) => r.otros.avisoOperacion],
];

// Los CSV exportados por programas contables suelen venir en Windows-1252.
async function leerLibro(archivo) {
  const bytes = await archivo.arrayBuffer();
  if (!/\.(csv|txt)$/i.test(archivo.name)) return XLSX.read(bytes, { type: 'array' });
  let texto = new TextDecoder('utf-8').decode(bytes);
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(bytes);
  return XLSX.read(texto, { type: 'string' });
}

const plan = () => PLANES_DE_CUENTAS[$('plan').value];

function mostrarEstado(texto, ok, id = 'estadoBalance') {
  $(id).textContent = texto;
  $(id).className = `estado ${ok ? 'ok' : 'error'}`;
  $(id).closest('.zona').classList.toggle('lista', ok);
}

// Las zonas de archivo aceptan arrastrar y soltar: el input cubre toda la zona, solo falta el resaltado.
for (const zona of document.querySelectorAll('[data-zona]')) {
  zona.addEventListener('dragenter', () => zona.classList.add('arrastrando'));
  for (const ev of ['dragleave', 'drop']) zona.addEventListener(ev, () => zona.classList.remove('arrastrando'));
}

$('archivoBalance').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    const libro = await leerLibro(archivo);
    hojas = libro.SheetNames.map((nombre) => ({ nombre, filas: XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1, defval: '' }) }));
    const { nombre, cuentas } = buscarHojaBalance(hojas, plan());
    const otras = hojas.length > 1 ? ` (hoja "${nombre}")` : '';
    mostrarEstado(`Leí ${cuentas.length} cuentas del balance de prueba de "${archivo.name}"${otras}.`, true);
  } catch (err) {
    hojas = null;
    mostrarEstado(err.message, false);
  }
});

// Declaración del año anterior en PDF: pdf.js se carga solo cuando se necesita.
async function cargarPdfjs() {
  let pdfjs;
  try {
    pdfjs = await import('../vendor/pdfjs/pdf.min.js');
  } catch (err) {
    console.error(err);
    throw new Error('No pude cargar el lector de PDF desde el servidor. Recarga la página con Ctrl+F5 y vuelve a intentar.');
  }
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.js', import.meta.url).href;
  return pdfjs;
}

const moneda = (v) => (v ? balboas(v) : '—');

$('archivoDeclaracion').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const estado = $('estadoDeclaracion');
  try {
    estado.textContent = 'Leyendo la declaración…';
    estado.className = 'estado';
    const pdfjs = await cargarPdfjs();
    declaracion = leerDeclaracion(await lineasDePdf(pdfjs, new Uint8Array(await archivo.arrayBuffer())));
    const d = declaracion;
    const llenar = (id, valor) => {
      $(id).value = valor ? String(Math.round(valor * 100) / 100) : '';
      $(id).classList.add('leido');
    };
    llenar('impuestoEstimado', d.paraLiquidar.impuestoEstimado);
    llenar('saldoAFavor', d.paraLiquidar.saldoAFavor);
    llenar('arrastrePerdidas', d.paraLiquidar.arrastrePerdidas);
    $('tarifa').value = String(d.tarifa * 100);
    $('noAplicarCAIR').checked = d.aprobacionNoCAIR;
    if (!$('cliente').value.trim() && d.razonSocial) $('cliente').value = d.razonSocial;
    if (!$('ruc').value.trim() && d.ruc) $('ruc').value = d.dv ? `${d.ruc} DV ${d.dv}` : d.ruc;

    const s = d.resumen;
    $('resumenDeclaracion').innerHTML = `
      <strong>${escapar(d.razonSocial || 'Declaración')} · periodo ${d.periodo || '¿?'} · tarifa ${d.tarifa * 100} %</strong>
      <dl>
        <div><dt>Ingresos gravables</dt><dd>${moneda(s.ingresosGravables)}</dd></div>
        <div><dt>Costos deducibles</dt><dd>${moneda(s.costosDeducibles)}</dd></div>
        <div><dt>Gastos deducibles</dt><dd>${moneda(s.gastosDeducibles)}</dd></div>
        <div><dt>Renta neta gravable</dt><dd>${moneda(s.rentaNetaGravable)}</dd></div>
        <div><dt>Impuesto causado</dt><dd>${moneda(s.impuestoCausado)}</dd></div>
        <div><dt>Impuesto a pagar / a favor</dt><dd>${s.impuestoAFavor ? `${moneda(s.impuestoAFavor)} a favor` : moneda(s.impuestoAPagar)}</dd></div>
        <div><dt>Estimado para el año siguiente</dt><dd>${moneda(s.impuestoEstimado)}</dd></div>
        <div><dt>Partidas (jun, sep, dic)</dt><dd>${s.partidas.map(moneda).join(' · ')}</dd></div>
        <div><dt>Impuesto complementario</dt><dd>${moneda(s.impuestoComplementario)}</dd></div>
        <div><dt>Aviso de operación</dt><dd>${moneda(s.avisoOperacion)}</dd></div>
        <div><dt>Ingresos exentos o extranjeros</dt><dd>${moneda(s.ingresosExentosYExtranjeros)}</dd></div>
        <div><dt>Costos y gastos excluidos</dt><dd>${moneda(s.costosExentosYExtranjeros + s.gastosExcluidos)}</dd></div>
      </dl>
      ${d.avisos.map((a) => `<p class="aviso">${escapar(a)}</p>`).join('')}`;
    $('resumenDeclaracion').classList.remove('oculto');
    mostrarEstado(`Leí ${Object.keys(d.renglones).length} renglones de "${archivo.name}" y llené los datos de abajo.`, true, 'estadoDeclaracion');
    $('datosAnteriores').open = true;
  } catch (err) {
    declaracion = null;
    $('resumenDeclaracion').classList.add('oculto');
    mostrarEstado(err.message, false, 'estadoDeclaracion');
  }
});

const dinero = (id) => aNumero($(id).value);
const dineroOpcional = (id) => ($(id).value.trim() ? aNumero($(id).value) : undefined);

$('calcular').addEventListener('click', () => {
  if (!hojas) return mostrarEstado('Primero carga el balance de prueba.', false);
  const anterior = {
    impuestoEstimado: dineroOpcional('impuestoEstimado'),
    estimadoPagado: dineroOpcional('estimadoPagado'),
    saldoAFavor: dinero('saldoAFavor'),
    arrastrePerdidas: dinero('arrastrePerdidas'),
    noAplicarCAIR: $('noAplicarCAIR').checked,
    tarifa: Number($('tarifa').value || 25) / 100,
    partidas: declaracion?.resumen.partidas,
  };
  const ajustes = Object.fromEntries(['ingresosExentos', 'costosGastosExentos', 'otrosNoDeducibles', 'retenciones'].map((k) => [k, dinero(k)]));
  ajustes.interesesExentos = $('interesesExentos').checked;
  const opciones = { mesCorte: Number($('mesCorte').value), crecimiento: Number($('crecimiento').value || 0) / 100 };
  const { nombre, cuentas } = buscarHojaBalance(hojas, plan());
  const escenarios = proyectar(cuentas, anterior, ajustes, { ...opciones, mesesAProyectar: 12 - opciones.mesCorte, plan: plan() });
  const cuadre = cuadrar(leerTotalesReportados(hojas, nombre), escenarios[0].resultado);
  const anio = declaracion?.periodo ? declaracion.periodo + 1 : new Date().getFullYear();
  ultimo = { anterior, ajustes, ...opciones, anio, plan: $('plan').value, escenarios, cuadre, declaracionAnterior: declaracion?.resumen };
  mostrar(escenarios, cuadre, declaracion?.resumen, { anio, mesCorte: opciones.mesCorte, crecimiento: opciones.crecimiento, anterior });
});

// Compara los totales del balance general y del estado de resultados con lo que da el balance de prueba.
function cuadrar(reportados, r) {
  const calculados = { totalActivos: r.patrimonio.totalActivos, utilidadContable: r.costosGastos.utilidadContable };
  const nombres = { totalActivos: 'Total de activos', utilidadContable: 'Utilidad neta' };
  return Object.entries(reportados).map(([clave, { valor, hoja }]) => ({
    nombre: nombres[clave], hoja, reportado: valor, calculado: calculados[clave], cuadra: Math.abs(valor - calculados[clave]) < 1,
  }));
}

$('plan').addEventListener('change', () => {
  if (!hojas) return;
  try {
    mostrarEstado(`Leí ${buscarHojaBalance(hojas, plan()).cuentas.length} cuentas del balance de prueba.`, true);
  } catch (err) {
    mostrarEstado(err.message, false);
  }
});

const fechaLarga = (f) => (f ? f.toLocaleDateString('es-PA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Según inscripción');
const ESTADOS = { vencida: 'Vencida', pendiente: 'Por pagar', proyectado: 'Proyectado', anual: 'Anual' };
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const monto = (v) => `<span class="cifra-monto"><small>B/.</small>${numero.format(Math.abs(v))}</span>`;

// Nombre corto de cada pago para la línea de tiempo.
function conceptoCorto(concepto) {
  const partida = concepto.match(/^(\d)\.ª partida del impuesto estimado (\d+)/);
  if (partida) return `${partida[1]}.ª partida ${partida[2]}`;
  const saldo = concepto.match(/^Saldo del impuesto sobre la renta (\d+)/);
  if (saldo) return `Saldo ISR ${saldo[1]}`;
  if (/aviso de operación/i.test(concepto)) return 'Aviso de operación';
  if (/complementario/i.test(concepto)) return 'Complementario';
  return concepto;
}

// Línea de pagos: un eje de junio del año en curso a diciembre del siguiente, con una marca por fecha
// de pago cuyo tamaño es proporcional al monto.
function lineaDePagos(cal, { anio, mesCorte, saldoAFavor }) {
  const ancho = 1000;
  const eje = 176;
  const inicio = Date.UTC(anio, 5, 1);
  const fin = Date.UTC(anio + 1, 11, 31);
  const x = (t) => 64 + ((t - inicio) / (fin - inicio)) * (ancho - 128);
  const corte = Date.UTC(anio, mesCorte, 0);

  const grupos = new Map();
  for (const p of cal.pagos) {
    if (!p.fecha) continue;
    const t = p.fecha.getTime();
    if (!grupos.has(t)) grupos.set(t, []);
    grupos.get(t).push(p);
  }
  const maximo = Math.max(...[...grupos.values()].map((g) => g.reduce((s, p) => s + p.monto, 0)), 1);

  let svg = `<line class="eje" x1="${x(inicio)}" y1="${eje}" x2="${x(fin)}" y2="${eje}"/>`;
  svg += `<line class="tramo-pasado" x1="${x(inicio)}" y1="${eje}" x2="${x(corte)}" y2="${eje}"/>`;
  for (let m = 0; m < 19; m++) {
    const t = Date.UTC(anio, 5 + m, 1);
    const mes = new Date(t).getUTCMonth();
    const xm = x(t);
    svg += `<line class="tick" x1="${xm}" y1="${eje - 3}" x2="${xm}" y2="${eje + 3}"/>`;
    svg += `<text class="mes" x="${xm + 4}" y="${eje + 22}">${MESES_CORTOS[mes]}</text>`;
    if (m === 0 || mes === 0) svg += `<text class="anio" x="${xm + 4}" y="${eje + 38}">${new Date(t).getUTCFullYear()}</text>`;
  }
  svg += `<line class="hoy-linea" x1="${x(corte)}" y1="${eje + 14}" x2="${x(corte)}" y2="${eje + 44}"/>`;
  svg += `<text class="hoy-texto" x="${x(corte) + 6}" y="${eje + 42}">CORTE</text>`;

  for (const [t, pagos] of grupos) {
    const total = pagos.reduce((s, p) => s + p.monto, 0);
    const proximo = pagos.includes(cal.proximo);
    const clase = proximo ? 'proximo' : pagos[0].estado;
    const r = 3.5 + 10 * Math.sqrt(total / maximo);
    const xp = x(t);
    const alto = 62;
    let g = `<line class="tallo" x1="${xp}" y1="${eje}" x2="${xp}" y2="${eje - alto}"/>`;
    if (proximo) g += `<circle class="halo" cx="${xp}" cy="${eje}" r="${r + 7}"/>`;
    g += `<circle cx="${xp}" cy="${eje}" r="${r}"/>`;
    pagos.forEach((p, i) => {
      const y = eje - alto - 10 - (pagos.length - 1 - i) * 38;
      const cifra = p.monto || !saldoAFavor || !/^Saldo/.test(p.concepto) ? `B/. ${numero.format(p.monto)}` : `${numero.format(saldoAFavor)} a favor`;
      g += `<text class="monto" x="${xp}" y="${y - 14}" text-anchor="middle">${cifra}</text>`;
      g += `<text class="concepto" x="${xp}" y="${y}" text-anchor="middle">${escapar(conceptoCorto(p.concepto))}</text>`;
    });
    svg += `<g class="${clase}">${g}</g>`;
  }
  const resumen = cal.pagos.filter((p) => p.fecha).map((p) => `${fechaLarga(p.fecha)}: ${p.concepto}, ${balboas(p.monto)}`).join('; ');
  return `<svg viewBox="0 0 ${ancho} 236" role="img" aria-label="${escapar(resumen)}">${svg}</svg>`;
}

function mostrar(escenarios, cuadre = [], anteriorDeclarado = null, contexto = {}) {
  const actual = escenarios[0].resultado.liquidacion;
  const cierre = escenarios[escenarios.length - 1];
  const neto = (l) => l.saldoAPagar || -l.saldoAFavor;
  const lc = cierre.resultado.liquidacion;
  const anio = contexto.anio || new Date().getFullYear();
  const mesCorte = contexto.mesCorte || 9;
  const anterior = contexto.anterior || {};
  // El calendario solo tiene sentido con la proyección al 31 de diciembre.
  const alCierre = cierre.mes === 'Diciembre';
  const cal = alCierre ? calendarioDePagos(cierre.resultado, { anio, mesCorte, anterior }) : null;
  const cair = analizarCAIR(cierre.resultado, undefined, anterior.tarifa);
  const corte = escenarios[0];

  $('cabeceraCliente').textContent = $('cliente').value.trim() || 'Cliente sin nombre';
  $('cabeceraMeta').textContent = [$('ruc').value.trim() && `RUC ${$('ruc').value.trim()}`, `Corte ${corte.mes.toLowerCase()} ${anio}`, 'Proyectado al 31 dic']
    .filter(Boolean).join(' · ');

  const etiqueta = (v) => (v < 0 ? '<span class="etiqueta favor">A favor</span>' : '<span class="etiqueta pagar">Por pagar</span>');
  $('resumen').innerHTML = `
    <div class="cifra"><p class="rotulo">Si declarara hoy</p>${monto(neto(actual))}
      <p class="cifra-pie">${etiqueta(neto(actual))} ISR de enero a ${corte.mes.toLowerCase()}</p></div>
    <div class="cifra"><p class="rotulo">Al cierre del año</p>${monto(neto(lc))}
      <p class="cifra-pie">${etiqueta(neto(lc))} Proyectado a diciembre</p></div>
    ${cal ? `<div class="cifra destacada"><p class="rotulo">Por pagar al 31 mar ${anio + 1}</p>${monto(cal.totalHastaDeclaracion)}
      <p class="cifra-pie">${cal.proximo ? `Próximo: ${fechaLarga(cal.proximo.fecha)} · ${balboas(cal.proximo.monto)}` : 'Sin pagos pendientes'}</p></div>` : ''}`;

  $('linea').innerHTML = cal ? lineaDePagos(cal, { anio, mesCorte, saldoAFavor: lc.saldoAFavor }) : '';
  $('calendario').innerHTML = cal
    ? `<div class="tabla-contenedor"><table>
        <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>Nota</th></tr></thead>
        <tbody>${cal.pagos.map((x) => `<tr class="estado-${x.estado}"><td>${fechaLarga(x.fecha)}</td><td>${escapar(x.concepto)}</td>
          <td>${balboas(x.monto)}</td><td><span class="punto ${x.estado}">${ESTADOS[x.estado]}</span></td><td class="nota">${escapar(x.nota)}</td></tr>`).join('')}</tbody>
      </table></div>`
    : '<p class="ayuda">El calendario de pagos se arma cuando la proyección llega a diciembre.</p>';

  const SELLOS = { no: 'No le aplica', riesgo: 'Riesgo', si: 'Le aplica', neutro: 'No cambia el impuesto' };
  const avance = Math.min(100, (cair.ingresos / PARAMETROS_2026.cairUmbral) * 100);
  const pct = (v) => `${(v * 100).toFixed(2).replace('.', ',')} %`;
  $('cair').innerHTML = `
    <div class="panel-cab"><h2>Cálculo alterno (CAIR)</h2><p class="panel-sub">Obligatorio con ingresos gravables sobre B/. 1.500.000</p></div>
    <div class="veredicto">
      <div class="veredicto-cab"><span class="sello-estado ${cair.nivel}">${SELLOS[cair.nivel]}</span>
        <span class="rotulo">Margen fiscal ${pct(cair.margen)} · mínimo 4,67 %</span></div>
      <div class="medidor ${cair.nivel}" role="img" aria-label="Ingresos proyectados al ${avance.toFixed(0)} % del umbral"><span style="width:${avance}%"></span></div>
      <div class="medidor-pie"><span>${balboas(cair.ingresos)}</span><span>Umbral ${balboas(PARAMETROS_2026.cairUmbral)}</span></div>
      <p>${escapar(cair.conclusion)}</p>
    </div>`;

  $('cuadre').innerHTML = `
    <div class="panel-cab"><h2>Cuadre con los estados</h2><p class="panel-sub">El balance de prueba contra el balance general y los resultados</p></div>
    ${cuadre.length
      ? `<ul class="lista-cuadre">${cuadre.map((c) => `<li><span>${c.nombre}</span>
          <span class="sello-estado ${c.cuadra ? 'ok' : 'error'}">${c.cuadra ? 'Cuadra' : 'No cuadra'}</span>
          <span class="detalle">${balboas(c.calculado)} calculado · ${balboas(c.reportado)} en "${escapar(c.hoja)}"</span></li>`).join('')}
          <li><span>Partidas del estimado vencidas al corte</span><span class="sello-estado neutro">${corte.resultado.liquidacion.partidasVencidas} de 3</span></li></ul>`
      : `<p class="ayuda">El libro no trae balance general ni estado de resultados para cuadrar. Partidas del estimado vencidas al corte: ${corte.resultado.liquidacion.partidasVencidas} de 3.</p>`}`;

  // Solo dos columnas: lo real al corte (si declarara hoy) y lo proyectado al 31 de diciembre.
  const columnas = [
    { titulo: `Al corte, ene–${corte.mes.slice(0, 3).toLowerCase()}`, sub: 'real, si declarara hoy', resultado: corte.resultado },
    ...(escenarios.length > 1 ? [{ titulo: `Al cierre, ene–${cierre.mes.slice(0, 3).toLowerCase()}`, sub: 'proyectado', resultado: cierre.resultado }] : []),
  ];
  const cab = `<thead><tr><th>Concepto</th>${columnas.map((c) => `<th>${c.titulo}<small>${c.sub}</small></th>`).join('')}</tr></thead>`;
  const cuerpo = FILAS.map(([nombre, f, clase]) =>
    f
      ? `<tr class="${clase || ''}"><td>${nombre}</td>${columnas.map((c) => `<td>${balboas(f(c.resultado))}</td>`).join('')}</tr>`
      : `<tr class="seccion"><td colspan="${columnas.length + 1}">${nombre}</td></tr>`,
  ).join('');
  $('tabla').innerHTML = cab + `<tbody>${cuerpo}</tbody>`;

  // Base de la proyección: promedio mensual de los meses reales y lo que se suma por cada mes que falta.
  const mesesFaltan = escenarios.length - 1;
  const lineas = [
    ['Ingresos gravables', (r) => r.ingresos.ingresosGravables],
    ['Costos', (r) => r.costosGastos.costos],
    ['Gastos deducibles', (r) => r.costosGastos.totalDeducibles - r.costosGastos.costos],
    ['Renta neta gravable', (r) => r.renta.rentaNetaGravable, 'total'],
  ];
  $('base').innerHTML = mesesFaltan
    ? `<div class="panel-cab"><h2>Base de la proyección</h2>
        <p class="panel-sub">Cada mes que falta suma el promedio mensual de enero a ${corte.mes.toLowerCase()}${contexto.crecimiento ? `, ajustado ${(contexto.crecimiento * 100).toFixed(1)} %` : ''}.</p></div>
      <div class="tabla-contenedor"><table class="tabla">
        <thead><tr><th>Concepto</th><th>Real ene–${MESES_CORTOS[mesCorte - 1]}</th><th>Promedio mensual</th>
          ${MESES_CORTOS.slice(mesCorte, mesCorte + mesesFaltan).map((m) => `<th>${m}<small>proyectado</small></th>`).join('')}<th>Total año</th></tr></thead>
        <tbody>${lineas.map(([nombre, f, clase]) => {
          const real = f(corte.resultado);
          const total = f(cierre.resultado);
          const porMes = (total - real) / mesesFaltan;
          return `<tr class="${clase || ''}"><td>${nombre}</td><td>${balboas(real)}</td><td>${balboas(real / mesCorte)}</td>
            ${Array.from({ length: mesesFaltan }, () => `<td>${balboas(porMes)}</td>`).join('')}<td>${balboas(total)}</td></tr>`;
        }).join('')}</tbody>
      </table></div>`
    : '';
  $('base').classList.toggle('oculto', !mesesFaltan);

  const r = corte.resultado;
  const cr = cierre.resultado;
  $('notas').innerHTML = `
    <h3>Notas del cálculo</h3>
    <ul>
      ${anteriorDeclarado ? `<li>Frente al año anterior: ingresos gravables ${balboas(anteriorDeclarado.ingresosGravables)} declarados contra ${balboas(cr.ingresos.ingresosGravables)} proyectados; impuesto causado ${balboas(anteriorDeclarado.impuestoCausado)} contra ${balboas(cr.liquidacion.impuestoCausado)}.</li>` : ''}
      ${r.noDeducibles.length ? `<li>Gastos excluidos por no deducibles: ${r.noDeducibles.map((n) => `${n.codigo} ${escapar(n.nombre)} (${balboas(n.monto)})`).join('; ')}.</li>` : ''}
      <li>El impuesto complementario y el de aviso de operación no se suman al impuesto sobre la renta, pero sí están en la línea de pagos.</li>
      <li>La proyección suma, por cada mes que falta, el promedio mensual de los meses reales en ingresos, costos, gastos y ajustes; las cuentas de balance quedan como están al corte.</li>
      <li>Es un cálculo preliminar para planeación y no reemplaza la declaración jurada definitiva.</li>
    </ul>`;
  if ($('guardar').dataset.disponible && ultimo) {
    $('guardar').classList.remove('oculto');
    $('guardar').textContent = 'Guardar en el historial';
  }
  $('vacio').classList.add('oculto');
  $('resultados').classList.remove('oculto');
  // En escritorio los resultados ya están a la vista; en celular quedan debajo del formulario.
  if ($('resultados').getBoundingClientRect().top > window.innerHeight * 0.6) {
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $('resultados').scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
  }
}

$('imprimir').addEventListener('click', () => window.print());
window.addEventListener('beforeprint', () => { $('declaracionCompleta').open = true; });

// Historial en la base de datos (solo si el servidor la tiene configurada)

async function cargarHistorial() {
  const calculos = await api('/api/calculos');
  // Se guarda impuesto por pagar menos saldo a favor: negativo es a favor.
  const neto = (v) => (v < 0 ? `${balboas(-v)}<small>a favor</small>` : `${balboas(v)}<small>por pagar</small>`);
  const meses = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  $('tablaHistorial').innerHTML = calculos.length
    ? `<thead><tr><th>Cliente</th><th>Corte</th><th>Al corte</th><th>Al cierre</th><th>Guardado</th><th></th></tr></thead><tbody>${calculos
        .map((c) => `<tr><td><strong>${escapar(c.cliente)}</strong><small>${escapar(c.ruc)}</small></td><td>${meses[c.mesCorte]} ${c.anio}</td>
          <td>${neto(Number(c.impuestoHoy))}</td><td>${neto(Number(c.impuestoCierre))}</td>
          <td>${new Date(c.creado).toLocaleDateString('es-PA')}<small>${escapar(c.usuario || '—')}</small></td>
          <td><button class="boton-sec" data-ver="${c.id}">Ver</button> <button class="boton-sec" data-borrar="${c.id}">Borrar</button></td></tr>`)
        .join('')}</tbody>`
    : '<tbody><tr><td>Todavía no hay cálculos guardados.</td></tr></tbody>';
}

const escapar = (t) => String(t).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

$('tablaHistorial').addEventListener('click', async (e) => {
  const ver = e.target.dataset.ver;
  const borrar = e.target.dataset.borrar;
  try {
    if (ver) {
      const calculo = await api(`/api/calculos/${ver}`);
      $('cliente').value = calculo.cliente;
      $('ruc').value = calculo.ruc;
      ultimo = null;
      $('guardar').classList.add('oculto');
      mostrar(calculo.datos.escenarios, calculo.datos.cuadre, calculo.datos.declaracionAnterior, {
        anio: calculo.datos.anio || calculo.anio, mesCorte: calculo.datos.mesCorte, crecimiento: calculo.datos.crecimiento, anterior: calculo.datos.anterior,
      });
    } else if (borrar && confirm('¿Borrar este cálculo del historial?')) {
      await api(`/api/calculos/${borrar}`, { method: 'DELETE' });
      await cargarHistorial();
    }
  } catch (err) {
    alert(err.message);
  }
});

$('guardar').addEventListener('click', async () => {
  if (!ultimo) return;
  if (!$('cliente').value.trim() || !$('ruc').value.trim()) return alert('Escribe el nombre y el RUC del cliente para guardar.');
  const { escenarios } = ultimo;
  const neto = (l) => l.saldoAPagar - l.saldoAFavor;
  try {
    await api('/api/calculos', {
      method: 'POST',
      body: JSON.stringify({
        cliente: $('cliente').value,
        ruc: $('ruc').value,
        anio: new Date().getFullYear(),
        mesCorte: ultimo.mesCorte,
        impuestoHoy: neto(escenarios[0].resultado.liquidacion),
        impuestoCierre: neto(escenarios[escenarios.length - 1].resultado.liquidacion),
        // Se guarda el resultado sin el detalle cuenta por cuenta
        datos: { ...ultimo, escenarios: escenarios.map((e) => ({ ...e, resultado: { ...e.resultado, detalle: undefined } })) },
      }),
    });
    $('guardar').textContent = 'Guardado';
    await cargarHistorial();
  } catch (err) {
    alert(`No se pudo guardar: ${err.message}`);
  }
});

cargarSesion()
  .then(async ({ baseDeDatos }) => {
    if (!baseDeDatos) return;
    $('historial').classList.remove('oculto');
    $('irHistorial').classList.remove('oculto');
    $('guardar').dataset.disponible = 'si';
    await cargarHistorial();
  })
  .catch(() => {}); // abierta como archivo estático, sin servidor

// Informe impreso (PDF) con formato de firma: membrete, secciones numeradas, pie de página y firmas.
// Se arma como HTML aparte de la pantalla de resultados y solo se ve al imprimir.

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ESTADOS = { vencida: 'Vencida', pendiente: 'Por pagar', proyectado: 'Proyectada', anual: 'Anual' };
const formato = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
// Convención contable: negativos entre paréntesis.
export const cifra = (v) => (v < 0 ? `(${formato.format(-v)})` : formato.format(v || 0));
const balboas = (v) => `B/. ${formato.format(Math.abs(v || 0))}`;
export const fechaLarga = (f) => `${f.getUTCDate()} de ${MESES[f.getUTCMonth()]} de ${f.getUTCFullYear()}`;
export const hoyLargo = () => {
  const h = new Date();
  return `${h.getDate()} de ${MESES[h.getMonth()]} de ${h.getFullYear()}`;
};
const pct = (x) => `${(x * 100).toFixed(2).replace('.', ',')} %`;
const neto = (l) => l.saldoAPagar - l.saldoAFavor;
const iniciales = (nombre) => String(nombre).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('');

function membrete(firma, titulo) {
  // El logo ya trae el nombre de la firma; sin logo se escribe el nombre junto a un monograma.
  const marca = firma.logo
    ? `<img class="inf-logo" src="${firma.logo}" alt="${escapar(firma.nombre)}">`
    : `<span class="inf-monograma">${escapar(iniciales(firma.nombre) || 'RM')}</span><div><strong>${escapar(firma.nombre)}</strong></div>`;
  return `
    <header class="inf-membrete">
      <div class="inf-firma">${marca}</div>
      <div class="inf-tipo"><span>${escapar(titulo)}</span><span>Emitido el ${hoyLargo()}</span>${firma.detalle ? `<em>${escapar(firma.detalle)}</em>` : ''}</div>
    </header>
    <div class="inf-franja" aria-hidden="true"></div>`;
}

function tabla(cabeceras, filas, clase = '') {
  return `<table class="inf-tabla ${clase}">
    <thead><tr>${cabeceras.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.join('')}</tbody></table>`;
}

// Resumen ejecutivo en tramos [texto, negrita], para el PDF y para el Excel (texto enriquecido).
export function segmentosDelResumen(d) {
  const { escenarios, cal, cliente } = d;
  const { anio, mesCorte, crecimiento = 0 } = d.contexto;
  const lc = escenarios[0].resultado.liquidacion;
  const ll = escenarios[escenarios.length - 1].resultado.liquidacion;
  const fechaCorte = new Date(Date.UTC(anio, mesCorte, 0));
  const sentido = (v) => (v < 0 ? 'saldo a favor' : 'impuesto por pagar');
  const s = [[`Con base en el balance de prueba al ${fechaLarga(fechaCorte)}, si ${cliente} presentara hoy su declaración jurada de rentas resultaría un ${sentido(neto(lc))} de `], [balboas(neto(lc)), true], ['.']];
  if (escenarios.length > 1) {
    const ajuste = crecimiento ? `, ajustado en ${(crecimiento * 100).toFixed(1).replace('.', ',')} %` : '';
    s.push([` Al proyectar los meses restantes con el promedio mensual de enero a ${MESES[mesCorte - 1]}${ajuste}, el impuesto causado del período fiscal ${anio} se estima en `], [balboas(ll.impuestoCausado), true],
      [`, con un ${sentido(neto(ll))} de `], [balboas(neto(ll)), true], [' al presentar la declaración.']);
  }
  if (cal) {
    s.push([` Entre la fecha de este informe y el 31 de marzo de ${anio + 1}, el contribuyente deberá cubrir obligaciones por `], [balboas(cal.totalHastaDeclaracion), true]);
    s.push([cal.proximo ? `; el próximo vencimiento es el ${fechaLarga(cal.proximo.fecha)}, por ${balboas(cal.proximo.monto)} (${cal.proximo.concepto.toLowerCase()}).` : '.']);
  }
  return s;
}

// Leyenda para las sociedades sin actividad comercial, que no pagan el impuesto de aviso de operación.
export const NO_OBLIGADO = 'No obligado';

export const ALCANCE = 'Este informe es una estimación preparada con fines de planificación fiscal, a partir del balance de prueba y de la declaración jurada de rentas del período anterior proporcionados por la administración del contribuyente, sin auditoría ni revisión independiente de esa información. Las cifras proyectadas suponen que los meses restantes del período se comportarán como el promedio de los meses transcurridos; los resultados reales pueden diferir. Los cálculos aplican la tarifa general del 25 %, el cálculo alterno (CAIR), el arrastre de pérdidas, el impuesto estimado, el impuesto complementario y el impuesto de aviso de operación conforme al Código Fiscal de la República de Panamá. Este documento no sustituye la declaración jurada de rentas ni constituye una opinión sobre los estados financieros.';

/**
 * @param {object} d  informe de la pantalla (escenarios, cal, cair, cuadre, filas, contexto, cliente, ruc, usuario)
 *                    más firma { nombre, detalle, logo } y borrador (true si el preliminar no está terminado)
 */
export function informeHtml(d) {
  const { escenarios, cal, cair, cuadre = [], filas, firma, cliente, ruc, usuario } = d;
  const { anio, mesCorte, crecimiento = 0 } = d.contexto;
  const corte = escenarios[0];
  const cierre = escenarios[escenarios.length - 1];
  const lc = corte.resultado.liquidacion;
  const ll = cierre.resultado.liquidacion;
  const fechaCorte = new Date(Date.UTC(anio, mesCorte, 0));
  const mes = MESES[mesCorte - 1];
  const proyectado = escenarios.length > 1;
  // Las secciones se numeran al final, en el orden en que quedan en el documento.
  const seccion = (titulo) => `<h2 class="inf-h2"><span>§.</span> ${titulo}</h2>`;

  // 1. Resumen ejecutivo
  const resumen = segmentosDelResumen(d).map(([t, negrita]) => (negrita ? `<strong>${escapar(t)}</strong>` : escapar(t))).join('');
  const cifras = [
    [`Impuesto sobre la renta al ${fechaLarga(fechaCorte)}`, neto(lc)],
    ...(proyectado ? [['Impuesto sobre la renta proyectado al 31 de diciembre', neto(ll)], ['Impuesto causado proyectado del período', ll.impuestoCausado]] : []),
    ['Impuesto complementario proyectado', cierre.resultado.otros.impuestoComplementario],
    ['Impuesto de aviso de operación proyectado', cierre.resultado.otros.avisoOperacion, cierre.resultado.otros.obligadoAviso === false ? NO_OBLIGADO : ''],
  ];
  const filasCifras = cifras.map(([concepto, v, nota], i) => {
    const conSentido = i < (proyectado ? 2 : 1);
    return `<tr><td>${concepto}</td><td class="inf-nota-celda">${conSentido ? (v < 0 ? 'A favor' : 'Por pagar') : (nota || '')}</td><td class="num">${formato.format(Math.abs(v))}</td></tr>`;
  });
  if (cal) filasCifras.push(`<tr class="inf-final"><td>Total de pagos hasta el 31 de marzo de ${anio + 1}</td><td></td><td class="num">${formato.format(cal.totalHastaDeclaracion)}</td></tr>`);

  // 2. Calendario de obligaciones
  const calendario = cal
    ? `<div class="inf-bloque">${seccion('Calendario de obligaciones fiscales')}
      <p class="inf-intro">Fechas de vencimiento según el Código Fiscal para personas jurídicas con período fiscal de año calendario.</p>
      ${tabla(['Vencimiento', 'Obligación', 'Estado', 'B/.'], [
        ...cal.pagos.map((p) => `<tr class="${p.estado === 'vencida' ? 'inf-tenue' : ''}">
          <td class="inf-fecha">${p.fecha ? fechaLarga(p.fecha) : 'Según inscripción'}</td>
          <td>${escapar(p.concepto)}${p.nota ? `<small>${escapar(p.nota)}</small>` : ''}</td>
          <td>${ESTADOS[p.estado]}</td><td class="num">${cifra(p.monto)}</td></tr>`),
        `<tr class="inf-final"><td colspan="3">Total a pagar hasta el 31 de marzo de ${anio + 1}</td><td class="num">${cifra(cal.totalHastaDeclaracion)}</td></tr>`,
      ], 'inf-calendario')}</div>`
    : '';

  // 3. Determinación del impuesto
  const columnas = proyectado ? [corte, cierre] : [corte];
  const determinacion = tabla(
    ['Concepto', `Al ${fechaCorte.getUTCDate()} de ${mes}<small>real</small>`, ...(proyectado ? [`Al 31 de diciembre<small>proyectado</small>`] : [])],
    filas.map(([nombre, f, clase]) => (f
      ? `<tr class="${clase === 'total' ? 'inf-total' : clase === 'destacado' ? 'inf-final' : ''}"><td>${nombre}</td>${columnas.map((e) => `<td class="num">${cifra(f(e.resultado))}</td>`).join('')}</tr>`
      : `<tr class="inf-seccion"><td colspan="${columnas.length + 1}">${nombre}</td></tr>`)),
    'inf-determinacion',
  );

  // 4. Base de la proyección
  let base = '';
  const faltan = escenarios.length - 1;
  if (faltan) {
    const lineas = [
      ['Ingresos gravables', (r) => r.ingresos.ingresosGravables],
      ['Costos', (r) => r.costosGastos.costos],
      ['Gastos deducibles', (r) => r.costosGastos.totalDeducibles - r.costosGastos.costos],
      ['Renta neta gravable', (r) => r.renta.rentaNetaGravable, 'inf-total'],
    ];
    base = `${seccion('Base de la proyección')}
      <p class="inf-intro">Cada mes restante suma el promedio mensual de enero a ${mes}${crecimiento ? `, ajustado en ${(crecimiento * 100).toFixed(1).replace('.', ',')} %` : ''}. Las cuentas de balance se mantienen como están al corte.</p>
      ${tabla(['Concepto', `Real ene–${mes.slice(0, 3)}`, 'Promedio mensual', 'Por mes restante', `Proyección ${MESES[mesCorte].slice(0, 3)}–dic`, 'Total del año'], lineas.map(([nombre, f, clase]) => {
        const real = f(corte.resultado);
        const total = f(cierre.resultado);
        return `<tr class="${clase || ''}"><td>${nombre}</td><td class="num">${cifra(real)}</td><td class="num">${cifra(real / mesCorte)}</td>
          <td class="num">${cifra((total - real) / faltan)}</td><td class="num">${cifra(total - real)}</td><td class="num">${cifra(total)}</td></tr>`;
      }), 'inf-compacta')}`;
  }

  // 5. CAIR
  const cairTabla = tabla(['Indicador', ''], [
    `<tr><td>Ingresos gravables ${proyectado ? 'proyectados' : 'al corte'}</td><td class="num">${cifra(cair.ingresos)}</td></tr>`,
    `<tr><td>Umbral para el cálculo alterno</td><td class="num">${cifra(1500000)}</td></tr>`,
    `<tr><td>Margen fiscal (renta neta gravable / ingresos gravables)</td><td class="num">${pct(cair.margen)}</td></tr>`,
    `<tr><td>Impuesto por el método normal</td><td class="num">${cifra(cair.impuestoNormal)}</td></tr>`,
    `<tr><td>Impuesto por el CAIR (4,67 % de los ingresos)</td><td class="num">${cifra(cair.impuestoCAIR)}</td></tr>`,
  ], 'inf-compacta');

  // 6. Conciliación
  const conciliacion = cuadre.length
    ? `${seccion('Conciliación con los estados financieros')}
      ${tabla(['Concepto', 'Balance de prueba', 'Estado reportado', 'Diferencia', 'Resultado'], cuadre.map((c) => `<tr>
        <td>${escapar(c.nombre)}<small>Hoja "${escapar(c.hoja)}"</small></td><td class="num">${cifra(c.calculado)}</td><td class="num">${cifra(c.reportado)}</td>
        <td class="num">${cifra(c.calculado - c.reportado)}</td><td>${c.cuadra ? 'Concilia' : 'No concilia'}</td></tr>`), 'inf-compacta')}`
    : '';

  let n = 0;
  return `
    ${d.borrador ? '<div class="inf-marca-agua" aria-hidden="true">BORRADOR</div>' : ''}
    ${membrete(firma, 'Informe preliminar')}
    <section class="inf-portada">
      <p class="inf-supra">Impuesto sobre la renta · Persona jurídica · República de Panamá</p>
      <h1>Informe preliminar del impuesto sobre la renta</h1>
      <p class="inf-sub">Período fiscal ${anio} · Información financiera al ${fechaLarga(fechaCorte)}</p>
      <dl class="inf-datos">
        <div><dt>Contribuyente</dt><dd>${escapar(cliente)}</dd></div>
        <div><dt>RUC</dt><dd>${escapar(ruc || '—')}</dd></div>
        <div><dt>Fecha de corte</dt><dd>${fechaLarga(fechaCorte)}</dd></div>
        <div><dt>Fecha de emisión</dt><dd>${hoyLargo()}</dd></div>
        <div><dt>Preparado por</dt><dd>${escapar(usuario || firma.nombre)}</dd></div>
        <div><dt>Estado</dt><dd>${d.borrador ? 'Borrador para revisión' : 'Versión final'}</dd></div>
      </dl>
    </section>

    ${seccion('Resumen ejecutivo')}
    <p class="inf-parrafo">${resumen}</p>
    ${tabla(['Concepto', '', 'B/.'], filasCifras, 'inf-cifras')}

    ${calendario}

    <div class="inf-salto">
      ${seccion('Determinación del impuesto sobre la renta')}
      <p class="inf-intro">Estructura de la declaración jurada de rentas, con la liquidación al corte y la proyectada al cierre del período.</p>
      ${determinacion}
    </div>

    ${base}

    ${seccion('Cálculo alterno del impuesto sobre la renta (CAIR)')}
    <p class="inf-parrafo">${escapar(cair.conclusion)}</p>
    ${cairTabla}

    ${conciliacion}

    ${seccion('Alcance y limitaciones')}
    <p class="inf-parrafo inf-legal">${ALCANCE}</p>

    <div class="inf-firmas">
      <div><span class="inf-linea"></span><strong>${escapar(usuario || '')}</strong><span>Preparado por</span></div>
      <div><span class="inf-linea"></span><strong>&nbsp;</strong><span>Revisado por</span></div>
    </div>`.replace(/<span>§\.<\/span>/g, () => `<span>${++n}.</span>`);
}

// Pie y encabezado de cada página: se escriben como CSS porque las cajas de margen de @page solo aceptan texto fijo.
export function estiloDePagina({ firma, cliente }) {
  const texto = (t) => JSON.stringify(String(t).replace(/[\n\r]/g, ' '));
  return `@page {
    @bottom-left { content: ${texto(`${firma.nombre} · Confidencial · Preparado para ${cliente}`)}; font: 500 7.5pt 'Geist', sans-serif; color: #5A5F6E; border-top: 0.75pt solid #0000B8; padding-top: 4pt; vertical-align: top; }
    @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 600 7.5pt 'Geist', sans-serif; color: #0000B8; border-top: 0.75pt solid #0000B8; padding-top: 4pt; vertical-align: top; }
    @top-right { content: ${texto(`Informe preliminar ISR · ${cliente}`)}; font: 500 7.5pt 'Geist', sans-serif; color: #8A93A3; }
  }
  @page :first { @top-right { content: none; } }`;
}

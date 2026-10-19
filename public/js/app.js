import { leerBalanceDePrueba, aNumero } from './lector.js';
import { proyectar } from './proyeccion.js';
import { PLANES_DE_CUENTAS } from './config.js';

const $ = (id) => document.getElementById(id);
const numero = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balboas = (v) => `B/. ${numero.format(v)}`;
let filas = null;
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
  ['Impuesto causado (25 %)', (r) => r.liquidacion.impuestoCausado, 'total'],
  ['Impuesto estimado pagado', (r) => r.liquidacion.estimadoPagado],
  ['Retenciones y créditos', (r) => r.liquidacion.retenciones],
  ['Saldo a favor del año anterior', (r) => r.liquidacion.saldoAFavorAnterior],
  ['Impuesto por pagar', (r) => r.liquidacion.saldoAPagar, 'destacado'],
  ['Saldo a favor', (r) => r.liquidacion.saldoAFavor, 'total'],
  ['Impuesto estimado para 2027', (r) => r.liquidacion.impuestoEstimadoSiguiente],
  ['Cada partida del estimado (jun, sep, dic)', (r) => r.liquidacion.partidaEstimadoSiguiente],
  ['Otros tributos a prever', null],
  ['Impuesto complementario (10 %)', (r) => r.otros.impuestoComplementario],
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

function mostrarEstado(texto, ok) {
  $('estadoBalance').textContent = texto;
  $('estadoBalance').className = `estado ${ok ? 'ok' : 'error'}`;
}

$('archivoBalance').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    const libro = await leerLibro(archivo);
    filas = XLSX.utils.sheet_to_json(libro.Sheets[libro.SheetNames[0]], { header: 1, defval: '' });
    mostrarEstado(`Leí ${leerBalanceDePrueba(filas, plan()).length} cuentas auxiliares de "${archivo.name}".`, true);
  } catch (err) {
    filas = null;
    mostrarEstado(err.message, false);
  }
});

const dinero = (id) => aNumero($(id).value);
const dineroOpcional = (id) => ($(id).value.trim() ? aNumero($(id).value) : undefined);

$('calcular').addEventListener('click', () => {
  if (!filas) return mostrarEstado('Primero carga el balance de prueba.', false);
  const anterior = {
    impuestoEstimado: dineroOpcional('impuestoEstimado'),
    estimadoPagado: dineroOpcional('estimadoPagado'),
    saldoAFavor: dinero('saldoAFavor'),
    arrastrePerdidas: dinero('arrastrePerdidas'),
    noAplicarCAIR: $('noAplicarCAIR').checked,
  };
  const ajustes = Object.fromEntries(['ingresosExentos', 'otrosNoDeducibles', 'retenciones'].map((k) => [k, dinero(k)]));
  const opciones = { mesCorte: Number($('mesCorte').value), crecimiento: Number($('crecimiento').value || 0) / 100 };
  const escenarios = proyectar(leerBalanceDePrueba(filas, plan()), anterior, ajustes, { ...opciones, mesesAProyectar: 3, plan: plan() });
  ultimo = { anterior, ajustes, ...opciones, plan: $('plan').value, escenarios };
  mostrar(escenarios);
});

function mostrar(escenarios) {
  const actual = escenarios[0].resultado.liquidacion;
  const cierre = escenarios[escenarios.length - 1];
  const neto = (l) => l.saldoAPagar || -l.saldoAFavor;
  const mesesRestantes = escenarios.length - 1;
  // Lo que sale de caja desde hoy: partidas del estimado que faltan más el saldo de la declaración.
  const pendiente = cierre.resultado.liquidacion.saldoAPagar + (cierre.resultado.liquidacion.estimadoPagado - actual.estimadoPagado);

  $('resumen').innerHTML = `
    <div><span>Si declarara hoy (corte ${escenarios[0].mes.toLowerCase()})</span><strong>${balboas(neto(actual))}</strong></div>
    <div><span>Proyección al cierre (${cierre.mes.toLowerCase()})</span><strong>${balboas(neto(cierre.resultado.liquidacion))}</strong></div>
    <div><span>Reserva mensual sugerida (partidas pendientes del estimado más saldo final)</span><strong>${balboas(mesesRestantes ? pendiente / mesesRestantes : pendiente)}</strong></div>`;

  const cab = `<thead><tr><th>Concepto</th>${escenarios.map((e) => `<th>${e.mes}<small>${e.tipo}</small></th>`).join('')}</tr></thead>`;
  const cuerpo = FILAS.map(([nombre, f, clase]) =>
    f
      ? `<tr class="${clase || ''}"><td>${nombre}</td>${escenarios.map((e) => `<td>${balboas(f(e.resultado))}</td>`).join('')}</tr>`
      : `<tr class="seccion"><td colspan="${escenarios.length + 1}">${nombre}</td></tr>`,
  ).join('');
  $('tabla').innerHTML = cab + `<tbody>${cuerpo}</tbody>`;

  const r = escenarios[0].resultado;
  const cr = cierre.resultado;
  $('notas').innerHTML = `
    <h3>Notas del cálculo</h3>
    <ul>
      <li>Método al corte: ${r.renta.metodo === 'CAIR' ? 'CAIR, porque el 4,67 % de los ingresos supera la renta normal' : 'normal'}${r.renta.aplicaCAIR ? '' : ' (los ingresos gravables no superan B/. 1.500.000, el CAIR no aplica)'}.
        ${cr.renta.metodo !== r.renta.metodo ? ` Al cierre cambia a ${cr.renta.metodo}.` : ''}</li>
      <li>Partidas del impuesto estimado vencidas al corte: ${r.liquidacion.partidasVencidas} de 3.</li>
      ${r.noDeducibles.length ? `<li>Gastos excluidos por no deducibles: ${r.noDeducibles.map((n) => `${n.codigo} ${n.nombre} (${balboas(n.monto)})`).join('; ')}.</li>` : ''}
      <li>El impuesto complementario y el de aviso de operación se muestran aparte; no se suman al impuesto por pagar de la declaración.</li>
      <li>La proyección extiende ingresos, costos, gastos y retenciones con el promedio mensual del acumulado; las cuentas de balance se dejan como están al corte.</li>
      <li>Es un cálculo preliminar para planeación y no reemplaza la declaración jurada definitiva.</li>
    </ul>`;
  if ($('guardar').dataset.disponible && ultimo) {
    $('guardar').classList.remove('oculto');
    $('guardar').textContent = 'Guardar en el historial';
  }
  $('resultados').classList.remove('oculto');
  $('resultados').scrollIntoView({ behavior: 'smooth' });
}

$('imprimir').addEventListener('click', () => window.print());

// Historial en la base de datos (solo si el servidor la tiene configurada)
async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  return res.status === 204 ? null : res.json();
}

async function cargarHistorial() {
  const calculos = await api('/api/calculos');
  const meses = ['', 'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  $('tablaHistorial').innerHTML = calculos.length
    ? `<thead><tr><th>Cliente</th><th>RUC</th><th>Corte</th><th>Por pagar al corte</th><th>Al cierre</th><th>Guardado</th><th></th></tr></thead><tbody>${calculos
        .map((c) => `<tr><td>${escapar(c.cliente)}</td><td>${escapar(c.ruc)}</td><td>${meses[c.mesCorte]} ${c.anio}</td>
          <td>${balboas(Number(c.impuestoHoy))}</td><td>${balboas(Number(c.impuestoCierre))}</td>
          <td>${new Date(c.creado).toLocaleDateString('es-PA')}</td>
          <td><button class="secundario" data-ver="${c.id}">Ver</button> <button class="secundario" data-borrar="${c.id}">Borrar</button></td></tr>`)
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
      mostrar(calculo.datos.escenarios);
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

api('/api/estado')
  .then(async ({ baseDeDatos }) => {
    if (!baseDeDatos) return;
    $('historial').classList.remove('oculto');
    $('guardar').dataset.disponible = 'si';
    await cargarHistorial();
  })
  .catch(() => {}); // abierta como archivo estático, sin servidor

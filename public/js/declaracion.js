// Lee la declaración jurada de rentas de persona jurídica presentada en e-Tax (DGI Panamá,
// formulario 2 "Renta Jurídica") a partir del PDF, para no copiar los valores a mano.
// El PDF trae cada renglón como "etiqueta  número  valor"; se toma el número de renglón y el
// importe que lo sigue en la misma línea.

const IMPORTE = /^[­\-−]?[\d,]+\.\d{2}$/;
const aImporte = (s) => {
  const negativo = /^[­\-−]/.test(s);
  const n = Number(s.replace(/[^\d.]/g, ''));
  return negativo ? -n : n;
};

// Convierte el PDF en líneas de texto ordenadas: [[{ s, x }, ...], ...] por página, de arriba abajo.
export async function lineasDePdf(pdfjs, datos) {
  const doc = await pdfjs.getDocument({ data: datos, isEvalSupported: false }).promise;
  const lineas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const { items } = await pagina.getTextContent();
    const filas = [];
    for (const item of items) {
      const s = item.str.trim();
      if (!s) continue;
      const y = item.transform[5];
      let fila = filas.find((f) => Math.abs(f.y - y) <= 2);
      if (!fila) filas.push((fila = { y, celdas: [] }));
      fila.celdas.push({ s, x: item.transform[4] });
    }
    filas.sort((a, b) => b.y - a.y);
    for (const f of filas) lineas.push(f.celdas.sort((a, b) => a.x - b.x));
  }
  return lineas;
}

// Valor que aparece debajo de un título (misma columna, en las dos líneas siguientes).
function valorBajo(lineas, titulo, patron = /.+/) {
  for (let i = 0; i < lineas.length; i++) {
    const t = lineas[i].find((c) => c.s.toLowerCase().startsWith(titulo.toLowerCase()));
    if (!t) continue;
    for (const siguiente of lineas.slice(i + 1, i + 4)) {
      const v = siguiente.find((c) => Math.abs(c.x - t.x) < 15 && patron.test(c.s));
      if (v) return v.s;
    }
  }
  return null;
}

export function leerDeclaracion(lineas) {
  const texto = lineas.map((l) => l.map((c) => c.s).join(' ')).join('\n');
  if (!/RENTA JUR[IÍ]DICA/i.test(texto) || !/DIRECCI[OÓ]N GENERAL DE INGRESOS/i.test(texto)) {
    throw new Error('El PDF no parece una declaración de renta jurídica de la DGI.');
  }

  const r = {};
  for (const linea of lineas) {
    for (let i = 0; i < linea.length - 1; i++) {
      if (!/^\d{1,3}$/.test(linea[i].s) || !IMPORTE.test(linea[i + 1].s)) continue;
      const renglon = Number(linea[i].s);
      if (!(renglon in r)) r[renglon] = aImporte(linea[i + 1].s); // el PDF repite filas al cambiar de página
    }
  }
  const v = (n) => r[n] || 0;
  const usoCAIR = v(114) > v(93);

  const tarifaTexto = texto.match(/(\d+(?:\.\d+)?)\s*\[\s*\d+(?:\.\d+)?%\]/);
  const datos = {
    razonSocial: valorBajo(lineas, 'Razón Social'),
    ruc: valorBajo(lineas, 'RUC', /^\d[\d­\-]*$/),
    dv: valorBajo(lineas, 'D.V.', /^\d+$/),
    periodo: Number(valorBajo(lineas, 'Periodo Declarado', /^\d{4}$/)) || null,
    tarifa: tarifaTexto ? Number(tarifaTexto[1]) / 100 : 0.25,
    aprobacionNoCAIR: /^S[IÍ]$/i.test(valorBajo(lineas, 'Aprobación No Cair', /^(SI|SÍ|NO)$/i) || ''),
    renglones: r,
    resumen: {
      totalIngresos: v(20),
      ingresosExentosYExtranjeros: v(21) + v(22) + v(23) + v(24) + v(25),
      ingresosFuenteExtranjera: v(25),
      ingresosGravables: v(26),
      costosDeducibles: v(41),
      costosExentosYExtranjeros: v(37) + v(38) + v(39) + v(40),
      gastosDeducibles: v(82),
      gastosExcluidos: v(78) + v(79) + v(80) + v(81), // exentos, no deducibles y de fuente extranjera
      rentaNetaGravable: v(91),
      perdida: v(84) || v(92),
      arrastreUsado: v(85),
      impuestoCausado: usoCAIR ? v(114) : v(93),
      impuestoAPagar: v(128),
      impuestoAFavor: v(129),
      creditoArrastreEstimado: usoCAIR ? v(124) : v(104),
      impuestoEstimado: v(130) || v(106) || v(132) + v(133) + v(134),
      partidas: [v(132), v(133), v(134)],
      impuestoComplementario: v(142),
      patrimonio: v(189),
      avisoOperacion: v(191),
    },
  };

  // Lo que la app necesita para liquidar el año siguiente.
  const s = datos.resumen;
  datos.paraLiquidar = {
    impuestoEstimado: s.impuestoEstimado,
    // El saldo a favor que ya se aplicó al estimado (crédito de arrastre) no se cuenta dos veces.
    saldoAFavor: Math.max(0, s.impuestoAFavor - s.creditoArrastreEstimado),
    // Cuota del 20 % de la pérdida del año declarado; pérdidas de años anteriores no salen en el PDF.
    arrastrePerdidas: s.perdida * 0.2,
    noAplicarCAIR: datos.aprobacionNoCAIR,
    tarifa: datos.tarifa,
  };

  datos.avisos = [];
  if (!s.ingresosGravables && !s.rentaNetaGravable && !s.perdida) datos.avisos.push('No encontré los renglones de ingresos ni de renta; revisa que sea el PDF de la declaración.');
  if (s.rentaNetaGravable && Math.abs(s.rentaNetaGravable * datos.tarifa - v(93)) > 1) {
    datos.avisos.push('El impuesto causado no es la tarifa por la renta neta gravable; revisa si hubo incentivos o CAIR.');
  }
  if (s.ingresosExentosYExtranjeros) {
    datos.avisos.push(`En ${datos.periodo || 'el año anterior'} declaró ingresos exentos o de fuente extranjera; si se repiten este año, agrégalos en los ajustes.`);
  }
  return datos;
}

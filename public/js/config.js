// Parámetros del impuesto sobre la renta de Panamá (Código Fiscal, DGI) para personas jurídicas.
// Revisar cada año contra la ley vigente: tarifas y umbrales cambian por reforma.

export const PARAMETROS_2026 = {
  anio: 2026,
  tarifaPersonaJuridica: 0.25, // Art. 699 del Código Fiscal
  // Cálculo alterno (CAIR): aplica cuando los ingresos gravables superan B/.1.500.000.
  // La renta gravable es la mayor entre el método normal y el 4,67 % de los ingresos gravables.
  cairUmbral: 1500000,
  cairPorcentajeIngresos: 0.0467,
  // Arrastre de pérdidas (art. 698-A): 20 % de la pérdida por año durante 5 años,
  // sin superar el 50 % de la renta neta gravable del año.
  arrastreTopeRenta: 0.5,
  // Impuesto estimado del año siguiente: se paga en tres partidas (30 jun, 30 sep, 31 dic).
  mesesPartidasEstimado: [6, 9, 12],
  // Impuesto complementario: 10 % sobre el 40 % de la renta neta gravable después del impuesto
  // (4 %), abono al impuesto de dividendos. Coincide con la declaración 2025 de HBSE.
  // Se muestra aparte porque no se suma al saldo de la declaración.
  tarifaComplementario: 0.1,
  baseComplementario: 0.4,
  // Impuesto de aviso de operación: 2 % del patrimonio, mínimo B/.100 y máximo B/.60.000.
  avisoOperacion: { tarifa: 0.02, minimo: 100, maximo: 60000 },
};

// Planes de cuentas usados en Panamá. No hay uno oficial, así que se elige qué dígito inicial
// corresponde a cada grupo según el sistema contable del cliente.
export const PLANES_DE_CUENTAS = {
  estandar: { nombre: '4 ingresos, 5 costos, 6 a 8 gastos', activo: ['1'], pasivo: ['2'], patrimonio: ['3'], ingresos: ['4'], costos: ['5'], gastos: ['6', '7', '8'] },
  invertido: { nombre: '4 ingresos, 5 gastos, 6 costos', activo: ['1'], pasivo: ['2'], patrimonio: ['3'], ingresos: ['4'], costos: ['6'], gastos: ['5', '7', '8'] },
  unificado: { nombre: '4 ingresos, 5 costos y gastos', activo: ['1'], pasivo: ['2'], patrimonio: ['3'], ingresos: ['4'], costos: [], gastos: ['5', '6', '7', '8'] },
};

export function grupoDe(plan, codigo) {
  const digito = String(codigo)[0];
  return ['activo', 'pasivo', 'patrimonio', 'ingresos', 'costos', 'gastos'].find((g) => plan[g].includes(digito)) || null;
}

// Grupo de las cuentas que llegan sin código (QuickBooks usa "Sales", "Retained Earnings", etc.).
export const GRUPO_POR_NOMBRE = [
  { patron: /(costo|cost of|coste)/, grupo: 'costos' },
  { patron: /(sales|ventas?|ingreso|income|revenue)/, grupo: 'ingresos' },
  { patron: /(retained|utilidad|ganancia|superavit|capital|patrimonio|equity|net income)/, grupo: 'patrimonio' },
  { patron: /(vat|itbms|por pagar|payable|pasivo|prestamo)/, grupo: 'pasivo' },
  { patron: /(inventario|activo|banco|caja|cobrar|receivable)/, grupo: 'activo' },
  { patron: /(gasto|expense)/, grupo: 'gastos' },
];

// Clasificación por nombre de cuenta. Gana la primera regla que coincida dentro del grupo.
export const REGLAS_ACTIVO = [
  { patron: /(caja|banco|efectivo|equivalente)/, concepto: 'efectivo' },
  { patron: /(inversion|plazo fijo|acciones)/, concepto: 'inversiones' },
  { patron: /(impuesto estimado|isr pagado|anticipo.*renta|renta.*anticipad|renta.*estimad|credito fiscal.*renta|retencion.*renta)/, concepto: 'impuestoEstimadoPagado' },
  { patron: /(cuentas? por cobrar|clientes|deudores|documentos por cobrar|prestamos? por cobrar|cxc|cuentas malas|incobrable)/, concepto: 'cuentasPorCobrar' },
  { patron: /(inventario|mercancia|materia prima|productos? terminados?)/, concepto: 'inventarios' },
  { patron: /(propiedad|planta|equipo|mobiliario|vehiculo|edificio|terreno|mejoras|depreciacion)/, concepto: 'propiedadesPlantaEquipo' },
  { patron: /(intangible|plusvalia|licencia|software|marca|amortizacion)/, concepto: 'intangibles' },
];

export const REGLAS_INGRESO = [
  // Cuentas de ingresos que el propio catálogo marca como exentas, no gravables o de fuente extranjera.
  { patron: /(exent|no gravab|no gravad|fuente extranjera|extraterritorial)/, concepto: 'ingresosNoGravables' },
  { patron: /(devoluc|descuentos? (en|sobre) ventas|rebaja)/, concepto: 'devoluciones' },
  { patron: /(interes|financier|rendimiento)/, concepto: 'ingresosFinancieros' },
  { patron: /(otros ingresos|ingresos? (no operacional|diversos|varios)|ganancia en venta|dividendo)/, concepto: 'otrosIngresos' },
];

export const REGLAS_GASTO = [
  { patron: /(interes|financier|comision bancaria|cargos bancarios)/, concepto: 'gastosFinancieros' },
  { patron: /(depreciacion|amortizacion)/, concepto: 'depreciacion' },
];

// Gastos que la ley no deja deducir. Se marcan por nombre y se pueden ampliar por cliente.
export const REGLAS_NO_DEDUCIBLES = [
  { patron: /(multa|recargo|sancion|interes moratorio)/, nombre: 'Multas, recargos y sanciones', proporcion: 1 },
  { patron: /impuesto sobre la renta/, nombre: 'Impuesto sobre la renta contable', proporcion: 1 },
  { patron: /no deducible/, nombre: 'Gastos marcados como no deducibles', proporcion: 1 },
];

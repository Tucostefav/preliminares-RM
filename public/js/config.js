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
  // Impuesto complementario: 10 % de la utilidad después del impuesto sobre la renta, abono al
  // impuesto de dividendos. Se muestra aparte porque no se suma al saldo de la declaración.
  tarifaComplementario: 0.1,
  // Impuesto de aviso de operación: 2 % del patrimonio, mínimo B/.100 y máximo B/.60.000.
  avisoOperacion: { tarifa: 0.02, minimo: 100, maximo: 60000 },
};

// Planes de cuentas usados en Panamá. No hay uno oficial, así que se elige cuál dígito inicial
// corresponde a cada grupo según el sistema contable del cliente.
export const PLANES_DE_CUENTAS = {
  '4i5c6g': { nombre: '4 ingresos, 5 costos, 6 gastos', activo: '1', pasivo: '2', patrimonio: '3', ingresos: '4', costos: '5', gastos: '6' },
  '4i5g6c': { nombre: '4 ingresos, 5 gastos, 6 costos', activo: '1', pasivo: '2', patrimonio: '3', ingresos: '4', costos: '6', gastos: '5' },
  '4i5cg': { nombre: '4 ingresos, 5 costos y gastos', activo: '1', pasivo: '2', patrimonio: '3', ingresos: '4', costos: null, gastos: '5' },
};

// Clasificación por nombre de cuenta. Gana la primera regla que coincida dentro del grupo.
export const REGLAS_ACTIVO = [
  { patron: /(caja|banco|efectivo|equivalente)/, concepto: 'efectivo' },
  { patron: /(inversion|plazo fijo|acciones)/, concepto: 'inversiones' },
  { patron: /(impuesto estimado|isr pagado|anticipo.*renta|renta.*anticipad|credito fiscal.*renta|retencion.*renta)/, concepto: 'impuestoEstimadoPagado' },
  { patron: /(cuentas? por cobrar|clientes|deudores|documentos por cobrar|prestamos? por cobrar|cxc)/, concepto: 'cuentasPorCobrar' },
  { patron: /(inventario|mercancia|materia prima|productos? terminados?)/, concepto: 'inventarios' },
  { patron: /(propiedad|planta|equipo|mobiliario|vehiculo|edificio|terreno|mejoras|depreciacion)/, concepto: 'propiedadesPlantaEquipo' },
  { patron: /(intangible|plusvalia|licencia|software|marca|amortizacion)/, concepto: 'intangibles' },
];

export const REGLAS_INGRESO = [
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

// Conexión a MySQL/MariaDB (la base de datos de Hostinger) y consultas de la app.
// Si faltan las variables DB_*, la app funciona igual pero sin guardar historial.

import mysql from 'mysql2/promise';

let pool = null;

export function baseConfigurada() {
  return Boolean(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);
}

export const baseLista = () => pool !== null;

export async function conectar() {
  if (!baseConfigurada()) return null;
  const nuevo = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 5,
    charset: 'utf8mb4',
  });
  await crearTablas(nuevo);
  pool = nuevo;
  return pool;
}

async function crearTablas(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      ruc VARCHAR(60) NOT NULL,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY ruc_unico (ruc)
    ) CHARACTER SET utf8mb4`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS calculos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cliente_id INT NOT NULL,
      anio SMALLINT NOT NULL,
      mes_corte TINYINT NOT NULL,
      impuesto_hoy DECIMAL(16,2) NOT NULL,
      impuesto_cierre DECIMAL(16,2) NOT NULL,
      datos LONGTEXT NOT NULL,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY por_cliente (cliente_id, creado),
      CONSTRAINT fk_calculo_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
}

export async function guardarCalculo({ cliente, ruc, anio, mesCorte, impuestoHoy, impuestoCierre, datos }) {
  await pool.query(
    'INSERT INTO clientes (nombre, ruc) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
    [cliente, ruc],
  );
  const [[{ id: clienteId }]] = await pool.query('SELECT id FROM clientes WHERE ruc = ?', [ruc]);
  const [res] = await pool.query(
    'INSERT INTO calculos (cliente_id, anio, mes_corte, impuesto_hoy, impuesto_cierre, datos) VALUES (?, ?, ?, ?, ?, ?)',
    [clienteId, anio, mesCorte, impuestoHoy, impuestoCierre, JSON.stringify(datos)],
  );
  return res.insertId;
}

export async function listarCalculos(limite = 50) {
  const [filas] = await pool.query(
    `SELECT c.id, cl.nombre AS cliente, cl.ruc, c.anio, c.mes_corte AS mesCorte,
            c.impuesto_hoy AS impuestoHoy, c.impuesto_cierre AS impuestoCierre, c.creado
       FROM calculos c JOIN clientes cl ON cl.id = c.cliente_id
      ORDER BY c.creado DESC LIMIT ?`,
    [limite],
  );
  return filas;
}

export async function obtenerCalculo(id) {
  const [[fila]] = await pool.query(
    `SELECT c.*, cl.nombre AS cliente, cl.ruc FROM calculos c JOIN clientes cl ON cl.id = c.cliente_id WHERE c.id = ?`,
    [id],
  );
  return fila ? { ...fila, datos: JSON.parse(fila.datos) } : null;
}

export async function borrarCalculo(id) {
  const [res] = await pool.query('DELETE FROM calculos WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

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

async function asegurarColumna(pool, tabla, columna, definicion) {
  const [filas] = await pool.query(
    'SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [tabla, columna],
  );
  if (!filas.length) await pool.query(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion}`);
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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(120) NOT NULL,
      usuario VARCHAR(40) NOT NULL,
      clave VARCHAR(255) NOT NULL,
      rol VARCHAR(20) NOT NULL DEFAULT 'usuario',
      activo TINYINT(1) NOT NULL DEFAULT 1,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ultimo_acceso DATETIME NULL,
      UNIQUE KEY usuario_unico (usuario)
    ) CHARACTER SET utf8mb4`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sesiones (
      token CHAR(64) PRIMARY KEY,
      usuario_id INT NOT NULL,
      expira DATETIME NOT NULL,
      creado TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY por_usuario (usuario_id),
      CONSTRAINT fk_sesion_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    ) CHARACTER SET utf8mb4`);
  // Columnas que se agregaron después: quién guardó, borradores y última edición.
  await asegurarColumna(pool, 'calculos', 'usuario_id', 'INT NULL');
  await asegurarColumna(pool, 'calculos', 'estado', "VARCHAR(20) NOT NULL DEFAULT 'terminado'");
  await asegurarColumna(pool, 'calculos', 'actualizado', 'TIMESTAMP NULL');
  await asegurarColumna(pool, 'calculos', 'actualizado_por', 'INT NULL');
  // Un borrador puede guardarse antes de calcular, sin impuestos todavía.
  const [[hoy]] = await pool.query(
    "SELECT is_nullable AS nulo FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'calculos' AND column_name = 'impuesto_hoy'",
  );
  if (hoy?.nulo === 'NO') {
    await pool.query('ALTER TABLE calculos MODIFY impuesto_hoy DECIMAL(16,2) NULL, MODIFY impuesto_cierre DECIMAL(16,2) NULL');
  }
}

async function idDeCliente(cliente, ruc) {
  await pool.query(
    'INSERT INTO clientes (nombre, ruc) VALUES (?, ?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
    [cliente, ruc],
  );
  const [[{ id }]] = await pool.query('SELECT id FROM clientes WHERE ruc = ?', [ruc]);
  return id;
}

// Un preliminar es un borrador o un cálculo terminado; los dos se pueden volver a abrir y ajustar.
export async function guardarCalculo({ cliente, ruc, anio, mesCorte, estado = 'terminado', impuestoHoy = null, impuestoCierre = null, datos, usuarioId = null }) {
  const clienteId = await idDeCliente(cliente, ruc);
  const [res] = await pool.query(
    `INSERT INTO calculos (cliente_id, anio, mes_corte, estado, impuesto_hoy, impuesto_cierre, datos, usuario_id, actualizado, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [clienteId, anio, mesCorte, estado, impuestoHoy, impuestoCierre, JSON.stringify(datos), usuarioId, usuarioId],
  );
  return res.insertId;
}

export async function actualizarCalculo(id, { cliente, ruc, anio, mesCorte, estado, impuestoHoy = null, impuestoCierre = null, datos, usuarioId = null }) {
  const clienteId = await idDeCliente(cliente, ruc);
  const [res] = await pool.query(
    `UPDATE calculos SET cliente_id = ?, anio = ?, mes_corte = ?, estado = ?, impuesto_hoy = ?, impuesto_cierre = ?, datos = ?,
            actualizado = NOW(), actualizado_por = ? WHERE id = ?`,
    [clienteId, anio, mesCorte, estado, impuestoHoy, impuestoCierre, JSON.stringify(datos), usuarioId, id],
  );
  return res.affectedRows > 0;
}

const CAMPOS_CALCULO = `c.id, cl.nombre AS cliente, cl.ruc, c.anio, c.mes_corte AS mesCorte, c.estado,
       c.impuesto_hoy AS impuestoHoy, c.impuesto_cierre AS impuestoCierre, c.creado,
       COALESCE(c.actualizado, c.creado) AS actualizado, u.nombre AS usuario, COALESCE(ua.nombre, u.nombre) AS actualizadoPor`;
const DESDE_CALCULOS = `FROM calculos c JOIN clientes cl ON cl.id = c.cliente_id
       LEFT JOIN usuarios u ON u.id = c.usuario_id LEFT JOIN usuarios ua ON ua.id = c.actualizado_por`;

export async function listarCalculos({ estado = null, limite = 100 } = {}) {
  const [filas] = await pool.query(
    `SELECT ${CAMPOS_CALCULO} ${DESDE_CALCULOS} ${estado ? 'WHERE c.estado = ?' : ''}
      ORDER BY COALESCE(c.actualizado, c.creado) DESC LIMIT ?`,
    estado ? [estado, limite] : [limite],
  );
  return filas;
}

export async function obtenerCalculo(id) {
  const [[fila]] = await pool.query(`SELECT ${CAMPOS_CALCULO}, c.datos ${DESDE_CALCULOS} WHERE c.id = ?`, [id]);
  return fila ? { ...fila, datos: JSON.parse(fila.datos) } : null;
}

export async function borrarCalculo(id) {
  const [res] = await pool.query('DELETE FROM calculos WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

// Usuarios y sesiones

const CAMPOS_USUARIO = 'id, nombre, usuario, rol, activo = 1 AS activo, creado, ultimo_acceso AS ultimoAcceso';

export async function contarUsuarios() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM usuarios');
  return Number(n);
}

export async function listarUsuarios() {
  const [filas] = await pool.query(`SELECT ${CAMPOS_USUARIO} FROM usuarios ORDER BY activo DESC, nombre`);
  return filas.map((u) => ({ ...u, activo: Boolean(u.activo) }));
}

export async function obtenerUsuario(id) {
  const [[fila]] = await pool.query(`SELECT ${CAMPOS_USUARIO}, clave FROM usuarios WHERE id = ?`, [id]);
  return fila ? { ...fila, activo: Boolean(fila.activo) } : null;
}

export async function buscarUsuario(usuario) {
  const [[fila]] = await pool.query(`SELECT ${CAMPOS_USUARIO}, clave FROM usuarios WHERE usuario = ?`, [usuario]);
  return fila ? { ...fila, activo: Boolean(fila.activo) } : null;
}

export async function crearUsuario({ nombre, usuario, clave, rol }) {
  const [res] = await pool.query('INSERT INTO usuarios (nombre, usuario, clave, rol) VALUES (?, ?, ?, ?)', [nombre, usuario, clave, rol]);
  return res.insertId;
}

export async function actualizarUsuario(id, cambios) {
  const permitidos = { nombre: 'nombre', rol: 'rol', activo: 'activo', clave: 'clave' };
  const campos = Object.keys(cambios).filter((k) => permitidos[k] && cambios[k] !== undefined);
  if (!campos.length) return;
  await pool.query(`UPDATE usuarios SET ${campos.map((k) => `${permitidos[k]} = ?`).join(', ')} WHERE id = ?`, [
    ...campos.map((k) => (k === 'activo' ? (cambios[k] ? 1 : 0) : cambios[k])),
    id,
  ]);
}

export async function borrarUsuario(id) {
  const [res] = await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

export async function contarAdministradoresActivos() {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM usuarios WHERE rol = 'admin' AND activo = 1");
  return Number(n);
}

export async function crearSesion(tokenHash, usuarioId, segundos) {
  await pool.query('INSERT INTO sesiones (token, usuario_id, expira) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))', [tokenHash, usuarioId, segundos]);
  await pool.query('UPDATE usuarios SET ultimo_acceso = NOW() WHERE id = ?', [usuarioId]);
  await pool.query('DELETE FROM sesiones WHERE expira < NOW()');
}

export async function buscarSesion(tokenHash) {
  const [[fila]] = await pool.query(
    `SELECT u.id, u.nombre, u.usuario, u.rol FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token = ? AND s.expira > NOW() AND u.activo = 1`,
    [tokenHash],
  );
  return fila || null;
}

export async function borrarSesion(tokenHash) {
  await pool.query('DELETE FROM sesiones WHERE token = ?', [tokenHash]);
}

// Cierra todas las sesiones de un usuario, menos la indicada (la del propio usuario que cambia su clave).
export async function borrarSesionesDeUsuario(usuarioId, salvo = '') {
  await pool.query('DELETE FROM sesiones WHERE usuario_id = ? AND token <> ?', [usuarioId, salvo]);
}

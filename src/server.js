// Servidor de la app: entrega la página, maneja los usuarios y guarda el historial de cálculos.
// El cálculo en sí corre en el navegador (public/js), así que el balance del cliente no se
// sube al servidor; solo se guardan los resultados cuando el usuario pulsa "Guardar".

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';
import * as auth from './auth.js';

try {
  process.loadEnvFile?.(); // .env local; en Hostinger las variables se cargan desde el panel
} catch {}

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publico = path.join(raiz, 'public');
const produccion = process.env.NODE_ENV === 'production';
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Hostinger atiende HTTPS delante de la app
app.use(express.json({ limit: '10mb' })); // un borrador lleva las hojas del balance de prueba

// Usuario inicial (APP_USER / APP_PASSWORD). Con base de datos, la primera vez se crea como
// administrador y desde ahí se manejan los usuarios en la app. Sin base de datos es el único usuario.
const usuarioInicial = (process.env.APP_USER || 'rm').trim().toLowerCase();
const claveInicial = process.env.APP_PASSWORD;
let claveInicialCifrada = null;
const COOKIE = 'rm_sesion';
const sesionesEnMemoria = new Map(); // solo sin base de datos
// Por usuario, 5 intentos; por IP más margen, porque una oficina sale a internet con una sola IP.
const frenoUsuario = auth.crearFreno({ intentos: 5 });
const frenoIp = auth.crearFreno({ intentos: 30 });
let abierta = false; // en desarrollo, sin contraseña ni usuarios, la app abre sin pedir sesión

const conUsuarios = () => db.baseLista();

async function usuarioDeSesion(req) {
  if (abierta) return { id: null, nombre: 'Local', usuario: 'local', rol: 'admin' };
  const token = auth.leerCookie(req, COOKIE);
  if (!token) return null;
  const hash = auth.hashToken(token);
  if (conUsuarios()) return db.buscarSesion(hash);
  const s = sesionesEnMemoria.get(hash);
  if (!s || s.expira < Date.now()) return null;
  return s.usuario;
}

function ponerCookie(req, res, token) {
  const partes = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${auth.DURACION_SESION_MS / 1000}`];
  if (req.secure) partes.push('Secure');
  res.set('Set-Cookie', partes.join('; '));
}

// Rutas que se ven sin sesión: la pantalla de entrada y lo que ella necesita.
const PUBLICAS = [/^\/salud$/, /^\/login(\.html)?$/, /^\/css\//, /^\/vendor\/fonts\//, /^\/js\/login\.js$/, /^\/api\/sesion$/];

app.use(async (req, res, next) => {
  if (PUBLICAS.some((r) => r.test(req.path))) return next();
  try {
    if (!abierta && !conUsuarios() && !claveInicial) {
      return res.status(503).send('Falta configurar APP_PASSWORD o la base de datos.');
    }
    // Las peticiones que cambian datos deben ser JSON: un formulario de otro sitio no puede enviarlas.
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json') && req.method !== 'DELETE') {
      return res.status(415).json({ error: 'Formato no admitido.' });
    }
    const usuario = await usuarioDeSesion(req);
    if (usuario) {
      req.usuario = usuario;
      return next();
    }
  } catch (err) {
    console.error(err);
    return res.status(500).send('Error al revisar la sesión.');
  }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Tu sesión terminó. Vuelve a entrar.' });
  res.redirect(303, '/login');
});

const soloAdmin = (req, res, next) =>
  req.usuario?.rol === 'admin' ? next() : res.status(403).json({ error: 'Solo un administrador puede hacer esto.' });

const atrapar = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en el servidor.' });
  }
};

const conBase = (fn) => async (req, res) => {
  if (!db.baseLista()) return res.status(503).json({ error: 'La base de datos no está disponible.' });
  return atrapar(fn)(req, res);
};

app.get('/salud', (_req, res) => res.json({ ok: true }));

app.get(['/login', '/login.html'], async (req, res) => {
  if (await usuarioDeSesion(req).catch(() => null)) return res.redirect(303, '/');
  res.sendFile(path.join(publico, 'login.html'));
});

// Sesión

app.post('/api/sesion', atrapar(async (req, res) => {
  const usuario = String(req.body?.usuario || '').trim().toLowerCase();
  const clave = String(req.body?.clave || '');
  if (frenoUsuario.bloqueado(usuario) || frenoIp.bloqueado(req.ip)) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos y vuelve a probar.' });
  }
  let encontrado = null;
  if (conUsuarios()) {
    const u = await db.buscarUsuario(usuario);
    if (u?.activo && (await auth.verificarClave(clave, u.clave))) encontrado = u;
  } else if (claveInicial && usuario === usuarioInicial) {
    claveInicialCifrada ||= await auth.cifrarClave(claveInicial);
    if (await auth.verificarClave(clave, claveInicialCifrada)) encontrado = { id: null, nombre: 'Administrador', usuario, rol: 'admin' };
  }
  if (!encontrado) {
    frenoUsuario.fallo(usuario);
    frenoIp.fallo(req.ip);
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  frenoUsuario.limpiar(usuario);
  const token = auth.nuevoToken();
  const hash = auth.hashToken(token);
  if (conUsuarios()) await db.crearSesion(hash, encontrado.id, auth.DURACION_SESION_MS / 1000);
  else sesionesEnMemoria.set(hash, { usuario: { id: null, nombre: encontrado.nombre, usuario, rol: 'admin' }, expira: Date.now() + auth.DURACION_SESION_MS });
  ponerCookie(req, res, token);
  res.json({ ok: true });
}));

app.delete('/api/sesion', atrapar(async (req, res) => {
  const token = auth.leerCookie(req, COOKIE);
  if (token) {
    const hash = auth.hashToken(token);
    if (conUsuarios()) await db.borrarSesion(hash);
    sesionesEnMemoria.delete(hash);
  }
  res.set('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.status(204).end();
}));

app.get('/api/yo', (req, res) => {
  const { id, nombre, usuario, rol } = req.usuario;
  res.json({ id, nombre, usuario, rol, rolNombre: auth.ROLES[rol], baseDeDatos: db.baseLista(), gestionUsuarios: conUsuarios() && !abierta });
});

app.put('/api/yo/clave', conBase(async (req, res) => {
  const { actual, nueva } = req.body || {};
  const u = req.usuario.id && (await db.obtenerUsuario(req.usuario.id));
  if (!u) return res.status(400).json({ error: 'Este usuario no puede cambiar su contraseña.' });
  if (!(await auth.verificarClave(String(actual || ''), u.clave))) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  const error = auth.validarClave(nueva);
  if (error) return res.status(400).json({ error });
  await db.actualizarUsuario(u.id, { clave: await auth.cifrarClave(nueva) });
  await db.borrarSesionesDeUsuario(u.id, auth.hashToken(auth.leerCookie(req, COOKIE)));
  res.json({ ok: true });
}));

// Administración de usuarios

app.get('/api/usuarios', soloAdmin, conBase(async (_req, res) => res.json(await db.listarUsuarios())));

app.post('/api/usuarios', soloAdmin, conBase(async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const usuario = String(req.body?.usuario || '').trim().toLowerCase();
  const rol = req.body?.rol in auth.ROLES ? req.body.rol : 'usuario';
  const error = (!nombre && 'Escribe el nombre de la persona.') || auth.validarNombreUsuario(usuario) || auth.validarClave(req.body?.clave);
  if (error) return res.status(400).json({ error });
  if (await db.buscarUsuario(usuario)) return res.status(409).json({ error: `Ya existe el usuario "${usuario}".` });
  const id = await db.crearUsuario({ nombre: nombre.slice(0, 120), usuario, clave: await auth.cifrarClave(req.body.clave), rol });
  res.status(201).json({ id });
}));

app.put('/api/usuarios/:id', soloAdmin, conBase(async (req, res) => {
  const id = Number(req.params.id);
  const u = await db.obtenerUsuario(id);
  if (!u) return res.status(404).json({ error: 'No existe ese usuario.' });
  const { nombre, rol, activo, clave } = req.body || {};
  const cambios = {};
  if (nombre !== undefined) {
    if (!String(nombre).trim()) return res.status(400).json({ error: 'Escribe el nombre de la persona.' });
    cambios.nombre = String(nombre).trim().slice(0, 120);
  }
  if (rol !== undefined) {
    if (!(rol in auth.ROLES)) return res.status(400).json({ error: 'Rol inválido.' });
    cambios.rol = rol;
  }
  if (activo !== undefined) cambios.activo = Boolean(activo);
  if (clave) {
    const error = auth.validarClave(clave);
    if (error) return res.status(400).json({ error });
    cambios.clave = await auth.cifrarClave(clave);
  }
  const pierdeAdmin = u.rol === 'admin' && u.activo && (cambios.rol === 'usuario' || cambios.activo === false);
  if (pierdeAdmin && id === req.usuario.id) return res.status(400).json({ error: 'No puedes quitarte el rol de administrador ni desactivarte a ti mismo.' });
  if (pierdeAdmin && (await db.contarAdministradoresActivos()) <= 1) return res.status(400).json({ error: 'Debe quedar al menos un administrador activo.' });
  await db.actualizarUsuario(id, cambios);
  // Si se desactiva o se le cambia la contraseña, se cierran sus sesiones abiertas.
  if (cambios.activo === false || cambios.clave) await db.borrarSesionesDeUsuario(id, id === req.usuario.id ? auth.hashToken(auth.leerCookie(req, COOKIE)) : '');
  res.json({ ok: true });
}));

app.delete('/api/usuarios/:id', soloAdmin, conBase(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) return res.status(400).json({ error: 'No puedes borrar tu propio usuario.' });
  const u = await db.obtenerUsuario(id);
  if (!u) return res.status(404).json({ error: 'No existe ese usuario.' });
  if (u.rol === 'admin' && u.activo && (await db.contarAdministradoresActivos()) <= 1) return res.status(400).json({ error: 'Debe quedar al menos un administrador activo.' });
  await db.borrarUsuario(id);
  res.status(204).end();
}));

// Datos de la firma para el membrete de los informes

const FIRMA_INICIAL = { nombre: 'Rose Molina', detalle: '', logo: null };
const LOGO = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

app.get('/api/firma', atrapar(async (_req, res) => {
  res.json({ ...FIRMA_INICIAL, ...(db.baseLista() ? await db.leerAjuste('firma') : {}) });
}));

app.put('/api/firma', soloAdmin, conBase(async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const detalle = String(req.body?.detalle || '').trim();
  const logo = req.body?.logo || null;
  if (!nombre || nombre.length > 120) return res.status(400).json({ error: 'Escribe el nombre de la firma (hasta 120 caracteres).' });
  if (detalle.length > 240) return res.status(400).json({ error: 'La línea de contacto admite hasta 240 caracteres.' });
  if (logo && (!LOGO.test(logo) || logo.length > 700_000)) return res.status(400).json({ error: 'El logo debe ser PNG o JPG de menos de 500 KB.' });
  await db.guardarAjuste('firma', { nombre, detalle, logo });
  res.json({ ok: true });
}));

// Preliminares: borradores y cálculos terminados

const ESTADOS = ['borrador', 'terminado'];

app.get('/api/estado', (_req, res) => res.json({ baseDeDatos: db.baseLista() }));

app.get('/api/calculos', conBase(async (req, res) => {
  const estado = ESTADOS.includes(req.query.estado) ? req.query.estado : null;
  res.json(await db.listarCalculos({ estado }));
}));

app.get('/api/calculos/:id', conBase(async (req, res) => {
  const calculo = await db.obtenerCalculo(Number(req.params.id));
  calculo ? res.json(calculo) : res.status(404).json({ error: 'No existe ese preliminar.' });
}));

function leerPreliminar(req, res) {
  const { cliente, ruc, anio, mesCorte, estado = 'terminado', impuestoHoy, impuestoCierre, datos } = req.body || {};
  const error = (!cliente?.trim() || !ruc?.trim()) && 'Escribe el nombre y el RUC del cliente para guardar.'
    || (!Number.isInteger(mesCorte) || mesCorte < 1 || mesCorte > 12) && 'Mes de corte inválido.'
    || !ESTADOS.includes(estado) && 'Estado inválido.'
    || (estado === 'terminado' && !Number.isFinite(impuestoHoy)) && 'Calcula antes de terminar el preliminar.';
  if (error) {
    res.status(400).json({ error });
    return null;
  }
  const numero = (v) => (Number.isFinite(v) ? v : null);
  return {
    cliente: cliente.trim(), ruc: ruc.trim(), anio: Number(anio) || new Date().getFullYear(), mesCorte, estado,
    impuestoHoy: numero(impuestoHoy), impuestoCierre: numero(impuestoCierre), datos: datos || {}, usuarioId: req.usuario.id,
  };
}

app.post('/api/calculos', conBase(async (req, res) => {
  const preliminar = leerPreliminar(req, res);
  if (preliminar) res.status(201).json({ id: await db.guardarCalculo(preliminar) });
}));

app.put('/api/calculos/:id', conBase(async (req, res) => {
  const preliminar = leerPreliminar(req, res);
  if (!preliminar) return;
  (await db.actualizarCalculo(Number(req.params.id), preliminar)) ? res.json({ ok: true }) : res.status(404).json({ error: 'No existe ese preliminar.' });
}));

app.delete('/api/calculos/:id', conBase(async (req, res) => {
  (await db.borrarCalculo(Number(req.params.id))) ? res.status(204).end() : res.status(404).json({ error: 'No existe ese preliminar.' });
}));

app.use(express.static(publico));

// Con base de datos y sin ningún administrador activo (la primera vez, o si se borró el único), el
// usuario inicial queda como administrador con APP_PASSWORD.
async function prepararUsuarios() {
  if (conUsuarios() && claveInicial && (await db.contarAdministradoresActivos()) === 0) {
    if (auth.validarNombreUsuario(usuarioInicial)) throw new Error(`APP_USER no es válido: ${auth.validarNombreUsuario(usuarioInicial)}`);
    const clave = await auth.cifrarClave(claveInicial);
    const existente = await db.buscarUsuario(usuarioInicial);
    if (existente) await db.actualizarUsuario(existente.id, { rol: 'admin', activo: true, clave });
    else await db.crearUsuario({ nombre: 'Administrador', usuario: usuarioInicial, clave, rol: 'admin' });
    console.log(`El usuario "${usuarioInicial}" quedó como administrador.`);
  }
  const hayUsuarios = conUsuarios() && (await db.contarUsuarios()) > 0;
  abierta = !produccion && !claveInicial && !hayUsuarios;
  if (abierta) console.log('Sin APP_PASSWORD ni usuarios: la app abre sin pedir sesión (solo fuera de producción).');
}

const puerto = Number(process.env.PORT || 3000);
db.conectar()
  .then((pool) => console.log(pool ? 'Base de datos conectada.' : 'Sin base de datos: el historial y los usuarios quedan desactivados.'))
  .catch((err) => console.error('No pude conectar a la base de datos:', err.message))
  .then(prepararUsuarios)
  .catch((err) => console.error('No pude preparar los usuarios:', err.message))
  .finally(() => app.listen(puerto, () => console.log(`Renta preliminar escuchando en el puerto ${puerto}`)));

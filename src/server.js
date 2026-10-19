// Servidor de la app: entrega la página y guarda el historial de cálculos en la base de datos.
// El cálculo en sí corre en el navegador (public/js), así que el balance del cliente no se
// sube al servidor; solo se guardan los resultados cuando el usuario pulsa "Guardar".

import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './db.js';

try {
  process.loadEnvFile?.(); // .env local; en Hostinger las variables se cargan desde el panel
} catch {}

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Acceso con usuario y contraseña (APP_USER / APP_PASSWORD). Los datos son de clientes,
// así que en producción la app no abre sin contraseña configurada.
const usuario = process.env.APP_USER || 'rm';
const clave = process.env.APP_PASSWORD;
const iguales = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
app.use((req, res, next) => {
  if (req.path === '/salud') return next();
  if (!clave) {
    if (process.env.NODE_ENV === 'production') return res.status(503).send('Falta configurar APP_PASSWORD.');
    return next();
  }
  const [tipo, valor] = (req.headers.authorization || '').split(' ');
  if (tipo === 'Basic' && valor) {
    const [u, ...resto] = Buffer.from(valor, 'base64').toString().split(':');
    if (iguales(u, usuario) && iguales(resto.join(':'), clave)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Renta preliminar RM", charset="UTF-8"').status(401).send('Acceso restringido');
});

app.get('/salud', (_req, res) => res.json({ ok: true }));

const conBase = (fn) => async (req, res) => {
  if (!db.baseLista()) return res.status(503).json({ error: 'La base de datos no está disponible.' });
  try {
    await fn(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en la base de datos.' });
  }
};

app.get('/api/estado', (_req, res) => res.json({ baseDeDatos: db.baseLista() }));

app.get('/api/calculos', conBase(async (_req, res) => res.json(await db.listarCalculos())));

app.get('/api/calculos/:id', conBase(async (req, res) => {
  const calculo = await db.obtenerCalculo(Number(req.params.id));
  calculo ? res.json(calculo) : res.status(404).json({ error: 'No existe ese cálculo.' });
}));

app.post('/api/calculos', conBase(async (req, res) => {
  const { cliente, ruc, anio, mesCorte, impuestoHoy, impuestoCierre, datos } = req.body || {};
  if (!cliente?.trim() || !ruc?.trim()) return res.status(400).json({ error: 'Falta el nombre o el RUC del cliente.' });
  if (!Number.isInteger(mesCorte) || mesCorte < 1 || mesCorte > 12) return res.status(400).json({ error: 'Mes de corte inválido.' });
  const id = await db.guardarCalculo({
    cliente: cliente.trim(), ruc: ruc.trim(), anio: Number(anio) || new Date().getFullYear(), mesCorte,
    impuestoHoy: Number(impuestoHoy) || 0, impuestoCierre: Number(impuestoCierre) || 0, datos,
  });
  res.status(201).json({ id });
}));

app.delete('/api/calculos/:id', conBase(async (req, res) => {
  (await db.borrarCalculo(Number(req.params.id))) ? res.status(204).end() : res.status(404).json({ error: 'No existe ese cálculo.' });
}));

app.use(express.static(path.join(raiz, 'public')));

const puerto = Number(process.env.PORT || 3000);
db.conectar()
  .then((pool) => console.log(pool ? 'Base de datos conectada.' : 'Sin base de datos: el historial queda desactivado.'))
  .catch((err) => console.error('No pude conectar a la base de datos:', err.message))
  .finally(() => app.listen(puerto, () => console.log(`Renta preliminar escuchando en el puerto ${puerto}`)));

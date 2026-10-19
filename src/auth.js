// Contraseñas, sesiones y freno a intentos fallidos. Sin dependencias: usa scrypt de Node.

import crypto from 'node:crypto';

const PARAMETROS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const ROLES = { admin: 'Administrador', usuario: 'Usuario' };
export const CLAVE_MINIMA = 8;
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

const scrypt = (clave, sal) =>
  new Promise((ok, mal) => crypto.scrypt(clave, sal, 64, PARAMETROS, (err, hash) => (err ? mal(err) : ok(hash))));

// Se guarda como "scrypt$sal$hash" (base64), para poder cambiar el algoritmo más adelante.
export async function cifrarClave(clave) {
  const sal = crypto.randomBytes(16);
  return `scrypt$${sal.toString('base64')}$${(await scrypt(clave, sal)).toString('base64')}`;
}

export async function verificarClave(clave, guardada) {
  const [algoritmo, sal, hash] = String(guardada || '').split('$');
  if (algoritmo !== 'scrypt' || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await scrypt(String(clave), Buffer.from(sal, 'base64'));
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

// El token va en la cookie; en la base solo se guarda su hash, así una copia de la base no sirve para entrar.
export const nuevoToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export function validarClave(clave) {
  if (typeof clave !== 'string' || clave.length < CLAVE_MINIMA) return `La contraseña debe tener al menos ${CLAVE_MINIMA} caracteres.`;
  if (clave.length > 200) return 'La contraseña es demasiado larga.';
  return null;
}

export function validarNombreUsuario(usuario) {
  if (typeof usuario !== 'string' || !/^[a-z0-9._-]{3,40}$/.test(usuario)) {
    return 'El usuario debe tener de 3 a 40 caracteres: letras minúsculas, números, punto, guion o guion bajo.';
  }
  return null;
}

// Tras 5 intentos fallidos para el mismo usuario o la misma IP, espera 15 minutos.
export function crearFreno({ intentos = 5, ventanaMs = 15 * 60 * 1000, ahora = () => Date.now() } = {}) {
  const fallos = new Map();
  const vigente = (clave) => {
    const f = fallos.get(clave);
    if (f && ahora() - f.desde > ventanaMs) fallos.delete(clave);
    return fallos.get(clave);
  };
  return {
    bloqueado: (...claves) => claves.some((c) => (vigente(c)?.n || 0) >= intentos),
    fallo: (...claves) => {
      for (const c of claves) {
        const f = vigente(c) || { n: 0, desde: ahora() };
        f.n += 1;
        fallos.set(c, f);
      }
    },
    limpiar: (...claves) => claves.forEach((c) => fallos.delete(c)),
  };
}

export function leerCookie(req, nombre) {
  for (const parte of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return decodeURIComponent(v.join('='));
  }
  return null;
}

// Barra superior compartida: quién está conectado, enlace a usuarios y salir.

const $ = (id) => document.getElementById(id);

export async function api(ruta, opciones = {}) {
  const res = await fetch(ruta, { headers: { 'Content-Type': 'application/json' }, ...opciones });
  if (res.status === 401) {
    location.replace('/login');
    throw new Error('Tu sesión terminó.');
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  return res.status === 204 ? null : res.json();
}

export const iniciales = (nombre) =>
  String(nombre).trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '·';

export async function cargarSesion() {
  const yo = await api('/api/yo');
  $('avatar').textContent = iniciales(yo.nombre);
  $('usuarioNombre').textContent = yo.nombre;
  $('cuenta').title = `${yo.usuario} · ${yo.rolNombre}`;
  $('cuenta').classList.remove('oculto');
  if (yo.gestionUsuarios) {
    $('irUsuarios').textContent = yo.rol === 'admin' ? 'Usuarios' : 'Mi cuenta';
    $('irUsuarios').classList.remove('oculto');
    $('salir').hidden = false;
  } else if (yo.usuario !== 'local') {
    $('salir').hidden = false;
  }
  $('salir').addEventListener('click', async () => {
    await fetch('/api/sesion', { method: 'DELETE' }).catch(() => {});
    location.replace('/login');
  });
  return yo;
}

import { api, cargarSesion, iniciales } from './sesion.js';

const $ = (id) => document.getElementById(id);
const escapar = (t) => String(t).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const ROLES = { admin: 'Administrador', usuario: 'Usuario' };
let yo = null;
let usuarios = [];
let editando = null; // usuario que se edita en el diálogo, o null si es nuevo

const fecha = (f) =>
  f ? new Date(f).toLocaleString('es-PA', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Nunca';

async function cargarUsuarios() {
  usuarios = await api('/api/usuarios');
  $('tablaUsuarios').innerHTML = `
    <thead><tr><th>Persona</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th></th></tr></thead>
    <tbody>${usuarios.map((u) => `
      <tr class="${u.activo ? '' : 'inactivo'}">
        <td><span class="persona"><span class="avatar">${escapar(iniciales(u.nombre))}</span>
          <span><strong>${escapar(u.nombre)}</strong>${u.id === yo.id ? ' <span class="etiqueta pagar">Tú</span>' : ''}<small>${escapar(u.usuario)}<span class="solo-cel"> · ${ROLES[u.rol] || u.rol}</span></small></span></span></td>
        <td>${ROLES[u.rol] || u.rol}</td>
        <td><span class="punto ${u.activo ? 'pendiente' : 'vencida'}">${u.activo ? 'Activo' : 'Sin acceso'}</span></td>
        <td class="fecha">${fecha(u.ultimoAcceso)}</td>
        <td><button class="boton-sec" data-editar="${u.id}">Editar</button></td>
      </tr>`).join('')}</tbody>`;
}

function abrir(u = null) {
  editando = u;
  $('dialogoTitulo').textContent = u ? `Editar a ${u.nombre}` : 'Nuevo usuario';
  $('dialogoSub').textContent = u ? `Usuario ${u.usuario} · creado el ${fecha(u.creado)}` : 'Recibe acceso a la calculadora y al historial.';
  $('uNombre').value = u?.nombre || '';
  $('uUsuario').value = u?.usuario || '';
  $('uUsuario').readOnly = Boolean(u);
  $('uRol').value = u?.rol || 'usuario';
  $('uClave').value = '';
  $('uClaveEtiqueta').textContent = u ? 'Nueva contraseña (déjala vacía para no cambiarla)' : 'Contraseña inicial';
  $('uActivo').checked = u ? u.activo : true;
  $('uActivoCampo').hidden = !u;
  $('borrarUsuario').hidden = !u || u.id === yo.id;
  $('guardarUsuario').textContent = u ? 'Guardar cambios' : 'Crear usuario';
  $('mensajeUsuario').textContent = '';
  $('dialogo').showModal();
  (u ? $('uNombre') : $('uNombre')).focus();
}

$('nuevo').addEventListener('click', () => abrir());
$('cancelar').addEventListener('click', () => $('dialogo').close());
$('tablaUsuarios').addEventListener('click', (e) => {
  const id = Number(e.target.closest('[data-editar]')?.dataset.editar);
  if (id) abrir(usuarios.find((u) => u.id === id));
});

$('formUsuario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = { nombre: $('uNombre').value.trim(), rol: $('uRol').value };
  if ($('uClave').value) datos.clave = $('uClave').value;
  try {
    if (editando) {
      datos.activo = $('uActivo').checked;
      await api(`/api/usuarios/${editando.id}`, { method: 'PUT', body: JSON.stringify(datos) });
    } else {
      datos.usuario = $('uUsuario').value.trim().toLowerCase();
      await api('/api/usuarios', { method: 'POST', body: JSON.stringify(datos) });
    }
    $('dialogo').close();
    await cargarUsuarios();
  } catch (err) {
    $('mensajeUsuario').textContent = err.message;
  }
});

$('borrarUsuario').addEventListener('click', async () => {
  if (!editando || !confirm(`¿Borrar a ${editando.nombre}? Ya no podrá entrar. Sus cálculos guardados se mantienen.`)) return;
  try {
    await api(`/api/usuarios/${editando.id}`, { method: 'DELETE' });
    $('dialogo').close();
    await cargarUsuarios();
  } catch (err) {
    $('mensajeUsuario').textContent = err.message;
  }
});

$('formClave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mensaje = $('mensajeClave');
  mensaje.className = 'mensaje';
  if ($('claveNueva').value !== $('claveRepetida').value) {
    mensaje.textContent = 'Las contraseñas nuevas no coinciden.';
    return;
  }
  try {
    await api('/api/yo/clave', { method: 'PUT', body: JSON.stringify({ actual: $('claveActual').value, nueva: $('claveNueva').value }) });
    e.target.reset();
    mensaje.className = 'mensaje ok';
    mensaje.textContent = 'Listo, tu contraseña cambió. Las demás sesiones abiertas se cerraron.';
  } catch (err) {
    mensaje.textContent = err.message;
  }
});

// Datos de la firma (solo administradores)
let logo = null;

function pintarLogo() {
  $('logoVista').innerHTML = logo ? `<img src="${logo}" alt="Logo de la firma">` : '<span>Sin logo</span>';
  $('quitarLogo').hidden = !logo;
}

async function cargarFirma() {
  const firma = await api('/api/firma');
  $('firmaNombre').value = firma.nombre || '';
  $('firmaDetalle').value = firma.detalle || '';
  logo = firma.logo;
  pintarLogo();
  $('firmaPanel').classList.remove('oculto');
}

$('firmaLogo').addEventListener('change', (e) => {
  const archivo = e.target.files[0];
  e.target.value = '';
  if (!archivo) return;
  if (!/^image\/(png|jpeg)$/.test(archivo.type) || archivo.size > 500 * 1024) {
    $('mensajeFirma').className = 'mensaje';
    $('mensajeFirma').textContent = 'El logo debe ser PNG o JPG de menos de 500 KB.';
    return;
  }
  const lector = new FileReader();
  lector.onload = () => {
    logo = lector.result;
    pintarLogo();
    $('mensajeFirma').textContent = 'Guarda para aplicar el logo.';
    $('mensajeFirma').className = 'mensaje pendiente';
  };
  lector.readAsDataURL(archivo);
});

$('quitarLogo').addEventListener('click', () => {
  logo = null;
  pintarLogo();
});

$('formFirma').addEventListener('submit', async (e) => {
  e.preventDefault();
  const mensaje = $('mensajeFirma');
  try {
    await api('/api/firma', { method: 'PUT', body: JSON.stringify({ nombre: $('firmaNombre').value, detalle: $('firmaDetalle').value, logo }) });
    mensaje.className = 'mensaje ok';
    mensaje.textContent = 'Listo. Los próximos informes salen con estos datos.';
  } catch (err) {
    mensaje.className = 'mensaje';
    mensaje.textContent = err.message;
  }
});

cargarSesion()
  .then(async (datos) => {
    yo = datos;
    if (!yo.gestionUsuarios) return $('sinBase').classList.remove('oculto');
    $('cuentaResumen').textContent = `Entras como ${yo.usuario} · ${yo.rolNombre}`;
    $('cuentaPanel').classList.remove('oculto');
    if (yo.rol === 'admin') {
      $('equipo').classList.remove('oculto');
      await Promise.all([cargarUsuarios(), cargarFirma()]);
    }
  })
  .catch((err) => {
    $('sinBase').textContent = err.message;
    $('sinBase').classList.remove('oculto');
  });

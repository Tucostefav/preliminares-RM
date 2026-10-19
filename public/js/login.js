const $ = (id) => document.getElementById(id);

$('formEntrada').addEventListener('submit', async (e) => {
  e.preventDefault();
  const usuario = $('usuario').value.trim();
  const clave = $('clave').value;
  if (!usuario || !clave) {
    $('mensaje').textContent = 'Escribe tu usuario y tu contraseña.';
    return;
  }
  $('entrar').disabled = true;
  $('entrar').textContent = 'Entrando…';
  $('mensaje').textContent = '';
  try {
    const res = await fetch('/api/sesion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, clave }),
    });
    if (res.ok) return location.replace('/');
    $('mensaje').textContent = (await res.json().catch(() => ({}))).error || 'No se pudo entrar.';
  } catch {
    $('mensaje').textContent = 'No hay conexión con el servidor.';
  }
  $('clave').value = '';
  $('clave').focus();
  $('entrar').disabled = false;
  $('entrar').textContent = 'Entrar';
});

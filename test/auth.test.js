import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifrarClave, verificarClave, hashToken, nuevoToken, validarClave, validarNombreUsuario, crearFreno, leerCookie } from '../src/auth.js';

test('la contraseña se guarda cifrada y se verifica', async () => {
  const guardada = await cifrarClave('clave-segura-1');
  assert.match(guardada, /^scrypt\$/);
  assert.ok(!guardada.includes('clave-segura-1'));
  assert.equal(await verificarClave('clave-segura-1', guardada), true);
  assert.equal(await verificarClave('otra-clave', guardada), false);
  assert.notEqual(guardada, await cifrarClave('clave-segura-1')); // sal distinta cada vez
  assert.equal(await verificarClave('x', 'basura'), false);
});

test('tokens de sesión', () => {
  const t = nuevoToken();
  assert.ok(t.length >= 40);
  assert.equal(hashToken(t).length, 64);
  assert.equal(hashToken(t), hashToken(t));
});

test('validaciones de usuario y contraseña', () => {
  assert.ok(validarClave('corta'));
  assert.equal(validarClave('suficiente'), null);
  assert.equal(validarNombreUsuario('maria.perez'), null);
  assert.ok(validarNombreUsuario('María Pérez'));
  assert.ok(validarNombreUsuario('ab'));
});

test('el freno bloquea tras 5 fallos y se libera con el tiempo', () => {
  let ahora = 0;
  const freno = crearFreno({ ahora: () => ahora });
  for (let i = 0; i < 4; i++) freno.fallo('ip:1', 'u:ana');
  assert.equal(freno.bloqueado('ip:1', 'u:ana'), false);
  freno.fallo('ip:1', 'u:ana');
  assert.equal(freno.bloqueado('ip:2', 'u:ana'), true);
  ahora += 16 * 60 * 1000;
  assert.equal(freno.bloqueado('ip:1', 'u:ana'), false);
});

test('lee la cookie de sesión', () => {
  assert.equal(leerCookie({ headers: { cookie: 'a=1; rm_sesion=abc%3D; b=2' } }, 'rm_sesion'), 'abc=');
  assert.equal(leerCookie({ headers: {} }, 'rm_sesion'), null);
});

# Renta preliminar RM

App web (Node.js) que calcula cómo quedaría hoy la declaración jurada de rentas de una persona jurídica en
Panamá (DGI) a partir de su balance de prueba al corte y de los datos de su declaración del año anterior,
y proyecta los meses que faltan para cerrar el año.

El balance se lee en el navegador. Solo llega a la base de datos cuando el usuario guarda el
preliminar (borrador o terminado), para poder retomarlo después.

## Cómo se usa

1. Abrir la página y cargar el balance de prueba al corte (Excel o CSV con código, nombre y saldo final).
   Elegir qué dígito usa el plan de cuentas del cliente para ingresos, costos y gastos.
2. Subir el PDF de la declaración jurada de rentas del año anterior (formulario de renta jurídica de
   e-Tax). La app lee los renglones y llena el impuesto estimado, el saldo a favor, la tarifa, el CAIR y
   la cuota de arrastre de pérdidas del año declarado. Las pérdidas de años anteriores se agregan a mano.
3. Agregar ajustes fiscales que la contabilidad no muestra (ingresos exentos o de fuente extranjera,
   otros no deducibles, retenciones).
4. Pulsar **Calcular**. La tabla muestra el corte real y los tres meses proyectados.

## Estructura

| Archivo | Qué hace |
| --- | --- |
| `src/server.js` | Servidor Express: entrega la página, inicio de sesión, API de usuarios y del historial |
| `src/auth.js` | Contraseñas cifradas con scrypt, tokens de sesión y freno a intentos fallidos |
| `src/db.js` | Conexión a MySQL y creación automática de las tablas `clientes`, `calculos`, `usuarios` y `sesiones` |
| `public/js/config.js` | Tarifa 25 %, CAIR, arrastre de pérdidas, partidas del estimado y reglas para clasificar cuentas |
| `public/js/lector.js` | Lee el balance de prueba, toma solo auxiliares y normaliza signos |
| `public/js/motor.js` | Renta gravable (normal y CAIR), impuesto causado, estimado, complementario y aviso de operación |
| `public/js/proyeccion.js` | Extiende el acumulado a los meses siguientes |
| `public/js/calendario.js` | Calendario de pagos con las fechas legales y análisis de si aplica el CAIR |
| `public/js/declaracion.js` | Lee el PDF de la declaración del año anterior (renglones del formulario de la DGI) |
| `public/vendor/pdfjs/` | pdf.js 4.10.38 (renombrado de .mjs a .js porque Hostinger no entrega .mjs) para leer el PDF en el navegador (licencia Apache 2.0) |
| `public/js/app.js` | Interfaz e historial |
| `public/js/exportar.js` | Libro de Excel del preliminar con formato corporativo |
| `public/js/informe.js` | Informe PDF (membrete, secciones numeradas, alcance y firmas) |
| `public/login.html`, `public/usuarios.html` | Pantalla de entrada y administración de usuarios (`js/login.js`, `js/usuarios.js`, `js/sesion.js`) |
| `public/vendor/xlsx.full.min.js` | SheetJS 0.18.5 para leer Excel (licencia Apache 2.0) |
| `public/vendor/exceljs/` | ExcelJS 4.4.0 para escribir el Excel con formato; se carga solo al exportar (licencia MIT) |

## Correr en el computador

```
npm install
cp .env.example .env   # y llenar los datos
npm start              # http://localhost:3000
npm test
```

Sin variables `DB_*` la app funciona igual, solo que sin historial.

## Desplegar en Hostinger (Node.js)

1. En hPanel, **Sitios web → Agregar sitio web → Node.js Apps** (o en el sitio existente, la sección
   de apps Node.js) y elegir **Importar repositorio de Git**.
2. Conectar GitHub y elegir `Tucostefav/preliminares-RM`, rama `main`.
3. Configuración de compilación:
   - Framework: Express (u "Otro")
   - Versión de Node: 20 o superior
   - Comando de instalación/compilación: `npm install`
   - Archivo de entrada: `src/server.js` (o comando de inicio `npm start`)
4. En **Variables de entorno** cargar las de `.env.example`: `APP_USER`, `APP_PASSWORD`, `DB_HOST`,
   `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y `NODE_ENV=production`. Los datos de la base están
   en **Bases de datos → MySQL**; el host suele ser `localhost`, pero usa el que muestre el panel.
5. Desplegar. Las tablas se crean solas la primera vez que la app arranca. Cada push a `main` vuelve a
   desplegar si la implementación automática está activa.
6. Comprobar: `https://tu-dominio/salud` responde `{"ok":true}` y la página muestra la pantalla de entrada.

En producción la app no abre si no hay ni `APP_PASSWORD` ni usuarios en la base, porque maneja datos de clientes.

## Usuarios

- La primera vez que la app arranca con base de datos crea un administrador con `APP_USER` y
  `APP_PASSWORD`. Desde ahí se entra con ese usuario y se cambia la contraseña en **Mi cuenta**;
  cambiar `APP_PASSWORD` en Hostinger ya no cambia la contraseña.
- **Administrador**: calcula, usa el historial y crea, edita, desactiva o borra usuarios.
  **Usuario**: calcula y usa el historial.
- La app no deja borrar ni quitar el rol al último administrador activo, ni que alguien se desactive
  a sí mismo.
- Las contraseñas se guardan cifradas (scrypt). La sesión dura 12 horas y vive en una cookie
  `HttpOnly`; al desactivar a alguien o cambiarle la contraseña se cierran sus sesiones.
- Tras 5 intentos fallidos con el mismo usuario hay que esperar 15 minutos.
- La lista de preliminares muestra quién guardó y quién editó por última vez cada uno.

## Exportar

Los dos informes llevan la identidad de Rose Molina: el logo (`public/img/logo-rose-molina.png`, con
fondo transparente), una franja roja y azul bajo el membrete y el azul del logo en títulos, encabezados
de tabla y el total final. Un administrador puede cambiar el nombre, agregar una línea de contacto
(dirección, teléfono, correo) o subir otro logo en **Usuarios → Datos de la firma**; si no sube uno, se
usa el de Rose Molina.

- **PDF** abre la impresión del navegador con un informe en tamaño carta: portada con membrete y datos
  del cliente, resumen ejecutivo, calendario de obligaciones, determinación del impuesto, base de la
  proyección, CAIR, conciliación, alcance y limitaciones y espacio para las firmas. El pie de cada
  página dice "Confidencial", el cliente y "Página X de N". Mientras el preliminar no esté terminado (o
  tenga cambios sin guardar) lleva la marca de agua BORRADOR. Se elige "Guardar como PDF"; el nombre
  propuesto es `Preliminar <cliente> <mes> <año>`.
- **Excel** descarga un libro con membrete, encabezados en azul, totales en negrita y el impuesto final
  con doble línea, en las hojas Resumen, Calendario, Determinación, Proyección y Cuentas. Los montos son
  números, no texto, y cada hoja viene lista para imprimir con su pie de página.

## Borradores

- **Guardar borrador** guarda el preliminar aunque falten archivos o no se haya calculado. Basta con el
  nombre y el RUC del cliente.
- Para seguir después se abre desde **Preliminares** (o con el enlace `?p=` que queda en la barra del
  navegador). Se recuperan el formulario, el balance de prueba y lo leído de la declaración, y si ya se
  había calculado se recalcula solo.
- **Terminar preliminar** lo marca como terminado. Un terminado también se puede abrir y ajustar:
  **Guardar cambios** lo deja terminado y **Guardar como borrador** lo devuelve a borrador.
- Al guardar, las hojas del balance de prueba quedan en la base de datos (tabla `calculos`) para no
  tener que volver a subirlas. El PDF no se guarda, solo los renglones leídos.
- Si hay cambios sin guardar, la app avisa antes de salir o de abrir otro preliminar.
- Si un administrador olvida su contraseña, otro administrador se la restablece. Si era el único,
  se borra su fila de la tabla `usuarios` en phpMyAdmin y se reinicia la app: al no haber ningún
  administrador activo, `APP_USER` vuelve a quedar como administrador con la contraseña de `APP_PASSWORD`.

## Reglas que aplica

- Tarifa del 25 % sobre la renta gravable (art. 699 del Código Fiscal).
- CAIR: si los ingresos gravables superan B/. 1.500.000, la renta gravable es la mayor entre el método
  normal y el 4,67 % de los ingresos gravables, salvo que la DGI haya autorizado no aplicarlo.
- Arrastre de pérdidas limitado al 50 % de la renta neta gravable del año.
- Impuesto estimado pagado en tres partidas (30 de junio, 30 de septiembre y 31 de diciembre); al corte
  solo cuentan las partidas vencidas.
- Impuesto complementario (10 % sobre el 40 % de la utilidad después del impuesto) y aviso de operación
  (2 % del patrimonio, mínimo B/. 100 y máximo B/. 60.000) se muestran aparte.
- Las sociedades sin actividad comercial (por ejemplo, las que solo arriendan bienes propios) no están
  obligadas a tener aviso de operación. Con el interruptor **No obligado al aviso de operación** (en
  Cliente) ese impuesto queda en cero, sale del calendario y los informes lo marcan como "No obligado".
- Calendario: partidas del estimado el 30 de junio, 30 de septiembre y 31 de diciembre; saldo del ISR y
  aviso de operación el 31 de marzo del año siguiente; complementario el 30 de junio del año siguiente;
  tasa única el 15 de enero o el 15 de julio según la inscripción de la sociedad. El saldo a favor
  proyectado se abona al estimado del año siguiente.

## Límites conocidos

- Solo personas jurídicas. No calcula regímenes especiales (zonas francas, SEM, ciudad del saber) ni la
  tarifa del 15 % para rentas pasivas de grupos multinacionales.
- Las cuentas se clasifican por su nombre (caja, clientes, inventario, multas, intereses...). Cuando
  lleguen los archivos de cada cliente conviene revisar la clasificación en el detalle.
- Los gastos no deducibles se detectan por nombre (multas, recargos, impuesto sobre la renta); el resto
  se ingresa a mano.

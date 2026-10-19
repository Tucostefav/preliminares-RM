# Renta preliminar RM

App web (Node.js) que calcula cómo quedaría hoy la declaración jurada de rentas de una persona jurídica en
Panamá (DGI) a partir de su balance de prueba al corte y de los datos de su declaración del año anterior,
y proyecta los meses que faltan para cerrar el año.

El balance se lee en el navegador y no se sube al servidor. Solo se guardan en la base de datos los
resultados que el usuario decide guardar en el historial.

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
| `src/server.js` | Servidor Express: entrega la página, pide usuario y contraseña, API del historial |
| `src/db.js` | Conexión a MySQL y creación automática de las tablas `clientes` y `calculos` |
| `public/js/config.js` | Tarifa 25 %, CAIR, arrastre de pérdidas, partidas del estimado y reglas para clasificar cuentas |
| `public/js/lector.js` | Lee el balance de prueba, toma solo auxiliares y normaliza signos |
| `public/js/motor.js` | Renta gravable (normal y CAIR), impuesto causado, estimado, complementario y aviso de operación |
| `public/js/proyeccion.js` | Extiende el acumulado a los meses siguientes |
| `public/js/calendario.js` | Calendario de pagos con las fechas legales y análisis de si aplica el CAIR |
| `public/js/declaracion.js` | Lee el PDF de la declaración del año anterior (renglones del formulario de la DGI) |
| `public/vendor/pdfjs/` | pdf.js 4.10.38 (renombrado de .mjs a .js porque Hostinger no entrega .mjs) para leer el PDF en el navegador (licencia Apache 2.0) |
| `public/js/app.js` | Interfaz e historial |
| `public/vendor/xlsx.full.min.js` | SheetJS 0.18.5 para leer Excel (licencia Apache 2.0) |

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
6. Comprobar: `https://tu-dominio/salud` responde `{"ok":true}` y la página pide usuario y contraseña.

En producción la app no abre si falta `APP_PASSWORD`, porque maneja datos de clientes.

## Reglas que aplica

- Tarifa del 25 % sobre la renta gravable (art. 699 del Código Fiscal).
- CAIR: si los ingresos gravables superan B/. 1.500.000, la renta gravable es la mayor entre el método
  normal y el 4,67 % de los ingresos gravables, salvo que la DGI haya autorizado no aplicarlo.
- Arrastre de pérdidas limitado al 50 % de la renta neta gravable del año.
- Impuesto estimado pagado en tres partidas (30 de junio, 30 de septiembre y 31 de diciembre); al corte
  solo cuentan las partidas vencidas.
- Impuesto complementario (10 % sobre el 40 % de la utilidad después del impuesto) y aviso de operación
  (2 % del patrimonio, mínimo B/. 100 y máximo B/. 60.000) se muestran aparte.
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

# Recogida de libros · cita previa y gestión de turnos

Aplicación web para que las familias agenden la recogida de los libros del colegio
y para que el personal los atienda por turnos, al estilo de un supermercado o banco.

## Las tres pantallas

| Ruta | Quién la usa | Qué hace |
|------|--------------|----------|
| `/` | Familias | Landing de "pedido completado" con el botón **Agendar recogida**. Calendario lunes–viernes con franjas de 10 min (8:30–12:30 y 15:00–17:00). Azul = libre, gris = ocupado. Al confirmar se genera un **código de 4 caracteres** que se envía por email y/o SMS. |
| `/empleado` | Personal del colegio | Cada empleado elige su puesto (1, 2 o 3). Botón **Siguiente** llama al siguiente de la lista del día (ordenada por hora de cita). También **Volver a llamar**, **Finalizado** y **No se presenta**. Barra espaciadora = Siguiente. |
| `/pasillo` (alias `/pantalla`) | Monitor del pasillo | Muestra en grande el último turno llamado y el puesto al que debe ir, el estado de todos los puestos y los próximos turnos. Sonido y voz opcionales (botón "Activar sonido"). |

Todo se actualiza en tiempo real (Server-Sent Events): al pulsar Siguiente en un puesto,
la pantalla y el resto de puestos lo ven al instante.

La **cola de turnos** contiene todas las citas pendientes desde hoy en adelante, ordenadas
por día y hora: las de hoy primero y después las de días siguientes (etiquetadas con su
fecha). Así, cualquier reserva aparece en la lista de los puestos en cuanto se confirma.

## Arranque

```bash
npm install
npm run seed     # opcional: crea citas de ejemplo para hoy y los próximos días
npm start        # http://localhost:3000
```

Tests:

```bash
npm test
```

## Configuración (`.env` o variables de entorno)

Copia `.env.example` a `.env`:

| Variable | Por defecto | Descripción |
|----------|-------------|-------------|
| `PORT` | `3000` | Puerto HTTP |
| `STATIONS` | `3` | Número de puestos de atención (1–3) |
| `SLOT_CAPACITY` | `1` | Reservas permitidas por franja de 10 min |
| `SCHOOL_NAME` | `Centro Educativo Hispano Británico S21` | Nombre mostrado en cabeceras |
| `STAFF_PIN` | — | Si se define, la página `/empleado` pide este PIN y las rutas `/api/stations/*` lo exigen (cabecera `X-Staff-Pin`). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | — | Envío de email (nodemailer). Si faltan, el email se **simula** y se escribe en la consola del servidor. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | — | Envío de SMS vía Twilio. Si faltan, se simula igual. |

`npm start` carga `.env` automáticamente si existe (Node 22.9+).

Franjas y horarios están en `src/config.js` (`ranges`, `slotMinutes`, `weeksAhead`).

## Estructura

```
server.js            Express: API + estáticos + manejo de errores
src/config.js        Configuración (horarios, puestos, alfabeto de códigos)
src/slots.js         Fechas y generación de franjas
src/codes.js         Códigos de 4 caracteres (sin 0/O/1/I)
src/queue.js         Lógica pura de reservas y cola (sin mutación)
src/validate.js      Validación de la entrada del formulario
src/store.js         Persistencia en data/db.json (escritura atómica)
src/events.js        Difusión SSE
src/notify.js        Email / SMS (o simulación)
src/routes.js        Endpoints /api/*
public/              Frontend sin frameworks (HTML + CSS + JS modules)
scripts/seed.js      Datos de ejemplo
test/                node:test (unitarios + API)
```

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/config` | Nombre del colegio, puestos, horarios |
| GET | `/api/slots?week=YYYY-MM-DD` | Disponibilidad de la semana (lun–vie) |
| POST | `/api/appointments` | Reservar `{ name, email?, phone?, date, time }` → código |
| GET | `/api/queue` | Cola activa: pendientes desde hoy, llamados, estado de puestos |
| POST | `/api/stations/:n/next` | Llamar al siguiente (finaliza el actual) |
| POST | `/api/stations/:n/recall` | Volver a llamar al actual |
| POST | `/api/stations/:n/done` | Marcar atendido |
| POST | `/api/stations/:n/no-show` | Marcar no presentado |
| POST | `/api/demo/seed` | (PIN) Crea `{ count }` citas ficticias antes de la primera cita real de hoy |
| DELETE | `/api/demo` | (PIN) Elimina las citas ficticias |
| GET | `/api/events` | Stream SSE (`queue`, `call`, `slots`) |

Las respuestas de cola nunca incluyen email ni teléfono de las familias, y los logs
del modo simulado los muestran enmascarados. `POST /api/appointments` está limitado a
20 reservas por IP y hora (`bookingRateLimit` en `src/config.js`).

## Datos de demostración en una instancia desplegada

Para enseñar la cola con gente por delante: reserva primero tu cita desde `/`, y después:

```bash
npm run demo -- https://<dominio> <STAFF_PIN> 4      # 4 familias ficticias justo antes de tu cita
npm run demo:clear -- https://<dominio> <STAFF_PIN>  # borra todas las citas de demo
```

Requiere `STAFF_PIN` configurado. Las citas de demo llevan la marca `demo: true`; `demo:clear`
solo borra esas, nunca reservas reales.

## Despliegue en Railway

Es un único proceso Node sin base de datos externa (Dockerfile incluido, healthcheck en `/api/health`).

1. **New Project → Deploy from GitHub repo** → `ivanfebles78/LibrosPickup`. Railway detecta el `Dockerfile`.
2. **Volume**: en el servicio, *Settings → Volumes → Add Volume* con mount path **`/data`**.
   Ahí vive `db.json`; sin volumen, las reservas se pierden en cada despliegue.
3. **Variables** (*Settings → Variables*):
   - `STAFF_PIN` = un PIN para el personal (obligatorio en internet: sin él, cualquiera podría llamar turnos)
   - `SCHOOL_NAME`, `STATIONS`, `SLOT_CAPACITY` si quieres cambiar los valores por defecto
   - SMTP / Twilio si quieres envío real de email/SMS
4. **Networking → Generate Domain**. Las URLs quedan:
   - Familias: `https://<dominio>/`
   - Empleados: `https://<dominio>/empleado` (pide el PIN una vez por sesión de navegador)
   - Pantalla del pasillo: `https://<dominio>/pasillo`

`/pasillo` es de solo lectura y no muestra datos personales. El puerto lo asigna Railway
mediante `PORT`; no hace falta configurarlo.

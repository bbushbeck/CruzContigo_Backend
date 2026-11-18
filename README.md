# CruzContigo_Backend

API de CruzContigo en Node.js, Express, TypeScript y Prisma sobre MySQL.

El módulo de medicamentos usa la tabla existente de Aiven. Sus endpoints,
campos y pruebas se documentan en [docs/medicamentos.md](docs/medicamentos.md).

## Requisitos

- Node.js 20 o superior
- MySQL 8 (la base de Aiven del equipo, o una local con `docker compose up -d db`)

## Configuración

```bash
cp .env.example .env
npm install
```

En `.env`:

- `DATABASE_URL`: cadena de conexión, por ejemplo `mysql://usuario:contraseña@host:puerto/cruzcontigo`.
- `DB_CA_PATH`: ruta al certificado CA de Aiven (se descarga desde la consola de Aiven, en «CA certificate»), por ejemplo `certs/ca.pem`. Déjalo vacío para una base local sin SSL.

`.env` y `certs/` no se suben al repositorio.

## Uso

```bash
npm run dev
```

La API queda en `http://localhost:3000`.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/salud` | Estado de la API |
| GET | `/familiares` | Lista las personas a cargo |
| GET | `/familiares/:id` | Detalle de una persona |
| POST | `/familiares` | Registra una persona (valida datos obligatorios) |
| DELETE | `/familiares/:id` | Elimina una persona |
| GET | `/familiares/:id/ficha-medica` | Ficha médica de una persona (404 sin cuerpo si aún no tiene) |
| PUT | `/familiares/:id/ficha-medica` | Crea o reemplaza la ficha médica |

Encabezado opcional `X-Usuario-Id`: al crear, vincula a la persona con ese usuario en `miembro_red` (con su parentesco); al listar, devuelve solo las personas de ese usuario. Se reemplazará por la autenticación.

Ejemplo de cuerpo para `POST /familiares`:

```json
{
  "nombre": "Rosa María",
  "apellidos": "Hernández López",
  "fechaNacimiento": "1953-04-12T12:00:00Z",
  "parentesco": "madre",
  "tipoCuidado": "adultoMayor",
  "telefono": "8112345678"
}
```

Ejemplo de cuerpo para `PUT /familiares/:id/ficha-medica` (las alergias y enfermedades se reemplazan completas):

```json
{
  "tipoSanguineo": "O+",
  "alergias": [{ "nombre": "Penicilina", "severidad": "grave" }],
  "enfermedades": [{ "nombre": "Hipertensión", "notas": "Desde 2019" }],
  "medicoTratante": "Dra. López",
  "institucionSalud": "IMSS",
  "observaciones": "Usa marcapasos"
}
```

`tipoSanguineo` acepta `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-` o `desconocido`. Al guardar, `X-Usuario-Id` se registra como quien actualizó la ficha.

## Accesos a la ficha (HU-08, HU-16)

La persona titular decide quién consulta sus datos. Si no tiene cuenta propia, lo decide su responsable: los administradores de su red. Todas las rutas requieren `Authorization: Bearer`.

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/familiares/:id/accesos` | 200, versión vigente del aviso y miembros con acceso |
| POST | `/familiares/:id/accesos` | 201, autoriza a una cuenta registrada por su teléfono |
| DELETE | `/familiares/:id/accesos/:miembroId` | 204, revoca el acceso |
| GET | `/familiares/:id/accesos/consentimientos` | 200, historial de autorizaciones y revocaciones |
| GET | `/familiares/:id/accesos/qr` | 200, si el código QR de la ficha de emergencia está permitido |
| PUT | `/familiares/:id/accesos/qr` | 200, la persona titular o su responsable lo permite o lo retira |

```json
{ "telefono": "8112345678", "rol": "cocuidador", "relacion": "hija", "versionAviso": "2026-11", "aceptaAviso": true }
```

- `rol` acepta `cocuidador`, `solo_lectura` o `profesional`. `diasVigencia` es opcional. Un acceso profesional dura 7 días por defecto y 30 como máximo.
- Cada autorización o revocación guarda en `consentimiento` la versión del aviso, la fecha, quién la otorga, a quién y la sesión (RF-31).
- Los permisos se consultan en la base en cada petición, sin caché, así que una revocación se aplica desde la siguiente solicitud (RNF-05).
- Un `profesional` solo puede autorizarse si su cuenta está en `profesional_convenio` con un convenio activo y vigente en `convenio_institucional`. Solo lee la ficha médica: no la edita, no ve recordatorios ni el teléfono de la persona. Cada consulta queda en `bitacora_acceso` (RF-38). Si el convenio vence, pierde el acceso.
- El código QR de la ficha de emergencia (HU-19) solo existe con consentimiento. `PUT /qr` recibe `{ "consentido": true, "versionAviso": "2026-11", "aceptaAviso": true }` o `{ "consentido": false }`, y cada cambio queda en `consentimiento` como `compartir_qr` o `retirar_qr`.
- `consentimiento` y `bitacora_acceso` son de solo inserción.

En Aiven, ejecuta una vez `src/database/prisma/sql/hu08-hu16-acceso-ficha.sql`. En una base local, `npx prisma db push`. Pruebas: `npm run test:accesos` con `TEST_DATABASE_URL`.

## Red de cuidado (HU-17, HU-26), contactos (RF-15) y diario (HU-13)

Todas las rutas requieren `Authorization: Bearer`.

**Invitaciones.** La persona titular o su responsable invita con rol `administrador`, `cocuidador`, `solo_lectura` o `temporal`.

| Método | Ruta | Resultado |
|---|---|---|
| GET | `/familiares/:id/red` | 200, integrantes; para quien administra, también las invitaciones pendientes |
| POST | `/familiares/:id/invitaciones` | 201, crea la invitación y devuelve `codigo` y `enlace` (`cruzcontigo://invitacion/CODIGO`) |
| DELETE | `/familiares/:id/invitaciones/:invitacionId` | 204, cancela una invitación pendiente |
| GET | `/invitaciones` | 200, invitaciones pendientes para el teléfono de la sesión |
| POST | `/invitaciones/consultar` | 200, vista previa de una invitación por `codigo` |
| POST | `/invitaciones/aceptar` | 200, acepta con `codigo` o `invitacionId` |
| DELETE | `/invitaciones/:invitacionId` | 204, rechaza una invitación por teléfono |

```json
{ "telefono": "8112345678", "rol": "temporal", "accesoHasta": "2026-12-01T23:59:00Z", "permisoFicha": false, "versionAviso": "2026-11", "aceptaAviso": true }
```

- Sin `telefono`, la invitación es solo por enlace: la usa quien tenga el código. Con `telefono`, solo ese número.
- El código es de un solo uso, vence en 7 días y en la base solo se guarda su hash. Si quien invitó deja de administrar, la invitación deja de valer.
- Al aceptar se crea el acceso y se guarda el consentimiento con la versión del aviso que aceptó quien invitó.
- `temporal` exige `accesoHasta` y vence solo. No ve la ficha médica salvo `permisoFicha: true` ni la red de cuidado; sí recordatorios, contactos de emergencia y el diario.

**Contactos de emergencia:** `GET/POST /familiares/:id/contactos`, `PUT/DELETE /familiares/:id/contactos/:contactoId` y `PUT /familiares/:id/contactos/orden` con `{ "ids": [...] }`. Los lee cualquier integrante y los cambia quien tiene permiso de edición. Máximo 10.

**Diario:** `GET /familiares/:id/diario?categoria=animo&antes=ISO`, `POST`, `PUT /:notaId` y `DELETE /:notaId`. Categorías: `alimentacion`, `sueno`, `animo`, `incidencia`, `otro`. Escriben titular, administrador, cocuidador y temporal; cada nota la edita o borra solo su autor.

En Aiven, ejecuta una vez `src/database/prisma/sql/red-de-cuidado.sql` (después de `hu08-hu16-acceso-ficha.sql`). Pruebas: `npm run test:red`.

## Datos de prueba

`npx prisma db seed` crea personas ficticias.

## Recordatorios

La API usa la tabla `recordatorio` existente en Aiven. Genera el cliente con
`npm ci` y reinicia la API. En Aiven basta con el esquema existente. En una
base local nueva, inicialízalo con Prisma como parte de la instalación.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/recordatorios` | 200, lista de los familiares accesibles, ordenada por fecha |
| POST | `/recordatorios` | 201, crea un recordatorio |
| PUT | `/recordatorios/:id` | 200, actualiza el recordatorio |
| DELETE | `/recordatorios/:id` | 204, elimina el recordatorio |

Las cuatro operaciones requieren el token en `Authorization: Bearer`. En un
familiar vinculado, la cuenta titular y los miembros activos pueden consultar
sus avisos compartidos. Titulares, administradores y cocuidadores pueden
modificarlos. Al registrar un familiar con una sesión iniciada, la API vincula
a la cuenta como administradora.

Un familiar antiguo sin titular, creador ni miembros admite avisos personales.
Cada aviso queda privado para la cuenta que lo creó, incluso si el familiar se
vincula después. Se guarda en la misma tabla con una regla de versión 2 que
incluye `X-CRUZCONTIGO-USUARIO` con el identificador de esa cuenta.

POST y PUT reciben `familiarID`, `titulo`, `fecha` ISO 8601 con zona y
`completado` (por defecto `false`). Los avisos de una sola vez de la app se
guardan como tareas, con su fecha UTC y estado en una regla versionada:

```text
X-CRUZCONTIGO-PROGRAMACION:1
DTSTART:20270210T153000Z
X-CRUZCONTIGO-ESTADO:PENDIENTE
```

Completar desactiva el aviso y guarda su estado. La API actual consulta y
modifica solo los recordatorios de ese formato. Las notificaciones de la app
se programan en iOS. La tabla `notificacion` puede registrar envíos y lecturas
cuando exista un servicio de notificaciones.

Ejecuta `npm run test:recordatorios` con `TEST_DATABASE_URL` apuntando a una
base local con el esquema inicializado y un nombre terminado en `_test`.

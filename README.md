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

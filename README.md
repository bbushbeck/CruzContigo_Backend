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

Para una base local nueva, inicializa el esquema Prisma. En una base existente,
revisa y ejecuta una vez [el SQL aditivo](src/database/prisma/sql/crear-recordatorios.sql)
antes de desplegar la API. La tabla nueva referencia `usuario.id` y
`persona_cuidada.id`. Verifica que las dos columnas sean `CHAR(36)` con
`utf8mb4_unicode_ci` o adapta la colación de las columnas foráneas en el SQL
a las de la instalación. Evita aplicar el esquema Prisma completo a Aiven.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/recordatorios` | 200, lista de la cuenta ordenada por fecha |
| POST | `/recordatorios` | 201, crea un recordatorio |
| PUT | `/recordatorios/:id` | 200, reemplaza los campos del recordatorio |
| DELETE | `/recordatorios/:id` | 204, elimina el recordatorio |

Las cuatro operaciones requieren el token de sesión en `Authorization: Bearer`.
POST y PUT reciben `familiarID` (UUID), `titulo`, `fecha` (ISO 8601 con zona)
y `completado` (booleano, por defecto `false`). La API devuelve también el `id`
del recordatorio. Los recordatorios se guardan en la cuenta que los crea.

Ejecuta `npm run test:recordatorios` con `TEST_DATABASE_URL` apuntando a una
base local terminada en `_test` con el esquema inicializado.

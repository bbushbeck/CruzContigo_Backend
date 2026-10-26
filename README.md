# CruzContigo_Backend

API de CruzContigo en Node.js, Express, TypeScript y Prisma sobre MySQL.

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

## Datos de prueba

`npx prisma db seed` crea personas ficticias. Úsalo solo en una base local, no en la compartida.

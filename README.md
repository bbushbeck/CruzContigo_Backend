# CruzContigo_Backend

API de CruzContigo en Node.js, Express y TypeScript.

## Requisitos

- Node.js 20 o superior
- MySQL 8 (local o con `docker compose up -d db`)

## Uso

```bash
cp .env.example .env
npm install
npm run dev
```

La API queda en `http://localhost:3000`. `GET /salud` responde `{ "estado": "ok" }`.

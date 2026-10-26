import { readFileSync } from 'node:fs';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

const url = new URL(env.DATABASE_URL);

const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
  ssl: env.DB_CA_PATH ? { ca: readFileSync(env.DB_CA_PATH, 'utf8'), rejectUnauthorized: true } : undefined,
});

export const prisma = new PrismaClient({ adapter });

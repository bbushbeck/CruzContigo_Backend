import 'dotenv/config';
import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  DB_CA_PATH: z.string().optional().transform((v) => (v ? v : undefined)),
});

const resultado = esquema.safeParse(process.env);

if (!resultado.success) {
  console.error('Variables de entorno inválidas:', resultado.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = resultado.data;

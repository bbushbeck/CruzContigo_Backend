import { z } from 'zod';

export const solicitarCodigoSchema = z.object({
  phoneNumber: z.string().min(10).max(20),
});

export const verificarCodigoSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

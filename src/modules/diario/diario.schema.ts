import { z } from 'zod';

export const categorias = ['alimentacion', 'sueno', 'animo', 'incidencia', 'otro'] as const;

const MARGEN_RELOJ_MS = 5 * 60 * 1000;

export const notaSchema = z
  .object({
    categoria: z.enum(categorias, { errorMap: () => ({ message: `La categoría debe ser una de: ${categorias.join(', ')}` }) }),
    texto: z.string({ required_error: 'Escribe la nota' }).trim().min(1, 'Escribe la nota').max(2000, 'La nota puede tener hasta 2000 caracteres'),
    fecha: z.coerce
      .date({ errorMap: () => ({ message: 'La fecha no es válida' }) })
      .refine((f) => f.getTime() <= Date.now() + MARGEN_RELOJ_MS, 'La fecha no puede ser futura')
      .optional(),
  })
  .strip();

export type NotaDto = z.infer<typeof notaSchema>;

export const filtroSchema = z
  .object({
    categoria: z.enum(categorias).optional(),
    // Paginación: notas anteriores a esta fecha.
    antes: z.coerce.date().optional(),
  })
  .strip();

export type FiltroDto = z.infer<typeof filtroSchema>;

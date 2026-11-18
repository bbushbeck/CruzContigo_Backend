import { z } from 'zod';

export const MAXIMO_CONTACTOS = 10;

export const contactoSchema = z
  .object({
    nombre: z.string({ required_error: 'El nombre es obligatorio' }).trim().min(2, 'El nombre es obligatorio').max(120),
    telefono: z
      .string({ required_error: 'El teléfono es obligatorio' })
      .transform((t) => t.replace(/[\s()-]/g, ''))
      .pipe(z.string().regex(/^\+?\d{10,15}$/, 'El teléfono debe tener 10 dígitos')),
    parentesco: z.string().trim().max(40).nullish(),
  })
  .strip();

export type ContactoDto = z.infer<typeof contactoSchema>;

export const ordenSchema = z
  .object({
    ids: z.array(z.string().uuid().toLowerCase()).min(1).max(MAXIMO_CONTACTOS),
  })
  .strip()
  .refine((d) => new Set(d.ids).size === d.ids.length, 'Hay contactos repetidos');

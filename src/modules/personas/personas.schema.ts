import { z } from 'zod';
import type { TipoCuidado } from '@prisma/client';

export const parentescos = ['madre', 'padre', 'abuela', 'abuelo', 'hijo', 'hija', 'pareja', 'hermano', 'hermana', 'otro'] as const;

export const tiposCuidadoApp = {
  adultoMayor: 'edad_avanzada',
  discapacidad: 'discapacidad',
  enfermedadCronica: 'enfermedad_cronica',
  recuperacion: 'recuperacion',
  menorNecesidades: 'menor_necesidades_especiales',
  otro: 'otro',
} as const satisfies Record<string, TipoCuidado>;

export type TipoCuidadoApp = keyof typeof tiposCuidadoApp;

const tiposApp = Object.keys(tiposCuidadoApp) as [TipoCuidadoApp, ...TipoCuidadoApp[]];

const hace120Anios = () => new Date(new Date().getFullYear() - 120, 0, 1);

const requerido = (mensaje: string) => ({ required_error: mensaje, invalid_type_error: mensaje });

export const crearPersonaSchema = z
  .object({
    id: z.string().uuid().optional(),
    nombre: z.string(requerido('El nombre es obligatorio')).trim().min(2, 'El nombre debe tener al menos 2 letras').max(60),
    apellidos: z.string(requerido('Los apellidos son obligatorios')).trim().min(1, 'Los apellidos son obligatorios').max(59),
    fechaNacimiento: z.coerce
      .date({ errorMap: () => ({ message: 'La fecha de nacimiento es obligatoria y debe ser válida' }) })
      .refine((f) => f <= new Date(), 'La fecha no puede ser futura')
      .refine((f) => f >= hace120Anios(), 'La fecha es demasiado antigua'),
    parentesco: z.enum(parentescos, { errorMap: () => ({ message: `El parentesco debe ser uno de: ${parentescos.join(', ')}` }) }),
    tipoCuidado: z.enum(tiposApp, { errorMap: () => ({ message: `El tipo de cuidado debe ser uno de: ${tiposApp.join(', ')}` }) }),
    telefono: z
      .string()
      .trim()
      .regex(/^\d{10}$/, 'El teléfono debe tener 10 dígitos')
      .nullish(),
    notas: z.string().max(500).nullish(),
  })
  .strip();

export type CrearPersonaDto = z.infer<typeof crearPersonaSchema>;

export const idSchema = z.string().uuid('Identificador inválido');

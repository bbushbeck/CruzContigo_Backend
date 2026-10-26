import { z } from 'zod';

export const tiposSanguineos = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'desconocido'] as const;

const sinRepetidos = (lista: { nombre: string }[]) =>
  new Set(lista.map((e) => e.nombre.toLowerCase())).size === lista.length;

const alergiaSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(1, 'La alergia necesita un nombre').max(120),
  severidad: z.enum(['leve', 'moderada', 'grave'], { errorMap: () => ({ message: 'La severidad debe ser leve, moderada o grave' }) }),
});

const enfermedadSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().trim().min(1, 'La enfermedad necesita un nombre').max(120),
  notas: z.string().trim().max(1000).nullish(),
});

export const guardarFichaSchema = z
  .object({
    tipoSanguineo: z.enum(tiposSanguineos, { errorMap: () => ({ message: 'Selecciona el tipo sanguíneo (o “No lo sé”)' }) }),
    alergias: z.array(alergiaSchema).max(50).default([]).refine(sinRepetidos, 'Hay alergias repetidas'),
    enfermedades: z.array(enfermedadSchema).max(50).default([]).refine(sinRepetidos, 'Hay enfermedades repetidas'),
    medicoTratante: z.string().trim().max(120).nullish(),
    institucionSalud: z.string().trim().max(120).nullish(),
    observaciones: z.string().trim().max(1000).nullish(),
  })
  .strip();

export type GuardarFichaDto = z.infer<typeof guardarFichaSchema>;

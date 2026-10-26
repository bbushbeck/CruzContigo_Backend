import { z } from 'zod';
import type { TipoSanguineo } from '@prisma/client';

export const tiposSanguineosApp = {
  'A+': 'A_POS',
  'A-': 'A_NEG',
  'B+': 'B_POS',
  'B-': 'B_NEG',
  'AB+': 'AB_POS',
  'AB-': 'AB_NEG',
  'O+': 'O_POS',
  'O-': 'O_NEG',
  desconocido: 'desconocido',
} as const satisfies Record<string, TipoSanguineo>;

export type TipoSanguineoApp = keyof typeof tiposSanguineosApp;

const tiposApp = Object.keys(tiposSanguineosApp) as [TipoSanguineoApp, ...TipoSanguineoApp[]];

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
  notas: z.string().trim().max(500).nullish(),
});

export const guardarFichaSchema = z
  .object({
    tipoSanguineo: z.enum(tiposApp, { errorMap: () => ({ message: 'Selecciona el tipo sanguíneo (o “No lo sé”)' }) }),
    alergias: z.array(alergiaSchema).max(50).default([]).refine(sinRepetidos, 'Hay alergias repetidas'),
    enfermedades: z.array(enfermedadSchema).max(50).default([]).refine(sinRepetidos, 'Hay enfermedades repetidas'),
    observaciones: z.string().trim().max(1000).nullish(),
  })
  .strip();

export type GuardarFichaDto = z.infer<typeof guardarFichaSchema>;

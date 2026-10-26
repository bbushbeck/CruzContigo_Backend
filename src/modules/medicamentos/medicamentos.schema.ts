import { z } from 'zod';

// DECIMAL(10,2) viaja como texto para preservar precisión y evitar redondeos.
const decimal = z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, 'Usa un número de hasta 8 enteros y 2 decimales');
const fecha = z.string().regex(/^[1-9]\d{3}-\d{2}-\d{2}$/, 'Usa una fecha YYYY-MM-DD')
  .refine((valor) => {
    const timestamp = Date.parse(`${valor}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === valor;
  }, 'Fecha inválida').transform((valor) => new Date(`${valor}T00:00:00Z`));
const textoOpcional = (max: number) => z.string().trim().max(max).nullish();

export const medicamentoSchema = z.object({
  id: z.string().uuid().optional(),
  recipientID: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(120),
  presentation: textoOpcional(60),
  dose: decimal.refine((valor) => Number(valor) > 0, 'La dosis debe ser mayor que cero'),
  unit: textoOpcional(10),
  indication: z.string().trim().refine((valor) => Buffer.byteLength(valor, 'utf8') <= 65535,
    'La indicación excede el tamaño permitido').nullish(),
  frequency: textoOpcional(60),
  startDate: fecha,
  endDate: fecha.nullish(),
  stock: decimal.nullish(),
  refillThresholdDays: z.number().int().min(0).max(32767).default(5),
}).strict().refine((datos) => !datos.endDate || datos.endDate >= datos.startDate, {
  message: 'La fecha de fin no puede ser anterior a la fecha de inicio',
  path: ['endDate'],
});

export type MedicamentoDto = z.infer<typeof medicamentoSchema>;

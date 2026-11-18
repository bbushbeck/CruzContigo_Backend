import { z } from 'zod';
import { VERSION_AVISO } from '../accesos/accesos.schema';

export const rolesInvitables = ['administrador', 'cocuidador', 'solo_lectura', 'temporal'] as const;

export const DIAS_VIGENCIA_INVITACION = 7;
export const DIAS_MAXIMOS_ACCESO = 365;
export const MAXIMO_PENDIENTES = 20;

const DIA_MS = 24 * 60 * 60 * 1000;

export const invitarSchema = z
  .object({
    // Sin teléfono, la invitación solo se puede usar con el código o el enlace.
    telefono: z.string().trim().min(10, 'El teléfono debe tener 10 dígitos').max(20).nullish(),
    rol: z.enum(rolesInvitables, { errorMap: () => ({ message: `El rol debe ser uno de: ${rolesInvitables.join(', ')}` }) }),
    relacion: z.string().trim().max(40).nullish(),
    accesoHasta: z.coerce.date({ errorMap: () => ({ message: 'La fecha de vencimiento no es válida' }) }).nullish(),
    permisoFicha: z.boolean().default(false),
    versionAviso: z.string({ required_error: 'Falta la versión del aviso de privacidad' }),
    aceptaAviso: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad' }) }),
  })
  .strip()
  .refine((d) => d.versionAviso === VERSION_AVISO, {
    message: 'El aviso de privacidad cambió; revísalo de nuevo',
    path: ['versionAviso'],
  })
  .refine((d) => d.rol !== 'temporal' || Boolean(d.accesoHasta), {
    message: 'Indica hasta cuándo dura el acceso temporal',
    path: ['accesoHasta'],
  })
  .refine((d) => !d.accesoHasta || d.accesoHasta > new Date(), {
    message: 'La fecha de vencimiento debe ser futura',
    path: ['accesoHasta'],
  })
  .refine((d) => !d.accesoHasta || d.accesoHasta.getTime() <= Date.now() + DIAS_MAXIMOS_ACCESO * DIA_MS, {
    message: `El acceso puede durar como máximo ${DIAS_MAXIMOS_ACCESO} días`,
    path: ['accesoHasta'],
  });

export type InvitarDto = z.infer<typeof invitarSchema>;

const codigo = z.string({ required_error: 'Escribe el código' }).trim().min(8, 'El código está incompleto').max(20);

export const consultarSchema = z.object({ codigo }).strip();

export const aceptarSchema = z
  .object({
    codigo: codigo.optional(),
    invitacionId: z.string().uuid().toLowerCase().optional(),
  })
  .strip()
  .refine((d) => Boolean(d.codigo) !== Boolean(d.invitacionId), 'Envía el código o la invitación, no ambos');

export type AceptarDto = z.infer<typeof aceptarSchema>;

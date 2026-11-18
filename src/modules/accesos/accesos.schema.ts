import { z } from 'zod';

// Cambia cuando cambie el texto del aviso de privacidad que muestra la app.
export const VERSION_AVISO = '2026-11';

export const rolesAutorizables = ['cocuidador', 'solo_lectura', 'profesional'] as const;

export const DIAS_PROFESIONAL_PREDETERMINADOS = 7;
export const DIAS_PROFESIONAL_MAXIMOS = 30;

export const autorizarSchema = z
  .object({
    telefono: z.string({ required_error: 'El teléfono es obligatorio' }).trim().min(10, 'El teléfono debe tener 10 dígitos').max(20),
    rol: z.enum(rolesAutorizables, { errorMap: () => ({ message: `El rol debe ser uno de: ${rolesAutorizables.join(', ')}` }) }),
    relacion: z.string().trim().max(40).nullish(),
    diasVigencia: z.number().int().min(1).max(365).nullish(),
    versionAviso: z.string({ required_error: 'Falta la versión del aviso de privacidad' }),
    aceptaAviso: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar el aviso de privacidad' }) }),
  })
  .strip()
  .refine((d) => d.versionAviso === VERSION_AVISO, {
    message: 'El aviso de privacidad cambió; revísalo de nuevo',
    path: ['versionAviso'],
  })
  .refine((d) => d.rol !== 'profesional' || (d.diasVigencia ?? DIAS_PROFESIONAL_PREDETERMINADOS) <= DIAS_PROFESIONAL_MAXIMOS, {
    message: `El acceso profesional dura como máximo ${DIAS_PROFESIONAL_MAXIMOS} días`,
    path: ['diasVigencia'],
  });

export type AutorizarDto = z.infer<typeof autorizarSchema>;

// HU-19: el código QR de la ficha de emergencia solo existe con consentimiento.
export const qrSchema = z
  .object({
    consentido: z.boolean({ required_error: 'Indica si se comparte el código QR' }),
    versionAviso: z.string().optional(),
    aceptaAviso: z.boolean().optional(),
  })
  .strip()
  .refine((d) => !d.consentido || d.aceptaAviso === true, {
    message: 'Debes aceptar el aviso de privacidad',
    path: ['aceptaAviso'],
  })
  .refine((d) => !d.consentido || d.versionAviso === VERSION_AVISO, {
    message: 'El aviso de privacidad cambió; revísalo de nuevo',
    path: ['versionAviso'],
  });

export type QrDto = z.infer<typeof qrSchema>;

import type { RolMiembro } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from './http-error';

const rolesEdicion = new Set<RolMiembro>(['titular', 'administrador', 'cocuidador']);

export async function requerirAcceso(personaId: string, usuarioId: string, edicion = false) {
  const miembro = await prisma.miembroRed.findFirst({
    where: {
      personaId,
      usuarioId,
      estado: 'activo',
      OR: [{ venceEn: null }, { venceEn: { gt: new Date() } }],
    },
  });

  if (!miembro) throw new HttpError(403, 'No tienes acceso a esta persona');

  if (edicion && !rolesEdicion.has(miembro.rol)) {
    throw new HttpError(403, 'Tu rol no permite editar esta información');
  }

  return miembro;
}

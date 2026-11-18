import type { Prisma, RolMiembro } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from './http-error';

export const rolesEdicion = new Set<RolMiembro>(['titular', 'administrador', 'cocuidador']);

type OpcionesAcceso = {
  /** Exige un rol con permiso de edición. */
  edicion?: boolean;
  /** Permite el acceso acotado de un profesional bajo convenio (solo ficha médica). */
  profesional?: boolean;
};

export const miembroVigente = (): Prisma.MiembroRedWhereInput => ({
  estado: 'activo',
  OR: [{ venceEn: null }, { venceEn: { gt: new Date() } }],
});

// Se consulta en cada petición, sin caché: una revocación se aplica en la siguiente
// solicitud (RNF-05 pide ≤ 5 s).
export async function requerirAcceso(personaId: string, usuarioId: string, opciones: OpcionesAcceso = {}) {
  const miembro = await prisma.miembroRed.findFirst({
    where: { personaId, usuarioId, ...miembroVigente() },
  });

  if (!miembro) throw new HttpError(403, 'No tienes acceso a esta persona');

  if (miembro.rol === 'profesional') {
    if (!opciones.profesional) throw new HttpError(403, 'Tu acceso profesional se limita a la ficha médica');
    if (!(await tieneConvenioVigente(usuarioId))) {
      throw new HttpError(403, 'Tu acceso requiere un convenio institucional vigente');
    }
  }

  if (opciones.edicion && !rolesEdicion.has(miembro.rol)) {
    throw new HttpError(403, 'Tu rol no permite editar esta información');
  }

  return miembro;
}

export async function tieneConvenioVigente(usuarioId: string) {
  const ahora = new Date();
  const inicioDelDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  const registro = await prisma.profesionalConvenio.findFirst({
    where: {
      usuarioId,
      convenio: {
        activo: true,
        vigenteDesde: { lte: ahora },
        OR: [{ vigenteHasta: null }, { vigenteHasta: { gte: inicioDelDia } }],
      },
    },
    select: { usuarioId: true },
  });
  return registro !== null;
}

// La persona titular controla quién accede a sus datos. Si no tiene cuenta propia
// (por ejemplo, un menor o un adulto mayor sin teléfono), lo ejerce su responsable:
// los administradores de su red.
export async function requerirGestor(personaId: string, usuarioId: string) {
  const persona = await prisma.personaCuidada.findUnique({
    where: { id: personaId },
    select: {
      titularUsuarioId: true,
      miembros: {
        where: { rol: { in: ['titular', 'administrador'] }, ...miembroVigente() },
        select: { usuarioId: true, rol: true },
      },
    },
  });
  if (!persona) throw new HttpError(403, 'No tienes acceso a esta persona');

  const titulares = persona.miembros.filter((m) => m.rol === 'titular').map((m) => m.usuarioId);
  if (persona.titularUsuarioId) titulares.push(persona.titularUsuarioId);
  const gestores = titulares.length
    ? titulares
    : persona.miembros.filter((m) => m.rol === 'administrador').map((m) => m.usuarioId);

  if (!gestores.includes(usuarioId)) {
    throw new HttpError(403, 'Solo la persona titular o su responsable puede autorizar o revocar accesos');
  }
}

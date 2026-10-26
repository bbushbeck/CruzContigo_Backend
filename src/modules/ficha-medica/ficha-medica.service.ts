import { Prisma } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos } from '../../common/utils/fechas';
import type { GuardarFichaDto } from './ficha-medica.schema';

const conFicha = {
  ficha: { select: { tipoSanguineo: true, medicoTratante: true, institucionSalud: true, observaciones: true, actualizadoEn: true } },
  alergias: true,
  padecimientos: true,
} satisfies Prisma.PersonaCuidadaInclude;

type PersonaConFicha = Prisma.PersonaCuidadaGetPayload<{ include: typeof conFicha }>;

function aRespuesta(persona: PersonaConFicha) {
  const { ficha } = persona;
  return {
    familiarID: persona.id,
    tipoSanguineo: ficha?.tipoSanguineo ?? 'desconocido',
    alergias: persona.alergias.map(({ id, sustancia, severidad }) => ({ id, nombre: sustancia, severidad })),
    enfermedades: persona.padecimientos.map(({ id, nombre, notas }) => ({ id, nombre, notas })),
    medicoTratante: ficha?.medicoTratante ?? null,
    institucionSalud: ficha?.institucionSalud ?? null,
    observaciones: ficha?.observaciones ?? null,
    ultimaActualizacion: isoSinMilisegundos(ficha?.actualizadoEn ?? persona.creadoEn),
  };
}

export async function obtener(personaId: string) {
  const persona = await prisma.personaCuidada.findUnique({ where: { id: personaId }, include: conFicha });
  if (!persona) throw new HttpError(404, 'Persona no encontrada');
  if (!persona.ficha && !persona.alergias.length && !persona.padecimientos.length) return null;
  return aRespuesta(persona);
}

export async function guardar(idRecibido: string, datos: GuardarFichaDto, usuarioId?: string) {
  const existe = await prisma.personaCuidada.findUnique({ where: { id: idRecibido }, select: { id: true } });
  if (!existe) throw new HttpError(404, 'Persona no encontrada');
  const personaId = existe.id;

  const campos = {
    tipoSanguineo: datos.tipoSanguineo === 'desconocido' ? null : datos.tipoSanguineo,
    medicoTratante: datos.medicoTratante || null,
    institucionSalud: datos.institucionSalud || null,
    observaciones: datos.observaciones || null,
    actualizadoPor: usuarioId ?? null,
  };

  try {
    const persona = await prisma.$transaction(async (tx) => {
      await tx.fichaMedica.upsert({ where: { personaId }, create: { personaId, ...campos }, update: campos });
      await tx.alergia.deleteMany({ where: { personaId } });
      await tx.alergia.createMany({
        data: datos.alergias.map((a) => ({ id: a.id, personaId, sustancia: a.nombre, severidad: a.severidad })),
      });
      await tx.padecimiento.deleteMany({ where: { personaId } });
      await tx.padecimiento.createMany({
        data: datos.enfermedades.map((e) => ({ id: e.id, personaId, nombre: e.nombre, notas: e.notas || null })),
      });
      return tx.personaCuidada.findUniqueOrThrow({ where: { id: personaId }, include: conFicha });
    });
    return aRespuesta(persona);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new HttpError(409, 'Hay elementos con un identificador repetido');
      if (error.code === 'P2003') throw new HttpError(400, 'El usuario indicado no existe');
    }
    throw error;
  }
}

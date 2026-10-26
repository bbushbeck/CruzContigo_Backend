import { Prisma, type TipoSanguineo } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos } from '../../common/utils/fechas';
import { tiposSanguineosApp, type GuardarFichaDto, type TipoSanguineoApp } from './ficha-medica.schema';

const conDetalle = { alergias: true, padecimientos: true } satisfies Prisma.FichaMedicaInclude;

type FichaConDetalle = Prisma.FichaMedicaGetPayload<{ include: typeof conDetalle }>;

const tipoAApp = Object.fromEntries(
  Object.entries(tiposSanguineosApp).map(([app, db]) => [db, app]),
) as Record<TipoSanguineo, TipoSanguineoApp>;

function aRespuesta(ficha: FichaConDetalle) {
  return {
    familiarID: ficha.personaId,
    tipoSanguineo: tipoAApp[ficha.tipoSanguineo],
    alergias: ficha.alergias.map(({ id, nombre, severidad }) => ({ id, nombre, severidad })),
    enfermedades: ficha.padecimientos.map(({ id, nombre, notas }) => ({ id, nombre, notas })),
    observaciones: ficha.observaciones,
    ultimaActualizacion: isoSinMilisegundos(ficha.actualizadoEn),
  };
}

export async function obtener(personaId: string) {
  const ficha = await prisma.fichaMedica.findUnique({ where: { personaId }, include: conDetalle });
  if (!ficha) throw new HttpError(404, 'La persona no tiene ficha médica');
  return aRespuesta(ficha);
}

export async function guardar(personaId: string, datos: GuardarFichaDto) {
  const persona = await prisma.personaCuidada.findUnique({ where: { id: personaId }, select: { id: true } });
  if (!persona) throw new HttpError(404, 'Persona no encontrada');

  const campos = {
    tipoSanguineo: tiposSanguineosApp[datos.tipoSanguineo],
    observaciones: datos.observaciones || null,
  };
  const alergias = datos.alergias.map((a) => ({ id: a.id, nombre: a.nombre, severidad: a.severidad }));
  const padecimientos = datos.enfermedades.map((e) => ({ id: e.id, nombre: e.nombre, notas: e.notas || null }));

  try {
    const ficha = await prisma.$transaction(async (tx) => {
      await tx.alergia.deleteMany({ where: { personaId } });
      await tx.padecimiento.deleteMany({ where: { personaId } });
      return tx.fichaMedica.upsert({
        where: { personaId },
        create: { personaId, ...campos, alergias: { create: alergias }, padecimientos: { create: padecimientos } },
        update: { ...campos, alergias: { create: alergias }, padecimientos: { create: padecimientos } },
        include: conDetalle,
      });
    });
    return aRespuesta(ficha);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Hay elementos con un identificador repetido');
    }
    throw error;
  }
}

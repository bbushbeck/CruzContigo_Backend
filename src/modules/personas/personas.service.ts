import { Prisma, type TipoCuidado } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos, mediodiaUTC, soloFecha } from '../../common/utils/fechas';
import { parentescos, tiposCuidadoApp, type CrearPersonaDto, type TipoCuidadoApp } from './personas.schema';

const MARCA_ELIMINADO = '[eliminado]';

const conMiembros = { miembros: { select: { usuarioId: true, relacion: true } } } satisfies Prisma.PersonaCuidadaInclude;

type PersonaConMiembros = Prisma.PersonaCuidadaGetPayload<{ include: typeof conMiembros }>;

const tipoAApp = Object.fromEntries(
  Object.entries(tiposCuidadoApp).map(([app, db]) => [db, app]),
) as Record<TipoCuidado, TipoCuidadoApp>;

function aRespuesta(persona: PersonaConMiembros, usuarioId?: string) {
  const [nombre, ...resto] = persona.nombre.trim().split(/\s+/);
  const miembro = persona.miembros.find((m) => m.usuarioId === usuarioId) ?? persona.miembros[0];
  const relacion = miembro?.relacion?.toLowerCase();
  const parentesco = parentescos.find((p) => p === relacion) ?? 'otro';

  return {
    id: persona.id,
    nombre,
    apellidos: resto.join(' '),
    fechaNacimiento: isoSinMilisegundos(mediodiaUTC(persona.fechaNacimiento)),
    parentesco,
    tipoCuidado: tipoAApp[persona.tipoCuidado],
    telefono: persona.telefono,
    notas: null,
    fechaRegistro: isoSinMilisegundos(persona.creadoEn),
  };
}

export async function listar(usuarioId?: string) {
  const personas = await prisma.personaCuidada.findMany({
    where: {
      NOT: { nombre: { startsWith: MARCA_ELIMINADO } },
      ...(usuarioId ? { miembros: { some: { usuarioId, estado: { in: ['activo', 'invitado'] } } } } : {}),
    },
    include: conMiembros,
    orderBy: { creadoEn: 'asc' },
  });
  return personas.map((p) => aRespuesta(p, usuarioId));
}

export async function obtener(id: string, usuarioId?: string) {
  const persona = await prisma.personaCuidada.findFirst({
    where: { id, NOT: { nombre: { startsWith: MARCA_ELIMINADO } } },
    include: conMiembros,
  });
  if (!persona) throw new HttpError(404, 'Persona no encontrada');
  return aRespuesta(persona, usuarioId);
}

export async function crear(datos: CrearPersonaDto, usuarioId?: string) {
  try {
    const persona = await prisma.personaCuidada.create({
      data: {
        ...(datos.id ? { id: datos.id } : {}),
        nombre: `${datos.nombre} ${datos.apellidos}`.trim(),
        fechaNacimiento: soloFecha(datos.fechaNacimiento),
        telefono: datos.telefono ?? null,
        tipoCuidado: tiposCuidadoApp[datos.tipoCuidado],
        creadoPor: usuarioId ?? null,
        ...(usuarioId
          ? { miembros: { create: { usuarioId, rol: 'administrador', relacion: datos.parentesco, estado: 'activo' } } }
          : {}),
      },
      include: conMiembros,
    });
    const respuesta = aRespuesta(persona, usuarioId);
    return usuarioId ? respuesta : { ...respuesta, parentesco: datos.parentesco };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') throw new HttpError(409, 'Ya existe una persona con ese identificador');
      if (error.code === 'P2003') throw new HttpError(400, 'El usuario indicado no existe');
    }
    throw error;
  }
}

export async function eliminar(id: string) {
  try {
    await prisma.personaCuidada.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') throw new HttpError(404, 'Persona no encontrada');
      if (error.code === 'P2003') throw new HttpError(409, 'La persona tiene registros asociados y no se puede eliminar');
    }
    throw error;
  }
}

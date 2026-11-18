import { randomUUID } from 'node:crypto';
import { Prisma, type Recordatorio } from '@prisma/client';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos } from '../../common/utils/fechas';
import { prisma } from '../../database/cliente';

type RecordatorioDto = {
  familiarID: string;
  titulo: string;
  fecha: Date;
  completado: boolean;
};

const prefijoRegla = 'X-CRUZCONTIGO-PROGRAMACION:1\r\nDTSTART:';
const registroDeLaApp = {
  tipo: 'tarea',
  medicamentoId: null,
  citaId: null,
  reglaRecurrencia: { startsWith: prefijoRegla },
} satisfies Prisma.RecordatorioWhereInput;

function accesoPersona(usuarioId: string, escritura = false): Prisma.PersonaCuidadaWhereInput {
  return {
    NOT: { nombre: { startsWith: '[eliminado]' } },
    OR: [
      { titularUsuarioId: usuarioId },
      { miembros: { some: {
        usuarioId,
        estado: 'activo',
        OR: [{ venceEn: null }, { venceEn: { gt: new Date() } }],
        ...(escritura ? { rol: { in: ['titular', 'administrador', 'cocuidador'] } } : {}),
      } } },
    ],
  };
}

// Regla de una sola ocurrencia en UTC. El estado se guarda explícitamente:
// activo controla si se ejecuta el aviso, independientemente de marcarlo atendido.
function datosParaDB({ familiarID, titulo, fecha, completado }: RecordatorioDto) {
  const inicio = isoSinMilisegundos(fecha).replace(/[-:]/g, '');
  return {
    personaId: familiarID,
    titulo,
    reglaRecurrencia: `${prefijoRegla}${inicio}\r\nX-CRUZCONTIGO-ESTADO:${completado ? 'COMPLETADO' : 'PENDIENTE'}`,
    activo: !completado,
  };
}

function aRespuesta({ id, personaId, titulo, reglaRecurrencia }: Recordatorio) {
  if (!reglaRecurrencia.startsWith(prefijoRegla)) return null;
  const regla = reglaRecurrencia.slice(prefijoRegla.length);
  const coincidencia = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\r\nX-CRUZCONTIGO-ESTADO:(PENDIENTE|COMPLETADO)$/.exec(regla);
  if (!coincidencia) return null;
  const [, anio, mes, dia, hora, minuto, segundo, estado] = coincidencia;
  const fecha = `${anio}-${mes}-${dia}T${hora}:${minuto}:${segundo}Z`;
  const instante = new Date(fecha);
  if (!Number.isFinite(instante.getTime()) || isoSinMilisegundos(instante) !== fecha) return null;
  return { id, familiarID: personaId, titulo, fecha, completado: estado === 'COMPLETADO' };
}

export async function listar(usuarioId: string) {
  const recordatorios = await prisma.recordatorio.findMany({
    where: { ...registroDeLaApp, persona: accesoPersona(usuarioId) },
  });
  return recordatorios.flatMap((recordatorio) => {
    const respuesta = aRespuesta(recordatorio);
    return respuesta ? [respuesta] : [];
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
}

async function exigirAccesoDeEscritura(
  db: Prisma.TransactionClient, usuarioId: string, id: string,
) {
  const persona = await db.personaCuidada.findUnique({
    where: { ...accesoPersona(usuarioId, true), id },
    select: { id: true },
  });
  if (!persona) throw new HttpError(404, 'El familiar no está disponible para tu cuenta. Verifica tu acceso en su red de cuidado.');
}

export async function crear(usuarioId: string, datos: RecordatorioDto) {
  try {
    return await prisma.$transaction(async (db) => {
      await exigirAccesoDeEscritura(db, usuarioId, datos.familiarID);
      return aRespuesta(await db.recordatorio.create({ data: { id: randomUUID(), ...datosParaDB(datos), tipo: 'tarea' } }));
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new HttpError(404, 'Familiar no disponible');
    }
    throw error;
  }
}

export async function actualizar(usuarioId: string, id: string, datos: RecordatorioDto) {
  try {
    return await prisma.$transaction(async (db) => {
      await exigirAccesoDeEscritura(db, usuarioId, datos.familiarID);
      const actualizado = await db.recordatorio.update({
        where: { id, ...registroDeLaApp, persona: accesoPersona(usuarioId, true) },
        data: datosParaDB(datos),
      });
      return aRespuesta(actualizado);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') throw new HttpError(404, 'Recordatorio no disponible para editar');
      if (error.code === 'P2003') throw new HttpError(404, 'Familiar no disponible');
    }
    throw error;
  }
}

export async function eliminar(usuarioId: string, id: string) {
  const resultado = await prisma.recordatorio.deleteMany({
    where: { id, ...registroDeLaApp, persona: accesoPersona(usuarioId, true) },
  });
  if (!resultado.count) throw new HttpError(404, 'Recordatorio no disponible para eliminar');
}

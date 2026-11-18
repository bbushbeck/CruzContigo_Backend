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

const prefijoCompartido = 'X-CRUZCONTIGO-PROGRAMACION:1\r\nDTSTART:';
const registroDeLaApp = {
  tipo: 'tarea',
  medicamentoId: null,
  citaId: null,
} satisfies Prisma.RecordatorioWhereInput;

function prefijoPersonal(usuarioId: string) {
  return `X-CRUZCONTIGO-PROGRAMACION:2\r\nX-CRUZCONTIGO-USUARIO:${usuarioId.toLowerCase()}\r\nDTSTART:`;
}

function accesoPersona(usuarioId: string, escritura = false): Prisma.PersonaCuidadaWhereInput {
  return {
    NOT: { nombre: { startsWith: '[eliminado]' } },
    OR: [
      { titularUsuarioId: usuarioId },
      { miembros: { some: {
        usuarioId,
        estado: 'activo',
        OR: [{ venceEn: null }, { venceEn: { gt: new Date() } }],
        // Un profesional bajo convenio solo consulta la ficha médica (minimización por rol).
        rol: escritura ? { in: ['titular', 'administrador', 'cocuidador'] } : { not: 'profesional' },
      } } },
    ],
  };
}

function accesoRecordatorio(usuarioId: string, escritura = false): Prisma.RecordatorioWhereInput {
  return {
    ...registroDeLaApp,
    OR: [
      { reglaRecurrencia: { startsWith: prefijoCompartido }, persona: accesoPersona(usuarioId, escritura) },
      { reglaRecurrencia: { startsWith: prefijoPersonal(usuarioId) } },
    ],
  };
}

// Regla de una sola ocurrencia en UTC. El estado se guarda explícitamente:
// activo controla si se ejecuta el aviso, independientemente de marcarlo atendido.
function datosParaDB({ familiarID, titulo, fecha, completado }: RecordatorioDto, prefijo: string) {
  const inicio = isoSinMilisegundos(fecha).replace(/[-:]/g, '');
  return {
    personaId: familiarID,
    titulo,
    reglaRecurrencia: `${prefijo}${inicio}\r\nX-CRUZCONTIGO-ESTADO:${completado ? 'COMPLETADO' : 'PENDIENTE'}`,
    activo: !completado,
  };
}

function aRespuesta({ id, personaId, titulo, reglaRecurrencia }: Recordatorio, usuarioId: string) {
  const prefijo = reglaRecurrencia.startsWith(prefijoCompartido) ? prefijoCompartido : prefijoPersonal(usuarioId);
  if (!reglaRecurrencia.startsWith(prefijo)) return null;
  const regla = reglaRecurrencia.slice(prefijo.length);
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
    where: accesoRecordatorio(usuarioId),
  });
  return recordatorios.flatMap((recordatorio) => {
    const respuesta = aRespuesta(recordatorio, usuarioId);
    return respuesta ? [respuesta] : [];
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
}

async function prefijoParaFamiliar(db: Prisma.TransactionClient, usuarioId: string, id: string) {
  const vinculado = await db.personaCuidada.findUnique({
    where: { ...accesoPersona(usuarioId, true), id },
    select: { id: true },
  });
  if (vinculado) return prefijoCompartido;

  // Los familiares de versiones anteriores se guardaban sin una cuenta vinculada.
  // Un aviso personal no reclama al familiar ni otorga acceso a avisos de otros.
  const sinVinculo = await db.personaCuidada.findUnique({
    where: {
      id,
      titularUsuarioId: null,
      creadoPor: null,
      miembros: { none: {} },
      NOT: { nombre: { startsWith: '[eliminado]' } },
    },
    select: { id: true },
  });
  if (sinVinculo) return prefijoPersonal(usuarioId);

  throw new HttpError(404, 'Elige otro familiar o registra uno desde Personas con tu sesión iniciada.');
}

export async function crear(usuarioId: string, datos: RecordatorioDto) {
  try {
    return await prisma.$transaction(async (db) => {
      const prefijo = await prefijoParaFamiliar(db, usuarioId, datos.familiarID);
      const creado = await db.recordatorio.create({
        data: { id: randomUUID(), ...datosParaDB(datos, prefijo), tipo: 'tarea' },
      });
      return aRespuesta(creado, usuarioId);
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
      const acceso = accesoRecordatorio(usuarioId, true);
      const actual = await db.recordatorio.findUnique({ where: { ...acceso, id } });
      if (!actual || !aRespuesta(actual, usuarioId)) {
        throw new HttpError(404, 'Recordatorio no disponible para editar');
      }

      const propio = prefijoPersonal(usuarioId);
      const personal = actual.reglaRecurrencia.startsWith(propio);
      const destino = datos.familiarID === actual.personaId.toLowerCase()
        ? prefijoCompartido
        : await prefijoParaFamiliar(db, usuarioId, datos.familiarID);
      const actualizado = await db.recordatorio.update({
        where: { ...acceso, id, reglaRecurrencia: actual.reglaRecurrencia },
        data: datosParaDB(datos, personal ? propio : destino),
      });
      return aRespuesta(actualizado, usuarioId);
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
    where: { id, ...accesoRecordatorio(usuarioId, true) },
  });
  if (!resultado.count) throw new HttpError(404, 'Recordatorio no disponible para eliminar');
}

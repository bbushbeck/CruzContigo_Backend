import { Prisma, type RecordatorioUsuario } from '@prisma/client';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos } from '../../common/utils/fechas';
import { prisma } from '../../database/cliente';
import * as personas from '../personas/personas.service';

type RecordatorioDto = {
  familiarID: string;
  titulo: string;
  fecha: Date;
  completado: boolean;
};

function aRespuesta({ id, personaId, titulo, fecha, completado }: RecordatorioUsuario) {
  return { id, familiarID: personaId, titulo, fecha: isoSinMilisegundos(fecha), completado };
}

function datosParaDB({ familiarID, titulo, fecha, completado }: RecordatorioDto) {
  return { personaId: familiarID, titulo, fecha, completado };
}

export async function listar(usuarioId: string) {
  const recordatorios = await prisma.recordatorioUsuario.findMany({
    where: { usuarioId },
    orderBy: [{ fecha: 'asc' }, { id: 'asc' }],
  });
  return recordatorios.map(aRespuesta);
}

export async function crear(usuarioId: string, datos: RecordatorioDto) {
  await personas.obtener(datos.familiarID);
  try {
    return aRespuesta(await prisma.recordatorioUsuario.create({
      data: { ...datosParaDB(datos), usuarioId },
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new HttpError(404, 'Familiar no disponible');
    }
    throw error;
  }
}

export async function actualizar(usuarioId: string, id: string, datos: RecordatorioDto) {
  await personas.obtener(datos.familiarID);
  try {
    return aRespuesta(await prisma.recordatorioUsuario.update({
      where: { id, usuarioId },
      data: datosParaDB(datos),
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') throw new HttpError(404, 'Recordatorio no encontrado');
      if (error.code === 'P2003') throw new HttpError(404, 'Familiar no disponible');
    }
    throw error;
  }
}

export async function eliminar(usuarioId: string, id: string) {
  const resultado = await prisma.recordatorioUsuario.deleteMany({ where: { id, usuarioId } });
  if (!resultado.count) throw new HttpError(404, 'Recordatorio no encontrado');
}

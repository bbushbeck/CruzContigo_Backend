import { Prisma, type Medicamento } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import * as personas from '../personas/personas.service';
import type { MedicamentoDto } from './medicamentos.schema';

function aRespuesta(medicamento: Medicamento) {
  return {
    id: medicamento.id,
    recipientID: medicamento.personaId,
    name: medicamento.nombre,
    presentation: medicamento.presentacion,
    dose: medicamento.dosis.toFixed(2),
    unit: medicamento.unidad,
    frequency: medicamento.frecuencia,
    startDate: medicamento.inicio.toISOString().slice(0, 10),
    endDate: medicamento.fin ? medicamento.fin.toISOString().slice(0, 10) : null,
    indication: medicamento.indicacion,
    stock: medicamento.existencias?.toFixed(2) ?? null,
    refillThresholdDays: medicamento.umbralResurtidoDias,
  };
}

function datosParaDB(personaId: string, datos: MedicamentoDto) {
  if (datos.recipientID && datos.recipientID.toLowerCase() !== personaId.toLowerCase()) {
    throw new HttpError(400, 'El familiar del medicamento no coincide con la ruta');
  }
  return {
    nombre: datos.name,
    presentacion: datos.presentation ?? null,
    dosis: datos.dose,
    unidad: datos.unit ?? null,
    frecuencia: datos.frequency ?? null,
    inicio: datos.startDate,
    fin: datos.endDate ?? null,
    indicacion: datos.indication ?? null,
    existencias: datos.stock ?? null,
    umbralResurtidoDias: datos.refillThresholdDays,
  };
}

export async function listar(personaId: string) {
  await personas.obtener(personaId);
  const medicamentos = await prisma.medicamento.findMany({
    where: { personaId },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
  });
  return medicamentos.map(aRespuesta);
}

export async function crear(personaId: string, datos: MedicamentoDto) {
  await personas.obtener(personaId);
  const contenido = datosParaDB(personaId, datos);
  try {
    return aRespuesta(await prisma.medicamento.create({
      data: { ...contenido, personaId, id: datos.id ?? randomUUID() },
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'Ya existe un medicamento con ese identificador');
    }
    throw error;
  }
}

// Conserva la edición que ya ofrece la pantalla de detalle de iOS.
export async function actualizar(personaId: string, id: string, datos: MedicamentoDto) {
  await personas.obtener(personaId);
  if (datos.id && datos.id.toLowerCase() !== id.toLowerCase()) {
    throw new HttpError(400, 'El identificador del medicamento no coincide con la ruta');
  }
  const contenido = datosParaDB(personaId, datos);
  try {
    return aRespuesta(await prisma.medicamento.update({
      where: { id, personaId }, data: contenido,
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new HttpError(404, 'Medicamento no encontrado para este familiar');
    }
    throw error;
  }
}

export async function eliminar(personaId: string, id: string) {
  await personas.obtener(personaId);
  const resultado = await prisma.medicamento.deleteMany({ where: { id, personaId } });
  if (!resultado.count) throw new HttpError(404, 'Medicamento no encontrado para este familiar');
}

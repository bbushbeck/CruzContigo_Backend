import type { ContactoEmergencia } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import { requerirAcceso } from '../../common/utils/permisos';
import { MAXIMO_CONTACTOS, type ContactoDto } from './contactos.schema';

function aRespuesta(contacto: ContactoEmergencia) {
  return {
    id: contacto.id,
    nombre: contacto.nombre,
    telefono: contacto.telefono,
    parentesco: contacto.parentesco,
    prioridad: contacto.prioridad,
  };
}

async function listarOrdenados(personaId: string) {
  return prisma.contactoEmergencia.findMany({
    where: { personaId },
    orderBy: [{ prioridad: 'asc' }, { creadoEn: 'asc' }],
  });
}

// Cualquier integrante (incluido un acceso temporal) los consulta: sirven en una emergencia.
export async function listar(personaId: string, usuarioId: string) {
  await requerirAcceso(personaId, usuarioId);
  return (await listarOrdenados(personaId)).map(aRespuesta);
}

export async function crear(personaId: string, datos: ContactoDto, usuarioId: string) {
  await requerirAcceso(personaId, usuarioId, { edicion: true });
  const actuales = await prisma.contactoEmergencia.count({ where: { personaId } });
  if (actuales >= MAXIMO_CONTACTOS) throw new HttpError(409, `Puedes registrar hasta ${MAXIMO_CONTACTOS} contactos`);

  const contacto = await prisma.contactoEmergencia.create({
    data: {
      personaId,
      nombre: datos.nombre,
      telefono: datos.telefono,
      parentesco: datos.parentesco ?? null,
      prioridad: actuales + 1,
      creadoPor: usuarioId,
    },
  });
  return aRespuesta(contacto);
}

export async function actualizar(personaId: string, contactoId: string, datos: ContactoDto, usuarioId: string) {
  await requerirAcceso(personaId, usuarioId, { edicion: true });
  const resultado = await prisma.contactoEmergencia.updateMany({
    where: { id: contactoId, personaId },
    data: { nombre: datos.nombre, telefono: datos.telefono, parentesco: datos.parentesco ?? null },
  });
  if (resultado.count === 0) throw new HttpError(404, 'Ese contacto no existe');
  return aRespuesta(await prisma.contactoEmergencia.findUniqueOrThrow({ where: { id: contactoId } }));
}

export async function eliminar(personaId: string, contactoId: string, usuarioId: string) {
  await requerirAcceso(personaId, usuarioId, { edicion: true });
  await prisma.$transaction(async (tx) => {
    const resultado = await tx.contactoEmergencia.deleteMany({ where: { id: contactoId, personaId } });
    if (resultado.count === 0) throw new HttpError(404, 'Ese contacto no existe');
    // Sin huecos: la prioridad sigue siendo 1, 2, 3…
    const restantes = await tx.contactoEmergencia.findMany({ where: { personaId }, orderBy: { prioridad: 'asc' } });
    for (const [indice, contacto] of restantes.entries()) {
      if (contacto.prioridad !== indice + 1) {
        await tx.contactoEmergencia.update({ where: { id: contacto.id }, data: { prioridad: indice + 1 } });
      }
    }
  });
}

export async function ordenar(personaId: string, ids: string[], usuarioId: string) {
  await requerirAcceso(personaId, usuarioId, { edicion: true });
  return prisma.$transaction(async (tx) => {
    const actuales = await tx.contactoEmergencia.findMany({ where: { personaId }, select: { id: true } });
    const existentes = new Set(actuales.map((c) => c.id));
    if (ids.length !== existentes.size || !ids.every((id) => existentes.has(id))) {
      throw new HttpError(409, 'La lista de contactos cambió. Vuelve a cargarla.');
    }
    for (const [indice, id] of ids.entries()) {
      await tx.contactoEmergencia.update({ where: { id }, data: { prioridad: indice + 1 } });
    }
    const ordenados = await tx.contactoEmergencia.findMany({ where: { personaId }, orderBy: { prioridad: 'asc' } });
    return ordenados.map(aRespuesta);
  });
}

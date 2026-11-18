import type { NotaDiario, RolMiembro } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos } from '../../common/utils/fechas';
import { requerirAcceso } from '../../common/utils/permisos';
import { telefonoEnmascarado, usuariosPorId } from '../accesos/accesos.service';
import type { FiltroDto, NotaDto } from './diario.schema';

const POR_PAGINA = 50;

// Escriben quienes cuidan, incluido un cuidador temporal en su turno (HU-26).
const rolesEscritura = new Set<RolMiembro>(['titular', 'administrador', 'cocuidador', 'temporal']);

async function requerirEscritura(personaId: string, usuarioId: string) {
  const miembro = await requerirAcceso(personaId, usuarioId);
  if (!rolesEscritura.has(miembro.rol)) throw new HttpError(403, 'Tu rol solo permite leer el diario');
}

async function aRespuestas(notas: NotaDiario[], usuarioId: string) {
  const autores = await usuariosPorId(notas.map((n) => n.autorId));
  return notas.map((nota) => {
    const autor = autores.get(nota.autorId);
    return {
      id: nota.id,
      familiarID: nota.personaId,
      categoria: nota.categoria,
      texto: nota.texto,
      fecha: isoSinMilisegundos(nota.fecha),
      creadoEn: isoSinMilisegundos(nota.creadoEn),
      editadoEn: nota.editadoEn ? isoSinMilisegundos(nota.editadoEn) : null,
      autor: {
        nombre: autor?.nombre || telefonoEnmascarado(autor?.telefono) || 'Integrante de la red',
        esTuyo: nota.autorId === usuarioId,
      },
    };
  });
}

export async function listar(personaId: string, filtro: FiltroDto, usuarioId: string) {
  await requerirAcceso(personaId, usuarioId);
  const notas = await prisma.notaDiario.findMany({
    where: {
      personaId,
      ...(filtro.categoria ? { categoria: filtro.categoria } : {}),
      ...(filtro.antes ? { fecha: { lt: filtro.antes } } : {}),
    },
    orderBy: [{ fecha: 'desc' }, { creadoEn: 'desc' }],
    take: POR_PAGINA,
  });
  return aRespuestas(notas, usuarioId);
}

export async function crear(personaId: string, datos: NotaDto, usuarioId: string) {
  await requerirEscritura(personaId, usuarioId);
  const nota = await prisma.notaDiario.create({
    data: { personaId, autorId: usuarioId, categoria: datos.categoria, texto: datos.texto, fecha: datos.fecha ?? new Date() },
  });
  const [respuesta] = await aRespuestas([nota], usuarioId);
  return respuesta;
}

// Cada nota la edita o borra solo quien la escribió, para que el autor sea fiable.
async function notaPropia(personaId: string, notaId: string, usuarioId: string) {
  await requerirEscritura(personaId, usuarioId);
  const nota = await prisma.notaDiario.findFirst({ where: { id: notaId, personaId } });
  if (!nota) throw new HttpError(404, 'Esa nota no existe');
  if (nota.autorId !== usuarioId) throw new HttpError(403, 'Solo quien escribió la nota puede cambiarla');
  return nota;
}

export async function actualizar(personaId: string, notaId: string, datos: NotaDto, usuarioId: string) {
  const nota = await notaPropia(personaId, notaId, usuarioId);
  const actualizada = await prisma.notaDiario.update({
    where: { id: nota.id },
    data: { categoria: datos.categoria, texto: datos.texto, fecha: datos.fecha ?? nota.fecha, editadoEn: new Date() },
  });
  const [respuesta] = await aRespuestas([actualizada], usuarioId);
  return respuesta;
}

export async function eliminar(personaId: string, notaId: string, usuarioId: string) {
  const nota = await notaPropia(personaId, notaId, usuarioId);
  await prisma.notaDiario.delete({ where: { id: nota.id } });
}

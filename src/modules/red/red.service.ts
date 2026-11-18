import { createHash, randomInt } from 'node:crypto';
import { Prisma, type Invitacion } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos } from '../../common/utils/fechas';
import type { Sesion } from '../../common/utils/autenticacion';
import { requerirGestor, requerirIntegrante, rolGestor } from '../../common/utils/permisos';
import { telefonoValido } from '../auth/auth.service';
import { aMiembro, telefonoEnmascarado, usuariosPorId } from '../accesos/accesos.service';
import { DIAS_VIGENCIA_INVITACION, MAXIMO_PENDIENTES, type AceptarDto, type InvitarDto } from './red.schema';

const DIA_MS = 24 * 60 * 60 * 1000;
// Sin 0/O, 1/I/L: se dicta y se escribe sin confusiones.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 10;

function normalizarCodigo(codigo: string) {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function hashCodigo(codigo: string) {
  return createHash('sha256').update(normalizarCodigo(codigo)).digest('hex');
}

function generarCodigo() {
  const caracteres = Array.from({ length: LARGO_CODIGO }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return `${caracteres.slice(0, 5)}-${caracteres.slice(5)}`;
}

const pendiente = (): Prisma.InvitacionWhereInput => ({
  aceptadaEn: null,
  canceladaEn: null,
  expiraEn: { gt: new Date() },
});

function estaVigente(invitacion: Invitacion) {
  return !invitacion.aceptadaEn && !invitacion.canceladaEn && invitacion.expiraEn > new Date();
}

function aEnviada(invitacion: Invitacion) {
  return {
    id: invitacion.id,
    telefono: telefonoEnmascarado(invitacion.telefono ?? undefined),
    rol: invitacion.rol,
    relacion: invitacion.relacion,
    accesoHasta: invitacion.accesoHasta ? isoSinMilisegundos(invitacion.accesoHasta) : null,
    permisoFicha: invitacion.permisoFicha,
    expiraEn: isoSinMilisegundos(invitacion.expiraEn),
  };
}

async function aRecibidas(invitaciones: (Invitacion & { persona: { nombre: string } })[]) {
  const usuarios = await usuariosPorId(invitaciones.map((i) => i.creadaPor));
  return invitaciones.map((i) => {
    const autor = usuarios.get(i.creadaPor);
    return {
      id: i.id,
      familiarNombre: i.persona.nombre,
      rol: i.rol,
      relacion: i.relacion,
      accesoHasta: i.accesoHasta ? isoSinMilisegundos(i.accesoHasta) : null,
      permisoFicha: i.permisoFicha,
      expiraEn: isoSinMilisegundos(i.expiraEn),
      invitadaPor: autor?.nombre || telefonoEnmascarado(autor?.telefono) || 'Un familiar',
    };
  });
}

async function telefonoDe(usuarioId: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { telefono: true } });
  if (!usuario) throw new HttpError(401, 'Sesión inválida o vencida');
  return usuario.telefono;
}

// MARK: - Cuidador principal

export async function red(personaId: string, usuarioId: string) {
  await requerirIntegrante(personaId, usuarioId);
  const puedeInvitar = (await rolGestor(personaId, usuarioId)) !== null;

  const miembros = await prisma.miembroRed.findMany({ where: { personaId, estado: 'activo' } });
  const usuarios = await usuariosPorId(miembros.map((m) => m.usuarioId));
  const invitaciones = puedeInvitar
    ? await prisma.invitacion.findMany({ where: { personaId, ...pendiente() }, orderBy: { creadoEn: 'desc' } })
    : [];

  return {
    puedeInvitar,
    // Los accesos profesionales solo los ve quien los administra.
    miembros: miembros
      .filter((m) => puedeInvitar || m.rol !== 'profesional')
      .map((m) => aMiembro(m, usuarios.get(m.usuarioId), usuarioId)),
    invitaciones: invitaciones.map(aEnviada),
  };
}

export async function invitar(personaId: string, datos: InvitarDto, sesion: Sesion) {
  await requerirGestor(personaId, sesion.usuarioId);

  const pendientes = await prisma.invitacion.count({ where: { personaId, ...pendiente() } });
  if (pendientes >= MAXIMO_PENDIENTES) throw new HttpError(409, 'Hay demasiadas invitaciones pendientes. Cancela alguna primero.');

  const telefono = datos.telefono ? telefonoValido(datos.telefono) : null;
  if (telefono) {
    const usuario = await prisma.usuario.findFirst({ where: { telefono, eliminadoEn: null }, select: { id: true } });
    if (usuario?.id === sesion.usuarioId) throw new HttpError(400, 'No puedes invitarte a ti mismo');
    if (usuario) {
      const miembro = await prisma.miembroRed.findFirst({
        where: { personaId, usuarioId: usuario.id, estado: 'activo', OR: [{ venceEn: null }, { venceEn: { gt: new Date() } }] },
      });
      if (miembro) throw new HttpError(409, 'Esa persona ya forma parte de la red');
    }
  }

  for (let intento = 0; intento < 3; intento++) {
    const codigo = generarCodigo();
    try {
      const invitacion = await prisma.invitacion.create({
        data: {
          personaId,
          codigoHash: hashCodigo(codigo),
          telefono,
          rol: datos.rol,
          relacion: datos.relacion ?? null,
          accesoHasta: datos.accesoHasta ?? null,
          permisoFicha: datos.rol === 'temporal' ? datos.permisoFicha : false,
          versionAviso: datos.versionAviso,
          creadaPor: sesion.usuarioId,
          sesionId: sesion.sesionId,
          expiraEn: new Date(Date.now() + DIAS_VIGENCIA_INVITACION * DIA_MS),
        },
      });
      // El código solo se entrega aquí: en la base se guarda su hash.
      return {
        invitacion: aEnviada(invitacion),
        codigo,
        enlace: `cruzcontigo://invitacion/${normalizarCodigo(codigo)}`,
      };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
    }
  }
  throw new HttpError(500, 'No se pudo generar la invitación. Inténtalo de nuevo.');
}

export async function cancelar(personaId: string, invitacionId: string, usuarioId: string) {
  await requerirGestor(personaId, usuarioId);
  const resultado = await prisma.invitacion.updateMany({
    where: { id: invitacionId, personaId, aceptadaEn: null, canceladaEn: null },
    data: { canceladaEn: new Date() },
  });
  if (resultado.count === 0) throw new HttpError(404, 'Esa invitación no existe o ya no está pendiente');
}

// MARK: - Persona invitada

export async function recibidas(usuarioId: string) {
  const telefono = await telefonoDe(usuarioId);
  const invitaciones = await prisma.invitacion.findMany({
    where: { telefono, creadaPor: { not: usuarioId }, ...pendiente() },
    include: { persona: { select: { nombre: true } } },
    orderBy: { creadoEn: 'desc' },
  });
  return aRecibidas(invitaciones);
}

async function buscarParaUsuario(usuarioId: string, datos: { codigo?: string; invitacionId?: string }) {
  const invitacion = await prisma.invitacion.findFirst({
    where: datos.codigo ? { codigoHash: hashCodigo(datos.codigo) } : { id: datos.invitacionId },
    include: { persona: { select: { nombre: true } } },
  });
  if (!invitacion) throw new HttpError(404, 'No encontramos esa invitación. Revisa el código.');
  if (!estaVigente(invitacion)) throw new HttpError(410, 'La invitación venció o ya se usó. Pide una nueva.');
  if (invitacion.creadaPor === usuarioId) throw new HttpError(400, 'No puedes aceptar tu propia invitación');

  // Una invitación por teléfono solo la usa ese número; las de enlace, quien tenga el código.
  if (invitacion.telefono && invitacion.telefono !== (await telefonoDe(usuarioId))) {
    throw new HttpError(403, 'Esta invitación es para otro número de teléfono');
  }
  if (!datos.codigo && !invitacion.telefono) throw new HttpError(404, 'No encontramos esa invitación.');
  return invitacion;
}

export async function consultar(codigo: string, usuarioId: string) {
  const [invitacion] = await aRecibidas([await buscarParaUsuario(usuarioId, { codigo })]);
  return invitacion;
}

export async function aceptar(datos: AceptarDto, sesion: Sesion) {
  const invitacion = await buscarParaUsuario(sesion.usuarioId, datos);

  // Si quien invitó ya no administra los accesos, la invitación deja de valer.
  if (!(await rolGestor(invitacion.personaId, invitacion.creadaPor))) {
    throw new HttpError(410, 'La invitación ya no es válida. Pide una nueva.');
  }
  if (invitacion.accesoHasta && invitacion.accesoHasta <= new Date()) {
    throw new HttpError(410, 'El acceso de esta invitación ya venció. Pide una nueva.');
  }

  const clave = { personaId_usuarioId: { personaId: invitacion.personaId, usuarioId: sesion.usuarioId } };
  await prisma.$transaction(async (tx) => {
    const existente = await tx.miembroRed.findUnique({ where: clave });
    if (existente?.estado === 'activo' && (existente.rol === 'titular' || existente.rol === 'administrador')) {
      throw new HttpError(409, 'Ya administras este perfil');
    }

    // Marca la invitación como usada solo si nadie la usó antes (un solo uso).
    const usada = await tx.invitacion.updateMany({
      where: { id: invitacion.id, aceptadaEn: null, canceladaEn: null },
      data: { aceptadaEn: new Date(), aceptadaPor: sesion.usuarioId },
    });
    if (usada.count !== 1) throw new HttpError(410, 'La invitación ya se usó. Pide una nueva.');

    const acceso = {
      rol: invitacion.rol,
      relacion: invitacion.relacion,
      estado: 'activo' as const,
      venceEn: invitacion.accesoHasta,
      invitadoPor: invitacion.creadaPor,
      permisoFicha: invitacion.permisoFicha,
    };
    await tx.miembroRed.upsert({
      where: clave,
      create: { personaId: invitacion.personaId, usuarioId: sesion.usuarioId, ...acceso },
      update: acceso,
    });
    await tx.consentimiento.create({
      data: {
        personaId: invitacion.personaId,
        otorgadoPor: invitacion.creadaPor,
        usuarioId: sesion.usuarioId,
        accion: 'autorizar',
        rol: invitacion.rol,
        versionAviso: invitacion.versionAviso,
        sesionId: invitacion.sesionId,
      },
    });
  });

  return { familiarID: invitacion.personaId, nombre: invitacion.persona.nombre, rol: invitacion.rol };
}

export async function rechazar(invitacionId: string, usuarioId: string) {
  const telefono = await telefonoDe(usuarioId);
  const resultado = await prisma.invitacion.updateMany({
    where: { id: invitacionId, telefono, aceptadaEn: null, canceladaEn: null },
    data: { canceladaEn: new Date() },
  });
  if (resultado.count === 0) throw new HttpError(404, 'Esa invitación no existe o ya no está pendiente');
}

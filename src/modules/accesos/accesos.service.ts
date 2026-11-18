import type { MiembroRed, Usuario } from '@prisma/client';
import { prisma } from '../../database/cliente';
import { HttpError } from '../../common/utils/http-error';
import { isoSinMilisegundos } from '../../common/utils/fechas';
import type { Sesion } from '../../common/utils/autenticacion';
import { requerirAcceso, requerirGestor, tieneConvenioVigente } from '../../common/utils/permisos';
import { telefonoValido } from '../auth/auth.service';
import { DIAS_PROFESIONAL_PREDETERMINADOS, VERSION_AVISO, type AutorizarDto, type QrDto } from './accesos.schema';

const DIA_MS = 24 * 60 * 60 * 1000;

type DatosUsuario = Pick<Usuario, 'id' | 'nombre' | 'telefono'>;

// Solo los últimos 4 dígitos: basta para reconocer a la persona (minimización).
export function telefonoEnmascarado(telefono?: string) {
  return telefono ? `•••• ${telefono.slice(-4)}` : null;
}

export async function usuariosPorId(ids: string[]) {
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, nombre: true, telefono: true },
  });
  return new Map(usuarios.map((u) => [u.id, u]));
}

export function aMiembro(miembro: MiembroRed, usuario: DatosUsuario | undefined, usuarioActual: string) {
  const vencido = miembro.venceEn !== null && miembro.venceEn <= new Date();
  return {
    id: miembro.id,
    nombre: usuario?.nombre || null,
    telefono: telefonoEnmascarado(usuario?.telefono),
    rol: miembro.rol,
    relacion: miembro.relacion,
    estado: vencido && miembro.estado === 'activo' ? 'vencido' : miembro.estado,
    venceEn: miembro.venceEn ? isoSinMilisegundos(miembro.venceEn) : null,
    permisoFicha: miembro.permisoFicha,
    esTuCuenta: miembro.usuarioId === usuarioActual,
  };
}

export async function listar(personaId: string, usuarioId: string) {
  await requerirGestor(personaId, usuarioId);
  const miembros = await prisma.miembroRed.findMany({
    where: { personaId, estado: { in: ['activo', 'invitado'] } },
  });
  const usuarios = await usuariosPorId(miembros.map((m) => m.usuarioId));
  return {
    versionAviso: VERSION_AVISO,
    miembros: miembros.map((m) => aMiembro(m, usuarios.get(m.usuarioId), usuarioId)),
  };
}

export async function autorizar(personaId: string, datos: AutorizarDto, sesion: Sesion) {
  await requerirGestor(personaId, sesion.usuarioId);

  const usuario = await prisma.usuario.findFirst({
    where: { telefono: telefonoValido(datos.telefono), eliminadoEn: null },
    select: { id: true, nombre: true, telefono: true },
  });
  if (!usuario) throw new HttpError(404, 'Ese número aún no tiene cuenta en CruzContigo. Pídele que se registre primero.');
  if (usuario.id === sesion.usuarioId) throw new HttpError(400, 'No puedes cambiar tu propio acceso');

  if (datos.rol === 'profesional' && !(await tieneConvenioVigente(usuario.id))) {
    throw new HttpError(403, 'Ese número no pertenece a un profesional con convenio vigente');
  }

  const existente = await prisma.miembroRed.findUnique({
    where: { personaId_usuarioId: { personaId, usuarioId: usuario.id } },
  });
  if (existente && existente.estado === 'activo' && (existente.rol === 'titular' || existente.rol === 'administrador')) {
    throw new HttpError(409, 'Esa persona ya administra este perfil');
  }

  // El acceso profesional siempre vence; el de la red familiar solo si se pide.
  const dias = datos.rol === 'profesional' ? datos.diasVigencia ?? DIAS_PROFESIONAL_PREDETERMINADOS : datos.diasVigencia;
  const venceEn = dias ? new Date(Date.now() + dias * DIA_MS) : null;
  const acceso = { rol: datos.rol, relacion: datos.relacion ?? null, estado: 'activo' as const, venceEn, invitadoPor: sesion.usuarioId };

  const miembro = await prisma.$transaction(async (tx) => {
    const guardado = await tx.miembroRed.upsert({
      where: { personaId_usuarioId: { personaId, usuarioId: usuario.id } },
      create: { personaId, usuarioId: usuario.id, ...acceso },
      update: acceso,
    });
    await tx.consentimiento.create({
      data: {
        personaId,
        otorgadoPor: sesion.usuarioId,
        usuarioId: usuario.id,
        accion: 'autorizar',
        rol: datos.rol,
        versionAviso: datos.versionAviso,
        sesionId: sesion.sesionId,
      },
    });
    return guardado;
  });

  return aMiembro(miembro, usuario, sesion.usuarioId);
}

export async function revocar(personaId: string, miembroId: string, sesion: Sesion) {
  await requerirGestor(personaId, sesion.usuarioId);

  const miembro = await prisma.miembroRed.findFirst({ where: { id: miembroId, personaId } });
  if (!miembro) throw new HttpError(404, 'Ese acceso no existe');
  if (miembro.rol === 'titular') throw new HttpError(409, 'No se puede revocar a la persona titular');
  if (miembro.usuarioId === sesion.usuarioId) throw new HttpError(400, 'No puedes revocar tu propio acceso');
  if (miembro.estado === 'revocado') return;

  await prisma.$transaction([
    prisma.miembroRed.update({ where: { id: miembro.id }, data: { estado: 'revocado' } }),
    prisma.consentimiento.create({
      data: {
        personaId,
        otorgadoPor: sesion.usuarioId,
        usuarioId: miembro.usuarioId,
        accion: 'revocar',
        rol: miembro.rol,
        versionAviso: VERSION_AVISO,
        sesionId: sesion.sesionId,
      },
    }),
  ]);
}

export async function consentimientos(personaId: string, usuarioId: string) {
  await requerirGestor(personaId, usuarioId);
  const registros = await prisma.consentimiento.findMany({
    where: { personaId },
    orderBy: { creadoEn: 'desc' },
    take: 100,
  });
  const usuarios = await usuariosPorId(registros.flatMap((r) => [r.otorgadoPor, r.usuarioId]));
  const persona = (id: string) => {
    const u = usuarios.get(id);
    return { nombre: u?.nombre || null, telefono: telefonoEnmascarado(u?.telefono) };
  };
  return registros.map((r) => ({
    id: r.id,
    accion: r.accion,
    rol: r.rol,
    versionAviso: r.versionAviso,
    fecha: isoSinMilisegundos(r.creadoEn),
    otorgadoPor: persona(r.otorgadoPor),
    usuario: persona(r.usuarioId),
  }));
}

// El último registro de QR manda: compartir_qr lo habilita y retirar_qr lo apaga.
async function ultimoQR(personaId: string) {
  return prisma.consentimiento.findFirst({
    where: { personaId, accion: { in: ['compartir_qr', 'retirar_qr'] } },
    orderBy: { creadoEn: 'desc' },
  });
}

function aEstadoQR(registro: Awaited<ReturnType<typeof ultimoQR>>) {
  return {
    consentido: registro?.accion === 'compartir_qr',
    fecha: registro ? isoSinMilisegundos(registro.creadoEn) : null,
    versionAviso: VERSION_AVISO,
  };
}

// Cualquier integrante de la red puede saber si el QR está permitido (para mostrarlo
// sin conexión). Un profesional bajo convenio no lo necesita.
export async function estadoQR(personaId: string, usuarioId: string) {
  await requerirAcceso(personaId, usuarioId);
  return aEstadoQR(await ultimoQR(personaId));
}

export async function cambiarQR(personaId: string, datos: QrDto, sesion: Sesion) {
  const rol = await requerirGestor(personaId, sesion.usuarioId);
  const actual = await ultimoQR(personaId);
  if ((actual?.accion === 'compartir_qr') === datos.consentido) return aEstadoQR(actual);

  const registro = await prisma.consentimiento.create({
    data: {
      personaId,
      otorgadoPor: sesion.usuarioId,
      usuarioId: sesion.usuarioId,
      accion: datos.consentido ? 'compartir_qr' : 'retirar_qr',
      rol,
      versionAviso: datos.versionAviso ?? VERSION_AVISO,
      sesionId: sesion.sesionId,
    },
  });
  return aEstadoQR(registro);
}

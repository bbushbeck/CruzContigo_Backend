import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../../database/cliente';
import { HttpError } from './http-error';

export type Sesion = { usuarioId: string; sesionId: string };

export async function sesionAutenticada(req: Request): Promise<Sesion | undefined> {
  const [tipo, token] = (req.header('authorization') ?? '').split(' ');
  if (!tipo && !token) return undefined;
  if (tipo?.toLowerCase() !== 'bearer' || !token) throw new HttpError(401, 'Sesión inválida');

  const refreshTokenHash = createHash('sha256').update(token).digest('hex');
  const sesion = await prisma.sesionDispositivo.findFirst({
    where: { refreshTokenHash, revocadaEn: null, usuario: { eliminadoEn: null } },
    select: { id: true, usuarioId: true },
  });

  if (!sesion) throw new HttpError(401, 'Sesión inválida o vencida');
  return { usuarioId: sesion.usuarioId, sesionId: sesion.id };
}

export async function usuarioAutenticado(req: Request): Promise<string | undefined> {
  return (await sesionAutenticada(req))?.usuarioId;
}

export async function requerirSesion(req: Request): Promise<Sesion> {
  const sesion = await sesionAutenticada(req);
  if (!sesion) throw new HttpError(401, 'Inicia sesión para continuar');
  return sesion;
}

export async function requerirUsuario(req: Request): Promise<string> {
  return (await requerirSesion(req)).usuarioId;
}

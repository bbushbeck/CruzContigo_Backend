import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '../../database/cliente';
import { HttpError } from './http-error';

export async function usuarioAutenticado(req: Request): Promise<string | undefined> {
  const [tipo, token] = (req.header('authorization') ?? '').split(' ');
  if (!tipo && !token) return undefined;
  if (tipo?.toLowerCase() !== 'bearer' || !token) throw new HttpError(401, 'Sesión inválida');

  const refreshTokenHash = createHash('sha256').update(token).digest('hex');
  const sesion = await prisma.sesionDispositivo.findFirst({
    where: { refreshTokenHash, revocadaEn: null, usuario: { eliminadoEn: null } },
    select: { usuarioId: true },
  });

  if (!sesion) throw new HttpError(401, 'Sesión inválida o vencida');
  return sesion.usuarioId;
}

export async function requerirUsuario(req: Request): Promise<string> {
  const usuarioId = await usuarioAutenticado(req);
  if (!usuarioId) throw new HttpError(401, 'Inicia sesión para continuar');
  return usuarioId;
}

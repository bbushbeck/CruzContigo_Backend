import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../database/cliente';
import { env } from '../../config/env';
import { HttpError } from '../../common/utils/http-error';

const expiracionOtp = 5 * 60 * 1000;

function hashOtp(challengeId: string, code: string) {
  return createHmac('sha256', env.OTP_HMAC_SECRET).update(`${challengeId}:${code}`).digest('hex');
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function telefonoValido(phoneNumber: string) {
  const digitos = phoneNumber.replace(/\D/g, '');
  if (digitos.length === 10) return `+52${digitos}`;
  if (phoneNumber.trim().startsWith('+') && digitos.length >= 11 && digitos.length <= 15) return `+${digitos}`;
  throw new HttpError(400, 'Número telefónico inválido');
}

export async function solicitarCodigo(phoneNumber: string) {
  const telefono = telefonoValido(phoneNumber);
  const challengeId = randomUUID();
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');

  await prisma.$transaction([
    prisma.verificacionOtp.deleteMany({ where: { telefono, verificadoEn: null } }),
    prisma.verificacionOtp.create({
      data: {
        id: challengeId,
        telefono,
        codigoHash: hashOtp(challengeId, code),
        expiraEn: new Date(Date.now() + expiracionOtp),
      },
    }),
  ]);

  // Sustituir por el proveedor SMS cuando se configure producción.
  console.log(`Código para ${telefono}: ${code}`);
  return { challengeId };
}

export async function verificarCodigo(challengeId: string, code: string) {
  const otp = await prisma.verificacionOtp.findUnique({ where: { id: challengeId } });
  if (!otp || otp.verificadoEn || otp.expiraEn <= new Date() || otp.intentos >= 5) {
    throw new HttpError(400, 'Código inválido o expirado');
  }

  const esperado = Buffer.from(otp.codigoHash, 'hex');
  const recibido = Buffer.from(hashOtp(challengeId, code), 'hex');
  if (!timingSafeEqual(esperado, recibido)) {
    await prisma.verificacionOtp.update({ where: { id: challengeId }, data: { intentos: { increment: 1 } } });
    throw new HttpError(400, 'Código inválido o expirado');
  }

  const token = randomBytes(32).toString('base64url');
  const user = await prisma.$transaction(async (tx) => {
    await tx.verificacionOtp.update({ where: { id: challengeId }, data: { verificadoEn: new Date() } });
    const usuario = await tx.usuario.upsert({
      where: { telefono: otp.telefono },
      create: { telefono: otp.telefono, nombre: '', rolPreferido: 'cuidador' },
      update: { eliminadoEn: null },
    });
    await tx.sesionDispositivo.create({
      data: {
        usuarioId: usuario.id,
        plataforma: 'ios',
        refreshTokenHash: hashToken(token),
        ultimoAcceso: new Date(),
      },
    });
    return usuario;
  });

  return { token, user: { id: user.id, phoneNumber: user.telefono } };
}

export async function cerrarSesion(authorization?: string) {
  const [tipo, token] = (authorization ?? '').split(' ');
  if (tipo?.toLowerCase() !== 'bearer' || !token) throw new HttpError(401, 'Token requerido');

  await prisma.sesionDispositivo.updateMany({
    where: { refreshTokenHash: hashToken(token), revocadaEn: null },
    data: { revocadaEn: new Date() },
  });
}

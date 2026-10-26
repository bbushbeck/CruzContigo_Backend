import { Router } from 'express';
import * as auth from './auth.service';
import { solicitarCodigoSchema, verificarCodigoSchema } from './auth.schema';

export const authRouter = Router();

authRouter.post('/phone/request-code', async (req, res) => {
  const { phoneNumber } = solicitarCodigoSchema.parse(req.body);
  res.json(await auth.solicitarCodigo(phoneNumber));
});

authRouter.post('/phone/verify-code', async (req, res) => {
  const datos = verificarCodigoSchema.parse(req.body);
  res.json(await auth.verificarCodigo(datos.challengeId, datos.code));
});

authRouter.delete('/logout', async (req, res) => {
  await auth.cerrarSesion(req.header('authorization'));
  res.status(204).end();
});

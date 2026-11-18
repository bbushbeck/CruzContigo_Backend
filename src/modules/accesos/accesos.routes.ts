import { Router } from 'express';
import { requerirSesion } from '../../common/utils/autenticacion';
import { idSchema } from '../personas/personas.schema';
import { autorizarSchema } from './accesos.schema';
import * as accesos from './accesos.service';

export const accesosRouter = Router({ mergeParams: true });

accesosRouter.get<{ id: string }>('/', async (req, res) => {
  const { usuarioId } = await requerirSesion(req);
  res.json(await accesos.listar(idSchema.parse(req.params.id), usuarioId));
});

accesosRouter.get<{ id: string }>('/consentimientos', async (req, res) => {
  const { usuarioId } = await requerirSesion(req);
  res.json(await accesos.consentimientos(idSchema.parse(req.params.id), usuarioId));
});

accesosRouter.post<{ id: string }>('/', async (req, res) => {
  const sesion = await requerirSesion(req);
  const datos = autorizarSchema.parse(req.body);
  res.status(201).json(await accesos.autorizar(idSchema.parse(req.params.id), datos, sesion));
});

accesosRouter.delete<{ id: string; miembroId: string }>('/:miembroId', async (req, res) => {
  const sesion = await requerirSesion(req);
  await accesos.revocar(idSchema.parse(req.params.id), idSchema.parse(req.params.miembroId), sesion);
  res.status(204).end();
});

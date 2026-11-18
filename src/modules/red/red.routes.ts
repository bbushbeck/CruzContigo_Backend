import { Router } from 'express';
import { requerirSesion } from '../../common/utils/autenticacion';
import { idSchema } from '../personas/personas.schema';
import { aceptarSchema, consultarSchema, invitarSchema } from './red.schema';
import * as red from './red.service';

/** /familiares/:id/red: integrantes de la red y, para quien administra, invitaciones pendientes. */
export const redRouter = Router({ mergeParams: true });

redRouter.get<{ id: string }>('/', async (req, res) => {
  const { usuarioId } = await requerirSesion(req);
  res.json(await red.red(idSchema.parse(req.params.id), usuarioId));
});

/** /familiares/:id/invitaciones: el cuidador principal invita y cancela. */
export const invitacionesPersonaRouter = Router({ mergeParams: true });

invitacionesPersonaRouter.post<{ id: string }>('/', async (req, res) => {
  const sesion = await requerirSesion(req);
  const datos = invitarSchema.parse(req.body);
  res.status(201).json(await red.invitar(idSchema.parse(req.params.id), datos, sesion));
});

invitacionesPersonaRouter.delete<{ id: string; invitacionId: string }>('/:invitacionId', async (req, res) => {
  const { usuarioId } = await requerirSesion(req);
  await red.cancelar(idSchema.parse(req.params.id), idSchema.parse(req.params.invitacionId), usuarioId);
  res.status(204).end();
});

/** /invitaciones: la persona invitada consulta, acepta o rechaza. */
export const invitacionesRouter = Router();

invitacionesRouter.get('/', async (req, res) => {
  const { usuarioId } = await requerirSesion(req);
  res.json(await red.recibidas(usuarioId));
});

// POST para que el código no quede en URLs ni en registros de acceso.
invitacionesRouter.post('/consultar', async (req, res) => {
  const { usuarioId } = await requerirSesion(req);
  const { codigo } = consultarSchema.parse(req.body);
  res.json(await red.consultar(codigo, usuarioId));
});

invitacionesRouter.post('/aceptar', async (req, res) => {
  const sesion = await requerirSesion(req);
  res.json(await red.aceptar(aceptarSchema.parse(req.body), sesion));
});

invitacionesRouter.delete<{ invitacionId: string }>('/:invitacionId', async (req, res) => {
  const { usuarioId } = await requerirSesion(req);
  await red.rechazar(idSchema.parse(req.params.invitacionId), usuarioId);
  res.status(204).end();
});

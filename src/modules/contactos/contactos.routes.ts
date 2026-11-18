import { Router } from 'express';
import { requerirUsuario } from '../../common/utils/autenticacion';
import { idSchema } from '../personas/personas.schema';
import { contactoSchema, ordenSchema } from './contactos.schema';
import * as contactos from './contactos.service';

/** /familiares/:id/contactos: contactos de emergencia con prioridad (RF-15). */
export const contactosRouter = Router({ mergeParams: true });

contactosRouter.get<{ id: string }>('/', async (req, res) => {
  res.json(await contactos.listar(idSchema.parse(req.params.id), await requerirUsuario(req)));
});

contactosRouter.post<{ id: string }>('/', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  res.status(201).json(await contactos.crear(idSchema.parse(req.params.id), contactoSchema.parse(req.body), usuarioId));
});

// Antes de /:contactoId para que "orden" no se lea como identificador.
contactosRouter.put<{ id: string }>('/orden', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  const { ids } = ordenSchema.parse(req.body);
  res.json(await contactos.ordenar(idSchema.parse(req.params.id), ids, usuarioId));
});

contactosRouter.put<{ id: string; contactoId: string }>('/:contactoId', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  res.json(await contactos.actualizar(
    idSchema.parse(req.params.id), idSchema.parse(req.params.contactoId), contactoSchema.parse(req.body), usuarioId,
  ));
});

contactosRouter.delete<{ id: string; contactoId: string }>('/:contactoId', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  await contactos.eliminar(idSchema.parse(req.params.id), idSchema.parse(req.params.contactoId), usuarioId);
  res.status(204).end();
});

import { Router } from 'express';
import { requerirUsuario } from '../../common/utils/autenticacion';
import { idSchema } from '../personas/personas.schema';
import { filtroSchema, notaSchema } from './diario.schema';
import * as diario from './diario.service';

/** /familiares/:id/diario: notas de alimentación, sueño, ánimo e incidencias (HU-13). */
export const diarioRouter = Router({ mergeParams: true });

diarioRouter.get<{ id: string }>('/', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  res.json(await diario.listar(idSchema.parse(req.params.id), filtroSchema.parse(req.query), usuarioId));
});

diarioRouter.post<{ id: string }>('/', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  res.status(201).json(await diario.crear(idSchema.parse(req.params.id), notaSchema.parse(req.body), usuarioId));
});

diarioRouter.put<{ id: string; notaId: string }>('/:notaId', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  res.json(await diario.actualizar(
    idSchema.parse(req.params.id), idSchema.parse(req.params.notaId), notaSchema.parse(req.body), usuarioId,
  ));
});

diarioRouter.delete<{ id: string; notaId: string }>('/:notaId', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  await diario.eliminar(idSchema.parse(req.params.id), idSchema.parse(req.params.notaId), usuarioId);
  res.status(204).end();
});

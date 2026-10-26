import { Router } from 'express';
import { idSchema } from '../personas/personas.schema';
import { medicamentoSchema } from './medicamentos.schema';
import * as medicamentos from './medicamentos.service';

export const medicamentosRouter = Router({ mergeParams: true });

medicamentosRouter.get<{ id: string }>('/', async (req, res) => {
  res.json(await medicamentos.listar(idSchema.parse(req.params.id)));
});

medicamentosRouter.post<{ id: string }>('/', async (req, res) => {
  res.status(201).json(await medicamentos.crear(
    idSchema.parse(req.params.id), medicamentoSchema.parse(req.body),
  ));
});

medicamentosRouter.put<{ id: string; medicamentoId: string }>('/:medicamentoId', async (req, res) => {
  res.json(await medicamentos.actualizar(
    idSchema.parse(req.params.id), idSchema.parse(req.params.medicamentoId),
    medicamentoSchema.parse(req.body),
  ));
});

medicamentosRouter.delete<{ id: string; medicamentoId: string }>('/:medicamentoId', async (req, res) => {
  await medicamentos.eliminar(idSchema.parse(req.params.id), idSchema.parse(req.params.medicamentoId));
  res.status(204).end();
});

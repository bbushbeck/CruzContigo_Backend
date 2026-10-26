import { Router } from 'express';
import { idSchema } from '../personas/personas.schema';
import { guardarFichaSchema } from './ficha-medica.schema';
import * as fichas from './ficha-medica.service';

export const fichaMedicaRouter = Router({ mergeParams: true });

fichaMedicaRouter.get('/', async (req, res) => {
  res.json(await fichas.obtener(idSchema.parse((req.params as { id: string }).id)));
});

fichaMedicaRouter.put('/', async (req, res) => {
  const id = idSchema.parse((req.params as { id: string }).id);
  const datos = guardarFichaSchema.parse(req.body);
  res.json(await fichas.guardar(id, datos));
});

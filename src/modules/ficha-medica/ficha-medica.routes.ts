import { Router } from 'express';
import { requerirUsuario } from '../../common/utils/autenticacion';
import { idSchema } from '../personas/personas.schema';
import { guardarFichaSchema } from './ficha-medica.schema';
import * as fichas from './ficha-medica.service';

const personaDe = (id: string) => idSchema.parse(id);

export const fichaMedicaRouter = Router({ mergeParams: true });

fichaMedicaRouter.get('/', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  const ficha = await fichas.obtener(personaDe((req.params as { id: string }).id), usuarioId);
  // Sin cuerpo para que la app lo distinga de una persona inexistente y muestre la ficha vacía
  if (!ficha) {
    res.status(404).end();
    return;
  }
  res.json(ficha);
});

fichaMedicaRouter.put('/', async (req, res) => {
  const usuarioId = await requerirUsuario(req);
  const datos = guardarFichaSchema.parse(req.body);
  res.json(await fichas.guardar(personaDe((req.params as { id: string }).id), datos, usuarioId));
});

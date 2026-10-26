import { Router, type Request } from 'express';
import { HttpError } from '../../common/utils/http-error';
import { idSchema } from '../personas/personas.schema';
import { guardarFichaSchema } from './ficha-medica.schema';
import * as fichas from './ficha-medica.service';

function usuarioDe(req: Request): string | undefined {
  const valor = req.header('x-usuario-id');
  if (!valor) return undefined;
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) throw new HttpError(400, 'X-Usuario-Id inválido');
  return resultado.data;
}

const personaDe = (req: Request) => idSchema.parse((req.params as { id: string }).id);

export const fichaMedicaRouter = Router({ mergeParams: true });

fichaMedicaRouter.get('/', async (req, res) => {
  const ficha = await fichas.obtener(personaDe(req));
  // Sin cuerpo para que la app lo distinga de una persona inexistente y muestre la ficha vacía
  if (!ficha) {
    res.status(404).end();
    return;
  }
  res.json(ficha);
});

fichaMedicaRouter.put('/', async (req, res) => {
  const datos = guardarFichaSchema.parse(req.body);
  res.json(await fichas.guardar(personaDe(req), datos, usuarioDe(req)));
});

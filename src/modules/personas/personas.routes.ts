import { Router, type Request } from 'express';
import { usuarioDeSesion } from '../auth/auth.service';
import { HttpError } from '../../common/utils/http-error';
import { crearPersonaSchema, idSchema } from './personas.schema';
import * as personas from './personas.service';

function usuarioDe(req: Request): string | undefined {
  const valor = req.header('x-usuario-id');
  if (!valor) return undefined;
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) throw new HttpError(400, 'X-Usuario-Id inválido');
  return resultado.data;
}

export const personasRouter = Router();

personasRouter.get('/', async (req, res) => {
  res.json(await personas.listar(usuarioDe(req)));
});

personasRouter.get('/:id', async (req, res) => {
  res.json(await personas.obtener(idSchema.parse(req.params.id), usuarioDe(req)));
});

personasRouter.post('/', async (req, res) => {
  const datos = crearPersonaSchema.parse(req.body);
  const authorization = req.header('authorization');
  const usuarioId = authorization === undefined ? usuarioDe(req) : await usuarioDeSesion(authorization);
  res.status(201).json(await personas.crear(datos, usuarioId));
});

personasRouter.delete('/:id', async (req, res) => {
  await personas.eliminar(idSchema.parse(req.params.id));
  res.status(204).end();
});

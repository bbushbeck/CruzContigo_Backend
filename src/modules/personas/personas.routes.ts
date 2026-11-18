import { Router, type Request } from 'express';
import { usuarioDeSesion } from '../auth/auth.service';
import { HttpError } from '../../common/utils/http-error';
import { requerirUsuario, usuarioAutenticado } from '../../common/utils/autenticacion';
import { crearPersonaSchema, idSchema } from './personas.schema';
import * as personas from './personas.service';

async function usuarioDe(req: Request): Promise<string | undefined> {
  const autenticado = await usuarioAutenticado(req);
  if (autenticado) return autenticado;
  const valor = req.header('x-usuario-id');
  if (!valor) return undefined;
  const resultado = idSchema.safeParse(valor);
  if (!resultado.success) throw new HttpError(400, 'X-Usuario-Id inválido');
  return resultado.data;
}

export const personasRouter = Router();

personasRouter.get('/', async (req, res) => {
  res.json(await personas.listar(await usuarioDe(req)));
});

personasRouter.get('/:id', async (req, res) => {
  res.json(await personas.obtener(idSchema.parse(req.params.id), await usuarioDe(req)));
});

personasRouter.post('/', async (req, res) => {
  const datos = crearPersonaSchema.parse(req.body);
  const authorization = req.header('authorization');
  const usuarioId = authorization === undefined ? await usuarioDe(req) : await usuarioDeSesion(authorization);
  res.status(201).json(await personas.crear(datos, usuarioId));
});

personasRouter.put('/:id', async (req, res) => {
  const datos = crearPersonaSchema.parse(req.body);
  const id = idSchema.parse(req.params.id);
  res.json(await personas.actualizar(id, datos, await requerirUsuario(req)));
});

personasRouter.delete('/:id', async (req, res) => {
  await personas.eliminar(idSchema.parse(req.params.id));
  res.status(204).end();
});

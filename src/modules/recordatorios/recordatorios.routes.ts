import { Router } from 'express';
import { z } from 'zod';
import { usuarioDeSesion } from '../auth/auth.service';
import { idSchema } from '../personas/personas.schema';
import * as recordatorios from './recordatorios.service';

const recordatorioSchema = z.object({
  familiarID: idSchema,
  titulo: z.string().trim().min(1, 'Escribe un título').max(120),
  fecha: z.string().datetime({ offset: true }).transform((fecha) => new Date(fecha))
    .refine((fecha) => fecha.getUTCFullYear() >= 1000 && fecha.getUTCFullYear() <= 9999, 'Fecha fuera del rango admitido'),
  completado: z.boolean().default(false),
});

export const recordatoriosRouter = Router();

recordatoriosRouter.get('/', async (req, res) => {
  const usuarioId = await usuarioDeSesion(req.header('authorization'));
  res.json(await recordatorios.listar(usuarioId));
});

recordatoriosRouter.post('/', async (req, res) => {
  const usuarioId = await usuarioDeSesion(req.header('authorization'));
  res.status(201).json(await recordatorios.crear(usuarioId, recordatorioSchema.parse(req.body)));
});

recordatoriosRouter.put('/:id', async (req, res) => {
  const usuarioId = await usuarioDeSesion(req.header('authorization'));
  res.json(await recordatorios.actualizar(
    usuarioId, idSchema.parse(req.params.id), recordatorioSchema.parse(req.body),
  ));
});

recordatoriosRouter.delete('/:id', async (req, res) => {
  const usuarioId = await usuarioDeSesion(req.header('authorization'));
  await recordatorios.eliminar(usuarioId, idSchema.parse(req.params.id));
  res.status(204).end();
});

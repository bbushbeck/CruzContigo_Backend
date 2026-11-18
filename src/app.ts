import express from 'express';
import { manejadorErrores, rutaNoEncontrada } from './common/filters/errores';
import { accesosRouter } from './modules/accesos/accesos.routes';
import { authRouter } from './modules/auth/auth.routes';
import { contactosRouter } from './modules/contactos/contactos.routes';
import { fichaMedicaRouter } from './modules/ficha-medica/ficha-medica.routes';
import { medicamentosRouter } from './modules/medicamentos/medicamentos.routes';
import { recordatoriosRouter } from './modules/recordatorios/recordatorios.routes';
import { personasRouter } from './modules/personas/personas.routes';
import { invitacionesPersonaRouter, invitacionesRouter, redRouter } from './modules/red/red.routes';

export function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/salud', (_req, res) => {
    res.json({ estado: 'ok' });
  });

  app.use('/auth', authRouter);
  app.use('/familiares/:id/ficha-medica', fichaMedicaRouter);
  app.use('/familiares/:id/accesos', accesosRouter);
  app.use('/familiares/:id/red', redRouter);
  app.use('/familiares/:id/invitaciones', invitacionesPersonaRouter);
  app.use('/familiares/:id/contactos', contactosRouter);
  app.use('/familiares/:id/medicamentos', medicamentosRouter);
  app.use('/familiares', personasRouter);
  app.use('/recordatorios', recordatoriosRouter);
  app.use('/invitaciones', invitacionesRouter);

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}

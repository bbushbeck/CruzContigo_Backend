import express from 'express';
import { manejadorErrores, rutaNoEncontrada } from './common/filters/errores';
import { fichaMedicaRouter } from './modules/ficha-medica/ficha-medica.routes';
import { personasRouter } from './modules/personas/personas.routes';
import { medicamentosRouter } from './modules/medicamentos/medicamentos.routes';

export function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/salud', (_req, res) => {
    res.json({ estado: 'ok' });
  });

  app.use('/familiares/:id/ficha-medica', fichaMedicaRouter);
  app.use('/familiares/:id/medicamentos', medicamentosRouter);
  app.use('/familiares', personasRouter);

  app.use(rutaNoEncontrada);
  app.use(manejadorErrores);

  return app;
}

import { env } from './config/env';
import { crearApp } from './app';

const app = crearApp();

app.listen(env.PORT, () => {
  console.log(`CruzContigo API escuchando en http://localhost:${env.PORT}`);
});

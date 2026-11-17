import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL) throw new Error('Define TEST_DATABASE_URL con una base MySQL local terminada en _test');
const target = new URL(databaseURL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.endsWith('_test')) {
  throw new Error('Las pruebas requieren una base local cuyo nombre termine en _test');
}
process.env.DATABASE_URL = databaseURL;
process.env.DB_CA_PATH = '';
process.env.OTP_HMAC_SECRET = randomBytes(32).toString('hex');

describe('Recordatorios: CRUD privado por sesión', () => {
  const familiarID = randomUUID();
  const usuarios = Array.from({ length: 2 }, () => ({
    id: randomUUID(),
    telefono: '+' + BigInt('0x' + randomBytes(5).toString('hex')).toString().padStart(13, '0'),
    token: randomBytes(32).toString('base64url'),
  }));
  let prisma: typeof import('../src/database/cliente').prisma;
  let server: Server;
  let url: string;

  before(async () => {
    prisma = (await import('../src/database/cliente')).prisma;
    const { crearApp } = await import('../src/app');
    for (const usuario of usuarios) {
      await prisma.usuario.create({
        data: {
          id: usuario.id,
          telefono: usuario.telefono,
          sesiones: { create: {
            plataforma: 'ios',
            refreshTokenHash: createHash('sha256').update(usuario.token).digest('hex'),
          } },
        },
      });
    }
    await prisma.personaCuidada.create({
      data: { id: familiarID, nombre: 'Familiar de prueba', fechaNacimiento: new Date('1980-01-01'), tipoCuidado: 'otro' },
    });
    server = crearApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert(address && typeof address !== 'string');
    url = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    try {
      if (prisma) {
        await prisma.personaCuidada.deleteMany({ where: { id: familiarID } });
        await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map(({ id }) => id) } } });
      }
    } finally {
      if (prisma) await prisma.$disconnect();
      if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  async function request(path: string, method: string, token?: string, body?: unknown) {
    const response = await fetch(url + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: response.status === 204 ? null : await response.json() };
  }

  it('crea, lista, edita, completa y elimina en MySQL', async () => {
    const { token } = usuarios[0];
    const datos = { familiarID, titulo: '  Cita de control  ', fecha: '2027-02-10T09:30:00-06:00' };
    const creado = await request('/recordatorios', 'POST', token, datos);
    assert.equal(creado.status, 201);
    const id = creado.data.id;
    assert.deepEqual(creado.data, {
      ...datos, id, titulo: 'Cita de control', fecha: '2027-02-10T15:30:00Z', completado: false,
    });
    assert.deepEqual(await request('/recordatorios', 'GET', token), { status: 200, data: [creado.data] });

    const actualizado = { ...creado.data, titulo: 'Cita de seguimiento', fecha: '2027-02-11T15:30:00Z', completado: true };
    const path = `/recordatorios/${id}`;
    assert.deepEqual(await request(path, 'PUT', token, actualizado), { status: 200, data: actualizado });
    assert.equal((await prisma.recordatorioUsuario.findUniqueOrThrow({ where: { id } })).completado, true);

    const ajeno = usuarios[1].token;
    assert.deepEqual(await request('/recordatorios', 'GET', ajeno), { status: 200, data: [] });
    assert.equal((await request(path, 'PUT', ajeno, actualizado)).status, 404);
    assert.equal((await request(path, 'DELETE', ajeno)).status, 404);
    assert.equal((await request(path, 'DELETE', token)).status, 204);
    assert.deepEqual(await request('/recordatorios', 'GET', token), { status: 200, data: [] });
  });

  it('rechaza sesiones inválidas, datos inválidos y familiares inexistentes', async () => {
    const path = '/recordatorios';
    const { token } = usuarios[0];
    const datos = { familiarID, titulo: 'Control', fecha: '2027-02-10T15:30:00Z' };
    assert.equal((await request(path, 'GET')).status, 401);
    assert.equal((await request(path, 'GET', 'credencial-de-prueba-invalida')).status, 401);
    assert.equal((await request(path, 'POST', token, { ...datos, titulo: ' ', fecha: 'mañana' })).status, 400);
    assert.equal((await request(path, 'POST', token, { ...datos, familiarID: randomUUID() })).status, 404);
    assert.equal((await request('/auth/logout', 'DELETE', token)).status, 204);
    assert.equal((await request(path, 'GET', token)).status, 401);
  });
});

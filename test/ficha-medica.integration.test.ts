import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL) throw new Error('Define TEST_DATABASE_URL con una base MySQL local terminada en _test');
const target = new URL(databaseURL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.endsWith('_test')) {
  throw new Error('Las pruebas requieren una base local cuyo nombre termine en _test');
}
process.env.DATABASE_URL = databaseURL;
process.env.DB_CA_PATH = '';
process.env.OTP_HMAC_SECRET = randomBytes(32).toString('hex');

describe('Ficha médica: API, validación y permisos', () => {
  let server: Server;
  let baseURL: string;
  let prisma: typeof import('../src/database/cliente').prisma;
  const adminId = randomUUID();
  const lecturaId = randomUUID();
  const externoId = randomUUID();
  const personaId = randomUUID();
  const tokens = { admin: randomBytes(32).toString('base64url'), lectura: randomBytes(32).toString('base64url'), externo: randomBytes(32).toString('base64url') };
  const fichaPath = `/familiares/${personaId}/ficha-medica`;
  const ficha = {
    tipoSanguineo: 'O+', alergias: [{ nombre: 'Penicilina', severidad: 'grave' }],
    enfermedades: [{ nombre: 'Hipertensión', notas: 'Desde 2019' }],
    medicoTratante: 'Dra. López', institucionSalud: 'IMSS',
    antecedentes: 'Padre con diabetes', observaciones: 'Usa marcapasos',
  };

  async function request(path: string, method = 'GET', body?: unknown, token?: string) {
    const response = await fetch(baseURL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const texto = await response.text();
    return { status: response.status, data: texto ? JSON.parse(texto) : null };
  }

  before(async () => {
    prisma = (await import('../src/database/cliente')).prisma;
    const usuarios = [adminId, lecturaId, externoId];
    await prisma.usuario.createMany({
      data: usuarios.map((id) => ({ id, telefono: `+52${randomInt(1_000_000_000, 2_000_000_000)}` })),
    });
    await prisma.sesionDispositivo.createMany({
      data: [
        [adminId, tokens.admin], [lecturaId, tokens.lectura], [externoId, tokens.externo],
      ].map(([usuarioId, token]) => ({
        usuarioId, plataforma: 'ios' as const,
        refreshTokenHash: createHash('sha256').update(token).digest('hex'),
      })),
    });
    const { crearApp } = await import('../src/app');
    server = crearApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert(address && typeof address !== 'string');
    baseURL = `http://127.0.0.1:${address.port}`;
    const creada = await request('/familiares', 'POST', {
      id: personaId, nombre: 'Prueba', apellidos: 'Ficha', fechaNacimiento: '1980-01-01T12:00:00Z',
      parentesco: 'otro', tipoCuidado: 'otro',
    }, tokens.admin);
    assert.equal(creada.status, 201);
    assert.equal(creada.data.rol, 'administrador');
    await prisma.miembroRed.create({
      data: { personaId, usuarioId: lecturaId, rol: 'solo_lectura', estado: 'activo' },
    });
  });

  after(async () => {
    try {
      if (prisma) {
        await prisma.personaCuidada.deleteMany({ where: { id: personaId } });
        await prisma.usuario.deleteMany({ where: { id: { in: [adminId, lecturaId, externoId] } } });
      }
    } finally {
      if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (prisma) await prisma.$disconnect();
    }
  });

  it('exige una sesión válida', async () => {
    assert.equal((await request(fichaPath)).status, 401);
    assert.equal((await request(fichaPath, 'GET', undefined, 'token-invalido')).status, 401);
  });

  it('guarda y recupera todos los campos mediante la API', async () => {
    const guardada = await request(fichaPath, 'PUT', ficha, tokens.admin);
    assert.equal(guardada.status, 200);
    assert.equal(guardada.data.antecedentes, ficha.antecedentes);
    assert.equal(guardada.data.medicoTratante, ficha.medicoTratante);
    assert.equal(guardada.data.institucionSalud, ficha.institucionSalud);
    const recuperada = await request(fichaPath, 'GET', undefined, tokens.admin);
    assert.equal(recuperada.data.alergias[0].nombre, 'Penicilina');
    assert.equal(recuperada.data.observaciones, ficha.observaciones);
  });

  it('permite leer pero no editar a solo_lectura y bloquea externos', async () => {
    assert.equal((await request(fichaPath, 'GET', undefined, tokens.lectura)).status, 200);
    assert.equal((await request(fichaPath, 'PUT', ficha, tokens.lectura)).status, 403);
    assert.equal((await request(fichaPath, 'GET', undefined, tokens.externo)).status, 403);
    assert.equal((await request(fichaPath, 'PUT', ficha, tokens.externo)).status, 403);
  });

  it('edita el perfil solo con permiso de edición', async () => {
    const perfil = {
      nombre: 'Prueba Editada', apellidos: 'Ficha', fechaNacimiento: '1980-01-01T12:00:00Z',
      parentesco: 'otro', tipoCuidado: 'adultoMayor', telefono: '8112345678',
    };
    assert.equal((await request(`/familiares/${personaId}`, 'PUT', perfil, tokens.lectura)).status, 403);
    const actualizado = await request(`/familiares/${personaId}`, 'PUT', perfil, tokens.admin);
    assert.equal(actualizado.status, 200);
    assert.equal(actualizado.data.nombre, 'Prueba');
    assert.equal(actualizado.data.telefono, perfil.telefono);
  });

  it('valida los límites también en el servidor', async () => {
    assert.equal((await request(fichaPath, 'PUT', { ...ficha, antecedentes: 'x'.repeat(4001) }, tokens.admin)).status, 400);
    assert.equal((await request(fichaPath, 'PUT', { ...ficha, medicoTratante: 'x'.repeat(121) }, tokens.admin)).status, 400);
  });
});

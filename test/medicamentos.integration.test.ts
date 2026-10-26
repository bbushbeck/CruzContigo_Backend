import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type { Server } from 'node:http';

// Nunca usa el DATABASE_URL de Aiven ni el .env del desarrollador.
const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL) throw new Error('Define TEST_DATABASE_URL con una base MySQL local terminada en _test');
const target = new URL(databaseURL);
if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !target.pathname.endsWith('_test')) {
  throw new Error('Las pruebas requieren una base local cuyo nombre termine en _test');
}
process.env.DATABASE_URL = databaseURL;
process.env.DB_CA_PATH = '';

describe('Medicamentos: API y persistencia MySQL', () => {
  let server: Server;
  let baseURL: string;
  let prisma: typeof import('../src/database/cliente').prisma;
  const personaId = randomUUID();
  const otraPersonaId = randomUUID();
  const medicamentoId = randomUUID();
  const path = (persona = personaId) => `/familiares/${persona}/medicamentos`;
  const medicamento = {
    id: medicamentoId, recipientID: personaId, name: 'Medicamento de prueba',
    presentation: 'Solución', dose: '0.50', unit: 'ml', frequency: 'Según indicación médica',
    startDate: '2026-01-10', endDate: null,
    indication: null, stock: '20.25', refillThresholdDays: 5,
  };

  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(baseURL + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data };
  }

  before(async () => {
    prisma = (await import('../src/database/cliente')).prisma;
    const { crearApp } = await import('../src/app');
    server = crearApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    assert(address && typeof address !== 'string');
    baseURL = `http://127.0.0.1:${address.port}`;
    for (const id of [personaId, otraPersonaId]) {
      const response = await request('/familiares', 'POST', {
        id, nombre: 'Prueba', apellidos: 'Medicamentos', fechaNacimiento: '1980-01-01T12:00:00Z',
        parentesco: 'otro', tipoCuidado: 'otro',
      });
      assert.equal(response.status, 201);
    }
  });

  after(async () => {
    try {
      if (prisma) await prisma.personaCuidada.deleteMany({ where: { id: { in: [personaId, otraPersonaId] } } });
    } finally {
      if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (prisma) await prisma.$disconnect();
    }
  });

  it('registra y persiste el medicamento con el contrato de iOS', async () => {
    assert.deepEqual(await request(path()), { status: 200, data: [] });
    const result = await request(path(), 'POST', medicamento);
    assert.equal(result.status, 201);
    assert.deepEqual(result.data, medicamento);
    assert.equal((await prisma.medicamento.findUniqueOrThrow({ where: { id: medicamentoId } })).nombre, medicamento.name);
    assert.deepEqual((await request(path())).data, [medicamento]);
  });

  it('separa familiares y rechaza modificar o eliminar un medicamento ajeno', async () => {
    assert.deepEqual((await request(path(otraPersonaId))).data, []);
    assert.equal((await request(`${path(otraPersonaId)}/${medicamentoId}`, 'DELETE')).status, 404);
    assert.equal((await request(`${path(otraPersonaId)}/${medicamentoId}`, 'PUT', {
      ...medicamento, recipientID: otraPersonaId,
    })).status, 404);
    assert.equal((await request(path())).data.length, 1);
  });

  it('valida campos, fechas, UUID, familiar y duplicados', async () => {
    for (const changes of [
      { name: ' ' }, { dose: '' }, { dose: '0' }, { dose: '-1' }, { dose: '1.234' },
      { dose: '100000000.00' }, { dose: 1.5 }, { stock: '-1' }, { stock: '1.001' },
      { stock: '100000000' }, { frequency: 'x'.repeat(61) }, { unit: 'x'.repeat(11) },
      { presentation: 'x'.repeat(61) }, { indication: '😀'.repeat(17000) },
      { refillThresholdDays: -1 }, { refillThresholdDays: 32768 }, { refillThresholdDays: 1.5 },
      { name: 'x'.repeat(121) }, { status: 'Activo' }, { route: 'Oral' },
      { startDate: 'no-es-fecha' }, { startDate: '2026-02-30' },
      { startDate: '2026-01-10T12:00:00Z' }, { endDate: '2026-01-09' },
      { recipientID: otraPersonaId }, { id: 'invalido' },
    ]) {
      assert.equal((await request(path(), 'POST', { ...medicamento, ...changes })).status, 400);
    }
    assert.equal((await request(path(), 'POST', medicamento)).status, 409);
    assert.equal((await request(path(randomUUID()))).status, 404);
    assert.equal((await request('/familiares/no-uuid/medicamentos')).status, 400);
    assert.equal((await request(`${path()}/no-uuid`, 'DELETE')).status, 400);
  });

  it('edita una dosis decimal y permite finalizar el tratamiento el mismo día', async () => {
    const edited = { ...medicamento, dose: '99999999.99', stock: '0.00', endDate: '2026-01-10', refillThresholdDays: 32767 };
    assert.deepEqual(await request(`${path()}/${medicamentoId}`, 'PUT', edited), { status: 200, data: edited });
    assert.equal((await request(`${path()}/${medicamentoId}`, 'PUT', { ...edited, id: randomUUID() })).status, 400);
  });

  it('acepta campos opcionales nulos, genera UUID y aplica el umbral por defecto', async () => {
    const minimal = { name: 'Solo obligatorios', dose: '1', startDate: '2024-02-29' };
    const result = await request(path(), 'POST', minimal);
    assert.equal(result.status, 201);
    assert.match(result.data.id, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(result.data, {
      id: result.data.id, recipientID: personaId, ...minimal, dose: '1.00',
      presentation: null, unit: null, frequency: null, indication: null,
      endDate: null, stock: null, refillThresholdDays: 5,
    });
    const nullable = { ...result.data, name: 'Opcionales nulos' };
    assert.equal((await request(`${path()}/${result.data.id}`, 'PUT', nullable)).status, 200);
    assert.equal((await request(`${path()}/${result.data.id}`, 'DELETE')).status, 204);
  });

  it('el SQL real aplica sus CHECK y genera UUID incluso fuera de la API', async () => {
    const id = randomUUID();
    const data = { id, personaId, nombre: 'Prueba de CHECK', dosis: '1.00', inicio: new Date('2026-01-10') };
    await assert.rejects(prisma.medicamento.create({ data: { ...data, dosis: '0' } }));
    await assert.rejects(prisma.medicamento.create({ data: { ...data, fin: new Date('2026-01-09') } }));
    await prisma.$executeRaw`INSERT INTO medicamento (persona_id, nombre, dosis, inicio)
      VALUES (${personaId}, ${'UUID de base'}, ${'0.25'}, ${'2026-01-10'})`;
    const created = await prisma.medicamento.findFirstOrThrow({ where: { personaId, nombre: 'UUID de base' } });
    assert.match(created.id, /^[0-9a-f-]{36}$/i);
    assert.equal(created.umbralResurtidoDias, 5);
    await prisma.medicamento.delete({ where: { id: created.id } });
  });

  it('elimina de MySQL y devuelve 404 si se repite', async () => {
    assert.equal((await request(`${path()}/${medicamentoId}`, 'DELETE')).status, 204);
    assert.deepEqual((await request(path())).data, []);
    assert.equal(await prisma.medicamento.findUnique({ where: { id: medicamentoId } }), null);
    assert.equal((await request(`${path()}/${medicamentoId}`, 'DELETE')).status, 404);
  });

  it('eliminar al familiar elimina sus medicamentos por cascada', async () => {
    assert.equal((await request(path(), 'POST', medicamento)).status, 201);
    assert.equal((await request(`/familiares/${personaId}`, 'DELETE')).status, 204);
    assert.equal(await prisma.medicamento.count({ where: { personaId } }), 0);
    assert.equal((await request(path())).status, 404);
    assert.equal((await request(path(), 'POST', medicamento)).status, 404);
  });
});

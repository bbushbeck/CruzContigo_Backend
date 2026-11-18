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

describe('Red de cuidado: invitaciones, contactos y diario (HU-17, HU-26, RF-15, HU-13)', () => {
  let server: Server;
  let baseURL: string;
  let prisma: typeof import('../src/database/cliente').prisma;
  let versionAviso: string;

  const nombres = ['admin', 'familiar', 'conEnlace', 'otro', 'temporal'] as const;
  type Nombre = (typeof nombres)[number];
  const usuarios = Object.fromEntries(nombres.map((n) => [n, {
    id: randomUUID(),
    digitos: String(randomInt(1_000_000_000, 2_000_000_000)),
    token: randomBytes(32).toString('base64url'),
  }])) as Record<Nombre, { id: string; digitos: string; token: string }>;
  const personaId = randomUUID();
  const base = `/familiares/${personaId}`;
  const ficha = { tipoSanguineo: 'B+', alergias: [], enfermedades: [] };

  async function request(path: string, method = 'GET', body?: unknown, quien?: Nombre) {
    const response = await fetch(baseURL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(quien ? { Authorization: `Bearer ${usuarios[quien].token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const texto = await response.text();
    return { status: response.status, data: texto ? JSON.parse(texto) : null };
  }

  const invitacion = (extra: object) => ({ rol: 'cocuidador', versionAviso, aceptaAviso: true, ...extra });
  const enDias = (dias: number) => new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

  before(async () => {
    prisma = (await import('../src/database/cliente')).prisma;
    versionAviso = (await import('../src/modules/accesos/accesos.schema')).VERSION_AVISO;
    for (const n of nombres) {
      const u = usuarios[n];
      await prisma.usuario.create({ data: { id: u.id, telefono: `+52${u.digitos}`, nombre: n } });
      await prisma.sesionDispositivo.create({
        data: { usuarioId: u.id, plataforma: 'ios', refreshTokenHash: createHash('sha256').update(u.token).digest('hex') },
      });
    }
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
      id: personaId, nombre: 'Prueba', apellidos: 'Red', fechaNacimiento: '1945-05-05T12:00:00Z',
      parentesco: 'abuela', tipoCuidado: 'adultoMayor',
    }, 'admin');
    assert.equal(creada.status, 201);
    assert.equal((await request(`${base}/ficha-medica`, 'PUT', ficha, 'admin')).status, 200);
  });

  after(async () => {
    try {
      if (prisma) {
        await prisma.personaCuidada.deleteMany({ where: { id: personaId } });
        await prisma.usuario.deleteMany({ where: { id: { in: nombres.map((n) => usuarios[n].id) } } });
      }
    } finally {
      if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (prisma) await prisma.$disconnect();
    }
  });

  it('solo quien administra puede invitar', async () => {
    assert.equal((await request(`${base}/invitaciones`, 'POST', invitacion({}), 'otro')).status, 403);
    assert.equal((await request(`${base}/red`, 'GET', undefined, 'otro')).status, 403);
    assert.equal((await request(`${base}/invitaciones`, 'POST', invitacion({ aceptaAviso: false }), 'admin')).status, 400);
    assert.equal((await request(`${base}/invitaciones`, 'POST', invitacion({ rol: 'temporal' }), 'admin')).status, 400);
  });

  it('invita por teléfono y la persona invitada acepta desde su lista', async () => {
    const creada = await request(`${base}/invitaciones`, 'POST', invitacion({ telefono: usuarios.familiar.digitos, relacion: 'nieta' }), 'admin');
    assert.equal(creada.status, 201);
    assert.match(creada.data.codigo, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    assert.match(creada.data.enlace, /^cruzcontigo:\/\/invitacion\/[A-Z2-9]{10}$/);

    const ajena = await request('/invitaciones/aceptar', 'POST', { invitacionId: creada.data.invitacion.id }, 'otro');
    assert.equal(ajena.status, 403);

    const recibidas = await request('/invitaciones', 'GET', undefined, 'familiar');
    assert.equal(recibidas.data.length, 1);
    assert.equal(recibidas.data[0].familiarNombre, 'Prueba Red');
    assert.equal(recibidas.data[0].invitadaPor, 'admin');

    const aceptada = await request('/invitaciones/aceptar', 'POST', { invitacionId: creada.data.invitacion.id }, 'familiar');
    assert.equal(aceptada.status, 200);
    assert.equal(aceptada.data.rol, 'cocuidador');
    assert.equal((await request(`${base}/ficha-medica`, 'GET', undefined, 'familiar')).status, 200);

    const evidencia = await prisma.consentimiento.findFirstOrThrow({ where: { personaId, usuarioId: usuarios.familiar.id } });
    assert.equal(evidencia.otorgadoPor, usuarios.admin.id);
    assert.equal(evidencia.versionAviso, versionAviso);
  });

  it('el enlace sirve una sola vez', async () => {
    const creada = await request(`${base}/invitaciones`, 'POST', invitacion({ rol: 'solo_lectura' }), 'admin');
    const vista = await request('/invitaciones/consultar', 'POST', { codigo: creada.data.codigo.toLowerCase() }, 'conEnlace');
    assert.equal(vista.status, 200);
    assert.equal(vista.data.rol, 'solo_lectura');

    assert.equal((await request('/invitaciones/aceptar', 'POST', { codigo: creada.data.codigo }, 'conEnlace')).status, 200);
    assert.equal((await request('/invitaciones/aceptar', 'POST', { codigo: creada.data.codigo }, 'otro')).status, 410);
    assert.equal((await request('/invitaciones/aceptar', 'POST', { codigo: 'AAAAA-AAAAA' }, 'otro')).status, 404);
  });

  it('una invitación cancelada ya no se puede usar', async () => {
    const creada = await request(`${base}/invitaciones`, 'POST', invitacion({}), 'admin');
    const pendientes = await request(`${base}/red`, 'GET', undefined, 'admin');
    assert.ok(pendientes.data.invitaciones.some((i: { id: string }) => i.id === creada.data.invitacion.id));
    assert.equal((await request(`${base}/invitaciones/${creada.data.invitacion.id}`, 'DELETE', undefined, 'admin')).status, 204);
    assert.equal((await request('/invitaciones/aceptar', 'POST', { codigo: creada.data.codigo }, 'otro')).status, 410);
  });

  it('el acceso temporal ve solo lo que su rol permite y vence solo', async () => {
    const creada = await request(`${base}/invitaciones`, 'POST', invitacion({
      telefono: usuarios.temporal.digitos, rol: 'temporal', accesoHasta: enDias(3),
    }), 'admin');
    assert.equal(creada.status, 201);
    assert.equal((await request('/invitaciones/aceptar', 'POST', { codigo: creada.data.codigo }, 'temporal')).status, 200);

    assert.equal((await request(`${base}/ficha-medica`, 'GET', undefined, 'temporal')).status, 403);
    assert.equal((await request(`${base}/red`, 'GET', undefined, 'temporal')).status, 403);
    assert.equal((await request(`${base}/contactos`, 'GET', undefined, 'temporal')).status, 200);
    const nota = await request(`${base}/diario`, 'POST', { categoria: 'alimentacion', texto: 'Comió bien' }, 'temporal');
    assert.equal(nota.status, 201);

    const lista = await request('/familiares', 'GET', undefined, 'temporal');
    const persona = lista.data.find((f: { id: string }) => f.id === personaId);
    assert.ok(persona.accesoVenceEn);
    assert.equal(persona.permisoFicha, false);

    await prisma.miembroRed.updateMany({
      where: { personaId, usuarioId: usuarios.temporal.id },
      data: { venceEn: new Date(Date.now() - 1000) },
    });
    assert.equal((await request(`${base}/diario`, 'GET', undefined, 'temporal')).status, 403);
    const despues = await request('/familiares', 'GET', undefined, 'temporal');
    assert.ok(!despues.data.some((f: { id: string }) => f.id === personaId));
  });

  it('administra contactos de emergencia con prioridad', async () => {
    const uno = await request(`${base}/contactos`, 'POST', { nombre: 'Laura', telefono: '81 1111 2222', parentesco: 'hija' }, 'admin');
    const dos = await request(`${base}/contactos`, 'POST', { nombre: 'Pedro', telefono: '8133334444' }, 'familiar');
    assert.equal(uno.status, 201);
    assert.equal(uno.data.telefono, '8111112222');
    assert.equal(dos.data.prioridad, 2);
    assert.equal((await request(`${base}/contactos`, 'POST', { nombre: 'X', telefono: '1' }, 'admin')).status, 400);
    assert.equal((await request(`${base}/contactos`, 'POST', { nombre: 'Lectura', telefono: '8100000000' }, 'conEnlace')).status, 403);

    const ordenados = await request(`${base}/contactos/orden`, 'PUT', { ids: [dos.data.id, uno.data.id] }, 'admin');
    assert.deepEqual(ordenados.data.map((c: { nombre: string }) => c.nombre), ['Pedro', 'Laura']);

    assert.equal((await request(`${base}/contactos/${dos.data.id}`, 'DELETE', undefined, 'admin')).status, 204);
    const restantes = await request(`${base}/contactos`, 'GET', undefined, 'conEnlace');
    assert.equal(restantes.data.length, 1);
    assert.equal(restantes.data[0].prioridad, 1);
  });

  it('el diario registra autor y solo el autor edita su nota', async () => {
    const nota = await request(`${base}/diario`, 'POST', { categoria: 'animo', texto: 'Estuvo contenta' }, 'familiar');
    assert.equal(nota.status, 201);
    assert.equal(nota.data.autor.esTuyo, true);
    assert.equal(nota.data.familiarID, personaId);

    assert.equal((await request(`${base}/diario/${nota.data.id}`, 'PUT', { categoria: 'animo', texto: 'Cambio' }, 'admin')).status, 403);
    assert.equal((await request(`${base}/diario`, 'POST', { categoria: 'otro', texto: 'No puedo' }, 'conEnlace')).status, 403);
    const editada = await request(`${base}/diario/${nota.data.id}`, 'PUT', { categoria: 'animo', texto: 'Estuvo muy contenta' }, 'familiar');
    assert.equal(editada.status, 200);
    assert.ok(editada.data.editadoEn);

    const lista = await request(`${base}/diario?categoria=animo`, 'GET', undefined, 'admin');
    assert.equal(lista.data[0].autor.nombre, 'familiar');
    assert.equal(lista.data[0].autor.esTuyo, false);
    assert.equal((await request(`${base}/diario`, 'POST', { categoria: 'otro', texto: 'x', fecha: enDias(2) }, 'admin')).status, 400);
  });
});

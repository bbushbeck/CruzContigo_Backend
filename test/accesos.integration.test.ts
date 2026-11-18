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

describe('Accesos a la ficha: autorización, revocación y profesionales (HU-08, HU-16)', () => {
  let server: Server;
  let baseURL: string;
  let prisma: typeof import('../src/database/cliente').prisma;
  let versionAviso: string;

  const nombres = ['admin', 'cuidador', 'profesional', 'sinConvenio', 'titular'] as const;
  type Nombre = (typeof nombres)[number];
  const usuarios = Object.fromEntries(nombres.map((n) => [n, {
    id: randomUUID(),
    digitos: String(randomInt(1_000_000_000, 2_000_000_000)),
    token: randomBytes(32).toString('base64url'),
  }])) as Record<Nombre, { id: string; digitos: string; token: string }>;
  const sesiones: Partial<Record<Nombre, string>> = {};
  const personaId = randomUUID();
  const convenioId = randomUUID();
  const fichaPath = `/familiares/${personaId}/ficha-medica`;
  const accesosPath = `/familiares/${personaId}/accesos`;
  const ficha = { tipoSanguineo: 'A+', alergias: [{ nombre: 'Látex', severidad: 'moderada' }], enfermedades: [] };

  async function request(path: string, method = 'GET', body?: unknown, quien?: Nombre) {
    const response = await fetch(baseURL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(quien ? { Authorization: `Bearer ${usuarios[quien].token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const texto = await response.text();
    return { status: response.status, data: texto ? JSON.parse(texto) : null };
  }

  const autorizacion = (quien: Nombre, rol: string, extra: object = {}) => ({
    telefono: usuarios[quien].digitos, rol, versionAviso, aceptaAviso: true, ...extra,
  });

  before(async () => {
    prisma = (await import('../src/database/cliente')).prisma;
    versionAviso = (await import('../src/modules/accesos/accesos.schema')).VERSION_AVISO;
    for (const n of nombres) {
      const u = usuarios[n];
      await prisma.usuario.create({ data: { id: u.id, telefono: `+52${u.digitos}`, nombre: n } });
      const sesion = await prisma.sesionDispositivo.create({
        data: { usuarioId: u.id, plataforma: 'ios', refreshTokenHash: createHash('sha256').update(u.token).digest('hex') },
      });
      sesiones[n] = sesion.id;
    }
    await prisma.convenio.create({ data: { id: convenioId, institucion: 'Hospital de prueba', vigenteDesde: new Date('2026-01-01') } });
    await prisma.profesionalConvenio.create({ data: { usuarioId: usuarios.profesional.id, convenioId, cedula: '12345678' } });

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
      id: personaId, nombre: 'Prueba', apellidos: 'Accesos', fechaNacimiento: '1950-01-01T12:00:00Z',
      parentesco: 'madre', tipoCuidado: 'adultoMayor', telefono: '8110000000',
    }, 'admin');
    assert.equal(creada.status, 201);
    assert.equal((await request(fichaPath, 'PUT', ficha, 'admin')).status, 200);
  });

  after(async () => {
    try {
      if (prisma) {
        await prisma.personaCuidada.deleteMany({ where: { id: personaId } });
        await prisma.convenio.deleteMany({ where: { id: convenioId } });
        await prisma.usuario.deleteMany({ where: { id: { in: nombres.map((n) => usuarios[n].id) } } });
      }
    } finally {
      if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      if (prisma) await prisma.$disconnect();
    }
  });

  it('un tercero sin autorización no accede', async () => {
    assert.equal((await request(fichaPath, 'GET', undefined, 'cuidador')).status, 403);
    assert.equal((await request(accesosPath, 'GET', undefined, 'cuidador')).status, 403);
    assert.equal((await request(accesosPath, 'POST', autorizacion('cuidador', 'cocuidador'), 'cuidador')).status, 403);
  });

  it('exige aceptar la versión vigente del aviso de privacidad', async () => {
    const sinAceptar = await request(accesosPath, 'POST', { ...autorizacion('cuidador', 'cocuidador'), aceptaAviso: false }, 'admin');
    assert.equal(sinAceptar.status, 400);
    const versionVieja = await request(accesosPath, 'POST', autorizacion('cuidador', 'cocuidador', { versionAviso: '2000-01' }), 'admin');
    assert.equal(versionVieja.status, 400);
    const sinCuenta = await request(accesosPath, 'POST', { ...autorizacion('cuidador', 'cocuidador'), telefono: '8119999999' }, 'admin');
    assert.equal(sinCuenta.status, 404);
  });

  it('autoriza a un cuidador y guarda la evidencia del consentimiento', async () => {
    const creado = await request(accesosPath, 'POST', autorizacion('cuidador', 'cocuidador', { relacion: 'hija' }), 'admin');
    assert.equal(creado.status, 201);
    assert.equal(creado.data.rol, 'cocuidador');
    assert.equal(creado.data.estado, 'activo');
    assert.match(creado.data.telefono, /^•••• \d{4}$/);
    assert.equal((await request(fichaPath, 'GET', undefined, 'cuidador')).status, 200);

    const evidencia = await prisma.consentimiento.findFirstOrThrow({
      where: { personaId, usuarioId: usuarios.cuidador.id, accion: 'autorizar' },
    });
    assert.equal(evidencia.otorgadoPor, usuarios.admin.id);
    assert.equal(evidencia.versionAviso, versionAviso);
    assert.equal(evidencia.sesionId, sesiones.admin);

    const lista = await request(accesosPath, 'GET', undefined, 'admin');
    assert.equal(lista.status, 200);
    assert.equal(lista.data.versionAviso, versionAviso);
    assert.ok(lista.data.miembros.some((m: { id: string }) => m.id === creado.data.id));
  });

  it('la revocación bloquea la siguiente consulta en menos de 5 s', async () => {
    const miembro = await prisma.miembroRed.findFirstOrThrow({ where: { personaId, usuarioId: usuarios.cuidador.id } });
    const inicio = Date.now();
    assert.equal((await request(`${accesosPath}/${miembro.id}`, 'DELETE', undefined, 'admin')).status, 204);
    assert.equal((await request(fichaPath, 'GET', undefined, 'cuidador')).status, 403);
    assert.ok(Date.now() - inicio < 5000);

    const historial = await request(`${accesosPath}/consentimientos`, 'GET', undefined, 'admin');
    assert.equal(historial.status, 200);
    assert.equal(historial.data[0].accion, 'revocar');
    assert.equal(historial.data[0].usuario.nombre, 'cuidador');
  });

  it('no autoriza como profesional a quien no tiene convenio', async () => {
    const respuesta = await request(accesosPath, 'POST', autorizacion('sinConvenio', 'profesional'), 'admin');
    assert.equal(respuesta.status, 403);
    const excedido = await request(accesosPath, 'POST', autorizacion('profesional', 'profesional', { diasVigencia: 31 }), 'admin');
    assert.equal(excedido.status, 400);
  });

  it('el profesional solo consulta la ficha y cada consulta queda registrada', async () => {
    const creado = await request(accesosPath, 'POST', autorizacion('profesional', 'profesional'), 'admin');
    assert.equal(creado.status, 201);
    assert.ok(creado.data.venceEn, 'el acceso profesional debe vencer');

    assert.equal((await request(fichaPath, 'GET', undefined, 'profesional')).status, 200);
    assert.equal((await request(fichaPath, 'PUT', ficha, 'profesional')).status, 403);
    assert.equal((await request(accesosPath, 'GET', undefined, 'profesional')).status, 403);

    const registro = await prisma.bitacoraAcceso.findFirstOrThrow({ where: { personaId, usuarioId: usuarios.profesional.id } });
    assert.equal(registro.accion, 'consultar_ficha');
    assert.equal(registro.sesionId, sesiones.profesional);

    const familiares = await request('/familiares', 'GET', undefined, 'profesional');
    const persona = familiares.data.find((f: { id: string }) => f.id === personaId);
    assert.equal(persona.telefono, null);
  });

  it('sin convenio vigente el profesional pierde el acceso', async () => {
    await prisma.convenio.update({ where: { id: convenioId }, data: { vigenteHasta: new Date('2026-01-02') } });
    assert.equal((await request(fichaPath, 'GET', undefined, 'profesional')).status, 403);
  });

  it('el código QR de emergencia solo existe con consentimiento (HU-19)', async () => {
    const qrPath = `${accesosPath}/qr`;
    const inicial = await request(qrPath, 'GET', undefined, 'admin');
    assert.equal(inicial.status, 200);
    assert.equal(inicial.data.consentido, false);

    assert.equal((await request(qrPath, 'PUT', { consentido: true, versionAviso }, 'admin')).status, 400);
    assert.equal((await request(qrPath, 'PUT', { consentido: true, versionAviso, aceptaAviso: true }, 'cuidador')).status, 403);

    const activado = await request(qrPath, 'PUT', { consentido: true, versionAviso, aceptaAviso: true }, 'admin');
    assert.equal(activado.status, 200);
    assert.equal(activado.data.consentido, true);
    const evidencia = await prisma.consentimiento.findFirstOrThrow({ where: { personaId, accion: 'compartir_qr' } });
    assert.equal(evidencia.otorgadoPor, usuarios.admin.id);
    assert.equal(evidencia.rol, 'administrador');

    const retirado = await request(qrPath, 'PUT', { consentido: false }, 'admin');
    assert.equal(retirado.data.consentido, false);
    assert.equal((await request(qrPath, 'GET', undefined, 'admin')).data.consentido, false);
  });

  it('si la persona titular tiene cuenta, solo ella administra los accesos', async () => {
    await prisma.miembroRed.create({ data: { personaId, usuarioId: usuarios.titular.id, rol: 'titular', estado: 'activo' } });
    assert.equal((await request(accesosPath, 'GET', undefined, 'admin')).status, 403);
    assert.equal((await request(accesosPath, 'GET', undefined, 'titular')).status, 200);
    const admin = await prisma.miembroRed.findFirstOrThrow({ where: { personaId, usuarioId: usuarios.admin.id } });
    assert.equal((await request(`${accesosPath}/${admin.id}`, 'DELETE', undefined, 'titular')).status, 204);
    assert.equal((await request(fichaPath, 'GET', undefined, 'admin')).status, 403);
  });
});

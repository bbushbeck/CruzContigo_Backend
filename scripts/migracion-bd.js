// Migración BD CruzContigo — pasos 1-6 del plan (plan-migracion-bd.md)
const { PrismaClient } = require('@prisma/client');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
require('dotenv').config();
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) });

const pasos = [
  // ---- Paso 1: recrear invitacion (0 filas) ----
  ['1.1 DROP invitacion', 'DROP TABLE `invitacion`'],
  ['1.2 CREATE invitacion', `CREATE TABLE \`invitacion\` (
    \`id\` CHAR(36) NOT NULL,
    \`persona_id\` CHAR(36) NOT NULL,
    \`codigo_hash\` CHAR(64) NOT NULL,
    \`telefono\` VARCHAR(20) NULL,
    \`rol\` ENUM('titular','administrador','cocuidador','solo_lectura','temporal','profesional') NOT NULL,
    \`relacion\` VARCHAR(40) NULL,
    \`acceso_hasta\` DATETIME(3) NULL,
    \`permiso_ficha\` BOOLEAN NOT NULL DEFAULT false,
    \`version_aviso\` VARCHAR(20) NOT NULL,
    \`creada_por\` CHAR(36) NOT NULL,
    \`sesion_id\` CHAR(36) NULL,
    \`expira_en\` DATETIME(3) NOT NULL,
    \`aceptada_por\` CHAR(36) NULL,
    \`aceptada_en\` DATETIME(3) NULL,
    \`cancelada_en\` DATETIME(3) NULL,
    \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX \`invitacion_codigo_hash_key\`(\`codigo_hash\`),
    INDEX \`invitacion_persona_id_idx\`(\`persona_id\`),
    INDEX \`invitacion_telefono_idx\`(\`telefono\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`],
  ['1.3 FK invitacion', 'ALTER TABLE `invitacion` ADD CONSTRAINT `invitacion_persona_id_fkey` FOREIGN KEY (`persona_id`) REFERENCES `persona_cuidada`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'],

  // ---- Paso 2: recrear nota_diario (0 filas) ----
  ['2.1 DROP nota_diario', 'DROP TABLE `nota_diario`'],
  ['2.2 CREATE nota_diario', `CREATE TABLE \`nota_diario\` (
    \`id\` CHAR(36) NOT NULL,
    \`persona_id\` CHAR(36) NOT NULL,
    \`autor_id\` CHAR(36) NOT NULL,
    \`categoria\` ENUM('alimentacion','sueno','animo','incidencia','otro') NOT NULL,
    \`texto\` VARCHAR(2000) NOT NULL,
    \`fecha\` DATETIME(3) NOT NULL,
    \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`editado_en\` DATETIME(3) NULL,
    INDEX \`nota_diario_persona_id_fecha_idx\`(\`persona_id\`, \`fecha\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`],
  ['2.3 FK nota_diario', 'ALTER TABLE `nota_diario` ADD CONSTRAINT `nota_diario_persona_id_fkey` FOREIGN KEY (`persona_id`) REFERENCES `persona_cuidada`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'],

  // ---- Paso 3: archivar y recrear bitacora_acceso ----
  ['3.1 RENAME bitacora_acceso', 'RENAME TABLE `bitacora_acceso` TO `bitacora_acceso_legacy`'],
  ['3.2 CREATE bitacora_acceso', `CREATE TABLE \`bitacora_acceso\` (
    \`id\` CHAR(36) NOT NULL,
    \`persona_id\` CHAR(36) NOT NULL,
    \`usuario_id\` CHAR(36) NOT NULL,
    \`sesion_id\` CHAR(36) NULL,
    \`rol\` ENUM('titular','administrador','cocuidador','solo_lectura','temporal','profesional') NOT NULL,
    \`accion\` VARCHAR(40) NOT NULL,
    \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`bitacora_acceso_persona_id_creado_en_idx\`(\`persona_id\`, \`creado_en\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`],
  ['3.3 FK bitacora_acceso', 'ALTER TABLE `bitacora_acceso` ADD CONSTRAINT `bitacora_acceso_persona_id_fkey` FOREIGN KEY (`persona_id`) REFERENCES `persona_cuidada`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'],

  // ---- Paso 4: archivar y recrear consentimiento ----
  ['4.1 RENAME consentimiento', 'RENAME TABLE `consentimiento` TO `consentimiento_legacy`'],
  ['4.2 CREATE consentimiento', `CREATE TABLE \`consentimiento\` (
    \`id\` CHAR(36) NOT NULL,
    \`persona_id\` CHAR(36) NOT NULL,
    \`otorgado_por\` CHAR(36) NOT NULL,
    \`usuario_id\` CHAR(36) NOT NULL,
    \`accion\` ENUM('autorizar','revocar','compartir_qr','retirar_qr') NOT NULL,
    \`rol\` ENUM('titular','administrador','cocuidador','solo_lectura','temporal','profesional') NOT NULL,
    \`version_aviso\` VARCHAR(20) NOT NULL,
    \`sesion_id\` CHAR(36) NULL,
    \`creado_en\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX \`consentimiento_persona_id_creado_en_idx\`(\`persona_id\`, \`creado_en\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`],
  ['4.3 FK consentimiento', 'ALTER TABLE `consentimiento` ADD CONSTRAINT `consentimiento_persona_id_fkey` FOREIGN KEY (`persona_id`) REFERENCES `persona_cuidada`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'],

  // ---- Paso 5: tablas de convenios ----
  ['5.1 CREATE convenio_institucional', `CREATE TABLE \`convenio_institucional\` (
    \`id\` CHAR(36) NOT NULL,
    \`institucion\` VARCHAR(120) NOT NULL,
    \`vigente_desde\` DATE NOT NULL,
    \`vigente_hasta\` DATE NULL,
    \`activo\` BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`],
  ['5.2 CREATE profesional_convenio', `CREATE TABLE \`profesional_convenio\` (
    \`usuario_id\` CHAR(36) NOT NULL,
    \`convenio_id\` CHAR(36) NOT NULL,
    \`cedula\` VARCHAR(20) NOT NULL,
    PRIMARY KEY (\`usuario_id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`],
  ['5.3 FK profesional_convenio', 'ALTER TABLE `profesional_convenio` ADD CONSTRAINT `profesional_convenio_convenio_id_fkey` FOREIGN KEY (`convenio_id`) REFERENCES `convenio_institucional`(`id`) ON DELETE CASCADE ON UPDATE CASCADE'],

  // ---- Paso 6: contacto_emergencia y usuario ----
  ['6.1 ALTER contacto_emergencia', 'ALTER TABLE `contacto_emergencia` ADD COLUMN `creado_por` CHAR(36) NULL, ADD COLUMN `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)'],
  ['6.2 Backfill contacto_emergencia', 'UPDATE `contacto_emergencia` ce JOIN `persona_cuidada` pc ON pc.id = ce.persona_id SET ce.creado_por = pc.creado_por WHERE ce.creado_por IS NULL'],
  ['6.3 ALTER usuario', "ALTER TABLE `usuario` MODIFY `nombre` VARCHAR(120) NOT NULL DEFAULT '', MODIFY `rol_preferido` ENUM('cuidador','recibe_cuidados') NOT NULL DEFAULT 'cuidador'"],
];

(async () => {
  for (const [nombre, sql] of pasos) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('OK  ' + nombre);
    } catch (e) {
      console.error('FALLO ' + nombre + ': ' + e.message);
      process.exitCode = 1;
      break;
    }
  }
  // Verificación intermedia: ningún contacto sin creado_por antes de endurecer NOT NULL
  if (!process.exitCode) {
    const nulos = await prisma.$queryRawUnsafe('SELECT COUNT(*) n FROM contacto_emergencia WHERE creado_por IS NULL');
    console.log('contacto_emergencia sin creado_por: ' + nulos[0].n);
    if (Number(nulos[0].n) === 0) {
      await prisma.$executeRawUnsafe('ALTER TABLE `contacto_emergencia` MODIFY `creado_por` CHAR(36) NOT NULL');
      console.log('OK  6.4 contacto_emergencia.creado_por NOT NULL');
    } else {
      console.error('FALLO 6.4: quedan filas sin creado_por, no se endureció la restricción');
      process.exitCode = 1;
    }
  }
  await prisma.$disconnect();
})();

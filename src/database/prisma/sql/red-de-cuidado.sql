-- HU-17 (RF-11), HU-26, RF-15 y HU-13 (RF-13): red de cuidado, contactos y diario.
-- Ejecutar una vez en Aiven, después de hu08-hu16-acceso-ficha.sql.
-- En una base local nueva basta con `npx prisma db push`.

ALTER TABLE `miembro_red`
  ADD COLUMN `permiso_ficha` BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS `invitacion` (
  `id` CHAR(36) NOT NULL,
  `persona_id` CHAR(36) NOT NULL,
  `codigo_hash` CHAR(64) NOT NULL,
  `telefono` VARCHAR(20) NULL,
  `rol` ENUM('titular', 'administrador', 'cocuidador', 'solo_lectura', 'temporal', 'profesional') NOT NULL,
  `relacion` VARCHAR(40) NULL,
  `acceso_hasta` DATETIME(3) NULL,
  `permiso_ficha` BOOLEAN NOT NULL DEFAULT FALSE,
  `version_aviso` VARCHAR(20) NOT NULL,
  `creada_por` CHAR(36) NOT NULL,
  `sesion_id` CHAR(36) NULL,
  `expira_en` DATETIME(3) NOT NULL,
  `aceptada_por` CHAR(36) NULL,
  `aceptada_en` DATETIME(3) NULL,
  `cancelada_en` DATETIME(3) NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `invitacion_codigo_hash_key` (`codigo_hash`),
  INDEX `invitacion_persona_id_idx` (`persona_id`),
  INDEX `invitacion_telefono_idx` (`telefono`),
  CONSTRAINT `invitacion_persona_id_fkey` FOREIGN KEY (`persona_id`)
    REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `contacto_emergencia` (
  `id` CHAR(36) NOT NULL,
  `persona_id` CHAR(36) NOT NULL,
  `nombre` VARCHAR(120) NOT NULL,
  `telefono` VARCHAR(20) NOT NULL,
  `parentesco` VARCHAR(40) NULL,
  `prioridad` SMALLINT NOT NULL,
  `creado_por` CHAR(36) NOT NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `contacto_emergencia_persona_id_prioridad_idx` (`persona_id`, `prioridad`),
  CONSTRAINT `contacto_emergencia_persona_id_fkey` FOREIGN KEY (`persona_id`)
    REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `nota_diario` (
  `id` CHAR(36) NOT NULL,
  `persona_id` CHAR(36) NOT NULL,
  `autor_id` CHAR(36) NOT NULL,
  `categoria` ENUM('alimentacion', 'sueno', 'animo', 'incidencia', 'otro') NOT NULL,
  `texto` VARCHAR(2000) NOT NULL,
  `fecha` DATETIME(3) NOT NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `editado_en` DATETIME(3) NULL,
  PRIMARY KEY (`id`),
  INDEX `nota_diario_persona_id_fecha_idx` (`persona_id`, `fecha`),
  CONSTRAINT `nota_diario_persona_id_fkey` FOREIGN KEY (`persona_id`)
    REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

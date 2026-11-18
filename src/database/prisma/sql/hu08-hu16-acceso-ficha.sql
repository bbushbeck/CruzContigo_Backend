-- HU-08 (RF-30, RF-31) y HU-16 (RF-38): permisos, consentimiento y acceso profesional.
-- HU-19 (RF-28): el consentimiento del código QR de emergencia usa la misma tabla.
-- Ejecutar una sola vez en Aiven. En una base local nueva basta con `npx prisma db push`.

ALTER TABLE `miembro_red`
  MODIFY `rol` ENUM('titular', 'administrador', 'cocuidador', 'solo_lectura', 'temporal', 'profesional') NOT NULL;

CREATE TABLE IF NOT EXISTS `consentimiento` (
  `id` CHAR(36) NOT NULL,
  `persona_id` CHAR(36) NOT NULL,
  `otorgado_por` CHAR(36) NOT NULL,
  `usuario_id` CHAR(36) NOT NULL,
  `accion` ENUM('autorizar', 'revocar', 'compartir_qr', 'retirar_qr') NOT NULL,
  `rol` ENUM('titular', 'administrador', 'cocuidador', 'solo_lectura', 'temporal', 'profesional') NOT NULL,
  `version_aviso` VARCHAR(20) NOT NULL,
  `sesion_id` CHAR(36) NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `consentimiento_persona_id_creado_en_idx` (`persona_id`, `creado_en`),
  CONSTRAINT `consentimiento_persona_id_fkey` FOREIGN KEY (`persona_id`)
    REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `convenio_institucional` (
  `id` CHAR(36) NOT NULL,
  `institucion` VARCHAR(120) NOT NULL,
  `vigente_desde` DATE NOT NULL,
  `vigente_hasta` DATE NULL,
  `activo` BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `profesional_convenio` (
  `usuario_id` CHAR(36) NOT NULL,
  `convenio_id` CHAR(36) NOT NULL,
  `cedula` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`usuario_id`),
  CONSTRAINT `profesional_convenio_convenio_id_fkey` FOREIGN KEY (`convenio_id`)
    REFERENCES `convenio_institucional` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS `bitacora_acceso` (
  `id` CHAR(36) NOT NULL,
  `persona_id` CHAR(36) NOT NULL,
  `usuario_id` CHAR(36) NOT NULL,
  `sesion_id` CHAR(36) NULL,
  `rol` ENUM('titular', 'administrador', 'cocuidador', 'solo_lectura', 'temporal', 'profesional') NOT NULL,
  `accion` VARCHAR(40) NOT NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `bitacora_acceso_persona_id_creado_en_idx` (`persona_id`, `creado_en`),
  CONSTRAINT `bitacora_acceso_persona_id_fkey` FOREIGN KEY (`persona_id`)
    REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Solo inserción. Los borrados en cascada al eliminar a la persona no activan triggers en MySQL.
CREATE TRIGGER `consentimiento_sin_cambios` BEFORE UPDATE ON `consentimiento`
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consentimiento es de solo inserción';
CREATE TRIGGER `consentimiento_sin_borrado` BEFORE DELETE ON `consentimiento`
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'consentimiento es de solo inserción';
CREATE TRIGGER `bitacora_acceso_sin_cambios` BEFORE UPDATE ON `bitacora_acceso`
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bitacora_acceso es de solo inserción';
CREATE TRIGGER `bitacora_acceso_sin_borrado` BEFORE DELETE ON `bitacora_acceso`
  FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'bitacora_acceso es de solo inserción';

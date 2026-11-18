-- Solo para una base local de pruebas. La API no usa las columnas de cita_medica.
CREATE TABLE `cita_medica` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Definición de recordatorio facilitada por el equipo. Ya existe en Aiven.
CREATE TABLE `recordatorio` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `persona_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `medicamento_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cita_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tipo` enum('medicamento','cita','tarea','otro') COLLATE utf8mb4_unicode_ci NOT NULL,
  `titulo` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `regla_recurrencia` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `margen_omision_min` smallint NOT NULL DEFAULT '30',
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `fk_recordatorio_medicamento_id` (`medicamento_id`),
  KEY `fk_recordatorio_cita_id` (`cita_id`),
  KEY `ix_recordatorio_persona_activo` (`persona_id`,`activo`),
  CONSTRAINT `fk_recordatorio_cita_id` FOREIGN KEY (`cita_id`) REFERENCES `cita_medica` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recordatorio_medicamento_id` FOREIGN KEY (`medicamento_id`) REFERENCES `medicamento` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_recordatorio_persona_id` FOREIGN KEY (`persona_id`) REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Copia de la definición facilitada por el equipo, solo para la base local _test.
-- La tabla ya existe en Aiven: no ejecutar allí este archivo.
CREATE TABLE `medicamento` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `persona_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nombre` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `presentacion` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dosis` decimal(10,2) NOT NULL,
  `unidad` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `indicacion` text COLLATE utf8mb4_unicode_ci,
  `frecuencia` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inicio` date NOT NULL,
  `fin` date DEFAULT NULL,
  `existencias` decimal(10,2) DEFAULT NULL,
  `umbral_resurtido_dias` smallint NOT NULL DEFAULT '5',
  PRIMARY KEY (`id`),
  KEY `fk_medicamento_persona_id` (`persona_id`),
  CONSTRAINT `fk_medicamento_persona_id` FOREIGN KEY (`persona_id`)
    REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE,
  CONSTRAINT `ck_medicamento_dosis` CHECK (`dosis` > 0),
  CONSTRAINT `ck_medicamento_fechas` CHECK (`fin` is null or `fin` >= `inicio`)
);

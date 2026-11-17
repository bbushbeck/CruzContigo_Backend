-- Cambio aditivo. Requiere las tablas existentes usuario y persona_cuidada.
CREATE TABLE `recordatorio_usuario` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `persona_id` CHAR(36) NOT NULL,
    `titulo` VARCHAR(120) NOT NULL,
    `fecha` DATETIME(0) NOT NULL,
    `completado` BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (`id`),
    INDEX `recordatorio_usuario_usuario_id_fecha_idx` (`usuario_id`, `fecha`),
    INDEX `recordatorio_usuario_persona_id_idx` (`persona_id`),
    CONSTRAINT `recordatorio_usuario_usuario_id_fkey`
        FOREIGN KEY (`usuario_id`) REFERENCES `usuario` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `recordatorio_usuario_persona_id_fkey`
        FOREIGN KEY (`persona_id`) REFERENCES `persona_cuidada` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Additive only: the media_file table and nullable media_id links on messages and
-- user_master. File contents are stored outside MySQL.


-- AlterTable
ALTER TABLE `group_chat` ADD COLUMN `media_id` BIGINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `personal_chat_history` ADD COLUMN `media_id` BIGINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `user_master` ADD COLUMN `profile_photo_media_id` BIGINT UNSIGNED NULL;

-- CreateTable
CREATE TABLE `media_file` (
    `media_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `owner_user_org_id` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('IMAGE', 'VIDEO', 'AUDIO', 'VOICE', 'DOCUMENT', 'AVATAR') NOT NULL,
    `status` ENUM('PENDING', 'READY') NOT NULL DEFAULT 'PENDING',
    `storage_provider` VARCHAR(20) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `thumbnail_key` VARCHAR(255) NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `declared_size` BIGINT UNSIGNED NOT NULL,
    `size_bytes` BIGINT UNSIGNED NULL,
    `checksum_sha256` CHAR(64) NULL,
    `width` INTEGER UNSIGNED NULL,
    `height` INTEGER UNSIGNED NULL,
    `duration_ms` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` DATETIME(0) NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `uq_media_storage_key`(`storage_key`),
    INDEX `idx_media_owner`(`owner_user_org_id`, `status`),
    PRIMARY KEY (`media_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_group_chat_media` ON `group_chat`(`media_id`);

-- CreateIndex
CREATE INDEX `idx_personal_chat_media` ON `personal_chat_history`(`media_id`);

-- AddForeignKey
ALTER TABLE `group_chat` ADD CONSTRAINT `fk_group_chat_media` FOREIGN KEY (`media_id`) REFERENCES `media_file`(`media_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `personal_chat_history` ADD CONSTRAINT `fk_personal_chat_media` FOREIGN KEY (`media_id`) REFERENCES `media_file`(`media_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_master` ADD CONSTRAINT `fk_user_profile_photo` FOREIGN KEY (`profile_photo_media_id`) REFERENCES `media_file`(`media_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `media_file` ADD CONSTRAINT `fk_media_owner` FOREIGN KEY (`owner_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;


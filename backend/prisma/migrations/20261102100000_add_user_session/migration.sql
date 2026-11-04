-- Additive only: no existing row or column is removed.
-- Adds refresh-token sessions, links push tokens to sessions, and widens
-- register_otp.otp so it can hold a hash instead of the plaintext code.

-- AlterTable
ALTER TABLE `register_otp` MODIFY `otp` VARCHAR(128) NOT NULL;

-- CreateIndex
CREATE INDEX `idx_register_otp_mobile_created` ON `register_otp`(`country_code`, `mobile_no`, `created_at`);

-- AlterTable
ALTER TABLE `user_device` ADD COLUMN `session_id` BIGINT UNSIGNED NULL;

-- CreateTable
CREATE TABLE `user_session` (
    `session_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,
    `refresh_token_hash` CHAR(64) NOT NULL,
    `previous_refresh_token_hash` CHAR(64) NULL,
    `rotated_at` DATETIME(0) NULL,
    `device_type` VARCHAR(20) NULL,
    `device_name` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_used_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` DATETIME(0) NOT NULL,
    `revoked_at` DATETIME(0) NULL,
    `revoke_reason` VARCHAR(30) NULL,

    UNIQUE INDEX `uq_user_session_refresh`(`refresh_token_hash`),
    INDEX `idx_user_session_user_org`(`user_organization_id`, `revoked_at`),
    INDEX `idx_user_session_previous`(`previous_refresh_token_hash`),
    INDEX `idx_user_session_expires`(`expires_at`),
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_user_device_session` ON `user_device`(`session_id`);

-- AddForeignKey
ALTER TABLE `user_device` ADD CONSTRAINT `fk_user_device_session` FOREIGN KEY (`session_id`) REFERENCES `user_session`(`session_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_session` ADD CONSTRAINT `fk_user_session_user_org` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- CreateTable
CREATE TABLE `user_device` (
    `device_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,
    `fcm_token` VARCHAR(500) NOT NULL,
    `device_type` VARCHAR(20) NULL,
    `device_name` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `uq_user_device_fcm`(`fcm_token`),
    INDEX `idx_user_device_user_org`(`user_organization_id`),
    PRIMARY KEY (`device_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_device` ADD CONSTRAINT `fk_user_device_user_org` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE CASCADE;

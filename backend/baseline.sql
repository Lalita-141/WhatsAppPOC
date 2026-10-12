-- CreateTable
CREATE TABLE `group_chat` (
    `group_chat_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `group_id` BIGINT UNSIGNED NOT NULL,
    `sender_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `message` TEXT NULL,
    `media` JSON NULL,
    `send_time` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `status` ENUM('SENT', 'DELIVERED', 'SEEN') NOT NULL DEFAULT 'SENT',
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_group_chat_deleted_at`(`deleted_at`),
    INDEX `idx_group_chat_group`(`group_id`),
    INDEX `idx_group_chat_send_time`(`send_time`),
    INDEX `idx_group_chat_sender_org`(`sender_user_organization_id`),
    PRIMARY KEY (`group_chat_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_chat_view` (
    `group_chat_view_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `group_chat_id` BIGINT UNSIGNED NOT NULL,
    `received_to_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `read_by_user_organization_id` BIGINT UNSIGNED NULL,
    `received_time` DATETIME(0) NULL,
    `read_time` DATETIME(0) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `fk_group_chat_view_read_by`(`read_by_user_organization_id`),
    INDEX `idx_group_chat_view_chat`(`group_chat_id`),
    INDEX `idx_group_chat_view_deleted_at`(`deleted_at`),
    INDEX `idx_group_chat_view_received_to`(`received_to_user_organization_id`),
    UNIQUE INDEX `uq_group_chat_view`(`group_chat_id`, `received_to_user_organization_id`),
    PRIMARY KEY (`group_chat_view_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `group_member` (
    `group_member_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `group_id` BIGINT UNSIGNED NOT NULL,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `joined_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_group_member_deleted_at`(`deleted_at`),
    INDEX `idx_group_member_group`(`group_id`),
    INDEX `idx_group_member_user_org`(`user_organization_id`),
    UNIQUE INDEX `uq_group_member`(`group_id`, `user_organization_id`),
    PRIMARY KEY (`group_member_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_master` (
    `org_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_code` VARCHAR(50) NOT NULL,
    `organization_name` VARCHAR(200) NOT NULL,
    `contact` VARCHAR(30) NULL,
    `email` VARCHAR(150) NULL,
    `location` VARCHAR(255) NULL,
    `gst` VARCHAR(50) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_org_deleted_at`(`deleted_at`),
    INDEX `idx_org_email`(`email`),
    INDEX `idx_org_name`(`organization_name`),
    PRIMARY KEY (`org_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personal_chat_history` (
    `chat_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sender_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `receiver_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `message` TEXT NULL,
    `media` JSON NULL,
    `send_time` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `receive_time` DATETIME(0) NULL,
    `status` ENUM('SENT', 'DELIVERED', 'SEEN') NOT NULL DEFAULT 'SENT',
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_personal_chat_deleted_at`(`deleted_at`),
    INDEX `idx_personal_chat_receiver_sender`(`receiver_user_organization_id`, `sender_user_organization_id`),
    INDEX `idx_personal_chat_send_time`(`send_time`),
    INDEX `idx_personal_chat_sender_receiver`(`sender_user_organization_id`, `receiver_user_organization_id`),
    PRIMARY KEY (`chat_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `register_otp` (
    `register_otp_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `mobile_no` VARCHAR(20) NOT NULL,
    `otp` VARCHAR(10) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` DATETIME(0) NOT NULL,
    `is_validated` BOOLEAN NOT NULL DEFAULT false,
    `trail_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `block_time` DATETIME(0) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_register_otp_deleted_at`(`deleted_at`),
    INDEX `idx_register_otp_expires`(`expires_at`),
    INDEX `idx_register_otp_mobile`(`country_code`, `mobile_no`),
    INDEX `idx_register_otp_org`(`org_id`),
    PRIMARY KEY (`register_otp_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_master` (
    `user_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `first_name` VARCHAR(100) NOT NULL,
    `last_name` VARCHAR(100) NULL,
    `mobile_no` VARCHAR(20) NOT NULL,
    `profile_photo` VARCHAR(500) NULL,
    `about` VARCHAR(500) NULL,
    `last_seen` DATETIME(0) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_user_deleted_at`(`deleted_at`),
    INDEX `idx_user_mobile`(`mobile_no`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_organization` (
    `user_organization_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `role` VARCHAR(100) NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_user_org_deleted_at`(`deleted_at`),
    INDEX `idx_user_org_org`(`org_id`),
    INDEX `idx_user_org_user`(`user_id`),
    UNIQUE INDEX `uq_user_organization`(`user_id`, `org_id`),
    PRIMARY KEY (`user_organization_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_setting` (
    `setting_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,
    `about_privacy` ENUM('EVERYONE', 'CONTACTS', 'NOBODY') NOT NULL DEFAULT 'EVERYONE',
    `profile_privacy` ENUM('EVERYONE', 'CONTACTS', 'NOBODY') NOT NULL DEFAULT 'CONTACTS',
    `last_seen_privacy` ENUM('EVERYONE', 'CONTACTS', 'NOBODY') NOT NULL DEFAULT 'EVERYONE',
    `read_receipts` BOOLEAN NOT NULL DEFAULT true,
    `typing_indicator` BOOLEAN NOT NULL DEFAULT true,
    `status_privacy` ENUM('EVERYONE', 'CONTACTS', 'NOBODY') NOT NULL DEFAULT 'CONTACTS',
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `user_organization_id`(`user_organization_id`),
    INDEX `idx_user_setting_deleted_at`(`deleted_at`),
    PRIMARY KEY (`setting_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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

-- CreateTable
CREATE TABLE `wp_group` (
    `group_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `group_name` VARCHAR(150) NOT NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `group_description` VARCHAR(500) NULL,
    `group_icon` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_group_deleted_at`(`deleted_at`),
    INDEX `idx_group_org`(`org_id`),
    PRIMARY KEY (`group_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `country_master` (
    `country_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `country_name` VARCHAR(100) NOT NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `iso_code` VARCHAR(10) NOT NULL,
    `iso3_code` VARCHAR(10) NULL,
    `flag` VARCHAR(10) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,
    `deleted_by` BIGINT UNSIGNED NULL,
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `uq_country_iso_code`(`iso_code`),
    INDEX `idx_country_active`(`is_active`),
    INDEX `idx_country_name`(`country_name`),
    UNIQUE INDEX `uq_country_code_iso`(`country_code`, `iso_code`),
    PRIMARY KEY (`country_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `group_chat` ADD CONSTRAINT `fk_group_chat_group` FOREIGN KEY (`group_id`) REFERENCES `wp_group`(`group_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `group_chat` ADD CONSTRAINT `fk_group_chat_sender_org` FOREIGN KEY (`sender_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `group_chat_view` ADD CONSTRAINT `fk_group_chat_view_chat` FOREIGN KEY (`group_chat_id`) REFERENCES `group_chat`(`group_chat_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `group_chat_view` ADD CONSTRAINT `fk_group_chat_view_read_by` FOREIGN KEY (`read_by_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `group_chat_view` ADD CONSTRAINT `fk_group_chat_view_received_to` FOREIGN KEY (`received_to_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `group_member` ADD CONSTRAINT `fk_group_member_group` FOREIGN KEY (`group_id`) REFERENCES `wp_group`(`group_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `group_member` ADD CONSTRAINT `fk_group_member_user_org` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `personal_chat_history` ADD CONSTRAINT `fk_personal_chat_receiver_org` FOREIGN KEY (`receiver_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `personal_chat_history` ADD CONSTRAINT `fk_personal_chat_sender_org` FOREIGN KEY (`sender_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `register_otp` ADD CONSTRAINT `fk_register_otp_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_organization` ADD CONSTRAINT `fk_user_org_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_organization` ADD CONSTRAINT `fk_user_org_user` FOREIGN KEY (`user_id`) REFERENCES `user_master`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_setting` ADD CONSTRAINT `fk_user_setting_user_org` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_device` ADD CONSTRAINT `fk_user_device_user_org` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wp_group` ADD CONSTRAINT `fk_group_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- Additive only: new tables, one new nullable column (user_organization.department_id).
-- Every existing organization gets default settings: internal chat on and no
-- external communication, which is how the app behaved before. New members
-- need an invite or admin approval (join_mode APPROVAL).


-- AlterTable
ALTER TABLE `user_organization` ADD COLUMN `department_id` BIGINT UNSIGNED NULL;

-- CreateTable
CREATE TABLE `organization_setting` (
    `org_id` BIGINT UNSIGNED NOT NULL,
    `internal_chat_enabled` BOOLEAN NOT NULL DEFAULT true,
    `external_policy` ENUM('INTERNAL_ONLY', 'SELECTED_ORGANIZATIONS', 'ALL_ORGANIZATIONS', 'DISABLED') NOT NULL DEFAULT 'INTERNAL_ONLY',
    `group_creation` ENUM('EVERYONE', 'ADMINS', 'NOBODY') NOT NULL DEFAULT 'EVERYONE',
    `external_participants` ENUM('EVERYONE', 'ADMINS', 'NOBODY') NOT NULL DEFAULT 'ADMINS',
    `broadcast_permission` ENUM('EVERYONE', 'ADMINS', 'NOBODY') NOT NULL DEFAULT 'ADMINS',
    `file_sharing_enabled` BOOLEAN NOT NULL DEFAULT true,
    `calls_enabled` BOOLEAN NOT NULL DEFAULT true,
    `max_upload_mb` INTEGER UNSIGNED NOT NULL DEFAULT 25,
    `join_mode` ENUM('OPEN', 'APPROVAL') NOT NULL DEFAULT 'APPROVAL',
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(0) NULL,

    PRIMARY KEY (`org_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_relationship` (
    `relationship_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `pair_key` VARCHAR(45) NOT NULL,
    `requester_org_id` BIGINT UNSIGNED NOT NULL,
    `target_org_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
    `requested_by` BIGINT UNSIGNED NULL,
    `responded_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `responded_at` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NULL,

    UNIQUE INDEX `uq_org_relationship_pair`(`pair_key`),
    INDEX `idx_org_rel_requester`(`requester_org_id`, `status`),
    INDEX `idx_org_rel_target`(`target_org_id`, `status`),
    PRIMARY KEY (`relationship_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_audit_log` (
    `audit_log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `actor_user_org_id` BIGINT UNSIGNED NULL,
    `action` VARCHAR(60) NOT NULL,
    `target_type` VARCHAR(40) NULL,
    `target_id` VARCHAR(40) NULL,
    `details` JSON NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_audit_org`(`org_id`, `audit_log_id`),
    PRIMARY KEY (`audit_log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `department` (
    `department_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_department_name`(`org_id`, `name`),
    PRIMARY KEY (`department_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_invite` (
    `invite_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `country_code` VARCHAR(10) NOT NULL,
    `mobile_no` VARCHAR(20) NOT NULL,
    `invited_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` DATETIME(0) NOT NULL,
    `accepted_at` DATETIME(0) NULL,
    `revoked_at` DATETIME(0) NULL,

    UNIQUE INDEX `uq_invite_phone`(`org_id`, `country_code`, `mobile_no`),
    PRIMARY KEY (`invite_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_join_request` (
    `join_request_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `decided_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `decided_at` DATETIME(0) NULL,

    INDEX `idx_join_request_status`(`org_id`, `status`),
    UNIQUE INDEX `uq_join_request`(`org_id`, `user_id`),
    PRIMARY KEY (`join_request_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `org_broadcast` (
    `broadcast_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `sender_user_org_id` BIGINT UNSIGNED NOT NULL,
    `sender_org_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(150) NULL,
    `message` TEXT NOT NULL,
    `is_announcement` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_broadcast_sender_org`(`sender_org_id`, `broadcast_id`),
    PRIMARY KEY (`broadcast_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `org_broadcast_target` (
    `broadcast_target_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `broadcast_id` BIGINT UNSIGNED NOT NULL,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `department_id` BIGINT UNSIGNED NULL,

    INDEX `idx_broadcast_target_broadcast`(`broadcast_id`),
    PRIMARY KEY (`broadcast_target_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `org_broadcast_recipient` (
    `broadcast_recipient_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `broadcast_id` BIGINT UNSIGNED NOT NULL,
    `recipient_user_org_id` BIGINT UNSIGNED NOT NULL,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `delivered_at` DATETIME(0) NULL,
    `read_at` DATETIME(0) NULL,

    INDEX `idx_broadcast_recipient_inbox`(`recipient_user_org_id`, `broadcast_id`),
    INDEX `idx_broadcast_recipient_org`(`broadcast_id`, `org_id`),
    UNIQUE INDEX `uq_broadcast_recipient`(`broadcast_id`, `recipient_user_org_id`),
    PRIMARY KEY (`broadcast_recipient_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_user_org_department` ON `user_organization`(`department_id`);

-- AddForeignKey
ALTER TABLE `user_organization` ADD CONSTRAINT `fk_user_org_department` FOREIGN KEY (`department_id`) REFERENCES `department`(`department_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_setting` ADD CONSTRAINT `fk_org_setting_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_relationship` ADD CONSTRAINT `fk_org_rel_requester` FOREIGN KEY (`requester_org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_relationship` ADD CONSTRAINT `fk_org_rel_target` FOREIGN KEY (`target_org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_audit_log` ADD CONSTRAINT `fk_audit_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_audit_log` ADD CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actor_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `department` ADD CONSTRAINT `fk_department_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_invite` ADD CONSTRAINT `fk_invite_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_invite` ADD CONSTRAINT `fk_invite_inviter` FOREIGN KEY (`invited_by`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_join_request` ADD CONSTRAINT `fk_join_request_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `organization_join_request` ADD CONSTRAINT `fk_join_request_user` FOREIGN KEY (`user_id`) REFERENCES `user_master`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast` ADD CONSTRAINT `fk_broadcast_sender` FOREIGN KEY (`sender_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast` ADD CONSTRAINT `fk_broadcast_sender_org` FOREIGN KEY (`sender_org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast_target` ADD CONSTRAINT `fk_broadcast_target_broadcast` FOREIGN KEY (`broadcast_id`) REFERENCES `org_broadcast`(`broadcast_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast_target` ADD CONSTRAINT `fk_broadcast_target_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast_target` ADD CONSTRAINT `fk_broadcast_target_department` FOREIGN KEY (`department_id`) REFERENCES `department`(`department_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast_recipient` ADD CONSTRAINT `fk_broadcast_recipient_broadcast` FOREIGN KEY (`broadcast_id`) REFERENCES `org_broadcast`(`broadcast_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast_recipient` ADD CONSTRAINT `fk_broadcast_recipient_user_org` FOREIGN KEY (`recipient_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `org_broadcast_recipient` ADD CONSTRAINT `fk_broadcast_recipient_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;


-- Default settings for existing organizations.
INSERT INTO `organization_setting` (`org_id`)
SELECT `org_id` FROM `organization_master`;

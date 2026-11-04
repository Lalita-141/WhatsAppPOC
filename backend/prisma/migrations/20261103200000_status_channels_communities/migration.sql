-- Additive only: new tables for status updates, channels and communities.


-- CreateTable
CREATE TABLE `status_post` (
    `status_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `owner_user_org_id` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('TEXT', 'IMAGE', 'VIDEO') NOT NULL,
    `text` VARCHAR(700) NULL,
    `background_color` VARCHAR(9) NULL,
    `media_id` BIGINT UNSIGNED NULL,
    `audience` ENUM('EVERYONE', 'CONTACTS', 'SELECTED') NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` DATETIME(0) NOT NULL,
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_status_owner`(`owner_user_org_id`, `expires_at`),
    INDEX `idx_status_expires`(`expires_at`),
    INDEX `idx_status_media`(`media_id`),
    PRIMARY KEY (`status_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `status_audience` (
    `status_id` BIGINT UNSIGNED NOT NULL,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,

    INDEX `idx_status_audience_member`(`user_organization_id`),
    PRIMARY KEY (`status_id`, `user_organization_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `status_view` (
    `status_id` BIGINT UNSIGNED NOT NULL,
    `viewer_user_org_id` BIGINT UNSIGNED NOT NULL,
    `viewed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_status_view_viewer`(`viewer_user_org_id`),
    PRIMARY KEY (`status_id`, `viewer_user_org_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `channel` (
    `channel_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_channel_org`(`org_id`),
    PRIMARY KEY (`channel_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `channel_member` (
    `channel_id` BIGINT UNSIGNED NOT NULL,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'FOLLOWER') NOT NULL DEFAULT 'FOLLOWER',
    `muted` BOOLEAN NOT NULL DEFAULT false,
    `last_read_post_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_channel_member_member`(`user_organization_id`),
    PRIMARY KEY (`channel_id`, `user_organization_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `channel_post` (
    `post_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `channel_id` BIGINT UNSIGNED NOT NULL,
    `author_user_org_id` BIGINT UNSIGNED NOT NULL,
    `text` TEXT NULL,
    `media_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deleted_at` DATETIME(0) NULL,

    INDEX `idx_channel_post_channel`(`channel_id`, `post_id`),
    INDEX `idx_channel_post_media`(`media_id`),
    PRIMARY KEY (`post_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community` (
    `community_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `org_id` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(500) NULL,
    `announcement_group_id` BIGINT UNSIGNED NOT NULL,
    `created_by` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deleted_at` DATETIME(0) NULL,

    UNIQUE INDEX `uq_community_announcements`(`announcement_group_id`),
    PRIMARY KEY (`community_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `community_group` (
    `community_id` BIGINT UNSIGNED NOT NULL,
    `group_id` BIGINT UNSIGNED NOT NULL,
    `added_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_community_group`(`group_id`),
    PRIMARY KEY (`community_id`, `group_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `status_post` ADD CONSTRAINT `fk_status_owner` FOREIGN KEY (`owner_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `status_post` ADD CONSTRAINT `fk_status_media` FOREIGN KEY (`media_id`) REFERENCES `media_file`(`media_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `status_audience` ADD CONSTRAINT `fk_status_audience_status` FOREIGN KEY (`status_id`) REFERENCES `status_post`(`status_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `status_audience` ADD CONSTRAINT `fk_status_audience_member` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `status_view` ADD CONSTRAINT `fk_status_view_status` FOREIGN KEY (`status_id`) REFERENCES `status_post`(`status_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `status_view` ADD CONSTRAINT `fk_status_view_viewer` FOREIGN KEY (`viewer_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `channel` ADD CONSTRAINT `fk_channel_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `channel_member` ADD CONSTRAINT `fk_channel_member_channel` FOREIGN KEY (`channel_id`) REFERENCES `channel`(`channel_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `channel_member` ADD CONSTRAINT `fk_channel_member_member` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `channel_post` ADD CONSTRAINT `fk_channel_post_channel` FOREIGN KEY (`channel_id`) REFERENCES `channel`(`channel_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `channel_post` ADD CONSTRAINT `fk_channel_post_author` FOREIGN KEY (`author_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `channel_post` ADD CONSTRAINT `fk_channel_post_media` FOREIGN KEY (`media_id`) REFERENCES `media_file`(`media_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `community` ADD CONSTRAINT `fk_community_org` FOREIGN KEY (`org_id`) REFERENCES `organization_master`(`org_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `community` ADD CONSTRAINT `fk_community_announcement_group` FOREIGN KEY (`announcement_group_id`) REFERENCES `wp_group`(`group_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `community_group` ADD CONSTRAINT `fk_community_group_community` FOREIGN KEY (`community_id`) REFERENCES `community`(`community_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `community_group` ADD CONSTRAINT `fk_community_group_group` FOREIGN KEY (`group_id`) REFERENCES `wp_group`(`group_id`) ON DELETE CASCADE ON UPDATE NO ACTION;


-- Additive only: new nullable or defaulted columns, new tables and indexes.
-- Existing messages keep their content and status. The backfill at the end
-- builds one conversation_state row per side of every existing conversation.


-- AlterTable
ALTER TABLE `personal_chat_history` ADD COLUMN `client_message_id` VARCHAR(64) NULL,
    ADD COLUMN `deleted_for_everyone_at` DATETIME(0) NULL,
    ADD COLUMN `edited_at` DATETIME(0) NULL,
    ADD COLUMN `forwarded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `message_type` VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    ADD COLUMN `pinned_at` DATETIME(0) NULL,
    ADD COLUMN `pinned_by` BIGINT UNSIGNED NULL,
    ADD COLUMN `read_time` DATETIME(0) NULL,
    ADD COLUMN `reply_to_chat_id` BIGINT UNSIGNED NULL;

-- CreateTable
CREATE TABLE `personal_message_state` (
    `personal_message_state_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `chat_id` BIGINT UNSIGNED NOT NULL,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,
    `starred_at` DATETIME(0) NULL,
    `deleted_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL,

    INDEX `idx_message_state_starred`(`user_organization_id`, `starred_at`),
    UNIQUE INDEX `uq_message_state`(`chat_id`, `user_organization_id`),
    PRIMARY KEY (`personal_message_state_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_reaction` (
    `message_reaction_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `chat_id` BIGINT UNSIGNED NOT NULL,
    `user_organization_id` BIGINT UNSIGNED NOT NULL,
    `emoji` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_message_reaction_user_org`(`user_organization_id`),
    UNIQUE INDEX `uq_message_reaction`(`chat_id`, `user_organization_id`),
    PRIMARY KEY (`message_reaction_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_block` (
    `user_block_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `blocker_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `blocked_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_user_block_blocked`(`blocked_user_organization_id`),
    UNIQUE INDEX `uq_user_block_pair`(`blocker_user_organization_id`, `blocked_user_organization_id`),
    PRIMARY KEY (`user_block_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_report` (
    `user_report_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `reporter_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `reported_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `chat_id` BIGINT UNSIGNED NULL,
    `reason` VARCHAR(50) NOT NULL,
    `details` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_user_report_reporter`(`reporter_user_organization_id`),
    INDEX `idx_user_report_reported`(`reported_user_organization_id`),
    PRIMARY KEY (`user_report_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_personal_chat_pair_id` ON `personal_chat_history`(`sender_user_organization_id`, `receiver_user_organization_id`, `chat_id`);

-- CreateIndex
CREATE INDEX `idx_personal_chat_pair_id_reverse` ON `personal_chat_history`(`receiver_user_organization_id`, `sender_user_organization_id`, `chat_id`);

-- CreateIndex
CREATE INDEX `idx_personal_chat_reply_to` ON `personal_chat_history`(`reply_to_chat_id`);

-- CreateIndex
CREATE UNIQUE INDEX `uq_personal_chat_client_message` ON `personal_chat_history`(`sender_user_organization_id`, `client_message_id`);

-- AddForeignKey
ALTER TABLE `personal_chat_history` ADD CONSTRAINT `fk_personal_chat_reply_to` FOREIGN KEY (`reply_to_chat_id`) REFERENCES `personal_chat_history`(`chat_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `personal_message_state` ADD CONSTRAINT `fk_message_state_chat` FOREIGN KEY (`chat_id`) REFERENCES `personal_chat_history`(`chat_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `personal_message_state` ADD CONSTRAINT `fk_message_state_user_org` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `message_reaction` ADD CONSTRAINT `fk_message_reaction_chat` FOREIGN KEY (`chat_id`) REFERENCES `personal_chat_history`(`chat_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `message_reaction` ADD CONSTRAINT `fk_message_reaction_user_org` FOREIGN KEY (`user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_block` ADD CONSTRAINT `fk_user_block_blocker` FOREIGN KEY (`blocker_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_block` ADD CONSTRAINT `fk_user_block_blocked` FOREIGN KEY (`blocked_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_report` ADD CONSTRAINT `fk_user_report_reporter` FOREIGN KEY (`reporter_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_report` ADD CONSTRAINT `fk_user_report_reported` FOREIGN KEY (`reported_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;


-- Backfill: last message and unread count for each side of every conversation.
INSERT INTO `conversation_state` (`owner_user_organization_id`, `peer_user_organization_id`, `last_message_id`, `unread_count`)
SELECT pairs.owner_id, pairs.peer_id, MAX(pairs.chat_id), SUM(pairs.unread)
FROM (
    SELECT `sender_user_organization_id` AS owner_id, `receiver_user_organization_id` AS peer_id, `chat_id`, 0 AS unread
    FROM `personal_chat_history`
    WHERE `deleted_at` IS NULL AND `sender_user_organization_id` <> `receiver_user_organization_id`
    UNION ALL
    SELECT `receiver_user_organization_id`, `sender_user_organization_id`, `chat_id`, IF(`status` = 'SEEN', 0, 1)
    FROM `personal_chat_history`
    WHERE `deleted_at` IS NULL AND `sender_user_organization_id` <> `receiver_user_organization_id`
) pairs
GROUP BY pairs.owner_id, pairs.peer_id
ON DUPLICATE KEY UPDATE
    `last_message_id` = VALUES(`last_message_id`),
    `unread_count` = VALUES(`unread_count`);

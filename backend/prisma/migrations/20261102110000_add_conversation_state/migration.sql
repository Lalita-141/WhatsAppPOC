-- Additive only: no existing row or column is changed or removed.
-- Adds per-owner conversation state. A self-chat is the row where owner = peer,
-- and the unique key allows only one for each membership.

-- CreateTable
CREATE TABLE `conversation_state` (
    `conversation_state_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `owner_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `peer_user_organization_id` BIGINT UNSIGNED NOT NULL,
    `last_message_id` BIGINT UNSIGNED NULL,
    `unread_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `pinned_at` DATETIME(0) NULL,
    `muted_until` DATETIME(0) NULL,
    `archived_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL,

    INDEX `idx_conversation_state_peer`(`peer_user_organization_id`),
    INDEX `idx_conversation_state_last_message`(`last_message_id`),
    UNIQUE INDEX `uq_conversation_state_pair`(`owner_user_organization_id`, `peer_user_organization_id`),
    PRIMARY KEY (`conversation_state_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `conversation_state` ADD CONSTRAINT `fk_conversation_state_owner` FOREIGN KEY (`owner_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `conversation_state` ADD CONSTRAINT `fk_conversation_state_peer` FOREIGN KEY (`peer_user_organization_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `conversation_state` ADD CONSTRAINT `fk_conversation_state_last_message` FOREIGN KEY (`last_message_id`) REFERENCES `personal_chat_history`(`chat_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- Give every existing membership its self-chat.
INSERT INTO `conversation_state` (`owner_user_organization_id`, `peer_user_organization_id`)
SELECT `user_organization_id`, `user_organization_id`
FROM `user_organization`
WHERE `deleted_at` IS NULL;

-- Two existing memberships have no settings row, so give them the defaults.
INSERT INTO `user_setting` (`user_organization_id`)
SELECT uo.`user_organization_id`
FROM `user_organization` uo
LEFT JOIN `user_setting` s ON s.`user_organization_id` = uo.`user_organization_id`
WHERE s.`setting_id` IS NULL AND uo.`deleted_at` IS NULL;

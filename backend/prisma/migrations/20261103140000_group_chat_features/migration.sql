-- Additive only: new nullable or defaulted columns on the existing group tables,
-- plus indexes. No existing row or column changes.


-- AlterTable
ALTER TABLE `group_chat` ADD COLUMN `client_message_id` VARCHAR(64) NULL,
    ADD COLUMN `deleted_for_everyone_at` DATETIME(0) NULL,
    ADD COLUMN `forwarded` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `message_type` VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    ADD COLUMN `reply_to_group_chat_id` BIGINT UNSIGNED NULL;

-- AlterTable
ALTER TABLE `group_member` ADD COLUMN `archived_at` DATETIME(0) NULL,
    ADD COLUMN `invited_by` BIGINT UNSIGNED NULL,
    ADD COLUMN `last_read_group_chat_id` BIGINT UNSIGNED NULL,
    ADD COLUMN `muted_until` DATETIME(0) NULL,
    ADD COLUMN `pinned_at` DATETIME(0) NULL;

-- AlterTable
ALTER TABLE `wp_group` ADD COLUMN `invite_code` VARCHAR(32) NULL,
    ADD COLUMN `only_admins_can_edit_info` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `only_admins_can_send` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `idx_group_chat_group_id` ON `group_chat`(`group_id`, `group_chat_id`);

-- CreateIndex
CREATE INDEX `idx_group_chat_reply_to` ON `group_chat`(`reply_to_group_chat_id`);

-- CreateIndex
CREATE UNIQUE INDEX `uq_group_chat_client_message` ON `group_chat`(`sender_user_organization_id`, `client_message_id`);

-- CreateIndex
CREATE UNIQUE INDEX `uq_group_invite_code` ON `wp_group`(`invite_code`);

-- AddForeignKey
ALTER TABLE `group_chat` ADD CONSTRAINT `fk_group_chat_reply_to` FOREIGN KEY (`reply_to_group_chat_id`) REFERENCES `group_chat`(`group_chat_id`) ON DELETE SET NULL ON UPDATE NO ACTION;


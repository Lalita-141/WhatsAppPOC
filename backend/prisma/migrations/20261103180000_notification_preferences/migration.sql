-- Additive only: notification preferences on user_setting, all on by default,
-- which is how notifications behaved before.


-- AlterTable
ALTER TABLE `user_setting` ADD COLUMN `notify_announcements` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notify_calls` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notify_groups` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `notify_messages` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `show_preview` BOOLEAN NOT NULL DEFAULT true;


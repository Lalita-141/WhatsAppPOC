-- Run backend/scripts/preflight-auth-migration.sql first. This migration stops
-- on duplicates instead of changing or merging existing accounts.

-- 1. Add as nullable so existing rows stay valid during the backfill.
ALTER TABLE `user_master` ADD COLUMN `country_code` VARCHAR(10) NULL AFTER `last_name`;

-- 2. Use the country the number was actually verified with.
UPDATE `user_master` u
SET u.`country_code` = (
    SELECT r.`country_code`
    FROM `register_otp` r
    WHERE r.`mobile_no` = u.`mobile_no`
    ORDER BY r.`is_validated` DESC, r.`created_at` DESC, r.`register_otp_id` DESC
    LIMIT 1
);

-- 3. Older code accepted Indian numbers only, so remaining rows are Indian.
UPDATE `user_master`
SET `country_code` = (
    SELECT c.`country_code`
    FROM `country_master` c
    WHERE c.`iso_code` = 'IN'
    LIMIT 1
)
WHERE `country_code` IS NULL;

-- 4. Stops here if any row could not be resolved. No value is guessed.
ALTER TABLE `user_master` MODIFY `country_code` VARCHAR(10) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `uq_user_mobile` ON `user_master`(`country_code`, `mobile_no`);

-- CreateIndex
CREATE UNIQUE INDEX `uq_org_code` ON `organization_master`(`org_code`);

-- Additive only: call history table.


-- CreateTable
CREATE TABLE `call_session` (
    `call_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `caller_user_org_id` BIGINT UNSIGNED NOT NULL,
    `callee_user_org_id` BIGINT UNSIGNED NOT NULL,
    `type` ENUM('AUDIO', 'VIDEO') NOT NULL,
    `status` ENUM('RINGING', 'ONGOING', 'ENDED', 'MISSED', 'REJECTED', 'CANCELLED', 'BUSY', 'FAILED') NOT NULL DEFAULT 'RINGING',
    `end_reason` VARCHAR(40) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `answered_at` DATETIME(0) NULL,
    `ended_at` DATETIME(0) NULL,

    INDEX `idx_call_caller`(`caller_user_org_id`, `call_id`),
    INDEX `idx_call_callee`(`callee_user_org_id`, `call_id`),
    INDEX `idx_call_status`(`status`),
    PRIMARY KEY (`call_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `call_session` ADD CONSTRAINT `fk_call_caller` FOREIGN KEY (`caller_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `call_session` ADD CONSTRAINT `fk_call_callee` FOREIGN KEY (`callee_user_org_id`) REFERENCES `user_organization`(`user_organization_id`) ON DELETE CASCADE ON UPDATE NO ACTION;


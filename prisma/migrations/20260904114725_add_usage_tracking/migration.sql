-- AlterTable
ALTER TABLE `session` ADD COLUMN `tokens_used` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `usage_reset_at` DATETIME(3) NULL;

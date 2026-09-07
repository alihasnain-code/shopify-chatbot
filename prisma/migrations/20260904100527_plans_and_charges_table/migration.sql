-- AlterTable
ALTER TABLE `session` ADD COLUMN `planId` INTEGER NULL;

-- CreateTable
CREATE TABLE `plans` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `price` DECIMAL(8, 2) NOT NULL,
    `interval` VARCHAR(191) NULL,
    `capped_amount` DECIMAL(8, 2) NULL,
    `terms` VARCHAR(191) NULL,
    `trial_days` INTEGER NULL DEFAULT 0,
    `token_limit` INTEGER NULL,
    `features` JSON NULL,
    `test` BOOLEAN NOT NULL DEFAULT false,
    `on_install` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,

    UNIQUE INDEX `plans_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `charges` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `charge_id` BIGINT NOT NULL,
    `test` BOOLEAN NOT NULL DEFAULT false,
    `status` VARCHAR(191) NULL,
    `name` VARCHAR(191) NULL,
    `terms` VARCHAR(191) NULL,
    `type` VARCHAR(191) NOT NULL,
    `price` DECIMAL(8, 2) NOT NULL,
    `interval` VARCHAR(191) NULL,
    `capped_amount` DECIMAL(8, 2) NULL,
    `trial_days` INTEGER NULL,
    `billing_on` DATETIME(3) NULL,
    `activated_on` DATETIME(3) NULL,
    `trial_ends_on` DATETIME(3) NULL,
    `cancelled_on` DATETIME(3) NULL,
    `expires_on` DATETIME(3) NULL,
    `planId` INTEGER NULL,
    `description` VARCHAR(191) NULL,
    `reference_charge` BIGINT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `charges_session_id_idx`(`session_id`),
    INDEX `charges_planId_idx`(`planId`),
    INDEX `charges_charge_id_idx`(`charge_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `charges` ADD CONSTRAINT `charges_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `charges` ADD CONSTRAINT `charges_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `order` ADD COLUMN `emailSource` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL,
    ADD COLUMN `phoneSource` VARCHAR(191) NULL;

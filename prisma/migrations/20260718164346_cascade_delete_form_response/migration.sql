-- DropForeignKey
ALTER TABLE `form_response` DROP FOREIGN KEY `form_response_formId_fkey`;

-- DropForeignKey
ALTER TABLE `form_response` DROP FOREIGN KEY `form_response_sessionId_fkey`;

-- DropIndex
DROP INDEX `form_response_formId_fkey` ON `form_response`;

-- DropIndex
DROP INDEX `form_response_sessionId_fkey` ON `form_response`;

-- AddForeignKey
ALTER TABLE `form_response` ADD CONSTRAINT `FormResponse_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `form`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `form_response` ADD CONSTRAINT `FormResponse_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

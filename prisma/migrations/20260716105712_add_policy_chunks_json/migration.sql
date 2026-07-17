-- CreateTable
CREATE TABLE `policy_chunks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shop_domain` VARCHAR(255) NOT NULL,
    `policy_type` VARCHAR(100) NOT NULL,
    `text_chunk` TEXT NOT NULL,
    `embedding` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `policy_chunks_shop_domain_policy_type_idx`(`shop_domain`, `policy_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

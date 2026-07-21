-- CreateTable
CREATE TABLE `order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` VARCHAR(191) NOT NULL,
    `shopifyOrderId` VARCHAR(191) NOT NULL,
    `orderNumber` INTEGER NOT NULL,
    `orderName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `financialStatus` VARCHAR(191) NULL,
    `fulfillmentStatus` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NULL,
    `totalPrice` VARCHAR(191) NULL,
    `lineItems` TEXT NOT NULL,
    `shippingCity` VARCHAR(191) NULL,
    `shippingProvince` VARCHAR(191) NULL,
    `shippingCountry` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancelReason` VARCHAR(191) NULL,
    `shopifyCreatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `order_shopifyOrderId_key`(`shopifyOrderId`),
    INDEX `order_sessionId_orderNumber_idx`(`sessionId`, `orderNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_fulfillment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopifyFulfillmentId` VARCHAR(191) NOT NULL,
    `orderId` INTEGER NOT NULL,
    `status` VARCHAR(191) NULL,
    `shipmentStatus` VARCHAR(191) NULL,
    `trackingCompany` VARCHAR(191) NULL,
    `trackingNumber` VARCHAR(191) NULL,
    `trackingUrl` VARCHAR(191) NULL,
    `shopifyCreatedAt` DATETIME(3) NOT NULL,
    `shopifyUpdatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `order_fulfillment_shopifyFulfillmentId_key`(`shopifyFulfillmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_fulfillment` ADD CONSTRAINT `order_fulfillment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

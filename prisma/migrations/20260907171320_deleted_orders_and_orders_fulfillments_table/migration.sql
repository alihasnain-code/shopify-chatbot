/*
  Warnings:

  - You are about to drop the `order` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `order_fulfillment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `order_sessionId_fkey`;

-- DropForeignKey
ALTER TABLE `order_fulfillment` DROP FOREIGN KEY `order_fulfillment_orderId_fkey`;

-- DropTable
DROP TABLE `order`;

-- DropTable
DROP TABLE `order_fulfillment`;

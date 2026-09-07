/*
  Warnings:

  - You are about to drop the `policy_chunks` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_configs` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `user_configs` DROP FOREIGN KEY `UserConfigs_sessionId_fkey`;

-- DropTable
DROP TABLE `policy_chunks`;

-- DropTable
DROP TABLE `user_configs`;

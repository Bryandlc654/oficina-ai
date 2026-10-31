-- CreateTable
CREATE TABLE `chat_messages` (
    `id` VARCHAR(191) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `authorType` ENUM('ADMIN', 'AGENT', 'SYSTEM') NOT NULL,
    `agentId` VARCHAR(191) NULL,
    `content` TEXT NOT NULL,
    `mentions` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_messages_channel_createdAt_idx`(`channel`, `createdAt`),
    INDEX `chat_messages_agentId_idx`(`agentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

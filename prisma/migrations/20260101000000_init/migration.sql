-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN') NOT NULL DEFAULT 'ADMIN',
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#34d399',
    `order` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_name_key`(`name`),
    UNIQUE INDEX `departments_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agents` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `role` VARCHAR(191) NOT NULL,
    `avatarUrl` VARCHAR(191) NULL,
    `personality` TEXT NOT NULL,
    `responsibilities` TEXT NOT NULL,
    `systemPrompt` TEXT NOT NULL,
    `systemPromptLocked` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('AVAILABLE', 'WORKING', 'ON_BREAK', 'OFFLINE') NOT NULL DEFAULT 'AVAILABLE',
    `model` VARCHAR(191) NOT NULL,
    `fallbackModel` VARCHAR(191) NULL,
    `maxIterations` INTEGER NOT NULL DEFAULT 5,
    `dailyTokenLimit` INTEGER NULL,
    `currentSubtaskId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NULL,
    `fallbackProviderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agents_slug_key`(`slug`),
    INDEX `agents_departmentId_idx`(`departmentId`),
    INDEX `agents_status_idx`(`status`),
    INDEX `agents_currentSubtaskId_idx`(`currentSubtaskId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_providers` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('GEMINI', 'GROQ', 'OLLAMA') NOT NULL,
    `baseUrl` VARCHAR(191) NULL,
    `apiKeyCipher` TEXT NULL,
    `models` JSON NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT false,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ai_providers_name_key`(`name`),
    INDEX `ai_providers_isEnabled_priority_idx`(`isEnabled`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_usage` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NULL,
    `taskId` VARCHAR(191) NULL,
    `model` VARCHAR(191) NOT NULL,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `totalTokens` INTEGER NOT NULL DEFAULT 0,
    `costMicros` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_usage_agentId_createdAt_idx`(`agentId`, `createdAt`),
    INDEX `ai_usage_taskId_idx`(`taskId`),
    INDEX `ai_usage_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_tools` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `type` ENUM('BUILTIN', 'HTTP', 'INTEGRATION') NOT NULL DEFAULT 'BUILTIN',
    `config` JSON NULL,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `requiresApproval` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agent_tools_agentId_name_key`(`agentId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_knowledge` (
    `id` VARCHAR(191) NOT NULL,
    `kind` ENUM('COMPANY', 'SERVICE', 'PRODUCT', 'CLIENT', 'PROCEDURE', 'DOCUMENT', 'GOAL') NOT NULL DEFAULT 'COMPANY',
    `category` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `tags` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `company_knowledge_kind_isActive_idx`(`kind`, `isActive`),
    INDEX `company_knowledge_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_memories` (
    `id` VARCHAR(191) NOT NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `scope` ENUM('COMPANY', 'AGENT', 'TASK') NOT NULL DEFAULT 'AGENT',
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `tags` JSON NULL,
    `importance` INTEGER NOT NULL DEFAULT 1,
    `source` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `agent_memories_agentId_scope_idx`(`agentId`, `scope`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `objective` TEXT NOT NULL,
    `status` ENUM('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED') NOT NULL DEFAULT 'PLANNING',
    `startDate` DATETIME(3) NULL,
    `dueDate` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `projects_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `objective` TEXT NOT NULL,
    `description` TEXT NOT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
    `status` ENUM('SCHEDULED', 'PENDING', 'PLANNING', 'RUNNING', 'REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `scheduledFor` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `tokenBudget` INTEGER NOT NULL DEFAULT 200000,
    `tokensUsed` INTEGER NOT NULL DEFAULT 0,
    `maxIterations` INTEGER NOT NULL DEFAULT 5,
    `approvalStatus` ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NOT_REQUIRED',
    `finalReport` TEXT NULL,
    `errorMessage` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `projectId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `tasks_status_scheduledFor_idx`(`status`, `scheduledFor`),
    INDEX `tasks_priority_idx`(`priority`),
    INDEX `tasks_projectId_idx`(`projectId`),
    INDEX `tasks_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subtasks` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `objective` TEXT NOT NULL,
    `description` TEXT NOT NULL,
    `expectedDeliverable` TEXT NOT NULL,
    `order` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'ASSIGNED', 'RUNNING', 'REVIEW', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `assignedAgentId` VARCHAR(191) NULL,
    `result` TEXT NULL,
    `tokensUsed` INTEGER NOT NULL DEFAULT 0,
    `iterations` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `subtasks_assignedAgentId_idx`(`assignedAgentId`),
    INDEX `subtasks_status_idx`(`status`),
    UNIQUE INDEX `subtasks_taskId_order_key`(`taskId`, `order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_dependencies` (
    `id` VARCHAR(191) NOT NULL,
    `subtaskId` VARCHAR(191) NOT NULL,
    `dependsOnId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_dependencies_dependsOnId_idx`(`dependsOnId`),
    UNIQUE INDEX `task_dependencies_subtaskId_dependsOnId_key`(`subtaskId`, `dependsOnId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NULL,
    `subtaskId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'CONTRIBUTOR', 'REVIEWER') NOT NULL DEFAULT 'CONTRIBUTOR',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_assignments_agentId_idx`(`agentId`),
    UNIQUE INDEX `task_assignments_taskId_agentId_role_key`(`taskId`, `agentId`, `role`),
    UNIQUE INDEX `task_assignments_subtaskId_agentId_role_key`(`subtaskId`, `agentId`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_runs` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `subtaskId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `iteration` INTEGER NOT NULL DEFAULT 1,
    `model` VARCHAR(191) NOT NULL,
    `prompt` LONGTEXT NULL,
    `output` LONGTEXT NULL,
    `error` TEXT NULL,
    `inputTokens` INTEGER NOT NULL DEFAULT 0,
    `outputTokens` INTEGER NOT NULL DEFAULT 0,
    `totalTokens` INTEGER NOT NULL DEFAULT 0,
    `latencyMs` INTEGER NULL,
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `agent_runs_agentId_createdAt_idx`(`agentId`, `createdAt`),
    INDEX `agent_runs_taskId_idx`(`taskId`),
    INDEX `agent_runs_subtaskId_idx`(`subtaskId`),
    INDEX `agent_runs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agent_messages` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `subtaskId` VARCHAR(191) NULL,
    `runId` VARCHAR(191) NULL,
    `fromAgentId` VARCHAR(191) NULL,
    `toAgentId` VARCHAR(191) NULL,
    `role` ENUM('SYSTEM', 'USER', 'ASSISTANT', 'TOOL') NOT NULL,
    `content` LONGTEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agent_messages_taskId_createdAt_idx`(`taskId`, `createdAt`),
    INDEX `agent_messages_fromAgentId_idx`(`fromAgentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `deliverables` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `subtaskId` VARCHAR(191) NULL,
    `agentId` VARCHAR(191) NOT NULL,
    `runId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `type` ENUM('DOCUMENT', 'REPORT', 'STRATEGY', 'ANALYSIS', 'TEXT', 'CODE', 'ATTACHMENT', 'PROMPT') NOT NULL,
    `content` LONGTEXT NULL,
    `fileUrl` VARCHAR(191) NULL,
    `fileName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `deliverables_taskId_idx`(`taskId`),
    INDEX `deliverables_agentId_createdAt_idx`(`agentId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `scheduled_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `taskId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `queue` VARCHAR(191) NOT NULL DEFAULT 'task-execution',
    `status` ENUM('PENDING', 'QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `runAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `scheduled_jobs_jobId_key`(`jobId`),
    INDEX `scheduled_jobs_taskId_idx`(`taskId`),
    INDEX `scheduled_jobs_runAt_status_idx`(`runAt`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actorType` ENUM('ADMIN', 'AGENT', 'SYSTEM') NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `activity_logs_createdAt_idx`(`createdAt`),
    INDEX `activity_logs_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `activity_logs_actorId_idx`(`actorId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedById` VARCHAR(191) NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agents` ADD CONSTRAINT `agents_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agents` ADD CONSTRAINT `agents_currentSubtaskId_fkey` FOREIGN KEY (`currentSubtaskId`) REFERENCES `subtasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agents` ADD CONSTRAINT `agents_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `ai_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agents` ADD CONSTRAINT `agents_fallbackProviderId_fkey` FOREIGN KEY (`fallbackProviderId`) REFERENCES `ai_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `ai_providers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `agent_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_usage` ADD CONSTRAINT `ai_usage_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_tools` ADD CONSTRAINT `agent_tools_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_memories` ADD CONSTRAINT `agent_memories_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_projectId_fkey` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subtasks` ADD CONSTRAINT `subtasks_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subtasks` ADD CONSTRAINT `subtasks_assignedAgentId_fkey` FOREIGN KEY (`assignedAgentId`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_subtaskId_fkey` FOREIGN KEY (`subtaskId`) REFERENCES `subtasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_dependencies` ADD CONSTRAINT `task_dependencies_dependsOnId_fkey` FOREIGN KEY (`dependsOnId`) REFERENCES `subtasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_subtaskId_fkey` FOREIGN KEY (`subtaskId`) REFERENCES `subtasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignments` ADD CONSTRAINT `task_assignments_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_subtaskId_fkey` FOREIGN KEY (`subtaskId`) REFERENCES `subtasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_runs` ADD CONSTRAINT `agent_runs_providerId_fkey` FOREIGN KEY (`providerId`) REFERENCES `ai_providers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_messages` ADD CONSTRAINT `agent_messages_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_messages` ADD CONSTRAINT `agent_messages_subtaskId_fkey` FOREIGN KEY (`subtaskId`) REFERENCES `subtasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_messages` ADD CONSTRAINT `agent_messages_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `agent_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_messages` ADD CONSTRAINT `agent_messages_fromAgentId_fkey` FOREIGN KEY (`fromAgentId`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agent_messages` ADD CONSTRAINT `agent_messages_toAgentId_fkey` FOREIGN KEY (`toAgentId`) REFERENCES `agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliverables` ADD CONSTRAINT `deliverables_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliverables` ADD CONSTRAINT `deliverables_subtaskId_fkey` FOREIGN KEY (`subtaskId`) REFERENCES `subtasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliverables` ADD CONSTRAINT `deliverables_agentId_fkey` FOREIGN KEY (`agentId`) REFERENCES `agents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `deliverables` ADD CONSTRAINT `deliverables_runId_fkey` FOREIGN KEY (`runId`) REFERENCES `agent_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scheduled_jobs` ADD CONSTRAINT `scheduled_jobs_taskId_fkey` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `settings` ADD CONSTRAINT `settings_updatedById_fkey` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


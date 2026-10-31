ALTER TABLE `tasks` MODIFY `tokenBudget` INT NOT NULL DEFAULT 0;
UPDATE `tasks` SET `tokenBudget` = 0;

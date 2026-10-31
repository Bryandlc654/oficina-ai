ALTER TABLE `ai_providers` MODIFY `type` ENUM('GEMINI', 'GROQ', 'OLLAMA', 'OPENAI', 'OPENROUTER') NOT NULL;

-- Disabled until an API key is saved in the panel or OPENAI_API_KEY is set.
INSERT INTO `ai_providers` (`id`, `name`, `type`, `baseUrl`, `models`, `isEnabled`, `isDefault`, `priority`, `createdAt`, `updatedAt`)
SELECT 'openai_provider_default', 'OpenAI', 'OPENAI', 'https://api.openai.com/v1', JSON_ARRAY('gpt-5', 'gpt-5-mini', 'gpt-4.1-mini'), false, false, 5, NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM `ai_providers` WHERE `type` = 'OPENAI' OR `name` = 'OpenAI');

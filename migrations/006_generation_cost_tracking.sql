-- Add token count and cost tracking columns to generations
ALTER TABLE generations ADD COLUMN model_name TEXT;
ALTER TABLE generations ADD COLUMN llm_input_tokens INTEGER;
ALTER TABLE generations ADD COLUMN llm_output_tokens INTEGER;
ALTER TABLE generations ADD COLUMN image_model TEXT;
ALTER TABLE generations ADD COLUMN cost_breakdown TEXT;

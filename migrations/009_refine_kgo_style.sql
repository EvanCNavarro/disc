-- Refine KGO style: simplified prompt, lower lora_scale, adjusted guidance/steps.
--
-- The original prompt (160 words) over-described the aesthetic and used "silver-gray"
-- which conflicted with the LoRA's learned dark charcoal palette. This caused the
-- model to fight itself, producing lighter, artifacted results.
--
-- Changes based on 4 rounds of A/B testing (25+ test generations):
--   prompt_template: 160 words → ~45 words (let LoRA handle the aesthetic)
--   lora_scale: 0.85 → 0.75 (0.85 over-applied the LoRA)
--   guidance_scale: 3.5 → 3.0 (less literal prompt following = LoRA has more room)
--   num_inference_steps: 28 → 35 (better texture fidelity)
--   description: updated to match actual aesthetic

UPDATE styles
SET
  description = 'Dark charcoal-black faceted stone objects with warm orange-amber backlight against deep void',
  lora_scale = 0.75,
  prompt_template = 'KUROGINORENJIIRO style. A single {subject}, carved from dark charcoal-black faceted stone. Floating in a deep black void, no ground, no floor. Warm orange-amber glow from behind, creating rim lighting on edges and seams. Object is nearly as dark as the void. Low-poly faceted geometry, matte surface. Moody, cinematic, contemplative. Album cover quality. No text, no words, no letters.',
  guidance_scale = 3.0,
  num_inference_steps = 35
WHERE id = 'kuroginorenjiiro';

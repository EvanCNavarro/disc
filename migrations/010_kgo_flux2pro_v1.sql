-- Switch KGO from LoRA (flux-dev) to FLUX.2 Pro with v1.0 structured prompt.
--
-- FLUX.2 Pro won the 5-model x 4-subject matrix test (r36): best aesthetic
-- match for the KGO style across skull, horse, vinyl, and coconut subjects.
-- Bobby's pick. $0.03/image, ~13s avg.
--
-- Changes:
--   replicate_model: flux-dev → flux-2-pro (no LoRA needed)
--   lora_url: removed (FLUX.2 Pro natively produces the aesthetic)
--   lora_scale: reset to 1.0 (unused when lora_url is NULL)
--   prompt_template: LoRA trigger word prompt → v1.0 structured prompt (164 words)
--   guidance_scale: 3.0 → 3.5 (FLUX.2 Pro default)
--   num_inference_steps: 35 → 28 (FLUX.2 Pro default)

UPDATE styles
SET
  replicate_model = 'black-forest-labs/flux-2-pro',
  lora_url = NULL,
  lora_scale = 1.0,
  prompt_template = 'Dark cinematic 3D render of a single low-poly faceted {subject} carved from rough volcanic basalt with ashy granular texture. Every part of the object — all details, accessories, and appendages — is carved from the same dark stone. The surface is solid and unbroken, no cracks, no glowing seams. The object is very dark with faceted planes subtly visible through surface noise and faint stone highlights. Uniformly dark obsidian tonal range across the entire image. An intense vivid ember-orange rim light from directly behind the object, centered, creating edge lighting on the full silhouette and facet seams. The glow is warm and organic like smoldering embers. The object floats weightlessly in a deep dark void, hovering with nothing beneath it. The bottom of the object softly fades and dissolves into the darkness below. An extremely faint, barely perceptible shadow diffuses far beneath — so soft it almost blends into the background. No floor, no ground surface, no reflections, no contact with any surface. The object dominates the frame, centered, filling the majority of the composition. Slight three-quarter angle. Color ratio: 72% obsidian black, 20% dark charcoal stone with visible faceted detail, 8% vivid ember-orange accent. Visible photographic film grain everywhere. Cinematic, contemplative, moody. No text, no words, no letters. Square 1:1.',
  guidance_scale = 3.5,
  num_inference_steps = 28,
  updated_at = datetime('now')
WHERE id = 'kuroginorenjiiro';

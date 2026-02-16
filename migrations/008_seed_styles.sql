-- Seed default styles into the styles table.
-- These are system-wide defaults (is_default=1) available to all users.
-- user_id is set to 'system' for default styles.

INSERT OR IGNORE INTO styles (id, user_id, name, description, replicate_model, lora_url, lora_scale, prompt_template, negative_prompt, guidance_scale, num_inference_steps, seed, is_default)
VALUES
  ('bleached-crosshatch', 'system', 'Bleached Crosshatch',
   'Desaturated cross-hatch illustration — graphite and fine ink on textured paper, with bleached highlights and layered directional strokes',
   'black-forest-labs/flux-dev', NULL, 1.0,
   'A monochromatic still-life of {subject}, rendered in bleached cross-hatch style — desaturated black and white tones with faint beige-gray warmth. Drawn with graphite and fine ink on textured paper. Every surface defined through deliberate cross-hatching and cross-contour strokes, with visible line direction following shape and form. Highlights softly bleached out as if worn by time, midtones muted and low-contrast. Shadows built through layered directional strokes. Moody, tactile, atmospheric. Classical draftsmanship with minimalist grayscale palette. No text, no words, no letters. Square composition.',
   NULL, 3.5, 28, NULL, 1),

  ('neon-noir', 'system', 'Neon Noir',
   'Cinematic noir scene bathed in neon glow — deep shadows, saturated color accents, rain-slicked surfaces',
   'black-forest-labs/flux-dev', NULL, 1.0,
   'A cinematic noir still-life of {subject}, bathed in neon light. Deep shadows with saturated cyan and magenta accents. Rain-slicked reflective surfaces catching colored light. Volumetric fog and atmospheric haze. Film grain texture, anamorphic lens flare. Dramatic chiaroscuro lighting, high contrast. Moody, brooding, cyberpunk-adjacent. No text, no words, no letters. Square composition.',
   NULL, 3.5, 28, NULL, 1),

  ('soft-watercolor', 'system', 'Soft Watercolor',
   'Gentle watercolor painting with soft washes, visible paper grain, and delicate color bleeding at edges',
   'black-forest-labs/flux-dev', NULL, 1.0,
   'A delicate watercolor painting of {subject}. Soft translucent washes of color bleeding gently into each other. Visible cold-pressed paper texture and grain showing through. Subtle granulation in pigment settling. Wet-on-wet technique with soft undefined edges. Muted, pastel-adjacent palette with occasional rich pigment concentration. Loose brushwork suggesting form rather than defining it. Gentle ambient light. Ethereal, calming, contemplative. No text, no words, no letters. Square composition.',
   NULL, 3.5, 28, NULL, 1),

  ('brutalist-collage', 'system', 'Brutalist Collage',
   'Raw mixed-media collage with torn paper, bold typography fragments, and concrete textures',
   'black-forest-labs/flux-dev', NULL, 1.0,
   'A brutalist mixed-media collage of {subject}. Torn paper edges, overlapping layers, raw concrete and newsprint textures. Bold geometric shapes in muted earth tones with occasional red or yellow accent. Visible glue marks and tape strips. Distressed photographic fragments layered with hand-drawn marks. Gritty, industrial, punk-influenced aesthetic. Zine-like rawness with intentional imperfection. High contrast, flat composition with depth from layering. No readable text, no legible words, no letters. Square composition.',
   NULL, 3.5, 28, NULL, 1),

  ('chromatic-glass', 'system', 'Chromatic Glass',
   'Luminous stained-glass aesthetic with jewel tones, bold black leading lines, and backlit radiance',
   'black-forest-labs/flux-dev', NULL, 1.0,
   'A luminous stained-glass artwork of {subject}. Rich jewel tones — deep sapphire, emerald, ruby, amber — separated by bold black leading lines. Light streaming through from behind, creating a warm backlit radiance. Geometric facets with organic flowing forms. Cathedral-inspired composition with Art Nouveau curves. Translucent color overlaps creating new hues at intersections. Dramatic, reverent, ornate. No text, no words, no letters. Square composition.',
   NULL, 3.5, 28, NULL, 1),

  ('ukiyo-e-wave', 'system', 'Ukiyo-e Wave',
   'Japanese woodblock print style with flat color planes, bold outlines, and traditional Edo-period composition',
   'black-forest-labs/flux-dev', NULL, 1.0,
   'A Japanese ukiyo-e woodblock print of {subject}. Flat planes of rich color with bold black outlines. Traditional Edo-period aesthetic with flowing organic lines. Visible wood grain texture from the printing process. Limited but vibrant palette — indigo, vermillion, ochre, sage green. Decorative clouds or wave patterns as atmospheric elements. Elegant compositional balance with asymmetric harmony. Stylized natural forms, seasonal sensitivity. No text, no words, no letters, no kanji. Square composition.',
   NULL, 3.5, 28, NULL, 1),

  ('kuroginorenjiiro', 'system', 'Kuro Gin Orenjiiro',
   '60% Black / 30% Silver / 10% Orange — single symbolic object in faceted stone with warm amber backlight against deep void',
   'black-forest-labs/flux-dev', 'https://replicate.delivery/xezq/hvFWvUd5FR5oH5ge3HxTfQhqI7k2B5nMfe0YHW5HlIutzXgYB/trained_model.tar', 0.85,
   'KUROGINORENJIIRO style. A single {subject}, sculpted from rough-hewn faceted stone with a matte silver-gray surface. The object is centered and floating against a deep black void background. A single warm orange-amber glow emanates from directly behind the object, bleeding softly through cracks, seams, and faceted edges of the stone. Color ratio: 60% near-black background (#0A0A0F), 30% silver-gray stone material (#4A4A52 to #2A2A32), 10% warm orange accent light (#D4760A to #FF8C1A). Low-polygon faceted geometry — broad chisel-cut planes, not smooth, resembling hand-carved volcanic basalt. Fine granular noise across all surfaces. The object occupies 40-60% of the frame, viewed from a slightly elevated three-quarter angle. No secondary light sources, no fill light, no ambient bounce — only the single orange backlight creating dramatic rim lighting and deep shadows on the front face. Photorealistic material rendering on a stylized geometric form. Moody, cinematic, contemplative. Album cover quality. No text, no words, no letters. Square 1:1 composition.',
   NULL, 3.5, 28, NULL, 1);

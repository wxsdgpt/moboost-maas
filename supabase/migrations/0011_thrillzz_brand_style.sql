-- Migration: Seed Thrillzz "Kinetic Tension" brand visual style into industry_knowledge
-- This style is referenced during image, video, and landing page generation for Thrillzz.

INSERT INTO industry_knowledge (
  category, vertical, region, tags, title, summary, full_content,
  structured, source_type, source_url, source_query,
  confidence, relevance, freshness, status, collected_by
) VALUES (
  'best_practice',
  'social_sportsbook',
  'global',
  ARRAY['thrillzz', 'brand_style', 'design_philosophy', 'kinetic_tension', 'visual_identity', 'creative_direction', 'dark_theme', 'igaming'],
  'Thrillzz Brand Visual Style — Kinetic Tension',
  'Design philosophy for Thrillzz (social sportsbook): "Kinetic Tension" — dark field aesthetic with electric orange-red (#ff4410) and cyan (#00d2ff) accents, trajectory arcs, probability clouds, spectrographic bands, clinical typography. Guides image, video, and landing page generation.',
  E'Kinetic Tension — A visual philosophy of suspended motion, the charged instant between cause and consequence, rendered through meticulous geometric systems that vibrate with restrained energy.\n\nSPACE & FORM: Every composition exists in the fraction of a second before release. Form carries velocity — angled geometries, converging sight-lines, repeating elements that accelerate across the field. Nothing is static. Even negative space feels pressurized.\n\nCOLOR: Palette severely restricted — dominant deep almost-black field (#06060c) punctuated by exactly two high-frequency chromatic accents: Electric Orange-Red (#ff4410, #ff8232) and Cyan (#00d2ff, #006496). Accents are load-bearing, not decorative. Like a single neon filament in a dark stadium.\n\nSCALE & RHYTHM: Elements repeat but transform — circles become arcs become trajectories become vanishing points. Syncopated rhythm: dense clusters give way to sudden expanses, then snap back to density. Push-pull cadence mirrors anticipation.\n\nTYPOGRAPHY: Sparse, clinical, lowercase. Exists as specimen notation — thin sans-serif labels cataloguing forces at play. Words are rare surgical instruments.\n\nCOMPOSITION: Follows field diagram / probability map logic. Canvas as coordinate system with invisible axes. Grid alignment sacred but not rigid — breaks only at calculated moments of maximum tension.',
  '{
    "movementName": "Kinetic Tension",
    "primaryColors": {
      "background": "#06060c",
      "accentPrimary": "#ff4410",
      "accentPrimaryLight": "#ff8232",
      "accentSecondary": "#00d2ff",
      "accentSecondaryDim": "#006496",
      "gridMajor": "#1c1c30",
      "textDim": "#464670",
      "textBright": "#a0a0d2"
    },
    "typography": {
      "titleFont": "BigShoulders Bold",
      "labelFont": "Jura Light/Medium",
      "dataFont": "GeistMono",
      "textTreatment": "sparse, clinical, lowercase, specimen notation"
    },
    "designPrinciples": [
      "Suspended motion — everything at the apex before release",
      "Voltage color — accents are electric discharge, not decoration",
      "Syncopated density — clusters alternate with breathing room",
      "Field observation aesthetic — star chart meets tactical overlay",
      "Minimal text — words as rare surgical instruments"
    ],
    "applicationGuidance": {
      "forImages": "Dark field with trajectory arcs converging on product/feature. Probability dot cloud at focal point. Colors: deep black + orange-red accent + cyan secondary.",
      "forVideo": "Motion along trajectory arcs, particles coalescing, threshold lines pulsing. Dark-to-accent color reveals. Thin typography as specimen labels.",
      "forLandingPage": "Dark background (#06060c), grid overlay subtle, accent CTAs in orange-red, data in cyan, minimal sans-serif typography, generous negative space."
    },
    "brandContext": {
      "brand": "Thrillzz",
      "industry": "iGaming / Social Sportsbook",
      "essence": "The thrill of prediction, anticipation of outcomes, competitive energy"
    }
  }'::jsonb,
  'manual',
  'https://thrillzz.com/',
  'thrillzz brand visual style design philosophy',
  0.95, 0.95, 1.0,
  'active',
  'claude_cowork'
)
ON CONFLICT DO NOTHING;

/* artroom.jsx — The Art Room (pre-production).
   Path A: Cinema Machine generates the prompts & specs and holds the asset slots; the user
   runs the image/video tools and drops results back in. Everything derives from
   the script so characters/locations/shots stay consistent.

   Character Sheets are pro consistency anchors: identity tokens + render texture,
   two wardrobe states (public mask / private self), accessories, scale & height,
   a colour palette (incl. a climax-state colour), a negative prompt, and a
   casting-style master reference prompt — all auto-populated when a story is
   generated. Locations / Shots / Storyboard are subsequent increments. */

const ART_TABS = [
  { id:"lookbook",   label:"Lookbook",   icon:"image" },
  // Characters BEFORE Props: a worn prop must match its owner's look, so the character is
  // generated first and the prop references THAT sheet (not the other way around).
  { id:"characters", label:"Characters", icon:"user" },
  { id:"props",      label:"Props",      icon:"box" },
  { id:"locations",  label:"Locations",  icon:"globe" },
  { id:"stylebible", label:"Styles", icon:"layers" },
  { id:"shots",      label:"Shots",  icon:"film" },
  { id:"storyboard", label:"Storyboards", icon:"board" },
];
window.ART_TABS = ART_TABS;

/* pull hex colours out of a CSS gradient and seed a palette (key / shadow / climax) */
function paletteFromGradient(g){
  const hexes = (String(g||"").match(/#[0-9a-fA-F]{6}/g)) || ["#7a6cae","#2a2440"];
  return [
    { name:"Key", hex:hexes[0] },
    { name:"Shadow", hex:hexes[1]||hexes[0] },
    { name:"Climax", hex:"#b8412e" },
  ];
}
window.paletteFromGradient = paletteFromGradient;

/* deterministic visual defaults — so a sheet is never empty even before any
   model call. Generation applies these instantly; the sheet falls back to them. */
function charVisualDefaults(c){
  return {
    scaleClass: c.scaleClass || "Class A \u00b7 Human",
    height: c.height || "approx. 175 cm",
    negativePrompt: c.negativePrompt || "plastic skin, waxy texture, 3d render, cgi look, low resolution, blurry, deformed hands, extra fingers, warped face, text, watermark",
    palette: (c.palette && c.palette.length) ? c.palette : paletteFromGradient(c.color),
  };
}
window.charVisualDefaults = charVisualDefaults;

/* resolve a visual field with legacy fallback (old sheets used look/wardrobe) */
function vfield(c, key, legacy){ return (c[key] && c[key].trim()) ? c[key] : (legacy && c[legacy] ? c[legacy] : ""); }

/* Render-style presets for the character sheet — the user picks one per character from a
   dropdown; "surprise" is AI-invented per character (see aiSurpriseRenderStyle). These are
   GENERALISED (no character-specific materials) so they apply to any cast member; each owns
   its own background + the no-text rules. The character's OWN palette/materials are honoured
   via "this character's own …" phrasing rather than hard-coded props. */
const CHAR_RENDER_STYLES = {
  photoreal: {
    rendering: "hyperrealistic photography, full-frame sensor look, fine grain, no illustration or painterly quality",
    lens: "85mm portrait rendering for the hero close-up with shallow depth of field; ~50mm full-length framing for the turnaround poses, subject sharp head-to-toe",
    lighting: "soft cinematic key from upper left with gentle fill and a subtle rim to separate the figure from the background \u2014 controlled and even enough that detail reads cleanly in every view",
    surface_texture: "photoreal micro-detail true to THIS character's own skin, fabrics and materials \u2014 visible pores and fine wrinkles, fabric nap, leather grain, specular glints on metal/glass, wear and grime where the design calls for it, individual stray hairs",
    color_grade: "filmic, slightly desaturated; honour the character's own palette; warm low-contrast highlights, cool soft shadows",
    background: "seamless off-white studio sweep, even and near-shadowless, with a soft contact shadow under the feet",
    rules: ["no text, labels, watermarks, annotations, typography or captions","photorealistic, 8k, ultra-detailed","natural skin and fabric texture","clean, evenly divided panel layout"]
  },
  photorealNatural: {
    rendering: "natural photoreal biological macro photography — real animal / critter realism, no fantasy stylization, no creature-shop ornament, no costume-like design",
    lens: "true macro wildlife / specimen photography; 100mm macro close-ups with shallow natural depth of field, clean full-body turnaround views sharp enough for anatomy and texture",
    lighting: "soft naturalistic studio macro light with gentle fill; realistic catchlights and contact shadows, controlled enough that skin, fur, scales, wings or shell detail reads clearly",
    surface_texture: "biological micro-detail true to THIS character's species and materials — pores, wet skin sheen, fur clumping, scale edges, insect chitin, wing veins, tiny hairs, dust and moisture where appropriate",
    color_grade: "true-to-life natural colour, lightly filmic but minimally stylized; honour the character's own palette and biological markings",
    background: "clean off-white natural-history studio sweep, minimal shadows, specimen-reference clarity",
    rules: ["no text, labels, watermarks, annotations, typography or captions","real animal / biological macro realism","minimal stylization, no fantasy armor, no fashion ornament, no CG creature-shop polish","consistent anatomy and markings across all panels","clean, evenly divided panel layout"]
  },
  photorealCreature: {
    rendering: "cinematic photoreal film-creature realism — believable practical-effects / prosthetic / VFX maquette finish, physically plausible but designed for screen presence",
    lens: "cinematic creature reference photography; 85mm portrait close-ups, ~50mm full-body turnaround views, grounded lens compression and realistic depth of field",
    lighting: "controlled creature-shop studio lighting — soft key, gentle fill, rim separation, glossy practical-material catchlights; readable from every angle",
    surface_texture: "screen-believable tactile detail — silicone skin, prosthetic seams where appropriate, chitin, wet membranes, fur, feathers, scales, worn fabric, grime and practical material imperfections",
    color_grade: "filmic creature design grade, grounded contrast and saturation; honour the character's palette while keeping it plausible under live-action lighting",
    background: "neutral creature-shop photo sweep, soft contact shadow, practical maquette presentation",
    rules: ["no text, labels, watermarks, annotations, typography or captions","believable film creature, practical effects / prosthetic / VFX maquette realism","physically plausible screen design, not a flat illustration or toy render","consistent design and materials across all panels","clean, evenly divided panel layout"]
  },
  photorealOrnamental: {
    rendering: "photoreal ornamental creature design — physically rendered cinematic realism with couture, ceremonial, jewelry-like or armor-like surface design",
    lens: "premium fashion-creature reference photography; 85mm hero close-ups, ~50mm full-body turnaround views, crisp silhouette and material readability",
    lighting: "luxury studio creature lighting — soft sculpting key, elegant rim, controlled specular glints on iridescence, metal, wet shell, glass, crystal or beadwork",
    surface_texture: "high-end tactile ornament — iridescent chitin, polished armor plates, translucent veils, jeweled details, couture-like membranes, fine filigree and decorative wear while preserving anatomy",
    color_grade: "refined cinematic fashion grade; controlled contrast, elegant highlights, palette led by the character's own colours with metallic or pearlescent accents where the design calls for it",
    background: "clean premium studio sweep with soft contact shadow, gallery/specimen clarity without labels",
    rules: ["no text, labels, watermarks, annotations, typography or captions","photoreal ornamental / couture creature design","elegant jewelry-like, armor-like or ceremonial detail while staying physically plausible","consistent silhouette, materials and decoration across all panels","clean, evenly divided panel layout"]
  },
  render3d: {
    rendering: "high-quality stylized 3D character render, animated-feature quality; physically-based shading (PBR), soft subsurface scattering on skin, ray-traced soft shadows and global illumination, gentle ambient occlusion in seams and folds",
    engine_look: "offline render aesthetic (Arnold / RenderMan / Octane / Redshift) \u2014 clean, polished, high-sample, no noise",
    materials: "stylized PBR materials true to THIS character's own design \u2014 fabrics with soft sheen, supple creased leather, refractive glass, translucent gems, wet/crusted grime and subtle worn-edge wear where the design calls for it",
    lighting: "soft three-point studio render lighting \u2014 broad key from upper left, gentle fill, cool rim to separate the figure from the background; warm bounce, cinematic but even enough to read every panel",
    color_grade: "rich but muted; honour the character's own palette; soft filmic contrast, slight warm bias in highlights",
    background: "seamless soft neutral light-grey studio sweep with a gentle gradient and a soft grounded contact shadow under the feet",
    rules: ["no text, labels, watermarks, annotations, typography or captions","clean high-sample render, no render noise or fireflies","consistent shaders and lighting across all panels","clean, evenly divided panel layout"]
  },
  anime: {
    rendering: "high-quality color anime / cel-shaded illustration; clean confident ink line art with consistent line weight, flat color fills, two-to-three tone cel shading with crisp shadow shapes",
    linework: "clean black or dark-brown outlines, slightly heavier on outer contours, finer for interior detail; minimal hatching reserved for fabric folds and skin creases",
    shading: "hard-edged cel shadows from an upper-left light, soft ambient fill, simple specular glints \u2014 no photoreal gradients",
    color_grade: "anime palette drawn from THIS character's own colours; low saturation suited to the story's tone",
    background: "flat off-white / very light neutral panel background, even and clean; a simple soft contact shadow under the feet",
    rules: ["no text, labels, watermarks, annotations, typography or captions","high-resolution, sharp clean line art","consistent cel-shading across all panels","clean, evenly divided panel layout"]
  },
  flat: {
    rendering: "clean flat vector / graphic illustration; solid color fills, simplified geometric forms, crisp shapes, no rendered texture",
    shape_language: "bold readable silhouettes, rounded confident forms; minimal detail reduced to essential shapes",
    outline: "optional thin clean uniform outline OR outline-free overlapping flat shapes \u2014 consistent choice across all panels",
    shading: "flat \u2014 at most one darker tone per color for simple shadow shapes; no gradients, no rendered light, no texture",
    palette: "tight limited palette (6\u20138 flat colors) drawn from THIS character's own colours, with one or two saturated accents",
    background: "single flat solid color or a simple flat geometric ground (light neutral or soft warm tone); a small flat shadow shape under the feet; no studio sweep, no texture",
    rules: ["no text, labels, watermarks, annotations, typography or captions","perfectly flat color, crisp clean edges, scalable vector quality","consistent palette, shapes and outline treatment across all panels","clean, evenly divided panel layout"]
  },
  horror: {
    "rendering": "hyperrealistic cinematic photography pushed to horror; full-frame look, fine grain, deep filmic blacks, no illustration or cartoon quality",
    "lighting": "low-key chiaroscuro — a single hard cold source (moonlight or distant lantern) raking from the side, deep crushed shadows swallowing most of the figure, a thin cold rim for separation, the amber staff-knot the only warm accent; large areas of pure darkness",
    "atmosphere": "damp marsh haze and low ground fog, faint volumetric light shafts, particulate in the air, a sense of cold wet stillness",
    "color_grade": "desaturated and cold — sickly green-teal shadows, muted earth midtones, crushed inky blacks; the lone warm amber glow for contrast; grim and oppressive",
    "surface_texture": "photoreal damp, grimy detail — clammy skin sheen, wet leather, beaded moisture on glass, mud-slick boots; texture readable only where the light catches",
    "framing": "tense cinematic horror composition — figure emerging from darkness, heavy negative space, unease in the empty dark around her",
    "background": "deep near-black foggy marsh void rather than a clean studio sweep; the figure lit out of the dark; a faint cold ground haze under the feet",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","low-key cinematic horror lighting, deep atmospheric blacks","atmospheric dread, not gore or graphic injury","consistent lighting, fog and grade across all panels","evenly divided panel layout, figures readable despite the dark"]
  },
  ghibli: {
    "rendering": "soft hand-painted 2D cel animation look; delicate thin organic linework, gentle cel shading with soft painterly edges, a warm hand-drawn quality — not hard-edged graphic cel, not photoreal, not 3D",
    "linework": "fine, soft, slightly irregular hand-drawn lines; light brown or muted dark outlines rather than heavy black; line that breathes and varies gently",
    "shading": "simple soft cel shadows with feathered edges and a warm ambient fill; gentle painterly transitions, no hard graphic blocks",
    "color_grade": "warm naturalistic earthy palette — soft moss and sap greens, gentle browns, oat-cream, muted amber; slightly desaturated, sunlit, nostalgic",
    "texture": "subtle hand-painted softness and faint paper/cel warmth; a quiet, still, pastoral mood",
    "background": "soft, simple, lightly hand-painted pale ground (warm cream or gentle sky-tone) so the figure reads cleanly; a soft contact shadow under the feet — uncluttered, but painterly rather than flat",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","soft hand-drawn warmth, gentle naturalistic detail","consistent line, palette and shading across all panels","clean, evenly divided panel layout"]
  },
  animated3d: {
    "rendering": "high-quality animated-feature 3D render; appealing stylized character, physically-based shading with soft subsurface scattering, clean polished surfaces, ray-traced soft shadows and warm global illumination",
    "engine_look": "polished animated-movie pipeline render (RenderMan / Arnold quality) — clean, high-sample, idealized, no noise",
    "lighting": "soft, warm, flattering animated-feature lighting — broad key, generous bounce fill, gentle rim, an appealing glow; the 'every frame looks beautiful' look; even enough to read every panel",
    "materials": "stylized PBR with appeal — soft fuzzy wool, supple rounded leather, cheerfully refractive glass vials, glowing translucent amber, simplified clean mud; gentle worn-edge wear",
    "expression_and_appeal": "lively acting and personality in face and pose; squash-stretch-friendly appealing forms; charm prioritized over grit",
    "color_grade": "warm, inviting, slightly saturated earthy palette — moss green, mud brown, oat-cream, warm amber; soft cheerful contrast",
    "background": "seamless soft warm light-cream studio sweep with a gentle gradient and a soft grounded contact shadow under the feet",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","clean high-sample render, appealing animated-feature finish, no noise","lively expression and personality, not a stiff neutral sculpt","consistent shaders and lighting across all panels","clean, evenly divided panel layout"]
  },
  pixar: {
    "rendering": "high-end Pixar-style animated-feature 3D character render — appealing stylized proportions (slightly oversized head and large expressive eyes, soft rounded forms), physically-based shading with soft subsurface scattering and fine peach-fuzz on skin, clean polished surfaces, ray-traced soft shadows and warm global illumination",
    "engine_look": "top-tier animated-movie pipeline render (RenderMan-quality) — pristine, high-sample, idealized, no noise or fireflies",
    "character_appeal": "maximum 'appeal' — warm, expressive, lively face with large emotive eyes, charming readable acting in the pose, squash-and-stretch-friendly construction; personality and warmth over gritty realism",
    "materials": "stylized-but-tactile PBR true to THIS character's design — soft fuzzy fabrics, supple rounded leather, cheerfully refractive glass, glowing translucent accents, simplified clean grime and gentle worn-edge wear",
    "lighting": "soft, warm, flattering key lighting — broad key, generous bounce fill, gentle rim, an appealing glow; the 'every frame is a painting' look; even enough to read every panel",
    "color_grade": "warm, inviting, gently saturated palette honouring the character's own colours; soft cheerful filmic contrast",
    "background": "seamless soft warm light-cream studio sweep with a gentle gradient and a soft grounded contact shadow under the feet",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","clean high-sample render, appealing Pixar-style finish, no noise","lively expression, charm and appeal — not a stiff neutral sculpt","consistent character design, shaders and lighting across all panels","clean, evenly divided panel layout"]
  },
  paintedconcept: {
    "rendering": "a richly HAND-PAINTED concept-art illustration — a soft painterly 2D painting (digital or traditional media) in the lineage of Laika and Guillermo del Toro production paintings; NOT a 3D render, NOT flat cel animation, NOT photography",
    "brushwork": "visible expressive brushwork and soft blended edges — layered glazes, gentle impasto on highlights; forms built from paint rather than hard outlines or vector fills; a tactile, hand-made surface",
    "rendering_detail": "lush volumetric rendering of form — soft form shadows, delicate rim and bounce light, fine texture (downy fuzz, worn fabric, translucent inner glow) suggested with the brush rather than literal micro-detail",
    "character_appeal": "storybook charm with a touch of the whimsical-gothic and uncanny — large soulful eyes, a gentle melancholy, an expressive hand-acted face; appealing but with painterly soul, never glossy or sterile",
    "color_grade": "muted, warm, earthy painterly palette — umber, sap and moss green, oat-cream, dusky amber glow; soft filmic contrast, slightly desaturated, nostalgic and tactile",
    "lighting": "soft directional storybook lighting — a gentle warm key, deep soft ambient, a warm glow from the character's own light; painterly chiaroscuro, even enough to read every panel",
    "texture": "faint canvas/paper tooth and soft painterly grain across the image; the warmth of hand-made media, never crisp digital cleanliness",
    "background": "a soft, simple, loosely hand-painted warm-cream or muted ground with quiet painterly atmosphere so the figure reads cleanly; a soft painted contact shadow under the feet",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","richly hand-painted painterly illustration with visible brushwork and soft edges","NOT 3D CG, NOT flat cel/vector, NOT photographic","consistent painted style, palette and lighting across all panels","clean, evenly divided panel layout"]
  },
  storyboardconcept: {
    "rendering": "clean storyboard / animation concept-art illustration — expressive linework, clear cinematic staging, readable silhouettes and mood-first design; polished enough for production reference but not over-rendered",
    "linework": "thin-to-medium confident drawing lines, sketch-aware but controlled; architectural/background lines may stay lightly visible like layout art",
    "shading": "soft restrained cel shading and pale wash shadows; enough form to read volume without becoming photographic",
    "color_grade": "limited production-paint palette drawn from THIS character's own colours; airy highlights, soft shadows, restrained saturation",
    "background": "simple light production-design board ground, clean enough for a reference sheet, with subtle cinematic atmosphere and a soft contact shadow",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","storyboard / concept-board clarity","expressive but clean linework","consistent design and staging across all panels","clean, evenly divided panel layout"]
  },
  texturedcomic: {
    "rendering": "textured contemporary comic illustration — bold expressive ink line, etched hatching, limited warm palette, dramatic graphic light and painterly texture",
    "linework": "visible black/brown ink lines with textured irregular edges; confident contours, selective cross-hatching and scratched detail",
    "shading": "strong shadow shapes with grainy overlays, stipple and rough brush texture; high-contrast but still readable",
    "color_grade": "limited cinematic comic palette; warm skin/material tones, deep shadow colour, selective saturated accents from THIS character's palette",
    "background": "light neutral comic-art sheet ground with subtle paper/grain texture and a grounded contact shadow",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","bold textured comic inkwork","limited palette, dramatic contrast and etched detail","consistent line and texture across all panels","clean, evenly divided panel layout"]
  },
  whimsicalwatercolor: {
    "rendering": "whimsical watercolor and fine-ink children's-book illustration — loose transparent washes, delicate hand-drawn line, soft charm and gentle storybook warmth",
    "linework": "thin irregular ink or pencil line with small expressive wiggles; never slick vector or heavy comic outline",
    "paint": "visible watercolor blooms, paper grain, soft pigment edges, translucent layered washes and tiny hand-painted imperfections",
    "color_grade": "soft delicate palette drawn from THIS character's colours; airy neutrals, gentle accents, warm nostalgic atmosphere",
    "background": "warm watercolor-paper ground with a faint wash and soft painted contact shadow; uncluttered enough for a reference sheet",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","watercolor wash and fine ink line","storybook warmth, delicate texture and hand-painted paper grain","consistent palette and character design across all panels","clean, evenly divided panel layout"]
  },
  stopmotion: {
    "rendering": "photograph of a real handmade stop-motion puppet on a miniature set — NOT a digital CG render, not a drawing; tactile physical materials captured by a real camera",
    "construction": "visible handmade craft — sculpted silicone skin with faint mould/replacement seams, real felted wool and fabric at true tiny scale with weave and hand-stitching, needle-felted hair, real leather and glass, an armature-posable feel",
    "imperfection": "lovingly handmade quality — faint fingerprints or tool marks, fabric fuzz, tiny irregular stitches, soft sculpt softness; charming, not flawless",
    "photography": "macro / miniature photography — shallow real depth of field, soft practical studio set lighting (gentle key, warm fill, subtle rim), a faint tilt-shift miniature feel, real catchlights and contact shadows",
    "color_grade": "warm, tactile, slightly filmic earthy palette — moss green, mud brown, oat-cream, warm amber; cozy handmade contrast",
    "background": "simple soft miniature-set backdrop or a clean neutral surface the puppet stands on, evenly and warmly lit; a real soft contact shadow under the feet; shallow background focus",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","real handmade puppet materials and craft texture, visible at macro scale","physical photographed look, not digital CG smoothness","consistent puppet, lighting and lens across all panels","clean, evenly divided panel layout"]
  },
  adv1960s: {
    "rendering": "1960s painted commercial illustration — smooth confident gouache/airbrush rendering, idealized stylized figure, clean optimistic finish; NOT photographic, NOT modern digital",
    "illustration_handling": "soft airbrushed gouache gradients with crisp painted highlights and confident edges; gentle outline where useful; tidy, aspirational, mid-century commercial polish",
    "print_process": "vintage offset-print look — visible halftone dot texture, slight color-registration offset, subtle ink-on-paper grain, faintly aged warm paper stock",
    "palette": "classic mid-century limited palette — mustard yellow, avocado and moss green, burnt orange, teal, warm cream, chocolate brown, soft coral; muted-but-warm, cheerful",
    "lighting": "bright, even, flattering ad-illustration light — wholesome and clean, soft idealized modeling, no harsh shadow",
    "background": "flat warm cream or soft mid-century color-block panel, lightly textured like aged print stock; a simple painted shadow grounding the feet; clean and uncluttered (no text)",
    "rules": ["no text, labels, watermarks, annotations, typography, captions or logos","authentic mid-century gouache illustration with halftone print texture","cheerful, idealized, aspirational ad-art tone","consistent palette, halftone and rendering across all panels","clean, evenly divided panel layout"]
  },
  claymation: {
    "rendering": "photograph of a real claymation / plasticine puppet on a miniature set — NOT a digital CG render, not a drawing; soft physical clay captured by a real camera",
    "construction": "modeling-clay / plasticine craft — rounded smooth-sculpted simplified forms, visible thumbprints and sculpting-tool marks, soft matte-to-glossy clay sheen, the subtle handmade wobble of re-sculpted stop-motion clay",
    "imperfection": "lovingly handmade clay quality — fingerprints, tool grooves, tiny surface irregularities, soft uneven edges; charming, never flawless or machined",
    "photography": "macro / miniature photography — shallow real depth of field, soft practical studio set lighting (gentle key, warm fill, subtle rim), real catchlights and contact shadows, a faint tilt-shift miniature feel",
    "color_grade": "warm, tactile, slightly matte earthy palette — muted moss green, mud brown, oat-cream, warm amber; cozy handmade contrast",
    "background": "simple soft miniature-set backdrop or a clean warm surface the puppet stands on, evenly and warmly lit; a real soft contact shadow under the feet; shallow background focus",
    "rules": ["no text, labels, watermarks, annotations, typography or captions","real plasticine clay craft — fingerprints and tool marks visible at macro scale","rounded, simplified, handmade clay forms, not digital CG smoothness","consistent clay puppet, lighting and lens across all panels","clean, evenly divided panel layout"]
  },
  gaganime: {
    "rendering": "playful 1990s Japanese gag-anime cartoon concept-art sheet — flat 2D cel-shaded illustration with bold black outlines, not claymation, not photography, not CG",
    "construction": "clean vector-like cartoon construction — oversized rounded chibi proportions, simplified shapes, soft bulbous forms, minimal internal detail, thick confident ink outlines, flat high-saturation color fills, simple graphic shadow shapes",
    "imperfection": "handmade cartoon charm through expressive asymmetry, slightly wobbly line rhythm, exaggerated comic proportions, playful simplified wrinkles and features; clean but not sterile",
    "linework": "very thick black outer contours with thinner simple interior lines; rounded cartoon silhouettes; no fine realistic rendering",
    "shading": "flat cel shading with one or two simple shadow shapes per form; no painterly blending, no realistic texture, no photographic lighting",
    "photography": "not photographed — illustrated poster-sheet presentation with a crisp, sticker-like finish; dynamic low-angle hero framing for the portrait and clean turnaround panels",
    "color_grade": "bright, warm, high-saturation cartoon palette — moss green robe, mud brown apron, warm olive-tan skin, glowing amber accents, cyan/blue graphic highlights, warm orange sunset backdrop; cheerful comic contrast",
    "background": "stylized flat cartoon backdrop with warm orange sunset gradient, simple coastal atmosphere, simplified suspension bridge and city skyline shapes; clean graphic panel dividers; no realistic miniature-set depth of field",
    "typography": "optional bold graffiti-style title lettering only if requested, with yellow fill, cyan outline, and heavy black drop shadow; otherwise keep the sheet free of labels and captions",
    "rules": ["2D gag-anime cartoon concept-art sheet","thick bold black outlines","flat high-saturation cel-shaded colors","oversized rounded chibi proportions","simple expressive face with huge oval eyes and tiny mouth","minimal detail, soft rounded shapes, sticker-poster aesthetic","consistent same character design across all panels","clean evenly divided concept-sheet layout","no photorealism, no clay, no plasticine, no 3D render, no realistic anatomy"]
  },
  pixelart: {
    "rendering": "detailed retro pixel art; hard square pixels, NO anti-aliasing, crisp pixel edges, drawn on a clear pixel grid (16/32-bit JRPG / PC-98 fidelity, not chunky 8-bit)",
    "pixel_scale": "consistent medium-resolution pixel grid across all panels; the hero portrait may use a slightly larger sprite but the same pixel size",
    "palette": "tight limited indexed palette (a warm lo-fi set) — moss greens, warm tans and browns, oat-cream, iron-grey, amber, with a couple of cool shadow tones; cohesive and nostalgic",
    "shading": "stepped flat shading within the palette, with ordered/checkerboard DITHERING for gradients and soft transitions; pixel-cluster highlights; no smooth gradients",
    "outline": "selective dark pixel outlines on outer contours and key forms; clean, consistent",
    "mood": "cozy, warm, nostalgic lo-fi atmosphere",
    "background": "simple flat or softly dithered warm-neutral pixel background so the sprites read clearly; a small pixel contact shadow under the feet; uncluttered",
    "rules": ["no text, labels, watermarks, annotations, typography, captions or UI elements","authentic hard-edged pixel art with dithering and a limited palette","consistent pixel scale, palette and dithering across all panels","clean, evenly divided panel layout"]
  }
};
Object.assign(CHAR_RENDER_STYLES, {
  modernAnime: {
    rendering: "modern cinematic anime illustration — clean sharp linework, expressive eyes, polished contemporary cel shading and dynamic animated-film appeal",
    linework: "crisp confident anime outlines with refined interior detail; expressive facial construction, clean hair and wardrobe shapes",
    shading: "sharp defined cel shadows with subtle painted gradients in highlights; cinematic light direction, no photoreal skin texture",
    color_grade: "vibrant contemporary anime palette drawn from THIS character's colours; clear highlights, saturated skies or accents where appropriate",
    background: "clean pale anime production-sheet ground with a soft contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","modern polished anime character design","consistent face, proportions and costume across all panels","clean, evenly divided panel layout"]
  },
  digitalAnime: {
    rendering: "polished digital anime illustration — smooth refined rendering, clean line art, vibrant colour and an almost painterly digital finish",
    linework: "thin clean anime linework with elegant contour control and careful eye/detail rendering",
    shading: "soft digital shading blended over cel structure; glossy controlled highlights, luminous atmosphere",
    color_grade: "bright refined anime palette with gentle gradients, fashion/editorial colour accents from THIS character's palette",
    background: "soft pastel or light neutral digital-illustration ground with subtle glow and contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","smooth polished digital anime finish","consistent line, palette and rendering across all panels","clean, evenly divided panel layout"]
  },
  roughSketchAnime: {
    rendering: "rough sketch anime concept art — bold sketchy linework, flat colour with light hatching, immediate production-design energy",
    linework: "visible loose pencil/ink strokes, confident imperfect contours, construction-line vitality without looking unfinished",
    shading: "mostly flat colour with selective hatching, cross-hatching and rough shadow marks",
    color_grade: "limited vivid anime palette with bold background accents, drawn from THIS character's own colours",
    background: "plain warm sketchbook or bold flat colour ground with subtle paper grain",
    rules: ["no text, labels, watermarks, annotations, typography or captions","rough sketch anime energy, not polished photorealism","consistent character design across all panels","clean, evenly divided panel layout"]
  },
  painterlyAnime: {
    rendering: "painterly anime illustration — delicate expressive line, soft blending, visible brush texture and dreamy animated atmosphere",
    linework: "fine gentle anime linework, slightly irregular and expressive",
    paint: "soft painterly brushstrokes, blended colour fields, subtle grain and luminous atmospheric wash",
    color_grade: "dreamy painterly palette drawn from THIS character's colours; soft greens, violets, creams or warm accents as appropriate",
    background: "light painterly ground with atmospheric wash and soft contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","anime blended with painterly brushwork","soft emotional atmosphere","consistent design and palette across all panels","clean, evenly divided panel layout"]
  },
  cartoon3d: {
    rendering: "stylized 3D cartoon character render — exaggerated animation proportions, bold readable forms, cinematic digital-paint finish",
    engine_look: "polished cartoon-feature render, clean high-sample lighting, not photoreal and not flat 2D",
    materials: "smooth stylized materials true to THIS character's costume and props; soft fabric, simple skin, rounded edges",
    lighting: "dramatic but readable animated-feature lighting with strong silhouette and soft fill",
    background: "simple neutral 3D studio sweep with a soft grounded shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","stylized 3D cartoon, bold expressive character appeal","consistent shaders and proportions across all panels","clean, evenly divided panel layout"]
  },
  textured3dCartoon: {
    rendering: "textured 3D cartoon render — simplified animated character forms with visible felt, clay, fabric or fuzzy surface texture",
    materials: "tactile stylized materials: visible fabric nap, felt fuzz, clay softness, knitted fibres or paper texture where the design calls for it",
    lighting: "soft even studio light that reveals tactile surface texture and rounded cartoon forms",
    color_grade: "friendly saturated palette drawn from THIS character's colours; soft shadows and warm highlights",
    background: "clean colour or neutral studio ground with soft contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","textured 3D cartoon surfaces, tactile and charming","consistent material texture across all panels","clean, evenly divided panel layout"]
  },
  stylizedCartoon: {
    rendering: "stylized cartoon illustration — bold flat areas of colour, distinct outlines, theatrical composition and graphic animated charm",
    linework: "clean bold outlines with simplified expressive features and readable silhouette",
    shading: "flat colour blocks with selective graphic shadows; minimal texture, strong shape design",
    color_grade: "lively cartoon palette drawn from THIS character's colours with clear accent contrasts",
    background: "simple flat or lightly painted neutral ground with a clean contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","stylized cartoon illustration, not photoreal","bold outlines and clean graphic shape language","consistent design across all panels","clean, evenly divided panel layout"]
  },
  grittyDigital: {
    rendering: "gritty digital illustration — harsh lighting, strong linework, dramatic high-contrast palette and painterly texture",
    linework: "expressive dark lines and rough detail marks; intense contemporary illustration finish",
    shading: "deep shadows, vibrant edge highlights, textured brush grain and moody atmosphere",
    color_grade: "dramatic dark palette with selective saturated highlights from THIS character's colours",
    background: "simple dark-to-neutral textured ground with atmospheric shadow and contact grounding",
    rules: ["no text, labels, watermarks, annotations, typography or captions","gritty digital illustration, high contrast and painterly texture","consistent mood and design across all panels","clean, evenly divided panel layout"]
  },
  softPainterly: {
    rendering: "soft painterly illustration — visible brushstrokes, blended colour, gentle dreamy character appeal and traditional-paint warmth",
    brushwork: "soft visible brush texture, delicate edges, layered colour and subtle canvas/paper grain",
    shading: "gentle form modelling with warm highlights and low-contrast shadows",
    color_grade: "soft blended palette drawn from THIS character's colours; gentle, dreamy and emotionally warm",
    background: "light painterly ground with faint texture and a soft painted contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","soft painterly character illustration","visible brushwork and gentle blended colour","consistent design across all panels","clean, evenly divided panel layout"]
  },
  realisticDigitalDrawing: {
    rendering: "realistic digital drawing — high realism in an illustrated digital style, detailed texture and photographic lighting logic without becoming a photo",
    linework: "mostly hidden refined drawing structure, clean edges and carefully observed anatomy",
    shading: "detailed digital painting with realistic light, softened background and sharp subject focus",
    color_grade: "naturalistic digital-art palette honouring THIS character's colours; balanced contrast and atmospheric depth",
    background: "simple softly rendered studio ground with realistic contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","realistic digital drawing, not photography","detailed textures and believable lighting","consistent identity across all panels","clean, evenly divided panel layout"]
  },
  flatDesign: {
    rendering: "flat design illustration — simplified shapes, bold flat colours, minimal shading and modern graphic clarity",
    shape_language: "large simplified geometric forms, clean silhouette, decorative but economical details",
    shading: "minimal or no shading; one simple shadow colour at most",
    palette: "limited modern flat palette drawn from THIS character's colours",
    background: "flat light ground with simple geometric shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","flat design illustration, minimal shading","clean simplified shapes and bold colour","consistent graphic treatment across all panels","clean, evenly divided panel layout"]
  },
  minimalistLine: {
    rendering: "minimalist line art — clean flowing economical lines, sparse detail, elegant negative space and little to no colour",
    linework: "thin graceful black or dark-grey lines with selective accent marks; no heavy rendering",
    shading: "none or extremely minimal; form is carried by contour and gesture",
    palette: "mostly warm paper, black line and one tiny accent colour from THIS character's palette",
    background: "warm off-white paper ground with abundant negative space",
    rules: ["no text, labels, watermarks, annotations, typography or captions","minimalist line art, sparse and elegant","no rendered texture or heavy shading","consistent silhouette across all panels","clean, evenly divided panel layout"]
  },
  vintageChildrensBook: {
    rendering: "vintage children's book illustration — bold ink outlines, limited colour palette and nostalgic hand-drawn print texture",
    linework: "loose charming ink line, slightly irregular and playful",
    print_process: "warm aged paper, simple spot colour, stipple or rough ink texture",
    palette: "very limited palette drawn from THIS character's colours plus one strong accent",
    background: "warm cream paper ground with sparse printed shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","vintage children's book illustration","limited colour and nostalgic print texture","consistent hand-drawn charm across all panels","clean, evenly divided panel layout"]
  },
  tactileMixedMedia: {
    rendering: "tactile mixed-media illustration — miniature handmade artwork combining fabric, felt, paper, paint and sculpted pieces",
    materials: "visible craft materials: wool, felt, thread, paper cutouts, painted surfaces, tiny props and handmade seams",
    photography: "photographed handmade diorama look with soft macro depth of field and gentle practical light",
    color_grade: "soft cozy handmade palette drawn from THIS character's colours",
    background: "simple miniature craft-set ground with real texture and soft contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","tactile mixed-media handmade miniature look","visible fabric/paper/felt craft texture","consistent materials across all panels","clean, evenly divided panel layout"]
  },
  texturedPaperSculpture: {
    rendering: "textured paper sculpture — three-dimensional crafted paper characters with visible folds, layers and paper fibres",
    construction: "folded, curled, layered paper planes; hand-cut edges, creases, paper thickness and tiny shadows between layers",
    photography: "photographed tabletop paper sculpture with warm practical light and shallow depth of field",
    color_grade: "warm muted paper palette drawn from THIS character's colours",
    background: "simple tabletop/studio paper ground with soft physical contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","3D paper sculpture with visible folds and layers","handcrafted tactile paper texture","consistent paper construction across all panels","clean, evenly divided panel layout"]
  },
  texturedPaperIllustration: {
    rendering: "textured paper illustration — layered paper-craft / printmaking look with flat colour blocks, stipple, grain and handmade edges",
    texture: "paper tooth, printed ink grain, cut-paper edges, subtle collage layering and tactile surface",
    shading: "flat colour patches with stippled detail and simple handmade shadow shapes",
    palette: "muted print/paper palette drawn from THIS character's colours",
    background: "warm paper ground with subtle collage texture",
    rules: ["no text, labels, watermarks, annotations, typography or captions","textured paper illustration, collage/printmaking feel","flat colour blocks and stippled handmade texture","consistent paper treatment across all panels","clean, evenly divided panel layout"]
  },
  tropicalArtNouveau: {
    rendering: "tropical Art Nouveau illustration — decorative organic lines, lush botanical motifs, elegant stylized beauty and flat ornamental colour",
    linework: "flowing ornamental contour lines, plant-like curves and decorative framing shapes",
    shading: "mostly flat colour with elegant contour accents; refined decorative simplification",
    palette: "lush tropical palette drawn from THIS character's colours: botanical greens, warm florals, cream, gold or coral accents",
    background: "clean decorative botanical ground, restrained enough for a character reference sheet",
    rules: ["no text, labels, watermarks, annotations, typography or captions","tropical Art Nouveau decorative illustration","organic ornamental line and botanical motifs","consistent elegant design across all panels","clean, evenly divided panel layout"]
  },
  graphicNovelNoir: {
    rendering: "high-contrast black-and-white graphic-novel illustration — bold chiaroscuro ink, heavy spot blacks, screentone and hatching for midtones, hard-boiled noir atmosphere",
    linework: "confident brush-and-ink contours, thick expressive outer lines, dry-brush and cross-hatching for texture — tone comes from ink density and screentone, never grey gradients",
    shading: "a single hard key light carving faces and forms out of shadow; venetian-blind slats, rain-streaked highlights, deep pooled blacks",
    color_grade: "strictly black and white; at most ONE restrained accent colour when THIS character's design demands it, otherwise pure monochrome",
    background: "flat white or light paper-tone panel background with a hard-edged cast shadow — no studio sweep",
    rules: ["no text, labels, watermarks, annotations, typography or captions","strictly monochrome ink unless a single named accent colour","consistent ink weight and screentone across all panels","clean, evenly divided panel layout"]
  },
  ukiyoe: {
    rendering: "traditional Japanese ukiyo-e woodblock print — flat mineral-pigment colour fields, elegant calligraphic keyblock outlines, visible washi paper texture and subtle bokashi colour gradation",
    linework: "sumi keyblock lines — flowing, tapered, confident; finer interior detail for fabric patterns, hair and ornament",
    shading: "no Western light-and-shadow modelling — form reads through line, overlapping flat planes and bokashi gradation",
    color_grade: "muted Edo-period palette drawn from THIS character's own colours — indigo, ochre, vermilion, pine green, charcoal on aged-paper warmth",
    background: "plain warm washi paper tone, at most a single flat cloud or wave motif band — no rendered depth, no studio sweep",
    rules: ["no text, no labels, no calligraphy, no seals or stamps, no captions","authentic woodblock feel — slight ink registration texture, no digital gradients","consistent palette and line across all panels","clean, evenly divided panel layout"]
  },
  paperCutout: {
    rendering: "layered paper cut-out collage — flat coloured paper shapes with crisp scissor-cut edges, stacked in shallow physical layers with real drop shadows between them",
    materials: "textured construction paper, card and tissue — visible paper grain, fibre flecks and slight edge burr; folded or scored details for dimension",
    lighting: "soft overhead craft-table light casting small true shadows between the paper layers — the depth is physical, not painted",
    color_grade: "bold flat paper palette drawn from THIS character's own colours; warm, tactile, storybook-friendly",
    background: "a plain paper backdrop in a soft neutral tone that clearly reads as another paper layer; soft layered contact shadow",
    rules: ["no text, labels, watermarks, annotations, typography or captions","every shape reads as physically cut paper — no painted gradients or digital rendering","consistent layer depth and shadow treatment across all panels","clean, evenly divided panel layout"]
  }
});
window.CHAR_RENDER_STYLES = CHAR_RENDER_STYLES;
/* FUTURE-PROOF render-style registry. CHAR_RENDER_STYLES (above) is the single source of
   truth for WHICH styles exist: the dropdown list across Characters, Props and Locations is
   DERIVED from its keys, so a newly added style auto-appears everywhere with no extra edits.
   To add a style: add ONE entry to CHAR_RENDER_STYLES; optionally give it a pretty label here
   (the key is humanized if absent) and tuned per-tab text in LOC_RENDER_TEXT / PROP_RENDER_TEXT
   (optional \u2014 renderStyleText() falls back to the char descriptor so it still renders in-style). */
const RENDER_STYLE_LABELS = {
  photoreal:"Photoreal - Human cinematic", photorealNatural:"Photoreal - Natural History Macro",
  photorealCreature:"Photoreal - Cinematic creature", photorealOrnamental:"Photoreal - Ornamental creature",
  render3d:"Stylized 3D render", anime:"Anime / manga", modernAnime:"Modern Anime",
  digitalAnime:"Digital Anime Illustration", roughSketchAnime:"Rough Sketch Anime", painterlyAnime:"Painterly Anime",
  flat:"Flat Vector Illustration", flatDesign:"Flat Design Illustration", minimalistLine:"Minimalist Line Art", vintageChildrensBook:"Vintage Children’s Book Illustration",
  horror:"Cinematic horror", ghibli:"Studio Ghibli Anime",
  animated3d:"Animated feature 3D", pixar:"Pixar-style 3D", cartoon3d:"3D Cartoon", textured3dCartoon:"Textured 3D Cartoon", stylizedCartoon:"Stylized Cartoon Illustration", paintedconcept:"Hand-painted concept art",
  storyboardconcept:"Storyboard concept", texturedcomic:"Textured Comic Illustration", whimsicalwatercolor:"Whimsical Watercolor",
  graphicNovelNoir:"Graphic novel — Noir B&W", ukiyoe:"Ukiyo-e woodblock", paperCutout:"Paper cut-out",
  grittyDigital:"Gritty Digital Illustration", softPainterly:"Soft Painterly Illustration", realisticDigitalDrawing:"Realistic Digital Drawing",
  stopmotion:"Stop-motion / Tactile Miniature",
  claymation:"Claymation", tactileMixedMedia:"Tactile Mixed Media Illustration", texturedPaperSculpture:"Textured Paper Sculpture", texturedPaperIllustration:"Textured Paper Illustration",
  tropicalArtNouveau:"Tropical Art Nouveau Illustration",
  adv1960s:"1960s advertising", gaganime:"90s gag-anime", pixelart:"Retro pixel-art",
};
window.RENDER_STYLE_LABELS = RENDER_STYLE_LABELS;
const RENDER_STYLE_DESCRIPTIONS = {
  // (2026-07-03) every built-in key now has a description — the picker shows it as
  // the option's hover/desc text, so no style reads as an unexplained label
  render3d:"For polished stylized 3D renders: PBR materials, soft subsurface skin, offline-render quality without the cartoon exaggeration.",
  anime:"For classic cel anime: clean confident ink lines, flat colour fills and hard-edged two-to-three tone shading.",
  flat:"For flat vector/graphic illustration: solid fills, simplified geometric shapes, no gradients or rendered texture.",
  horror:"For photoreal cinematic horror: deep filmic blacks, dread-forward lighting and unsettling realism.",
  ghibli:"For hand-painted animated warmth: soft watercolour backgrounds, gentle linework and lived-in natural detail.",
  animated3d:"For mainstream animated-feature 3D: appealing proportions, rich lighting and polished family-film finish.",
  pixar:"For Pixar-style 3D: big expressive eyes, soft rounded forms, subsurface skin and warm global illumination.",
  paintedconcept:"For hand-painted concept art: visible brushwork, confident shapes and production-design energy.",
  stopmotion:"For stop-motion puppetry: handmade armature look, fabric and clay textures, miniature-set charm.",
  adv1960s:"For 1960s advertising illustration: mid-century palettes, printed grain and period graphic styling.",
  claymation:"For claymation: sculpted plasticine forms, thumbprint texture and handmade animated appeal.",
  gaganime:"For 90s gag-anime: loose comedic linework, exaggerated expressions and retro TV-anime energy.",
  pixelart:"For retro pixel-art: 16/32-bit sprites, dithered shading, crisp pixels and no anti-aliasing.",
  graphicNovelNoir:"For hard-boiled monochrome: chiaroscuro ink, heavy spot blacks, screentone midtones — optionally one accent colour.",
  ukiyoe:"For Japanese woodblock prints: flat mineral pigments, calligraphic keyblock lines, washi texture and bokashi gradation.",
  paperCutout:"For handmade collage: scissor-cut paper shapes in shallow physical layers with real shadows and visible paper grain.",
  photoreal:"For human-scale characters: live-action cinematic portrait realism, believable skin, wardrobe, materials and film lighting.",
  photorealNatural:"For real-world biological realism: macro photography, believable anatomy, skin, fur, scales, wings, moisture, specimen-level detail. Minimal stylization.",
  photorealCreature:"For believable film creatures: practical effects, prosthetic, VFX maquette, creature-shop realism.",
  photorealOrnamental:"For elegant creature designs with iridescence, ornament, armor, jewelry-like forms, couture materials, or heightened beauty while staying physically rendered.",
  storyboardconcept:"For production boards and previsualization: clean linework, clear staging, mood and composition over final polish.",
  texturedcomic:"For bold contemporary comic art: expressive ink, etched texture, limited palette and dramatic graphic lighting.",
  whimsicalwatercolor:"For gentle storybook imagery: fine ink, soft watercolor washes, paper grain and delicate hand-painted charm.",
  modernAnime:"For polished contemporary anime: sharp linework, cinematic cel shadows, expressive eyes and dynamic character appeal.",
  digitalAnime:"For smooth refined anime illustration with luminous digital colour and a painterly-polished finish.",
  roughSketchAnime:"For loose production-sketch anime: visible pencil/ink energy, flat colour and immediate concept-art feel.",
  painterlyAnime:"For dreamy anime blended with soft brushwork, delicate line and atmospheric colour washes.",
  cartoon3d:"For bold stylized 3D cartoon characters with exaggerated appeal and clean animated-feature lighting.",
  textured3dCartoon:"For tactile 3D cartoon looks using felt, clay, fabric, fuzzy or knitted surface texture.",
  stylizedCartoon:"For bold 2D cartoon illustration: distinct outlines, flat colour areas and theatrical shape design.",
  grittyDigital:"For intense moody digital illustration with harsh light, expressive linework and textured contrast.",
  softPainterly:"For gentle painterly character art with visible brushwork, blended colour and dreamy warmth.",
  realisticDigitalDrawing:"For believable realistic digital drawing: detailed texture and lighting without becoming photographic.",
  flatDesign:"For modern flat-design illustration with simplified shapes, bold colour and minimal shading.",
  minimalistLine:"For elegant sparse line art, negative space and one small accent rather than full rendering.",
  vintageChildrensBook:"For nostalgic children’s-book art: ink outlines, limited colour and aged print texture.",
  tactileMixedMedia:"For handmade mixed-media miniature looks using fabric, felt, paper, paint and sculpted elements.",
  texturedPaperSculpture:"For photographed 3D paper sculptures with folds, layers, fibres and hand-cut edges.",
  texturedPaperIllustration:"For layered paper-craft / printmaking illustration with grain, stipple and collage texture.",
  tropicalArtNouveau:"For lush decorative Art Nouveau: organic lines, botanical motifs, flat ornamental elegance.",
};
window.RENDER_STYLE_DESCRIPTIONS = RENDER_STYLE_DESCRIPTIONS;
const _humanizeStyle = (k)=> String(k||"").replace(/[-_]+/g," ").replace(/([a-z])([0-9])/g,"$1 $2").replace(/\b\w/g,m=>m.toUpperCase());
const RENDER_STYLE_GROUPS = [
  { id:"Photoreal", keys:["photoreal","photorealNatural","photorealCreature","photorealOrnamental"] },
  { id:"Anime / Animation", keys:["ghibli","modernAnime","digitalAnime","roughSketchAnime","painterlyAnime","anime","gaganime"] },
  { id:"Cartoon / 3D", keys:["pixar","render3d","cartoon3d","textured3dCartoon","stylizedCartoon","animated3d"] },
  { id:"Illustration / Concept Art", keys:["paintedconcept","storyboardconcept","texturedcomic","grittyDigital","softPainterly","realisticDigitalDrawing","horror","graphicNovelNoir"] },
  { id:"Graphic / Minimal", keys:["flat","flatDesign","minimalistLine","vintageChildrensBook","pixelart","adv1960s"] },
  { id:"Handmade / Tactile", keys:["stopmotion","claymation","tactileMixedMedia","texturedPaperSculpture","texturedPaperIllustration","whimsicalwatercolor","paperCutout"] },
  { id:"Decorative / Design-led", keys:["tropicalArtNouveau","ukiyoe"] },
];
const RENDER_STYLE_GROUP_BY_KEY = {};
RENDER_STYLE_GROUPS.forEach(g=> (g.keys||[]).forEach(k=>{ RENDER_STYLE_GROUP_BY_KEY[k]=g.id; }));
window.RENDER_STYLE_GROUPS = RENDER_STYLE_GROUPS;
function _renderStyleGroupFor(k){ return RENDER_STYLE_GROUP_BY_KEY[k] || "Other styles"; }
function _styleOptionForKey(k){
  return { key:k, label: RENDER_STYLE_LABELS[k] || _humanizeStyle(k),
    desc: RENDER_STYLE_DESCRIPTIONS[k]||"", group:_renderStyleGroupFor(k) };
}
function _styleScaleClassKey(e){
  const s = String((e&&e.scaleClass)||"").toLowerCase();
  if(/\b(class\s*)?d\b|microscopic|microbe|cellular|molecular/.test(s)) return "D";
  if(/\b(class\s*)?c\b|giant|colossal|vast|monumental/.test(s)) return "C";
  if(/\b(class\s*)?b\b|critter|insect|bug|frog|fish|lizard|moth|beetle|small animal|miniature/.test(s)) return "B";
  return "A";
}
function inferCharacterRenderStyleKey(c){
  if(c && c.renderStyleKey) return c.renderStyleKey;
  const cls = _styleScaleClassKey(c);
  if(cls!=="B") return "photoreal"; // Class A/human defaults to Photoreal - Human cinematic
  const text = [c&&c.name,c&&c.role,c&&c.archetype,c&&c.identity,c&&c.physique,c&&c.wardrobe,c&&c.accessories,c&&c.look]
    .filter(Boolean).join(" ").toLowerCase();
  if(/\b(protagonist|lead|hero|main character|antagonist|villain|deuteragonist|mentor|love interest|driver)\b/.test(text)) return "photorealCreature";
  if(/\b(ornamental|ceremonial|mythic|fashion|couture|jewel|jewelled|jeweled|jewelry|jewellery|iridescent|pearlescent|filigree|armor-like|armour-like)\b/.test(text)) return "photorealOrnamental";
  if(/\b(supporting|background|extra|cameo|real animal|natural animal|wildlife|specimen)\b/.test(text)) return "photorealNatural";
  return "photorealCreature";
}
window.inferCharacterRenderStyleKey = inferCharacterRenderStyleKey;
const CHAR_RENDER_STYLE_OPTIONS = [
  ...Object.keys(CHAR_RENDER_STYLES).map(k=>_styleOptionForKey(k)),
  { key:"surprise", label:"Surprise me \u2728", group:"Custom" },   // the one synthetic option (invents a bespoke style)
];
window.CHAR_RENDER_STYLE_OPTIONS = CHAR_RENDER_STYLE_OPTIONS;

/* Resolve the render-style TEXT for a Location ('loc') or Prop ('prop') by key. A tuned per-tab
   line wins; otherwise it falls back to the style's OWN character descriptor (so a new style
   renders in-style even before per-tab text is written), then to photoreal \u2014 never silently the
   wrong style. This is what lets a newly added style work across every tab from one definition. */
window.renderStyleText = function(kind, key){
  key = key || (window.turnDefaultRenderStyleKey ? window.turnDefaultRenderStyleKey() : "photoreal");
  const map = (kind==="loc") ? (window.LOC_RENDER_TEXT||{}) : (window.PROP_RENDER_TEXT||{});
  if(map[key]) return map[key];
  const cs = (window.CHAR_RENDER_STYLES||{})[key];
  if(cs && cs.rendering) return cs.rendering.replace(/\bcharacter\b/gi, kind==="loc" ? "environment" : "object");
  return map.photoreal || "";
};

/* the resolved render block for a character: the picked preset, or an AI-invented bespoke
   block for "surprise" (stored on c.surpriseRender), falling back to photoreal. */
function charRenderBlock(c){
  const key = (typeof inferCharacterRenderStyleKey==="function") ? inferCharacterRenderStyleKey(c)
    : ((c && c.renderStyleKey) || (window.turnDefaultRenderStyleKey ? window.turnDefaultRenderStyleKey() : "photoreal"));
  if(key==="surprise" && c && c.surpriseRender && c.surpriseRender.render) return c.surpriseRender.render;
  return CHAR_RENDER_STYLES[key] || CHAR_RENDER_STYLES.photoreal;
}
window.charRenderBlock = charRenderBlock;
function renderStyleLabelForEntity(e){
  const key = (e && e.renderStyleKey) || ((typeof inferCharacterRenderStyleKey==="function") ? inferCharacterRenderStyleKey(e) : "");
  if(key==="surprise" && e && e.surpriseRender && e.surpriseRender.label) return e.surpriseRender.label;
  const opts = window.CHAR_RENDER_STYLE_OPTIONS || [];
  const clean = (lab)=> String(lab||"").replace(/^[🔒🌐]\s*/,"");
  const found = opts.find(o=>o && o.key===key);
  if(found && found.label) return clean(found.label);
  if(key && (window.RENDER_STYLE_LABELS||{})[key]) return clean(window.RENDER_STYLE_LABELS[key]);
  return "";
}
window.renderStyleLabelForEntity = renderStyleLabelForEntity;
function renderStyleLabelFromMeta(meta){
  meta = meta || {};
  const clean = (lab)=> String(lab||"").replace(/^[🔒🌐]\s*/,"");
  if(meta.renderStyleLabel) return clean(meta.renderStyleLabel);
  if(meta.renderStyleKey && (window.RENDER_STYLE_LABELS||{})[meta.renderStyleKey]) return clean(window.RENDER_STYLE_LABELS[meta.renderStyleKey]);
  // Back-compat: older generations didn't save renderStyleKey, but the prompt stores the
  // JSON render block. Match that against the built-in registry when possible.
  const prompt = String(meta.prompt||"");
  const start = prompt.indexOf("{");
  if(start>=0){
    try{
      const spec = JSON.parse(prompt.slice(start));
      if(spec && spec.style_name) return clean(spec.style_name);
      const rendering = spec && spec.render && spec.render.rendering;
      if(rendering){
        const styles = window.CHAR_RENDER_STYLES || {};
        const key = Object.keys(styles).find(k=> styles[k] && styles[k].rendering===rendering);
        if(key) return clean((window.RENDER_STYLE_LABELS||{})[key] || _humanizeStyle(key));
      }
    }catch(e){}
  }
  return "";
}
window.renderStyleLabelFromMeta = renderStyleLabelFromMeta;

/* ============================================================================
   LOCKED RENDER STYLES — two tiers (see supabase/styles.sql):
     • PERSONAL (lk_*)  — a signed-in user keeps a "Surprise me" style they like;
       PRIVATE to them, SYNCED CROSS-DEVICE via Supabase (turn_user_styles), with
       localStorage as an offline cache for instant paint / signed-out local mode.
     • GLOBAL (gl_*)    — admin-curated HOUSE styles (turn_global_styles) every
       signed-in user sees; only the admin account can publish/delete them.
   Both are injected into the SAME CHAR_RENDER_STYLES object the dropdown +
   charRenderBlock + renderStyleText read, so they "just work" like presets.
   ========================================================================== */
const LOCKED_KEY_PREFIX = "lk_";   // personal
const GLOBAL_KEY_PREFIX = "gl_";   // admin global
const BASE_RENDER_STYLE_KEYS = Object.keys(CHAR_RENDER_STYLES); // seed global presets bundled with the app
const MAX_PERSONAL_STYLES = 10;    // max PERSONAL locked styles per user
const MAX_GLOBAL_STYLES = 40;      // max TOTAL shared/global styles (seed presets + admin-published combined)
const MAX_TOTAL_STYLES = 50;       // global cap + personal cap (40 + 10)
window.turnPersonalStyleCap = MAX_PERSONAL_STYLES;
window.turnGlobalStyleCap = MAX_GLOBAL_STYLES;
window.turnTotalStyleCap = MAX_TOTAL_STYLES;
window.turnUserStyleCap = MAX_PERSONAL_STYLES;   // back-compat alias for the personal tier
let _userStyles = [];              // [{key,label,render}] personal
let _globalStyles = [];            // [{key,label,render,order}] admin-published global
let _hiddenGlobalKeys = new Set();  // admin-hidden seed globals, persisted as {__hidden:true} rows
let _baseGlobalMeta = {};           // built-in seed metadata from turn_global_styles: { [key]:{hidden,order} }
let _globalOrder = BASE_RENDER_STYLE_KEYS.slice(); // curated platform order: built-ins + admin-published globals
const _slug = (s)=> String(s||"style").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,32) || "style";
// signed-in cloud user? (Supabase configured + a session email). Independent of nbBackend.
function _cloudOn(){ return !!(window.turnUserEmail) && (typeof window.cloudConfigured==="function") && window.cloudConfigured(); }
// localStorage offline cache for the PERSONAL tier, keyed by the user's email
function _cacheStore(){ const e=(window.turnUserEmail||"").toLowerCase(); return e?("turn.lockedStyles."+e):""; }
function _readCache(){ try{ const k=_cacheStore(); if(!k) return []; const a=JSON.parse(localStorage.getItem(k)||"[]"); return Array.isArray(a)?a.filter(x=>x&&x.key&&x.render):[]; }catch(e){ return []; } }
function _writeCache(arr){ try{ const k=_cacheStore(); if(k) localStorage.setItem(k, JSON.stringify(arr||[])); }catch(e){} }
function _freshKey(prefix, label){
  let base = prefix+_slug(label), key = base, n = 2;
  const taken = new Set([...Object.keys(CHAR_RENDER_STYLES), ..._userStyles.map(s=>s.key), ..._globalStyles.map(s=>s.key)]);
  while(taken.has(key)){ key = base+"-"+(n++); }
  return key;
}
function _styleMeta(render){
  render = render || {};
  const n = Number(render.__order);
  return { hidden:!!render.__hidden, order:Number.isFinite(n) ? n : null };
}
function _stripStyleMeta(render){
  if(!render || typeof render!=="object") return render;
  const out = {};
  Object.keys(render).forEach(k=>{ if(k.indexOf("__")!==0) out[k]=render[k]; });
  return out;
}
function _renderWithMeta(render, meta){
  return { ...(_stripStyleMeta(render)||{}), ...(meta||{}) };
}
function _baseLabel(key){
  return (RENDER_STYLE_LABELS && RENDER_STYLE_LABELS[key]) || _humanizeStyle(key);
}
function _globalItemByKey(key){
  if(BASE_RENDER_STYLE_KEYS.includes(key)){
    const hidden = _hiddenGlobalKeys.has(key);
    return { key, label:_baseLabel(key), render:CHAR_RENDER_STYLES[key], builtIn:true, hidden, order:_globalOrder.indexOf(key) };
  }
  const s = _globalStyles.find(x=>x.key===key);
  return s ? { ...s, builtIn:false, hidden:false, order:_globalOrder.indexOf(key) } : null;
}
function _syncGlobalOrder(){
  const allKeys = [...BASE_RENDER_STYLE_KEYS, ..._globalStyles.map(s=>s.key)];
  const seen = new Set();
  const explicit = [];
  BASE_RENDER_STYLE_KEYS.forEach((key,i)=>{
    const m = _baseGlobalMeta[key] || {};
    explicit.push({ key, order:Number.isFinite(Number(m.order)) ? Number(m.order) : i });
  });
  _globalStyles.forEach((s,i)=>{
    explicit.push({ key:s.key, order:Number.isFinite(Number(s.order)) ? Number(s.order) : (BASE_RENDER_STYLE_KEYS.length+i) });
  });
  explicit.sort((a,b)=>a.order-b.order).forEach(x=>{ if(allKeys.includes(x.key) && !seen.has(x.key)){ seen.add(x.key); } });
  _globalOrder = [...seen];
  allKeys.forEach(k=>{ if(!_globalOrder.includes(k)) _globalOrder.push(k); });
}
function _visibleGlobalItems(){
  _syncGlobalOrder();
  return _globalOrder.map(_globalItemByKey).filter(x=>x && !x.hidden);
}
function _hiddenBuiltInItems(){
  _syncGlobalOrder();
  return BASE_RENDER_STYLE_KEYS.filter(k=>_hiddenGlobalKeys.has(k)).map(_globalItemByKey).filter(Boolean);
}
async function _persistGlobalOrder(){
  if(!window.cloudSaveGlobalStyle) return true;
  const visible = _visibleGlobalItems();
  let ok = true;
  for(let i=0;i<visible.length;i++){
    const item = visible[i];
    if(item.builtIn){
      const hidden = _hiddenGlobalKeys.has(item.key);
      const render = { __preset:true, __hidden:hidden, __order:i };
      try{ ok = (await window.cloudSaveGlobalStyle(item.key, item.label, render)) && ok; }catch(e){ ok=false; }
    }else{
      const render = _renderWithMeta(item.render, { __order:i });
      try{ ok = (await window.cloudSaveGlobalStyle(item.key, item.label, render)) && ok; }catch(e){ ok=false; }
    }
  }
  return ok;
}
/* rebuild the shared dropdown options: built-in presets → admin-curated globals → personal → Surprise.
   Built-ins and admin-curated globals are visually identical in the dropdown (no tier marker) —
   they're "one and the same thing" to users. The 🌐 marker only appears in the admin Styles manager. */
function rebuildStyleOptions(){
  const isSaved = (k)=> k.indexOf(LOCKED_KEY_PREFIX)===0 || k.indexOf(GLOBAL_KEY_PREFIX)===0;
  window.CHAR_RENDER_STYLE_OPTIONS = [
    ..._visibleGlobalItems().map(item=> item.builtIn
      ? _styleOptionForKey(item.key)
      : ({ key:item.key, label:item.label||"Style", group:item.group||"Admin global styles" })),   // no 🌐 marker — same look as built-ins
    ..._userStyles.map(s=>({ key:s.key, label:s.label||"Locked style", group:"Personal styles" })),   // personal — picker shows trash icon
    { key:"surprise", label:"Surprise me ✨", group:"Custom" },
  ];
}
function _defaultRenderStyleKey(){
  const opt = (window.CHAR_RENDER_STYLE_OPTIONS||[]).find(o=>o && o.key && o.key!=="surprise");
  return (opt && opt.key) || "photoreal";
}
window.turnDefaultRenderStyleKey = _defaultRenderStyleKey;
function _injectStyle(s, marker){ if(!s||!s.key||!s.render) return; CHAR_RENDER_STYLES[s.key]=s.render; RENDER_STYLE_LABELS[s.key]=marker+" "+(s.label||"Style"); }
// re-apply the in-memory tiers to the live registry + dropdown, then notify listeners
function _applyAll(){
  Object.keys(CHAR_RENDER_STYLES).forEach(k=>{ if(k.indexOf(LOCKED_KEY_PREFIX)===0 || k.indexOf(GLOBAL_KEY_PREFIX)===0){ delete CHAR_RENDER_STYLES[k]; delete RENDER_STYLE_LABELS[k]; } });
  _globalStyles.forEach(s=>_injectStyle(s,"🌐"));
  _userStyles.forEach(s=>_injectStyle(s,"🔒"));
  rebuildStyleOptions();
  try{ window.dispatchEvent(new CustomEvent("turn-styles-changed")); }catch(e){}
}
/* (re)load both tiers — called on sign-in (email change). Paints instantly from the
   localStorage cache, then reconciles from Supabase when signed in. */
window.turnRefreshLockedStyles = async function(){
  _userStyles = _readCache();          // instant paint (no flash)
  _applyAll();
  if(_cloudOn()){
    try{
      const [u,g] = await Promise.all([
        window.cloudListUserStyles ? window.cloudListUserStyles() : [],
        window.cloudListGlobalStyles ? window.cloudListGlobalStyles() : [],
      ]);
      _userStyles   = Array.isArray(u) ? u.filter(x=>x&&x.key&&x.render) : [];
      const globals = Array.isArray(g) ? g.filter(x=>x&&x.key&&x.render) : [];
      _baseGlobalMeta = {};
      globals.filter(x=>BASE_RENDER_STYLE_KEYS.includes(x.key)).forEach(x=>{
        const meta = _styleMeta(x.render);
        _baseGlobalMeta[x.key] = { hidden:meta.hidden, order:meta.order };
      });
      _hiddenGlobalKeys = new Set(Object.keys(_baseGlobalMeta).filter(k=>_baseGlobalMeta[k] && _baseGlobalMeta[k].hidden));
      _globalStyles = globals
        .filter(x=>!BASE_RENDER_STYLE_KEYS.includes(x.key) && !(x.render && x.render.__hidden))
        .map(x=>{ const meta=_styleMeta(x.render); return { key:x.key, label:x.label, render:_stripStyleMeta(x.render), order:meta.order }; });
      _syncGlobalOrder();
      _writeCache(_userStyles);         // refresh the offline cache
      _applyAll();
    }catch(e){}
  } else {
    _globalStyles = [];                 // global tier only exists when signed in
    _hiddenGlobalKeys = new Set();       // signed-out mode uses the bundled seed globals
    _baseGlobalMeta = {};
    _globalOrder = BASE_RENDER_STYLE_KEYS.slice();
    _applyAll();
  }
};
/* lock a surprise style → PERSONAL. Returns a Promise of its key ("" if not signed in).
   render is a full block ({rendering, rules, …}); prop/location surprises (a STRING)
   pass {rendering:<style>, rules:[…]}. Persists to cloud + cache. */
window.turnLockRenderStyle = async function(label, render){
  if(!window.turnUserEmail || !render) return "";
  const same = _userStyles.find(s=> JSON.stringify(s.render)===JSON.stringify(render));   // de-dupe by block (doesn't count against the cap)
  if(same){ _applyAll(); return same.key; }
  if(_userStyles.length >= MAX_PERSONAL_STYLES){   // personal cap reached
    if(window.appToast) window.appToast(window.turnIsAdmin
      ? "You've saved the maximum of "+MAX_PERSONAL_STYLES+" personal styles. Open “Styles” in the top bar and delete one to make room."
      : "You've saved the maximum of "+MAX_PERSONAL_STYLES+" personal styles. Select a saved style on any card and tap “unlock” to make room.");
    return "";
  }
  const key = _freshKey(LOCKED_KEY_PREFIX, label);
  const entryLabel = (typeof clipWords==="function") ? clipWords(String(label||"Locked style"),48) : String(label||"Locked style").slice(0,48);
  const entry = { key, label:entryLabel, render };
  _userStyles.push(entry); _writeCache(_userStyles); _applyAll();
  if(_cloudOn() && window.cloudSaveUserStyle){ try{ await window.cloudSaveUserStyle(key, entry.label, render); }catch(e){} }
  return key;
};
/* remove one of the user's OWN personal styles (cloud + cache) */
window.turnUnlockRenderStyle = async function(key){
  if(!key) return;
  _userStyles = _userStyles.filter(s=>s.key!==key); _writeCache(_userStyles); _applyAll();
  if(_cloudOn() && window.cloudDeleteUserStyle){ try{ await window.cloudDeleteUserStyle(key); }catch(e){} }
};
/* ADMIN: publish a style to the GLOBAL tier (everyone sees it). Returns the key, or
   "" if the cloud write was rejected (RLS blocks non-admins → local rollback). */
window.turnPublishGlobalStyle = async function(label, render){
  if(!render) return "";
  render = _stripStyleMeta(render);
  const same = _globalStyles.find(s=> JSON.stringify(s.render)===JSON.stringify(render));
  if(!same && window.turnAllGlobalStyleCount() >= MAX_GLOBAL_STYLES){   // total shared/global pool is full
    const room = MAX_GLOBAL_STYLES - window.turnBuiltInStyleCount();
    if(window.appToast) window.appToast("The global render-style set is full ("+MAX_GLOBAL_STYLES+" total, "+room+" admin-published slots). Delete a global style first.");
    return "";
  }
  const key = same ? same.key : _freshKey(GLOBAL_KEY_PREFIX, label);
  const lab = (typeof clipWords==="function") ? clipWords(String(label||"House style"),48) : String(label||"House style").slice(0,48);
  const order = same ? same.order : _visibleGlobalItems().length;
  if(!same){ _globalStyles.push({ key, label:lab, render, order }); _globalOrder.push(key); }
  _applyAll();
  if(window.cloudSaveGlobalStyle){
    try{ const ok = await window.cloudSaveGlobalStyle(key, lab, _renderWithMeta(render,{__order:order}));
      if(!ok && !same){ _globalStyles = _globalStyles.filter(s=>s.key!==key); _applyAll(); return ""; }   // RLS rejected → roll back
    }catch(e){ if(!same){ _globalStyles = _globalStyles.filter(s=>s.key!==key); _applyAll(); } return ""; }
  }
  return key;
};
/* ADMIN: delete a global style (everyone loses it) */
window.turnDeleteGlobalStyle = async function(key){
  if(!key) return;
  if(BASE_RENDER_STYLE_KEYS.includes(key)){
    const prev = new Set(_hiddenGlobalKeys);
    const prevMeta = { ..._baseGlobalMeta };
    const order = _globalOrder.indexOf(key);
    _hiddenGlobalKeys.add(key);
    _baseGlobalMeta[key] = { ...(_baseGlobalMeta[key]||{}), hidden:true, order:order>=0?order:null };
    _applyAll();
    if(window.cloudSaveGlobalStyle){
      try{
        const ok = await window.cloudSaveGlobalStyle(key, RENDER_STYLE_LABELS[key]||_humanizeStyle(key), { __preset:true, __hidden:true, __order:order>=0?order:null });
        if(!ok){ _hiddenGlobalKeys=prev; _baseGlobalMeta=prevMeta; _applyAll(); }
      }catch(e){ _hiddenGlobalKeys=prev; _baseGlobalMeta=prevMeta; _applyAll(); }
    }
    return;
  }
  const prev = _globalStyles;
  _globalStyles = _globalStyles.filter(s=>s.key!==key); _applyAll();
  if(window.cloudDeleteGlobalStyle){ try{ const ok=await window.cloudDeleteGlobalStyle(key); if(!ok){ _globalStyles=prev; _applyAll(); } }catch(e){ _globalStyles=prev; _applyAll(); } }
};
window.turnRestoreGlobalStyle = async function(key){
  if(!key || !BASE_RENDER_STYLE_KEYS.includes(key)) return false;
  if(!_hiddenGlobalKeys.has(key)) return true;
  if(window.turnAllGlobalStyleCount() >= MAX_GLOBAL_STYLES){
    if(window.appToast) window.appToast("The global render-style set is full ("+MAX_GLOBAL_STYLES+"). Delete another global style before restoring this one.");
    return false;
  }
  const prev = new Set(_hiddenGlobalKeys), prevMeta = { ..._baseGlobalMeta };
  const order = _globalOrder.indexOf(key);
  _hiddenGlobalKeys.delete(key);
  _baseGlobalMeta[key] = { ...(_baseGlobalMeta[key]||{}), hidden:false, order:order>=0?order:null };
  _applyAll();
  if(window.cloudSaveGlobalStyle){
    try{
      const ok = await window.cloudSaveGlobalStyle(key, RENDER_STYLE_LABELS[key]||_humanizeStyle(key), { __preset:true, __hidden:false, __order:order>=0?order:null });
      if(!ok){ _hiddenGlobalKeys=prev; _baseGlobalMeta=prevMeta; _applyAll(); return false; }
    }catch(e){ _hiddenGlobalKeys=prev; _baseGlobalMeta=prevMeta; _applyAll(); return false; }
  }
  return true;
};
window.turnMoveGlobalStyle = async function(key, dir){
  key = String(key||""); dir = dir<0 ? -1 : 1;
  const visible = _visibleGlobalItems();
  const idx = visible.findIndex(x=>x.key===key);
  const next = idx + dir;
  if(idx<0 || next<0 || next>=visible.length) return false;
  const reordered = visible.slice();
  const tmp = reordered[idx]; reordered[idx]=reordered[next]; reordered[next]=tmp;
  const hidden = _globalOrder.map(_globalItemByKey).filter(x=>x && x.hidden).map(x=>x.key);
  _globalOrder = [...reordered.map(x=>x.key), ...hidden.filter(k=>!reordered.some(x=>x.key===k))];
  _globalOrder.forEach((k,i)=>{
    if(BASE_RENDER_STYLE_KEYS.includes(k)) _baseGlobalMeta[k] = { ...(_baseGlobalMeta[k]||{}), order:i };
    else { const s=_globalStyles.find(x=>x.key===k); if(s) s.order=i; }
  });
  _applyAll();
  const ok = await _persistGlobalOrder();
  if(!ok && window.appToast) window.appToast("Saved locally, but couldn't persist the new render-style order yet.");
  return ok;
};
/* snapshot for the admin manager UI */
window.turnListGlobalStyles = function(){ return { visible:_visibleGlobalItems(), hidden:_hiddenBuiltInItems() }; };
window.turnListStyles = function(){ return { user:_userStyles.slice(), global:_globalStyles.slice(), globalVisible:_visibleGlobalItems(), globalHidden:_hiddenBuiltInItems() }; };
window.turnIsLockedStyle = function(key){ return !!key && (String(key).indexOf(LOCKED_KEY_PREFIX)===0 || String(key).indexOf(GLOBAL_KEY_PREFIX)===0); };
window.turnIsUserStyle   = function(key){ return !!key && String(key).indexOf(LOCKED_KEY_PREFIX)===0; };   // user can unlock these from a card
window.turnIsGlobalStyle = function(key){
  key = String(key||"");
  return !!key && (key.indexOf(GLOBAL_KEY_PREFIX)===0 || (BASE_RENDER_STYLE_KEYS.includes(key) && !_hiddenGlobalKeys.has(key)));
};
window.turnCanLockStyles = function(){ return !!window.turnUserEmail; };
window.turnUserStyleCount = function(){ return _userStyles.length; };
window.turnGlobalStyleCount = function(){ return _globalStyles.length; };   // admin-published only
// built-in presets = hardcoded non-saved CHAR_RENDER_STYLES keys
window.turnBuiltInStyleCount = function(){
  return BASE_RENDER_STYLE_KEYS.filter(k=>!_hiddenGlobalKeys.has(k)).length;
};
// total global styles visible to all users = built-ins + admin-curated (the "one and the same thing")
window.turnAllGlobalStyleCount = function(){ return window.turnBuiltInStyleCount() + _globalStyles.length; };
window.turnStyleBudgetUsed = function(){ return _userStyles.length + _globalStyles.length; };
window.turnIsStyleAdmin  = function(){ return !!window.turnIsAdmin; };
/* a tiny hook so the Sheets lists / manager re-render when styles change */
window.useRenderStyleVersion = function(){
  const [v,setV] = React.useState(0);
  React.useEffect(()=>{ const f=()=>setV(x=>x+1); window.addEventListener("turn-styles-changed",f); return ()=>window.removeEventListener("turn-styles-changed",f); },[]);
  return v;
};
// load immediately in case the email is already known by the time this module loads
window.turnRefreshLockedStyles();

/* RENDER-STYLE PICKER — a custom dropdown (native <select> can't hold buttons) so the user's
   own PERSONAL styles get an inline trash icon both inside the menu list and as a dynamic
   button that appears next to the trigger whenever a deletable style is selected.
   Admin can also remove/hide global styles (including built-in presets) the same way.
   The menu is rendered through a PORTAL with position:fixed.
   The trigger is a FIXED width so the row never reflows when the selected style name changes. */
function RenderStylePicker({ value, onPick, disabled, placeholderLabel }){
  if(window.useRenderStyleVersion) window.useRenderStyleVersion();   // re-render when styles change
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = React.useState({});
  const [pos, setPos] = React.useState(null);
  const triggerRef = React.useRef(null), menuRef = React.useRef(null);
  const place = ()=>{ const t=triggerRef.current; if(!t) return; const r=t.getBoundingClientRect(); setPos({ top:r.bottom+4, left:r.left, width:r.width }); };
  React.useEffect(()=>{
    if(!open) return;
    const onDoc=(e)=>{ if((menuRef.current&&menuRef.current.contains(e.target))||(triggerRef.current&&triggerRef.current.contains(e.target))) return; setOpen(false); };
    const onKey=(e)=>{ if(e.key==="Escape") setOpen(false); };
    const reflow=(e)=>{
      // The menu itself scrolls. Don't treat that as page movement or the dropdown closes
      // the moment a user tries to scroll through a long render-style list.
      if(menuRef.current && e && e.target && menuRef.current.contains(e.target)) return;
      place();
    };
    document.addEventListener("mousedown",onDoc); document.addEventListener("keydown",onKey);
    window.addEventListener("scroll",reflow,true); window.addEventListener("resize",reflow);
    return ()=>{ document.removeEventListener("mousedown",onDoc); document.removeEventListener("keydown",onKey); window.removeEventListener("scroll",reflow,true); window.removeEventListener("resize",reflow); };
  },[open]);
  const opts = window.CHAR_RENDER_STYLE_OPTIONS||[];
  const clean = (lab)=> String(lab||"").replace(/^[🔒🌐]\s*/,"");
  const isPlaceholder = (value==="" || value==null) && !!placeholderLabel;
  const cur = isPlaceholder
    ? { key:"", label:placeholderLabel, desc:"Choose one render style to apply to all items.", group:"" }
    : (opts.find(o=>o.key===value) || opts[0] || { key:"photoreal", label:"Photoreal - Human cinematic", desc:(window.RENDER_STYLE_DESCRIPTIONS||{}).photoreal||"" });
  React.useEffect(()=>{
    if(!open) return;
    const g = cur.group || "Other styles";
    setExpanded(prev=> Object.keys(prev).length ? { ...prev, [g]:true } : { [g]:true });
  },[open, cur.group]);
  const toggle = ()=>{ if(disabled) return; if(open){ setOpen(false); } else { place(); setOpen(true); } };
  const pick = (key)=>{ setOpen(false); if(onPick) onPick(key); };
  const del = async (e, key, isGlobal)=>{ e.stopPropagation();
    const lab = clean((opts.find(o=>o.key===key)||{}).label);
    const fallback = (opts.find(o=>o.key!==key && o.key!=="surprise") || opts.find(o=>o.key!==key) || { key:"photoreal" }).key;
    if(window.appConfirm && !(await window.appConfirm({ title: isGlobal?"Delete this global style?":"Delete your saved style?",
      body: isGlobal?("Every signed-in user loses \""+lab+"\"."):("Removes \""+lab+"\" from your saved styles.") }))) return;
    if(isGlobal){ if(window.turnDeleteGlobalStyle) await window.turnDeleteGlobalStyle(key); }
    else { if(window.turnUnlockRenderStyle) await window.turnUnlockRenderStyle(key); }
    if(key===value && onPick) onPick(fallback);
  };
  // which styles can the current user delete from the inline button?
  const selIsUser   = !!(window.turnIsUserStyle   && window.turnIsUserStyle(value));
  const selIsGlAdm  = !!(window.turnIsGlobalStyle && window.turnIsGlobalStyle(value) && window.turnIsStyleAdmin && window.turnIsStyleAdmin());
  const canDelSelected = selIsUser || selIsGlAdm;
  const groups = [];
  const byGroup = {};
  opts.forEach(o=>{
    const g = o.group || "Other styles";
    if(!byGroup[g]){ byGroup[g]=[]; groups.push(g); }
    byGroup[g].push(o);
  });
  // ACCORDION: opening a group closes the others — keeps the menu's height modest
  // and near-constant instead of ballooning as groups stack open
  const toggleGroup = (e,g)=>{ e.stopPropagation(); setExpanded(prev=> prev[g] ? {} : { [g]:true }); };
  const menu = (open && pos && window.ReactDOM && window.ReactDOM.createPortal) ? window.ReactDOM.createPortal(
    React.createElement("div",{className:"rs-menu",ref:menuRef,style:{ position:"fixed", top:pos.top+"px", left:pos.left+"px", minWidth:pos.width+"px" }},
      groups.map(g=>{
        const list = byGroup[g] || [];
        const isOpen = !!expanded[g];
        const selectedInGroup = list.some(o=>o.key===value);
        return React.createElement("div",{key:g,className:"rs-group"+(isOpen?" open":"")+(selectedInGroup?" has-sel":"")},
          React.createElement("button",{type:"button",className:"rs-group-head",onClick:(e)=>toggleGroup(e,g),title:(isOpen?"Collapse ":"Expand ")+g},
            React.createElement("span",{className:"rs-group-caret"},isOpen?"▾":"▸"),
            React.createElement("span",{className:"rs-group-lab"},g),
            React.createElement("span",{className:"rs-group-count"},list.length)),
          isOpen && React.createElement("div",{className:"rs-group-body"},
            list.map(o=>{
              const isUser = window.turnIsUserStyle && window.turnIsUserStyle(o.key);
              const isGlobalAdmin = window.turnIsGlobalStyle && window.turnIsGlobalStyle(o.key) && window.turnIsStyleAdmin && window.turnIsStyleAdmin();
              const canDel = isUser || isGlobalAdmin;
              return React.createElement("div",{ key:o.key, className:"rs-opt"+(o.key===value?" sel":""), title:o.desc||clean(o.label), onClick:()=>pick(o.key) },
                React.createElement("span",{className:"rs-opt-lab"}, clean(o.label)),
                canDel && React.createElement("button",{ type:"button", className:"rs-opt-del",
                  title: isGlobalAdmin?"Delete this global style (admin)":"Delete this saved style",
                  onClick:(e)=>del(e,o.key,isGlobalAdmin) },
                  React.createElement((Icon.trash||Icon.x),{s:12})));
            })));
      })), document.body) : null;
  return React.createElement("div",{className:"rs-picker"+(open?" open":"")},
    React.createElement("button",{ type:"button", className:"rs-trigger", ref:triggerRef, disabled:!!disabled, onClick:toggle },
      React.createElement("span",{className:"rs-trigger-lab"}, clean(cur.label)),
      React.createElement("span",{className:"rs-caret"}, "▾")),
    // (the inline trash beside the trigger was removed by user decision 2026-07-06 —
    // deleting a style still works from the dropdown's per-option delete and the
    // Styles manager in the top bar; the card-level icon read as clutter)
    menu);
}
window.RenderStylePicker = RenderStylePicker;

/* JSON character spec (the director's concept-art template as a key:value spec).
   LAYOUT: a casting-reference sheet — one large hero face portrait on the left, then
   three full-body views (front, three-quarter front, back) in vertical panels.
   Clean studio sweep, NO text baked in. Render style, worn props, height/scale and the
   16:9 aspect are all wired in below so the sheet stays consistent with the rest of the app. The
   `physique` object and `wardrobe` block are the continuity database fields the rest
   of the pipeline matches on (shot prompts, prop worn_by links). Inherited from the
   Story: role + conscious desire, the script-drafted physique, bodyRationale, wardrobe
   + accessories (continuity canon), height/scale, genre/period tone. NOTE
   "true-to-design anatomy", not "real human proportions" \u2014 the cast includes
   non-humans, and humanizing them is exactly the drift to avoid. */
function buildCharRefPrompt(c, project, props){
  const P = project || {};
  const v = charVisualDefaults(c);
  const clean = (x)=>String(x||"").replace(/\.$/,"").trim();
  const body = vfield(c,"coreBody","look");
  const texture = c.materialTexture || "natural skin pore texture, subsurface scattering, high detail";
  const mask = vfield(c,"wardrobeMask","wardrobe");
  const acc = (c.accessories && !/^none$/i.test(c.accessories.trim())) ? clean(c.accessories) : "";
  // WORN PROPS baked into the TEXT: fold every worn prop this character owns (with its
  // form & material from the prop card) into the accessories, so the sheet renders the
  // character WEARING them from the first generation — no separate prop image needed.
  const _norm = (s)=> String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  const worn = (props||[]).filter(p=> p && p.ownerId===c.id && p.kind!=="carried" && clean(p.name));
  const propDesc = (p)=>{ const tail=[clean(p.form), clean(p.material)].filter(Boolean).join(", ");
    return clean(p.name) + (tail ? (" ("+tail+")") : ""); };
  const wornDescs = worn.map(propDesc).filter(Boolean);
  const wornKeys = new Set(worn.map(p=>_norm(p.name)));
  // CARRIED prop names never render on the neutral sheet (hands stay empty; they attach
  // at the SHOT level) — even when one was typed into the Accessories text by mistake
  const carriedKeys = new Set((props||[]).filter(p=>p && p.ownerId===c.id && p.kind==="carried").map(p=>_norm(p.name)));
  // any accessories-text items NOT already covered by a worn-prop card (so nothing is lost)
  const accExtra = (typeof splitListItems==="function" ? splitListItems(acc) : (acc?[acc]:[]))
    .filter(it=> it && !wornKeys.has(_norm(it)) && !carriedKeys.has(_norm(it)));
  const accAll = [...wornDescs, ...accExtra];
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  const F = c.physique || {};
  const phys = {
    apparent_age: clean(F.age)||undefined, ethnicity: clean(F.ethnicity)||undefined,
    skin: clean(F.skin)||undefined, eyes: clean(F.eyes)||undefined, hair: clean(F.hair)||undefined,
    face: clean(F.face)||undefined, build: clean(F.build)||undefined,
    // explicit limbs keep image models from defaulting underspecified legs to high
    // heels and underspecified hands to generic-human
    arms_hands: clean(F.arms)||undefined,
    legs_feet_footwear: clean(F.legs)||undefined,
  };
  const hasPhys = Object.values(phys).some(Boolean);
  // ONE constraints list: fold the character's exclusions INTO the render rules, so there's no
  // separate negative prompt (rules and the old negative were doing the same job).
  const _rb = charRenderBlock(c);
  const _noTextRule = "no text, labels, rulers, measurement marks, numbers, captions, watermarks, logos, annotations, UI elements or typography anywhere on the sheet";
  const _rulesBase = (_rb.rules||[]).map(r=> /no text/i.test(r) ? _noTextRule : r);
  const _negItems = String(c.negativePrompt || v.negativePrompt || "").split(/,\s*/).map(x=>x.replace(/\.$/,"").trim()).filter(Boolean);
  const _rules = _negItems.length ? [ ..._rulesBase, "strictly avoid: "+_negItems.join(", ") ] : _rulesBase;
  // HELD MOBILITY / SIGNATURE SUPPORT ITEM (cane-class): if the spec's own text
  // describes one, it must be IN HAND on the sheet — the hardcoded "both hands
  // empty" used to contradict it and the generator obeyed the explicit hands
  // field (the Winston Palmer no-cane QA case). Detection reads only what the
  // spec already says, so nothing is ever invented.
  const _HELD_RX = /\b(cane|walking stick|walking-stick|crutch(?:es)?|staff|walker|zimmer frame|walking frame)\b/i;
  const _heldSrc = [accAll.join("; "), clean(mask), clean(body), clean(F.build), clean(F.arms)].filter(Boolean).join(" · ");
  const _heldM = _heldSrc.match(_HELD_RX);
  let _heldItem = "";
  if(_heldM){
    const kw = _heldM[0].toLowerCase();
    const fromList = accAll.find(it=> String(it).toLowerCase().indexOf(kw)>=0);
    _heldItem = fromList ? String(fromList).split("(")[0].trim() : _heldM[0];
  }
  const spec = {
    task: "character casting reference sheet",
    character: {
      name: c.name||"Character",
      role: c.role||undefined,
      wants: clean(c.conscious)||undefined,
      physique: hasPhys ? phys : undefined,
      description: (!hasPhys && body) ? clean(body) : undefined,
      why_this_look: clean(c.bodyRationale)||undefined,
      height: v.height, scale: v.scaleClass,
      skin_surface_texture: clean(texture),
      tone: tone||undefined,
    },
    wardrobe: {
      wearing: clean(mask)||undefined,
      accessories: accAll.length ? accAll.join("; ") : undefined,
      hands: _heldItem
        ? ("one hand closed around the "+_heldItem+" with weight settled naturally onto it — in EVERY full-body view; the other hand empty and relaxed at side")
        : "both hands empty and relaxed at sides",
    },
    layout: {
      format: "a 3-panel casting reference sheet in 16:9 landscape: three tall vertical panels divided by thin clean vertical lines; the first panel is wider and contains a large hero portrait, the other two panels contain full-body views; the SAME character throughout",
      panels_left_to_right: [
        "PANEL 1 — large close-up hero FACE PORTRAIT, front-facing, neutral controlled expression, shoulders/chest crop, face fills most of the panel, exact identity anchor",
        "PANEL 2 — full-body FRONT view at EXACTLY the same figure height, scale and vertical alignment as the BACK view in panel 3 (same headroom, feet on the same line) — but the head is NOT rendered: above the collar there is only clean empty background; the figure begins at the neckline; body facing camera, "+(_heldItem?("one hand on the "+_heldItem+", the other relaxed at side"):"arms relaxed at sides")+", clean silhouette",
        "PANEL 3 — full-body BACK view, head-to-toe, facing away (hair/back of head visible, no face), same wardrobe and proportions"
      ],
      one_face_rule: "EXACTLY ONE face appears on this sheet — the hero portrait in panel 1. The front panel's head is omitted BY DESIGN (blank background above the collar, figure scale unchanged): a second rendered face causes downstream video generators to blend or hallucinate identity.",
      scale_rule: "the front and back figures are the SAME height and scale, vertically aligned across panels 2 and 3 — the missing head must NOT enlarge the front figure",
      no_extra_views: "do not add side/profile or three-quarter views, expression rows, inset detail shots, rulers, captions, labels, title text, measurement text, or ANY info box / character-data panel (no name, height, age or traits printed on the image — that metadata travels in the prompt, never baked into pixels)",
      background: "solid warm off-white or light-grey studio sweep, even and clean across all three panels"
    },
    continuity: {
      identity_rule: "the SAME identical face, build and identity in every view",
      anatomy: "true-to-design anatomy and proportions \u2014 never humanize a non-human design",
    },
    render: { ..._rb, rules: _rules, aspect: "16:9" },
    style_name: ((c.renderStyleKey==="surprise" && c.surpriseRender && c.surpriseRender.label)
      ? c.surpriseRender.label
      : ((window.RENDER_STYLE_LABELS||{})[(typeof inferCharacterRenderStyleKey==="function"?inferCharacterRenderStyleKey(c):(c.renderStyleKey||"photoreal"))] || undefined)),
  };
  return "Render this character casting reference sheet EXACTLY as specified by this JSON spec (continuity fields are binding):\n"+JSON.stringify(spec, null, 1);
}
window.buildCharRefPrompt = buildCharRefPrompt;

/* has this character's descriptive (model-drafted) visual layer been filled? */
function charVisualsDrafted(c){
  return !!((vfield(c,"coreBody","look")||"").trim() && (vfield(c,"wardrobeMask","wardrobe")||"").trim());
}
window.charVisualsDrafted = charVisualsDrafted;

/* prompt for image-to-image generation from a dropped reference photo.
   Unlike the master text prompt this one explicitly instructs the model to
   reproduce the face/build it sees in the reference image faithfully. */
function buildRefFromPhotoPrompt(c, project){
  const P = project || {};
  const v = charVisualDefaults(c);
  const mask = ((c.wardrobeMask||c.wardrobe)||"").replace(/\.$/,"").trim();
  const acc = (c.accessories && !/^none$/i.test(c.accessories.trim()))
    ? (", accessories: "+c.accessories.replace(/\.$/,"")) : "";
  const style = c.renderStyle || "photoreal cinematic, 35mm, natural film grain, shallow depth of field";
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  let s = "Master character design reference sheet \u2014 "+(c.name||"Character")+". ";
  s += "BASE APPEARANCE: match EXACTLY the face, hair colour & style, skin tone, and physical build ";
  s += "as shown in the reference photo. Do not alter or idealise the subject's appearance. ";
  if(c.role) s += "Role: "+c.role+". ";
  s += mask ? ("Wearing "+mask.replace(/\.$/,"")+acc+". ") : "";
  if(tone) s += tone+" tone. ";
  s += "Character is "+v.height+" tall ("+v.scaleClass+"). ";
  s += "RENDER STYLE: "+style.replace(/\.$/,"")+". ";
  s += "LAYOUT: a clean 3-panel casting reference sheet in 16:9 landscape with three tall vertical panels divided by thin clean vertical lines. Panel 1 is wider: a large close-up hero FACE PORTRAIT, front-facing, neutral controlled expression, shoulders/chest crop, face fills most of the panel. Panel 2: full-body FRONT view at exactly the same figure height and scale as Panel 3 (same headroom, feet aligned), but with NO head rendered — clean empty background above the collar, the figure beginning at the neckline; arms relaxed. Panel 3: full-body BACK view, head-to-toe, facing away (no face visible). EXACTLY ONE face on the sheet — the panel-1 portrait; the missing head must not enlarge the front figure. No text, captions or info boxes anywhere on the image. ";
  s += "Do NOT add side/profile views, expression rows, inset detail shots, rulers, captions, labels, title text, measurement text, annotations or watermarks. Solid warm off-white or light-grey studio background, soft even studio lighting, the SAME identical face/build/wardrobe in every panel, sharp focus.";
  return s;
}
window.buildRefFromPhotoPrompt = buildRefFromPhotoPrompt;

/* Detect resolution tier + aspect from an uploaded image's real pixels — for sheets
   the user generated OUTSIDE the app (e.g. GPT Image 2 in ChatGPT) and imported, so
   we know neither up front. Quality (low/med/high) is a generation-time encoder
   setting and CANNOT be recovered from a finished image, so it's left unknown. */
function nbResLabel(w,h){ const lng=Math.max(w||0,h||0); if(!lng) return "—";
  const tier = lng<=1280 ? "1K" : (lng<=2600 ? "2K" : "4K"); return tier+" · "+w+"×"+h; }
function nbAspectLabel(w,h){ if(!w||!h) return "—"; const r=w/h;
  const known=[["21:9",21/9],["16:9",16/9],["3:2",3/2],["4:3",4/3],["1:1",1],["4:5",4/5],["3:4",3/4],["2:3",2/3],["9:16",9/16]];
  let best=known[0],bd=1e9; for(const k of known){ const d=Math.abs(k[1]-r); if(d<bd){ bd=d; best=k; } }
  if(bd/best[1] < 0.06) return best[0];
  const g=(a,b)=>b?g(b,a%b):a; const d=g(w,h)||1; return (w/d)+":"+(h/d); }

/* Cancel an in-flight generation by entity id. Aborts the network request (where the
   transport supports it — the direct Google fetch does; the Supabase proxy may still
   finish server-side), flags the run as cancelled so its result is DISCARDED rather than
   committed, clears the inflight marker, and fires "nb-gen-cancel" so the owning card
   drops its spinner immediately. The matching useImageGen checks __nbGenCancel before it
   commits, so a late-resolving request never overwrites the frame. */
if(typeof window.nbCancelGen!=="function"){
  window.nbCancelGen = function(gid){
    if(!gid) return;
    window.__nbGenCancel = window.__nbGenCancel || {};
    window.__nbGenCancel[gid] = true;
    if(window.__nbGenAbort && window.__nbGenAbort[gid]){ try{ window.__nbGenAbort[gid].abort(); }catch(e){} }
    if(window.__nbGenInflight) window.__nbGenInflight[gid] = false;
    try{ window.dispatchEvent(new CustomEvent("nb-gen-cancel",{ detail:{ id:gid } })); }catch(e){}
  };
}

/* ============================================================
   useImageGen — shared Nano Banana generation engine for any
   "sheet" entity (characters, props, …). Owns image state, the
   reference-photo slot watcher, edit mode, auto-retry, grounding,
   and tiered persistence. Parameterized by prompt builders so the
   same machinery drives every kind of reference sheet.
   ============================================================ */
function useImageGen(opts){
  const { id, slotId } = opts;
  // module-level registry of in-flight generations, so a generation survives the
  // owning card unmounting (e.g. switching Art Room tabs mid-generate). A remounted
  // card reads this to restore the spinner, and a global "nb-gen-done" event lets it
  // adopt the committed result even though the original card instance is gone.
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  const allModels = window.NB_MODELS || [];
  const [genUrl, setGenUrl] = React.useState(()=> (typeof nbGetImage==="function") ? nbGetImage(id) : "");
  const [genMeta, setGenMeta] = React.useState(()=> (typeof nbGetMeta==="function") ? nbGetMeta(id) : null);
  const [genTier, setGenTier] = React.useState("local");
  const [gening, setGening] = React.useState(()=> !!(window.__nbGenInflight && window.__nbGenInflight[id]));
  const [genErr, setGenErr] = React.useState("");
  const [retrying, setRetrying] = React.useState(false);
  const [slotHasRef, setSlotHasRef] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [editText, setEditText] = React.useState("");
  const [layers, setLayers] = React.useState(0);   // count of prior versions (edit layers) you can revert to

  const genUrlRef = React.useRef(genUrl); genUrlRef.current = genUrl;

  const refreshLayers = React.useCallback(async ()=>{
    if(typeof nbGetHistory!=="function"){ return; }
    try{ const h = await nbGetHistory(id); setLayers((h&&h.length)||0); }catch(e){ setLayers(0); }
  },[id]);
  React.useEffect(()=>{ refreshLayers(); },[refreshLayers, genUrl]);

  /* hydrate from IndexedDB / cloud on mount (large sheets live there, not localStorage) */
  React.useEffect(()=>{
    let alive = true;
    if(!genUrl && typeof nbLoadImage==="function"){
      nbLoadImage(id).then(u=>{ if(alive && u){ setGenUrl(u); if(typeof nbGetMeta==="function") setGenMeta(nbGetMeta(id)); setGenTier("idb"); } });
    }
    // a background prefetch may warm this id's url AFTER we mounted empty — adopt it
    const onPrefetched = (e)=>{
      if(!alive || genUrlRef.current || !e.detail || !e.detail.ids || e.detail.ids.indexOf(id)<0) return;
      const u = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
      if(u){ setGenUrl(u); if(typeof nbGetMeta==="function") setGenMeta(nbGetMeta(id)); setGenTier("idb"); }
    };
    window.addEventListener("nb-prefetched", onPrefetched);
    // if a generation for THIS id is in flight (started before this mount, e.g. a tab
    // switch), reflect the spinner; and listen for its completion to adopt the result.
    if(window.__nbGenInflight && window.__nbGenInflight[id]) setGening(true);
    const onDone = (e)=>{
      if(!alive || !e.detail || e.detail.id!==id) return;
      setGening(false); setRetrying(false);
      const u = e.detail.url;
      if(u){ setGenUrl(u); if(typeof nbGetMeta==="function") setGenMeta(nbGetMeta(id)); setGenTier("idb"); }
      else if(typeof nbLoadImage==="function"){ nbLoadImage(id).then(x=>{ if(alive && x){ setGenUrl(x); setGenTier("idb"); } }); }
    };
    window.addEventListener("nb-gen-done", onDone);
    // user cancelled this id's generation elsewhere (chain Stop / per-card Stop): drop the
    // spinner now; the in-flight generate() sees __nbGenCancel and won't commit its result.
    const onCancel = (e)=>{ if(!alive || !e.detail || e.detail.id!==id) return; setGening(false); setRetrying(false); };
    window.addEventListener("nb-gen-cancel", onCancel);
    return ()=>{ alive=false; window.removeEventListener("nb-gen-done", onDone); window.removeEventListener("nb-prefetched", onPrefetched); window.removeEventListener("nb-gen-cancel", onCancel); };
  },[id]);

  /* watch the reference-photo slot for drops */
  React.useEffect(()=>{
    const check = ()=>{ const url=typeof nbGetSlotImage==="function"?nbGetSlotImage(slotId):null; setSlotHasRef(!!url); };
    check();
    const el = document.getElementById(slotId);
    if(!el) return;
    const mo = new MutationObserver(check);
    mo.observe(el,{attributes:true,attributeFilter:["data-filled"]});
    return ()=>mo.disconnect();
  },[slotId]);

  const generate = async (gopts)=>{
    gopts = gopts || {};
    if(gening) return;
    if(typeof nbHasKeyForCurrent==="function" && !nbHasKeyForCurrent()){
      setGenErr("Image generation runs through fal.ai on your server. Sign in and make sure the image proxy is enabled.");
      return;
    }
    /* Mark this entity busy UP FRONT — before the optional pre-generate gate — and in
       the module-level inflight registry, not just local state. This makes a
       multi-step pre-step (e.g. generating linked props first, which can take a while)
       survive the card unmounting/remounting on an Art Room tab switch: a remounted
       card reads __nbGenInflight and shows the spinner throughout, and adopts the
       result via the "nb-gen-done" event. */
    setGenErr(""); setGening(true); setRetrying(false);
    window.__nbGenInflight[id] = true;
    // cancellation: clear any stale flag, and register an AbortController so a Stop can
    // both kill the request (where supported) and have us DISCARD a late result.
    window.__nbGenCancel = window.__nbGenCancel || {};
    window.__nbGenCancel[id] = false;
    const abortCtl = (typeof AbortController!=="undefined") ? new AbortController() : null;
    if(abortCtl){ window.__nbGenAbort = window.__nbGenAbort || {}; window.__nbGenAbort[id] = abortCtl; }
    /* optional pre-generate gate (e.g. warn + optionally generate linked props first).
       Skipped for batch runs, in-place edits, and the simplified retry — those
       shouldn't pop a modal (a batch would pop one per card). */
    if(typeof opts.beforeGenerate==="function" && !(gopts.batch||gopts.editInstruction||gopts.simple)){
      let proceed=true;
      try{ proceed = await opts.beforeGenerate(gopts); }catch(e){ proceed=true; }
      if(proceed===false){ setGening(false); window.__nbGenInflight[id] = false; return; }
    }
    let committedUrl = "";
    const overrideModel = gopts.model || null;
    const usedModel = overrideModel || (typeof nbGetModel==="function" ? nbGetModel() : "");
    /* a model chosen via a fallback button ("Try <model>" / "Switch to <model>"
       after a failed generation) becomes the ACTIVE selection, so the model picker
       highlight, mobile summary, and key bar all reflect the switch. */
    if(overrideModel && typeof nbSetModel==="function"
       && (typeof nbGetModel!=="function" || nbGetModel()!==overrideModel)){
      nbSetModel(overrideModel);
      try{ window.dispatchEvent(new CustomEvent("nb-model-changed")); }catch(_){}
    }
    const isEditMode = !!(gopts.editInstruction && genUrl);
    const useSimple = !!gopts.simple;

    /* reference image: existing sheet (edit) or dropped reference art.
       Cameo (locked likeness) sits at the end of the priority chain — an
       explicit drop or a base sheet still wins, but otherwise the cameo
       face becomes the primary reference so identity stays locked. */
    let refImage = null;
    let mode = "final";
    let cameoUrl = "";
    let cameoAngles = [];
    if(opts.cameoId && typeof nbLoadCameoAngles==="function"){
      try{ cameoAngles = (nbGetCameoAngles&&nbGetCameoAngles(opts.cameoId))||[]; }catch(e){}
      if(!cameoAngles.length){ try{ cameoAngles = await nbLoadCameoAngles(opts.cameoId); }catch(e){} }
      cameoUrl = cameoAngles[0] || "";
    } else if(opts.cameoId && typeof nbGetCameo==="function"){
      cameoUrl = nbGetCameo(opts.cameoId);
      if(!cameoUrl && typeof nbLoadCameo==="function"){ try{ cameoUrl = await nbLoadCameo(opts.cameoId); }catch(e){} }
      cameoAngles = cameoUrl ? [cameoUrl] : [];
    }
    if(isEditMode){ refImage = gopts.editBaseUrl || genUrl; mode = "edit"; }
    else if(useSimple){ mode = "simple"; }
    else if(slotHasRef && typeof nbGetSlotImage==="function"){ refImage = nbGetSlotImage(slotId); mode = "photo"; }
    else if(opts.referenceFallback){ const b = await opts.referenceFallback(gopts); if(b){ refImage = b; mode = "base"; } }
    else if(cameoUrl){ refImage = cameoUrl; mode = "cameo"; }

    /* prompt: edit | simplified fallback | from-photo/cameo | from-base | master */
    let genPrompt;
    if(mode==="edit") genPrompt = opts.buildEdit ? opts.buildEdit(gopts.editInstruction) : gopts.editInstruction;
    else if(mode==="simple") genPrompt = opts.buildSimple ? opts.buildSimple() : opts.buildFinal();
    else if(mode==="photo"||mode==="cameo") genPrompt = opts.buildFromPhoto ? opts.buildFromPhoto() : opts.buildFinal();
    else if(mode==="base") genPrompt = opts.buildFromBase ? opts.buildFromBase() : opts.buildFinal();
    else genPrompt = opts.buildFinal();

    /* grounding (Nano Banana 2 only) */
    const groundEnabled = typeof nbGetGroundSearch==="function" && nbGetGroundSearch();
    const isFlash = usedModel === "gemini-3.1-flash-image";
    const genOpts = { metaOut:{} };
    if(abortCtl) genOpts.signal = abortCtl.signal;
    if(overrideModel) genOpts.model = overrideModel;
    if(gopts.aspectRatio) genOpts.aspectRatio = gopts.aspectRatio;   // caller can force aspect…
    if(gopts.imageSize)   genOpts.imageSize   = gopts.imageSize;     // …and resolution (e.g. storyboard: 16:9 / 2K)
    if(gopts.quality)     genOpts.quality     = gopts.quality;       // …and GPT Image 2 quality (low/medium/high — lower = far faster, dodges the proxy timeout)
    else if(opts.quality) genOpts.quality     = opts.quality;        // per-surface reliability default (callers can still override it)
    if(gopts.referenceMaxDim) genOpts.referenceMaxDim = gopts.referenceMaxDim;
    else if(opts.referenceMaxDim) genOpts.referenceMaxDim = opts.referenceMaxDim;
    if(refImage) genOpts.referenceImage = refImage;
    // an EDIT re-renders FROM this very frame — send the base at full working
    // fidelity (identity sheets keep the smaller cap); 640px bases were visibly
    // softening edited frames
    if(isEditMode) genOpts.baseMaxDim = 1536;
    // Lite has no documented search-grounding support — never attach the tool to it
    if(groundEnabled && usedModel!=="gemini-3.1-flash-lite-image"){ genOpts.groundSearch = true; if(isFlash) genOpts.groundImageSearch = true; }

    /* attachments: extra reference images (e.g. generated prop sheets the character
       carries) so the model SEES the object, not just its name. Resolved async. */
    let attachCount = 0;
    let attachList = [];
    if(opts.attachments && mode!=="simple"){
      let attach = [];
      try{ attach = (await opts.attachments(gopts, mode)) || []; }catch(e){ attach = []; }
      attach = attach.filter(a=>a && a.url);
      if(attach.length){
        attachList = attach;
        genOpts.extraImages = attach.map(a=>a.url);
        attachCount = attach.length;
        const notes = attach.map(a=>a.note).filter(Boolean).join(", ");
        if(typeof opts.attachmentsText==="function"){
          const extra = opts.attachmentsText(attach);   // caller supplies the reference sentence
          if(extra) genPrompt += " "+extra;
        } else {
        genPrompt += " The additional reference image"+(attach.length>1?"s":"")+" provided show"
          +(attach.length>1?"":"s")+" item"+(attach.length>1?"s":"")+" this character carries or wears"
          +(notes?(": "+notes):"")+". Render the character WITH "+(attach.length>1?"these exact items":"this exact item")
          +", matching the reference design"+(attach.length>1?"s":"")+" faithfully.";
        }
      }
    }

    /* targeted edit references (e.g. "Update prop" chips): specific sheets attached
       to THIS edit only — the instruction text names what to match. */
    if(isEditMode && Array.isArray(gopts.editRefImages) && gopts.editRefImages.length){
      genOpts.extraImages = (genOpts.extraImages||[]).concat(gopts.editRefImages);
    }

    /* cameo face-lock: attach EVERY captured angle so the model has the most
       to anchor identity to. For a base sheet driving a state variant the
       angles ride along as extra references (the base sheet alone can drift). */
    let cameoUsed = (mode==="cameo");
    if(mode==="cameo" && cameoAngles.length>1){
      /* primary angle is the reference image; the rest are extra views */
      genOpts.extraImages = (genOpts.extraImages||[]).concat(cameoAngles.slice(1));
      genPrompt += " Additional reference images show the SAME person from other angles \u2014"
        + " use them to keep the face identical across views.";
    }
    if(cameoAngles.length && mode==="base"){
      genOpts.extraImages = (genOpts.extraImages||[]).concat(cameoAngles);
      genPrompt += " The additional reference image"+(cameoAngles.length>1?"s show":" shows")
        + " the character's locked facial likeness (a cameo"+(cameoAngles.length>1?", multiple angles":"")+")."
        + " Keep the FACE, bone structure and skin tone identical to this likeness; only the wardrobe,"
        + " styling or condition should change as described.";
      cameoUsed = true;
    }

    /* collect the reference images actually used, for the details view.
       PRIVACY: the cameo face is biometric + local-only. Never persist its
       image into cloud-stored refs (that would upload it); keep meta.cameo
       so the badge still shows. In local mode it's fine to keep for Details. */
    const isCloud = (typeof nbBackend==="function" && nbBackend()==="cloud");
    const refLabel = mode==="edit" ? "Previous sheet (edited)" : (mode==="photo"||mode==="cameo") ? (mode==="cameo"?"Cameo likeness":"Reference photo")
      : mode==="base" ? "Base sheet" : null;
    const refsUsed = [];
    if(refImage && refLabel && !(mode==="cameo" && isCloud)) refsUsed.push({ kind:mode, label:refLabel, url:refImage });
    attachList.forEach(a=>refsUsed.push({ kind:a.kind||"prop", label:a.note||"Reference image", url:a.url, refId:a.refId }));
    // user-attached edit inputs (the "+" menu: uploads and prop sheets, incl. carried)
    // — recorded so Details › "Reference images used" tells the whole story of an edit
    if(isEditMode && Array.isArray(gopts.editRefMeta)){
      gopts.editRefMeta.forEach(r=>{ if(r && r.url && !refsUsed.some(x=>x.url===r.url))
        refsUsed.push({ kind:"edit-input", label:r.note||"Edit input image", url:r.url, refId:r.refId }); });
    }
    if(cameoUrl && mode==="base" && !isCloud) refsUsed.push({ kind:"cameo", label:"Cameo likeness", url:cameoUrl });

    let actualModel = usedModel;     // may change if we fall back to another provider below
    let policyFellBack = "";
    try{
      let url;
      try{
        url = await nbGenerate(genPrompt, genOpts);
      }catch(e){
        const emsg = (e && e.message) || "";
        const isPolicy = /content polic|violat|safety system|safety filter|moderation|flagged|not allowed|rejected by/i.test(emsg);
        if(!useSimple && !isEditMode && /no image/i.test(emsg) && opts.buildSimple){
          setRetrying(true);
          url = await nbGenerate(opts.buildSimple(), genOpts);
        } else if(isPolicy && typeof isGptImageModel==="function" && isGptImageModel(usedModel)){
          // GPT Image refused on CONTENT POLICY — auto-fall back to Nano Banana,
          // which is far more permissive for cinematic content (action, blood, intensity).
          // One-off: the user's SELECTED engine is left unchanged, only this frame switches.
          const gModel = allModels.find(m=> !(typeof isGptImageModel==="function" && isGptImageModel(m.id)));
          if(!gModel) throw e;
          setRetrying(true);
          policyFellBack = gModel.label || "Nano Banana";
          actualModel = gModel.id;
          url = await nbGenerate(genPrompt, { ...genOpts, model:gModel.id });
        } else { throw e; }
      }
      // cancelled mid-flight (Stop): discard the result — don't commit over the frame.
      if(window.__nbGenCancel && window.__nbGenCancel[id]) throw { __cancelled:true };
      /* version number from existing history (nbCommit rolls history internally) */
      let priorCount = 0;
      try{
        const histLen = (typeof nbGetHistory==="function") ? (await nbGetHistory(id)).length : 0;
        priorCount = genUrl ? Math.min(histLen+1, 12) : histLen;
      }catch(e){}
      const mEntry = allModels.find(m=>m.id===actualModel) || allModels[0] || {};
      const now = new Date();
      const sourceEntity = opts.entity || null;
      const renderStyleKey = (sourceEntity && sourceEntity.renderStyleKey) || "";
      const renderStyleLabel = (sourceEntity && typeof renderStyleLabelForEntity==="function") ? renderStyleLabelForEntity(sourceEntity) : "";
      const meta = {
        modelLabel: mEntry.label || "Nano Banana",
        modelId: actualModel,
        policyFallback: !!policyFellBack,
        renderStyleKey,
        renderStyleLabel,
        aspect: genOpts.aspectRatio || ((typeof nbGetAspect==="function") ? nbGetAspect() : "16:9"),
        size: genOpts.imageSize || ((typeof nbGetRes==="function") ? nbGetRes() : "2K"),
        // quality is a GPT Image (OpenAI) setting only — low/medium/high; Nano Banana
        // has no such control (its "quality" IS its resolution tier), so leave it unset there.
        quality: (typeof isGptImageModel==="function" && isGptImageModel(actualModel))
          ? (genOpts.quality || ((typeof nbGetOaiQuality==="function") ? nbGetOaiQuality() : "medium")) : undefined,
        date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
        time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
        iso: now.toISOString(),
        grounded: !!(groundEnabled && genOpts.metaOut && genOpts.metaOut.grounded),
        groundImages: !!(groundEnabled && isFlash && genOpts.metaOut && genOpts.metaOut.grounded),
        cameo: !!cameoUsed,
        propRefs: attachCount,
        refCount: refsUsed.length,
        prompt: genPrompt,
        mode: mode,
        editInstruction: isEditMode ? (gopts.editInstruction||"") : "",
        version: priorCount + 1
      };
      const assetKind = (typeof slotAssetKind==="function") ? slotAssetKind(slotId) : "character";
      const saveResult = await nbCommit(id, url, meta, refsUsed, assetKind);
      committedUrl = (saveResult && saveResult.url) || url;
      setGenUrl(committedUrl);
      setGenTier((saveResult && saveResult.tier) || "local");
      setGenMeta(meta);
      if(isEditMode){ setEditMode(false); setEditText(""); }
      // tell the user why this frame looks like the other engine
      if(policyFellBack && typeof window.appToast==="function")
        window.appToast("GPT Image blocked that for content policy — rendered with "+policyFellBack+" instead.", "info");
    }catch(e){ if(!(e && (e.__cancelled || e.name==="AbortError"))) setGenErr((e && e.message) || "Generation failed."); }
    const wasCancelled = !!(window.__nbGenCancel && window.__nbGenCancel[id]);
    setGening(false); setRetrying(false);
    delete window.__nbGenInflight[id];
    if(window.__nbGenAbort) delete window.__nbGenAbort[id];
    if(window.__nbGenCancel) delete window.__nbGenCancel[id];
    // notify any (re)mounted card for this id so it adopts the result even if the
    // card that started the generation has since unmounted (tab switch mid-generate).
    // Skip when cancelled — there's no result to adopt.
    if(!wasCancelled){ try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id, url: committedUrl } })); }catch(e){} }
  };
  const cancelGen = ()=>{ if(gening && typeof window.nbCancelGen==="function") window.nbCancelGen(id); };
  const clearGen = async ()=>{
    if(typeof nbClearAsset==="function") await nbClearAsset(id);
    // cascade: also clear this entity's variant sub-sheets (a character's appearance
    // states, a location's time-of-day plates) so they aren't orphaned. Cameo, linked
    // props, and the written spec are deliberately left intact.
    if(typeof opts.relatedClearIds==="function" && typeof nbClearAsset==="function"){
      let extra=[]; try{ extra=opts.relatedClearIds()||[]; }catch(e){}
      for(const xid of extra){ if(xid && xid!==id){ try{ await nbClearAsset(xid); }catch(e){} } }
    }
    setGenUrl(""); setGenErr(""); setGenTier("local"); setGenMeta(null);
  };
  /* Import a FINISHED sheet the user generated outside the app (full resolution, no
     downscale — unlike the reference-photo slot) and commit it AS this entity's sheet,
     so it gets every normal affordance (zoom, ⋯ menu, clear, used as a reference
     downstream). Resolution + aspect are detected from the pixels; quality is unknown. */
  const importSheet = async (file)=>{
    if(gening || !file) return;
    if(!/^image\/(png|jpeg|jpg|webp|avif)$/i.test(file.type||"")){ setGenErr("Choose a PNG, JPEG, WebP or AVIF image."); return; }
    setGenErr(""); setGening(true);
    try{
      const dataUrl = await new Promise((res,rej)=>{ const fr=new FileReader();
        fr.onload=()=>res(fr.result); fr.onerror=()=>rej(new Error("Couldn't read that file.")); fr.readAsDataURL(file); });
      const dims = await new Promise((res)=>{ const im=new Image();
        im.onload=()=>res({ w:im.naturalWidth, h:im.naturalHeight }); im.onerror=()=>res(null); im.src=dataUrl; });
      const now = new Date();
      const meta = {
        modelLabel:"Uploaded", modelId:"uploaded", uploaded:true, mode:"upload",
        aspect: dims ? nbAspectLabel(dims.w,dims.h) : "—",
        size:   dims ? nbResLabel(dims.w,dims.h)   : "—",
        pixelW: dims&&dims.w, pixelH: dims&&dims.h,
        date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
        time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
        iso: now.toISOString(), version: 1,
      };
      const assetKind = (typeof slotAssetKind==="function") ? slotAssetKind(slotId) : "character";
      const saveResult = await nbCommit(id, dataUrl, meta, [], assetKind);
      const url = (saveResult && saveResult.url) || dataUrl;
      setGenUrl(url); setGenTier((saveResult && saveResult.tier) || "local"); setGenMeta(meta);
      setSlotHasRef(false);
      try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id, url } })); }catch(e){}
    }catch(e){ setGenErr((e && e.message) || "Couldn't import the image."); }
    setGening(false);
  };
  /* how many variant sub-sheets a Clear would also remove (for the confirm message) */
  const relatedClearCount = (typeof opts.relatedClearIds==="function")
    ? (()=>{ try{ return (opts.relatedClearIds()||[]).length; }catch(e){ return 0; } })() : 0;
  /* details + version control for the info panel */
  const loadDetails = async ()=>{
    if(typeof nbLoadDetailsAsset==="function") return await nbLoadDetailsAsset(id, genUrl);
    return { id, url:genUrl, meta:genMeta, refs:[], history:[] };
  };
  const revertTo = async (index)=>{
    if(typeof nbRevertAsset!=="function") return;
    const r = await nbRevertAsset(id, index);
    if(r){ setGenUrl(r.url); setGenMeta(r.meta||null); }
    refreshLayers();
  };
  const deleteCurrentAndPromote = async ()=>{
    if(typeof nbDeleteCurrentAndPromoteAsset!=="function") return null;
    const r = await nbDeleteCurrentAndPromoteAsset(id);
    if(r){ setGenUrl(r.url); setGenMeta(r.meta||null); }
    refreshLayers();
    return r;
  };
  /* one-tap "undo last edit": restore the most recent prior version (layer 0) */
  const revertPrevious = async ()=>{ await revertTo(0); };
  /* delete a single version from history */
  const deleteVersion = async (index)=>{
    if(typeof nbDeleteHistoryEntry!=="function") return;
    await nbDeleteHistoryEntry(id, index);
    refreshLayers();
  };

  return { genUrl, genMeta, genTier, gening, genErr, retrying, slotHasRef,
    editMode, setEditMode, editText, setEditText, generate, cancelGen, clearGen, importSheet, relatedClearCount,
    loadDetails, revertTo, revertPrevious, deleteCurrentAndPromote, deleteVersion, layers, allModels,
    // the card's CURRENT spec prompt — lets QA judge uploaded/imported images
    // (which carry no generation prompt) against the written spec instead
    buildFinal: opts.buildFinal };
}
window.useImageGen = useImageGen;

/* ---- shared BATCH GENERATION engine (Props / Characters / Locations) ----------
   One queue at a time. Setting `activeId` to a card id makes THAT card auto-generate
   (each SheetFrame card watches activeId and fires gen.generate when it's its turn),
   then calls advance() to move to the next. begin() first partitions the ids into
   those that already have a sheet vs. not, and surfaces a choice (generate missing /
   regenerate all) when some already exist. Drives both the per-scene batch and the
   tab-wide "Generate all". */
function useBatchGen(){
  const [queue, setQueue] = React.useState([]);
  const [activeId, setActiveId] = React.useState(null);
  const [total, setTotal] = React.useState(0);
  const [msg, setMsg] = React.useState("");
  const [prompt, setPrompt] = React.useState(null);   // {missing:[ids], existing:[ids]}
  const advance = React.useCallback((doneId)=>{
    setQueue(q=>{
      const rest = q.filter(id=>id!==doneId);
      if(rest.length){ setActiveId(rest[0]); setMsg("Generating "+(total-rest.length+1)+" of "+total+"\u2026"); }
      else { setActiveId(null); setMsg(""); setTotal(0); }
      return rest;
    });
  },[total]);
  const run = (ids, skipped)=>{
    if(!ids.length) return;
    setPrompt(null);
    setTotal(ids.length); setQueue(ids); setActiveId(ids[0]);
    setMsg("Generating 1 of "+ids.length+(skipped?(" \u00b7 skipped "+skipped+" already done"):"")+"\u2026");
  };
  const begin = async (ids, undraftedSkipped)=>{
    if(activeId) return;
    if(typeof nbHasKeyForCurrent==="function" && !nbHasKeyForCurrent()){ setMsg("Set your image-model API key first (top of this tab)."); return; }
    if(!ids.length){ setMsg(undraftedSkipped ? "Draft the cards first \u2014 nothing is ready to generate yet." : "Nothing to generate yet."); return; }
    setPrompt(null);
    setMsg("Checking which already have a sheet\u2026");
    const missing=[], existing=[];
    for(const id of ids){
      let has = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
      if(!has && typeof nbLoadImage==="function"){ try{ has = await nbLoadImage(id); }catch(e){} }
      (has?existing:missing).push(id);
    }
    if(!existing.length){ setMsg(""); run(missing, 0); return; }
    if(!missing.length){ setMsg(""); setPrompt({ missing:[], existing:ids }); return; }
    setMsg(""); setPrompt({ missing, existing });
  };
  const cancel = ()=>{ setQueue([]); setActiveId(null); setTotal(0); setMsg("Cancelled."); setPrompt(null); };
  return { activeId, msg, prompt, setPrompt, setMsg, advance, run, begin, cancel, total };
}
window.useBatchGen = useBatchGen;

/* ---- shared 9-up PAGINATION for the sheet grids (Props / Characters / Locations).
   `suspend` (e.g. while a batch is running) shows EVERYTHING — the batch queue
   advances by watching mounted cards, so paging mustn't unmount its targets. */
const SHEETS_PER_PAGE = 9;
function usePager(total, suspend){
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(total/SHEETS_PER_PAGE));
  React.useEffect(()=>{ if(page > pages-1) setPage(Math.max(0, pages-1)); },[pages, page]);
  const slice = (arr)=> (suspend || total<=SHEETS_PER_PAGE) ? arr
    : arr.slice(page*SHEETS_PER_PAGE, (page+1)*SHEETS_PER_PAGE);
  return { page, setPage, pages, slice, active: !suspend && total>SHEETS_PER_PAGE, total };
}
function PagerBar({ pager, noun }){
  if(!pager || !pager.active) return null;
  const { page, setPage, pages, total } = pager;
  const go = (p)=> setPage(Math.max(0, Math.min(pages-1, p)));
  const nums = [];
  for(let i=0;i<pages;i++) nums.push(i);
  return React.createElement("div",{className:"pager"},
    React.createElement("button",{className:"pager-btn",disabled:page===0,onClick:()=>go(page-1),"aria-label":"Previous page"},
      React.createElement(Icon.chevL,{s:13})),
    pages<=9
      ? nums.map(i=>React.createElement("button",{key:i,className:"pager-num"+(i===page?" on":""),onClick:()=>go(i)}, i+1))
      : React.createElement("span",{className:"pager-count"},(page+1)+" / "+pages),
    React.createElement("button",{className:"pager-btn",disabled:page===pages-1,onClick:()=>go(page+1),"aria-label":"Next page"},
      React.createElement(Icon.chevR,{s:13})),
    React.createElement("span",{className:"pager-note"}, total+" "+(noun||"card")+(total!==1?"s":"")));
}
window.usePager = usePager; window.PagerBar = PagerBar;

/* shared batch status / choice strip — render just under a tab's toolbar. `noun`
   is the singular card noun ("prop" / "character" / "location"). */
/* Shared ART-ROOM PROGRESS CARD — spinner + bold title + reassuring subtitle, matching
   the shots re-design note, so every tab-level "MUSE is working" state reads the same. */
function ArtProgress({ title, detail, onCancel }){
  return React.createElement("div",{className:"art-progress-card"},
    React.createElement("span",{className:"ns-spin"}),
    React.createElement("div",{className:"apc-txt"},
      React.createElement("div",{className:"apc-t"},title),
      detail && React.createElement("div",{className:"apc-d"},detail)),
    onCancel && React.createElement("button",{className:"art-draftall ghost apc-cancel",onClick:onCancel},"Cancel"));
}
window.ArtProgress = ArtProgress;

function BatchBar({ batch, noun }){
  const { activeId, msg, prompt, run, cancel, setPrompt, setMsg } = batch;
  // the bar lives at the TOP of the tab, but its triggers (e.g. a card's generate
  // button) can sit far down the page — scroll the bar into view when it has a
  // question or status, or the click looks like it did nothing.
  const barRef = React.useRef(null);
  React.useEffect(()=>{
    const el = barRef.current;
    if(!(prompt || msg) || !el) return;
    // scroll the actual overflow ancestor (.art-scroll) so the bar is visible even
    // when the trigger button sits far below it — scrollIntoView({block:nearest})
    // was unreliable inside that nested scroller. Then flash it so the answer to a
    // low click ("regenerate all?", "draft first") is impossible to miss.
    let sc = el.parentElement;
    while(sc && !(sc.scrollHeight > sc.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    if(sc){ const top = el.offsetTop - sc.offsetTop - 12;
      try{ sc.scrollTo({ top: Math.max(0, top), behavior:"smooth" }); }catch(e){ sc.scrollTop = Math.max(0, top); } }
    else if(el.scrollIntoView) el.scrollIntoView({ block:"center", behavior:"smooth" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  },[!!prompt, msg]);
  if(!activeId && !prompt && !msg) return null;
  const N = noun || "card";
  return React.createElement("div",{className:"art-batchbar",ref:barRef},
    prompt && React.createElement("div",{className:"batch-choice"},
      React.createElement("span",{className:"batch-choice-q"},
        prompt.missing.length>0
          ? (prompt.existing.length+" of these "+N+"s already have a sheet. What would you like to do?")
          : ("All "+prompt.existing.length+" "+N+"s already have a sheet. Regenerate them?")),
      prompt.missing.length>0 && React.createElement("button",{className:"art-draftall",
        onClick:()=>run(prompt.missing, prompt.existing.length),
        title:"Generate only the "+N+"s that don't have a sheet yet"},
        React.createElement(Icon.sparkles,{s:13}),"Generate "+prompt.missing.length+" missing",
        typeof window.nbCostChip==="function" && window.nbCostChip(prompt.missing.length)),
      React.createElement("button",{className:"art-draftall"+(prompt.missing.length?" ghost":""),
        onClick:()=>run([...prompt.missing, ...prompt.existing], 0),
        title:"Generate every "+N+", regenerating ones that already have a sheet"},
        React.createElement(Icon.sparkles,{s:13}),"Regenerate all "+(prompt.missing.length+prompt.existing.length),
        typeof window.nbCostChip==="function" && window.nbCostChip(prompt.missing.length+prompt.existing.length)),
      React.createElement("button",{className:"art-draftall ghost",onClick:()=>{ setPrompt(null); setMsg(""); }},"Cancel")),
    // ACTIVELY GENERATING → the shared progress card (spinner + status + reassurance),
    // matching the shots re-design note; a bare info/error msg stays a plain line.
    activeId
      ? React.createElement(ArtProgress,{
          title: msg || ("Generating "+N+" sheets…"),
          detail: "Rendering coverage in order — each frame takes a moment; the sheets already finished stay even if you cancel.",
          onCancel: cancel })
      : (msg && React.createElement("span",{className:"prop-scenebar-msg"},msg)));
}
window.BatchBar = BatchBar;

/* SheetDetails — a modal exposing everything about a generated sheet: id, model,
   resolution, aspect, timestamp, grounding, the exact prompt sent, the reference
   images used, and the full version history (preview + restore any prior version). */
function SheetDetails({ gen, name, noun, onClose, onView, extraMeta }){
  const [data, setData] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [copiedKey, setCopiedKey] = React.useState(null);
  const [preview, setPreview] = React.useState(null);   // hero zoom overlay (full-screen)
  const [selVer, setSelVer] = React.useState(null);     // {url, meta} of a history version being inspected IN PLACE (null = current)
  const scrollRef = React.useRef(null);                 // dt-scroll container
  const promptRef = React.useRef(null);                 // the "Prompt sent to the model" section
  const reload = React.useCallback(async ()=>{ const d = await gen.loadDetails(); setData(d); },[gen]);
  React.useEffect(()=>{ reload(); setSelVer(null); },[reload, gen.genUrl]);

  const curMeta = (data && data.meta) || gen.genMeta || {};
  // when inspecting an earlier version, the whole form (hero, metadata, prompt) reflects IT
  const meta = selVer ? (selVer.meta || {}) : curMeta;
  const heroUrl = selVer ? selVer.url : gen.genUrl;
  const refs = (data && data.refs) || [];
  const history = (data && data.history) || [];
  /* Reference-image resolution tied to the ANCHORED version (selected or current).
     For an EDIT, the reference IS the prior sheet — which exists in the version
     chain with a working URL — so we resolve it there instead of the (often
     broken / unsigned) stored ref blob. For an original/photo generation we fall
     back to the stored refs (current only; history entries don't carry refs). */
  const versions = [{ url: gen.genUrl, meta: curMeta }].concat(
    history.map(h=>({ url: h.url, meta: h.meta||{} })));
  const anchorPos = selVer ? (selVer.idx + 1) : 0;
  const anchorMeta = (versions[anchorPos] || versions[0] || {}).meta || {};
  let displayRefs = [];
  if(anchorMeta.mode === "edit"){
    const src = versions[anchorPos + 1];
    if(src && src.url){
      const sv = (src.meta && src.meta.version) || (versions.length - anchorPos - 1);
      displayRefs = [{ url: src.url, label: "Edited from v"+sv+" sheet" }];
    }
  } else if(!selVer){
    displayRefs = refs.map(r=>({ url:r.url, label:r.label }));
  }
  /* clipboard copy with a fallback for sandboxed iframes where the async
     Clipboard API is blocked (same fix as CopyBox). key tracks which button copied. */
  const copyText = async (text, key)=>{
    let ok=false;
    try{ if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text||""); ok=true; } }catch(e){ ok=false; }
    if(!ok){
      try{
        const ta=document.createElement("textarea"); ta.value=text||""; ta.setAttribute("readonly","");
        ta.style.cssText="position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0,(text||"").length);
        ok=document.execCommand("copy"); document.body.removeChild(ta);
      }catch(e){ ok=false; }
    }
    setCopiedKey(key); setTimeout(()=>setCopiedKey(null),1400);
  };
  const restore = async (i)=>{ setBusy(true); try{ await gen.revertTo(i); await reload(); }catch(e){} setBusy(false); };
  const delVersion = async (i)=>{ setBusy(true); try{ await gen.deleteVersion(i); await reload(); }catch(e){} setBusy(false); };
  const deleteCurrent = async ()=>{
    if(!history.length || !gen.deleteCurrentAndPromote) return;
    const prev = history[0] && history[0].meta;
    const prevLabel = prev && prev.version ? ("v"+prev.version) : "the previous version";
    const ok = await window.appConfirm({
      title:"Delete current image?",
      body:"This deletes the current "+(noun||"image")+" and restores "+prevLabel+" as the current image. The deleted current image will not be kept in Earlier versions.",
      note:"Use Restore on an earlier version instead if you want to keep the current image in history.",
      confirmLabel:"Delete current", cancelLabel:"Cancel", danger:true,
    });
    if(!ok) return;
    setBusy(true);
    try{
      await gen.deleteCurrentAndPromote();
      setSelVer(null);
      await reload();
    }catch(e){}
    setBusy(false);
  };
  /* select a history version IN PLACE — clicking a row shows that version's image
     and ALL its properties (model, resolution, aspect, generated, version, image
     id, prompt, reference images). Click again on the banner's "Back to current". */
  const selectVersion = (h, i)=>{ setSelVer({ url:h.url, meta:h.meta||{}, idx:i, mode:"preview" }); };

  const field = (label,val)=> val ? React.createElement("div",{className:"dt-field"},
    React.createElement("div",{className:"dt-flab"},label),
    React.createElement("div",{className:"dt-fval"},val)) : null;

  return React.createElement("div",{className:"lb-overlay dt-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"dt-panel"},
      React.createElement("div",{className:"dt-head"},
        React.createElement("div",null,
          React.createElement("div",{className:"dt-title"},name),
          React.createElement("div",{className:"dt-sub"},"Image details")),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),
      React.createElement("div",{className:"dt-scroll",ref:scrollRef},
        /* image preview — current OR the earlier version being inspected. If the
           file is gone from storage (dangling path → empty/failed URL), fall back
           to a placeholder instead of a broken image. */
        heroUrl && React.createElement("img",{className:"dt-hero",src:heroUrl,alt:name,
          onClick:()=>setPreview(heroUrl),
          onError:(e)=>{ e.target.style.display="none"; const ph=document.querySelector(".dt-scroll .dt-hero-missing"); if(ph) ph.style.display="flex"; }}),
        React.createElement("div",{className:"dt-hero-missing",style:{display:heroUrl?"none":"flex"}},
          React.createElement(Icon.image,{s:20}),
          React.createElement("span",null,selVer?"This version's image is no longer available in storage.":"Image unavailable.")),
        /* banner shown while inspecting an earlier version in place */
        selVer && React.createElement("div",{className:"dt-viewing"},
          React.createElement(Icon.history,{s:13}),
          React.createElement("span",{className:"dt-viewing-t"},"Viewing an earlier version"
            +(meta.version?(" \u00b7 v"+meta.version):"")+" \u2014 not the current image"),
          React.createElement("button",{className:"dt-viewing-back",onClick:()=>setSelVer(null)},"Back to current")),
        (!selVer && history.length>0) && React.createElement("div",{className:"dt-current-actions"},
          React.createElement("button",{className:"dt-current-delete",disabled:busy,onClick:deleteCurrent,
            title:"Delete the current image and restore the newest earlier version"},
            React.createElement(Icon.trash,{s:12}),"Delete current image \u2192 restore previous")),
        /* metadata grid */
        React.createElement("div",{className:"dt-grid"},
          field("Model", meta.modelId || meta.modelLabel || null),
          field("Render style", (typeof renderStyleLabelFromMeta==="function" ? renderStyleLabelFromMeta(meta) : "") || null),
          field("Resolution", meta.size),
          field("Aspect ratio", meta.aspect),
          field("Quality", meta.quality ? String(meta.quality).replace(/^./,c=>c.toUpperCase()) : null),
          field("Generated", (meta.date||"")+(meta.time?(" \u00b7 "+meta.time):"")),
          ...((extraMeta||[]).filter(m=>m&&m.v).map((m,i)=>React.createElement("div",{key:"em"+i,className:"dt-field"},
            React.createElement("div",{className:"dt-flab"},m.k),
            React.createElement("div",{className:"dt-fval"},m.v)))),
          field("Version", meta.version ? ("v"+meta.version) : null),
          field("Grounding", meta.grounded ? (meta.groundImages?"Google Search (web + images)":"Google Search") : null),
          field("Prop references", meta.propRefs ? (meta.propRefs+" prop sheet"+(meta.propRefs>1?"s":"")) : null),
          field("Image ID", data && data.id)),
        /* prompt */
        meta.prompt && React.createElement("div",{className:"dt-section",ref:promptRef},
          React.createElement("div",{className:"dt-sec-head"},
            React.createElement("span",{className:"dt-sec-lab"},selVer?"Prompt sent to the model \u00b7 viewing earlier version":"Prompt sent to the model"),
            React.createElement("button",{className:"dt-copy",onClick:()=>copyText(meta.prompt||"","main")},
              React.createElement(Icon[copiedKey==="main"?"check":"copy"],{s:12}), copiedKey==="main"?"Copied":"Copy")),
          React.createElement("div",{className:"dt-prompt"},meta.prompt)),
        /* reference images used */
        (displayRefs.length>0 || selVer) && React.createElement("div",{className:"dt-section"},
          React.createElement("div",{className:"dt-sec-lab"},"Reference images used"+(displayRefs.length?(" ("+displayRefs.length+")"):"")),
          displayRefs.length>0
            ? React.createElement("div",{className:"dt-thumbs"},
                displayRefs.map((r,i)=>React.createElement("div",{key:i,className:"dt-thumb",onClick:()=>r.url&&setPreview(r.url)},
                  r.url ? React.createElement("img",{src:r.url,alt:r.label,
                    onError:(e)=>{ e.target.style.display="none"; const ph=e.target.parentNode.querySelector(".dt-thumb-ph"); if(ph) ph.style.display="grid"; }}) : null,
                  React.createElement("div",{className:"dt-thumb-ph",style:{display:r.url?"none":"grid"}},
                    React.createElement(Icon.image,{s:18})),
                  React.createElement("span",{className:"dt-thumb-lab"},(()=>{
                    // LIVE name: refs store the entity id, so a renamed prop/character/
                    // location shows its CURRENT name here, not the name at render time
                    if(r.refId){ const C=window.turnContinuity||{};
                      const hit=[...(C.props||[]),...(C.characters||[]),...(C.locations||[])].find(x=>x&&x.id===r.refId);
                      if(hit&&hit.name) return hit.name+(hit.kind?(" ("+hit.kind+")"):""); }
                    return r.label; })()))))
            : React.createElement("div",{className:"dt-noref"},"No reference images for this version \u2014 generated from the prompt alone.")),
        /* version history — each prior version is an edit "layer" you can preview or restore */
        history.length>0 && React.createElement("div",{className:"dt-section"},
          React.createElement("div",{className:"dt-sec-lab"},
            React.createElement(Icon.history,{s:12}),"Earlier versions ("+history.length+")"),
          React.createElement("div",{className:"dt-hist"},
            history.map((h,i)=>{
              const hm = h.meta||{};
              const isEdit = hm.mode==="edit";
              const styleLabel = (typeof renderStyleLabelFromMeta==="function") ? renderStyleLabelFromMeta(hm) : "";
              const layerLabel = isEdit
                ? ("Edit: "+(hm.editInstruction||"adjustment"))
                : (hm.mode==="photo" ? "From reference photo" : hm.mode==="cameo" ? "From cameo likeness" : styleLabel || "Original generation");
              const modelName = hm.modelId || hm.modelLabel || "unknown model";
              const active = selVer && selVer.idx===i;
              return React.createElement("div",{key:i,className:"dt-hist-item"+(active?" active":"")},
                React.createElement("div",{className:"dt-hist-row"},
                  /* the whole row (thumb + info) is the click target: select this
                     version to view its image + all its properties in place. */
                  React.createElement("button",{className:"dt-hist-main",type:"button",
                    onClick:()=>selectVersion(h,i),title:active?"Viewing this version":"View this version"},
                    React.createElement("div",{className:"dt-hist-thumb-wrap"},
                      h.url ? React.createElement("img",{className:"dt-hist-thumb",src:h.url,alt:"version",
                        onError:(e)=>{ e.target.style.display="none"; const ph=e.target.parentNode.querySelector(".dt-hist-thumb-ph"); if(ph) ph.style.display="grid"; }}) : null,
                      React.createElement("div",{className:"dt-hist-thumb-ph",style:{display:h.url?"none":"grid"},
                        title:"Image no longer in storage"},React.createElement(Icon.image,{s:15}))),
                    React.createElement("div",{className:"dt-hist-info"},
                      React.createElement("div",{className:"dt-hist-layer"+(isEdit?" edit":" base")},
                        React.createElement(Icon[isEdit?"wand":"image"]||Icon.sparkles,{s:11}),
                        React.createElement("span",{className:"dt-hist-layer-t"},layerLabel)),
                      React.createElement("div",{className:"dt-hist-meta"},
                        modelName,
                        (hm.date)?(" \u00b7 "+hm.date):"",
                        (hm.time)?(" "+hm.time):""))),
                  React.createElement("div",{className:"dt-hist-acts"},
                    React.createElement("button",{className:"dt-hist-btn restore",disabled:busy,onClick:()=>restore(i)},"Restore"),
                    React.createElement("button",{className:"dt-hist-btn del",disabled:busy,title:"Delete this version",
                      onClick:()=>delVersion(i)},React.createElement(Icon.trash,{s:12})))));
            })))) ),
    preview && React.createElement("div",{className:"dt-preview",onMouseDown:(e)=>{ if(e.target===e.currentTarget) setPreview(null); }},
      React.createElement("img",{className:"dt-preview-img",src:preview,alt:"version preview"}),
      React.createElement("button",{className:"dt-preview-x",title:"Close preview",onClick:()=>setPreview(null)},React.createElement(Icon.x,{s:18}))));
}

/* SheetFrame — the visual half of any reference-sheet card: generated image (with
   options menu + inline AI edit), or the reference-photo drop slot, then the
   Generate button, error recovery, and the metadata caption. Driven by useImageGen. */
/* ---- per-card QA report — the QA Inspector's single-image verdict, opened from
   the card's "QA" button. Advisory: the report shows deviations, inventions and a
   recommendation, and only acts (edit / regenerate) when the user clicks. */
function _qaWhereChips(where){
  // "leftmost, second-left, middle-right" → one chip per panel — but only when
  // every segment stands alone; "panels 2, 3, 4" keeps one chip ("3" alone is noise)
  const parts = String(where||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(parts.length>1 && parts.every(p=>p.length>2 && !/^\d+$/.test(p))) return parts;
  return [parts.join(", ")].filter(Boolean);
}
/* build a targeted edit instruction from the QA findings when the model didn't
   supply one — so "edit the current image" is ALWAYS on offer, not only when the
   verdict itself recommends an edit. */
function _qaDerivedEditInstruction(r){
  const parts = [
    ...(Array.isArray(r.deviations)?r.deviations.map(d=>d&&d.what).filter(Boolean):[]),
    ...(Array.isArray(r.inventions)?r.inventions.map(x=>x?("remove: "+x):"").filter(Boolean):[]) ];
  if(!parts.length) return "";
  return "Targeted correction \u2014 change NOTHING else about the image (framing, faces, lighting and style stay exactly as they are): "
    + parts.slice(0,6).join("; ") + ".";
}
function QaReport({ name, noun, report, gening, onClose, onRunEdit, onRegen, specFields, onApplySpec }){
  const r = report;
  const [applying, setApplying] = React.useState(false);
  // "Apply to spec": fold the prompt advice into the card's own drafted fields —
  // one writing-model call, previewed via confirm; regenerating stays manual.
  const applyAdvice = async ()=>{
    if(applying || !r.promptFix || typeof window.aiApplyQaAdvice!=="function" || !specFields || !onApplySpec) return;
    setApplying(true);
    let patch = null;
    try{ patch = await window.aiApplyQaAdvice(noun, specFields(), r.promptFix); }catch(e){}
    setApplying(false);
    if(!patch){ if(typeof window.appToast==="function") window.appToast("Nothing to change — the spec already covers the advice (or the writing model is unavailable).","info"); return; }
    const summary = Object.keys(patch).map(k=>{
      const text = (typeof clipWords==="function") ? clipWords(patch[k],90) : (patch[k].slice(0,90)+(patch[k].length>90?"…":""));
      return k.toUpperCase()+" → "+text;
    }).join("\n");
    let ok = true;
    if(typeof window.appConfirm==="function")
      ok = await window.appConfirm({ title:"Apply the advice and regenerate?",
        body:"These field(s) update, then the "+(noun||"sheet")+" REGENERATES immediately from the new spec (1 image generation) — so the sheet on the card always matches its spec. The current image stays in version history; restoring it later also restores its own prompt on the card.\n\n"+summary,
        confirmLabel:"Apply & regenerate", cancelLabel:"Cancel" });
    if(!ok) return;
    onApplySpec(patch);
    if(typeof window.appToast==="function") window.appToast("Spec updated — regenerating the "+(noun||"sheet")+" now; the previous version stays in history.","success");
    onClose();
  };
  const sev = r.verdict==="pass" ? "pass" : r.verdict==="major" ? "major" : "minor";
  const clean = r.deviations.length===0 && r.inventions.length===0;
  // "Edit current image" — a targeted one-generation edit of the EXISTING frame,
  // built from the findings (or the model's own instruction). Sits to the RIGHT of
  // "Apply to spec & regenerate" (user ruling 2026-07-21); on edit verdicts the
  // primary Run-suggested-edit in the footer carries it instead.
  const _editBtn = (r.action!=="edit" && !!(r.editInstruction || _qaDerivedEditInstruction(r)))
    ? React.createElement("button",{className:"ns-btn ghost qa-apply-btn",disabled:gening,
        title:"Make a TARGETED EDIT to the current image that fixes the findings above — one generation; this exact framing is kept and the current version stays in history. (Apply to spec & regenerate is the deeper fix when the drift is systemic.)",
        onClick:()=>{ onRunEdit(r.editInstruction || _qaDerivedEditInstruction(r)); onClose(); }},
        React.createElement(Icon.wand,{s:12}),"Edit current image")
    : null;
  const finding = (d,i,invented)=> React.createElement("div",{key:i,className:"qa-item"},
    React.createElement("span",{className:"qa-dot "+(invented?"invent":(d.severity==="major"?"major":"minor")),
      title: invented?"Invented — not in the prompt":(d.severity==="major"?"Major deviation":"Minor deviation")}),
    React.createElement("div",{className:"qa-item-body"},
      (!invented && d.where && d.where!=="overall") && React.createElement("div",{className:"qa-chips"},
        _qaWhereChips(d.where).map((w,j)=>React.createElement("span",{key:j,className:"qa-where"},w))),
      React.createElement("div",{className:"qa-what"}, invented? d : d.what)));
  return React.createElement("div",{className:"ns-overlay",onMouseDown:e=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"qa-modal"},
      React.createElement("div",{className:"qa-head"},
        React.createElement("span",{className:"qa-orb "+sev}, React.createElement(Icon.eye,{s:15})),
        React.createElement("div",{className:"qa-head-txt"},
          React.createElement("div",{className:"qa-title"}, name||"Untitled"),
          React.createElement("div",{className:"qa-sub"}, (noun||"sheet")+(r.judgedSpec
            ? " · uploaded image — judged against the card's CURRENT spec (it has no generation prompt)"
            : " · judged against the exact prompt that generated it"))),
        React.createElement("span",{className:"qa-badge "+sev}, sev==="pass"?"Faithful":sev==="minor"?"Minor drift":"Major drift"),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:15}))),
      clean
        ? React.createElement("div",{className:"qa-clean"},
            React.createElement(Icon.check,{s:13}),"Faithful to its prompt — nothing to fix.")
        : React.createElement(React.Fragment,null,
            r.deviations.length>0 && React.createElement("div",{className:"qa-sec"},
              React.createElement("div",{className:"qa-sec-lab"},"Deviations from the prompt"),
              r.deviations.map((d,i)=>finding(d,i,false))),
            r.inventions.length>0 && React.createElement("div",{className:"qa-sec"},
              React.createElement("div",{className:"qa-sec-lab"},"Invented — not in the prompt"),
              r.inventions.map((x,i)=>finding(x,"inv"+i,true)))),
      // the verdict, spelled out — what to do with this image
      React.createElement("div",{className:"qa-rec "+r.action},
        React.createElement("span",{className:"qa-rec-lab"},"Recommendation"),
        React.createElement("span",{className:"qa-rec-verb"},
          r.action==="edit" ? "Edit — a targeted fix repairs it"
          : r.action==="regenerate" ? "Regenerate — the drift is systemic, an edit can't save it"
          : "Keep — minor nits at most")),
      (r.action==="edit" && r.editInstruction) && React.createElement("div",{className:"qa-sec"},
        React.createElement("div",{className:"qa-sec-lab"},"Suggested edit — for this card's Edit box (or Run it below)"),
        React.createElement("div",{className:"qa-quote edit"},r.editInstruction)),
      r.promptFix && React.createElement("div",{className:"qa-sec"},
        React.createElement("div",{className:"qa-sec-lab",
          title:"This amends the WRITTEN SPEC, not the image: Apply to spec folds it into the card's drafted fields for you, then Regenerate the sheet. It is not an Edit instruction — for a quick image fix, use Run suggested edit instead."},
          "Prompt advice — amends the card's spec (not an Edit instruction)"),
        React.createElement("div",{className:"qa-quote"},r.promptFix),
        React.createElement("div",{className:"qa-apply-row"},
          (specFields && onApplySpec) && React.createElement("button",{className:"ns-btn qa-apply-btn "+(r.action==="regenerate"?"primary":"ghost"),disabled:applying||gening,
            title:"Fold this advice into the card's drafted spec fields (one writing-model call, previewed first), then REGENERATE immediately so the sheet always matches its spec — the current image stays in version history",
            onClick:applyAdvice},
            applying ? React.createElement("span",{className:"ns-spin"}) : React.createElement(Icon.sparkles,{s:12}),
            applying ? "Folding into the spec…" : "Apply to spec & regenerate"),
          _editBtn)),
      React.createElement("div",{className:"qa-foot"},
        React.createElement("span",{className:"qa-foot-note"},"1 vision read · no image credits spent"),
        React.createElement("button",{className:"ns-btn ghost",onClick:onClose},"Close"),
        (r.action==="edit" && r.editInstruction) && React.createElement("button",{className:"ns-btn primary",disabled:gening,
          title:"Apply the suggested edit to this image now — one generation; the current version stays in history",
          onClick:()=>{ onRunEdit(r.editInstruction); onClose(); }},
          React.createElement(Icon.wand,{s:13}),"Run suggested edit"),
        // ("Regenerate now" removed, user ruling 2026-07-21: it duplicated the card's
        // own Regenerate button and re-rolled the SAME spec the report just faulted —
        // the modal offers only the two INFORMED repairs: amend the spec, or edit.)
        (!r.promptFix) && _editBtn)));
}

/* ---- QA button — lives on the card face next to "Draft details" (chars, props,
   locations) and in the shot head row. Self-contained: busy state, the vision
   read, and the report modal. Hidden until the card has a generated image. */
function QaCheckButton({ gen, name, noun, className, specFields, onApplySpec, showWhenEmpty }){
  const [busy, setBusy] = React.useState(false);
  const [report, setReport] = React.useState(null);
  // Apply-to-spec REGENERATES immediately (user ruling 2026-07-18: the current sheet
  // must always match the spec). The regen fires from an EFFECT one render later, so
  // gen.generate() closes over the UPDATED entity — calling it synchronously would
  // rebuild the prompt from the stale pre-patch spec and regenerate the old look.
  const [pendingRegen, setPendingRegen] = React.useState(false);
  React.useEffect(()=>{
    if(!pendingRegen) return;
    setPendingRegen(false);
    gen.generate();
  },[pendingRegen]);
  if(!gen) return null;
  // no image yet: normally the button just isn't there (nothing to judge). Surfaces
  // whose grids MIX rendered and unrendered cards (the Lookbook) pass showWhenEmpty
  // so the control reads as locked-with-a-reason instead of randomly missing.
  if(!gen.genUrl){
    if(!showWhenEmpty) return null;
    return React.createElement("button",{className:(className||"char-draft-btn ghost")+" qa-empty",disabled:true,
      title:"QA check unlocks once this card has a generated image — it reads the "+(noun||"sheet")+" against the prompt that made it. Generate the "+(noun||"image")+" first."},
      React.createElement(Icon.eye,{s:12}),"QA check");
  }
  const run = async ()=>{
    if(busy || gen.gening) return;
    // the contract: the version's stored generation prompt — or, for UPLOADED /
    // imported images (no generation prompt), the card's CURRENT spec prompt
    let contract = (gen.genMeta && gen.genMeta.prompt) || "", judgedSpec = false;
    if(!contract && typeof gen.buildFinal==="function"){
      try{ contract = String(gen.buildFinal()||""); }catch(e){}
      judgedSpec = !!contract;
    }
    if(!contract){ if(window.appToast) window.appToast("Nothing to judge against yet — Draft details first, so this card has a spec."); return; }
    if(typeof window.aiImageQA!=="function") return;
    setBusy(true);
    const rep = await window.aiImageQA({ kind:noun||"sheet", name, url:gen.genUrl, prompt:contract });
    setBusy(false);
    if(!rep){ if(window.appToast) window.appToast("The QA read failed — try again.","info"); return; }
    if(rep.unsupported){ if(window.appToast) window.appToast("Your server proxy is text-only — redeploy it to enable vision QA.","info"); return; }
    setReport({ ...rep, judgedSpec });
  };
  return React.createElement(React.Fragment,null,
    React.createElement("button",{className:(className||"char-draft-btn ghost")+(busy?" busy":""),disabled:busy||gen.gening,
      title:"QA check — re-reads this "+(noun||"sheet")+" against the exact prompt that generated it: deviations, invented content, per-panel faults, and whether to edit or regenerate. One vision read (writing-model credits, no image spend).",
      onClick:run},
      busy ? React.createElement("span",{className:"ns-spin"}) : React.createElement(Icon.eye,{s:12}),
      busy ? "QA…" : "QA check"),
    report && ReactDOM.createPortal(React.createElement(QaReport,{ name, noun, report, gening:gen.gening,
      specFields,
      onApplySpec: onApplySpec ? (patch)=>{ onApplySpec(patch); setPendingRegen(true); } : undefined,
      onClose:()=>setReport(null),
      onRunEdit:(instr)=>gen.generate({ editInstruction:instr }),
      onRegen:()=>gen.generate() }), document.body));
}
window.QaCheckButton = QaCheckButton;

function SheetFrame({ gen, slotId, name, avatarColor, initials, drafted, drafting, onDraft, entity, onView, slotPlaceholder, noun, onDelete, deleteLabel, specGate, extraMeta, menuExtra, dropToImport, hideUploadButton, onStop, generateDisabled, generateDisabledLabel, generateDisabledTitle, referenceControls, editPropRefs, editSuggestions }){
  const { genUrl, genMeta, genTier, gening, genErr, retrying, slotHasRef,
    editMode, setEditMode, editText, setEditText, generate, cancelGen, clearGen, importSheet, relatedClearCount, revertPrevious, layers, allModels } = gen;
  // Resolution ALWAYS shows on the caption. Prefer the stored size; if it's missing
  // (legacy meta, or any path that didn't record it) measure the actual image's pixels
  // so a real resolution still appears — for generations AND uploads alike.
  const [measRes, setMeasRes] = React.useState("");
  React.useEffect(()=>{
    if(!genUrl || (genMeta && genMeta.size)){ setMeasRes(""); return; }
    let alive=true; const im=new Image();
    im.onload=()=>{ if(alive && im.naturalWidth) setMeasRes(nbResLabel(im.naturalWidth, im.naturalHeight)); };
    im.onerror=()=>{ if(alive) setMeasRes(""); };
    im.src=genUrl;
    return ()=>{ alive=false; };
  },[genUrl, genMeta && genMeta.size]);
  const resLabel = (genMeta && genMeta.size) || measRes || "—";
  // EDIT ATTACHMENTS — image inputs the user pins to the NEXT "Apply edit": uploaded
  // photos/designs and/or this entity's prop sheets (incl. CARRIED props). They ride
  // as editRefImages on the edit generation; cleared on apply, cancel or close.
  const [editRefs, setEditRefs] = React.useState([]);   // [{url, note}]
  const [editAddOpen, setEditAddOpen] = React.useState(false);   // the "+" input-source menu
  const [editAddPos, setEditAddPos] = React.useState(null);      // anchor: above the Describe-changes input, centered on it
  const editFileRef = React.useRef(null);
  const editAddRef = React.useRef(null);
  const addEditFiles = (files)=>{ [...(files||[])].forEach(f=>{
    if(!/^image\//.test(f.type||"")) return;
    const rd = new FileReader();
    rd.onload = ()=>{ const raw = String(rd.result||"");
      const push = (u)=>setEditRefs(rs=>[...rs, { url:u, note:f.name||"image" }]);
      if(typeof turnDownscaleDataUrl==="function"){ turnDownscaleDataUrl(raw, 1280).then(u=>push(u||raw)).catch(()=>push(raw)); }
      else push(raw); };
    rd.readAsDataURL(f);
  }); };
  // bridge for the fullscreen viewer: lets the filmstrip's "Remaster this version"
  // reuse THIS card's generation pipeline (refs, meta, history) for the open entity
  React.useEffect(()=>{
    const bid = (entity && entity.id) || slotId;
    window.__sheetGen = window.__sheetGen || {};
    window.__sheetGen[bid] = { generate, gening, noun };
    return ()=>{ delete window.__sheetGen[bid]; };
  });
  const runEdit = ()=>{ if(!editText.trim() || gening) return;
    const opts = { editInstruction: editText.trim() };
    if(editRefs.length){
      opts.editRefImages = editRefs.map(r=>r.url);
      opts.editRefMeta = editRefs.slice();   // {url, note} — recorded in Details › Reference images used
    }
    generate(opts); setEditRefs([]); };
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  const uploadRef = React.useRef(null);
  const pickUpload = ()=>{ if(uploadRef.current) uploadRef.current.click(); };
  const onUploadPicked = (e)=>{ const f=e.target.files&&e.target.files[0]; if(f&&importSheet) importSheet(f); e.target.value=""; };
  // dropToImport: the empty slot itself imports a FINISHED frame at full resolution (drop or
  // click-to-browse) — same job as the old "Upload a finished" button, so it can replace it.
  const [dropOver, setDropOver] = React.useState(false);
  const onZoneDragOver = (e)=>{ if(!importSheet || gening) return; e.preventDefault(); e.stopPropagation(); if(e.dataTransfer) e.dataTransfer.dropEffect="copy"; if(!dropOver) setDropOver(true); };
  const onZoneDragLeave = (e)=>{ e.preventDefault(); setDropOver(false); };
  const onZoneDrop = (e)=>{ e.preventDefault(); e.stopPropagation(); setDropOver(false);
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if(f && importSheet && !gening) importSheet(f); };
  const [pendingGenerate, setPendingGenerate] = React.useState(false);
  const sawDraftingRef = React.useRef(false);
  noun = noun || "sheet";

  React.useEffect(()=>{
    if(!menuOpen) return;
    const handler = e=>{ if(menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return ()=>document.removeEventListener("mousedown", handler);
  },[menuOpen]);

  /* draft-then-generate: when generating an undrafted card, run Draft first then auto-generate */
  React.useEffect(()=>{
    if(!pendingGenerate) return;
    if(drafting){ sawDraftingRef.current = true; return; }
    if(sawDraftingRef.current){ sawDraftingRef.current = false; setPendingGenerate(false); generate(); }
  },[pendingGenerate, drafting]);

  const handleGenerateClick = ()=>{
    if(generateDisabled) return;
    if(gening) return;
    if(specGate && !specGate.ready && !genUrl && !slotHasRef) return; // gated: draft the spec first
    if(!drafted && !genUrl && !slotHasRef){ setPendingGenerate(true); onDraft(); return; }
    generate();
  };
  // spec-first gate (opt-in via specGate; Props/Characters pass nothing → ungated):
  // block plate generation until the written design spec exists, so it's reviewed first
  const specBlocked = !!(specGate && !specGate.ready && !genUrl && !slotHasRef);

  return React.createElement("div",{className:"sheet-frame"},
    genUrl
      ? React.createElement("div",{className:"sheet-genwrap"},
          React.createElement("img",{className:"sheet-genimg",src:genUrl,alt:name+" "+noun,
            decoding:"async",loading:"lazy",
            onClick:()=>onView&&onView(genUrl, entity)}))
      : dropToImport
        // the drop zone IS the upload: drop a finished frame or click to browse \u2014 imported at
        // full resolution and committed as this frame, so it previews exactly like a generated one.
        ? React.createElement("div",{className:"sheet-dropzone"+(dropOver?" over":"")+(gening?" busy":""),
            role:"button",tabIndex:0,onClick:()=>{ if(!gening) pickUpload(); },
            onDragEnter:onZoneDragOver,onDragOver:onZoneDragOver,onDragLeave:onZoneDragLeave,onDrop:onZoneDrop,
            title:"Drop a finished "+noun+" here, or click to browse \u2014 it's imported at full resolution and becomes this "+noun},
            React.createElement(Icon.image,{s:26}),
            React.createElement("div",{className:"sheet-dropzone-cap"}, slotPlaceholder||("Drop a "+noun)),
            React.createElement("div",{className:"sheet-dropzone-sub"}, "or click to browse files"))
        : React.createElement(React.Fragment,null,
            React.createElement("image-slot",{id:slotId,className:"sheet-slot",
              shape:"rounded",radius:"10",placeholder:slotPlaceholder||"Drop reference art"}),
            slotHasRef && React.createElement("div",{className:"sheet-ref-pill"},
              React.createElement(Icon.bolt,{s:10,sw:2}),"Reference art active \u00b7 guides generation")),
    (genUrl || onDelete || importSheet) && React.createElement("div",{className:"sheet-gen-tools"},
      React.createElement("div",{className:"sheet-tools-menu",ref:menuRef},
        React.createElement("button",{className:"sheet-gen-tool",onClick:()=>setMenuOpen(m=>!m),title:"Options"},
          React.createElement(Icon.moreV,{s:14})),
        menuOpen && React.createElement("div",{className:"sheet-tools-dropdown"},
          genUrl && React.createElement("button",{className:"sheet-tools-item",onClick:()=>{ onView&&onView(genUrl,entity); setMenuOpen(false); }},
            React.createElement(Icon.eye,{s:13}),"View full"),
          genUrl && React.createElement("button",{className:"sheet-tools-item",onClick:()=>{ setDetailsOpen(true); setMenuOpen(false); }},
            React.createElement(Icon.info,{s:13}),"Details"),
          (genUrl && remasterEligible(genMeta)) && React.createElement("button",{className:"sheet-tools-item",disabled:gening,
            title:"Re-render the CURRENT image as a fresh, clean, full-quality version \u2014 same design, artifacts and noise removed (stacked edits degrade like a photocopy of a photocopy). Lands as a new version; the old one stays in history.",
            onClick:()=>{ setMenuOpen(false); generate({ editInstruction: (typeof remasterInstruction==="function")?remasterInstruction(noun):"Reproduce this image exactly, clean and artifact-free." }); }},
            React.createElement(Icon.sparkles,{s:13}),"Remaster \u2014 clean re-render"),
          genUrl && React.createElement("button",{className:"sheet-tools-item "+(editMode?"on":""),
            onClick:()=>{ setEditMode(m=>!m); setEditText(""); setMenuOpen(false); }},
            React.createElement(Icon.wand,{s:13}),editMode?"Close edit":"Edit "+noun),
          genUrl && React.createElement("button",{className:"sheet-tools-item",disabled:gening,
            onClick:()=>{ generate(); setMenuOpen(false); }},
            React.createElement(Icon.sparkles,{s:13}),"Regenerate"),
          // import a finished sheet generated outside the app (e.g. GPT Image 2 in ChatGPT)
          importSheet && React.createElement("button",{className:"sheet-tools-item",disabled:gening,
            title:"Import a finished image you generated elsewhere, at full resolution — it becomes this "+noun,
            onClick:()=>{ setMenuOpen(false); pickUpload(); }},
            React.createElement(Icon.image,{s:13}), genUrl?"Replace with upload":"Upload a sheet"),
          // caller-specific menu items (e.g. Shots: "Generate fresh sample")
          ...(menuExtra||[]).filter(Boolean).map((m,i)=>
            React.createElement("button",{key:"mx"+i,className:"sheet-tools-item",disabled:gening||m.disabled,title:m.title,
              onClick:()=>{ setMenuOpen(false); m.onClick&&m.onClick(); }},
              React.createElement(m.icon||Icon.sparkles,{s:13}), m.label)),
          genUrl && React.createElement("div",{className:"sheet-tools-divider"}),
          genUrl && React.createElement("button",{className:"sheet-tools-item danger",onClick:async ()=>{
              setMenuOpen(false);
              const vN = relatedClearCount||0;
              const extra = vN>0 ? (", plus "+vN+" variant sheet"+(vN>1?"s":"")+",") : "";
              const ok = await window.appConfirm({
                title: "Clear "+(name||"this")+"’s "+(noun||"sheet")+"?",
                body: "This permanently deletes the generated image and ALL earlier versions"+extra+" from cloud storage. The "+(noun||"sheet")+" can be regenerated — the written spec is kept.",
                note: vN>0 ? "Your cameo and linked props are kept. This can’t be undone."
                           : "This can’t be undone.",
                confirmLabel: "Clear", cancelLabel: "Cancel", danger: true,
              });
              if(ok) clearGen();
            }},
            React.createElement(Icon.x,{s:13}),"Clear"),
          onDelete && React.createElement("button",{className:"sheet-tools-item danger",onClick:()=>{ setMenuOpen(false); onDelete(); }},
            React.createElement(Icon.trash,{s:13}),deleteLabel||"Delete")))),
    editMode && React.createElement("div",{className:"sheet-edit-panel"},
      React.createElement("input",{className:"sheet-edit-input",type:"text",autoFocus:true,
        placeholder:"Describe changes\u2026  e.g. "+(noun==="prop sheet"?"make the metal brushed steel":"change jacket to black, add glasses"),
        value:editText,onChange:e=>setEditText(e.target.value),
        onKeyDown:e=>{ if(e.key==="Enter"&&editText.trim()) runEdit();
                       if(e.key==="Escape"){ setEditMode(false); setEditText(""); setEditRefs([]); } }}),
      // caller-supplied one-click instructions (e.g. a location's set-dressing
      // fixtures). Two modes per chip: the label inserts the ready instruction
      // (prompt-only), the clip ALSO attaches the fixture's generated sheet as a
      // reference image for this edit \u2014 locking the exact design when a sheet exists.
      (editSuggestions && editSuggestions.length>0) && React.createElement("div",{className:"sheet-edit-suggests"},
        React.createElement("span",{className:"sheet-edit-suggests-lab"},"Set dressing"),
        editSuggestions.map((s,i)=>{
          const insert = (extra)=> setEditText(t=>{ const base = t.trim() ? (t.trim().replace(/\.\s*$/,"")+". "+s.text) : s.text;
            return extra ? (base.replace(/\.\s*$/,"")+". "+extra) : base; });
          return React.createElement("span",{key:i,className:"sheet-edit-suggest-group"},
            React.createElement("button",{className:"sheet-edit-suggest",title:s.title,onClick:()=>insert("")},
              s.raw ? s.label : ("+ "+s.label)),
            s.getRef && React.createElement("button",{className:"sheet-edit-suggest refclip",
              title:"Insert the instruction AND attach "+s.label+"'s generated sheet as a reference image for this edit \u2014 the fixture lands exactly as designed. Needs the prop's sheet to exist (generate it on the Props tab).",
              onClick:async ()=>{
                let url=""; try{ url = await s.getRef(); }catch(e){}
                if(!url){ insert(""); if(window.appToast) window.appToast("No sheet for "+s.label+" yet \u2014 generate it on the Props tab to attach it. The text instruction still works."); return; }
                insert("Match the attached reference image of \""+s.label+"\" EXACTLY \u2014 its design (shape, materials, construction), never its studio lighting or background.");
                setEditRefs(rs=> rs.some(r=>r.url===url) ? rs : [...rs, { url, note:(s.label||"fixture")+" \u2014 prop sheet" }]);
              }},
              React.createElement(Icon.image,{s:11})));
        })),
      // attached IMAGE INPUTS \u2014 removable thumbs riding on the next Apply edit
      editRefs.length>0 && React.createElement("div",{className:"sheet-edit-refs"},
        editRefs.map((r,i)=>React.createElement("span",{key:i,className:"sheet-edit-refthumb",title:r.note+" \u2014 click to preview"},
          React.createElement("img",{src:r.url,alt:r.note,style:{cursor:"zoom-in"},
            onClick:()=>onView && onView(r.url,{ name:r.note })}),
          React.createElement("button",{className:"sheet-edit-refx",title:"Remove this image input",
            onClick:()=>setEditRefs(rs=>rs.filter((_,j)=>j!==i))},"\u00d7")))),
      React.createElement("div",{className:"sheet-edit-acts"},
        React.createElement("button",{className:"sheet-edit-apply",
          onClick:runEdit,disabled:!editText.trim()||gening,
          title: editRefs.length ? ("Runs the edit with "+editRefs.length+" attached image"+(editRefs.length>1?"s":"")+" as reference"+(editRefs.length>1?"s":"")) : "Runs the edit from the instruction"},
          React.createElement(Icon.wand,{s:12}),"Apply edit"),
        // Undo only when the CURRENT image is the product of an edit — a fresh
        // generation or an upload has no "before my last edit" to restore, even
        // when older versions exist in history (those live in Details / the viewer)
        (layers>0 && gen.genMeta && gen.genMeta.mode==="edit") && React.createElement("button",{className:"sheet-edit-undo",disabled:gening,
          title:"Restore the version before your last edit",onClick:()=>revertPrevious&&revertPrevious()},
          React.createElement(Icon.undo,{s:12}),"Undo"),
        // "+" \u2014 one square entry point for image inputs: upload from device, or attach
        // one of this entity's generated prop sheets (worn AND carried)
        React.createElement("span",{className:"sheet-edit-addwrap",ref:editAddRef},
          React.createElement("button",{className:"sheet-edit-addref"+(editAddOpen?" on":""),disabled:gening,
            title:"Add image input(s) to this edit \u2014 upload a reference photo/design, or attach one of this character's generated prop sheets.",
            onClick:(e)=>{
              const panel = e.currentTarget.closest(".sheet-edit-panel");
              const inp = panel && panel.querySelector(".sheet-edit-input");
              const r = (inp||e.currentTarget).getBoundingClientRect();
              setEditAddPos({ cx: Math.max(150, Math.min(r.left + r.width/2, window.innerWidth-150)),
                bottom: window.innerHeight - r.top + 8 });
              setEditAddOpen(o=>!o); }},"+"),
          editAddOpen && editAddPos && ReactDOM.createPortal(React.createElement("div",{className:"sheet-edit-addoverlay",
            onMouseDown:(e)=>{ if(e.target===e.currentTarget) setEditAddOpen(false); }},
            React.createElement("div",{className:"sheet-edit-addmenu",
              style:{ position:"fixed", left:editAddPos.cx+"px", bottom:editAddPos.bottom+"px", transform:"translateX(-50%)" }},
              React.createElement("div",{className:"sheet-edit-addtitle"},"Add image input"),
            React.createElement("button",{className:"sheet-tools-item",
              onClick:()=>{ setEditAddOpen(false); editFileRef.current && editFileRef.current.click(); }},
              React.createElement(Icon.image,{s:13}),"Upload from device\u2026"),
            (editPropRefs||[]).map(p=>React.createElement("button",{key:p.id,className:"sheet-tools-item",
              title:"Attach "+p.name+"'s locked sheet as an input. If the instruction box is empty, an 'update it to match this sheet exactly' instruction is written for you \u2014 edit it freely, then Apply.",
              onClick:async ()=>{
                setEditAddOpen(false);
                let url=(typeof nbGetImage==="function")?nbGetImage(p.id):"";
                if(!url && typeof nbLoadImage==="function"){ try{ url=await nbLoadImage(p.id); }catch(e){} }
                if(!url){ if(typeof window.appToast==="function") window.appToast("That prop has no generated sheet yet \u2014 generate it first"); return; }
                setEditRefs(rs=> rs.some(r=>r.url===url) ? rs : [...rs, { url, note:p.name, refId:p.id }]);
                if(!editText.trim()){
                  const verb = p.kind==="worn" ? "wears" : "carries";
                  setEditText("Update the "+p.name+" this character "+verb+" so it matches the attached prop reference sheet EXACTLY \u2014 same shape, materials, colours and construction. If the item isn't visible yet, add it where it naturally belongs. Keep EVERYTHING else identical: the face, body, pose, panel layout, rendering style, lighting and background.");
                }
              }},
              React.createElement(Icon.box,{s:13}), p.name.length>34 ? (p.name.slice(0,33)+"\u2026") : p.name)),
            !(editPropRefs||[]).length && React.createElement("div",{className:"sheet-edit-addnote"},
              "No generated prop sheets yet \u2014 carried props appear here once their sheets exist."))), document.body),
          React.createElement("input",{ref:editFileRef,type:"file",accept:"image/*",multiple:true,style:{display:"none"},
            onChange:e=>{ addEditFiles(e.target.files); e.target.value=""; }})),
        React.createElement("button",{className:"sheet-edit-cancel",
          onClick:()=>{ setEditMode(false); setEditText(""); setEditRefs([]); setEditAddOpen(false); }},"Cancel")),
      layers>0 && React.createElement("div",{className:"sheet-edit-layers"},
        React.createElement(Icon.history,{s:10}),
        layers+" earlier version"+(layers!==1?"s":"")+" \u00b7 see all in the \u2026 menu \u203a Details")),
    referenceControls,
    // generate + (while running) stop sit on ONE row — full-width when idle, 50/50 while generating
    React.createElement("div",{className:"sheet-gen-row"},
    React.createElement("button",{className:"sheet-gen-btn"+(generateDisabled&&!gening?" waiting":""),onClick:handleGenerateClick,disabled:!!generateDisabled||gening||(drafting&&pendingGenerate)||specBlocked,
      title:generateDisabled
        ? (generateDisabledTitle||"Wait for the current generation to finish first.")
        : (!drafted && !genUrl && !slotHasRef)
        ? "Fills the text spec from the script first, then generates the sheet in one step"
        : (genUrl ? "Generate a fresh sheet from the current spec" : "Generate the sheet from the current spec")},
      generateDisabled && !gening
        ? React.createElement(React.Fragment,null,React.createElement(Icon.clock,{s:13}),
            generateDisabledLabel||"Wait for current generation")
        : (gening || (drafting && pendingGenerate))
        ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),
            pendingGenerate ? "Drafting\u2026" :
            retrying ? "Retrying simplified\u2026" : "Generating\u2026")
        : React.createElement(React.Fragment,null,React.createElement(Icon.sparkles,{s:13}),
            specBlocked ? "Draft the spec first" :
            genUrl ? ("Regenerate "+noun) :
            (slotHasRef ? "Generate from photo" :
            (!drafted ? "Draft & Generate" : ("Generate "+noun))),
            !specBlocked && typeof window.nbCostChip==="function" && window.nbCostChip(1))),
    // Stop an in-flight generation — discards the result so it won't commit over the frame.
    gening && React.createElement("button",{className:"sheet-gen-stop",onClick:()=> onStop ? onStop() : (cancelGen && cancelGen()),
      title:"Stop this generation — nothing will be saved over the current frame"},
      React.createElement(Icon.x,{s:13}),"Stop")),
    // import a finished, full-res sheet generated outside the app (GPT Image 2, etc.)
    React.createElement("input",{ref:uploadRef,type:"file",accept:"image/png,image/jpeg,image/webp,image/avif",
      style:{display:"none"},onChange:onUploadPicked}),
    // when the empty slot already imports on drop/click (dropToImport), this button is redundant
    !genUrl && importSheet && !dropToImport && !hideUploadButton && noun!=="location plate" && React.createElement("button",{className:"sheet-upload-btn",onClick:pickUpload,disabled:gening,
      title:"Generated this elsewhere (e.g. GPT Image 2 in ChatGPT)? Upload it at full resolution — it becomes this "+noun+", with zoom, the … menu and clear, just like a generated one."},
      React.createElement(Icon.image,{s:12}),"Upload a finished "+noun),
    specBlocked && React.createElement("div",{className:"sheet-gen-gate"},
      React.createElement(Icon.alert,{s:12}),
      React.createElement("span",null,(specGate&&specGate.hint)||"Draft the design spec first — it's what the plate is built from.")),
    genErr && (()=>{
      const keyGate = /API key/i.test(genErr||"");
      // CORS / browser-unreachable (GPT Image): the ONLY real fix is switching
      // to the in-browser model, so make that the primary action and drop the
      // useless "simplified prompt" retry.
      const browserGate = /can't be generated directly in the browser|cross-origin/i.test(genErr||"");
      const cur = (typeof nbGetModel==="function") ? nbGetModel() : "";
      const other = allModels.find(m=>m.id!==cur);
      return React.createElement("div",{className:"sheet-gen-err"},
      React.createElement("div",{className:"sheet-gen-err-msg"},genErr),
      React.createElement("div",{className:"sheet-gen-err-acts"},
        /* missing/rejected key: jump straight to the key bar (it's at the top of
           the tab — on mobile that's a long scroll up, so do it for them) and
           focus the input. The simplified-prompt retry can't help without a key. */
        keyGate
          ? React.createElement("button",{className:"sheet-gen-err-btn primary",onClick:(e)=>{
              const sc = (e.target.closest && e.target.closest(".art-scroll")) || document.querySelector(".art-scroll");
              if(sc) sc.scrollTop = 0;
              const inp = document.querySelector(".nb-keybar .nb-key-input");
              if(inp){ try{ inp.focus({preventScroll:true}); }catch(_){ inp.focus(); } }
            }},"Set API key")
          : (browserGate
              ? (other && React.createElement("button",{className:"sheet-gen-err-btn primary",onClick:()=>generate({model:other.id})},"Switch to "+other.label))
              : React.createElement("button",{className:"sheet-gen-err-btn",onClick:()=>generate({simple:true})},"Try simplified prompt")),
        !browserGate && other && React.createElement("button",{className:"sheet-gen-err-btn",onClick:()=>generate({model:other.id})},"Try "+other.label))); })(),
    React.createElement("div",{className:"sheet-frame-cap"},
      slotHasRef && React.createElement("span",{className:"sheet-ref-chip"},
        React.createElement(Icon.bolt,{s:9,sw:2.2}),"Ref"),
      (genTier==="session"||genTier==="memory") && React.createElement("span",{
        className:"sheet-tier-warn",
        title:"Image is too large to save permanently — download it before closing or refreshing this tab"},
        React.createElement(Icon.warn,{s:10,sw:2}),"Session only \u00b7 download to keep"),
      genUrl && genMeta && genMeta.grounded && React.createElement("span",{
        className:"sheet-ground-chip",
        title:genMeta.groundImages ? "Generated with web grounding and image references" : "Generated with web grounding"},
        React.createElement(Icon.globe,{s:9,sw:2}),"Grounded"),
      genUrl && genMeta && genMeta.cameo && React.createElement("span",{
        className:"sheet-cameo-chip",
        title:"Face-locked to a cameo likeness"},
        React.createElement(Icon.userScan,{s:9,sw:1.8}),"Cameo"),
      genUrl && genMeta
        ? React.createElement("span",{className:"sheet-frame-meta"},
            React.createElement("span",{className:"sheet-meta-item",title:"Model: "+((genMeta.modelLabel||"")+(genMeta.modelId?(" ("+genMeta.modelId+")"):""))},
              React.createElement(Icon.sparkles,{s:10,sw:1.8}),
              /* show the commercial name (e.g. "GPT Image 2"), not the raw model id.
                 prefer the stored label, else look it up by id, else fall back to id. */
              genMeta.modelLabel || ((window.NB_MODELS||[]).find(m=>m.id===genMeta.modelId)||{}).label || genMeta.modelId),
            React.createElement("span",{className:"sheet-meta-item",title:"Aspect ratio"},
              React.createElement(Icon.image,{s:10,sw:1.8}),genMeta.aspect),
            React.createElement("span",{className:"sheet-meta-item",title:"Resolution"},
              React.createElement(Icon.monitor,{s:10,sw:1.8}),resLabel),
            // Quality (GPT Image only: low/medium/high) replaces the generated-date chip.
            // Uploads and Nano Banana carry no quality, so the chip is simply absent there.
            genMeta.quality && React.createElement("span",{className:"sheet-meta-item",title:"Quality",style:{textTransform:"capitalize"}},
              React.createElement((Icon.diamond||Icon.sparkles),{s:10,sw:1.8}),genMeta.quality),
            // generation DATE — shown on every sheet card (Lookbook, Characters,
            // Props, Locations, Shots). Prefer the stored short date; else derive it
            // from the iso timestamp. Time (when present) rides the tooltip.
            (()=>{ const d = genMeta.date || (genMeta.iso ? (()=>{ try{ return new Date(genMeta.iso).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); }catch(e){ return ""; } })() : "");
              if(!d) return null;
              return React.createElement("span",{className:"sheet-meta-item",title:"Generated"+(genMeta.time?(" \u00b7 "+genMeta.time):"")},
                React.createElement((Icon.calendar||Icon.clock),{s:10,sw:1.8}), d); })())
        : React.createElement("span",{className:"sheet-frame-cap-label"},genUrl?"Generated":"Reference frame")),
    /* Portal to <body>: the card has content-visibility:auto (paint/layout
       containment), which would otherwise make this card the containing block for
       the modal's position:fixed — trapping the overlay inside the card instead of
       covering the viewport (broken/clipped on small screens). */
    detailsOpen && ReactDOM.createPortal(React.createElement(SheetDetails,{ gen, name, noun, extraMeta,
      onClose:()=>setDetailsOpen(false), onView:(url)=>onView&&onView(url, entity) }), document.body));
}
window.SheetFrame = SheetFrame;
window.SheetDetails = SheetDetails;

/* ---- continuity surfacing: which appearance version of each character applies in a
   given scene. A state applies from its pinned scene onward (story order) until a
   later state supersedes it; before any pinned state a character is at base (v1). ---- */
function activeStateForScene(character, scene, scenes){
  const states = character.states || [];
  if(!states.length || !scene) return { version:1, state:null };
  const idxOf = (id)=> scenes.findIndex(s=>s.id===id);
  const sceneIdx = idxOf(scene.id);
  if(sceneIdx<0) return { version:1, state:null };
  let best=null, bestPos=-1, bestVersion=1;
  states.forEach((st,i)=>{
    if(!st.sceneId) return;
    const pos = idxOf(st.sceneId);
    if(pos>=0 && pos<=sceneIdx && pos>=bestPos){ best=st; bestPos=pos; bestVersion=i+2; }
  });
  return { version:bestVersion, state:best };
}
window.activeStateForScene = activeStateForScene;

/* SceneContinuity — a compact per-scene panel: the appearance version of every character
   that has states, with a flag when the applicable state has no generated sheet yet. */
function SceneContinuity({ scene, scenes, characters }){
  const tracked = (characters||[]).filter(c=>(c.states||[]).length);
  const [sheets, setSheets] = React.useState({});   // stateGlobalId -> bool
  React.useEffect(()=>{
    let alive = true;
    const probe = async ()=>{
      const out = {};
      for(const c of tracked){
        const { state } = activeStateForScene(c, scene, scenes);
        if(state){
          const gid = c.id+":"+state.id;
          let has = (typeof nbGetImage==="function" && !!nbGetImage(gid));
          if(!has && typeof nbLoadImage==="function"){ try{ has = !!(await nbLoadImage(gid)); }catch(e){} }
          out[gid] = has;
        }
      }
      if(alive) setSheets(out);
    };
    probe();
    return ()=>{ alive=false; };
  },[scene && scene.id, tracked.map(c=>c.id+":"+(c.states||[]).map(s=>s.id+s.sceneId).join()).join("|")]);

  if(!tracked.length) return null;
  return React.createElement("div",{className:"insp-block"},
    React.createElement("div",{className:"insp-block-head"},
      React.createElement("span",{className:"eyebrow"},React.createElement(Icon.user,{s:12}),"Continuity \u00b7 appearance")),
    React.createElement("div",{className:"cont-list"},
      tracked.map(c=>{
        const { version, state } = activeStateForScene(c, scene, scenes);
        const gid = state ? (c.id+":"+state.id) : null;
        const missing = state && sheets[gid]===false;
        return React.createElement("div",{key:c.id,className:"cont-row"},
          React.createElement("span",{className:"cont-av",style:{background:c.color}},
            c.name.split(" ").map(w=>w[0]).slice(0,2).join("")),
          React.createElement("div",{className:"cont-info"},
            React.createElement("div",{className:"cont-name"},c.name),
            React.createElement("div",{className:"cont-state"},
              state ? state.label : "Base look")),
          React.createElement("span",{className:"cont-vtag"+(state?"":" base")},"v"+version),
          missing && React.createElement("span",{className:"cont-warn",title:"This appearance state has no generated sheet yet"},
            React.createElement(Icon.warn,{s:11,sw:2})));
      })));
}
window.SceneContinuity = SceneContinuity;

function CopyBox({ label, text }){
  const [copied, setCopied] = React.useState(false);
  const copy = async ()=>{
    let ok = false;
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        await navigator.clipboard.writeText(text); ok = true;
      }
    }catch(e){ ok = false; }
    if(!ok){
      // fallback for sandboxed iframes / non-secure contexts where the async
      // Clipboard API is blocked: select a hidden textarea and execCommand('copy')
      try{
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly","");
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
        document.body.appendChild(ta);
        ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      }catch(e){ ok = false; }
    }
    setCopied(true); setTimeout(()=>setCopied(false), 1400);
  };
  const [open, setOpen] = React.useState(false);
  React.useEffect(()=>{
    if(!open) return;
    const h=(e)=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("keydown",h);
    return ()=>document.removeEventListener("keydown",h);
  },[open]);
  const chars = String(text||"").length;
  return React.createElement("div",{className:"copybox"},
    React.createElement("div",{className:"copybox-head"},
      React.createElement("span",{className:"copybox-lab"},label),
      React.createElement("div",{className:"copybox-actions"},
        React.createElement("button",{className:"copybox-btn",onClick:()=>setOpen(true),
          title:"Preview the full prompt in a larger window"},
          React.createElement(Icon.maximize||Icon.eye,{s:12}), "Preview"),
        React.createElement("button",{className:"copybox-btn",onClick:copy},
          React.createElement(Icon[copied?"check":"copy"]||Icon.check,{s:12}), copied?"Copied":"Copy"))),
    React.createElement("div",{className:"copybox-text",onClick:()=>setOpen(true),
      title:"Click to preview the full prompt"},text),
    open && ReactDOM.createPortal(
      React.createElement("div",{className:"bible-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) setOpen(false); }},
        React.createElement("div",{className:"copybox-modal"},
          React.createElement("div",{className:"copybox-modal-head"},
            React.createElement("span",{className:"copybox-modal-lab"},label),
            React.createElement("span",{className:"copybox-modal-count"}, chars.toLocaleString()+" characters"),
            React.createElement("button",{className:"copybox-btn",onClick:copy},
              React.createElement(Icon[copied?"check":"copy"]||Icon.check,{s:13}), copied?"Copied":"Copy prompt"),
            React.createElement("button",{className:"copybox-modal-x",onClick:()=>setOpen(false),title:"Close (Esc)"},
              React.createElement(Icon.x,{s:16}))),
          React.createElement("div",{className:"copybox-modal-body"},text))),
      document.body)
  );
}

/* drop a dangling, mid-word fragment left by an older hard-truncation (e.g.
   "...broken things. N") back to the last complete sentence. Display-only and
   safe: text that already ends cleanly is returned unchanged. */
function tidyTruncated(s){
  s = String(s||"").trim();
  if(!s || /[.!?\u2026"')\]]$/.test(s)) return s;   // already ends cleanly
  const m = s.match(/^[\s\S]*[.!?\u2026]/);          // cut back to the last sentence end
  return m ? m[0].trim() : s;
}

function SheetField({ label, value, placeholder, multiline, list, onCommit, onItemRemoved, onItemRenamed, ownerName }){
  return React.createElement("div",{className:"sheet-field"},
    React.createElement("div",{className:"obj-lab"},label),
    list
      ? React.createElement(EditableItemList,{value,placeholder,onCommit,onItemRemoved,onItemRenamed,ownerName})
      : React.createElement(EditText,{value,placeholder,multiline,onCommit}));
}

function PaletteRow({ palette }){
  return React.createElement("div",{className:"pal-row"},
    palette.map((p,i)=>React.createElement("div",{key:i,className:"pal-chip",title:p.name+" "+p.hex},
      React.createElement("span",{className:"pal-sw",style:{background:p.hex}}),
      React.createElement("span",{className:"pal-name"},p.name))));
}

function CardFold({ label, count, defaultOpen, children }){
  const [open, setOpen] = React.useState(!!defaultOpen);
  return React.createElement("div",{className:"sheet-fold "+(open?"open":"")},
    React.createElement("button",{className:"sheet-fold-head",onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"sheet-fold-ic"},React.createElement(open?Icon.chevD:Icon.chevR,{s:12})),
      React.createElement("span",{className:"sheet-sec",style:{margin:0,border:0,padding:0}},label),
      count!=null && React.createElement("span",{className:"sheet-fold-count"},count)),
    open && React.createElement("div",{className:"sheet-fold-body"},children));
}

/* RecentlyDeleted — the per-tab restore bin. Lists soft-deleted characters / props /
   locations (each kept with its scenes, full spec and generated sheet) with Restore and
   Delete-forever. Collapsed by default; renders nothing when the bin is empty. Shared by
   all three Art Room tabs via window.RecentlyDeleted. */
function RecentlyDeleted({ items, kind, onRestore, onPurge }){
  const [open, setOpen] = React.useState(false);
  if(!items || !items.length) return null;
  const noun = kind==="character" ? "character" : kind==="location" ? "location" : "prop";
  const rel = (iso)=>{ if(!iso) return ""; const ms=Date.now()-new Date(iso).getTime();
    const m=Math.round(ms/60000); if(m<1) return "just now"; if(m<60) return m+"m ago";
    const h=Math.round(m/60); if(h<24) return h+"h ago"; return Math.round(h/24)+"d ago"; };
  return React.createElement("div",{className:"recently-deleted"+(open?" open":"")},
    React.createElement("button",{className:"rd-head",onClick:()=>setOpen(o=>!o)},
      React.createElement(Icon.trash,{s:12}),
      React.createElement("span",null,"Recently deleted"),
      React.createElement("span",{className:"rd-count"}, items.length),
      React.createElement("span",{className:"rd-chev"}, React.createElement(open?Icon.chevD:Icon.chevR,{s:12}))),
    open && React.createElement("div",{className:"rd-list"},
      items.map(it=>React.createElement("div",{key:it.id,className:"rd-row"},
        React.createElement("span",{className:"rd-name",title:it.name||it.title||""}, it.name||it.title||("Untitled "+noun)),
        it._deletedAt && React.createElement("span",{className:"rd-when"}, rel(it._deletedAt)),
        React.createElement("button",{className:"rd-restore",onClick:()=>onRestore&&onRestore(it.id),
          title:"Restore this "+noun+" with its scenes & spec"},
          React.createElement(Icon.undo,{s:12}),"Restore"),
        React.createElement("button",{className:"rd-purge",title:"Delete forever",
          onClick:async ()=>{ const ok=await window.appConfirm({ title:"Delete “"+(it.name||it.title||"this "+noun)+"” forever?",
            body:"This permanently removes it and its reference sheet from the project. This can't be undone.",
            confirmLabel:"Delete forever", danger:true });
            if(ok && onPurge) onPurge(it.id); }},
          React.createElement(Icon.x,{s:12}))))));
}
window.RecentlyDeleted = RecentlyDeleted;

/* StateRow — one appearance state (continuity variant) as its own v2+ sheet, generated
   as an identity-locked edit of the base character sheet so the variant is provably the
   same character. Falls back to a text spec when no base image exists yet. */
function StateRow({ c, st, index, project, scenes, props, baseGenUrl, onView, onChange, onDelete }){
  const vtag = "v"+(index+2);
  const stateId = c.id+":"+st.id;
  const baseFinal = (typeof combinedImagePrompt==="function") ? combinedImagePrompt(c, project, props) : buildCharRefPrompt(c, project, props);
  const changeText = ()=> (st.change||"").replace(/\.$/,"").trim();

  const buildFromBase = ()=>
    "Edit this character design sheet for "+(c.name||"the character")+". "
    +"Apply this appearance change: "+(changeText()||"(no specific change given)")+". "
    +"Keep the EXACT same face, hair colour and style, skin tone, body proportions and identity in every view \u2014 "
    +"only the described change should differ from the reference. "
    +"Maintain the reference sheet's EXISTING layout, panel arrangement, render style and framing. Do not re-imagine the character.";
  const buildFinal = ()=> baseFinal + " APPEARANCE STATE \u2014 "+(st.label||"variant")+": "
    + (changeText()||"") + ". Render the character in THIS changed state consistently across every panel.";
  const buildSimple = ()=> ((typeof buildSimpleCharPrompt==="function") ? buildSimpleCharPrompt(c) : "Character reference")
    + ". " + (changeText()||"");

  const gen = useImageGen({
    id: stateId, slotId: "charref-"+stateId,
    entity: c,
    cameoId: c.id,
    buildFinal: buildFinal,
    buildFromBase: baseGenUrl ? buildFromBase : null,
    referenceFallback: baseGenUrl ? (()=>baseGenUrl) : null,
    buildFromPhoto: ()=> buildFromBase(),
    buildSimple: buildSimple,
    buildEdit: (instr)=>
      "Edit this character design sheet for "+(c.name||"the character")+" ("+(st.label||"variant")+" state). "
      +"Apply ONLY this change: "+instr+". Preserve the same face, identity and the "+(st.label||"variant")
      +" appearance otherwise, in every view. Keep the sheet's existing layout. Do not re-imagine the character.",
  });
  const viewEntity = { ...c, name: c.name+" \u2014 "+(st.label||"variant") };

  return React.createElement("div",{className:"state-row"},
    React.createElement("div",{className:"state-row-head"},
      React.createElement("span",{className:"state-vtag"},vtag),
      React.createElement("div",{className:"state-label"},
        React.createElement(EditText,{value:st.label,placeholder:"State name\u2026",onCommit:val=>onChange({label:val})})),
      st.suggested && React.createElement("span",{className:"state-ai-chip",title:"Suggested by MUSE from the script"},"AI"),
      React.createElement("button",{className:"state-del",title:"Remove state",onClick:onDelete},React.createElement(Icon.x,{s:13}))),
    React.createElement(SheetFrame,{ gen, slotId:"charref-"+stateId, name:viewEntity.name,
      avatarColor:c.color, initials:vtag, drafted:true, drafting:false, onDraft:()=>{}, entity:viewEntity,
      onView, slotPlaceholder:"Drop reference art for this state", noun:vtag+" sheet" }),
    gen.genUrl && React.createElement("div",{className:"card-qa-row"},
      React.createElement(QaCheckButton,{ gen, name:(viewEntity.name||"")+" \u00b7 "+(st.label||vtag), noun:vtag+" sheet",
        specFields:()=>({ what_changed:(st.change||"") }),
        onApplySpec:(patch)=>{ if(patch.what_changed!=null) onChange({ change:patch.what_changed, suggested:false }); } })),
    !baseGenUrl && React.createElement("div",{className:"state-hint"},
      React.createElement(Icon.alert,{s:11}),
      "Generate the base sheet above for identity-locked results \u2014 until then this uses the text spec."),
    React.createElement(SheetField,{label:"What changed",value:st.change,multiline:true,
      placeholder:"The visible difference from the base look \u2014 torn shirt, cut brow, dried blood\u2026",
      onCommit:val=>onChange({change:val,suggested:false})}),
    React.createElement("div",{className:"sheet-field"},
      React.createElement("div",{className:"obj-lab"},"First appears in"),
      React.createElement("select",{className:"prop-select",value:st.sceneId||"",onChange:e=>onChange({sceneId:e.target.value})},
        React.createElement("option",{value:""},"Not pinned"),
        scenes.map(s=>React.createElement("option",{key:s.id,value:s.id},"Sc "+s.no+" \u00b7 "+s.title)))));
}

function CharacterSheet({ c, project, scenes, props, drafts, speaks, onUpdate, onDraft, drafting, onView, onSuggestStates, suggestingStates, onRemoveOwnedItem, onRenameOwnedItem, onDraftProp, onCreateOwnedProp, batchActiveId, onBatchDone, onDelete }){
  const drivenScenes = scenes.filter(s=>s.driver===c.id);
  const driven = drivenScenes.length;
  // ALL scenes this character appears in (drives OR is named in the script/summary), not
  // just the ones they drive — driven scenes are marked so both reads at a glance.
  const drivenIds = new Set(drivenScenes.map(s=>s.id));
    const appearsScenes = React.useMemo(()=>{
    const ids = (typeof scenesWhereCharacterAppears==="function")
      ? scenesWhereCharacterAppears(c.id, c.name, scenes, drafts)
      : drivenScenes.map(s=>s.id);
    const set = new Set(ids);
    return (scenes||[]).filter(s=>set.has(s.id)).sort((a,b)=>(a.no||0)-(b.no||0));
  },[c.id, c.name, scenes, drafts]);
  // role packs FUNCTION · ARCHETYPE — IDENTITY in one string; show & edit each
  // part as its own labelled line, re-composed back into c.role on every edit.
  const roleParts = parseRole(c.role);
  const setRolePart = (patch)=> onUpdate(c.id, { role: composeRole({ ...roleParts, ...patch }) });
  // Role, Archetype and Identity are all always shown, in that order. Archetype
  // sits before Identity; an empty one reveals its placeholder only on focus (CSS).
  const [roleOpen, setRoleOpen] = React.useState(false);   // collapsed by default to keep the card compact
  const roleSummary = composeRole({ ...roleParts, identity: capFirst(roleParts.identity) }) || "Role";
  const v = charVisualDefaults(c);
  const promptText = buildCharRefPrompt(c, project, props);
  const finalPrompt = (typeof combinedImagePrompt==="function") ? combinedImagePrompt(c, project, props) : promptText;
  const drafted = charVisualsDrafted(c);
  const initials = c.name.split(" ").map(w=>w[0]).slice(0,2).join("");
  const palette = (c.palette && c.palette.length) ? c.palette : v.palette;

  /* props this character owns (carried/worn) — their generated sheets become extra
     visual references when generating this character's sheet */
  const ownedProps = (props||[]).filter(p=>p.ownerId===c.id);
  // Only WORN props become part of the character SHEET (glasses, coat, watch — the
  // permanent look). CARRIED props (phone, gun, pills) are situational, so they're
  // attached at the SHOT level instead, never baked into the neutral turnaround.
  const wornProps = ownedProps.filter(p=> p.kind!=="carried");
  /* "orphans" = prop cards that were DERIVED from the cast (fromCast) but whose name
     no longer matches any worn/carried bullet above — i.e. leftovers from an old bad
     text-split like "Aud" or "Possessive)". Curated / hand-added props (fromCast not
     set) are never flagged, since they're allowed to exist without a matching bullet. */
  // "And a silver ring" and "a silver ring" are the same item — strip the conjunction too
  const normName = s=> String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").replace(/^(?:and-|then-)/,"").slice(0,40);
  /* Resolve each WORN/CARRIED bullet to its prop card. Exact normalised-name match
     first; when that fails (a re-draft re-worded the item, or the card was drafted
     from older text) fall back to the OBJECT — same head noun, then strong word
     overlap — so the link survives re-phrasings. Each card matches at most once. */
  const linkInfo = React.useMemo(()=>{
    const split = (typeof splitListItems==="function") ? splitListItems : (v=>String(v||"").split(","));
    const byNorm = {};
    ownedProps.forEach(p=>{ const n=normName(p.name); if(!(n in byNorm)) byNorm[n]=p; });
    const claimed = new Set();
    /* descriptor words shared by MANY different objects — never evidence two
       names mean the same thing (the object words have to do that) */
    const STOP = new Set(["worn","carried","with","without","around","behind","over","under","left","right",
      "thin","small","large","heavy","wide","long","short","black","white","grey","gray","dark","pale",
      "vintage","simple","plain","portable","battered","tarnished","brushed","polished","unpolished",
      "subtle","filled","wrapped","showing","holding","their","there","that","this","into","onto"]);
    const wordsOf = (s)=> (String(s||"").toLowerCase().match(/[a-z]{4,}/g) || []).filter(w=>!STOP.has(w));
    /* score every unclaimed card and take the best: shared object-words count
       double, the card's head noun appearing in the bullet adds one. A score
       under 3 (i.e. less than 2 shared words, or 1 word + the object noun) is
       not evidence — better an honest "no sheet yet" than a wrong link. */
    const fuzzyProp = (item)=>{
      const toks = new Set(wordsOf(item));
      const low = " "+String(item).toLowerCase()+" ";
      let best=null, bestScore=0;
      ownedProps.forEach(p=>{ if(claimed.has(p.id)) return;
        const shared = wordsOf(p.name).filter(t=>toks.has(t)).length;
        const candHead = (typeof propHeadNoun==="function") ? propHeadNoun(p.name) : "";
        const headHit = candHead && low.indexOf(" "+candHead)>=0 ? 1 : 0;
        const score = shared*2 + headHit;
        if(score>=3 && score>bestScore){ best=p; bestScore=score; } });
      return best;
    };
    /* two passes: every EXACT match claims its card first, then re-phrasings
       fall back to the object — so a fuzzy match can never steal a card whose
       exact bullet appears later in the list */
    // "none" / "n/a" are the drafter's placeholders for EMPTY, never items — without
    // this they render as phantom "none · NO SHEET YET" linked-prop rows
    const bullets = [...split(c.accessories).map(t=>({ t, src:"worn" })), ...split(c.props).map(t=>({ t, src:"carried" }))]
      .filter(b=>{ const n=normName(b.t); return n && !/^(none|n-?a|nothing|no-items?)$/.test(n); });
    const match = bullets.map(b=>{
      const exact = byNorm[normName(b.t)];
      if(exact && !claimed.has(exact.id)){ claimed.add(exact.id); return exact; }
      return null;
    });
    bullets.forEach((b,i)=>{ if(match[i]) return;
      const m = fuzzyProp(b.t); if(m){ claimed.add(m.id); match[i]=m; } });
    const rows = bullets.map((b,i)=>(
      { key:"b-"+normName(b.t)+"-"+i, name: match[i]?match[i].name:b.t, prop: match[i]||null, orphan:false, src:b.src }));
    /* orphans = cast-derived cards no bullet claimed (even fuzzily) — true leftovers */
    const orphans = ownedProps.filter(p=> p.fromCast && !claimed.has(p.id));
    orphans.forEach(p=> rows.push({ key:"o-"+p.id, name:p.name, prop:p, orphan:true }));
    return { rows, orphans };
  },[c.accessories, c.props, ownedProps.map(p=>p.id).join(",")]);
  const linkedRows = linkInfo.rows;
  const orphanProps = linkInfo.orphans;
  const collectAttachments = async ()=>{
    const out = [];
    for(const p of wornProps){
      let url = (typeof nbGetImage==="function") ? nbGetImage(p.id) : "";
      if(!url && typeof nbLoadImage==="function"){ try{ url = await nbLoadImage(p.id); }catch(e){} }
      if(url) out.push({ url, note: p.name+(p.kind?(" ("+p.kind+")"):""), refId:p.id });
    }
    return out;
  };
  /* which owned props currently have a generated sheet (for the linked-props indicator) */
  const [ownedSheetMap, setOwnedSheetMap] = React.useState({});
  const [sheetTick, setSheetTick] = React.useState(0);   // bump to re-check sheet presence
  // inline per-row prop generation (user ruling 2026-07-18: generate a linked prop's
  // sheet right from the character card — no Props-tab hop). kind: "draft"|"gen".
  const [propBusy, setPropBusy] = React.useState(null);   // {id, kind}
  const [prepProps, setPrepProps] = React.useState(null);   // {done,total,name} while generating props inline
  const preparingRef = React.useRef(false);
  React.useEffect(()=>{
    let alive=true;
    (async()=>{
      const m={};
      for(const p of ownedProps){
        let url=(typeof nbGetImage==="function")?nbGetImage(p.id):"";
        if(!url && typeof nbLoadImage==="function"){ try{ url=await nbLoadImage(p.id);}catch(e){} }
        m[p.id]=!!url;
      }
      if(alive) setOwnedSheetMap(m);
    })();
    return ()=>{alive=false;};
  },[ownedProps.map(p=>p.id).join(","), ownedProps.length, sheetTick]);
  /* legit linked props (excluding orphan cards) that have NO generated sheet yet —
     used to warn before generating a character that would miss those references. */
  const orphanIds = React.useMemo(()=> new Set(orphanProps.map(p=>p.id)), [orphanProps]);
  // WORN items no longer demand their own sheets — the CHARACTER SHEET is their canon
  // (they render on the body, composed with fit and light). A separately generated worn
  // sheet just creates a second, conflicting design. So the "generate props first"
  // gate is retired for worn items; existing worn sheets still attach if present.
  const missingPropSheets = [];
  /* refresh prop-readiness when one of THIS character's props finishes generating
     (e.g. the inline "generate props first" flow completing after a tab switch). */
  React.useEffect(()=>{
    const ids = new Set(ownedProps.map(p=>p.id));
    const onDone = (e)=>{ const did = e && e.detail && e.detail.id; if(did && ids.has(did)) setSheetTick(t=>t+1); };
    window.addEventListener("nb-gen-done", onDone);
    return ()=>window.removeEventListener("nb-gen-done", onDone);
  },[ownedProps.map(p=>p.id).join(",")]);

  /* appearance states (continuity variants) */
  const states = c.states || [];
  const updateStates = (next)=> onUpdate(c.id, { states: next });

  /* cameo (locked likeness) — Increment A */
  const [cameoOpen, setCameoOpen] = React.useState(false);
  const [cameoMeta, setCameoMeta] = React.useState(()=> (typeof nbCameoMeta==="function") ? nbCameoMeta(c.id) : null);
  /* voice (locked timbre) — lives on the card now, parallel to Cameo */
  const [voiceOpen, setVoiceOpen] = React.useState(false);
  const voiceLocked = !!(c.voiceLock && c.voiceLock.voiceId);
  // render-style picker: which visual language the sheet is drawn in (per character). For
  // "surprise" we invent a bespoke style from the bible (once) and cache it on the card.
  const [styling, setStyling] = React.useState(false);
  // the "saved · unlock" chip is a TRANSIENT confirmation — show ~4s after the card lands on one
  // of the user's own locked styles, then auto-hide (unlock later via the Styles manager).
  const [unlockVisible, setUnlockVisible] = React.useState(false);
  React.useEffect(()=>{
    if(window.turnIsUserStyle && window.turnIsUserStyle(c.renderStyleKey)){
      setUnlockVisible(true); const t=setTimeout(()=>setUnlockVisible(false),4000); return ()=>clearTimeout(t);
    }
    setUnlockVisible(false);
  },[c.renderStyleKey]);
  const pickRenderStyle = async (key)=>{
    if(key!=="surprise"){ onUpdate(c.id, { renderStyleKey:key }); return; }
    onUpdate(c.id, { renderStyleKey:"surprise" });
    if(c.surpriseRender && c.surpriseRender.render) return;   // already invented — keep it
    if(typeof aiSurpriseRenderStyle!=="function" || !(typeof aiAvailable==="function" && aiAvailable())) return;
    setStyling(true);
    try{ const r = await aiSurpriseRenderStyle(c, project); if(r) onUpdate(c.id, { surpriseRender:r }); }
    catch(e){} finally{ setStyling(false); }
  };
  const reSurprise = async ()=>{
    if(typeof aiSurpriseRenderStyle!=="function" || styling) return;
    setStyling(true);
    try{ const r = await aiSurpriseRenderStyle(c, project); if(r) onUpdate(c.id, { surpriseRender:r }); }
    catch(e){} finally{ setStyling(false); }
  };
  // LOCK a surprise style the user likes → a reusable named style (Characters/Props/Locations)
  const lockSurprise = async ()=>{
    if(!(c.surpriseRender && c.surpriseRender.render) || typeof window.turnLockRenderStyle!=="function") return;
    const key = await window.turnLockRenderStyle(c.surpriseRender.label, c.surpriseRender.render);
    if(key){ onUpdate(c.id, { renderStyleKey:key });
      if(typeof window.appToast==="function") window.appToast("Style locked — now reusable across Characters, Props & Locations"); }
  };
  const unlockCurrent = async ()=>{
    if(!(window.turnIsUserStyle && window.turnIsUserStyle(c.renderStyleKey))) return;
    const ok = window.appConfirm ? await window.appConfirm({ title:"Unlock this saved style?",
      body:"It's removed from your saved styles. Cards still using it fall back to their scale-aware default render style." }) : true;
    if(!ok) return; const k=c.renderStyleKey; window.turnUnlockRenderStyle(k); onUpdate(c.id,{ renderStyleKey:"" });
  };
  const refreshCameo = ()=>{ if(typeof nbCameoMeta==="function") setCameoMeta(nbCameoMeta(c.id)); };
  const removeCameo = async ()=>{
    const ok = await window.appConfirm({
      title: "Remove "+c.name+"'s cameo likeness?",
      body: "Future generations won't be face-locked to it.",
      confirmLabel: "Remove", danger: true,
    });
    if(!ok) return;
    if(typeof nbClearCameo==="function") await nbClearCameo(c.id);
    refreshCameo();
  };
  const addState = ()=> updateStates([...states, { id:"st-"+Date.now().toString(36), label:"New state", change:"", sceneId:"" }]);
  const updateState = (id,patch)=> updateStates(states.map(s=>s.id===id?{...s,...patch}:s));
  const deleteState = (id)=>{
    if(typeof nbClearAsset==="function") nbClearAsset(c.id+":"+id);
    updateStates(states.filter(s=>s.id!==id));
  };
  const gen = useImageGen({
    id: c.id, slotId: "charref-"+c.id,
    entity: c,
    cameoId: c.id,
    /* Clear cascades to this character's appearance-state variant sheets so they
       aren't orphaned (cameo + linked props are preserved). */
    relatedClearIds: ()=> (c.states||[]).map(s=> c.id+":"+s.id),
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildRefFromPhotoPrompt(c, project),
    buildSimple: ()=> (typeof buildSimpleCharPrompt==="function") ? buildSimpleCharPrompt(c) : finalPrompt,
    attachments: wornProps.length ? collectAttachments : null,
    /* warn-and-confirm: if any linked prop has no sheet, it'll be drawn from text
       only (not a locked reference). Three choices: generate the missing prop sheets
       inline first (no tab switch), continue without, or cancel. */
    beforeGenerate: async ()=>{
      if(preparingRef.current) return false;          // re-entry guard while prepping
      if(!missingPropSheets.length) return true;
      const list = missingPropSheets.slice();          // freeze the set for this run
      const n = list.length;
      const choice = await window.appConfirm({
        title: n+" linked prop"+(n>1?"s have":" has")+" no reference sheet yet",
        body: "Generating "+(c.name||"this character")+" now would render "+(n>1?"these items":"this item")
          +" from the text description only — not a locked prop sheet — so "+(n>1?"they":"it")
          +" may not match "+(n>1?"their":"its")+" final design.",
        items: list.map(p=>p.name||"Prop"),
        note: "Generate the missing sheet"+(n>1?"s":"")+" now (no tab switch), or continue without.",
        confirmLabel: "Generate "+n+" prop"+(n>1?"s":"")+" first",
        altLabel: "Generate without",
        cancelLabel: "Cancel",
      });
      if(choice===false) return false;                 // Cancel → abort
      if(choice==="alt") return true;                  // continue without prop sheets
      // primary: generate the missing prop sheets inline, then continue (the fresh
      // sheets are picked up by collectAttachments at character-generate time).
      if(typeof window.generatePropSheet==="function"){
        preparingRef.current = true;
        for(let i=0;i<list.length;i++){
          setPrepProps({ done:i, total:n, name:list[i].name||"prop" });
          try{ await window.generatePropSheet(list[i], project); }catch(e){}
        }
        setPrepProps(null);
        preparingRef.current = false;
        setSheetTick(t=>t+1);                          // refresh the "has sheet" indicators
      }
      return true;
    },
    buildEdit: (instr)=>
      "Edit this character design sheet for "+(c.name||"the character")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else without alteration \u2014 the exact same face, hair colour and style, "
      +"skin tone, body proportions, and physical identity in every view. "
      +"Keep the sheet's existing layout and panel arrangement. "
      +"Do not replace or re-imagine the character.",
  });

  // SCALE SHEET — the height-chart asset (its own slot). Rendered FROM the master sheet so
  // identity matches, on a PORTRAIT canvas, with the ruler markings for this character's
  // scale class. The generate button forces 9:16 regardless of the engine-dock aspect.
  const scaleSheetGen = useImageGen({
    id: "charscale-"+c.id, slotId: "charscale-"+c.id,
    entity: c,
    buildFinal:    ()=> (typeof buildScaleSheetPrompt==="function") ? buildScaleSheetPrompt(c) : "",
    buildSimple:   ()=> (typeof buildScaleSheetPrompt==="function") ? buildScaleSheetPrompt(c) : "",
    buildFromBase: ()=> (typeof buildScaleSheetPrompt==="function") ? buildScaleSheetPrompt(c) : "",
    referenceFallback: async ()=>{ let u=(typeof nbGetImage==="function")?nbGetImage(c.id):"";
      if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(c.id); }catch(e){} } return u||null; },
    referenceMaxDim: 768,
    buildEdit: (instr)=> "Edit this height/scale chart. Apply ONLY this change: "+instr+". Keep the figure, the vertical ruler and its markings otherwise identical.",
  });
  const scaleGenWrapped = Object.assign({}, scaleSheetGen, { generate:(o)=>scaleSheetGen.generate({ aspectRatio:"9:16", ...(o||{}) }) });

  // batch generation: when this card is the active queue member, fire one generate
  // and report back when it settles (mirrors the Props/Locations cards).
  // REMOUNT-SAFE: a card can remount WHILE it is the active member and its generation
  // is already in flight (each commit re-renders the cast). A fresh instance's
  // batchStarted ref would start false, skip the fire-branch during gening, then wrongly
  // fire a SECOND generate on completion — two versions from one click. So seed the ref
  // from the module in-flight registry: if a generation is already running for this
  // slot, this instance treats itself as already-started and only reports completion.
  const _slot = "charref-"+c.id;
  const batchStarted = React.useRef(!!(window.__nbGenInflight && window.__nbGenInflight[_slot]));
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===c.id;
    const inflight = !!(window.__nbGenInflight && window.__nbGenInflight[_slot]);
    if(!mine){ batchStarted.current = inflight; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening && !inflight){ batchStarted.current=true; wasGening.current=false; gen.generate({ batch:true }); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(c.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, c.id]);

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===c.id?" batch-on":""),"data-char-card":c.id},
    React.createElement(SheetFrame,{ gen, slotId:"charref-"+c.id, name:c.name, avatarColor:c.color,
      initials, drafted, drafting, onDraft:()=>onDraft(c), entity:c, onView,
      slotPlaceholder:"Drop reference art", noun:"sheet",
      // The empty slot is also the finished-image importer (full resolution, like the Locations
      // plate), so the separate "Upload a finished sheet" button is intentionally omitted.
      dropToImport:true,
      specGate:{ ready:(drafted || !c.manual), hint:"Draft the design spec first \u2014 look & wardrobe are what the sheet is built from." },
      // "Update a prop" chips in the sheet-edit panel: THIS character's own props
      // (worn or carried) that already have a locked prop sheet
      editPropRefs: ownedProps.filter(p=>ownedSheetMap[p.id]).map(p=>({id:p.id, name:p.name, kind:p.kind})),
      onDelete:(onDelete && c.manual)?(()=>onDelete(c.id)):null, deleteLabel:"Delete character" }),
    React.createElement("div",{className:"sheet-body"},
      (drafting && !drafted) && React.createElement("div",{className:"char-drafting-strip"},
        React.createElement("span",{className:"ns-spin"}),"Drafting from script\u2026"),
      prepProps && React.createElement("div",{className:"char-drafting-strip"},
        React.createElement("span",{className:"ns-spin"}),
        "Generating prop sheet "+(prepProps.done+1)+"/"+prepProps.total+"\u2026 "+(prepProps.name||"")),
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{className:"sheet-head-top"},
          React.createElement("div",{className:"sheet-name",title:c.name||""},c.name),
          React.createElement("div",{className:"sheet-head-acts"},
            React.createElement("button",{className:"char-cameo-btn"+(cameoMeta?" on":""),disabled:drafting,
              onClick:()=>setCameoOpen(true),
              title:cameoMeta?"Likeness locked \u2014 recapture or manage cameo":"Cast a real face \u2014 lock this character's likeness"},
              React.createElement(Icon.userScan,{s:12}), cameoMeta?"Cameo":"Cast"),
            React.createElement("button",{className:"char-voice-btn"+(voiceLocked?" on":""),
              onClick:()=>setVoiceOpen(true),
              title:voiceLocked?("Voice locked: "+((c.voiceLock&&c.voiceLock.voiceName)||"voice")+" \u2014 test or relock"):"Cast a voice \u2014 lock how this character sounds"},
              React.createElement(Icon.mic,{s:12}), "Voice"),
            React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(c)},
              React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"),
            React.createElement(QaCheckButton,{ gen, name:c.name, noun:"character sheet",
              specFields:()=>({ body:(c.coreBody||""), wardrobe:(c.wardrobeMask||c.wardrobe||""), accessories:(c.accessories||"") }),
              onApplySpec:(patch)=>{ const up={};
                if(patch.body!=null) up.coreBody=patch.body;
                if(patch.wardrobe!=null){ if((c.wardrobeMask||"").trim()) up.wardrobeMask=patch.wardrobe; else up.wardrobe=patch.wardrobe; }
                if(patch.accessories!=null) up.accessories=patch.accessories;
                onUpdate(c.id, up); } }))),
        React.createElement("div",{className:"sheet-role-block"+(roleOpen?" open":"")},
          React.createElement("button",{className:"role-toggle",onClick:()=>setRoleOpen(o=>!o),
            title:roleOpen?"Collapse":"Expand role details"},
            React.createElement(Icon[roleOpen?"chevD":"chevR"],{s:12}),
            roleOpen
              ? React.createElement("span",{className:"role-toggle-lab"},"Role & scenes")
              : React.createElement("span",{className:"role-summary"},roleSummary)),
          roleOpen && React.createElement("div",{className:"role-fields"},
          // ROLE (function) — always shown
          React.createElement("div",{className:"role-line"},
            React.createElement("span",{className:"role-lab"},"Role"),
            React.createElement("div",{className:"sheet-role"},
              React.createElement(EditText,{value:roleParts.role,placeholder:"Function\u2014e.g. Antagonist",
                onCommit:val=>setRolePart({role:val})}))),
          // ARCHETYPE (the "·" aspect) — always shown, before Identity
          React.createElement("div",{className:"role-line"},
            React.createElement("span",{className:"role-lab"},"Archetype"),
            React.createElement("div",{className:"sheet-role-desc"},
              React.createElement(EditText,{value:roleParts.archetype,multiline:true,
                placeholder:"What they embody \u2014 e.g. ideology, the system\u2026",onCommit:val=>setRolePart({archetype:val})}))),
          // IDENTITY (who they are) — always shown
          React.createElement("div",{className:"role-line"},
            React.createElement("span",{className:"role-lab"},"Identity"),
            React.createElement("div",{className:"sheet-role-desc"},
              React.createElement(EditText,{value:capFirst(roleParts.identity),multiline:true,
                placeholder:"Who they are \u2014 e.g. A Somali-British trauma nurse\u2026",onCommit:val=>setRolePart({identity:val})}))),
          // PRONOUNS \u2014 canonical, fed into the scene drafter so the script never drifts
          // from the sheet's gender. Defaults to the value inferred from the bible; editable.
          React.createElement("div",{className:"role-line"},
            React.createElement("span",{className:"role-lab"},"Pronouns"),
            React.createElement("select",{className:"char-pronoun-sel",
              value:((c.pronouns==="he/him"||c.pronouns==="she/her") ? c.pronouns : ((typeof window.charPronouns==="function"?window.charPronouns(c):"") || "")),
              onChange:e=>onUpdate(c.id,{pronouns:e.target.value})},
              [["","set pronouns\u2026"],["he/him","he/him"],["she/her","she/her"]].map(function(o){return React.createElement("option",{key:o[0]||"unset",value:o[0],disabled:!o[0]},o[1]);}))))),
        // ALWAYS-VISIBLE scenes row — ONE line, paged 4 chips at a time with ‹ ›
        // arrows (a lead who appears in 12+ scenes was wrapping the card header)
        React.createElement("div",{className:"sheet-scenes"},
          React.createElement("span",{className:"sheet-scenes-lab",title:"Every scene this character appears in (drives or is named in). Filled chips = scenes they DRIVE."},"Appears in"),
          React.createElement(SceneChipPager,{ none:"none yet",
            items: appearsScenes.map(s=>({ key:s.id, label:String(s.no).padStart(2,"0"),
              className:"sheet-scene-chip"+(drivenIds.has(s.id)?" driven":""),
              title:(s.title||("Scene "+s.no))+(drivenIds.has(s.id)?" \u00b7 drives this scene":" \u00b7 appears") })) }))),

      cameoMeta && React.createElement("div",{className:"sheet-cameo-status"},
        React.createElement(Icon.userScan,{s:13}),
        React.createElement("span",{className:"scs-t"},"Likeness locked"),
        React.createElement("span",{className:"scs-meta"},
          ((cameoMeta.angleCount||1)+" angle"+((cameoMeta.angleCount||1)!==1?"s":""))+" \u00b7 "
          +(cameoMeta.sync?"Synced":"On this device")+" \u00b7 regenerate to apply it to the sheet"),
        // locking stores the face-lock; it does NOT overwrite the sheet \u2014 this regenerates
        // the sheet WITH the locked face so the design matches the real person.
        React.createElement("button",{className:"scs-act",disabled:gen.gening,onClick:()=>gen.generate(),
          title:"Regenerate the design sheet locked to this face"}, gen.gening?"Applying\u2026":"Apply to sheet"),
        React.createElement("button",{className:"scs-act",onClick:()=>setCameoOpen(true)},"Recapture"),
        React.createElement("button",{className:"scs-act danger",onClick:removeCameo},"Remove")),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"Visuals not drafted yet \u2014 click ",
          React.createElement("b",null,"Draft details")," to fill the physical identity.")),

      // render-style picker — the visual language the sheet is drawn in (always visible)
      React.createElement("div",{className:"char-style-row"},
        React.createElement("span",{className:"char-style-lab"},React.createElement(Icon.sparkles,{s:12}),"Render style"),
        React.createElement("div",{className:"char-style-pick"},
          React.createElement(window.RenderStylePicker,{value:(typeof inferCharacterRenderStyleKey==="function"?inferCharacterRenderStyleKey(c):(c.renderStyleKey||(window.turnDefaultRenderStyleKey?window.turnDefaultRenderStyleKey():"photoreal"))),disabled:styling,onPick:pickRenderStyle}),
          (window.turnCanLockStyles && window.turnCanLockStyles()) && React.createElement("span",{className:"char-style-count"+(((window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)>=(window.turnGlobalStyleCap||40))?" full":""),title:"Global render styles ("+(window.turnGlobalStyleCap||40)+" max, admin-managed). You can save up to "+(window.turnPersonalStyleCap||10)+" personal render styles. Manage via Styles in the top bar."}, (window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)+"/"+(window.turnGlobalStyleCap||40))),
        styling && React.createElement("span",{className:"char-style-busy"},React.createElement("span",{className:"ns-spin"}),"Inventing…"),
        (!styling && c.renderStyleKey==="surprise" && c.surpriseRender && c.surpriseRender.label) &&
          React.createElement("span",{className:"char-style-name",title:"Re-roll a new surprise style",onClick:reSurprise},
            c.surpriseRender.label," ↻"),
        (!styling && c.renderStyleKey==="surprise" && c.surpriseRender && c.surpriseRender.render && window.turnCanLockStyles && window.turnCanLockStyles()) &&
          React.createElement("button",{className:"char-style-lock",title:"Lock this style — keep it and reuse it across Characters, Props & Locations",onClick:lockSurprise},"🔒 Lock this style"),
        (!styling && unlockVisible && window.turnIsUserStyle && window.turnIsUserStyle(c.renderStyleKey)) &&
          React.createElement("span",{className:"char-style-name char-style-locked",title:"Your saved style — reusable everywhere. Click to unlock.",onClick:unlockCurrent},"🔒 saved · unlock")),

      React.createElement(CardFold,{label:"Identity",defaultOpen:false},
        // physical identity as a clean LABELLED LIST (each field editable), instead of one
        // run-on paragraph. Edits update the structured `physique` (the source the prompt
        // reads) AND recompose `coreBody` so downstream/legacy readers stay in sync.
        (()=>{
          const F = c.physique || {};
          const KEYS=["age","ethnicity","skin","eyes","hair","face","build","legs","arms"];
          const hasPhys = KEYS.some(k=>String(F[k]||"").trim());
          const recompose=(nf)=>{ const t=[nf.age&&("Apparent age: "+nf.age),nf.ethnicity&&("Ethnicity: "+nf.ethnicity),
            nf.skin&&("Skin tone: "+nf.skin),nf.eyes&&("Eye colour: "+nf.eyes),nf.hair&&("Hair: "+nf.hair),
            nf.face&&("Face shape: "+nf.face),nf.build&&("Body type: "+nf.build),
            nf.arms&&("Arms & hands: "+nf.arms),
            nf.legs&&("Legs & feet: "+nf.legs)].filter(Boolean).join(". "); return t?(t+"."):""; };
          const setPhys=(k,val)=>{ const nf={...F,[k]:val}; onUpdate(c.id,{physique:nf, coreBody:recompose(nf)}); };
          // long descriptive fields render as auto-growing textareas (ml=true) so the
          // full sentence is always visible; short tokens stay single-line.
          const Row=(lab,val,onC,ml)=> React.createElement("div",{className:"phys-row",key:lab},
            React.createElement("span",{className:"phys-lab"},lab),
            React.createElement(EditText,{value:val||"",placeholder:"\u2014",multiline:!!ml,onCommit:onC}));
          if(!hasPhys) return React.createElement(SheetField,{label:"Body \u2014 fixed physical tokens",value:vfield(c,"coreBody","look"),multiline:true,
            placeholder:"Apparent age, ethnicity, skin tone & condition, eye colour, hair, face shape, body type, defining features\u2026",onCommit:val=>onUpdate(c.id,{coreBody:val})});
          return React.createElement("div",{className:"char-phys"},
            Row("Apparent age",F.age,v2=>setPhys("age",v2),true),
            Row("Ethnicity",F.ethnicity,v2=>setPhys("ethnicity",v2),true),
            Row("Height",c.height||v.height,v2=>onUpdate(c.id,{height:v2})),
            Row("Build",F.build,v2=>setPhys("build",v2),true),
            Row("Hair",F.hair,v2=>setPhys("hair",v2),true),
            Row("Eyes",F.eyes,v2=>setPhys("eyes",v2),true),
            Row("Skin",F.skin,v2=>setPhys("skin",v2),true),
            Row("Facial features",F.face,v2=>setPhys("face",v2),true),
            Row("Arms & hands",F.arms,v2=>setPhys("arms",v2),true),
            Row("Legs & feet",F.legs,v2=>setPhys("legs",v2),true),
            // SCALE CLASS — drives the height sheet's ruler AND the per-shot world-POV rewrite
            // (gigantism / miniaturization / microscopic). A/B/C/D; resolves any legacy free-text value.
            React.createElement("div",{className:"phys-row",key:"Scale"},
              React.createElement("span",{className:"phys-lab"},"Scale"),
              React.createElement("select",{className:"prop-select char-style-select",
                value:(typeof scaleClassOf==="function"?scaleClassOf(c):"A"),
                title:"Scale class — sets the character's height range and how the world is rendered from their POV in shots",
                onChange:e=>onUpdate(c.id,{scaleClass:e.target.value})},
                React.createElement("option",{value:"A"},"Human scale (Class A)"),
                React.createElement("option",{value:"B"},"Critter scale (Class B)"),
                React.createElement("option",{value:"C"},"Giant scale (Class C)"),
                React.createElement("option",{value:"D"},"Microscopic scale (Class D)"))));
        })(),
        c.bodyRationale && React.createElement("div",{className:"sheet-rationale"},
          React.createElement(Icon.sparkles,{s:11}),"Why this look: "+tidyTruncated(c.bodyRationale)),
        React.createElement(SheetField,{label:"Texture \u2014 skin & material detail",value:c.materialTexture,multiline:true,
          placeholder:"Pore texture, subsurface scattering, blemishes, lighting\u2026",onCommit:val=>onUpdate(c.id,{materialTexture:val})})),

      React.createElement(CardFold,{label:"Wardrobe",defaultOpen:false},
        React.createElement(SheetField,{label:"Public \u2014 the mask",value:vfield(c,"wardrobeMask","wardrobe"),multiline:true,
          placeholder:"Armour / public clothes \u2014 the social persona\u2026",onCommit:val=>onUpdate(c.id,{wardrobeMask:val})}),
        React.createElement(SheetField,{label:"Private \u2014 the true self",value:c.wardrobeInner,multiline:true,
          placeholder:"Softer, personal clothing \u2014 who they really are\u2026",onCommit:val=>onUpdate(c.id,{wardrobeInner:val})})),

      React.createElement(CardFold,{label:"Props & accessories",defaultOpen:false},
        React.createElement("div",{className:"sheet-props-note"},
          React.createElement(Icon.sparkles,{s:11}),
          "Continuity objects \u2014 worn or carried items that recur across scenes."),
        React.createElement("div",{className:"sheet-2col"},
          React.createElement(SheetField,{label:"Accessories \u2014 worn",value:c.accessories,list:true,ownerName:c.name,
            onItemRemoved: onRemoveOwnedItem ? (txt=>onRemoveOwnedItem(c.id,txt)) : null,
            onItemRenamed: onRenameOwnedItem ? ((oldTxt,newTxt)=>onRenameOwnedItem(c.id,oldTxt,newTxt)) : null,
            placeholder:"Fixed worn items \u2014 watch, glasses, jewellery\u2026",onCommit:val=>onUpdate(c.id,{accessories:val})}),
          React.createElement(SheetField,{label:"Props \u2014 carried",value:c.props,list:true,ownerName:c.name,
            onItemRemoved: onRemoveOwnedItem ? (txt=>onRemoveOwnedItem(c.id,txt)) : null,
            onItemRenamed: onRenameOwnedItem ? ((oldTxt,newTxt)=>onRenameOwnedItem(c.id,oldTxt,newTxt)) : null,
            placeholder:"Recurring objects \u2014 phone, weapon, talisman\u2026",onCommit:val=>onUpdate(c.id,{props:val})})),
        linkedRows.length>0 && React.createElement("div",{className:"linked-props"},
          React.createElement("div",{className:"linked-props-head"},
            React.createElement("div",{className:"obj-lab",style:{margin:0}},
              "Linked prop sheets \u2014 worn items attach to this sheet; carried attach at the shot"),
            orphanProps.length>0 && onRemoveOwnedItem && React.createElement("button",{className:"linked-props-clean",
              title:"Remove the prop cards below that aren't in the worn/carried lists above",
              onClick:async ()=>{
                const ok = await window.appConfirm({
                  title: "Remove "+orphanProps.length+" orphaned prop"+(orphanProps.length>1?"s":"")+"?",
                  body: "These aren't listed in this character's worn/carried items \u2014 likely leftovers from an old text split.",
                  items: orphanProps.map(p=>p.name),
                  note: "This deletes their prop cards and reference sheets. This can't be undone.",
                  confirmLabel: "Remove", danger: true,
                });
                if(ok) orphanProps.forEach(p=>onRemoveOwnedItem(c.id, p.name));
              }},
              React.createElement(Icon.x,{s:11}),"Remove "+orphanProps.length+" orphaned")),
          React.createElement("div",{className:"linked-prop-list"},
            linkedRows.map(row=>{
              // carried props don't attach to the character SHEET \u2014 they ride in at
              // the shot level, so show them as deferred rather than "missing".
              const carried = !!(row.prop && row.prop.kind==="carried");
              const ready = row.prop ? !!ownedSheetMap[row.prop.id] : false;
              // carried props stay neutral (they bind at the shot, not here) but still
              // show whether their sheet has been generated \u2014 a green tick when ready,
              // so a generated and an ungenerated carried prop don't look identical.
              const cls = "linked-prop "+(carried?("shot"+(ready?" genned":"")):(ready?"ready":"missing"))+(row.orphan?" orphan":"");
              const status = carried
                ? (ready ? "sheet ready \u2713 \u00b7 at shot" : "no sheet yet \u00b7 at shot")
                : (ready ? "sheet ready \u2713" : "no sheet yet");
              return React.createElement("div",{key:row.key,className:cls,
                title: carried
                  ? (ready ? "Reference sheet generated \u2014 it attaches at the shot, not on this character sheet."
                           : "No reference sheet generated yet \u2014 it will attach at the shot once you generate it in the Props tab.")
                  : (ready ? "Reference sheet generated and attached to this character sheet."
                           : "No reference sheet generated yet \u2014 generate it in the Props tab.")},
                React.createElement(Icon.box,{s:12}),
                React.createElement("span",{className:"linked-prop-name"},row.name),
                row.orphan && React.createElement("span",{className:"linked-prop-orphan-tag",
                  title:"Not in the worn/carried lists above \u2014 likely a leftover. Use \u201cRemove orphaned\u201d to clean up."},"not listed"),
                // NO CARD YET (e.g. a character added after "Design all props" ran):
                // one free press derives the prop card in place — then this same row
                // offers Draft details / Generate.
                (!row.prop && !row.orphan && onCreateOwnedProp) && React.createElement("button",{
                  className:"linked-prop-gen",
                  title:"Create this item's prop card (owner + worn/carried derived automatically) — free, no generation. The row then offers Draft details and Generate right here.",
                  onClick:(e)=>{ e.stopPropagation();
                    const made = onCreateOwnedProp(c.id, row.name, row.src);
                    if(made && typeof window.appToast==="function") window.appToast("\u201c"+made.name+"\u201d card created ("+(made.kind==="dressing"?"set dressing":made.kind)+") \u2014 now Draft details, then Generate.","success"); }},
                  React.createElement(Icon.plus,{s:11}),"Create card"),
                // INLINE generation — the sheet is built against THIS character's own
                // sheet (the owner reference), so it must exist first. Undrafted props
                // draft first (separate press: the fresh fields must land in state
                // before the image prompt is built from them).
                (row.prop && !row.orphan) && (()=>{
                  const pr = row.prop;
                  const busy = propBusy && propBusy.id===pr.id;
                  const pDrafted = (typeof propVisualsDrafted==="function") ? propVisualsDrafted(pr) : true;
                  const lab = busy ? (propBusy.kind==="draft"?"Drafting\u2026":"Generating\u2026")
                    : (!pDrafted ? "Draft details" : (ready ? "Regenerate" : "Generate"));
                  return React.createElement("button",{className:"linked-prop-gen"+(busy?" busy":""),
                    disabled: !!propBusy,
                    title: !pDrafted
                      ? "Write this prop's design spec (object, form & material) from the script \u2014 then Generate its sheet. Writing-model credits only."
                      : (!gen.genUrl
                        ? "Generate "+(c.name||"the character")+"'s sheet first \u2014 this prop references it so the design matches their look."
                        : (carried
                          ? "Generate this prop's reference sheet against "+(c.name||"the owner")+"'s sheet \u2014 it then attaches automatically at the shot level."
                          : "Generate an optional CLOSE-UP macro sheet against "+(c.name||"the owner")+"'s sheet \u2014 used only on CU/MCU/ECU/INSERT shots; wides keep rendering it from the character sheet.")),
                    onClick: async (e)=>{
                      e.stopPropagation();
                      if(propBusy) return;
                      if(!pDrafted){
                        if(!onDraftProp){ if(typeof window.appToast==="function") window.appToast("Draft this prop in the Props tab first.","info"); return; }
                        setPropBusy({id:pr.id, kind:"draft"});
                        try{ await onDraftProp(pr); }catch(err){}
                        setPropBusy(null);
                        return;   // fields land in state \u2014 the button now reads "Generate"
                      }
                      if(!gen.genUrl){ if(typeof window.appToast==="function") window.appToast("Generate "+(c.name||"the character")+"'s sheet first \u2014 the prop references it to match their look.","info"); return; }
                      setPropBusy({id:pr.id, kind:"gen"});
                      try{
                        await window.generatePropSheet(pr, project);
                        if(typeof window.appToast==="function") window.appToast("\u201c"+(pr.name||"Prop")+"\u201d sheet generated \u2014 "+(carried?"it now attaches at the shot level.":"tight shots can now lock its design."),"success");
                      }catch(err){ if(typeof window.appToast==="function") window.appToast(String((err&&err.message)||"Prop generation failed."),"error"); }
                      setPropBusy(null);
                      setSheetTick(t=>t+1);
                    }},
                    busy ? React.createElement("span",{className:"ns-spin"}) : React.createElement(Icon.sparkles,{s:11}),
                    lab,
                    (pDrafted && !busy && typeof window.nbCostChip==="function") ? window.nbCostChip(1) : null);
                })(),
                React.createElement("span",{className:"linked-prop-status"},status));
            })))),

      React.createElement(CardFold,{label:"Continuity \u00b7 appearance states",count:states.length||null,defaultOpen:false},
        React.createElement("div",{className:"sheet-props-note"},
          React.createElement(Icon.sparkles,{s:11}),
          "Moments where this character's look changes \u2014 wounds, costume shifts, time jumps. Each can become its own v2 sheet."),
        React.createElement("div",{className:"state-actions"},
          React.createElement("button",{className:"state-suggest-btn",disabled:suggestingStates,onClick:()=>onSuggestStates&&onSuggestStates(c)},
            suggestingStates
              ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin"}),"Scanning script\u2026")
              : React.createElement(React.Fragment,null,React.createElement(Icon.sparkles,{s:12}),"Suggest from script")),
          React.createElement("button",{className:"state-add-btn",onClick:addState},
            React.createElement(Icon.plus,{s:12}),"Add state")),
        states.length
          ? React.createElement("div",{className:"state-list"},
              React.createElement("div",{className:"state-row state-base"},
                React.createElement("span",{className:"state-vtag base"},"v1"),
                React.createElement("span",{className:"state-base-lab"},"Base look \u2014 the canonical sheet above")),
              states.map((st,i)=>React.createElement(StateRow,{key:st.id,c,st,index:i,project,scenes,props,
                baseGenUrl:gen.genUrl,onView,
                onChange:(patch)=>updateState(st.id,patch),onDelete:()=>deleteState(st.id)})))
          : React.createElement("div",{className:"state-empty"},
              "No appearance states yet \u2014 the base sheet covers the whole film. ",
              "Use \u201cSuggest from script\u201d to find where the look changes, or add one by hand.")),

      React.createElement(CardFold,{label:"Look dev",defaultOpen:false},
        React.createElement(SheetField,{label:"Render style",value:c.renderStyle,multiline:true,
          placeholder:"photoreal cinematic, 35mm, film grain, shallow depth of field\u2026",onCommit:val=>onUpdate(c.id,{renderStyle:val})}),
        React.createElement("div",{className:"sheet-field"},
          React.createElement("div",{className:"obj-lab"},"Colour palette \u00b7 base \u2192 climax"),
          React.createElement(PaletteRow,{palette}))),

      React.createElement(CardFold,{label:"Scale sheet",defaultOpen:false},
        React.createElement("div",{className:"char-scalesheet-hint"},
          React.createElement(Icon.sparkles,{s:11}),
          "A full-body height chart on the "+((typeof scaleInfoOf==="function")?scaleInfoOf(c).label:"Human")+" ruler \u2014 rendered from the master sheet. Used as the scale reference in shots; set the class in Identity \u25b8 Scale."),
        React.createElement(SheetFrame,{ gen:scaleGenWrapped, slotId:"charscale-"+c.id, name:(c.name||"")+" \u00b7 scale", avatarColor:c.color,
          initials:"H", drafted:true, drafting:false, onDraft:()=>{}, entity:c, onView,
          slotPlaceholder:"Generate the height chart", noun:"scale sheet", dropToImport:true }),
        scaleGenWrapped.genUrl && React.createElement("div",{className:"card-qa-row"},
          React.createElement(QaCheckButton,{ gen:scaleGenWrapped, name:(c.name||"")+" \u00b7 scale", noun:"scale sheet" }))),

      React.createElement(CardFold,{label:"Master reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"3-panel casting sheet \u2014 feed to your image tool",text:promptText}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:c.negativePrompt||v.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(c.id,{negativePrompt:val})}),
        // the FINAL box always holds the prompt that generated the CURRENT sheet
        // (stored per version, so restoring an older version restores its prompt
        // here too); before any sheet exists it previews the next generation.
        React.createElement(CopyBox,{label:(gen.genUrl && gen.genMeta && gen.genMeta.prompt)
            ? "Final prompt \u2014 generated the CURRENT sheet" : "Final prompt \u2014 master + negative (sent at generation)",
          text:(gen.genUrl && gen.genMeta && gen.genMeta.prompt) || finalPrompt}),
        (gen.genUrl && gen.genMeta && gen.genMeta.prompt && gen.genMeta.prompt!==finalPrompt) &&
          React.createElement("div",{className:"prompt-drift-note"},
            "The spec has changed since this sheet was generated \u2014 Regenerate to bring the sheet back in step with it.")),

      cameoOpen && React.createElement(CameoModal,{ character:c,
        onClose:()=>setCameoOpen(false),
        // locking stores the face-lock reference; turning it INTO the character sheet
        // means regenerating the 10-panel design locked to that face — offer it right
        // away so the likeness doesn't sit unapplied until a manual "Apply to sheet".
        onSaved: async ()=>{
          refreshCameo();
          const ok = !window.appConfirm || await window.appConfirm({
            title:"Turn the likeness into "+(c.name||"this character")+"'s sheet?",
            body:"Regenerates the 3-panel character sheet locked to the captured face — the portrait and full-body views will match the real person. You can also do this later with “Apply to sheet”.",
            confirmLabel:"Generate sheet" });
          if(ok && !gen.gening) gen.generate();
        } }),
      voiceOpen && window.VoiceModal && React.createElement(window.VoiceModal,{ character:c, project, speaks,
        onUpdate, onClose:()=>setVoiceOpen(false) })));
}

function NbKeyBar(){
  // key-status bar retired (user ruling 2026-07-19): server-side keys are the norm,
  // the banner was noise on every tab. Component kept for compatibility.
  return null;
  const [model, setModelState] = React.useState(()=> (typeof nbGetModel==="function") ? nbGetModel() : "");
  React.useEffect(()=>{
    const h = ()=> setModelState((typeof nbGetModel==="function") ? nbGetModel() : "");
    window.addEventListener("nb-model-changed", h);
    return ()=>window.removeEventListener("nb-model-changed", h);
  },[]);
  const provider = (typeof providerOfModel==="function") ? providerOfModel(model) : "google";
  const isOAI = (typeof isGptImageModel==="function") ? isGptImageModel(model) : /^gpt-image/.test(model||"");
  // proxied: this provider's generation runs server-side. Current image models are
  // fal.ai-first through the Supabase proxy; legacy providers can still fall back.
  const proxied = provider==="fal" || isOAI || (typeof imageProxyOn==="function" && imageProxyOn());
  const getKeyFn = isOAI ? oaiGetKey : nbGetKey;
  const setKeyFn = isOAI ? oaiSetKey : nbSetKey;
  const label = provider==="fal" ? "fal.ai images" : (isOAI ? "GPT Image" : "Nano Banana");
  const placeholder = isOAI ? "sk-\u2026" : "AIza\u2026 or AQ.\u2026";
  const help = isOAI ? "Paste your OpenAI API key to generate with GPT Image"
                     : "Paste your Google AI Studio API key to generate images";
  const deviceNote = "Stored on this device only \u2014 keys don't sync across devices, even when your story is synced.";
  const [key, setKey] = React.useState(()=> getKeyFn());
  const [editing, setEditing] = React.useState(()=> !getKeyFn());
  const [val, setVal] = React.useState("");
  const [warn, setWarn] = React.useState("");
  // re-sync when the selected provider changes
  React.useEffect(()=>{ setKey(getKeyFn()); setEditing(!getKeyFn()); setVal(""); setWarn(""); },[provider]);
  // plausibility check — catches partial pastes / wrong text BEFORE a failed call
  const keyHint = (k)=>{
    const clean = (typeof sanitizeKey==="function") ? sanitizeKey(k) : k.trim();
    if(isOAI){
      if(!/^sk-/.test(clean)) return "OpenAI keys start with \u201csk-\u201d. This doesn't \u2014 paste the full secret key from platform.openai.com.";
      if(clean.length < 40) return "That looks too short for an OpenAI key. Paste the whole key (it's ~50+ characters).";
    } else {
      // Google issues TWO key formats: legacy "AIza\u2026" and newer "AQ.\u2026".
      // Don't hard-block on prefix (it was rejecting valid AQ. keys) \u2014 just a
      // light length sanity check; the API gives a precise message if it's wrong.
      if(clean.length < 20) return "That looks too short. Paste the whole Google AI Studio key.";
    }
    return "";
  };
  // a previously-saved key that fails the check is NOT really connected — drop
  // into edit mode and say why, instead of showing a false "connected" badge.
  React.useEffect(()=>{
    const k = getKeyFn();
    if(k && keyHint(k)){ setEditing(true); setWarn(keyHint(k)); }
  },[provider]);
  const save = ()=>{
    const k = (typeof sanitizeKey==="function") ? sanitizeKey(val) : val.trim();
    if(!k) return;
    const h = keyHint(k);
    if(h){ setWarn(h); return; }   // block obviously-malformed keys, explain why
    setKeyFn(k); setKey(k); setVal(""); setWarn(""); setEditing(false);
  };
  const clear = ()=>{ setKeyFn(""); setKey(""); setVal(""); setWarn(""); setEditing(true); };
  // Proxied providers run server-side — the browser holds no key. Show an
  // informational strip instead of a key input. (Always for GPT Image; for Nano
  // Banana only when the image proxy is enabled.)
  // operator info only — the admin account sees the strip; everyone else nothing
  if(proxied) return window.turnIsAdmin ? React.createElement("div",{className:"nb-keybar set"},
    React.createElement(Icon.check,{s:13}),
    React.createElement("span",null,label+" run on your server"),
    React.createElement("span",{className:"nb-key-note"},"\u00b7 no key needed in the browser; sign in to use it")) : null;
  if(!editing && key) return React.createElement("div",{className:"nb-keybar set"},
    React.createElement(Icon.check,{s:13}),
    React.createElement("span",null,label+" connected"),
    React.createElement("span",{className:"nb-key-note"},"\u00b7 this device only"),
    React.createElement("button",{className:"nb-key-link",onClick:clear},"Change key"));
  return React.createElement("div",{className:"nb-keybar"+(warn?" warn":"")},
    React.createElement(Icon.alert,{s:13}),
    React.createElement("div",{className:"nb-key-help"},
      React.createElement("span",{className:"nb-key-lab"},help),
      React.createElement("span",{className:"nb-key-note"}, warn || deviceNote)),
    React.createElement("input",{className:"nb-key-input",type:"password",placeholder:placeholder,value:val,
      onChange:e=>{ setVal(e.target.value); if(warn) setWarn(""); },onKeyDown:e=>{ if(e.key==="Enter") save(); }}),
    React.createElement("button",{className:"nb-key-save",onClick:save,disabled:!val.trim()},"Save"));
}

function NbControls(){
  const [model, setModel] = React.useState(()=> (typeof nbGetModel==="function") ? nbGetModel() : "");
  const [aspect, setAspect] = React.useState(()=> (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9");
  const [resv, setResv] = React.useState(()=> (typeof nbGetRes==="function") ? nbGetRes() : "2K");
  const [ground, setGround] = React.useState(()=> (typeof nbGetGroundSearch==="function") ? nbGetGroundSearch() : false);
  const [groundTip, setGroundTip] = React.useState(false);
  const [groundTipPos, setGroundTipPos] = React.useState(null);   // fixed coords — the tip portals to <body> (the drawer clipped it)
  const tipMenuRef = React.useRef(null);
  const [mOpen, setMOpen] = React.useState(false);   // mobile dropdown open
  const tipRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const models = window.NB_MODELS || [];
  const aspects = window.NB_ASPECTS || ["16:9","21:9"];
  const isFlash = model === "gemini-3.1-flash-image";
  const isGpt = (typeof isGptImageModel==="function") ? isGptImageModel(model) : /^gpt-image/.test(model||"");
  const [oaiQ, setOaiQ] = React.useState(()=> (typeof nbGetOaiQuality==="function") ? nbGetOaiQuality() : "medium");
  const modelLabel = (models.find(m=>m.id===model)||{}).label || model || "Model";

  /* close tooltip on outside click */
  React.useEffect(()=>{
    if(!groundTip) return;
    const h = e=>{ if(tipRef.current && !tipRef.current.contains(e.target)
      && !(tipMenuRef.current && tipMenuRef.current.contains(e.target))) setGroundTip(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[groundTip]);
  /* close the mobile settings dropdown on outside click */
  React.useEffect(()=>{
    if(!mOpen) return;
    const h = e=>{ if(wrapRef.current && !wrapRef.current.contains(e.target)) setMOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[mOpen]);
  /* reflect external model switches (e.g. a "Try <model>" fallback after a failed
     generation) in the picker highlight + mobile summary. */
  React.useEffect(()=>{
    const h = ()=>{ if(typeof nbGetModel==="function") setModel(nbGetModel()); };
    window.addEventListener("nb-model-changed", h);
    return ()=>window.removeEventListener("nb-model-changed", h);
  },[]);

  return React.createElement("div",{className:"nb-controls"+(mOpen?" mopen":""),ref:wrapRef},
    /* mobile-only: collapse all three controls into a dropdown */
    React.createElement("button",{className:"nb-ctl-mtoggle",onClick:()=>setMOpen(o=>!o)},
      React.createElement(Icon.layers,{s:13}),
      React.createElement("span",{className:"nb-ctl-msum"}, modelLabel+" \u00b7 "+aspect+" \u00b7 "+resv),
      React.createElement(Icon[mOpen?"chevU":"chevD"],{s:12})),
    React.createElement("div",{className:"nb-ctl-body"},
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Model"),
      React.createElement("div",{className:"nb-ctl-row"},
        React.createElement("div",{className:"nb-seg"},
          models.map(m=>React.createElement("button",{key:m.id,className:"nb-seg-btn "+(model===m.id?"on":""),
            title:m.note,onClick:()=>{ setModel(m.id); nbSetModel(m.id); window.dispatchEvent(new CustomEvent("nb-model-changed")); }},m.label))),
        /* grounding toolkit — only when Nano Banana 2 is selected */
        isFlash && React.createElement("div",{className:"nb-ground-wrap",ref:tipRef},
          React.createElement("button",{
            className:"nb-ground-btn "+(ground?"on":"")+(groundTip?" open":""),
            onMouseEnter:(e)=>{ const r=e.currentTarget.getBoundingClientRect();
              setGroundTipPos({ top:r.bottom+8, left:Math.max(8, Math.min(r.left, window.innerWidth-276)) });
              setGroundTip(true); },
            // NO mouseleave-close: the tip is a PORTALED popover with buttons — closing
            // when the pointer travels toward it made the Off/On choice unclickable.
            // It closes on outside click (handler checks the portal) or the toggle.
            onClick:(e)=>{ const r=e.currentTarget.getBoundingClientRect();
              setGroundTipPos({ top:r.bottom+8, left:Math.max(8, Math.min(r.left, window.innerWidth-276)) });
              setGroundTip(t=>!t); },
            title:"Grounding"},
            React.createElement(Icon.bolt,{s:11,sw:2.2}),ground?"On":""),
          groundTip && groundTipPos && ReactDOM.createPortal(React.createElement("div",{className:"nb-ground-tip",
            ref:tipMenuRef, onMouseEnter:()=>setGroundTip(true),
            style:{ position:"fixed", top:groundTipPos.top+"px", left:groundTipPos.left+"px", zIndex:1300 }},
            React.createElement("div",{className:"nb-ground-tip-head"},
              React.createElement(Icon.bolt,{s:11,sw:2.2}),
              "Grounding",
              React.createElement("span",{className:"nb-ground-tip-badge"},"Nano Banana 2"),
              React.createElement("span",{className:"nb-ground-tip-sub"},"web references")),
            React.createElement("div",{className:"nb-ground-tip-body"},
              "When on, the model searches the web to anchor generation to real-world ",
              "references \u2014 period costumes, locations, props."),
            React.createElement("div",{className:"nb-seg nb-ground-seg"},
              React.createElement("button",{className:"nb-seg-btn "+(!ground?"on":""),
                onClick:()=>{ setGround(false); nbSetGroundSearch&&nbSetGroundSearch(false); }},
                "Off"),
              React.createElement("button",{className:"nb-seg-btn "+(ground?"on":""),
                onClick:()=>{ setGround(true); nbSetGroundSearch&&nbSetGroundSearch(true); }},
                "Web + images"))), document.body)))),
    /* GPT Image quality — its own labelled control (high routinely exceeds the
       proxy's time window on composite sheets: 504, billed but no image) */
    isGpt && React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Quality"),
      React.createElement("div",{className:"nb-ctl-row"},
        React.createElement("div",{className:"nb-seg"},
          ["low","medium","high"].map(q=>React.createElement("button",{key:q,
            className:"nb-seg-btn "+(oaiQ===q?"on":""),
            title: q==="high" ? "Slowest — composite sheets may time out at the proxy" : (q==="medium" ? "Recommended — fits the proxy window" : "Fastest"),
            onClick:()=>{ setOaiQ(q); nbSetOaiQuality&&nbSetOaiQuality(q); window.dispatchEvent(new CustomEvent("nb-settings-changed")); }}, q))))),
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Aspect"),
      React.createElement("div",{className:"nb-seg-rows"},
        React.createElement("div",{className:"nb-seg"},
          aspects.slice(0,3).map(a=>React.createElement("button",{key:a,className:"nb-seg-btn "+(aspect===a?"on":""),
            onClick:()=>{ setAspect(a); nbSetAspect(a); }},a))),
        aspects.length>3 && React.createElement("div",{className:"nb-seg"},
          aspects.slice(3).map(a=>React.createElement("button",{key:a,className:"nb-seg-btn "+(aspect===a?"on":""),
            onClick:()=>{ setAspect(a); nbSetAspect(a); }},a))))),
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Resolution"),
      React.createElement("div",{className:"nb-seg"},
        (window.NB_RESOLUTIONS||["1K","2K","4K"]).map(r=>React.createElement("button",{key:r,className:"nb-seg-btn "+(resv===r?"on":""),
          onClick:()=>{ setResv(r); nbSetRes(r); window.dispatchEvent(new CustomEvent("nb-settings-changed")); }},r))))));
}

/* ENGINE DOCK — a compact floating widget in the MUSE bubble's 54px right-edge
   column, vertically centered, floating ABOVE the layout (no content clearance).
   Collapsed: three stacked chips summarising Model / Aspect / Resolution.
   Click: a flyout panel (opens leftward) with the full NbControls. */
function NbDock(){
  const [open, setOpen] = React.useState(false);
  const [, force] = React.useState(0);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    const h = ()=> force(x=>x+1);
    window.addEventListener("nb-model-changed", h);
    return ()=>window.removeEventListener("nb-model-changed", h);
  },[]);
  React.useEffect(()=>{
    if(!open) return;
    // the Grounding popover is PORTALED to <body> (drawer clipping) — a click inside
    // it is NOT "outside the drawer"; without this check, choosing On/Off closed the
    // whole toolkit before the selection could land
    const h = e=>{ if(ref.current && !ref.current.contains(e.target)
      && !(e.target && e.target.closest && e.target.closest(".nb-ground-tip"))) setOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[open]);
  const model  = (typeof nbGetModel==="function") ? nbGetModel() : "";
  const aspect = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  const resv   = (typeof nbGetRes==="function") ? nbGetRes() : "2K";
  const short  = /pro/i.test(model) ? "PRO" : /gpt/i.test(model) ? "GPT" : "NB2";
  // NOTE: the TEXT (writing) engine is shown by the separate WritingDock (rendered in
  // both rooms) — this dock is the IMAGE engine only, so the two aren't redundant.
  return React.createElement("div",{className:"nb-dock"+(open?" open":""),ref:ref,"aria-label":"Image engine settings"},
    React.createElement("button",{className:"nb-dock-toggle","aria-expanded":open?"true":"false",
      title:"Image engine — model, aspect & resolution",onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"nb-dock-chip model"},short),
      React.createElement("span",{className:"nb-dock-chip"},aspect),
      React.createElement("span",{className:"nb-dock-chip"},resv)),
    open && React.createElement("div",{className:"nb-dock-panel",onClick:()=>force(x=>x+1)},
      React.createElement(NbControls,null)));
}

/* ONE-LINE scene-chip pager — 4 chips per page, ‹ › arrows, a "12–16 (10)" counter
   (the visible chips' scene-number range + the total count, so it always agrees
   with the chips on screen). Shared by Characters, Props and Locations so every
   card's scenes row behaves identically. items: [{key,label,title,className,onClick?}]. */
function SceneChipPager({ items, none }){
  const PAGE = 4;
  const [ofs, setOfs] = React.useState(0);
  if(!(items&&items.length)) return React.createElement("span",{className:"prop-scenes-none"}, none||"none yet");
  const o = Math.min(ofs, Math.max(0, items.length-PAGE));
  const shown = items.slice(o, o+PAGE);
  return React.createElement(React.Fragment,null,
    items.length>PAGE && React.createElement("button",{className:"sheet-scenes-nav",disabled:o<=0,
      title:"Earlier scenes",onClick:()=>setOfs(Math.max(0, o-PAGE))},"\u2039"),
    shown.map(it=> it.onClick
      ? React.createElement("button",{key:it.key,className:it.className,title:it.title,onClick:it.onClick},it.label)
      : React.createElement("span",{key:it.key,className:it.className,title:it.title},it.label)),
    items.length>PAGE && React.createElement("button",{className:"sheet-scenes-nav",disabled:o+PAGE>=items.length,
      title:"Later scenes",onClick:()=>setOfs(o+PAGE)},"\u203a"),
    items.length>PAGE && React.createElement("span",{className:"sheet-scenes-count",
      title:items.length+" scenes in total"},
      (shown.length>1 ? shown[0].label+"\u2013"+shown[shown.length-1].label : shown[0].label)+" ("+items.length+")"));
}
window.SceneChipPager = SceneChipPager;

/* REMASTER — the clean-plate pass. Stacked edits accumulate generation loss
   (photocopy-of-a-photocopy noise); this re-renders an APPROVED version as a fresh
   full-quality image without redesigning it. Image-anchored, not prompt-replay:
   the liked version IS the primary reference. */
/* Remaster is only OFFERED on a version produced by an Apply-edit — that's the pass
   that accumulates generation loss. Clean originals (and remaster passes themselves,
   which run through the edit pipeline with a "REMASTER…" instruction) have nothing
   to clean, so the buttons stay hidden for them. */
function remasterEligible(meta){
  return !!(meta && meta.mode==="edit" && !/^REMASTER\b/i.test(String(meta.editInstruction||"")));
}
window.remasterEligible = remasterEligible;

function remasterInstruction(noun){
  return "REMASTER this "+(noun||"sheet")+": the base image IS the approved final design. "
    +"Reproduce it EXACTLY \u2014 the same identity, faces, wardrobe, objects, panel layout, composition, "
    +"rendering style, colours and lighting in every panel \u2014 as a clean, sharp, artifact-free, "
    +"full-quality render. Remove compression noise, smudging, banding and detail loss. "
    +"Do NOT redesign, reinterpret, add or remove ANYTHING.";
}
window.remasterInstruction = remasterInstruction;

function ImageLightbox({ url, character, onClose }){
  const [res, setRes] = React.useState(()=> (typeof nbGetRes==="function") ? nbGetRes() : "2K");
  // the VIEWED version's real size — the picker must follow the image, not the
  // global generation setting (a 4K sheet was opening on "2K" and silently
  // downloading downscaled). Stored meta wins; older sheets/uploads without a
  // stored size get measured off the pixels.
  const [nativeRes, setNativeRes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // VERSION STRIP — when the viewed entity has earlier sheet versions, a filmstrip
  // under the image navigates them (click a thumb, ‹ › buttons, or arrow keys).
  // Works for every tab that opens this viewer (cast / props / locations / shots /
  // storyboards); plain refs without an entity id just show the single image.
  const [cur, setCur] = React.useState(url);
  const [versions, setVersions] = React.useState([]);
  // url → generation meta, for every known version (current + history) — drives the
  // Remaster button, which is only offered on versions produced by an Apply-edit
  const [metaByUrl, setMetaByUrl] = React.useState({});
  React.useEffect(()=>{ setCur(url); },[url]);
  React.useEffect(()=>{
    const label = (px)=> px>=3000 ? "4K" : px>=1600 ? "2K" : "1K";
    const m = metaByUrl[cur];
    if(m && m.size && (window.NB_RESOLUTIONS||["1K","2K","4K"]).indexOf(m.size)>=0){
      setNativeRes(m.size); setRes(m.size); return;
    }
    let alive = true;
    const img = new Image();
    img.onload = ()=>{ if(!alive) return;
      const l = label(Math.max(img.naturalWidth||0, img.naturalHeight||0));
      setNativeRes(l); setRes(l); };
    img.src = cur;
    return ()=>{ alive = false; };
  },[cur, metaByUrl]);
  React.useEffect(()=>{
    let alive = true;
    (async()=>{
      const id = character && character.id;
      if(!id || typeof window.nbGetHistory!=="function"){ if(alive){ setVersions([]); setMetaByUrl({}); } return; }
      let hist = []; try{ hist = (await window.nbGetHistory(id))||[]; }catch(e){}
      const curUrl = (typeof nbGetImage==="function") ? nbGetImage(id) : "";
      const items = [];
      if(curUrl) items.push({ url:curUrl, label:"Current" });
      hist.forEach((h,i)=>{ if(h && h.url && !items.some(x=>x.url===h.url)) items.push({ url:h.url, label:"Version −"+(i+1) }); });
      if(url && !items.some(x=>x.url===url)) items.unshift({ url, label:"Viewing" });
      if(!alive) return;
      const metas = {};
      if(curUrl && typeof nbGetMeta==="function"){ try{ metas[curUrl] = nbGetMeta(id); }catch(e){} }
      hist.forEach(h=>{ if(h && h.url && h.meta && !metas[h.url]) metas[h.url] = h.meta; });
      setMetaByUrl(metas);
      // fast thumbs: decode each version ONCE into a ~128px data URL, cached for the
      // whole session (window.__lbThumbCache) — so the strip paints tiny images instead
      // of decoding a dozen full-resolution sheets, and reopening is instant.
      const cache = window.__lbThumbCache || (window.__lbThumbCache = new Map());
      items.forEach(it=>{ if(cache.has(it.url)) it.thumb = cache.get(it.url); });
      setVersions(items.length>1 ? items : []);
      if(items.length>1 && typeof turnDownscaleDataUrl==="function"){
        (async()=>{
          for(const it of items){
            if(!alive) return;
            if(cache.has(it.url)) continue;
            let t = ""; try{ t = await turnDownscaleDataUrl(it.url, 128); }catch(e){}
            if(!t) continue;
            cache.set(it.url, t);
            if(alive) setVersions(vs=> vs.map(v=> v.url===it.url ? { ...v, thumb:t } : v));
          }
        })();
      }
    })();
    return ()=>{ alive=false; };
  },[character && character.id, url]);
  const idx = versions.findIndex(v=>v.url===cur);
  const step = (d)=>{ if(!versions.length) return; const j=(idx<0?0:idx)+d; if(j<0||j>=versions.length) return; setCur(versions[j].url); };
  React.useEffect(()=>{
    const onKey = (e)=>{ if(e.key==="ArrowLeft") step(-1); else if(e.key==="ArrowRight") step(1); else if(e.key==="Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return ()=>window.removeEventListener("keydown", onKey);
  });
  const resolutions = window.NB_RESOLUTIONS || ["1K","2K","4K"];
  const download = async ()=>{
    if(busy) return; setBusy(true);
    const fn = (character && character.name ? character.name.replace(/[^\w]+/g,"_") : "character")+"_sheet_"+res+".png";
    try{ await nbDownload(cur, res, fn); }catch(e){}
    setBusy(false);
  };
  return React.createElement("div",{className:"lb-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"lb-panel"+(versions.length>1?" has-strip":"")},
      React.createElement("div",{className:"lb-head"},
        React.createElement("span",{className:"lb-title"},(character?character.name:"Character sheet")
          +((idx>=0 && versions.length>1)?(" · "+versions[idx].label):"")),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),
      React.createElement("div",{className:"lb-imgwrap"},
        React.createElement("img",{className:"lb-img",src:cur,alt:"full view"})),
      // centered filmstrip between the image and the download row — no arrow buttons
      // (thumb clicks and the ←/→ keys navigate)
      versions.length>1 && React.createElement("div",{className:"lb-strip"},
        React.createElement("div",{className:"lb-strip-row"},
          versions.map((v,i)=>React.createElement("button",{key:i,className:"lb-thumb"+(v.url===cur?" on":""),
            title:v.label+" — click to view",onClick:()=>setCur(v.url)},
            React.createElement("img",{src:v.thumb||v.url,alt:v.label,loading:"lazy",decoding:"async"}))))),
      React.createElement("div",{className:"lb-foot"},
        // REMASTER the version on screen — re-renders it clean via the open card's
        // generation pipeline. Only offered while that card is mounted in this tab
        // AND the viewed version was produced by an Apply-edit (clean originals and
        // remaster passes have nothing to clean).
        (character && character.id && window.__sheetGen && window.__sheetGen[character.id]
          && remasterEligible(metaByUrl[cur])) &&
          React.createElement("button",{className:"lb-dl lb-remaster",
            disabled: !!window.__sheetGen[character.id].gening,
            title:"Re-render THIS version as a fresh, clean, full-quality image — same design, noise and artifacts removed. It becomes the new current version; everything else stays in history.",
            onClick:()=>{ const g=window.__sheetGen[character.id]; if(!g || g.gening) return;
              g.generate({ editInstruction: (typeof remasterInstruction==="function")?remasterInstruction(g.noun):"Reproduce this image exactly, clean and artifact-free.",
                editBaseUrl: cur });
              if(typeof window.appToast==="function") window.appToast("Remastering this version — it will land as the new current");
              onClose(); }},
            React.createElement(Icon.sparkles,{s:13}),"Remaster this version"),
        React.createElement("span",{className:"lb-foot-lab"},"Download"),
        React.createElement("div",{className:"nb-seg"},
          resolutions.map(r=>{
            const ord = { "1K":1, "2K":2, "4K":3 };
            const over = !!(nativeRes && ord[r] > ord[nativeRes]);
            return React.createElement("button",{key:r,className:"nb-seg-btn "+(res===r?"on":""),
              disabled:over,
              title: over ? ("This image is "+nativeRes+" — downloads never upscale") : ("Download at "+r),
              onClick:()=>setRes(r)},r);
          })),
        React.createElement("button",{className:"lb-dl",onClick:download,disabled:busy},
          busy?React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),"Preparing\u2026")
              :React.createElement(React.Fragment,null,React.createElement(Icon.download,{s:14}),"Download "+res)))));
}

function CharacterSheets({ project, characters, scenes, props, drafts, shots, beatsMap, onUpdate, onDraft, onDraftAll, draftingId, draftingAll, draftingIds, onSuggestStates, suggestingStatesId, onRemoveOwnedItem, onRenameOwnedItem, onDraftProp, onCreateOwnedProp, onAdd, onDelete, onCast, trashItems, onRestore, onPurge, lookbookStale, onApplyLookbook, onApplyLookbookDraftOnly }){
  const [view, setView] = React.useState(null);   // {url, character}
  if(window.useRenderStyleVersion) window.useRenderStyleVersion();   // re-render dropdowns when a style is locked/unlocked
  // which characters actually speak (have dialogue) — used to flag the per-card Voice control
  const speakingSet = React.useMemo(()=> (typeof speakingCharIds==="function") ? speakingCharIds(characters, scenes, shots) : new Set(), [characters, scenes, shots]);
  const [mgrOpen, setMgrOpen] = React.useState(false);
  const [sceneFilter, setSceneFilter] = React.useState("");   // "" = all scenes
  const [query, setQuery] = React.useState("");               // free-text name search
  const [searchOpen, setSearchOpen] = React.useState(false);  // collapsible search: icon-only until clicked
  const searchRef = React.useRef(null);
  // film-wide render style: apply one visual language to the WHOLE cast at once. Shows the
  // shared key, or blank ("Mixed") when characters differ. "surprise" invents a bespoke
  // style per character (each unique), so it confirms the per-character AI cost first.
  const [allStyling, setAllStyling] = React.useState(null);   // null | {i,total}
  const cast = characters || [];
  const defaultStyleKey = window.turnDefaultRenderStyleKey ? window.turnDefaultRenderStyleKey() : "photoreal";
  const allStyleKey = (cast.length && cast.every(c=>(c.renderStyleKey||defaultStyleKey)===(cast[0].renderStyleKey||defaultStyleKey)))
    ? (cast[0].renderStyleKey||defaultStyleKey) : "";
  const applyStyleAll = async (key)=>{
    if(!key || allStyling) return;
    cast.forEach(c=> onUpdate(c.id, { renderStyleKey:key }));
    if(key!=="surprise") return;
    if(!(typeof aiSurpriseRenderStyle==="function" && typeof aiAvailable==="function" && aiAvailable())) return;
    const need = cast.filter(c=>!(c.surpriseRender && c.surpriseRender.render));
    if(!need.length) return;
    let ok = true;
    if(typeof window.appConfirm==="function") ok = await window.appConfirm({
      title:"Invent a surprise style for "+need.length+" character"+(need.length!==1?"s":"")+"?",
      body:"Each character gets its OWN bespoke fused style invented from its bible — that's "+need.length+" AI call"+(need.length!==1?"s":"")+".",
      confirmLabel:"Invent styles" });
    if(!ok) return;
    setAllStyling({ i:0, total:need.length });
    for(let i=0;i<need.length;i++){ setAllStyling({ i:i+1, total:need.length });
      try{ const r = await aiSurpriseRenderStyle(need[i], project); if(r) onUpdate(need[i].id, { surpriseRender:r }); }catch(e){} }
    setAllStyling(null);
  };
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = characters || [];
  const q = query.trim().toLowerCase();
  const matchesQuery = (c)=> (typeof searchWordMatch==="function") ? searchWordMatch((c.name||"")+" "+(c.role||""), q) : (!q || (c.name||"").toLowerCase().indexOf(q)>=0);
  const sceneList = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  // which characters appear in each scene — DERIVED (characters have no `scenes` field):
  // the scene's driver + everyone in its shots' subjects + the beats' reactor (by name).
  const charsInSceneMap = React.useMemo(()=>{
    const shotsBy = {}; (shots||[]).forEach(s=>{ (shotsBy[s.sceneId]=shotsBy[s.sceneId]||[]).push(s); });
    const m = {};
    (scenes||[]).forEach(s=>{
      const ids = new Set();
      if(s.driver) ids.add(s.driver);
      (shotsBy[s.id]||[]).forEach(sh=> (sh.subjects||[]).forEach(id=>ids.add(id)));
      const b = (beatsMap||{})[s.id];
      if(b && b.reactorLabel){ const rl=String(b.reactorLabel).toLowerCase();
        const mm = list.find(c=> (c.name||"").toLowerCase()===rl || rl.includes((c.name||"").toLowerCase())); if(mm) ids.add(mm.id); }
      m[s.id] = ids;
    });
    return m;
  }, [scenes, shots, beatsMap, list]);
  const inScene = (c, sid)=> !!(charsInSceneMap[sid] && charsInSceneMap[sid].has(c.id));
  const shown = (sceneFilter ? list.filter(c=>inScene(c, sceneFilter)) : list).filter(matchesQuery);
  // 9-up pagination; suspended while a batch runs so the queue can reach every card
  const charPager = usePager(shown.length, !!batchActiveId);
  const sceneNoOf = (sid)=>{ const s=(scenes||[]).find(x=>x.id===sid); return s?s.no:sid; };
  const draftedIds = (subset)=> subset.filter(c=>charVisualsDrafted(c)).map(c=>c.id);
  // eligible = drafted characters only (so a card with no look/wardrobe never makes a generic sheet)
  const eligibleAll = list.filter(c=>charVisualsDrafted(c)).length;
  // some cast still has no spec (e.g. a hand-added character, or auto-draft didn't
  // finish) — only THEN do we surface the manual "Draft" button; otherwise it's
  // noise. The cast is auto-drafted once on first Art Room entry.
  const someUndrafted = eligibleAll < list.length;
  // STAGED HEADER (design-clarity ruling 2026-07-14): exactly ONE primary action
  // per pipeline stage — draft (specs missing) → generate (specs done, sheets
  // missing) → done. The other actions stay reachable but demoted to ghosts,
  // and nothing renders as disabled orange noise.
  const sheetedAll = (typeof nbGetImage==="function") ? list.filter(c=> !!nbGetImage(c.id)).length : 0;
  const castStage = someUndrafted ? "draft" : (sheetedAll < list.length ? "generate" : "done");
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Draft the characters first \u2014 nothing is ready to generate yet."); return; }
    if(sceneFilter) setSceneFilter("");            // mount every card so the queue can reach each one
    batch.begin(eligible, list.length - eligible.length);
  };
  // generate just the cast in the focused scene (mirrors Props / Locations)
  const startSceneBatch = ()=>{
    if(!sceneFilter || batchActiveId) return;
    const eligible = draftedIds(shown);
    if(!eligible.length){ batch.setMsg("Draft the characters in this scene first \u2014 nothing here is ready to generate."); return; }
    batch.begin(eligible, shown.length - eligible.length);
  };
  // when a character is added BY HAND, smooth-scroll it into view (parity with Props)
  const prevIdsRef = React.useRef(null);
  React.useEffect(()=>{
    const ids = list.map(c=>c.id);
    const prev = prevIdsRef.current;
    prevIdsRef.current = ids;
    if(!prev) return;
    const added = list.find(c=>prev.indexOf(c.id)<0);
    if(!added || !added.manual) return;
    let tries = 0;
    const tick = ()=>{
      const el = document.querySelector('[data-char-card="'+added.id+'"]');
      const scroller = el && el.closest('.artroom');
      if(el && scroller){
        const target = Math.max(0, scroller.scrollTop + (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - 16);
        const start = scroller.scrollTop, dist = target - start, t0 = performance.now(), dur = 420;
        const ease = x => 1 - Math.pow(1 - x, 3);
        const step = (now)=>{ const k = Math.min(1, (now - t0) / dur); scroller.scrollTop = start + dist * ease(k); if(k < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
        return;
      }
      if(tries++ < 10) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },[list]);
  const [cameoCount, setCameoCount] = React.useState(()=> (typeof nbListCameos==="function") ? nbListCameos().length : 0);
  const refreshCount = ()=>{ if(typeof nbListCameos==="function") setCameoCount(nbListCameos().length); };
  const nameOf = (id)=>{ const c=(characters||[]).find(x=>x.id===id); return c?c.name:id; };
  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    mgrOpen && React.createElement(CameoManager,{nameOf,onClose:()=>setMgrOpen(false),onChanged:refreshCount}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},
            ((typeof roomCopy==="function" && roomCopy(project,"characters").title) || "Casting Director (Character Designer)"),
            React.createElement(window.InfoTip,{label:"About Character Sheets",
              text:((typeof roomCopy==="function" && roomCopy(project,"characters").tip) ||
                "A canonical visual reference for every character \u2014 the consistency anchor you feed into each shot so they look identical in every frame. 'Design the cast' runs the Casting Director agent: on its own it drafts each character's look, finds their appearance changes (wounds, dirt, costume shifts), then generates the master sheet (pulling in their prop sheets + any cameo) and every appearance-state variant. 'Draft all' + 'Generate all characters' stay as the manual paths.\n\nTHE CAST DERIVES FROM THE STORY \u2014 there's no hand-adding here: add a character in the Writers' Room (Cast +), write them into scenes, and they appear here ready to design.")}))),
        React.createElement("div",{className:"art-intro-actions"},
          cameoCount>0 && React.createElement("button",{className:"art-cameo-mgr",onClick:()=>setMgrOpen(true),
            title:"Review & manage locked likenesses"},
            React.createElement(Icon.userScan,{s:14}),"Cameos \u00b7 "+cameoCount),
          // NO hand-adding here (product rule 2026-07-13): the cast derives from the
          // STORY — new characters are added in the Writers' Room (Cast rail +) and
          // written into scenes; the Art Room designs what the story establishes.
          // ONE primary per stage: "Design the cast" leads while specs are missing,
          // "Generate all" leads once everything is drafted; the rest are ghosts.
          onCast && React.createElement("button",{className:"art-draftall ghost",disabled:!characters.length,onClick:onCast,
            title:"Casting Director — drafts each character's look, finds their appearance changes, and generates the master sheet + every state variant, on its own"},
            React.createElement(Icon.robot,{s:14}),"Design the cast"),
          someUndrafted && React.createElement("button",{className:"art-draftall ghost",disabled:draftingAll,onClick:onDraftAll,
            title:"Draft the spec for any character that doesn't have one yet \u2014 identity, wardrobe, props & accessories, continuity and look dev (the master reference prompt builds from these). Specs only \u2014 no images; the manual alternative to Design the cast."},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":(eligibleAll>0?"Draft remaining":"Draft all (specs only)")),
          castStage!=="draft" && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the reference sheet for every drafted character \u2014 you choose whether to redo ones that already have a sheet"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all characters", typeof window.nbCostChip==="function" && window.nbCostChip(1))))),
    list.length>0 && React.createElement("div",{className:"prop-toolbar"},
      React.createElement("div",{className:"prop-searchbar collapsible"+((searchOpen||q)?" open":""),
        title:(searchOpen||q)?"":"Search characters",
        onClick:()=>{ if(!searchOpen && !q){ setSearchOpen(true); setTimeout(()=>{ if(searchRef.current) searchRef.current.focus(); },0); } }},
        React.createElement(Icon.search,{s:14}),
        React.createElement("input",{className:"prop-search-input",type:"text",value:query,ref:searchRef,
          placeholder:"Search characters by name or role…",tabIndex:(searchOpen||q)?0:-1,
          onChange:e=>setQuery(e.target.value),
          onBlur:()=>{ if(!query) setSearchOpen(false); },
          onKeyDown:e=>{ if(e.key==="Escape"){ setQuery(""); setSearchOpen(false); if(searchRef.current) searchRef.current.blur(); } }}),
        q && React.createElement("span",{className:"prop-search-count"}, shown.length+" of "+list.length),
        q && React.createElement("button",{className:"prop-search-clear",title:"Clear search",onClick:(e)=>{ e.stopPropagation(); setQuery(""); setSearchOpen(false); }},React.createElement(Icon.x,{s:13}))),
      characters.length>0 && React.createElement("div",{className:"char-style-all",
        title:"Apply one render style to the whole cast at once. Each character can still be overridden on its own card."},
        React.createElement("span",{className:"char-style-all-lab"},
          allStyling ? ("Inventing… "+allStyling.i+"/"+allStyling.total) : "Style · all cast"),
        React.createElement(window.RenderStylePicker,{value:allStyleKey,disabled:!!allStyling,
          placeholderLabel:"Mixed — per character",onPick:applyStyleAll})),
      sceneList.length>0 && React.createElement("div",{className:"prop-scenebar"},
        React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.layers,{s:13}),"Focus a scene"),
        React.createElement("select",{className:"prop-select prop-scenebar-select",value:sceneFilter,onChange:e=>setSceneFilter(e.target.value)},
          React.createElement("option",{value:""},"All scenes — show every character"),
          sceneList.map(s=>{ const n=(charsInSceneMap[s.id]?charsInSceneMap[s.id].size:0);
            return React.createElement("option",{key:s.id,value:s.id},
              "Scene "+String(s.no).padStart(2,"0")+" · "+(s.title||"")+"  ("+n+" character"+(n!==1?"s":"")+")"); })),
        // staged like the header: sheets render FROM drafted specs, so the scene
        // batch button only appears once someone in the scene is drafted — before
        // that it was a full-orange no-op (the hint line explains what to do first)
        sceneFilter && (charsInSceneMap[sceneFilter] ? list.some(c=> charsInSceneMap[sceneFilter].has(c.id) && charVisualsDrafted(c)) : false)
          && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId,onClick:startSceneBatch,
          title:"Generate the reference sheets for the characters in this scene — you choose whether to redo ones that already have a sheet"},
          React.createElement(Icon.sparkles,{s:14}),
          batchActiveId?"Generating…":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")), typeof window.nbCostChip==="function" && window.nbCostChip(1)))),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,onDraftOnly:onApplyLookbookDraftOnly,label:"these characters",dept:"characters"}),
    BatchBar && React.createElement(BatchBar,{batch,noun:"character"}),
    React.createElement("div",{className:"sheet-grid"},
      charPager.slice(shown).map(c=>React.createElement(CharacterSheet,{key:c.id,c,project,scenes,props,drafts,speaks:speakingSet.has(c.id),onUpdate,onDraft,
        drafting:draftingId===c.id||(draftingIds||[]).indexOf(c.id)>=0,onView:(url,ch)=>setView({url,character:ch}),
        batchActiveId,onBatchDone:batch.advance,onDelete:onDelete,
        onSuggestStates,suggestingStates:suggestingStatesId===c.id,onRemoveOwnedItem,onRenameOwnedItem,onDraftProp,onCreateOwnedProp}))),
    React.createElement(PagerBar,{pager:charPager,noun:"character"}),
    window.RecentlyDeleted && React.createElement(window.RecentlyDeleted,{items:trashItems,kind:"character",onRestore,onPurge}));
}

/* ---- pre-production readiness — ONE shared status model, used by the overview
   strip (#1) and the Coordinator's cost preview (#2). Counts what's GENERATED
   (nbGetImage, warmed by the Art Room's prefetch) against what the pipeline covers.
   Style is a per-scene GRADE assignment, not an image, so it carries noGen. ---- */
function preProdStatus({ project, characters, props, locations, shots, scenes }){
  const img = (id)=> (typeof nbGetImage==="function") ? !!nbGetImage(id) : false;
  const C=characters||[], P=props||[], L=locations||[], S=shots||[], SC=scenes||[];
  const graded = (typeof scenePreset==="function") ? SC.filter(s=>scenePreset(project, s.id)).length : 0;
  const boarded = SC.filter(s=> img("sbsheet-sbpage-"+s.id+"-2x2-0") || img("sbsheet-sbpage-"+s.id+"-0")).length;
  // Voices: locked among SPEAKING characters (a lock, not an image, so noGen).
  const speaking = (typeof speakingCharIds==="function") ? speakingCharIds(C, SC, S) : new Set();
  const speakers = C.filter(c=>speaking.has(c.id));
  const voiced = speakers.filter(c=>c.voiceLock && c.voiceLock.voiceId).length;
  return [
    { id:"characters", label:"Cast",        unit:"sheet", done:C.filter(c=>img(c.id)).length, total:C.length },
    { id:"props",      label:"Props",       unit:"sheet", done:P.filter(p=>img(p.id)).length, total:P.length },
    { id:"voices",     label:"Voices",      unit:"voice", noGen:true, done:voiced, total:speakers.length, navTo:"characters" },
    { id:"locations",  label:"Locations",   unit:"plate", done:L.filter(l=>img(l.id)).length, total:L.length },
    { id:"stylebible", label:"Style",       unit:"grade", noGen:true, done:graded, total:SC.length },
    { id:"shots",      label:"Shots",       unit:"frame", done:S.filter(s=>img(s.id)).length, total:S.length },
    { id:"storyboard", label:"Storyboards", unit:"sheet", done:boarded, total:SC.length },
  ];
}
window.preProdStatus = preProdStatus;

/* ---- shared SCENE PAGER — one scene at a time with ← / → (and arrow keys),
   used by the Stage, Shots and Storyboards instead of one long scroll. ---- */
function useScenePager(total, locked){
  const [idx, setIdx] = React.useState(0);
  React.useEffect(()=>{ setIdx(i=> Math.min(i, Math.max(0, total-1))); },[total]);
  React.useEffect(()=>{
    const onKey=(e)=>{ if(locked) return; const t=e.target; if(t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||"")) return;
      if(e.key==="ArrowLeft") setIdx(i=>Math.max(0,i-1));
      else if(e.key==="ArrowRight") setIdx(i=>Math.min(Math.max(0,total-1),i+1)); };
    window.addEventListener("keydown",onKey); return ()=>window.removeEventListener("keydown",onKey);
  },[total,locked]);
  return [ Math.min(idx, Math.max(0,total-1)), setIdx ];
}
window.useScenePager = useScenePager;
function ScenePager({ idx, total, title, sub, onPrev, onNext, scenes, onJump, disabled }){
  const [open, setOpen] = React.useState(false);
  const canJump = !disabled && !!(onJump && scenes && scenes.length>1);
  React.useEffect(()=>{ if(!open) return;
    const close=(e)=>{ if(!e.target.closest || !e.target.closest(".scene-pager-mid")) setOpen(false); };
    document.addEventListener("mousedown", close); return ()=>document.removeEventListener("mousedown", close); },[open]);
  return React.createElement("div",{className:"scene-pager"},
    React.createElement("button",{className:"scene-pager-arrow",onClick:onPrev,disabled:!!disabled||idx<=0,
      title:"Previous scene (←)","aria-label":"Previous scene"}, React.createElement(Icon.chevL,{s:18})),
    React.createElement("div",{className:"scene-pager-mid"+(canJump?" jump":""),
        onClick: canJump?()=>setOpen(o=>!o):undefined, title: canJump?"Jump to a scene":undefined,
        role: canJump?"button":undefined, tabIndex: canJump?0:undefined},
      React.createElement("span",{className:"scene-pager-no"},
        "Scene "+(idx+1)+" of "+total,
        canJump ? React.createElement(Icon.chevD,{s:10}) : null),
      React.createElement("span",{className:"scene-pager-title"}, title||"Untitled scene"),
      sub ? React.createElement("span",{className:"scene-pager-sub"}, sub) : null,
      (canJump && open) && React.createElement("div",{className:"scene-pager-menu",onClick:(e)=>e.stopPropagation()},
        scenes.map((s,i)=>React.createElement("button",{key:s.id||i,className:"scene-pager-menu-item"+(i===idx?" on":""),
          onClick:()=>{ onJump(i); setOpen(false); }},
          React.createElement("span",{className:"scene-pager-menu-no"}, String(s.no||(i+1)).padStart(2,"0")),
          React.createElement("span",{className:"scene-pager-menu-t"}, s.title||"Untitled scene"),
          i===idx && React.createElement(Icon.check,{s:13}))))),
    React.createElement("button",{className:"scene-pager-arrow",onClick:onNext,disabled:!!disabled||idx>=total-1,
      title:"Next scene (→)","aria-label":"Next scene"}, React.createElement(Icon.chevR,{s:18})));
}
window.ScenePager = ScenePager;

/* #1 — a compact, always-visible readiness strip across the top of the Art Room.
   Each stage shows generated/total and jumps to its tab. Refreshes as assets load
   (nb-prefetched) and as new ones generate (nb-gen-done). */
function PreProductionStatus({ project, characters, props, locations, shots, scenes, setArtView }){
  const [, force] = React.useReducer(x=>x+1, 0);
  React.useEffect(()=>{
    const bump=()=>force();
    window.addEventListener("nb-prefetched", bump);
    window.addEventListener("nb-gen-done", bump);
    return ()=>{ window.removeEventListener("nb-prefetched", bump); window.removeEventListener("nb-gen-done", bump); };
  },[]);
  // show/hide — COLLAPSED BY DEFAULT; only expanded if the user has explicitly opened it
  // before (their choice persists across sessions, device-local: "0" = shown, "1"/unset = hidden)
  const [open, setOpen] = React.useState(()=>{ try{ return localStorage.getItem("turn-pp-hidden")==="0"; }catch(e){ return false; } });
  const toggle = ()=> setOpen(o=>{ const n=!o; try{ localStorage.setItem("turn-pp-hidden", n?"0":"1"); }catch(e){} return n; });
  const stages = preProdStatus({project,characters,props,locations,shots,scenes}).filter(s=>s.total>0);
  if(!stages.length) return null;   // nothing to build yet — stay out of the way
  const done = stages.reduce((a,s)=>a+s.done,0), total = stages.reduce((a,s)=>a+s.total,0);
  const pct = total ? Math.round(100*done/total) : 0;
  return React.createElement("div",{className:"pp-status"+(open?"":" collapsed")},
    React.createElement("button",{className:"pp-status-lead",onClick:toggle,title:open?"Hide readiness":"Show readiness"},
      React.createElement("span",{className:"pp-status-eyebrow"},"Pre-production"),
      React.createElement("span",{className:"pp-status-pct"+(pct===100?" done":"")}, pct+"%"),
      React.createElement((open?Icon.chevD:Icon.chevR)||Icon.chevD,{s:12})),
    open && React.createElement("div",{className:"pp-chips"},
      stages.map(s=>{
        const state = s.done>=s.total ? "pp-complete" : s.done>0 ? "pp-partial" : "pp-empty";
        return React.createElement("button",{key:s.id,className:"pp-chip "+state,
          onClick:()=>setArtView&&setArtView(s.navTo||s.id),
          title:s.label+" — "+s.done+" of "+s.total+(s.noGen?" graded":" generated")+". Click to open."},
          React.createElement("span",{className:"pp-chip-dot"}),
          React.createElement("span",{className:"pp-chip-lab"}, s.label),
          React.createElement("span",{className:"pp-chip-ct"}, s.done+"/"+s.total));
      })));
}
window.PreProductionStatus = PreProductionStatus;

/* #2 — cost/scope preview before the Coordinator runs the whole pipeline (it
   generates a lot, end to end, with no per-step gate). Shows roughly how many
   images it will produce so a paid user isn't surprised. */
function CoordConfirm({ project, characters, props, locations, shots, scenes, onCancel, onConfirm }){
  const stages = preProdStatus({project,characters,props,locations,shots,scenes})
    .filter(s=>!s.noGen)                                   // Style grading isn't an image generation
    .map(s=>({ ...s, pending:Math.max(0, s.total - s.done) }));
  const pending = stages.filter(s=>s.pending>0);
  const totalGen = pending.reduce((a,s)=>a+s.pending,0);
  const freshShots = (shots||[]).length===0 && (scenes||[]).length>0;   // it will design shots first, then frame them
  const hasWork = totalGen>0 || freshShots;
  return React.createElement("div",{className:"ns-overlay",onMouseDown:e=>{ if(e.target===e.currentTarget) onCancel(); }},
    React.createElement("div",{className:"cc-modal"},
      React.createElement("div",{className:"cc-head"},
        React.createElement("span",{className:"cc-orb"}, React.createElement(Icon.robot,{s:17})),
        React.createElement("div",null,
          React.createElement("div",{className:"cc-title"},"Run pre-production"),
          React.createElement("div",{className:"cc-sub"},"The Coordinator builds the whole visual package in one pass — Lookbook → Cast → Props → Locations → Style → Shots → Storyboards."))),
      hasWork
        ? React.createElement(React.Fragment,null,
            React.createElement("div",{className:"cc-est"},
              React.createElement("span",{className:"cc-est-n"}, "≈ "+totalGen+(freshShots?"+":"")),
              React.createElement("span",{className:"cc-est-l"}, "image"+(totalGen===1?"":"s")+" to generate")),
            pending.length>0 && React.createElement("ul",{className:"cc-list"},
              pending.map(s=>React.createElement("li",{key:s.id},
                React.createElement("span",{className:"cc-list-lab"}, s.label),
                React.createElement("span",{className:"cc-list-n"}, s.pending+" "+s.unit+(s.pending===1?"":"s"))))),
            React.createElement("div",{className:"cc-note"},
              React.createElement(Icon.alert,{s:12}),
              React.createElement("span",null, freshShots
                ? "Plus the shots designed from your scenes and their frames. Each generation uses credits."
                : "Each generation uses credits. It also drafts the Lookbook, colour grade and any missing shot coverage as needed.")))
        : React.createElement("div",{className:"cc-note ok"},
            React.createElement(Icon.check,{s:12}),
            React.createElement("span",null,"Everything already has art — running again refines the pipeline and fills any gaps.")),
      React.createElement("div",{className:"cc-foot"},
        React.createElement("button",{className:"ns-btn ghost",onClick:onCancel},"Cancel"),
        React.createElement("button",{className:"ns-btn primary",onClick:onConfirm},
          React.createElement(Icon.robot,{s:15}), hasWork?"Generate everything":"Run anyway"))));
}
window.CoordConfirm = CoordConfirm;

function ArtComingSoon({ tab }){
  const map = {
    locations:["Locations","Pulled from every slugline in your script \u2014 each environment gets a reference plate prompt and an asset slot, so every shot in a place matches.","globe"],
    shots:["Shot List","Derived from each scene's beats \u2014 every beat becomes a shot with a generated prompt that pulls in the right character sheet and location plate for consistency.","film"],
    storyboard:["Storyboard","Your shots laid out in sequence with their reference frames \u2014 the visual blueprint of the film, ready to hand to the Stage.","board"],
  };
  const [title,desc,icon] = map[tab]||["Coming next","",""];
  return React.createElement("div",{className:"art-soon"},
    React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon[icon]||Icon.sparkles,{s:30})),
    React.createElement("div",{className:"art-soon-t"},title),
    React.createElement("div",{className:"art-soon-d"},desc),
    React.createElement("div",{className:"art-soon-tag"},"Next increment"));
}

function ArtRoom({ artView, setArtView, project, characters, scenes, props, drafts, trash, onRestoreChar, onPurgeChar, onRestoreProp, onPurgeProp, onRestoreLoc, onPurgeLoc, onEnsureOwner, onUpdateChar, onDraftVisuals, onDraftAllVisuals, draftingVisualId, draftingAllVisuals, draftingVisualIds, onCreateOwnedProp,
  onSuggestStates, suggestingStatesId, onRemoveOwnedItem, onRenameOwnedItem, onAddCharacter, onDeleteCharacter,
  onUpdateProp, onDraftProp, onDraftAllProps, onAddProp, onDeleteProp, draftingPropIds, draftingPropId, draftingAllProps, onMergeProps, onSeedFromCast, castHasProps, onTagScenes, taggingScenes, onTagOne, taggingSceneId,
  locations, onUpdateLocation, onDraftLocation, onDraftAllLocs, onAddLocation, onDeleteLocation, draftingLocIds, draftingAllLocs, onPullFromScript, scriptHasLocs, onScout, onAssignStyles, assigningStyles, onSetStyleRefs, onSetScenePreset, onSetWorldScale, onAddStyleRefImages, onRemoveStyleRefImage, onDraftStaging, draftingStageId,
  shots, beatsMap, onUpdateShot, onAddShot, onDeleteShot, onSplitBeat, splittingBeat, onDraftSceneShots, draftingSceneShots, onDraftAllShots, draftingAllShots, onDirectStoryboard, onDirectScene, onColorist, onShoot, onCast, onPropsMaster,
  lookbook, lookbookNote, onUpdateLookbook, onAddLookbook, onDeleteLookbook, onSetLookbookNote, onResearch, onClearLookbook,
  staleTabs, onApplyLookbook }){
  const _stale = staleTabs || {};
  const PropSheets = window.PropSheets;
  const LocationSheets = window.LocationSheets;
  const LookbookView = window.LookbookView;

  // Pre-warm EVERY asset URL in the project in ONE batched round-trip the moment the Art Room
  // opens, so any tab (Characters, Props, Locations, Shot List) paints with no per-card DB +
  // signed-URL call. Then preload the BYTES of whichever tab is on screen so it's instant;
  // other tabs still load bytes on click, but with no round-trip first.
  const projId = project && project.id;
  React.useEffect(()=>{ if(typeof nbPrefetchAll==="function") nbPrefetchAll(); },[projId]);
  const tabPreloadIds = ()=>{
    if(artView==="lookbook") return (lookbook||[]).map(c=>c&&c.id).filter(Boolean);
    if(artView==="characters") return (characters||[]).flatMap(c=> (c&&c.id) ? [c.id, ...(c.states||[]).map(s=>c.id+":"+s.id)] : []);
    if(artView==="props") return (props||[]).map(p=>p&&p.id).filter(Boolean);
    if(artView==="locations") return (locations||[]).flatMap(l=> (l&&l.id) ? [l.id, ...(l.variants||[]).map(v=>l.id+"-"+v.id), ...(l.coverageSheets||[]).map(v=>l.id+"-"+v.id)] : []);
    if(artView==="shots") return (shots||[]).map(s=>s&&s.id).filter(Boolean);
    return [];
  };
  React.useEffect(()=>{
    if(typeof nbPreloadFor!=="function") return;
    const ids = tabPreloadIds();
    if(!ids.length) return;
    if(typeof nbPrefetchAll==="function") nbPrefetchAll().then(()=>nbPreloadFor(ids)); else nbPreloadFor(ids);
  },[artView, projId, (characters||[]).length, (props||[]).length, (locations||[]).length, (shots||[]).length, (lookbook||[]).length]);

  return React.createElement("div",{className:"artroom"},
    // fixed engine dock — Model / Aspect / Resolution, always reachable while
    // scrolling at every viewport
    React.createElement(NbDock,null),
    // (pre-production readiness strip removed — user ruling 2026-07-19)
    artView==="lookbook" && LookbookView
      ? React.createElement(LookbookView,{project,lookbook,note:lookbookNote,
          onUpdate:onUpdateLookbook,onAdd:onAddLookbook,onDelete:onDeleteLookbook,onSetNote:onSetLookbookNote,onResearch,onClear:onClearLookbook})
    : artView==="characters"
      ? React.createElement(CharacterSheets,{project,characters,scenes,props,drafts,shots,beatsMap,onUpdate:onUpdateChar,
          onDraftProp,onCreateOwnedProp,
          onDraft:onDraftVisuals,onDraftAll:onDraftAllVisuals,draftingId:draftingVisualId,draftingAll:draftingAllVisuals,draftingIds:draftingVisualIds,
          trashItems:(trash&&trash.characters)||[],onRestore:onRestoreChar,onPurge:onPurgeChar,
          onSuggestStates,suggestingStatesId,onRemoveOwnedItem,onRenameOwnedItem,onAdd:onAddCharacter,onDelete:onDeleteCharacter,onCast,
          lookbookStale:!!_stale.characters,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("characters"),
          onApplyLookbookDraftOnly:()=>onApplyLookbook&&onApplyLookbook("characters","draft")})
    : artView==="props" && PropSheets
      ? React.createElement(PropSheets,{project,props,characters,scenes,drafts,onUpdate:onUpdateProp,onDraft:onDraftProp,
          onDraftAll:onDraftAllProps,onAdd:onAddProp,onDelete:onDeleteProp,draftingId:draftingPropId,draftingIds:draftingPropIds,draftingAll:draftingAllProps,
          trashItems:(trash&&trash.props)||[],onRestore:onRestoreProp,onPurge:onPurgeProp,onEnsureOwner,
          onSeedFromCast,castHasProps,onTagScenes,taggingScenes,onTagOne,taggingSceneId,onMergeProps,onPropsMaster,
          lookbookStale:!!_stale.props,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("props"),
          onApplyLookbookDraftOnly:()=>onApplyLookbook&&onApplyLookbook("props","draft")})
    : artView==="locations" && LocationSheets
      ? React.createElement(LocationSheets,{project,locations,scenes,drafts,onUpdate:onUpdateLocation,onDraft:onDraftLocation,onSetWorldScale,
          onDraftAll:onDraftAllLocs,onAdd:onAddLocation,onDelete:onDeleteLocation,draftingIds:draftingLocIds,draftingAll:draftingAllLocs,
          trashItems:(trash&&trash.locations)||[],onRestore:onRestoreLoc,onPurge:onPurgeLoc,
          onPullFromScript,scriptHasLocs,onDraftStaging,draftingStageId,onScout,
          lookbookStale:!!_stale.locations,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("locations"),
          onApplyLookbookDraftOnly:()=>onApplyLookbook&&onApplyLookbook("locations","draft")})
      : artView==="stylebible" && window.StyleBibleView
      ? React.createElement(window.StyleBibleView,{project,scenes,onAssign:onAssignStyles,assigning:assigningStyles,onSetRefs:onSetStyleRefs,onSetScenePreset,onAddRefImages:onAddStyleRefImages,onRemoveRefImage:onRemoveStyleRefImage,onColorist,
          lookbookStale:!!_stale.stylebible,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("colorist")})
      : artView==="shots" && window.ShotList
      ? React.createElement(window.ShotList,{project,scenes,characters,props,locations,shots,beatsMap,
          onUpdateShot,onAddShot,onDeleteShot,onSplitBeat,splittingBeat,onDraftSceneShots,draftingSceneShots,onDraftAllShots,draftingAllShots,onShoot,onDirectScene})
      : artView==="storyboard" && window.StoryboardView
      ? React.createElement(window.StoryboardView,{project,scenes,shots,characters,props,locations,beatsMap,setArtView,onDirect:onDirectStoryboard})
      : React.createElement(ArtComingSoon,{tab:artView}));
}
window.ArtRoom = ArtRoom;

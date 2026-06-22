/* artroom.jsx — The Art Room (pre-production).
   Path A: TURN generates the prompts & specs and holds the asset slots; the user
   runs the image/video tools and drops results back in. Everything derives from
   the script so characters/locations/shots stay consistent.

   Character Sheets are pro consistency anchors: identity tokens + render texture,
   two wardrobe states (public mask / private self), accessories, scale & height,
   a colour palette (incl. a climax-state colour), a negative prompt, and a
   10-panel master-grid reference prompt — all auto-populated when a story is
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
window.CHAR_RENDER_STYLES = CHAR_RENDER_STYLES;
const CHAR_RENDER_STYLE_OPTIONS = [
  { key:"photoreal",  label:"Photoreal / cinematic" },
  { key:"render3d",   label:"Stylized 3D render" },
  { key:"anime",      label:"Anime / manga" },
  { key:"flat",       label:"Flat vector / graphic" },
  { key:"horror",     label:"Cinematic horror" },
  { key:"ghibli",     label:"Studio Ghibli" },
  { key:"animated3d", label:"Animated feature 3D" },
  { key:"pixar",      label:"Pixar-style 3D" },
  { key:"stopmotion", label:"Stop-motion" },
  { key:"claymation", label:"Claymation" },
  { key:"adv1960s",   label:"1960s advertising" },
  { key:"gaganime",   label:"90s gag-anime" },
  { key:"pixelart",   label:"Retro pixel-art" },
  { key:"surprise",   label:"Surprise me \u2728" },
];
window.CHAR_RENDER_STYLE_OPTIONS = CHAR_RENDER_STYLE_OPTIONS;

/* the resolved render block for a character: the picked preset, or an AI-invented bespoke
   block for "surprise" (stored on c.surpriseRender), falling back to photoreal. */
function charRenderBlock(c){
  const key = (c && c.renderStyleKey) || "photoreal";
  if(key==="surprise" && c && c.surpriseRender && c.surpriseRender.render) return c.surpriseRender.render;
  return CHAR_RENDER_STYLES[key] || CHAR_RENDER_STYLES.photoreal;
}
window.charRenderBlock = charRenderBlock;

/* JSON character spec (the director's concept-art template as a key:value spec,
   2026-06): full-body turnaround (front/side/back), a 3-portrait face grid top right,
   four detail close-ups bottom right, neutral grey studio sweep, NO text on the sheet. The
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
  // any accessories-text items NOT already covered by a worn-prop card (so nothing is lost)
  const accExtra = (typeof splitListItems==="function" ? splitListItems(acc) : (acc?[acc]:[]))
    .filter(it=> it && !wornKeys.has(_norm(it)));
  const accAll = [...wornDescs, ...accExtra];
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  const F = c.physique || {};
  const phys = {
    apparent_age: clean(F.age)||undefined, ethnicity: clean(F.ethnicity)||undefined,
    skin: clean(F.skin)||undefined, eyes: clean(F.eyes)||undefined, hair: clean(F.hair)||undefined,
    face: clean(F.face)||undefined, build: clean(F.build)||undefined,
  };
  const hasPhys = Object.values(phys).some(Boolean);
  const spec = {
    task: "character concept art sheet",
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
      hands: "both hands empty and relaxed at sides",
    },
    layout: {
      hero_portrait: "left panel (largest, ~1/3 of the sheet): a single front-facing head-and-shoulders close-up \u2014 detailed face, hair, and upper wardrobe/collar",
      turnaround: {
        position: "right two-thirds of the sheet: three full-body poses in evenly divided vertical panels, left to right",
        poses: [
          "front view \u2014 full body, facing forward, arms at sides",
          "three-quarter front view \u2014 full body, turned ~30\u201345\u00b0 to one side",
          "back view \u2014 full body, facing away"
        ]
      }
    },
    continuity: {
      identity_rule: "the SAME identical face, build and identity in every view",
      anatomy: "true-to-design anatomy and proportions \u2014 never humanize a non-human design",
    },
    render: { ...charRenderBlock(c), aspect: "16:9" },
    style_name: ((c.renderStyleKey==="surprise" && c.surpriseRender && c.surpriseRender.label) ? c.surpriseRender.label : undefined),
  };
  return "Render this character concept-art sheet EXACTLY as specified by this JSON spec (continuity fields are binding):\n"+JSON.stringify(spec, null, 1);
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
  s += "LAYOUT: character concept art sheet \u2014 LEFT panel (largest, ~1/3): a single front-facing head-and-shoulders close-up (detailed face, hair, upper wardrobe/collar); ";
  s += "RIGHT two-thirds: three full-body poses in evenly divided vertical panels, left to right \u2014 front view (facing forward, arms at sides), three-quarter front view (turned ~30\u201345\u00b0), back view (facing away); ";
  s += "both hands empty and relaxed at sides, seamless neutral studio sweep background, no text, no labels, no annotations, ";
  s += "soft studio lighting, the SAME identical face in every view, sharp focus.";
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
    if(typeof nbHasKeyForCurrent==="function" && !nbHasKeyForCurrent()){ setGenErr("Set your "+((typeof nbProviderLabel==="function"&&typeof providerOfModel==="function"&&typeof nbGetModel==="function")?nbProviderLabel(providerOfModel(nbGetModel())):"image")+" API key first (top of this tab)."); return; }
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
    if(isEditMode){ refImage = genUrl; mode = "edit"; }
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
    if(groundEnabled){ genOpts.groundSearch = true; if(isFlash) genOpts.groundImageSearch = true; }

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
    attachList.forEach(a=>refsUsed.push({ kind:"prop", label:a.note||"Prop sheet", url:a.url }));
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
        } else if(isPolicy && typeof providerOfModel==="function" && providerOfModel(usedModel)==="openai"){
          // GPT Image refused on CONTENT POLICY — auto-fall back to Google (Nano Banana),
          // which is far more permissive for cinematic content (action, blood, intensity).
          // One-off: the user's SELECTED engine is left unchanged, only this frame switches.
          const gModel = allModels.find(m=> typeof providerOfModel==="function" && providerOfModel(m.id)==="google");
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
      const meta = {
        modelLabel: mEntry.label || "Nano Banana",
        modelId: actualModel,
        policyFallback: !!policyFellBack,
        aspect: genOpts.aspectRatio || ((typeof nbGetAspect==="function") ? nbGetAspect() : "16:9"),
        size: genOpts.imageSize || ((typeof nbGetRes==="function") ? nbGetRes() : "2K"),
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
  /* one-tap "undo last edit": restore the most recent prior version (layer 0) */
  const revertPrevious = async ()=>{ await revertTo(0); };
  /* delete a single version from history */
  const deleteVersion = async (index)=>{
    if(typeof nbDeleteHistoryEntry!=="function") return;
    await nbDeleteHistoryEntry(id, index);
    refreshLayers();
  };

  return { genUrl, genMeta, genTier, gening, genErr, retrying, slotHasRef,
    editMode, setEditMode, editText, setEditText, generate, cancelGen, clearGen, importSheet, relatedClearCount, loadDetails, revertTo, revertPrevious, deleteVersion, layers, allModels };
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
function BatchBar({ batch, noun }){
  const { activeId, msg, prompt, run, cancel, setPrompt, setMsg } = batch;
  // the bar lives at the TOP of the tab, but its triggers (e.g. a card's generate
  // button) can sit far down the page — scroll the bar into view when it has a
  // question or status, or the click looks like it did nothing.
  const barRef = React.useRef(null);
  React.useEffect(()=>{
    if((prompt || msg) && barRef.current && barRef.current.scrollIntoView)
      barRef.current.scrollIntoView({ block:"nearest", behavior:"smooth" });
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
        React.createElement(Icon.sparkles,{s:13}),"Generate "+prompt.missing.length+" missing"),
      React.createElement("button",{className:"art-draftall"+(prompt.missing.length?" ghost":""),
        onClick:()=>run([...prompt.missing, ...prompt.existing], 0),
        title:"Generate every "+N+", regenerating ones that already have a sheet"},
        React.createElement(Icon.sparkles,{s:13}),"Regenerate all "+(prompt.missing.length+prompt.existing.length)),
      React.createElement("button",{className:"art-draftall ghost",onClick:()=>{ setPrompt(null); setMsg(""); }},"Cancel")),
    activeId && React.createElement("button",{className:"art-draftall ghost",onClick:cancel},"Cancel"),
    msg && React.createElement("span",{className:"prop-scenebar-msg"},msg));
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
        /* metadata grid */
        React.createElement("div",{className:"dt-grid"},
          field("Model", meta.modelId || meta.modelLabel || null),
          field("Resolution", meta.size),
          field("Aspect ratio", meta.aspect),
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
                  React.createElement("span",{className:"dt-thumb-lab"},r.label))))
            : React.createElement("div",{className:"dt-noref"},"No reference images for this version \u2014 generated from the prompt alone.")),
        /* version history — each prior version is an edit "layer" you can preview or restore */
        history.length>0 && React.createElement("div",{className:"dt-section"},
          React.createElement("div",{className:"dt-sec-lab"},
            React.createElement(Icon.history,{s:12}),"Earlier versions ("+history.length+")"),
          React.createElement("div",{className:"dt-hist"},
            history.map((h,i)=>{
              const hm = h.meta||{};
              const isEdit = hm.mode==="edit";
              const layerLabel = isEdit
                ? ("Edit: "+(hm.editInstruction||"adjustment"))
                : (hm.mode==="photo" ? "From reference photo" : hm.mode==="cameo" ? "From cameo likeness" : "Original generation");
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
function SheetFrame({ gen, slotId, name, avatarColor, initials, drafted, drafting, onDraft, entity, onView, slotPlaceholder, noun, onDelete, deleteLabel, specGate, extraMeta, menuExtra, dropToImport, onStop }){
  const { genUrl, genMeta, genTier, gening, genErr, retrying, slotHasRef,
    editMode, setEditMode, editText, setEditText, generate, cancelGen, clearGen, importSheet, relatedClearCount, revertPrevious, layers, allModels } = gen;
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
        onKeyDown:e=>{ if(e.key==="Enter"&&editText.trim()) generate({editInstruction:editText.trim()});
                       if(e.key==="Escape"){ setEditMode(false); setEditText(""); } }}),
      React.createElement("div",{className:"sheet-edit-acts"},
        React.createElement("button",{className:"sheet-edit-apply",
          onClick:()=>generate({editInstruction:editText.trim()}),disabled:!editText.trim()||gening},
          React.createElement(Icon.wand,{s:12}),"Apply edit"),
        layers>0 && React.createElement("button",{className:"sheet-edit-undo",disabled:gening,
          title:"Restore the version before your last edit",onClick:()=>revertPrevious&&revertPrevious()},
          React.createElement(Icon.undo,{s:12}),"Undo last edit"),
        React.createElement("button",{className:"sheet-edit-cancel",
          onClick:()=>{ setEditMode(false); setEditText(""); }},"Cancel")),
      layers>0 && React.createElement("div",{className:"sheet-edit-layers"},
        React.createElement(Icon.history,{s:10}),
        layers+" earlier version"+(layers!==1?"s":"")+" \u00b7 see all in the \u2026 menu \u203a Details")),
    // generate + (while running) stop sit on ONE row — full-width when idle, 50/50 while generating
    React.createElement("div",{className:"sheet-gen-row"},
    React.createElement("button",{className:"sheet-gen-btn",onClick:handleGenerateClick,disabled:gening||(drafting&&pendingGenerate)||specBlocked,
      title:(!drafted && !genUrl && !slotHasRef)
        ? "Fills the text spec from the script first, then generates the sheet in one step"
        : (genUrl ? "Generate a fresh sheet from the current spec" : "Generate the sheet from the current spec")},
      (gening || (drafting && pendingGenerate))
        ? React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),
            pendingGenerate ? "Drafting\u2026" :
            retrying ? "Retrying simplified\u2026" : "Generating\u2026")
        : React.createElement(React.Fragment,null,React.createElement(Icon.sparkles,{s:13}),
            specBlocked ? "Draft the spec first" :
            genUrl ? ("Regenerate "+noun) :
            (slotHasRef ? "Generate from photo" :
            (!drafted ? "Draft & Generate" : ("Generate "+noun))))),
    // Stop an in-flight generation — discards the result so it won't commit over the frame.
    gening && React.createElement("button",{className:"sheet-gen-stop",onClick:()=> onStop ? onStop() : (cancelGen && cancelGen()),
      title:"Stop this generation — nothing will be saved over the current frame"},
      React.createElement(Icon.x,{s:13}),"Stop")),
    // import a finished, full-res sheet generated outside the app (GPT Image 2, etc.)
    React.createElement("input",{ref:uploadRef,type:"file",accept:"image/png,image/jpeg,image/webp,image/avif",
      style:{display:"none"},onChange:onUploadPicked}),
    // when the empty slot already imports on drop/click (dropToImport), this button is redundant
    !genUrl && importSheet && !dropToImport && noun!=="location plate" && React.createElement("button",{className:"sheet-upload-btn",onClick:pickUpload,disabled:gening,
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
        title:genMeta.groundImages ? "Generated with Google Search grounding (web + images)" : "Generated with Google Search grounding"},
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
              React.createElement(Icon.monitor,{s:10,sw:1.8}),genMeta.size),
            React.createElement("span",{className:"sheet-meta-item",title:"Generated"},
              React.createElement(Icon.clock,{s:10,sw:1.8}),genMeta.date))
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
  return React.createElement("div",{className:"copybox"},
    React.createElement("div",{className:"copybox-head"},
      React.createElement("span",{className:"copybox-lab"},label),
      React.createElement("button",{className:"copybox-btn",onClick:copy},
        React.createElement(Icon[copied?"check":"copy"]||Icon.check,{s:12}), copied?"Copied":"Copy")),
    React.createElement("div",{className:"copybox-text"},text));
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

function CharacterSheet({ c, project, scenes, props, drafts, speaks, onUpdate, onDraft, drafting, onView, onSuggestStates, suggestingStates, onRemoveOwnedItem, onRenameOwnedItem, batchActiveId, onBatchDone, onDelete }){
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
    const bullets = [...split(c.accessories), ...split(c.props)].filter(it=>normName(it));
    const match = bullets.map(it=>{
      const exact = byNorm[normName(it)];
      if(exact && !claimed.has(exact.id)){ claimed.add(exact.id); return exact; }
      return null;
    });
    bullets.forEach((it,i)=>{ if(match[i]) return;
      const m = fuzzyProp(it); if(m){ claimed.add(m.id); match[i]=m; } });
    const rows = bullets.map((it,i)=>(
      { key:"b-"+normName(it)+"-"+i, name: match[i]?match[i].name:it, prop: match[i]||null, orphan:false }));
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
      if(url) out.push({ url, note: p.name+(p.kind?(" ("+p.kind+")"):"") });
    }
    return out;
  };
  /* which owned props currently have a generated sheet (for the linked-props indicator) */
  const [ownedSheetMap, setOwnedSheetMap] = React.useState({});
  const [sheetTick, setSheetTick] = React.useState(0);   // bump to re-check sheet presence
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
  const missingPropSheets = wornProps.filter(p=> !orphanIds.has(p.id) && !ownedSheetMap[p.id]);
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
  const batchStarted = React.useRef(false);
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===c.id;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){ batchStarted.current=true; wasGening.current=false; gen.generate({ batch:true }); return; }
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
              React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"))),
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
              value:(c.pronouns||(typeof window.charPronouns==="function"?window.charPronouns(c):"they/them")),
              onChange:e=>onUpdate(c.id,{pronouns:e.target.value})},
              ["he/him","she/her","they/them"].map(p=>React.createElement("option",{key:p,value:p},p)))))),
        // ALWAYS-VISIBLE scenes row (outside the collapsible role details)
        React.createElement("div",{className:"sheet-scenes"},
          React.createElement("span",{className:"sheet-scenes-lab",title:"Every scene this character appears in (drives or is named in). Filled chips = scenes they DRIVE."},"Appears in"),
          appearsScenes.length
            ? appearsScenes.map(s=>React.createElement("span",{key:s.id,
                className:"sheet-scene-chip"+(drivenIds.has(s.id)?" driven":""),
                title:(s.title||("Scene "+s.no))+(drivenIds.has(s.id)?" · drives this scene":" · appears")},
                String(s.no).padStart(2,"0")))
            : React.createElement("span",{className:"sheet-scenes-none"},"none yet"))),

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
        React.createElement("select",{className:"prop-select char-style-select",value:c.renderStyleKey||"photoreal",
          disabled:styling,onChange:e=>pickRenderStyle(e.target.value)},
          (window.CHAR_RENDER_STYLE_OPTIONS||[]).map(o=>React.createElement("option",{key:o.key,value:o.key},o.label))),
        styling && React.createElement("span",{className:"char-style-busy"},React.createElement("span",{className:"ns-spin"}),"Inventing…"),
        (!styling && c.renderStyleKey==="surprise" && c.surpriseRender && c.surpriseRender.label) &&
          React.createElement("span",{className:"char-style-name",title:"Re-roll a new surprise style",onClick:reSurprise},
            c.surpriseRender.label," ↻")),

      React.createElement(CardFold,{label:"Identity",defaultOpen:false},
        // physical identity as a clean LABELLED LIST (each field editable), instead of one
        // run-on paragraph. Edits update the structured `physique` (the source the prompt
        // reads) AND recompose `coreBody` so downstream/legacy readers stay in sync.
        (()=>{
          const F = c.physique || {};
          const KEYS=["age","ethnicity","skin","eyes","hair","face","build"];
          const hasPhys = KEYS.some(k=>String(F[k]||"").trim());
          const recompose=(nf)=>{ const t=[nf.age&&("Apparent age: "+nf.age),nf.ethnicity&&("Ethnicity: "+nf.ethnicity),
            nf.skin&&("Skin tone: "+nf.skin),nf.eyes&&("Eye colour: "+nf.eyes),nf.hair&&("Hair: "+nf.hair),
            nf.face&&("Face shape: "+nf.face),nf.build&&("Body type: "+nf.build)].filter(Boolean).join(". "); return t?(t+"."):""; };
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
            // SCALE CLASS — drives the height sheet's ruler AND the per-shot world-POV rewrite
            // (gigantism / miniaturization). A/B/C; resolves any legacy free-text value.
            React.createElement("div",{className:"phys-row",key:"Scale"},
              React.createElement("span",{className:"phys-lab"},"Scale"),
              React.createElement("select",{className:"prop-select char-style-select",
                value:(typeof scaleClassOf==="function"?scaleClassOf(c):"A"),
                title:"Scale class — sets the character's height range and how the world is rendered from their POV in shots",
                onChange:e=>onUpdate(c.id,{scaleClass:e.target.value})},
                React.createElement("option",{value:"A"},"Class A · Human scale"),
                React.createElement("option",{value:"B"},"Class B · Small / critter"),
                React.createElement("option",{value:"C"},"Class C · Massive / giant"))));
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
          slotPlaceholder:"Generate the height chart", noun:"scale sheet", dropToImport:true })),

      React.createElement(CardFold,{label:"Master reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"10-panel grid \u2014 feed to your image tool",text:promptText}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:c.negativePrompt||v.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(c.id,{negativePrompt:val})}),
        React.createElement(CopyBox,{label:"Final prompt \u2014 master + negative (sent to Nano Banana)",text:finalPrompt})),

      cameoOpen && React.createElement(CameoModal,{ character:c,
        onClose:()=>setCameoOpen(false),
        onSaved:()=>{ refreshCameo(); } }),
      voiceOpen && window.VoiceModal && React.createElement(window.VoiceModal,{ character:c, project, speaks,
        onUpdate, onClose:()=>setVoiceOpen(false) })));
}

function NbKeyBar(){
  const [model, setModelState] = React.useState(()=> (typeof nbGetModel==="function") ? nbGetModel() : "");
  React.useEffect(()=>{
    const h = ()=> setModelState((typeof nbGetModel==="function") ? nbGetModel() : "");
    window.addEventListener("nb-model-changed", h);
    return ()=>window.removeEventListener("nb-model-changed", h);
  },[]);
  const provider = (typeof providerOfModel==="function") ? providerOfModel(model) : "google";
  const isOAI = provider==="openai";
  // proxied: this provider's generation runs server-side (no browser key). Always
  // true for GPT Image; true for Nano Banana too when the image proxy is enabled.
  const proxied = isOAI || (typeof imageProxyOn==="function" && imageProxyOn());
  const getKeyFn = isOAI ? oaiGetKey : nbGetKey;
  const setKeyFn = isOAI ? oaiSetKey : nbSetKey;
  const label = isOAI ? "GPT Image" : "Nano Banana";
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
    React.createElement("span",null,label+" runs on your server"),
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
  const [mOpen, setMOpen] = React.useState(false);   // mobile dropdown open
  const tipRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const models = window.NB_MODELS || [];
  const aspects = window.NB_ASPECTS || ["16:9","21:9"];
  const isFlash = model === "gemini-3.1-flash-image";
  const isGpt = /^gpt-image/.test(model||"");
  const [oaiQ, setOaiQ] = React.useState(()=> (typeof nbGetOaiQuality==="function") ? nbGetOaiQuality() : "medium");
  const modelLabel = (models.find(m=>m.id===model)||{}).label || model || "Model";

  /* close tooltip on outside click */
  React.useEffect(()=>{
    if(!groundTip) return;
    const h = e=>{ if(tipRef.current && !tipRef.current.contains(e.target)) setGroundTip(false); };
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
            onMouseEnter:()=>setGroundTip(true),
            onMouseLeave:(e)=>{ if(!tipRef.current||!tipRef.current.contains(e.relatedTarget)) setGroundTip(false); },
            onClick:()=>setGroundTip(t=>!t),
            title:"Grounding"},
            React.createElement(Icon.bolt,{s:11,sw:2.2}),ground?"On":""),
          groundTip && React.createElement("div",{className:"nb-ground-tip"},
            React.createElement("div",{className:"nb-ground-tip-head"},
              React.createElement(Icon.bolt,{s:11,sw:2.2}),
              "Grounding",
              React.createElement("span",{className:"nb-ground-tip-badge"},"Nano Banana 2"),
              React.createElement("span",{className:"nb-ground-tip-sub"},"real-world visual references")),
            React.createElement("div",{className:"nb-ground-tip-body"},
              "When on, the model searches Google Images to anchor generation to real-world ",
              "references \u2014 period costumes, locations, props."),
            React.createElement("div",{className:"nb-seg nb-ground-seg"},
              React.createElement("button",{className:"nb-seg-btn "+(!ground?"on":""),
                onClick:()=>{ setGround(false); nbSetGroundSearch&&nbSetGroundSearch(false); }},
                "Off"),
              React.createElement("button",{className:"nb-seg-btn "+(ground?"on":""),
                onClick:()=>{ setGround(true); nbSetGroundSearch&&nbSetGroundSearch(true); }},
                "Web + images")))))),
    /* GPT Image quality — its own labelled control (high routinely exceeds the
       proxy's time window on composite sheets: 504, billed but no image) */
    isGpt && React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Quality"),
      React.createElement("div",{className:"nb-ctl-row"},
        React.createElement("div",{className:"nb-seg"},
          ["low","medium","high"].map(q=>React.createElement("button",{key:q,
            className:"nb-seg-btn "+(oaiQ===q?"on":""),
            title: q==="high" ? "Slowest — composite sheets may time out at the proxy" : (q==="medium" ? "Recommended — fits the proxy window" : "Fastest"),
            onClick:()=>{ setOaiQ(q); nbSetOaiQuality&&nbSetOaiQuality(q); }}, q))))),
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Aspect"),
      React.createElement("div",{className:"nb-seg"},
        aspects.map(a=>React.createElement("button",{key:a,className:"nb-seg-btn "+(aspect===a?"on":""),
          onClick:()=>{ setAspect(a); nbSetAspect(a); }},a)))),
    React.createElement("div",{className:"nb-ctl"},
      React.createElement("span",{className:"nb-ctl-lab"},"Resolution"),
      React.createElement("div",{className:"nb-seg"},
        (window.NB_RESOLUTIONS||["1K","2K","4K"]).map(r=>React.createElement("button",{key:r,className:"nb-seg-btn "+(resv===r?"on":""),
          onClick:()=>{ setResv(r); nbSetRes(r); }},r))))));
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
    const h = e=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return ()=>document.removeEventListener("mousedown", h);
  },[open]);
  const model  = (typeof nbGetModel==="function") ? nbGetModel() : "";
  const aspect = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  const resv   = (typeof nbGetRes==="function") ? nbGetRes() : "2K";
  const short  = /pro/i.test(model) ? "PRO" : /gpt/i.test(model) ? "GPT" : "NB2";
  return React.createElement("div",{className:"nb-dock"+(open?" open":""),ref:ref,"aria-label":"Image engine settings"},
    React.createElement("button",{className:"nb-dock-toggle","aria-expanded":open?"true":"false",
      title:"Image engine — model, aspect & resolution",onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"nb-dock-chip model"},short),
      React.createElement("span",{className:"nb-dock-chip"},aspect),
      React.createElement("span",{className:"nb-dock-chip"},resv)),
    // clicks inside the panel re-render the dock so the summary chips stay fresh
    open && React.createElement("div",{className:"nb-dock-panel",onClick:()=>force(x=>x+1)},
      React.createElement(NbControls,null)));
}

function ImageLightbox({ url, character, onClose }){
  const [res, setRes] = React.useState(()=> (typeof nbGetRes==="function") ? nbGetRes() : "2K");
  const [busy, setBusy] = React.useState(false);
  const resolutions = window.NB_RESOLUTIONS || ["1K","2K","4K"];
  const download = async ()=>{
    if(busy) return; setBusy(true);
    const fn = (character && character.name ? character.name.replace(/[^\w]+/g,"_") : "character")+"_sheet_"+res+".png";
    try{ await nbDownload(url, res, fn); }catch(e){}
    setBusy(false);
  };
  return React.createElement("div",{className:"lb-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"lb-panel"},
      React.createElement("div",{className:"lb-head"},
        React.createElement("span",{className:"lb-title"},character?character.name:"Character sheet"),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),
      React.createElement("div",{className:"lb-imgwrap"},
        React.createElement("img",{className:"lb-img",src:url,alt:"full view"})),
      React.createElement("div",{className:"lb-foot"},
        React.createElement("span",{className:"lb-foot-lab"},"Download"),
        React.createElement("div",{className:"nb-seg"},
          resolutions.map(r=>React.createElement("button",{key:r,className:"nb-seg-btn "+(res===r?"on":""),
            onClick:()=>setRes(r)},r))),
        React.createElement("button",{className:"lb-dl",onClick:download,disabled:busy},
          busy?React.createElement(React.Fragment,null,React.createElement("span",{className:"ns-spin dark"}),"Preparing\u2026")
              :React.createElement(React.Fragment,null,React.createElement(Icon.download,{s:14}),"Download "+res)))));
}

function CharacterSheets({ project, characters, scenes, props, drafts, shots, beatsMap, onUpdate, onDraft, onDraftAll, draftingId, draftingAll, draftingIds, onSuggestStates, suggestingStatesId, onRemoveOwnedItem, onRenameOwnedItem, onAdd, onDelete, onCast, trashItems, onRestore, onPurge, lookbookStale, onApplyLookbook, onApplyLookbookDraftOnly }){
  const [view, setView] = React.useState(null);   // {url, character}
  // which characters actually speak (have dialogue) — used to flag the per-card Voice control
  const speakingSet = React.useMemo(()=> (typeof speakingCharIds==="function") ? speakingCharIds(characters, scenes, shots) : new Set(), [characters, scenes, shots]);
  const [mgrOpen, setMgrOpen] = React.useState(false);
  const [sceneFilter, setSceneFilter] = React.useState("");   // "" = all scenes
  const [query, setQuery] = React.useState("");               // free-text name search
  // film-wide render style: apply one visual language to the WHOLE cast at once. Shows the
  // shared key, or blank ("Mixed") when characters differ. "surprise" invents a bespoke
  // style per character (each unique), so it confirms the per-character AI cost first.
  const [allStyling, setAllStyling] = React.useState(null);   // null | {i,total}
  const cast = characters || [];
  // CAST SCALE CHART — the whole cast on one shared ruler at true relative heights (the
  // relative-scale anchor for shots). References every character's master sheet. Wide canvas.
  const castChartId = "castscale-"+((project&&project.id)||"film");
  const castGen = useImageGen({
    id: castChartId, slotId: castChartId,
    buildFinal:  ()=> (typeof buildCastChartPrompt==="function") ? buildCastChartPrompt(cast) : "",
    buildSimple: ()=> (typeof buildCastChartPrompt==="function") ? buildCastChartPrompt(cast) : "",
    attachments: async ()=>{ const out=[]; for(const c of cast){ let u=(typeof nbGetImage==="function")?nbGetImage(c.id):"";
      if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(c.id); }catch(e){} }
      if(u) out.push({ url:u, note:c.name+(c.height?(" — "+c.height):"") }); } return out; },
    attachmentsText: ()=>"", referenceMaxDim: 640,
  });
  const genCastChart = ()=> castGen.generate({ aspectRatio:"21:9" });
  const allStyleKey = (cast.length && cast.every(c=>(c.renderStyleKey||"photoreal")===(cast[0].renderStyleKey||"photoreal")))
    ? (cast[0].renderStyleKey||"photoreal") : "";
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
                "A canonical visual reference for every character \u2014 the consistency anchor you feed into each shot so they look identical in every frame. 'Design the cast' runs the Casting Director agent: on its own it drafts each character's look, finds their appearance changes (wounds, dirt, costume shifts), then generates the master sheet (pulling in their prop sheets + any cameo) and every appearance-state variant. 'Draft all' + 'Generate all characters' stay as the manual paths.")}))),
        React.createElement("div",{className:"art-intro-actions"},
          characters.length>0 && React.createElement("label",{className:"char-style-all",
            title:"Apply one render style to the whole cast at once. Each character can still be overridden on its own card."},
            React.createElement("span",{className:"char-style-all-lab"},
              allStyling ? ("Inventing… "+allStyling.i+"/"+allStyling.total) : "Style · all cast"),
            React.createElement("select",{className:"char-style-select",value:allStyleKey,
              disabled:!!allStyling,onChange:e=>applyStyleAll(e.target.value)},
              allStyleKey==="" && React.createElement("option",{value:""},"Mixed — per character"),
              (window.CHAR_RENDER_STYLE_OPTIONS||[]).map(o=>
                React.createElement("option",{key:o.key,value:o.key}, o.label)))),
          cameoCount>0 && React.createElement("button",{className:"art-cameo-mgr",onClick:()=>setMgrOpen(true),
            title:"Review & manage locked likenesses"},
            React.createElement(Icon.userScan,{s:14}),"Cameos \u00b7 "+cameoCount),
          onAdd && React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
            React.createElement(Icon.plus,{s:14}),"Add character"),
          onCast && React.createElement("button",{className:"art-draftall",disabled:!characters.length,onClick:onCast,
            title:"Casting Director — drafts each character's look, finds their appearance changes, and generates the master sheet + every state variant, on its own"},
            React.createElement(Icon.robot,{s:14}),"Design the cast"),
          someUndrafted && React.createElement("button",{className:"art-draftall",disabled:draftingAll,onClick:onDraftAll,
            title:"Draft the spec for any character that doesn't have one yet \u2014 identity, wardrobe, props & accessories, continuity and look dev (the master reference prompt builds from these)"},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":(eligibleAll>0?"Draft remaining":"Draft all characters")),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the reference sheet for every drafted character \u2014 you choose whether to redo ones that already have a sheet"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all characters"),
          // CAST SCALE CHART \u2014 one shared-ruler height comparison of the whole cast
          cast.length>1 && ((castGen.genUrl && !castGen.gening)
            ? React.createElement(React.Fragment,null,
                React.createElement("button",{className:"art-draftall ghost",onClick:()=>setView({url:castGen.genUrl,character:{name:"Cast scale chart"}}),
                  title:"View the cast scale chart (the cast on one shared ruler)"},
                  React.createElement(Icon.image,{s:14}),"Cast scale chart"),
                React.createElement("button",{className:"art-draftall ghost",onClick:genCastChart,title:"Regenerate the cast scale chart"},
                  React.createElement(Icon.undo,{s:13})))
            : React.createElement("button",{className:"art-draftall ghost",disabled:castGen.gening,onClick:genCastChart,
                title:"Generate a shared-ruler height comparison of the whole cast \u2014 the relative-scale anchor for shots"},
                React.createElement(Icon.sparkles,{s:14}), castGen.gening?"Charting\u2026":"Cast scale chart"))))),
    list.length>0 && React.createElement("div",{className:"prop-toolbar"},
      React.createElement("div",{className:"prop-searchbar"},
        React.createElement(Icon.search,{s:14}),
        React.createElement("input",{className:"prop-search-input",type:"text",value:query,
          placeholder:"Search characters by name or role…",
          onChange:e=>setQuery(e.target.value), onKeyDown:e=>{ if(e.key==="Escape") setQuery(""); }}),
        q && React.createElement("span",{className:"prop-search-count"}, shown.length+" of "+list.length),
        q && React.createElement("button",{className:"prop-search-clear",title:"Clear search",onClick:()=>setQuery("")},React.createElement(Icon.x,{s:13}))),
      sceneList.length>0 && React.createElement("div",{className:"prop-scenebar"},
        React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.layers,{s:13}),"Focus a scene"),
        React.createElement("select",{className:"prop-select prop-scenebar-select",value:sceneFilter,onChange:e=>setSceneFilter(e.target.value)},
          React.createElement("option",{value:""},"All scenes — show every character"),
          sceneList.map(s=>{ const n=(charsInSceneMap[s.id]?charsInSceneMap[s.id].size:0);
            return React.createElement("option",{key:s.id,value:s.id},
              "Scene "+String(s.no).padStart(2,"0")+" · "+(s.title||"")+"  ("+n+" character"+(n!==1?"s":"")+")"); })),
        sceneFilter && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId,onClick:startSceneBatch,
          title:"Generate the reference sheets for the characters in this scene — you choose whether to redo ones that already have a sheet"},
          React.createElement(Icon.sparkles,{s:14}),
          batchActiveId?"Generating…":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0"))))),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,onDraftOnly:onApplyLookbookDraftOnly,label:"these characters",dept:"characters"}),
    BatchBar && React.createElement(BatchBar,{batch,noun:"character"}),
    React.createElement("div",{className:"sheet-grid"},
      charPager.slice(shown).map(c=>React.createElement(CharacterSheet,{key:c.id,c,project,scenes,props,drafts,speaks:speakingSet.has(c.id),onUpdate,onDraft,
        drafting:draftingId===c.id||(draftingIds||[]).indexOf(c.id)>=0,onView:(url,ch)=>setView({url,character:ch}),
        batchActiveId,onBatchDone:batch.advance,onDelete:onDelete,
        onSuggestStates,suggestingStates:suggestingStatesId===c.id,onRemoveOwnedItem,onRenameOwnedItem}))),
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

function ArtRoom({ artView, setArtView, project, characters, scenes, props, drafts, trash, onRestoreChar, onPurgeChar, onRestoreProp, onPurgeProp, onRestoreLoc, onPurgeLoc, onEnsureOwner, onUpdateChar, onDraftVisuals, onDraftAllVisuals, draftingVisualId, draftingAllVisuals, draftingVisualIds,
  onSuggestStates, suggestingStatesId, onRemoveOwnedItem, onRenameOwnedItem, onAddCharacter, onDeleteCharacter,
  onUpdateProp, onDraftProp, onDraftAllProps, onAddProp, onDeleteProp, draftingPropId, draftingAllProps, onMergeProps, onSeedFromCast, castHasProps, onTagScenes, taggingScenes, onTagOne, taggingSceneId,
  locations, onUpdateLocation, onDraftLocation, onDraftAllLocs, onAddLocation, onDeleteLocation, draftingLocId, draftingAllLocs, onPullFromScript, scriptHasLocs, onScout, onAssignStyles, assigningStyles, onSetStyleRefs, onSetScenePreset, onAddStyleRefImages, onRemoveStyleRefImage, onDraftStaging, draftingStageId,
  shots, beatsMap, onUpdateShot, onAddShot, onDeleteShot, onDraftSceneShots, draftingSceneShots, onDraftAllShots, draftingAllShots, onDirectStoryboard, onDirectScene, onColorist, onShoot, onCast, onPropsMaster,
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
    if(artView==="locations") return (locations||[]).flatMap(l=> (l&&l.id) ? [l.id, ...(l.variants||[]).map(v=>l.id+"-"+v.id)] : []);
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
    // #1 — pre-production readiness strip, visible across every tab
    React.createElement(PreProductionStatus,{project,characters,props,locations,shots,scenes,setArtView}),
    artView==="lookbook" && LookbookView
      ? React.createElement(LookbookView,{project,lookbook,note:lookbookNote,
          onUpdate:onUpdateLookbook,onAdd:onAddLookbook,onDelete:onDeleteLookbook,onSetNote:onSetLookbookNote,onResearch,onClear:onClearLookbook})
    : artView==="characters"
      ? React.createElement(CharacterSheets,{project,characters,scenes,props,drafts,shots,beatsMap,onUpdate:onUpdateChar,
          onDraft:onDraftVisuals,onDraftAll:onDraftAllVisuals,draftingId:draftingVisualId,draftingAll:draftingAllVisuals,draftingIds:draftingVisualIds,
          trashItems:(trash&&trash.characters)||[],onRestore:onRestoreChar,onPurge:onPurgeChar,
          onSuggestStates,suggestingStatesId,onRemoveOwnedItem,onRenameOwnedItem,onAdd:onAddCharacter,onDelete:onDeleteCharacter,onCast,
          lookbookStale:!!_stale.characters,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("characters"),
          onApplyLookbookDraftOnly:()=>onApplyLookbook&&onApplyLookbook("characters","draft")})
    : artView==="props" && PropSheets
      ? React.createElement(PropSheets,{project,props,characters,scenes,drafts,onUpdate:onUpdateProp,onDraft:onDraftProp,
          onDraftAll:onDraftAllProps,onAdd:onAddProp,onDelete:onDeleteProp,draftingId:draftingPropId,draftingAll:draftingAllProps,
          trashItems:(trash&&trash.props)||[],onRestore:onRestoreProp,onPurge:onPurgeProp,onEnsureOwner,
          onSeedFromCast,castHasProps,onTagScenes,taggingScenes,onTagOne,taggingSceneId,onMergeProps,onPropsMaster,
          lookbookStale:!!_stale.props,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("props"),
          onApplyLookbookDraftOnly:()=>onApplyLookbook&&onApplyLookbook("props","draft")})
    : artView==="locations" && LocationSheets
      ? React.createElement(LocationSheets,{project,locations,scenes,onUpdate:onUpdateLocation,onDraft:onDraftLocation,
          onDraftAll:onDraftAllLocs,onAdd:onAddLocation,onDelete:onDeleteLocation,draftingId:draftingLocId,draftingAll:draftingAllLocs,
          trashItems:(trash&&trash.locations)||[],onRestore:onRestoreLoc,onPurge:onPurgeLoc,
          onPullFromScript,scriptHasLocs,onDraftStaging,draftingStageId,onScout,
          lookbookStale:!!_stale.locations,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("locations"),
          onApplyLookbookDraftOnly:()=>onApplyLookbook&&onApplyLookbook("locations","draft")})
      : artView==="stylebible" && window.StyleBibleView
      ? React.createElement(window.StyleBibleView,{project,scenes,onAssign:onAssignStyles,assigning:assigningStyles,onSetRefs:onSetStyleRefs,onSetScenePreset,onAddRefImages:onAddStyleRefImages,onRemoveRefImage:onRemoveStyleRefImage,onColorist,
          lookbookStale:!!_stale.stylebible,onApplyLookbook:()=>onApplyLookbook&&onApplyLookbook("colorist")})
      : artView==="shots" && window.ShotList
      ? React.createElement(window.ShotList,{project,scenes,characters,props,locations,shots,beatsMap,
          onUpdateShot,onAddShot,onDeleteShot,onDraftSceneShots,draftingSceneShots,onDraftAllShots,draftingAllShots,onShoot,onDirectScene})
      : artView==="storyboard" && window.StoryboardView
      ? React.createElement(window.StoryboardView,{project,scenes,shots,characters,props,locations,beatsMap,setArtView,onDirect:onDirectStoryboard})
      : React.createElement(ArtComingSoon,{tab:artView}));
}
window.ArtRoom = ArtRoom;

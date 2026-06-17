/* stylebible.jsx — project-wide visual Style Bible (data layer).
   A style PRESET is a reusable cinematic look built on the 60/30/10 colour rule:
   60% dominant, 30% secondary, 10% accent — plus a grade, lighting mood, lens and
   texture note. Scenes are each ASSIGNED a preset (project.styleBible.sceneStyles
   maps sceneId -> presetId); the AI reads the whole film and decides which preset
   fits each scene. Locations and (later) Shots read the assigned preset to render
   matching, on-palette plates. */

/* Starter presets — generic placeholder looks shown before a film is styled. They are
   a fallback only: "Assign from script" DESIGNS a bespoke palette unique to the film
   (authored from its genre/world/themes/arc) and REPLACES these, then color-scripts
   each scene along the value-charge spine. Each palette is [dominant, secondary,
   accent] = the 60 / 30 / 10 split. */
const STYLE_PRESETS_DEFAULT = [
  { id:"neutral",   name:"Neutral / Natural",  grade:"true-to-life colour, balanced contrast",
    palette:["#8a8f96","#c9cdd2","#d8a657"], dominantLabel:"cool grey", secondaryLabel:"soft light grey", accentLabel:"warm amber",
    lighting:"motivated naturalistic light, soft key, gentle falloff",
    lens:"35–50mm, shallow-to-mid depth", texture:"clean digital, fine natural grain" },
  { id:"teal-orange", name:"Teal & Orange",    grade:"blockbuster teal shadows, warm skin",
    palette:["#1e3d44","#d98a4b","#f2e6d8"], dominantLabel:"deep teal", secondaryLabel:"warm orange", accentLabel:"cream highlight",
    lighting:"crisp key with cool ambient fill, strong separation",
    lens:"anamorphic 40mm, oval bokeh", texture:"glossy contrast, subtle halation" },
  { id:"noir",      name:"Hard Noir",          grade:"high-contrast monochrome-leaning, crushed blacks",
    palette:["#111317","#5b626b","#e8e6df"], dominantLabel:"near-black", secondaryLabel:"steel grey", accentLabel:"bone white",
    lighting:"single hard source, deep shadow, venetian slats",
    lens:"32mm, deep focus", texture:"silver-halide grain, smoke haze" },
  { id:"warm-golden", name:"Warm / Golden Hour", grade:"honeyed warm grade, lifted blacks",
    palette:["#caa15a","#7a5b34","#fbf0d6"], dominantLabel:"golden amber", secondaryLabel:"umber", accentLabel:"pale gold",
    lighting:"low warm sun, long shadows, glowing backlight",
    lens:"85mm, creamy bokeh", texture:"soft bloom, gentle film grain" },
  { id:"cold-clinical", name:"Cold / Clinical", grade:"desaturated cool grade, clean whites",
    palette:["#9fb1bd","#dfe7ec","#33424d"], dominantLabel:"pale steel blue", secondaryLabel:"clinical white", accentLabel:"slate",
    lighting:"flat even fluorescent, low shadow",
    lens:"40mm, mid depth", texture:"crisp, low grain" },
];
window.STYLE_PRESETS_DEFAULT = STYLE_PRESETS_DEFAULT;

/* Film-stock / capture looks — a project-wide processing layer applied on top of the
   scene grade at the shot (see filmStockClause + buildShotPrompt). Each `clause` is the
   exact text appended to the frame prompt. "none" = clean digital, no extra look. */
const FILM_STOCKS = [
  { id:"none",        name:"None (clean digital)", clause:"" },
  { id:"portra",      name:"Kodak Portra 400/800", clause:"Shot on Kodak Portra 400/800 film: warm pastel colour, soft natural skin tones, low contrast, creamy highlight roll-off, fine organic grain." },
  { id:"16mm",        name:"16mm Film Grain (Indie / Documentary)", clause:"Captured on 16mm film: pronounced organic grain, slightly soft resolution, raw indie / documentary texture, subtle gate weave and halation." },
  { id:"cinestill800t", name:"CineStill 800T", clause:"Shot on CineStill 800T tungsten film: cool night-balanced cast, signature red halation glowing around highlights and practical lights, fine grain, cinematic low light." },
  { id:"trix",        name:"Kodak Tri-X 400 (B&W)", clause:"Shot on Kodak Tri-X 400 black-and-white film: monochrome (no colour), rich gritty grain, deep blacks, punchy photojournalistic contrast." },
  { id:"technicolor", name:"Technicolor (Golden-Age Vibrance)", clause:"Three-strip Technicolor look: hyper-saturated golden-age vibrance, bold primary reds, greens and blues, glossy luminous highlights, rich saturated palette." },
  { id:"bleachbypass", name:"Bleach Bypass", clause:"Bleach-bypass processing: desaturated muted colour over raised contrast, crushed metallic shadows, silvery highlights, a gritty hard-edged look." },
  { id:"tealorange", name:"Teal & Orange", clause:"Blockbuster teal-and-orange grade: teal-pushed shadows, warm orange skin tones, strong colour separation, glossy filmic contrast." },
];
window.FILM_STOCKS = FILM_STOCKS;

/* the prompt clause for the project's chosen film stock (empty when none) */
function filmStockClause(project){
  const id = project && project.styleBible && project.styleBible.filmStock;
  if(!id || id==="none") return "";
  const fs = FILM_STOCKS.find(x=>x.id===id);
  return (fs && fs.clause) ? (fs.clause+" ") : "";
}
window.filmStockClause = filmStockClause;

function styleBibleOf(project){
  const sb = (project && project.styleBible) || {};
  return {
    presets: (sb.presets && sb.presets.length) ? sb.presets : STYLE_PRESETS_DEFAULT,
    sceneStyles: sb.sceneStyles || {},
    // free-text visual references that guide bespoke palette design (see
    // aiAssignSceneStyles) — auto-filled from the Lookbook by the write-through effect
    // in app.jsx until the user edits the field, then theirs.
    refs: sb.refs || "",
    // the last auto-filled lookbook brief — refs !== lookbookSynced means the user took
    // the field over (syncs stop; also lets the Visual Researcher skip self-fed refs).
    lookbookSynced: sb.lookbookSynced || "",
    // uploaded reference images: [{ id, thumb (small dataURL), colors:[hex] }].
    // The model is text-only, so we sample each image's palette client-side and feed
    // those hues into the design prompt.
    refImages: sb.refImages || [],
    // project-wide film-stock / capture look (id into FILM_STOCKS); "none" = clean digital.
    filmStock: sb.filmStock || "none",
  };
}
window.styleBibleOf = styleBibleOf;

function presetById(project, id){
  const { presets } = styleBibleOf(project);
  return presets.find(p=>p.id===id) || null;
}
window.presetById = presetById;

/* the preset assigned to a given scene id (or null) */
function scenePreset(project, sceneId){
  const { sceneStyles } = styleBibleOf(project);
  return presetById(project, sceneStyles[sceneId]);
}
window.scenePreset = scenePreset;

/* a compact prompt clause encoding a preset's grade + 60/30/10 palette */
function buildStyleClause(preset){
  if(!preset) return "";
  const pal = preset.palette || [];
  const parts = [];
  parts.push("VISUAL STYLE \u2014 \""+preset.name+"\": "+(preset.grade||"").replace(/\.$/,""));
  if(pal.length>=3){
    parts.push("Colour grade follows the 60/30/10 rule: ~60% "+(preset.dominantLabel||"dominant")+" ("+pal[0]+"), "
      +"~30% "+(preset.secondaryLabel||"secondary")+" ("+pal[1]+"), "
      +"~10% "+(preset.accentLabel||"accent")+" ("+pal[2]+") as the accent");
  }
  if(preset.lighting) parts.push("Lighting: "+preset.lighting.replace(/\.$/,""));
  if(preset.lens)     parts.push("Lens: "+preset.lens.replace(/\.$/,""));
  if(preset.texture)  parts.push("Texture: "+preset.texture.replace(/\.$/,""));
  return parts.join(". ")+". ";
}
window.buildStyleClause = buildStyleClause;

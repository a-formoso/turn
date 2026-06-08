/* stylebible.jsx — project-wide visual Style Bible (data layer).
   A style PRESET is a reusable cinematic look built on the 60/30/10 colour rule:
   60% dominant, 30% secondary, 10% accent — plus a grade, lighting mood, lens and
   texture note. Scenes are each ASSIGNED a preset (project.styleBible.sceneStyles
   maps sceneId -> presetId); the AI reads the whole film and decides which preset
   fits each scene. Locations and (later) Shots read the assigned preset to render
   matching, on-palette plates. */

/* Starter presets — generic, reusable cinematic looks. A project can add/edit its
   own; the AI may also propose bespoke ones. Each palette is [dominant, secondary,
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

function styleBibleOf(project){
  const sb = (project && project.styleBible) || {};
  return {
    presets: (sb.presets && sb.presets.length) ? sb.presets : STYLE_PRESETS_DEFAULT,
    sceneStyles: sb.sceneStyles || {},
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

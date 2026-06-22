/* locations.jsx — The Art Room ▸ Locations tab (data layer).
   Locations are DERIVED from the script's sluglines (scene.loc, e.g.
   "INT. HEART O' THE CITY HOTEL · NIGHT") so every shot set in a place can match
   one canonical reference plate. Mirrors the Props flow: derive → draft → generate.
   This file owns slugline parsing / derivation / defaults + the deterministic
   plate prompts; the React tab lives in locations-ui.jsx. */

function locSlug(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,48); }

function titleCaseTime(t){ t=String(t||"").trim(); return t ? t.replace(/\b\w/g,c=>c.toUpperCase()) : ""; }

/* canonical time-of-day buckets (Continuous/Later are NOT times — excluded) */
const TIME_OF_DAY = ["Dawn","Morning","Day","Afternoon","Dusk","Evening","Night"];
window.TIME_OF_DAY = TIME_OF_DAY;
/* map a worded time / synonym to a canonical bucket ("" if not a real time of day) */
function normalizeTOD(w){
  w = String(w||"").toLowerCase().trim();
  if(/sunrise|dawn|daybreak/.test(w)) return "Dawn";
  if(/morning/.test(w)) return "Morning";
  if(/noon|midday|daytime|^day$/.test(w)) return "Day";
  if(/afternoon/.test(w)) return "Afternoon";
  if(/dusk|sunset|twilight|golden hour|magic hour/.test(w)) return "Dusk";
  if(/evening/.test(w)) return "Evening";
  if(/night|midnight|nighttime/.test(w)) return "Night";
  return "";   // continuous / later / moments later / unknown → not a time of day
}
/* map a clock time string ("18:06", "6 pm", "07:30 am") to a time-of-day bucket.
   NOTE: clock time alone can't determine dusk/dawn reliably (season + latitude),
   so we only emit broad, defensible buckets here — Dawn/Morning/Day/Evening/Night.
   Dusk/Afternoon are reserved for sluglines that say so in words. */
function clockToTimeOfDay(str){
  const m = String(str).match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i);
  if(!m) return "";
  let h = parseInt(m[1],10); const ap = (m[3]||"").toLowerCase();
  if(ap==="pm" && h<12) h+=12; if(ap==="am" && h===12) h=0;
  if(h<0||h>23) return "";
  if(h>=5 && h<7) return "Dawn";
  if(h>=7 && h<11) return "Morning";
  if(h>=11 && h<17) return "Day";
  if(h>=17 && h<21) return "Evening";
  return "Night";
}
window.normalizeTOD = normalizeTOD; window.clockToTimeOfDay = clockToTimeOfDay;
/* Derive ALL real times-of-day for a location, accurately, FROM THE SCRIPT ONLY.
   Source of truth = each scene's slugline trailing tag ("· NIGHT" / "· DAY"),
   read via parseSlugline so we never pick up a time-word buried in a PLACE name.
   Also honours a clock time baked into a slugline or the location name.
   Scene SUMMARIES are deliberately NOT used — they are prose ("by day a programmer,
   by night the hacker…") and produce false times. Returns the distinct buckets in
   canonical day order; [] when no scene states a real time (Continuous / Loading
   Program / Later / unknown), which correctly shows as "time unset". */
function deriveLocationTimes(l, scenes){
  const set = new Set();
  // a clock time embedded in the location name itself (e.g. "… - 18:06")
  const nameClock = String((l&&l.name)||"").match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
  if(nameClock){ const t = clockToTimeOfDay(nameClock[1]); if(t) set.add(t); }
  for(const sid of ((l&&l.scenes)||[])){
    const s = (scenes||[]).find(x=>x.id===sid);
    if(!s) continue;
    const parsed = parseSlugline(s.loc);
    if(!parsed) continue;
    let t = parsed.time ? normalizeTOD(parsed.time) : "";   // worded tag → bucket ("" for Continuous etc.)
    if(!t){                                                  // no worded time → maybe a clock time in the slug tail
      const c = String(s.loc||"").match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))\b/i);
      if(c) t = clockToTimeOfDay(c[1]);
    }
    if(t) set.add(t);
  }
  return TIME_OF_DAY.filter(t=>set.has(t));   // canonical order: never "Night / Day"
}
window.deriveLocationTimes = deriveLocationTimes;

/* single-value convenience (used for prompt defaults): the earliest-in-the-day time. */
function deriveLocationTime(l, scenes){ return deriveLocationTimes(l, scenes)[0] || ""; }
window.deriveLocationTime = deriveLocationTime;

/* normalise a place into a canonical display name: title-case-ish but keep short
   ALL-CAPS acronyms (FBI, CIA); collapse whitespace. Common short words (the, of,
   a, o') are lower/title-cased normally, not treated as acronyms. */
const LOC_LOWER_WORDS = /^(the|of|a|an|and|to|in|on|at|by|o'|de|la|le)$/i;
function tidyPlace(p){
  return String(p||"").trim().replace(/\s+/g," ")
    .split(" ").map((w,i)=>{
      if(LOC_LOWER_WORDS.test(w)) return i===0 ? (w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()) : w.toLowerCase();
      // genuine short acronym (all caps, no lowercase, ≤3) -> keep as-is
      if(/^[A-Z0-9'’.\-]+$/.test(w) && w.length<=3 && /[A-Z]/.test(w)) return w;
      return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();
    }).join(" ");
}

/* Parse one slugline into { intExt, place, time }.
   "INT. HEART O' THE CITY HOTEL · NIGHT" -> {intExt:"INT", place:"Heart o' the City Hotel", time:"Night"} */
function parseSlugline(raw){
  let s = String(raw||"").trim();
  if(!s) return null;
  s = s.replace(/^\s*\d+[\.\)]?\s+/,"");                 // strip a leading scene number
  let intExt = "";
  const m = s.match(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\/E\.?)\s*/i);
  if(m){ intExt = m[1].toUpperCase().replace(/\./g,"").replace(/I\/E/,"INT/EXT"); s = s.slice(m[0].length); }
  // time of day: trailing segment after the LAST separator, if it reads like a time
  let time = "";
  const tm = s.match(/[\u00b7\u2014,\-]\s*([A-Za-z][A-Za-z'\s]{1,22})\s*$/);
  if(tm && /\b(night|day|dawn|dusk|morning|evening|afternoon|continuous|later|moments?\s+later|sunset|sunrise|magic\s+hour|golden\s+hour|loading\s+program)\b/i.test(tm[1])){
    time = tm[1].trim(); s = s.slice(0, tm.index).trim();
  }
  let place = s.replace(/[\u00b7\u2014,\-\s]+$/,"").trim();
  if(!place) return null;
  return { intExt, place, time: titleCaseTime(time) };
}

/* split a compound slugline place into its segments: "APARTMENT / NIGHTCLUB" -> two */
function splitCompoundPlace(place){
  return String(place||"").split(/\s*\/\s*/).map(x=>x.trim()).filter(Boolean);
}

/* Derive canonical locations from every scene's slugline.
   Groups scenes by a normalised key on the PRIMARY place so "NEBUCHADNEZZAR · CORE"
   and "NEBUCHADNEZZAR · TRAINING" land under one "Nebuchadnezzar" (areas recorded).
   Returns new location objects only (deduped against `existing`). */
function deriveLocations(scenes, existing){
  const have = existing || [];
  const seen = new Set(have.map(l=>l.key || locSlug(l.name)));
  const order = []; const byKey = {};
  (scenes||[]).forEach(sc=>{
    const parsed = parseSlugline(sc.loc);
    if(!parsed) return;
    const places = splitCompoundPlace(parsed.place);
    const primary = tidyPlace(places[0]);
    const key = locSlug(primary.split(/[\u00b7\u2014,]/)[0]).split("-").slice(0,4).join("-");
    if(!key) return;
    if(!byKey[key]){ byKey[key] = {
      key, name: primary.split(/[\u00b7\u2014]/)[0].trim(),
      intExt: parsed.intExt, times: new Set(), areas: new Set(), scenes: [],
    }; order.push(key); }
    const L = byKey[key];
    if(parsed.time) L.times.add(parsed.time);
    const areaTail = primary.split(/\u00b7/).slice(1).join(" \u00b7 ").trim();
    if(areaTail) L.areas.add(areaTail);
    places.slice(1).forEach(p=> L.areas.add(tidyPlace(p)));
    if(sc.id && L.scenes.indexOf(sc.id)<0) L.scenes.push(sc.id);
    if(parsed.intExt && L.intExt && parsed.intExt!==L.intExt) L.intExt = "INT/EXT";
  });
  const out = [];
  order.forEach(key=>{
    if(seen.has(key)) return;
    const L = byKey[key];
    out.push({
      id: "loc-"+key+"-"+out.length,
      key, name: L.name, intExt: L.intExt || "INT",
      times: [...L.times], areas: [...L.areas], scenes: L.scenes,
      architecture:"", materials:"", lighting:"", significance:"",
      renderStyle:"", negativePrompt:"",
      variants:[],            // time-of-day / weather variant plates
      fromScript:true,
    });
  });
  return out;
}
window.deriveLocations = deriveLocations;
window.parseSlugline = parseSlugline;
window.locSlug = locSlug;

/* true when the script has any parseable slugline we could pull into the tab */
function scriptHasLocations(scenes){ return (scenes||[]).some(s=> !!parseSlugline(s.loc)); }
window.scriptHasLocations = scriptHasLocations;

function locVisualDefaults(l){
  return {
    renderStyle: (l && l.renderStyle) || "photoreal cinematic establishing photography, wide lens, natural depth, sharp focus",
    negativePrompt: (l && l.negativePrompt) || "people, characters, crowds, watermark, logo, distorted perspective, warped architecture, low resolution, blurry, cgi look, fisheye",
  };
}
window.locVisualDefaults = locVisualDefaults;

/* Render-style text per key — location cards use the SAME dropdown options as the cast
   (window.CHAR_RENDER_STYLE_OPTIONS, incl. "Surprise me ✨"); picking a concrete key
   writes this place-tuned recipe into l.renderStyle, which the plate builder feeds into
   render.style. "surprise" is AI-invented per location (aiSurpriseStyleText). */
const LOC_RENDER_TEXT = {
  photoreal: "photoreal cinematic establishing photography, wide lens, natural depth, sharp focus, realistic light",
  render3d:  "stylized 3D environment render, cinematic lighting, physically-based materials, atmospheric depth",
  anime:     "anime background art, painterly cel-shaded environment, clean linework, soft gradient skies, no photoreal texture",
  flat:      "flat vector landscape, bold geometric shapes, minimal flat shading, limited palette, no photoreal texture",
  horror:    "low-key cinematic horror cinematography of the place, hard cold side light, deep atmospheric blacks, fog and haze, desaturated cold green-teal grade",
  ghibli:    "soft hand-painted Studio Ghibli-style 2D background, fine warm linework, gentle painterly cel shading, warm earthy naturalistic palette, nostalgic light",
  animated3d:"polished animated-feature 3D environment render, soft warm global illumination, appealing clean PBR materials, idealized finish, no noise",
  pixar:     "Pixar-style animated-feature 3D environment, soft warm global illumination, appealing rounded stylized forms, clean tactile PBR materials, 'every frame a painting' warmth, idealized charming finish, no noise",
  stopmotion:"photograph of a real handmade miniature stop-motion set, felt/wood/clay at tiny scale, soft practical studio light, faint tilt-shift miniature depth",
  claymation:"photograph of a real plasticine claymation miniature set, rounded clay forms with tool marks, soft practical light, faint tilt-shift miniature depth",
  adv1960s:  "1960s painted commercial illustration of the place, airbrushed gouache, vintage halftone print texture, mid-century mustard/avocado/teal palette",
  gaganime:  "1990s gag-anime 2D cartoon background, thick bold black outlines, flat high-saturation colors, simple graphic shapes, sticker-poster finish",
  pixelart:  "retro 16/32-bit pixel-art environment, hard square pixels, no anti-aliasing, limited indexed palette, dithered skies and shadows, crisp pixel grid",
};
window.LOC_RENDER_TEXT = LOC_RENDER_TEXT;

function locVisualsDrafted(l){ return !!((l.architecture||"").trim() && (l.lighting||"").trim()); }
window.locVisualsDrafted = locVisualsDrafted;

/* ---- DEPTH-GRID STAGING ----------------------------------------------------
   A location's canonical staging: a 3×3 depth grid (rows BG/MID/FG × cols L/C/R)
   plus Floor, Scale Class and Camera/Lens. Each cell is OPTIONAL — an empty cell
   means "open space" (so linear/open locations aren't forced into a box). Named
   landmark roles, per your spec:
     bg.center = Wall A (primary backdrop landmark)
     mid.left  = Wall B (primary framing element)
     mid.right = Wall C (secondary framing element)
     mid.center= the SUBJECT position (where a character stands) — usually left blank
     fg.left/fg.right = L1 / R1 foreground veils; fg.center = camera (implicit)
   Shots will later inherit this and vary it. */
function emptyStaging(){
  return { scaleClass:"", lens:"",
    bg:{ left:"", center:"", right:"" },
    mid:{ left:"", center:"", right:"" },
    fg:{ left:"", right:"" },
    floor:"" };
}
window.emptyStaging = emptyStaging;
function stagingOf(l){
  const s = (l && l.staging) || {};
  const e = emptyStaging();
  return { scaleClass:s.scaleClass||"", lens:s.lens||"",
    bg:{...e.bg, ...(s.bg||{})}, mid:{...e.mid, ...(s.mid||{})}, fg:{...e.fg, ...(s.fg||{})},
    floor:s.floor||"" };
}
window.stagingOf = stagingOf;
/* true when the staging has at least one filled cell (worth showing / prompting) */
function stagingHasContent(l){
  const s = stagingOf(l);
  return !!(s.scaleClass||s.lens||s.floor||s.bg.left||s.bg.center||s.bg.right
    ||s.mid.left||s.mid.center||s.mid.right||s.fg.left||s.fg.right);
}
window.stagingHasContent = stagingHasContent;

/* turn a filled depth grid into spatially-explicit prompt language. Empty cells
   are skipped (read as open space). Returns "" when nothing is staged. */
function buildStagingClause(l){
  const s = stagingOf(l);
  if(!stagingHasContent(l)) return "";
  const bits = [];
  if(s.scaleClass) bits.push("SCALE: "+s.scaleClass.replace(/\.$/,""));
  const plane = [];
  if(s.bg.center) plane.push("center background, the primary landmark \u2014 "+s.bg.center.replace(/\.$/,""));
  if(s.bg.left)   plane.push("left background "+s.bg.left.replace(/\.$/,""));
  if(s.bg.right)  plane.push("right background "+s.bg.right.replace(/\.$/,""));
  if(s.mid.left)  plane.push("left midground framing element \u2014 "+s.mid.left.replace(/\.$/,""));
  if(s.mid.right) plane.push("right midground framing element \u2014 "+s.mid.right.replace(/\.$/,""));
  if(s.mid.center)plane.push("midground center "+s.mid.center.replace(/\.$/,""));
  if(s.fg.left)   plane.push("left foreground "+s.fg.left.replace(/\.$/,""));
  if(s.fg.right)  plane.push("right foreground "+s.fg.right.replace(/\.$/,""));
  if(s.floor)     plane.push("ground plane underfoot \u2014 "+s.floor.replace(/\.$/,""));
  let out = "DEPTH STAGING (layer the space for parallax): "+plane.join("; ")+". ";
  if(bits.length) out = bits.join(". ")+". "+out;
  if(s.lens) out += "Framed on a "+s.lens.replace(/\.$/,"")+". ";
  return out;
}
window.buildStagingClause = buildStagingClause;

/* the dominant style preset for a location = the preset assigned to the first
   scene it appears in that has one. Retained for back-compat; the location plate no
   longer bakes in a grade (grade is a per-scene/per-shot decision). */
function locDominantPreset(l, project){
  if(typeof scenePreset!=="function") return null;
  for(const sid of (l.scenes||[])){ const p = scenePreset(project, sid); if(p) return p; }
  return null;
}
window.locDominantPreset = locDominantPreset;

/* every DISTINCT Style Bible preset the location's scenes use, in scene order.
   Informational only: a location can span scenes with different grades, so we show
   them all rather than collapsing to one. The reference plate itself stays
   grade-neutral — the grade is applied downstream at the shot. */
function locScenePresets(l, project){
  if(typeof scenePreset!=="function") return [];
  const out = []; const seen = new Set();
  for(const sid of (l.scenes||[])){ const p = scenePreset(project, sid); if(p && !seen.has(p.id)){ seen.add(p.id); out.push(p); } }
  return out;
}
window.locScenePresets = locScenePresets;

/* The effective SCALE CLASS of a location's WORLD: the project-wide "world scale" toggle
   (project.worldScale = A/B/C) wins; otherwise it's derived from the scale of the characters
   who DRIVE the scenes set here (a critter film's drivers are all Class B → the place renders
   at critter scale). Returns A when nobody non-human occupies it (so it stays inert). */
function locationScaleClass(l, project){
  const wRaw = String((project && project.worldScale) || "").trim();
  // project-wide override: any explicit value (A/B/C, or free text like "critter"/"giant")
  // resolves; only empty or "auto" falls through to per-location derivation.
  if(wRaw && !/^auto$/i.test(wRaw)) return (typeof scaleClassOf==="function") ? scaleClassOf({scaleClass:wRaw}) : "A";
  if(typeof scaleClassOf!=="function") return "A";
  const C = window.turnContinuity || {};
  const chars = C.characters || [], scenes = C.scenes || [];
  if(!chars.length || !scenes.length) return "A";
  const byId = {}; chars.forEach(c=>{ if(c&&c.id) byId[c.id]=c; });
  const sids = Array.isArray(l && l.scenes) ? l.scenes : [];
  const counts = { A:0, B:0, C:0 };
  sids.forEach(sid=>{ const sc=scenes.find(s=>s.id===sid); const drv=sc&&sc.driver&&byId[sc.driver]; if(drv) counts[scaleClassOf(drv)]++; });
  const nonA = [["B",counts.B],["C",counts.C]].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
  return nonA.length ? nonA[0][0] : "A";
}
window.locationScaleClass = locationScaleClass;

/* deterministic LOCATION coverage plate — full view of the place from several
   angles on one grid, so any shot set here matches geometry, materials & light.
   `opts.preset` applies a Style Bible look; `opts.time` specialises a variant. */
function buildLocationRefPrompt(l, project, opts){
  opts = opts || {};
  const P = project || (window.TURN_DATA||{}).PROJECT || {};
  const v = locVisualDefaults(l);
  const arch = (l.architecture||"").replace(/\.$/,"").trim();
  const materials = (l.materials||"").replace(/\.$/,"").trim();
  const lighting = (l.lighting||"").replace(/\.$/,"").trim();
  const significance = (l.significance||"").replace(/\.$/,"").trim();
  const period = P.setting && P.setting.period ? P.setting.period.split(/[\u2014,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  const intExt = l.intExt || "INT";
  const time = opts.time || (l.times&&l.times[0]) || "";

  /* JSON environment spec (the director's template as a key:value spec, 2026-06):
     EXACTLY 4 views in a 2\u00d72 grid \u2014 wide establishing front, high-angle three-quarter
     overview, two close-ups of the key stations \u2014 no text baked in. The depth grid's
     landmarks fill `fixtures`; ownerless set dressing LINKED to this location (the
     fixture-of relationship: explicit locationId, or every mapped scene resolves here)
     renders as `environment_props`, so abandoned objects & furniture live in the plate.
     Owned or multi-location objects are NEVER baked in \u2014 they travel with people.
     Stays GRADE-NEUTRAL: the scene's Style Bible grade applies downstream at the shot. */
  const st = stagingOf(l);
  const clean = (x)=>String(x||"").replace(/\.$/,"").trim();
  const fixtures = [];
  if(clean(st.bg.center)) fixtures.push({ what: clean(st.bg.center), position: "center background \u2014 the primary landmark" });
  if(clean(st.mid.left))  fixtures.push({ what: clean(st.mid.left),  position: "along the left side" });
  if(clean(st.mid.right)) fixtures.push({ what: clean(st.mid.right), position: "along the right side" });
  if(clean(st.fg.left))   fixtures.push({ what: clean(st.fg.left),   position: "near foreground left" });
  if(clean(st.fg.right))  fixtures.push({ what: clean(st.fg.right),  position: "near foreground right" });
  const mainStation = clean(st.bg.center) || "the space's primary, most story-relevant feature";
  const secondStation = clean(st.mid.left) || clean(st.mid.right) || clean(st.fg.left) || clean(st.fg.right) || "a signature material detail of the space";
  const envProps = locationEnvironmentProps(l).map(p=>({
    name: p.name,
    description: [clean(p.form), clean(p.material)].filter(Boolean).join("; ") || undefined,
  }));
  const spec = {
    task: "professional environment reference sheet \u2014 ONE single real space rendered from 4 angles",
    location: {
      name: l.name||"Location",
      type: intExt==="EXT" ? "exterior" : "interior",
      space: arch || undefined,
      walls_surfaces_palette: materials || undefined,
      floor_ground_plane: clean(st.floor) || undefined,
      lighting: lighting || undefined,
      time_of_day: time ? time.toLowerCase() : undefined,
      scale: clean(st.scaleClass) || undefined,
      reads_as: significance || undefined,
      tone: tone || undefined,
    },
    fixtures: fixtures.length ? fixtures : undefined,
    environment_props: envProps.length ? envProps : undefined,
    views: {
      layout: "exactly 4 views in a 2x2 grid",
      top_left: "wide establishing front shot at eye level with symmetrical centered composition",
      top_right: "high-angle three-quarter overview shot from an elevated corner perspective looking down into the space showing depth and spatial layout",
      bottom_left: "close-up of "+mainStation,
      bottom_right: "close-up of "+secondStation,
      rule: "each view a distinctly different camera angle and composition \u2014 the SAME identical space, consistent architecture, scale, materials and light across all views",
    },
    render: {
      style: v.renderStyle.replace(/\.$/,""),
      rules: ["no people","no text, no labels, no typography, no captions, no watermarks",
        "photorealistic commercial photography","8k ultra detailed","consistent lighting across all views","clean layout","hyper realistic"],
    },
  };
  // WORLD SCALE — when this place is inhabited by a non-human-scale cast (critter / giant),
  // render the SPACE ITSELF at that scale (gigantism / miniaturization), so a bug's-world
  // location doesn't default to a human-scale room. Inert (Class A) for ordinary films.
  const _wcls = (typeof locationScaleClass==="function") ? locationScaleClass(l, P) : "A";
  const _wclause = (typeof worldScaleClause==="function") ? worldScaleClause(_wcls) : "";
  if(_wclause) spec.world_scale = _wclause;
  return "Render this environment reference sheet EXACTLY as specified by this JSON spec (continuity fields are binding):\n"+JSON.stringify(spec, null, 1);
}
window.buildLocationRefPrompt = buildLocationRefPrompt;

/* the set dressing a location OWNS (the fixture-of relationship): ownerless, not worn,
   and either explicitly linked (p.locationId) or every mapped scene resolves to this
   location. Objects whose scenes span locations are mobile (someone moves them) and
   are excluded \u2014 they belong at the shot, not baked into the set. */
function locationEnvironmentProps(l){
  const C = window.turnContinuity || {};
  const props = C.props||[], locations = C.locations||[];
  const locIdOf = (sid)=>{ const m=(typeof locationForScene==="function")?locationForScene(locations, sid):null; return m?m.id:""; };
  return props.filter(p=>{
    if(p.ownerId || p.ownerName) return false;
    if((p.kind||"carried")==="worn") return false;
    if(p.locationId) return p.locationId===l.id;
    const sc = Array.isArray(p.scenes) ? p.scenes : [];
    if(!sc.length) return false;
    const ids = Array.from(new Set(sc.map(locIdOf).filter(Boolean)));
    return ids.length===1 && ids[0]===l.id;
  }).slice(0,6);
}
window.locationEnvironmentProps = locationEnvironmentProps;

function combinedLocationPrompt(l, project, opts){
  const master = buildLocationRefPrompt(l, project, opts);
  const neg = (l.negativePrompt || locVisualDefaults(l).negativePrompt || "").trim();
  return neg ? (master + " AVOID: " + neg.replace(/\.$/,"") + ".") : master;
}
window.combinedLocationPrompt = combinedLocationPrompt;

/* single establishing variant (used for time-of-day / style variant plates) */
function buildLocationVariantPrompt(l, project, opts){
  opts = opts || {};
  const v = locVisualDefaults(l);
  const lighting = (l.lighting||"").replace(/\.$/,"").trim();
  let s = "Establishing shot \u2014 "+(l.name||"Location")+" ("+(l.intExt||"INT")+")";
  s += opts.time ? (", "+opts.time) : "";
  s += ". ";
  s += (l.architecture ? (l.architecture.replace(/\.$/,"")+". ") : "");
  s += lighting ? (lighting+". ") : "";
  // grade-neutral, like the master plate — the scene grade is applied at the shot.
  s += "RENDER STYLE: "+v.renderStyle.replace(/\.$/,"")+". ";
  s += "Single wide cinematic frame, the same space and architecture, empty of people, photoreal, sharp focus.";
  const neg = (l.negativePrompt||v.negativePrompt||"").trim();
  return neg ? (s+" AVOID: "+neg.replace(/\.$/,"")+".") : s;
}
window.buildLocationVariantPrompt = buildLocationVariantPrompt;

/* simplified fallback — fewer words, less likely to trip a content filter */
function buildSimpleLocationPrompt(l){
  const parts = [
    "Location reference \u2014 "+(l.name||"place")+" ("+(l.intExt||"INT")+")",
    (l.architecture||"").replace(/\.$/,"").trim(),
    (l.lighting||"").replace(/\.$/,"").trim(),
    "establishing wide, reverse angle, and a detail view",
    "the same space from a few angles, empty of people, photoreal, sharp focus"
  ].filter(Boolean);
  return parts.join(". ")+".";
}
window.buildSimpleLocationPrompt = buildSimpleLocationPrompt;

/* image-to-image from a dropped reference photo of a real place */
function buildLocationFromPhotoPrompt(l, project){
  const v = locVisualDefaults(l);
  let s = "Master location reference plate \u2014 "+(l.name||"Location")+". ";
  s += "BASE SPACE: reproduce EXACTLY the place shown in the reference photo \u2014 its architecture, ";
  s += "proportions, materials, colour and light. Do not redesign or restyle it. ";
  s += (l.significance ? ("Dramatic role: "+l.significance.replace(/\.$/,"")+". ") : "");
  s += "RENDER STYLE: "+v.renderStyle.replace(/\.$/,"")+". ";
  s += "Compose it as a 3\u00d72 grid of six panels of that same space. "
     + "Top row: (1) establishing wide; (2) reverse angle; (3) view toward the LEFT side of the frame. "
     + "Bottom row: (4) view toward the RIGHT side of the frame; (5) looking down; (6) a material detail. "
     + "(\u2018Left\u2019/\u2018right\u2019 mean the camera-frame side, not a character's.) "
     + "Print a small caption in the top-left of each panel with its number and title. "
     + "Consistent architecture and light across all panels, empty of people, photoreal, sharp focus.";
  return s;
}
window.buildLocationFromPhotoPrompt = buildLocationFromPhotoPrompt;

/* ---- Headless location generation (for the Location Scout agent) ----
   Mirrors generatePropSheet: build the prompt, generate (retry a simplified prompt on a
   "no image" safety refusal), commit to the location's slot, and dispatch nb-gen-done so
   the live card adopts it. The base plate commits to l.id ("locref-"+l.id); a time-of-day
   variant commits to l.id+"-"+v.id ("locvar-"+l.id+"-"+v.id). ---- */
function _nbLocMeta(prompt){
  const model = (typeof nbGetModel==="function") ? nbGetModel() : "";
  const aspect = (typeof nbGetAspect==="function") ? nbGetAspect() : "16:9";
  const size = (typeof nbGetRes==="function") ? nbGetRes() : "2K";
  const now = new Date();
  const mEntry = (window.NB_MODELS||[]).find(m=>m.id===model) || {};
  return { modelLabel:mEntry.label||"Nano Banana", modelId:model, aspect, size,
    date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
    time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
    iso: now.toISOString(), prompt, mode:"final", version:1 };
}
async function generateLocationPlate(l, project){
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const prompt = (typeof combinedLocationPrompt==="function") ? combinedLocationPrompt(l, project, {}) : (l.name||"location reference");
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[l.id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, {}); }
    catch(e){ if(/no image/i.test((e&&e.message)||"") && typeof buildSimpleLocationPrompt==="function"){ url = await nbGenerate(buildSimpleLocationPrompt(l), {}); } else throw e; }
    await nbCommit(l.id, url, _nbLocMeta(prompt), [], "location");
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:l.id, url } })); }catch(e){}
    return true;
  } finally { window.__nbGenInflight[l.id] = false; }
}
window.generateLocationPlate = generateLocationPlate;

async function generateLocationVariant(l, v, project){
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const id = l.id+"-"+v.id;
  const prompt = (typeof buildLocationVariantPrompt==="function") ? buildLocationVariantPrompt(l, project, { time:v.time }) : (l.name||"location reference");
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, {}); }
    catch(e){ if(/no image/i.test((e&&e.message)||"") && typeof buildSimpleLocationPrompt==="function"){ url = await nbGenerate(buildSimpleLocationPrompt(l), {}); } else throw e; }
    await nbCommit(id, url, _nbLocMeta(prompt), [], "location");
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id, url } })); }catch(e){}
    return true;
  } finally { window.__nbGenInflight[id] = false; }
}
window.generateLocationVariant = generateLocationVariant;

/* coverage audit — scenes whose slugline names a place that isn't linked to any Location
   card yet (e.g. an unparseable or brand-new slug). After a pull every parseable scene is
   covered, so this surfaces the genuine gaps. */
function locationCoverage(scenes, locations){
  const covered = new Set();
  (locations||[]).forEach(l=> (l.scenes||[]).forEach(id=> covered.add(id)));
  const out = [];
  (scenes||[]).forEach(s=>{
    if(!s || !(s.loc||"").trim()) return;     // no slugline → not a location-bearing scene
    if(covered.has(s.id)) return;
    const p = (typeof parseSlugline==="function") ? parseSlugline(s.loc) : null;
    out.push({ id:s.id, no:s.no, title:s.title||"", slug:(s.loc||"").trim(), place:(p&&p.place)||"" });
  });
  return out;
}
window.locationCoverage = locationCoverage;

/* shots.jsx — The Art Room ▸ Shot List (data layer).
   A SHOT is the convergence unit of the whole pipeline: one beat → one shot.
   Each shot pulls together everything the Art Room built —
     • the scene's Style Bible GRADE (applied here, never on the location plate),
     • the LOCATION geometry/materials/light + its depth-grid framing,
     • the CHARACTER sheets in frame (consistency anchors),
     • the PROP sheets in frame,
     • cinematographer grammar (size · angle · movement · lens · composition)
   …into one composed image prompt + a set of reference images.

   Shots are GROUPED BY SCENE and ordered by their origin beat. The written shot
   spec is what the frame is generated from (spec-before-render, like the other tabs).
   Storyboard (next tab) lays these frames out in sequence. */

/* ---- cinematographer grammar -------------------------------------------------- */
const SHOT_SIZES = [
  { id:"EWS",   label:"EWS",   name:"Extreme Wide",   desc:"vast establishing scale; figures small in the frame" },
  { id:"WS",    label:"WS",    name:"Wide",           desc:"full environment with figures head-to-toe" },
  { id:"FS",    label:"FS",    name:"Full",           desc:"a figure head-to-toe, filling the height" },
  { id:"MWS",   label:"MWS",   name:"Medium Wide",    desc:"from roughly the knees up" },
  { id:"MS",    label:"MS",    name:"Medium",         desc:"from the waist up" },
  { id:"MCU",   label:"MCU",   name:"Medium Close",   desc:"from the chest up" },
  { id:"CU",    label:"CU",    name:"Close-Up",       desc:"the face fills the frame" },
  { id:"ECU",   label:"ECU",   name:"Extreme Close",  desc:"a single detail — eyes, hands, an object" },
  { id:"INSERT",label:"INSERT",name:"Insert",         desc:"a tight detail of an object or action" },
];
const SHOT_ANGLES = [
  { id:"eye",     label:"Eye level",  desc:"camera at the subject's eye height; neutral" },
  { id:"high",    label:"High angle", desc:"camera looks down on the subject; diminishing" },
  { id:"low",     label:"Low angle",  desc:"camera looks up at the subject; empowering" },
  { id:"top",     label:"Overhead",   desc:"top-down bird's-eye on the action" },
  { id:"dutch",   label:"Dutch tilt", desc:"canted horizon; unease/tension" },
  { id:"ots",     label:"OTS",        desc:"over-the-shoulder onto the other subject" },
  { id:"pov",     label:"POV",        desc:"the subject's own point of view" },
];
const SHOT_MOVES = [
  { id:"static",  label:"Static",       desc:"locked-off, no camera movement" },
  { id:"pan",     label:"Pan",          desc:"horizontal pivot" },
  { id:"tilt",    label:"Tilt",         desc:"vertical pivot" },
  { id:"push",    label:"Push in",      desc:"slow dolly toward the subject; intensifying" },
  { id:"pull",    label:"Pull out",     desc:"slow dolly away; revealing/isolating" },
  { id:"track",   label:"Tracking",     desc:"camera travels alongside the action" },
  { id:"handheld",label:"Handheld",     desc:"loose, reactive, kinetic" },
  { id:"crane",   label:"Crane",        desc:"sweeping vertical/arcing move" },
  { id:"steadi",  label:"Steadicam",    desc:"smooth following move" },
];
const SHOT_LENSES = [
  { id:"14",  label:"14mm", desc:"ultra-wide; deep space, distortion at edges" },
  { id:"24",  label:"24mm", desc:"wide; environmental context" },
  { id:"35",  label:"35mm", desc:"natural wide-normal; documentary feel" },
  { id:"50",  label:"50mm", desc:"normal; human-eye perspective" },
  { id:"85",  label:"85mm", desc:"short telephoto; flattering portrait compression" },
  { id:"135", label:"135mm",desc:"telephoto; strong compression, isolated subject" },
  { id:"200", label:"200mm",desc:"long telephoto; extreme compression, flattened planes, subject isolated from a soft distant background" },
  { id:"imax70", label:"70mm / IMAX", desc:"large-format capture; immense clarity and resolution, deep fine detail, sweeping epic grandeur" },
  { id:"vhs", label:"VHS / CCTV", desc:"lo-fi analog capture; soft low resolution, scanlines, chroma bleed, date-stamp surveillance aesthetic" },
];
window.SHOT_SIZES = SHOT_SIZES; window.SHOT_ANGLES = SHOT_ANGLES;
window.SHOT_MOVES = SHOT_MOVES; window.SHOT_LENSES = SHOT_LENSES;

const sizeOf  = (id)=> SHOT_SIZES.find(x=>x.id===id)  || SHOT_SIZES[4];
const angleOf = (id)=> SHOT_ANGLES.find(x=>x.id===id) || SHOT_ANGLES[0];
const moveOf  = (id)=> SHOT_MOVES.find(x=>x.id===id)  || SHOT_MOVES[0];
const lensOf  = (id)=> SHOT_LENSES.find(x=>x.id===id) || SHOT_LENSES[3];
window.shotSizeOf = sizeOf; window.shotAngleOf = angleOf; window.shotMoveOf = moveOf; window.shotLensOf = lensOf;

/* ---- the rolling keyframe CHAIN ----------------------------------------------- */
/* The keyframe pass renders a scene's shots IN ORDER, each one seeded by the
   PREVIOUS shot's approved frame so the look AND progressive state (wetness, dirt,
   damage, wardrobe wear, a face crack introduced late) carry forward down the cut —
   on top of the locked sheets, which pin identity & set. These three helpers define
   that order, each shot's predecessor, and how hard the location plate should weigh. */

/* a scene's shots in render order — the order the chain renders and carries state */
function sceneShotsOrdered(list){
  return (list||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0) || (a.beatN||0)-(b.beatN||0));
}
window.sceneShotsOrdered = sceneShotsOrdered;

/* the shot a given shot CHAINS FROM — its immediate predecessor in render order,
   whose approved frame seeds this one. null = a chain HEAD: the scene's first shot,
   or any shot explicitly flagged a fresh start (.anchor — a hard cut mid-scene).
   A head renders from the locked sheets alone, with no previous-frame seed. */
function prevShotOf(sh, sceneShots){
  if(!sh || sh.anchor) return null;               // explicit fresh start (chain break)
  const ord = sceneShotsOrdered(sceneShots);
  const i = ord.findIndex(s=>s.id===sh.id);
  return i>0 ? ord[i-1] : null;                    // i<=0 → first shot = head
}
window.prevShotOf = prevShotOf;
/* convenience: is this shot a chain head (no predecessor to seed from)? */
function isShotHead(sh, sceneShots){ return !prevShotOf(sh, sceneShots); }
window.isShotHead = isShotHead;

/* how hard the location plate weighs, by shot size: the set is the SUBJECT of a wide
   (its geography must read) but only a background/grade anchor in a tight close-up,
   where the character is the subject. Drives the prompt's location lock AND the order
   references are attached in (wides lead with the set, tights lead with the cast). */
function locWeightForSize(sizeId){
  return (["MCU","CU","ECU","INSERT"].indexOf(sizeId)>=0) ? "ambient" : "primary";
}
window.locWeightForSize = locWeightForSize;

/* a one-line human label for a shot's grammar, e.g. "MS · Low angle · Push in · 50mm" */
function shotGrammarLabel(sh){
  return [sizeOf(sh.size).label, angleOf(sh.angle).label, moveOf(sh.move).label, lensOf(sh.lens).label].join(" · ");
}
window.shotGrammarLabel = shotGrammarLabel;

/* ---- CLIP SEQUENCES — the Stage hand-off unit ---------------------------------- */
/* A SEQUENCE is a contiguous run of a scene's shots that becomes ONE generated
   video clip (the Stage's video model renders up to ~15 seconds per clip). The
   grouping lives on the shots themselves — an automatic duration estimate
   (shotDur) and `seqBreak` (this shot STARTS a new clip) — so the Shot List,
   the Storyboard's clip boards and the future Stage all read the SAME partition. */
const CLIP_MAX_SECONDS = 15;   // one generated clip's budget (Seedance-class video models)
window.CLIP_MAX_SECONDS = CLIP_MAX_SECONDS;

/* AUTO duration estimate. A shot's real length can't be predicted — the video
   model decides its own pacing; the only duration we control is the CLIP's total.
   The one measurable anchor is dialogue: the spoken line fixes the shot's floor
   (~2.4 words/sec + a breath). Everything else gets a flat working guess. These
   are packing BUDGETS (how many beats can one 15s clip carry?), not promises. */
function shotEstDur(sh){
  const words = String((sh && sh.dialogue)||"").trim().split(/\s+/).filter(Boolean).length;
  if(words) return Math.min(CLIP_MAX_SECONDS, Math.max(3, Math.round(words/2.4 + 1.5)));
  return 5;
}
window.shotEstDur = shotEstDur;

/* a shot's budgeted screen time: a hand-pinned value, else the auto estimate */
function shotDur(sh){ const n = Number(sh && sh.dur); return (isFinite(n) && n>0) ? n : shotEstDur(sh); }
window.shotDur = shotDur;
function seqDuration(list){ return (list||[]).reduce((t,s)=>t+shotDur(s),0); }
window.seqDuration = seqDuration;

/* Partition a scene's ORDERED shots into clip sequences.
   MANUAL: any shot (beyond the first) carrying an explicit boolean `seqBreak`
   makes the scene hand-grouped — a new clip starts at every seqBreak:true.
   AUTO (the default): greedy duration packing — a new clip starts whenever the
   next shot would push the running clip past the budget.
   `clipMax` (optional) is the format's per-clip budget — clipMaxFor(project).
   Returns [{ index, start, shots, dur, over, manual }]. */
function sceneSequences(sceneShots, clipMax){
  const MAX = clipMax || CLIP_MAX_SECONDS;
  const list = sceneShots || [];
  if(!list.length) return [];
  const manual = list.some((s,i)=> i>0 && typeof s.seqBreak==="boolean");
  const groups = [];
  if(manual){
    list.forEach((s,i)=>{ if(i===0 || s.seqBreak===true) groups.push([]); groups[groups.length-1].push(s); });
  } else {
    let cur=[], t=0;
    list.forEach(s=>{ const d=shotDur(s);
      if(cur.length && t+d>MAX){ groups.push(cur); cur=[]; t=0; }
      cur.push(s); t+=d; });
    if(cur.length) groups.push(cur);
  }
  let start=0;
  return groups.map((shots,index)=>{
    const dur = seqDuration(shots);
    const g = { index, start, shots, dur, over: dur>MAX, manual };
    start += shots.length;
    return g;
  });
}
window.sceneSequences = sceneSequences;

/* ---- resolution helpers (scene ▸ location / subjects / props) ----------------- */
function locationForScene(locations, sceneId){
  return (locations||[]).find(l=> Array.isArray(l.scenes) && l.scenes.indexOf(sceneId)>=0) || null;
}
window.locationForScene = locationForScene;

/* props that appear in a scene (their scene chips include this scene) */
function propsForScene(props, sceneId){
  return (props||[]).filter(p=> Array.isArray(p.scenes) && p.scenes.indexOf(sceneId)>=0);
}
window.propsForScene = propsForScene;

/* the characters a scene most likely frames: its driver + the beats' reactor.
   Returns an array of character ids resolved against the cast (best-effort by name). */
function sceneSubjectIds(scene, characters, beats){
  const ids = [];
  if(scene && scene.driver) ids.push(scene.driver);
  const b = beats && beats[scene.id];
  if(b && b.reactorLabel){
    const m = (characters||[]).find(c=> (c.name||"").toLowerCase() === b.reactorLabel.toLowerCase()
      || b.reactorLabel.toLowerCase().includes((c.name||"").toLowerCase()));
    if(m && ids.indexOf(m.id)<0) ids.push(m.id);
  }
  return ids;
}
window.sceneSubjectIds = sceneSubjectIds;

/* ---- depth-grid framing scoped to a shot SIZE --------------------------------- */
/* The location owns the canonical 3×3 depth grid. A shot SIZE decides how much of
   it is in frame: wides show the whole grid (walls + floor); tighter sizes pull the
   subject (midground centre) and any foreground veil. Returns a short clause that
   tells the model which depth planes to feature for THIS shot. */
function shotFramingClause(location, sizeId){
  if(!location || typeof stagingOf!=="function" || (typeof stagingHasContent==="function" && !stagingHasContent(location))) return "";
  const s = stagingOf(location);
  const wide = ["EWS","WS","FS","MWS"].indexOf(sizeId)>=0;
  const bits = [];
  if(wide){
    if(s.bg.center) bits.push("background landmark: "+s.bg.center.replace(/\.$/,""));
    if(s.mid.left)  bits.push("left frame edge: "+s.mid.left.replace(/\.$/,""));
    if(s.mid.right) bits.push("right frame edge: "+s.mid.right.replace(/\.$/,""));
    if(s.fg.left)   bits.push("foreground left: "+s.fg.left.replace(/\.$/,""));
    if(s.fg.right)  bits.push("foreground right: "+s.fg.right.replace(/\.$/,""));
    if(s.floor)     bits.push("ground plane: "+s.floor.replace(/\.$/,""));
    if(!bits.length) return "";
    return "DEPTH FRAMING (this location's staging, layered for parallax): "+bits.join("; ")+". ";
  }
  // tight sizes: subject dominant, landmarks fall to soft background
  if(s.bg.center) bits.push("the "+s.bg.center.replace(/\.$/,"")+" reads softly out of focus behind");
  if(s.fg.left||s.fg.right){ const fg = s.fg.left||s.fg.right; bits.push("a foreground element ("+fg.replace(/\.$/,"")+") veils an edge for depth"); }
  if(!bits.length) return "";
  return "DEPTH FRAMING: subject dominant in a shallow plane; "+bits.join("; ")+". ";
}
window.shotFramingClause = shotFramingClause;

/* a compact single-FRAME description of the location (not the 6-panel plate). */
function shotLocationClause(location){
  if(!location) return "";
  const bits = [];
  bits.push("LOCATION \u2014 "+(location.name||"the place")+" ("+(location.intExt||"INT")+")");
  if(location.architecture) bits.push("space: "+location.architecture.replace(/\.$/,""));
  if(location.materials)    bits.push("materials & palette: "+location.materials.replace(/\.$/,""));
  if(location.lighting)     bits.push("light: "+location.lighting.replace(/\.$/,""));
  return bits.join(". ")+". ";
}
window.shotLocationClause = shotLocationClause;

/* Preserve screen direction through the rolling chain. Shot specs are drafted
   before frames exist, so their prose can contradict the approved predecessor
   (e.g. "Vanya right-of-frame" after she was established left). Read explicit
   sides from the previous shot's blocking, infer the opposite side for a
   two-person setup, and remove contradictory side clauses from this prompt. */
function shotScreenDirection(prevShot, subjects, composition){
  if(!prevShot || !(subjects||[]).length) return { composition, clause:"" };
  const prior = [prevShot.composition, prevShot.action].filter(Boolean).join(". ");
  const esc = (s)=>String(s||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const aliases = (c)=>{
    const full=String(c.name||"").trim();
    const bits=full.split(/[\s_-]+/).filter(Boolean);
    return Array.from(new Set([full, bits[0], bits.length>1?bits[bits.length-1]:""].filter(Boolean)));
  };
  const sides = {};
  (subjects||[]).forEach(c=>{
    let best=null;
    aliases(c).some(name=>{
      const re = new RegExp("\\b"+esc(name)+"\\b([^.;]{0,55})","i");
      const m = prior.match(re);
      if(!m) return false;
      const side = m[1].match(/\b(left|right)(?:[- ](?:of[- ]frame|hand|side|third))?\b/i);
      if(side){ best=side[1].toLowerCase(); return true; }
      return false;
    });
    if(best) sides[c.id]=best;
  });
  const known = Object.keys(sides);
  if((subjects||[]).length===2 && known.length===1){
    const other = subjects.find(c=>!sides[c.id]);
    if(other) sides[other.id] = sides[known[0]]==="left" ? "right" : "left";
  }
  if(!Object.keys(sides).length) return { composition, clause:"" };

  // Drop only comma/semicolon clauses that attach a conflicting side to a named
  // character. The rest of the composition (depth, lens falloff, smoke, etc.) stays.
  const chunks = String(composition||"").split(/([,;])/);
  const kept = [];
  for(let i=0;i<chunks.length;i+=2){
    const text=chunks[i]||"", sep=chunks[i+1]||"";
    const names=(subjects||[]).some(c=>aliases(c).some(n=>new RegExp("\\b"+esc(n)+"\\b","i").test(text)));
    const hasSide=/\b(left|right)(?:[- ](?:of[- ]frame|hand|side|third))?\b/i.test(text);
    if(!(names&&hasSide)){ kept.push(text); if(sep) kept.push(sep); }
  }
  let cleanComp=kept.join("").replace(/^[,;\s]+|[,;\s]+$/g,"").replace(/([,;])\s*([,;])/g,"$1").trim();
  const sideText=(subjects||[]).filter(c=>sides[c.id]).map(c=>(c.name||"Subject")+" remains on the "+sides[c.id]+" side of frame").join("; ");
  return {
    composition:cleanComp,
    clause:"SCREEN DIRECTION CONTINUITY: match the previous approved frame's axis and eyelines; "+sideText+". Do not flip or mirror their established positions.",
  };
}
window.shotScreenDirection = shotScreenDirection;

/* ---- THE COMPOSER: a shot → one final image prompt ---------------------------- */
/* ctx = { scene, location, charById, propById, project, prevShot } */
function buildShotPrompt(sh, ctx){
  ctx = ctx || {};
  const scene = ctx.scene || {};
  const loc = ctx.location || null;
  const charById = ctx.charById || {};
  const propById = ctx.propById || {};
  // in-frame cast & props are DERIVED from the action text (inFrameCast/inFrameProps),
  // not the stored tags — so they're always accurate to what the frame actually shows.
  const _chars = Object.values(charById);
  const subjects = ((typeof inFrameCast==="function") ? inFrameCast(sh, scene, _chars) : (sh.subjects||[])).map(id=>charById[id]).filter(Boolean);
  const props    = ((typeof inFrameProps==="function") ? inFrameProps(sh, scene, charById, propById) : (sh.props||[])).map(id=>propById[id]).filter(Boolean);
  const size = sizeOf(sh.size), angle = angleOf(sh.angle), move = moveOf(sh.move), lens = lensOf(sh.lens);
  const locWeight = (typeof locWeightForSize==="function") ? locWeightForSize(sh.size) : "primary";

  /* PROSE, not JSON. The user's structure: a constant STYLE SPINE (render mode, grade,
     60/30/10 palette, grade-lighting, lens, film stock, the locked location, format)
     pasted verbatim into every shot in the scene; then the one STAGING LINE that
     changes per shot (camera + action + cast + depth + dialogue); then the named
     REFERENCE stack (the attached sheets + the rolling seed) and the constraints.
     Same data the old JSON spec carried, re-emitted as prose. */
  const clean = (x)=>String(x||"").replace(/\s+/g," ").trim().replace(/\.$/,"");
  const preset = (typeof scenePreset==="function") ? scenePreset(ctx.project, scene.id) : null;
  const _asp = (typeof aspectFor==="function") ? aspectFor(ctx.project) : "16:9";

  // ---- THE STYLE SPINE (constant; pasted into every shot) ----
  const spine = [];
  spine.push("Cinematic live-action photorealistic still" + ((preset && clean(preset.texture)) ? (", "+clean(preset.texture)) : ", subtle 35mm film grain"));
  if(preset){
    const gName = clean(preset.name), gTxt = clean(preset.grade);
    if(gName && gTxt) spine.push('"'+gName+'" grade: '+gTxt);
    else if(gTxt) spine.push(gTxt);
    else if(gName) spine.push('"'+gName+'" grade');
    const pal = preset.palette||[];
    if(pal.length>=3) spine.push("Colour follows 60/30/10 — ~60% "+clean(preset.dominantLabel||"dominant")+" "+pal[0]
      +", ~30% "+clean(preset.secondaryLabel||"secondary")+" "+pal[1]
      +", ~10% "+clean(preset.accentLabel||"accent")+" "+pal[2]+" accent");
    if(clean(preset.lighting)) spine.push(clean(preset.lighting));
    if(clean(preset.lens))     spine.push(clean(preset.lens));
  }
  const _stock = (typeof filmStockClause==="function") ? clean(filmStockClause(ctx.project)) : "";
  if(_stock) spine.push(_stock);
  if(loc){
    const _intext = (loc.intExt==="EXT") ? "Exterior" : (loc.intExt==="INT" ? "Interior" : clean(loc.intExt));
    const _locBits = [clean(loc.architecture), clean(loc.materials), clean(loc.lighting)].filter(Boolean).join(", ");
    spine.push((_intext?(_intext+". "):"") + (loc.name||"the location") + (_locBits?(": "+_locBits):""));
  }
  spine.push((_asp==="9:16"?"Vertical 9:16 (phone frame)":_asp) + ", no text, no border");
  const STYLE_SPINE = spine.filter(Boolean).join(". ").replace(/\.\s*\./g,".") + ".";

  // ---- THE STAGING LINE (the only part that changes per shot) ----
  const SIZE_PHRASE = { EWS:"Extreme wide shot", WS:"Wide shot", FS:"Full shot", MWS:"Medium-wide shot",
    MS:"Medium shot", MCU:"Medium close-up", CU:"Close-up", ECU:"Extreme close-up", INSERT:"Insert shot" };
  const camBits = [ SIZE_PHRASE[sh.size] || (size.name+" shot"), clean(angle.label).toLowerCase(), clean(lens.label) ];
  if(sh.move && sh.move!=="static") camBits.push(clean(move.label).toLowerCase());
  const cap = (s)=> s ? (s.charAt(0).toUpperCase()+s.slice(1)) : s;
  const screenDir = shotScreenDirection(ctx.prevShot, subjects, sh.composition);
  const stage = [ camBits.join(", ") ];
  if(clean(sh.action))      stage.push(cap(clean(sh.action)));
  if(clean(screenDir.composition)) stage.push(cap(clean(screenDir.composition)));
  if(clean(screenDir.clause)) stage.push(clean(screenDir.clause));
  const _depth = (typeof shotFramingClause==="function") ? clean(shotFramingClause(loc, sh.size)) : "";
  if(_depth) stage.push(_depth);
  const _dlg = clean(sh.dialogue).replace(/^["“]|["”]$/g,"");
  if(_dlg) stage.push('Caught mid-line as the character speaks "'+_dlg+'"');
  const STAGING = stage.join(". ") + ".";

  // ---- THE NUMBERED IMAGE MAP (the FIRST thing in the prompt) — tells the generator
  // which attached file is which, BY POSITION. The order MUST mirror the real attachment
  // order in collectShotRefs (shots-ui.jsx) and generateShotFrame: the seed (previous
  // approved frame) leads as Image 1 when present, then the sheets by location weight
  // (wide → set first; tight → cast first), then props, then carried-forward. ----
  const imgs = [];
  if(ctx.prevFrameRole) imgs.push("the PREVIOUS approved frame — carry its colour grade, lighting and every established physical state (wardrobe wear, wetness, dirt, damage) forward exactly, but do NOT copy its framing");
  const _locLabel = loc ? ((loc.name||"the location")+" location plate — "
    + (locWeight==="ambient" ? "a background reference for the grade and surfaces only; the character fills this tight frame" : "reproduce its architecture, surfaces, fixtures and signage exactly")) : null;
  const _castLabels = subjects.map(c=> c.name+"'s character sheet — match the face, build, hair and wardrobe exactly");
  const _propLabels = props.map(p=> "the "+p.name+" (prop sheet"+(p.ownerName?(", "+((p.kind==="worn")?"worn by ":"carried by ")+p.ownerName):"")+") — match it exactly as designed");
  const _carriedLabels = (ctx.carriedForward||[]).map(p=> "the "+p.name+" (prop sheet) — still in frame from an earlier beat; keep it present, matching its sheet");
  if(locWeight==="ambient"){ _castLabels.forEach(l=>imgs.push(l)); if(_locLabel) imgs.push(_locLabel); }
  else { if(_locLabel) imgs.push(_locLabel); _castLabels.forEach(l=>imgs.push(l)); }
  _propLabels.forEach(l=>imgs.push(l));
  _carriedLabels.forEach(l=>imgs.push(l));
  const MAP = imgs.length
    ? ("Compose a new cinematic still. " + imgs.map((m,i)=>"Image "+(i+1)+" is "+m+".").join(" "))
    : "Compose a new cinematic still.";

  // ---- ASSEMBLE: image map, then the style spine, then the staging line, then constraints ----
  let out = MAP + "\n\n" + STYLE_SPINE + "\n\n— " + STAGING;
  out += "\n\nConstraints: " + shotNegativePrompt(sh) + ".";
  return out;
}
window.buildShotPrompt = buildShotPrompt;

/* the negative prompt for a shot frame */
function shotNegativePrompt(sh){
  return (sh && sh.negativePrompt) || "no text, no captions, no watermark, no logo, no split-screen, no grid, no collage, "
    + "no contact sheet, not a cartoon, no extra fingers, no deformed anatomy, no duplicate people";
}
window.shotNegativePrompt = shotNegativePrompt;

/* master + negative → the final string fed to the image model */
function combinedShotPrompt(sh, ctx){
  // the negative (custom per-shot, else the defaults) rides INSIDE the JSON spec
  return buildShotPrompt(sh, ctx);
}
window.combinedShotPrompt = combinedShotPrompt;

/* DERIVE-FROM-ANCHOR — RETIRED. The old star topology re-framed a single scene
   anchor for every shot; the rolling chain (buildShotPrompt + continuity_anchor,
   seeded by the previous shot's frame) replaces it because the star can't carry
   progressive state. Kept only for reference; no longer called. Safe to delete. */
function deriveShotPrompt(sh, ctx){
  ctx = ctx || {};
  const loc = ctx.location || null;
  const charById = ctx.charById || {};
  const subjects = ((typeof inFrameCast==="function") ? inFrameCast(sh, ctx.scene, Object.values(charById)) : (sh.subjects||[])).map(id=>charById[id]).filter(Boolean);
  const size = sizeOf(sh.size), angle = angleOf(sh.angle), move = moveOf(sh.move), lens = lensOf(sh.lens);
  const clean = (x)=>String(x||"").replace(/\.$/,"").trim();
  const _asp = (typeof aspectFor==="function") ? aspectFor(ctx.project) : "16:9";
  const spec = {
    base_image: "THIS SAME SCENE's key frame \u2014 same set, same moment, same lighting, same colour grade, same people",
    task: "RE-FRAME the base image to a different camera setup, as one continuous take would",
    camera: {
      size: size.name+" ("+size.desc+")",
      angle: angle.label+" ("+angle.desc+")",
      lens: lens.label+" ("+lens.desc+")",
      movement: (sh.move && sh.move!=="static") ? (move.label+" ("+move.desc+")") : "static",
    },
    in_frame: subjects.length ? subjects.map(c=>c.name) : undefined,
    still_in_frame: (ctx.carriedForward && ctx.carriedForward.length)
      ? ctx.carriedForward.map(p=> p.name + (p.ownerName?(" ("+p.ownerName+"'s)"):"") + " \u2014 carried from an earlier beat; keep it present") : undefined,
    action: clean(sh.action) || undefined,
    dialogue_mid_line: clean(sh.dialogue).replace(/^["\u201c]|["\u201d]$/g,"") || undefined,
    composition: clean(sh.composition) || undefined,
    keep_identical_to_base: [
      "the set's architecture, surfaces, signage and layout",
      "the light sources and colour grade",
      "every character's face, hair and wardrobe",
    ],
    if_new_space_revealed: "extend the SAME set consistently"+(loc?" using the attached location coverage sheet (multiple views of this ONE set)":""),
    format: {
      frame: "a single "+(_asp==="9:16"?"VERTICAL 9:16 (phone)":_asp)+" frame",
      rules: ["photoreal, filmic","no text, no watermark, no split panels"],
    },
    negative: shotNegativePrompt(sh).split(/,\s*/),
  };
  return "The BASE IMAGE is this scene's key frame. Re-frame it EXACTLY as specified by this JSON spec:\n"+JSON.stringify(spec, null, 1);
}
window.deriveShotPrompt = deriveShotPrompt;

/* HEADLESS shot-frame generation — the Scene Director's primitive (no mounted
   card). Mirrors ShotCard's pipeline exactly: the ROLLING CHAIN — every shot after
   the scene's head seeds from the PREVIOUS shot's committed frame (so the look AND
   progressive state carry forward) on top of the locked sheets; the head renders
   from the sheets alone. References are ordered by the shot's location weight
   (wides lead with the set, tights with the cast). quality "medium", commit +
   nb-gen-done so any mounted card adopts the result.
   opts: { fresh, correction } — fresh ignores the chain seed; correction is the QC repair. */
async function generateShotFrame(sh, sceneShots, ctx, opts){
  opts = opts || {};
  const prevSh = (typeof prevShotOf==="function") ? prevShotOf(sh, sceneShots) : null;
  const isHead = !prevSh;
  const grab = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
    if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; };
  // the SEED: the previous shot's committed frame — the rolling reference (carries grade + state)
  const seed = (prevSh && !opts.fresh) ? await grab(prevSh.id) : "";
  const locWeight = (typeof locWeightForSize==="function") ? locWeightForSize(sh.size) : "primary";
  // the locked-reference sheets for what's actually in THIS frame (derived from the action text)
  const _chars = Object.values(ctx.charById||{});
  const inCast = (typeof inFrameCast==="function") ? inFrameCast(sh, ctx.scene, _chars) : (sh.subjects||[]);
  const inPr   = (typeof inFrameProps==="function") ? inFrameProps(sh, ctx.scene, ctx.charById, ctx.propById) : (sh.props||[]);
  // CONTINUITY LEDGER — props an in-frame character was established holding earlier in the
  // scene that this beat's text doesn't re-name; carry them forward so they don't vanish.
  let carried = [];
  try{ const ledger = sceneContinuityLedger(ctx.scene, sceneShots, ctx.charById, ctx.propById);
    carried = (ledger[sh.id]||[]).filter(pid=> inPr.indexOf(pid)<0); }catch(e){}
  // build the sheet-reference specs, then ORDER by location weight
  const locSpec  = ctx.location ? [{ id:ctx.location.id, note:(ctx.location.name||"location")+" location coverage sheet (multiple views of ONE set)" }] : [];
  const castSpec = inCast.map(id=>{ const c=(ctx.charById||{})[id]; return c?{ id, note:c.name+" character sheet" }:null; }).filter(Boolean);
  const propSpec = inPr.map(id=>{ const p=(ctx.propById||{})[id]; return p?{ id, note:p.name+" prop sheet" }:null; }).filter(Boolean);
  const carrySpec= carried.map(id=>{ const p=(ctx.propById||{})[id]; return p?{ id, note:p.name+" prop sheet (carried over from an earlier beat)" }:null; }).filter(Boolean);
  const orderedSpecs = (locWeight==="ambient")
    ? [...castSpec, ...locSpec, ...propSpec, ...carrySpec]   // tight: the cast leads, the set recedes
    : [...locSpec, ...castSpec, ...propSpec, ...carrySpec];  // wide: the set leads
  const refs = [];
  for(const s of orderedSpecs){ const u=await grab(s.id); if(u) refs.push({ url:u, note:s.note }); }
  // buildShotPrompt now emits the STYLE SPINE + staging + the named reference stack itself
  // (it reads ctx.carriedForward + ctx.prevFrameRole), so we don't re-list references here.
  ctx = { ...ctx, carriedForward: carried.map(id=>(ctx.propById||{})[id]).filter(Boolean),
    prevFrameRole: !!seed, prevShot:seed?prevSh:null };
  let prompt = combinedShotPrompt(sh, ctx);
  if(opts.correction) prompt += "\n\nCORRECTIONS (the previous attempt failed visual QC): "+opts.correction.replace(/\.$/,"")+".";
  const gopts = {
    aspectRatio:(typeof aspectFor==="function") ? aspectFor(ctx.project) : "16:9",
    quality:"medium",
    referenceMaxDim:768,
  };
  if(seed) gopts.referenceImage = seed;
  if(refs.length) gopts.extraImages = refs.map(r=>r.url);
  const url = await nbGenerate(prompt, gopts);
  const now = new Date();
  const prior = (typeof nbGetMeta==="function") ? (nbGetMeta(sh.id)||{}) : {};
  const meta = { ...prior, mode: seed?"base":"final", prompt, director:true,
    date:now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
    time:now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}), iso:now.toISOString(),
    version:((prior.version||0)+1), ...(opts.correction?{editInstruction:opts.correction}:{}) };
  const r = (typeof nbCommit==="function") ? await nbCommit(sh.id, url, meta, [], "shot") : null;
  const committed = (r && r.url) || url;
  try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:sh.id, url:committed } })); }catch(e){}
  return committed;
}
window.generateShotFrame = generateShotFrame;

/* a shot is "drafted" / generatable once it has a size and at least an action or subject */
function shotDrafted(sh){
  return !!(sh && sh.size && (sh.action || (sh.subjects&&sh.subjects.length)));
}
window.shotDrafted = shotDrafted;

/* ---- heuristic fallback: one shot per beat (used when AI is unavailable) ------- */
/* Gives each beat a sensible default coverage so the tab is never empty: the scene
   opens WIDE to establish, tightens through the middle, and pushes to a CU on the turn. */
function deriveShotsHeuristic(scene, beats, locations, props, characters){
  const b = beats && beats[scene.id];
  const rows = (b && b.rows) || [];
  const loc = locationForScene(locations, scene.id);
  const subj = sceneSubjectIds(scene, characters, beats);
  const scProps = propsForScene(props, scene.id).map(p=>p.id);
  const turnAt = (b && b.turnAt) || 0;
  const n = rows.length || 1;
  const out = [];
  const src = rows.length ? rows : [{ n:1, drive:{ d: scene.summary||"" } }];
  src.forEach((row, i)=>{
    const isFirst = i===0, isTurn = turnAt && row.n===turnAt, isLast = i===n-1;
    let size = "MS", angle = "eye", move = "static", lens = "50";
    if(isFirst){ size="WS"; lens="35"; }                         // establish
    else if(isTurn){ size="CU"; move="push"; lens="85"; }        // the flip
    else if(isLast){ size="MCU"; lens="85"; }
    else { size = (i%2===0)?"MS":"MWS"; }
    const action = (row.drive && row.drive.d) || scene.summary || "";
    const named = scanTextForChars(action, characters);
    out.push({
      id: "shot-"+scene.id+"-"+(row.n||i+1)+"-"+Date.now().toString(36)+i,
      sceneId: scene.id, beatN: row.n||(i+1), order: i,
      size, angle, move, lens, composition:"",
      subjects: named.length ? named : subj.slice(), locationId: loc?loc.id:"", props: scProps.slice(),
      action,
      dialogue:"", negativePrompt:""
    });
  });
  return out;
}
window.deriveShotsHeuristic = deriveShotsHeuristic;

/* scan a shot's action/composition text for cast members actually NAMED in it.
   The action text is authoritative (it's what the frame depicts), so this is a more
   reliable subject signal than the model's separate `subjects` field, which can drift
   to background/crowd cast. Matches full name, first name or last name as whole words. */
function scanTextForChars(text, characters){
  const t = " "+String(text||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ")+" ";
  const ids = [];
  (characters||[]).forEach(c=>{
    const full = (c.name||"").toLowerCase().trim();
    if(!full) return;
    // split on ANY non-alphanumeric (not just whitespace) so a hyphenated/serial name like
    // "VANYA-71" yields the human token "vanya" — otherwise the whole "vanya-71" token never
    // matches the script's "Vanya" and the character is silently dropped from the frame.
    const parts = full.split(/[^a-z0-9]+/).filter(w=> w.length>=3 && !/^[0-9]+$/.test(w));
    const names = Array.from(new Set([full.replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim(), ...parts])).filter(Boolean);
    if(names.some(nm=> t.indexOf(" "+nm+" ")>=0)){ if(ids.indexOf(c.id)<0) ids.push(c.id); }
  });
  return ids;
}
window.scanTextForChars = scanTextForChars;

/* WHO is in THIS frame — derived from the shot's own action/composition text (the most
   reliable per-frame signal), not from fragile manual tags. Falls back to the scene's
   DRIVER when the action names nobody (a pronoun-only beat), and to whatever was stored
   only as a last resort. This is the single source the references + prompt read, so an
   under-tagged shot can no longer drop a character's identity anchor — nor over-attach a
   character who isn't in the frame. */
function inFrameCast(sh, scene, characters){
  const named = scanTextForChars(((sh&&sh.action)||"")+" "+((sh&&sh.composition)||""), characters);
  if(named.length) return named;
  if(scene && scene.driver && (characters||[]).some(c=>c.id===scene.driver)) return [scene.driver];
  return ((sh&&sh.subjects)||[]).filter(id=>(characters||[]).some(c=>c.id===id));
}
window.inFrameCast = inFrameCast;

/* THE scene's cast roster — the single authoritative answer to "who is in this scene",
   so the bible, the prop mapping and any future consumer all read ONE definition instead
   of each re-deriving (the source of contradictory rosters). A hand-authored `scene.cast`
   (ids) WINS — it's the editable first-class edge. Otherwise it's the union of every
   reliable signal: the driver, anyone named in the scene's own script text, and everyone
   any of the scene's shots puts in frame (inFrameCast on the action). Computed, never a
   stale stored copy — but honours the override when present. */
function sceneRoster(scene, characters, drafts, shots){
  const chars = characters || [];
  const valid = (id)=> chars.some(c=>c.id===id);
  if(scene && Array.isArray(scene.cast) && scene.cast.length) return scene.cast.filter(valid);
  const ids = [];
  if(scene && scene.driver && valid(scene.driver)) ids.push(scene.driver);
  if(typeof scenesWhereCharacterAppears==="function" && scene){
    chars.forEach(c=>{ if(ids.indexOf(c.id)<0 && scenesWhereCharacterAppears(c.id, c.name, [scene], drafts).length) ids.push(c.id); });
  }
  (shots||[]).forEach(sh=>{ inFrameCast(sh, scene, chars).forEach(id=>{ if(valid(id) && ids.indexOf(id)<0) ids.push(id); }); });
  return ids;
}
window.sceneRoster = sceneRoster;

/* WHICH props are in THIS frame — precise, so the model isn't handed sheets for objects
   that aren't there. Two ways in: (a) a WORN item of an in-frame character (it's on their
   body); (b) a prop NAMED in the action text. Naming requires a strong match — for a
   multi-word name, at least TWO of its significant words must appear (so "forearm latch"
   in the action picks "Forearm maintenance latch" but not "Seized door latch", which only
   shares the generic word "latch"). Candidates are tied to the scene (owner in frame, mapped
   to this scene, or UNMAPPED ownerless set dressing — a prop mapped to OTHER scenes can't
   leak in). Stored prop tags are NOT a source —
   they were the unreliable input the action text now replaces. */
function inFrameProps(sh, scene, charById, propById){
  const props = Object.values(propById||{});
  const castIds = (typeof inFrameCast==="function") ? inFrameCast(sh, scene, Object.values(charById||{})) : ((sh&&sh.subjects)||[]);
  const t = " "+(((sh&&sh.action)||"")+" "+((sh&&sh.composition)||"")).toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ")+" ";
  const out = [];
  props.forEach(p=>{
    const ownerIn = !!(p.ownerId && castIds.indexOf(p.ownerId)>=0);
    // worn items ride with their in-frame owner
    if((p.kind||"carried")==="worn" && ownerIn){ out.push(p.id); return; }
    const words = Array.from(new Set(String(p.name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ")
      .split(/\s+/).filter(w=>w.length>=4 && !/^[0-9]+$/.test(w))));
    if(!words.length) return;
    const hits = words.filter(w=> t.indexOf(" "+w+" ")>=0).length;
    const strong = hits >= Math.min(2, words.length);   // multi-word name needs 2 hits
    if(!strong) return;
    // tied to THIS scene when: owner in frame, OR mapped to this scene, OR it's ownerless
    // set dressing with NO scene mapping at all (truly global). An ownerless prop mapped to
    // OTHER scenes is NOT global — it must not leak in here just because its name matches.
    const mappedHere = !!(scene && Array.isArray(p.scenes) && p.scenes.indexOf(scene.id)>=0);
    const globalDressing = !p.ownerId && !(Array.isArray(p.scenes) && p.scenes.length);
    if(ownerIn || mappedHere || globalDressing) out.push(p.id);
  });
  return out;
}
window.inFrameProps = inFrameProps;

function propMentionedInText(p, text){
  const name = String(p&&p.name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ");
  const words = name.split(/\s+/).filter(w=>w.length>=4 && !/^[0-9]+$/.test(w));
  if(!words.length) return false;
  const t = " "+String(text||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ")+" ";
  return words.filter(w=>t.indexOf(" "+w+" ")>=0).length >= Math.min(2, words.length);
}
function propLeavesFrameInText(p, text){
  if(!propMentionedInText(p, text)) return false;
  return /\b(drops?|dropped|discard(?:s|ed)?|throws?|thrown|toss(?:es|ed)?|releases?|lets go|sets down|puts down|hands? off|hands? over|gives? (?:it )?to|taken away|takes away|snatches?|stolen|breaks?|broken|shatters?|destroy(?:s|ed)?|burn(?:s|ed)?|stows?|pockets?|hides?|hidden|leaves? behind|lost)\b/i.test(String(text||""));
}

/* CONTINUITY LEDGER — the carry-forward fix. inFrameProps reads only THIS beat's text, so
   a prop established in beat 1 (Vanya's doll) silently vanishes from beat 2 if beat 2's
   action doesn't re-name it. This rolls a running "what each in-frame character was
   established holding/wearing earlier in the scene" total, beat by beat (story order), and
   returns, per shot, the prop ids to CARRY FORWARD (established earlier by someone in this
   frame, not already named here). Deterministic — no AI. Scoped to the scene so a prop set
   down in a later scene doesn't leak. Both the Shot List and Storyboard read it. */
function sceneContinuityLedger(scene, sceneShots, charById, propById){
  const ordered = (sceneShots||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0) || (a.beatN||0)-(b.beatN||0));
  const chars = Object.values(charById||{});
  const held = {};   // charId -> Set(propId) established in this scene so far
  const ledger = {};
  ordered.forEach(sh=>{
    const cast = (typeof inFrameCast==="function") ? inFrameCast(sh, scene, chars) : ((sh&&sh.subjects)||[]);
    const here = (typeof inFrameProps==="function") ? inFrameProps(sh, scene, charById, propById) : ((sh&&sh.props)||[]);
    const text = [sh&&sh.action, sh&&sh.composition, sh&&sh.dialogue].filter(Boolean).join(" ");
    const cf = [];
    cast.forEach(cid=>{ const s=held[cid]; if(s) Array.from(s).forEach(pid=>{
      const p = (propById||{})[pid];
      if(propLeavesFrameInText(p, text)){ s.delete(pid); return; }
      if(here.indexOf(pid)<0 && cf.indexOf(pid)<0) cf.push(pid);
    }); });
    ledger[sh.id] = cf;
    here.forEach(pid=>{ const p=(propById||{})[pid]; const owner=p&&p.ownerId; if(owner){ (held[owner]=held[owner]||new Set()).add(pid); } });
    here.forEach(pid=>{ const p=(propById||{})[pid]; const owner=p&&p.ownerId; const s=owner&&held[owner];
      if(s && propLeavesFrameInText(p, text)) s.delete(pid);
    });
  });
  return ledger;
}
window.sceneContinuityLedger = sceneContinuityLedger;

/* REFERENTIAL-COMPLETENESS LINT (Part 4) — runs over a scene's BEAT MAP text and flags beats
   that aren't self-contained, BEFORE anything is generated: (a) a pronoun used while 2+
   characters are in play (the frame could mis-resolve it), and (b) a prop established
   earlier in the scene whose owner is still present but which this beat's text drops (it
   may pop out of the cut). Deterministic. `props` = [{name, owner|ownerName, type|kind}]
   (e.g. the Script Breakdown's tag-out). The lint reads the BEAT rows, never the screenplay
   prose (prose is meant to use pronouns). */
function beatContinuityLint(scene, beats, props, characters){
  const rows = (beats && beats.rows) || [];
  if(rows.length < 2) return [];
  const chars = characters || [];
  const propList = (props||[]).filter(p=> p && p.name && (p.type||p.kind)!=="dressing");
  const matchProp = (text, name)=>{
    const words = String(name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(w=>w.length>=4 && !/^[0-9]+$/.test(w));
    if(!words.length) return false;
    const t = " "+text.toLowerCase().replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ")+" ";
    return words.filter(w=> t.indexOf(" "+w+" ")>=0).length >= Math.min(2, words.length);
  };
  const flags = [], lastSeen = {}, flaggedDrop = {};
  rows.forEach(r=>{
    const text = ((r.drive&&r.drive.d)||"")+" "+((r.react&&r.react.d)||"");
    const beatChars = (typeof scanTextForChars==="function") ? scanTextForChars(text, chars) : [];
    if(/\b(she|her|hers|he|him|his|they|them|it|its)\b/i.test(text) && beatChars.length>=2)
      flags.push({ beat:r.n, kind:"pronoun", msg:"Beat "+r.n+": a pronoun with "+beatChars.length+" characters in play — name who/what so the frame can't mis-resolve it." });
    propList.forEach(p=>{
      if(matchProp(text, p.name)){ lastSeen[p.name]=r.n; delete flaggedDrop[p.name]; return; }
      if(lastSeen[p.name]!=null && !flaggedDrop[p.name]){
        const owner = chars.find(c=> (c.name||"").toLowerCase() === String(p.owner||p.ownerName||"").toLowerCase());
        if(owner && beatChars.indexOf(owner.id)>=0){
          flags.push({ beat:r.n, kind:"drop", msg:"Beat "+r.n+": "+(p.owner||p.ownerName||"its owner")+" is present but “"+p.name+"” (last named beat "+lastSeen[p.name]+") isn't — it may drop out of that frame." });
          flaggedDrop[p.name]=true;
        }
      }
    });
  });
  return flags;
}
window.beatContinuityLint = beatContinuityLint;

/* normalise one AI-returned shot into our model, resolving subjects/props by id|name */
function normalizeShot(raw, scene, idx, locations, props, characters, beats){
  const sizeIds = SHOT_SIZES.map(x=>x.id), angleIds = SHOT_ANGLES.map(x=>x.id),
        moveIds = SHOT_MOVES.map(x=>x.id), lensIds = SHOT_LENSES.map(x=>x.id);
  const pick = (v, ids, dflt)=>{ const u=String(v||"").toUpperCase(); const lc=String(v||"").toLowerCase();
    return ids.find(id=>id.toUpperCase()===u) || ids.find(id=>id.toLowerCase()===lc) || dflt; };
  const loc = locationForScene(locations, scene.id);
  const resolveChars = (arr)=>{
    const list = Array.isArray(arr)?arr:[];
    const ids = [];
    list.forEach(token=>{
      const t = String(token||"").toLowerCase().trim(); if(!t) return;
      const m = (characters||[]).find(c=> c.id.toLowerCase()===t || (c.name||"").toLowerCase()===t
        || t.includes((c.name||"").toLowerCase()) || (c.name||"").toLowerCase().includes(t));
      if(m && ids.indexOf(m.id)<0) ids.push(m.id);
    });
    return ids;
  };
  // subjects: the action/composition text is authoritative (it's what the frame
  // depicts), so prefer the cast NAMED in it; only fall back to the model's drifted
  // `subjects` field, then to the scene's driver+reactor, when the text names no one.
  const resolveSubjects = (raw, actionText)=>{
    const textIds = scanTextForChars((actionText||raw.action||"")+" "+(raw.composition||""), characters);
    if(textIds.length) return textIds;
    const aiIds = resolveChars(raw.subjects);
    return aiIds.length ? aiIds : sceneSubjectIds(scene, characters, beats);
  };
  const resolveProps = (arr)=>{
    const list = Array.isArray(arr)?arr:[];
    const ids = [];
    list.forEach(token=>{ const t=String(token||"").toLowerCase().trim(); if(!t) return;
      const m = (props||[]).find(p=> p.id.toLowerCase()===t || (p.name||"").toLowerCase()===t
        || t.includes((p.name||"").toLowerCase()));
      if(m && ids.indexOf(m.id)<0) ids.push(m.id); });
    return ids;
  };
  // never leave a shot with an empty action: fall back to the originating BEAT's
  // own action text (then the scene summary) when the model omitted it.
  const beatRow = (beats && beats[scene.id] && (beats[scene.id].rows||[]).find(r=>String(r.n)===String(raw.beat||idx+1)));
  const beatAction = beatRow ? ((beatRow.drive&&beatRow.drive.d)||(beatRow.react&&beatRow.react.d)||"") : "";
  const action = ((raw.action||"").toString().slice(0,300)) || beatAction || (scene.summary||"");
  return {
    id: "shot-"+scene.id+"-"+(raw.beat||idx+1)+"-"+Date.now().toString(36)+idx,
    sceneId: scene.id, beatN: raw.beat || (idx+1), order: idx,
    size: pick(raw.size, sizeIds, "MS"),
    angle: pick(raw.angle, angleIds, "eye"),
    move: pick(raw.move || raw.movement, moveIds, "static"),
    lens: pick(raw.lens, lensIds, "50"),
    composition: (raw.composition||"").toString().slice(0,240),
    subjects: resolveSubjects(raw, action),
    locationId: loc?loc.id:"",
    props: resolveProps(raw.props),
    action: action,
    dialogue: (raw.dialogue||"").toString().slice(0,200),
    // no dur: a drafted shot stays on AUTO — its length can't be predicted, only
    // budgeted (dialogue-anchored estimate via shotDur); the user pins by hand
    negativePrompt:""
  };
}
window.normalizeShot = normalizeShot;

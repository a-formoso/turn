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
   Returns [{ index, start, shots, dur, over, manual }]. */
function sceneSequences(sceneShots){
  const list = sceneShots || [];
  if(!list.length) return [];
  const manual = list.some((s,i)=> i>0 && typeof s.seqBreak==="boolean");
  const groups = [];
  if(manual){
    list.forEach((s,i)=>{ if(i===0 || s.seqBreak===true) groups.push([]); groups[groups.length-1].push(s); });
  } else {
    let cur=[], t=0;
    list.forEach(s=>{ const d=shotDur(s);
      if(cur.length && t+d>CLIP_MAX_SECONDS){ groups.push(cur); cur=[]; t=0; }
      cur.push(s); t+=d; });
    if(cur.length) groups.push(cur);
  }
  let start=0;
  return groups.map((shots,index)=>{
    const dur = seqDuration(shots);
    const g = { index, start, shots, dur, over: dur>CLIP_MAX_SECONDS, manual };
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

/* ---- THE COMPOSER: a shot → one final image prompt ---------------------------- */
/* ctx = { scene, location, charById, propById, project } */
function buildShotPrompt(sh, ctx){
  ctx = ctx || {};
  const scene = ctx.scene || {};
  const loc = ctx.location || null;
  const charById = ctx.charById || {};
  const propById = ctx.propById || {};
  const subjects = (sh.subjects||[]).map(id=>charById[id]).filter(Boolean);
  const props    = (sh.props||[]).map(id=>propById[id]).filter(Boolean);
  const size = sizeOf(sh.size), angle = angleOf(sh.angle), move = moveOf(sh.move), lens = lensOf(sh.lens);

  let s = "A single cinematic film FRAME — one shot from a live-action feature. ";
  // 1) shot grammar
  s += "SHOT: "+size.name+" ("+size.desc+"), "+angle.label.toLowerCase()+" ("+angle.desc+"), "
     + "on a "+lens.label+" lens ("+lens.desc+")";
  if(sh.move && sh.move!=="static") s += ", camera "+move.label.toLowerCase()+" ("+move.desc+")";
  s += ". ";
  // 2) who + action
  if(subjects.length){
    s += "IN FRAME: "+subjects.map(c=>c.name).join(" and ")+". ";
  }
  if(sh.action) s += "ACTION: "+sh.action.replace(/\.$/,"")+". ";
  if(sh.dialogue) s += "They are mid-line: \u201c"+sh.dialogue.replace(/^["\u201c]|["\u201d]$/g,"")+"\u201d. ";
  // 3) location single-frame + depth framing scoped to size
  s += shotLocationClause(loc);
  s += shotFramingClause(loc, sh.size);
  // 4) composition note (the editable "vary" layer)
  if(sh.composition) s += "COMPOSITION: "+sh.composition.replace(/\.$/,"")+". ";
  // 5) the scene's Style Bible GRADE — applied at the shot, the canonical place for it
  if(typeof scenePreset==="function" && typeof buildStyleClause==="function"){
    const preset = scenePreset(ctx.project, scene.id);
    if(preset) s += buildStyleClause(preset);
  }
  // 5b) the project's film-stock / capture look, layered on top of the grade
  if(typeof filmStockClause==="function") s += filmStockClause(ctx.project);
  // 6) consistency contract for the reference images
  const refNouns = [];
  if(subjects.length) refNouns.push(subjects.length>1?"character sheets":"character sheet");
  if(loc) refNouns.push("location coverage sheet");
  if(props.length) refNouns.push(props.length>1?"prop sheets":"prop sheet");
  if(refNouns.length){
    s += "The reference image"+(refNouns.length>1?"s are":" is")+" the canonical "+refNouns.join(", ")
      + " for this film — match the "
      + [subjects.length?"people":null, loc?"place":null, props.length?"objects":null].filter(Boolean).join(", ")
      + " to them EXACTLY for continuity (faces, wardrobe, geometry, materials); do not redesign them. "
      + "Compose them into this ONE frame as described. ";
  }
  // 6b) LOCATION LOCK — the location reference is a MULTI-VIEW sheet of ONE set, not six moods
  if(loc){
    s += "LOCATION LOCK: the location reference is a MULTI-VIEW coverage sheet — six photographs of ONE single real set "
      + "seen from different angles, NOT six different places. Reproduce THAT EXACT set from this shot's viewpoint: "
      + "identical architecture, wall and floor surfaces, tiling, colour, fixtures, and any SIGNAGE TEXT in the same "
      + "spelling and same positions. Never invent a different-looking space. ";
  }
  s += "Photoreal, filmic, theatrical aspect; natural production lighting; no text, no watermark, no split panels — a single frame.";
  return s;
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
  const neg = shotNegativePrompt(sh);
  return buildShotPrompt(sh, ctx) + (neg ? (" NEGATIVE (exclude): "+neg) : "");
}
window.combinedShotPrompt = combinedShotPrompt;

/* DERIVE-FROM-ANCHOR — the consistency fix. A fresh text-to-image sample
   re-synthesizes the whole world every time (references bias, they don't
   constrain), so independent shots drift in set/light/identity. This prompt
   instead treats the scene's KEY FRAME as the BASE IMAGE and asks the model to
   RE-FRAME the same moment — single-sample physics, per shot. The base carries
   the set, light and grade implicitly; we only restate what changes. */
function deriveShotPrompt(sh, ctx){
  ctx = ctx || {};
  const loc = ctx.location || null;
  const charById = ctx.charById || {};
  const subjects = (sh.subjects||[]).map(id=>charById[id]).filter(Boolean);
  const size = sizeOf(sh.size), angle = angleOf(sh.angle), move = moveOf(sh.move), lens = lensOf(sh.lens);
  let s = "The base image is THIS SAME SCENE — the scene's key frame: same set, same moment, same lighting, "
    + "same colour grade, same people. RE-FRAME it to a different camera setup, as one continuous take would: ";
  s += "SHOT: "+size.name+" ("+size.desc+"), "+angle.label.toLowerCase()+" ("+angle.desc+"), "
     + "on a "+lens.label+" lens ("+lens.desc+")";
  if(sh.move && sh.move!=="static") s += ", camera "+move.label.toLowerCase()+" ("+move.desc+")";
  s += ". ";
  if(subjects.length) s += "IN FRAME: "+subjects.map(c=>c.name).join(" and ")+". ";
  if(sh.action) s += "ACTION: "+sh.action.replace(/\.$/,"")+". ";
  if(sh.dialogue) s += "They are mid-line: “"+sh.dialogue.replace(/^["“]|["”]$/g,"")+"”. ";
  if(sh.composition) s += "COMPOSITION: "+sh.composition.replace(/\.$/,"")+". ";
  s += "EVERYTHING ELSE STAYS IDENTICAL TO THE BASE: the set's architecture, surfaces, signage and layout; "
    + "the light sources and colour grade; every character's face, hair and wardrobe. ";
  s += "If this new angle reveals space not visible in the base frame, extend the SAME set consistently"
    + (loc ? " using the attached location coverage sheet (six views of this ONE set)" : "")+". ";
  s += "Photoreal, filmic, a single 16:9 frame; no text, no watermark, no split panels.";
  const neg = shotNegativePrompt(sh);
  return s + (neg ? (" NEGATIVE (exclude): "+neg) : "");
}
window.deriveShotPrompt = deriveShotPrompt;

/* HEADLESS shot-frame generation — the Scene Director's primitive (no mounted
   card). Mirrors ShotCard's pipeline exactly: derive-from-anchor when the
   scene's key frame exists (fresh sample otherwise), the same reference stack,
   quality "medium", commit + nb-gen-done so any mounted card adopts the result.
   opts: { fresh, correction } — correction is the QC repair instruction. */
async function generateShotFrame(sh, sceneShots, ctx, opts){
  opts = opts || {};
  const anchorSh = (sceneShots||[]).find(s=>s.anchor) || (sceneShots||[])[0] || null;
  const isAnchor = !!(anchorSh && anchorSh.id===sh.id);
  const grab = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
    if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; };
  const base = (!isAnchor && anchorSh && !opts.fresh) ? await grab(anchorSh.id) : "";
  // reference stack (the anchor rides as a reference only when it isn't the base)
  const refs = [];
  if(!base && !isAnchor && anchorSh){ const u=await grab(anchorSh.id); if(u) refs.push({ url:u, note:"scene key frame" }); }
  if(ctx.location){ const u=await grab(ctx.location.id); if(u) refs.push({ url:u, note:(ctx.location.name||"location")+" location coverage sheet (six views of ONE set)" }); }
  for(const id of (sh.subjects||[])){ const c=(ctx.charById||{})[id]; if(!c) continue;
    const u=await grab(id); if(u) refs.push({ url:u, note:c.name+" character sheet" }); }
  let prompt = base ? deriveShotPrompt(sh, ctx) : combinedShotPrompt(sh, ctx);
  if(refs.length) prompt += " Reference images provided, IN ORDER: "+refs.map(r=>r.note).join("; ")
    +". Match the corresponding character(s), location and prop(s) to these reference designs EXACTLY (faces, wardrobe, geometry, materials).";
  if(isAnchor) prompt += " THIS FRAME IS THE SCENE'S KEY FRAME — every other shot in the scene will be derived from it. "
    +"Lock it to the location coverage sheet exactly (ONE real set, six views): its architecture, surfaces, signage and light define the scene's look.";
  if(opts.correction) prompt += " CORRECTIONS (the previous attempt failed visual QC): "+opts.correction.replace(/\.$/,"")+".";
  const gopts = { aspectRatio:"16:9", quality:"medium" };
  if(base) gopts.referenceImage = base;
  if(refs.length) gopts.extraImages = refs.map(r=>r.url);
  const url = await nbGenerate(prompt, gopts);
  const now = new Date();
  const prior = (typeof nbGetMeta==="function") ? (nbGetMeta(sh.id)||{}) : {};
  const meta = { ...prior, mode: base?"base":"final", prompt, director:true,
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
    const parts = full.split(/\s+/).filter(w=>w.length>=3);
    const names = Array.from(new Set([full, ...parts]));
    if(names.some(nm=> nm && t.indexOf(" "+nm+" ")>=0)){ if(ids.indexOf(c.id)<0) ids.push(c.id); }
  });
  return ids;
}
window.scanTextForChars = scanTextForChars;

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

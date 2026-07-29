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
const SHOT_CAMERA_BODIES = [
  { id:"auto", label:"Auto", desc:"let the shot designer infer the capture feel" },
  { id:"cinema", label:"Cinema camera", desc:"high-end digital cinema capture with controlled dynamic range" },
  { id:"film35", label:"35mm film camera", desc:"photochemical 35mm motion-picture capture with organic grain" },
  { id:"largeformat", label:"Large-format camera", desc:"large-format clarity, scale and fine detail" },
  { id:"macro", label:"Macro rig", desc:"specialized macro capture for tiny subjects and surface detail" },
  { id:"handheld", label:"Handheld doc camera", desc:"reactive documentary camera feel" },
  { id:"surveillance", label:"Surveillance / CCTV", desc:"fixed security-camera capture, compressed and observational" },
  { id:"phone", label:"Phone camera", desc:"small-sensor mobile camera capture" },
  { id:"drone", label:"Drone", desc:"aerial camera platform with floating spatial overview" },
];
const SHOT_LENS_TYPES = [
  { id:"auto", label:"Auto", desc:"use the selected basic lens naturally" },
  { id:"spherical", label:"Spherical", desc:"clean spherical cinema lens, natural geometry" },
  { id:"anamorphic", label:"Anamorphic", desc:"wide cinematic lensing, oval bokeh and horizontal flares" },
  { id:"macro", label:"Macro", desc:"close-focus macro optics, extreme surface detail" },
  { id:"telephoto", label:"Telephoto", desc:"compressed planes and isolated subject" },
  { id:"wide", label:"Wide-angle", desc:"expanded space, near objects loom larger" },
  { id:"fisheye", label:"Fisheye", desc:"strong ultra-wide barrel distortion" },
  { id:"tiltshift", label:"Tilt-shift", desc:"selective plane of focus, miniature-like control" },
];
const SHOT_FOCAL_LENGTHS = [
  { id:"auto", label:"Auto", desc:"use the shot's Lens control" },
  { id:"14", label:"14mm", desc:"ultra-wide" },
  { id:"24", label:"24mm", desc:"wide environmental" },
  { id:"35", label:"35mm", desc:"natural wide-normal" },
  { id:"50", label:"50mm", desc:"normal perspective" },
  { id:"85", label:"85mm", desc:"portrait compression" },
  { id:"100macro", label:"100mm macro", desc:"macro close-up optics" },
  { id:"135", label:"135mm", desc:"telephoto compression" },
  { id:"200", label:"200mm", desc:"long telephoto" },
];
const SHOT_APERTURES = [
  { id:"auto", label:"Auto", desc:"infer depth of field from shot size" },
  { id:"f1_4", label:"f/1.4", desc:"very shallow depth of field, dreamy bokeh" },
  { id:"f2", label:"f/2", desc:"shallow cinematic focus" },
  { id:"f2_8", label:"f/2.8", desc:"controlled shallow focus" },
  { id:"f4", label:"f/4", desc:"balanced focus separation" },
  { id:"f5_6", label:"f/5.6", desc:"moderate depth" },
  { id:"f8", label:"f/8", desc:"deep focus" },
  { id:"f11", label:"f/11", desc:"very deep focus" },
];
const SHOT_SHUTTERS = [
  { id:"auto", label:"Auto", desc:"natural motion rendering" },
  { id:"crisp", label:"Crisp action", desc:"high shutter, minimal motion blur" },
  { id:"natural", label:"Natural blur", desc:"standard 180-degree shutter motion blur" },
  { id:"smeared", label:"Smeared motion", desc:"slow shutter, expressive motion smear" },
  { id:"staccato", label:"Staccato", desc:"choppy action, urgent shutter feel" },
];
const SHOT_ISO_GRAIN = [
  { id:"auto", label:"Auto", desc:"infer from the scene style" },
  { id:"clean", label:"Clean", desc:"low-noise, polished capture" },
  { id:"nightgrain", label:"Low-light grain", desc:"night exposure texture and sensor noise" },
  { id:"pushedfilm", label:"Pushed film grain", desc:"coarse pushed-stock grain and contrast" },
  { id:"noisy", label:"Noisy / degraded", desc:"visible noise, rough capture texture" },
];
window.SHOT_SIZES = SHOT_SIZES; window.SHOT_ANGLES = SHOT_ANGLES;
window.SHOT_MOVES = SHOT_MOVES; window.SHOT_LENSES = SHOT_LENSES;
window.SHOT_CAMERA_BODIES = SHOT_CAMERA_BODIES; window.SHOT_LENS_TYPES = SHOT_LENS_TYPES;
window.SHOT_FOCAL_LENGTHS = SHOT_FOCAL_LENGTHS; window.SHOT_APERTURES = SHOT_APERTURES;
window.SHOT_SHUTTERS = SHOT_SHUTTERS; window.SHOT_ISO_GRAIN = SHOT_ISO_GRAIN;

const sizeOf  = (id)=> SHOT_SIZES.find(x=>x.id===id)  || SHOT_SIZES[4];
const angleOf = (id)=> SHOT_ANGLES.find(x=>x.id===id) || SHOT_ANGLES[0];
const moveOf  = (id)=> SHOT_MOVES.find(x=>x.id===id)  || SHOT_MOVES[0];
const lensOf  = (id)=> SHOT_LENSES.find(x=>x.id===id) || SHOT_LENSES[3];
window.shotSizeOf = sizeOf; window.shotAngleOf = angleOf; window.shotMoveOf = moveOf; window.shotLensOf = lensOf;

function shotCameraSettingLabel(list, id){
  return (list.find(x=>x.id===id) || list[0]).label;
}
function shotCameraSettingsClause(sh){
  const c = (sh && sh.cameraSettings) || {};
  const bits = [];
  const add = (label, list, id)=>{ if(id && id!=="auto") bits.push(label+": "+shotCameraSettingLabel(list,id)); };
  add("camera", SHOT_CAMERA_BODIES, c.camera);
  add("lens type", SHOT_LENS_TYPES, c.lensType);
  add("focal length", SHOT_FOCAL_LENGTHS, c.focalLength);
  add("aperture", SHOT_APERTURES, c.aperture);
  add("shutter", SHOT_SHUTTERS, c.shutter);
  add("grain / ISO", SHOT_ISO_GRAIN, c.iso);
  return bits.length ? ("Advanced camera settings — "+bits.join(", ")) : "";
}
function shotHasCameraSettings(sh){
  const c = (sh && sh.cameraSettings) || {};
  return ["camera","lensType","focalLength","aperture","shutter","iso"].some(k=>c[k] && c[k]!=="auto");
}
window.shotCameraSettingsClause = shotCameraSettingsClause;
window.shotHasCameraSettings = shotHasCameraSettings;

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

/* PANEL-SPLIT LOCATION REFERENCE (user idea 2026-07-23): a 2x2 grid confuses the
   image model (it must parse four views at quarter resolution, and sometimes blends
   their geometry). Shots attach ONE panel, cropped client-side from the plate,
   chosen by the shot's grammar — full-frame, unambiguous conditioning. */
function shotLocPanel(sh){
  const size=String((sh&&sh.size)||"").toUpperCase();
  const angle=String((sh&&sh.angle)||"").toLowerCase();
  if(angle==="high"||angle==="top") return { q:1, label:"high-angle three-quarter overview" };
  if(["MCU","CU","ECU","INSERT"].indexOf(size)>=0) return { q:2, label:"key-station close view" };
  return { q:0, label:"wide establishing front view" };
}
window.shotLocPanel = shotLocPanel;
async function shotLocPanelCrop(url, q){
  try{
    const im=await new Promise((res,rej)=>{ const i=new Image(); i.crossOrigin="anonymous";
      i.onload=()=>res(i); i.onerror=()=>rej(new Error("plate load")); i.src=url; });
    const w=im.naturalWidth, h=im.naturalHeight; if(!w||!h) return "";
    const ar=w/h; if(ar<1.55||ar>2.1) return "";   // not a standard 16:9 sheet — ride whole
    const tw=Math.floor(w/2), th=Math.floor(h/2);
    const c=document.createElement("canvas"); c.width=tw; c.height=th;
    c.getContext("2d").drawImage(im,(q%2)*tw,Math.floor(q/2)*th,tw,th,0,0,tw,th);
    return c.toDataURL("image/jpeg",0.92);
  }catch(e){ return ""; }
}
window.shotLocPanelCrop = shotLocPanelCrop;

/* a one-line human label for a shot's grammar, e.g. "MS · Low angle · Push in · 50mm" */
function shotGrammarLabel(sh){
  return [sizeOf(sh.size).label, angleOf(sh.angle).label, moveOf(sh.move).label, lensOf(sh.lens).label].join(" · ");
}
window.shotGrammarLabel = shotGrammarLabel;

/* ---- CLIP SEQUENCES — the Stage hand-off unit ---------------------------------- */
/* A SEQUENCE is a contiguous run of a scene's shots that becomes ONE generated
   video clip (the Stage's video model renders up to ~15 seconds per clip). The
   grouping lives on the shots themselves — an automatic duration estimate
   (shotDur) — so the Shot List,
   the Storyboard's clip boards and the future Stage all read the SAME partition. */
const CLIP_MAX_SECONDS = 15;   // one generated clip's budget (Seedance-class video models)
window.CLIP_MAX_SECONDS = CLIP_MAX_SECONDS;
/* Seedance-class per-clip input caps, researched against the 2.0 API:
   - 3 shots/clip keeps per-shot frames + cast/location/prop refs inside the 9-image
     budget at full resolution (4-5-shot clips force dropping identity references);
   - 3 dialogue lines/clip is the hard audio-reference limit per generation.
   Both are packing DEFAULTS the Stage can override per model (Seedance 2.5's 30s
   single pass will lift them). */
const CLIP_MAX_SHOTS = 3;
const CLIP_MAX_DIALOGUE = 3;
window.CLIP_MAX_SHOTS = CLIP_MAX_SHOTS;
window.CLIP_MAX_DIALOGUE = CLIP_MAX_DIALOGUE;

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
   Packing is always automatic (manual seqBreak grouping was retired).
   AUTO (the default): greedy packing — a new clip starts whenever the next shot
   would push the running clip past the DURATION budget, past the SHOT-COUNT cap
   (default 3 — keeps per-shot frames + identity refs inside Seedance's 9-image
   budget), or past the DIALOGUE cap (default 3 — Seedance's audio-reference
   limit per generation), so spoken beats naturally land in their own small clips.
   `clipMax` (optional) is the format's per-clip budget — clipMaxFor(project).
   `opts` (optional): { maxShots, maxDialogue } — 0/null lifts that cap (a future
   whole-scene model like Seedance 2.5). Returns [{ index, start, shots, dur, over, manual }]. */
function sceneSequences(sceneShots, clipMax, opts){
  const MAX = clipMax || CLIP_MAX_SECONDS;
  const capShots = (opts && "maxShots" in opts) ? (Number(opts.maxShots)>0 ? Number(opts.maxShots) : Infinity) : CLIP_MAX_SHOTS;
  const capDlg = (opts && "maxDialogue" in opts) ? (Number(opts.maxDialogue)>0 ? Number(opts.maxDialogue) : Infinity) : CLIP_MAX_DIALOGUE;
  const list = sceneShots || [];
  if(!list.length) return [];
  // WHOLE-SCENE mode: one clip = the entire scene, ignoring budgets. `over` still
  // flags when the scene runs past the per-clip budget so the console can warn
  // that pacing will compress.
  if(opts && opts.wholeScene){
    const dur = seqDuration(list);
    return [{ index:0, start:0, shots:list.slice(), dur, over: dur>MAX, manual:false }];
  }
  // clips are ALWAYS auto-packed (manual seqBreak hand-grouping was removed with
  // the Shots tab's clip bar — the Shots tab is pure coverage; clips are a Stage
  // concern). Any legacy seqBreak flags on old shots are simply ignored.
  const groups = [];
  {
    let cur=[], t=0, dlg=0;
    list.forEach(s=>{ const d=shotDur(s); const line=!!String(s.dialogue||"").trim();
      if(cur.length && (t+d>MAX || cur.length>=capShots || (line && dlg>=capDlg))){ groups.push(cur); cur=[]; t=0; dlg=0; }
      cur.push(s); t+=d; if(line) dlg++; });
    if(cur.length) groups.push(cur);
  }
  let start=0;
  return groups.map((shots,index)=>{
    const dur = seqDuration(shots);
    const g = { index, start, shots, dur, over: dur>MAX, manual:false };
    start += shots.length;
    return g;
  });
}
window.sceneSequences = sceneSequences;

/* WHOLE-SCENE video prompt — every shot's action + dialogue in chain order, plus
   the camera arc (first→last move) and the scene's grade: ONE prompt for shooting
   the entire scene. Shared by the Shots tab's "Copy video prompt" button and the
   Stage's whole-scene packing mode (the clip console auto-fills with this text). */
function sceneVideoPromptText(scene, sceneShots, opts){
  const list = (typeof sceneShotsOrdered==="function") ? sceneShotsOrdered(sceneShots||[]) : (sceneShots||[]);
  // opts.speakerOf(sh) → name: dialogue is ATTRIBUTED, never a bare trailing quote
  // (a quote right after "…while FLICKER freezes" read as Flicker's line when it
  // was Morwen's — the model needs the speaker named at the quote)
  const speakerOf = (opts && typeof opts.speakerOf==="function") ? opts.speakerOf : null;
  const lines = list.map(sh=>{
    // sh.vidText = per-shot VIDEO description override (Stage Multi-shot editor)
    const t = String(sh.vidText||sh.action||"").trim().replace(/\.+$/,"");
    const d = String(sh.dialogue||"").trim();
    let who = ""; if(d && speakerOf){ try{ who = String(speakerOf(sh)||""); }catch(e){} }
    return t ? (t + "." + (d ? (" "+(who? who.toUpperCase()+": " : "")+'"'+d+'"') : "")) : "";
  }).filter(Boolean);
  if(!lines.length) return "";
  const moves = Array.from(new Set(list.map(sh=> (typeof shotMoveOf==="function") ? shotMoveOf(sh.move).label : (sh.move||"")).filter(Boolean)));
  const loc = opts && opts.location;
  const preset = (opts && opts.project && typeof scenePreset==="function") ? scenePreset(opts.project, scene.id) : null;
  // multi-line for readability: setting, then one line per shot, then camera/grade —
  // video models take newlines fine, and humans can actually review the prompt
  return [
    loc ? ("Setting: "+loc.name+".") : "",
    lines.join("\n"),
    "Camera: "+(moves.length ? moves.join(" → ").toLowerCase() : "static")+".",
    preset ? ("Style: "+preset.name+" — "+String(preset.grade||"").trim()+".") : "",
  ].filter(Boolean).join("\n\n");
}
window.sceneVideoPromptText = sceneVideoPromptText;

/* ---- resolution helpers (scene ▸ location / subjects / props) ----------------- */
function locationForScene(locations, sceneId){
  return (locations||[]).find(l=> Array.isArray(l.scenes) && l.scenes.indexOf(sceneId)>=0) || null;
}
window.locationForScene = locationForScene;

function shotLocationText(sh){
  return [sh&&sh.action, sh&&sh.composition, sh&&sh.dialogue, sh&&sh.directives]
    .filter(Boolean).join(" ").replace(/\s+/g," ").trim();
}
function shotLocationSide(sh, loc, scene, drafts){
  const explicit = String((sh&&sh.locationSide)||"").toUpperCase();
  if(/^(INT|EXT|BOTH)$/.test(explicit)) return explicit;
  const text = shotLocationText(sh).toLowerCase();
  const intHit = /\b(inside|interior|within|booth|room|office|desk|terminal|console|counter|window|glass)\b/.test(text);
  const extHit = /\b(outside|exterior|yard|street|facade|rain|pavement|road|parking|approach)\b/.test(text);
  if(intHit && extHit) return "BOTH";
  if(intHit) return "INT";
  if(extHit) return "EXT";
  const side = String(loc&&loc.intExt||"").toUpperCase();
  if(side==="INT" || side==="EXT") return side;
  return "";
}
function shotLocationCoverageSpecs(loc, sh, scene, drafts){
  if(!loc) return [];
  const _locPanel = (typeof shotLocPanel==="function") ? shotLocPanel(sh) : null;
  const base = { id:loc.id, locPanelQ:(_locPanel?_locPanel.q:null), role:loc.intExt||"",
    note:(loc.name||"location")+" — master location plate seen as its "+(_locPanel?_locPanel.label:"coverage view")+" (one full-frame view)" };
  const sheets = (Array.isArray(loc.coverageSheets) && loc.coverageSheets.length)
    ? loc.coverageSheets
    : ((typeof deriveLocationCoverageSheets==="function") ? deriveLocationCoverageSheets(loc, scene?[scene]:[], drafts||((window.turnContinuity||{}).drafts)||{}) : []);
  if(!sheets.length) return [base];
  const text = shotLocationText(sh).toLowerCase();
  const side = shotLocationSide(sh, loc, scene, drafts);
  const matches = sheets.filter(v=>{
    const role = String(v.role||"").toUpperCase();
    if(side==="BOTH") return true;
    if(side && role && role!==side) return false;
    const words = (v.triggerWords||[]).map(w=>String(w||"").toLowerCase()).filter(Boolean);
    return !words.length || words.some(w=>text.indexOf(w)>=0);
  }).map(v=>({ id:loc.id+"-"+v.id, role:v.role||"", locPanelQ:null,
    note:(v.name||loc.name||"location")+" — screenplay-derived "+(v.role||"INT")+" coverage sheet (one full-frame view)" }));
  const crossBoundary = side==="BOTH" || /\b(through|across|behind|beyond)\s+(?:the\s+)?(glass|window|door|threshold)\b/i.test(text);
  if(!matches.length) return [base];
  if(side==="INT" && !crossBoundary) return matches;
  if(side==="EXT" && !crossBoundary) return [base, ...matches.filter(m=>String(m.role).toUpperCase()==="EXT")].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);
  return [base, ...matches].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i);
}
window.shotLocationSide = shotLocationSide;
window.shotLocationCoverageSpecs = shotLocationCoverageSpecs;

/* ---- SCALE & POV --------------------------------------------------------------
   A character/creature/prop carries a SCALE CLASS that does two jobs: it sets a
   canonical height (for the scale sheet's ruler) AND, more powerfully, it
   recontextualizes how the WORLD is described from that subject's physical point of
   view — a tiny critter sees colossal architecture; a giant sees a fragile diorama.
   The class is the source of truth (A/B/C); `height` is an optional display string.
   This is a third axis, orthogonal to LOOK (Lookbook) and COVERAGE (shot designer). */
const SCALE_CLASSES = {
  A: { id:"A", label:"Human", short:"Human scale",
       ruler:["0cm","50cm","100cm","150cm","180cm","200cm"], rule:"", keywords:[] },
  B: { id:"B", label:"Small / critter", short:"Critter scale",
       ruler:["0cm","2cm","5cm","10cm","20cm","40cm"],
       rule:"GIGANTISM RULE — this subject is tiny, so render the surrounding environment as MASSIVE architecture seen from its point of view: everyday objects become colossal structures (a dewdrop is a massive water sphere, a leaf a leathery emerald canopy).",
       keywords:["towering","colossal","skyscraper-sized","monolithic","cavernous"] },
  C: { id:"C", label:"Massive / giant", short:"Giant scale",
       ruler:["0m","5m","15m","30m","60m","100m"],
       rule:"MINIATURIZATION RULE — this subject is enormous, so render the world as a fragile diorama far below: landscapes become tabletop miniatures (a pine forest is a carpet of moss, a river a silver thread).",
       keywords:["matchbox-sized","lilliputian","miniature","carpet-like","threads"] },
  D: { id:"D", label:"Microscopic / sub-insect", short:"Microscopic scale",
       ruler:["0µm","200µm","400µm","600µm","800µm","1000µm"],
       rule:"EXTREME GIGANTISM RULE — this subject is microscopic, so render the surrounding world as a COLOSSAL molecular / cellular realm seen from within: dust motes become boulders, a single water droplet a vast trembling wall held by surface tension, fibres and pollen grains become towering structures, and the very medium (air, water) becomes a tangible, visible environment.",
       keywords:["molecular","cellular","boulder-sized dust mote","surface-tension wall","fibrous canyon","particulate haze"] },
};
/* the scale class of an entity (character/prop): the explicit field wins; otherwise
   derive a best-effort class from a numeric height, else default to Human. */
function scaleClassOf(entity){
  const raw = String((entity && entity.scaleClass) || "").trim();
  const u = raw.toUpperCase();
  // an explicit "Class X" is the STRONGEST signal — it wins even over a co-occurring descriptor
  // ("Class D · Insect" is D, not B) and can't be a false article match (it requires the word CLASS)
  let m = u.match(/\bCLASS\s*([ABCD])\b/); if(m) return m[1];
  // keyword sense next — so a stray article ("a towering giant") can't be misread as a bare letter
  if(/GIANT|MASSIVE|COLOSSAL|TITAN|KAIJU|MECH|MONSTER|HUGE|TOWERING/.test(u)) return "C";
  if(/MICROSCOPIC|MICRO\b|MICRON|CELLULAR|MICROBE|BACTERIA|NANO|SUB.?INSECT|MITE|AMOEBA|PLANKTON|MOLECULAR/.test(u)) return "D";
  if(/CRITTER|TINY|SMALL|INSECT|BUG|MINIATURE|MOUSE|FAIRY|SPRITE|PIXIE/.test(u)) return "B";
  if(/HUMAN|STANDARD|NORMAL|PERSON|REGULAR/.test(u)) return "A";
  // the whole value IS a bare class letter — "B", "B (critter)", "C - giant", "A:"
  m = u.match(/^([ABCD])(\s*[(\-:].*)?$/); if(m) return m[1];
  // numeric height fallback — convert to cm understanding µm / mm / m units (default cm)
  const hs = String(entity && (entity.heightCm||entity.height) || "");
  const h = Number(hs.replace(/[^\d.]/g,""));
  if(h){ const isUm=/(µ|μ|micron|micromet|\bum\b)/i.test(hs), isMM=/mm|millimet/i.test(hs),
           isM=/(\d\s*m\b|metre|meter)/i.test(hs) && !/cm/i.test(hs) && !isMM && !isUm;
    const cm = isUm ? h*0.0001 : isMM ? h*0.1 : isM ? h*100 : h;
    if(cm < 0.1) return "D"; if(cm < 60) return "B"; if(cm > 300) return "C"; return "A"; }
  return "A";
}
function scaleInfoOf(entity){ return SCALE_CLASSES[scaleClassOf(entity)] || SCALE_CLASSES.A; }
function scaleMeasurementOf(entity){
  const raw = String(entity && (entity.height||entity.heightCm||entity.scale||"") || "").replace(/\s+/g," ").trim();
  const mm = (typeof heightMMOf==="function") ? heightMMOf(entity) : 0;
  if(mm>0){
    if(mm<1) return (Math.round((mm*1000)*10)/10)+" µm";
    if(mm>=1000) return (Math.round((mm/1000)*100)/100)+" m";
    if(mm>=100) return (Math.round((mm/10)*10)/10)+" cm";
    return (Math.round(mm*10)/10)+" mm";
  }
  return raw;
}
function canonicalScaleLabel(entity){
  const bits = [];
  if(entity && entity.name) bits.push(entity.name);
  const h = scaleMeasurementOf(entity);
  if(h) bits.push(h);
  bits.push(scaleInfoOf(entity).short);
  return bits.join(" — ");
}
function relativeHeightSentence(a,b){
  const ah = (typeof heightMMOf==="function") ? heightMMOf(a) : 0;
  const bh = (typeof heightMMOf==="function") ? heightMMOf(b) : 0;
  if(!(ah>0 && bh>0)) return "";
  const taller = ah>=bh ? a : b, shorter = ah>=bh ? b : a;
  const th = Math.max(ah,bh), sh = Math.min(ah,bh);
  const ratio = th/sh;
  const pct = Math.round((sh/th)*100);
  const rn = Math.round(ratio*10)/10;
  return (taller.name||"The taller subject")+" must read about "+rn+"× taller than "+(shorter.name||"the shorter subject")+
    "; "+(shorter.name||"the shorter subject")+" is about "+pct+"% of "+(taller.name||"the taller subject")+"'s height.";
}
function firstMeasurementText(text){
  const s = String(text||"").replace(/\s+/g," ").trim();
  const m = s.match(/(?:~|about|approx(?:imately)?\s*)?(\d+(?:\.\d+)?)\s*(µm|μm|um|microns?|micromet(?:er|re)s?|mm|millimet(?:er|re)s?|cm|centimet(?:er|re)s?|m|met(?:er|re)s?)\b/i);
  if(!m) return "";
  const unit = m[2].toLowerCase();
  const pretty = /^(µm|μm|um|micron|microns|micrometer|micrometre|micrometers|micrometres)$/.test(unit) ? "µm"
    : /^mm|millimet/.test(unit) ? "mm"
    : /^cm|centimet/.test(unit) ? "cm"
    : "m";
  return m[1]+" "+pretty;
}
function propPhysicalScaleLabel(p){
  if(!p) return "";
  const clean = (x)=>String(x||"").replace(/\s+/g," ").trim().replace(/\.$/,"");
  const bits = [];
  if(p.name) bits.push(p.name);
  // the size FIELD carries the full dimension set ("~1.2 m tall × ~60 cm wide × ~45 cm
  // deep") — pass it through VERBATIM so no axis is lost; only fall back to scanning
  // prose for a first measurement when the field is empty
  const sizeField = clean(p.size || p.dimensions || "");
  const explicit = (sizeField && firstMeasurementText(sizeField))
    ? sizeField
    : firstMeasurementText([p.scale, p.form, p.material, p.detail].filter(Boolean).join(" "));
  if(explicit) bits.push("described size "+explicit);
  if(p.kind==="worn") bits.push("worn true-to-body scale"+(p.ownerName?(" on "+p.ownerName):""));
  else if(p.kind==="carried" || p.ownerName) bits.push("handheld/carried scale"+(p.ownerName?(" for "+p.ownerName):""));
  else bits.push("environment/set-dressing scale");
  // owner-relative proportions ("hangs to mid-thigh") — keeps the object its size next
  // to its owner in shots; skipped when it merely repeats the size field
  const relScale = clean(p.scale);
  if(relScale && relScale!==explicit) bits.push((p.ownerName?("against "+p.ownerName+"'s body: "):"")+relScale);
  const form = (typeof clipWords==="function") ? clipWords(clean(p.form),90) : clean(p.form).slice(0,90);
  if(form && !explicit) bits.push(form);
  return bits.join(" — ");
}
/* SHOT-LEVEL ATTACH POLICY for SET-DRESSING sheets. The location plate is the canonical
   carrier for fixtures — it shows them in context at true scale — so a dressing sheet
   only rides as a reference image when the plate can't do the job: a TIGHT shot
   (CU/MCU/ECU/INSERT) or the object being what the action is ABOUT (named in the
   action's first clause). Wides and mediums trust the plate — one canon per fixture,
   no two-designs conflict, no wasted reference slot. Worn/carried props are untouched.
   Used by buildShotPrompt (image-map labels), collectShotRefs and generateShotFrame
   (real attachments) — all three MUST apply it identically or labels mislabel files. */
function shotPropAttachable(p, sh){
  if(!p) return false;
  // WORN items: the owner's character sheet is their canon in wides/mediums (they
  // ride as TEXT there). An optional per-card CLOSE-UP sheet attaches ONLY when the
  // item reads large (CU/MCU/ECU/INSERT) AND that sheet has actually been generated.
  // Existence is checked on the SYNC cache so the prompt's numbered image map and
  // the async attach paths always agree (cold cache = consistently skipped).
  if(p.kind==="worn"){
    if(!/^(CU|MCU|ECU|INSERT)$/i.test(String((sh&&sh.size)||""))) return false;
    try{ return !!(typeof nbGetImage==="function" && nbGetImage(p.id)); }catch(e){ return false; }
  }
  if(p.kind!=="dressing") return true;
  // SHELL GUARD (before the tight-shot rule): never attach an object's EXTERIOR sheet
  // to a shot filmed INSIDE it — when the scene's location is marked "Interior of"
  // this prop, the plate is canon (an exterior reference would invite the generator
  // to put the whole object in frame).
  try{
    const C = window.turnContinuity || {};
    const loc = locationForScene(C.locations||[], sh && sh.sceneId);
    if(loc && loc.interiorOfPropId === p.id) return false;
  }catch(e){}
  // TIGHT SHOTS keep the dressing sheet: at CU/MCU magnification a background object
  // reads LARGE, and the plate's small distant depiction can't hold its design — the
  // sheet's detail is needed. Wides rely on the plate (it renders dressing in place).
  if(/^(CU|MCU|ECU|INSERT)$/i.test(String((sh&&sh.size)||""))) return true;
  /* SUBJECT test — in-frame props are derived from the action text, so "named in the
     action" is true for every prop that gets here; what marks the shot as ABOUT the
     object is the object LEADING the action ("The hollow log splits open…") rather
     than a character leading it ("Flicker creeps past the hollow log…"). */
  const act = " "+String((sh&&sh.action)||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ")+" ";
  const words = String(p.name||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(w=>w.length>2);
  if(!words.length) return false;
  const idxs = words.map(w=>act.indexOf(" "+w+" "));
  if(idxs.some(i=>i<0)) return false;
  const objAt = Math.min.apply(null, idxs);
  const chars = ((window.turnContinuity||{}).characters)||[];
  const before = act.slice(0, objAt);
  const charLeads = chars.some(c=>{
    const n = String((c&&c.name)||"").toLowerCase().split(/\s+/)[0];
    return n && n.length>2 && before.indexOf(" "+n)>=0;
  });
  return !charLeads;
}
window.shotPropAttachable = shotPropAttachable;

function shotObjectScaleClause(subjects, props, loc){
  const cast = (subjects||[]).filter(Boolean);
  const pr = (props||[]).filter(Boolean);
  if(!cast.length && !pr.length && !loc) return "";
  const classes = [...new Set(cast.map(scaleClassOf))];
  const cls = classes.filter(c=>c!=="A")[0] || "";
  const measured = cast.map(c=>({ c, mm:(typeof heightMMOf==="function") ? heightMMOf(c) : 0 })).filter(x=>x.mm>0).sort((a,b)=>a.mm-b.mm);
  const range = measured.length
    ? (" visible character height range "+scaleMeasurementOf(measured[0].c)+"–"+scaleMeasurementOf(measured[measured.length-1].c))
    : "";
  const bits = [];
  if(loc){
    let env = "the "+(loc.name||"location")+" plate is the canonical environment scale; its architecture, floor plane, plants, bark, droplets, furniture, set dressing and surface textures must keep their own physical proportions";
    if(cls==="B") env += " and read gigantic around critter-scale bodies"+range;
    else if(cls==="D") env += " and read as a colossal particulate/cellular world around microscopic bodies"+range;
    else if(cls==="C") env += " and read miniature beneath giant-scale bodies"+range;
    bits.push(env);
  }
  if(pr.length) bits.push("prop scales: "+pr.map(propPhysicalScaleLabel).join("; "));
  if(!bits.length) return "";
  return "OBJECT / ENVIRONMENT SCALE CONTINUITY — "+bits.join(". ")+
    ". Do NOT resize props, set dressing, plants, droplets, architecture, floor texture or environmental assets to make the composition easier; stage the camera instead so every object remains physically consistent with the characters and location.";
}
/* The dynamic scale directive for a SHOT, given the cast in frame. All-human → "" (no
   rewrite, inert). One non-human class → that class's world rewrite. MIXED classes in
   one frame → relative-scale phrasing (don't apply a single POV; show their size gap). */
function shotScaleClause(subjects, props){
  const list = (subjects||[]).filter(Boolean);
  if(!list.length) return "";
  const classes = [...new Set(list.map(scaleClassOf))];
  const nonHuman = classes.filter(c=>c!=="A");
  const measured = list.map(c=>({ c, mm:(typeof heightMMOf==="function") ? heightMMOf(c) : 0 })).filter(x=>x.mm>0).sort((a,b)=>b.mm-a.mm);
  const heightLine = measured.length
    ? " Canonical heights in this frame: "+measured.map(x=>canonicalScaleLabel(x.c)).join("; ")+"."
    : "";
  const relLine = measured.length>=2 ? (" "+relativeHeightSentence(measured[0].c, measured[measured.length-1].c)) : "";
  const propLine = (props||[]).filter(Boolean).length
    ? " Keep nearby props and set dressing at the same physical scale as the location; characters must not resize to match prop framing."
    : "";
  if(!nonHuman.length){
    if(measured.length>=2) return "SCALE CONTINUITY — preserve the cast's relative heights exactly."+heightLine+relLine+" Do NOT normalize characters to the same eye-line or same head size."+propLine;
    return "";
  }
  if(classes.length>1){
    const named = list.map(c=> (c.name||"a figure")+" ("+scaleInfoOf(c).short+")").join(", ");
    return "SCALE CONTINUITY — the subjects differ in scale ("+named+")."+heightLine+relLine+" Render their RELATIVE sizes faithfully (the larger truly dwarfing the smaller); do NOT normalize them to the same height, eye-line or head size."+propLine;
  }
  const info = SCALE_CLASSES[nonHuman[0]];
  if(measured.length>=2){
    return "SCALE CONTINUITY — all visible subjects share "+info.short+", but their individual heights still matter."+heightLine+relLine+
      " Preserve this size gap within the same shot; do NOT normalize them to the same height, eye-line or head size. "+info.rule+" Lean on words like "+info.keywords.join(", ")+". "+propLine;
  }
  return "SCALE / POV — "+heightLine+" "+info.rule+" Lean on words like "+info.keywords.join(", ")+".";
}
/* HEIGHT-AWARE measurement ruler for a scale sheet. The figure must read against the bar, so
   the markings span ~0 to a bit above the character's ACTUAL height, in the right unit
   (mm/cm/m) — a 14 mm insect gets a 0–20 mm ruler, not the coarse 0–40 cm class default.
   Falls back to the class ruler only when no height is parseable. Returns label strings. */
// normalise a character's height to MILLIMETRES (0 if not parseable). Unit is read from the
// text; with no unit it's guessed from the scale class (giant→m, critter→mm, human→cm).
function heightMMOf(entity){
  const hs = String((entity && (entity.height||entity.heightCm)) || "").trim();
  const num = parseFloat(hs.replace(/[^0-9.]/g,"")); if(!(isFinite(num) && num>0)) return 0;
  const cls = scaleClassOf(entity);
  if(/µm|μm|micron|micromet|\bum\b/i.test(hs)) return num*0.001;
  if(/mm|millimet/i.test(hs)) return num;
  if(/cm|centimet/i.test(hs)) return num*10;
  if(/\d\s*m\b|metre|meter/i.test(hs)){
    // Explicit scale class wins over a bad/over-generic height unit from drafting.
    // A Class B critter must never receive a metre ruler because its height text says
    // "2.5 m"; ignore that invalid unit and fall back to the class ruler instead.
    if(cls==="B" || cls==="D") return 0;
    return num*1000;
  }
  return cls==="C" ? num*1000 : cls==="D" ? num*0.001 : cls==="B" ? num : num*10;
}
function scaleRulerFor(entity){
  const cls = scaleClassOf(entity);
  const mm = heightMMOf(entity);
  if(mm>0){
    const niceCeil=(x)=>{ if(x<=0) return 1; const p=Math.pow(10,Math.floor(Math.log10(x))); for(const m of [1,2,2.5,5,10]){ if(p*m>=x) return p*m; } return p*10; };
    const topMM = niceCeil(mm*1.2);                          // a little headroom above the figure
    let unit, div;
    if(cls==="B"){
      if(topMM>=1){ unit = topMM>=100 ? "cm" : "mm"; div = topMM>=100 ? 10 : 1; }
      else { unit="µm"; div=0.001; }
    } else if(cls==="D"){
      unit="µm"; div=0.001;
    } else if(topMM>=1000){ unit="m"; div=1000; } else if(topMM>=100){ unit="cm"; div=10; } else if(topMM>=1){ unit="mm"; div=1; } else { unit="µm"; div=0.001; }
    const ticks=[]; for(let i=0;i<=5;i++){ let v=Math.round((topMM*i/5)/div*100)/100; ticks.push(v+unit); }
    return ticks;
  }
  return ((window.SCALE_CLASSES&&window.SCALE_CLASSES[cls])||SCALE_CLASSES.A).ruler;
}
window.heightMMOf = heightMMOf; window.scaleRulerFor = scaleRulerFor;
window.scaleMeasurementOf = scaleMeasurementOf; window.canonicalScaleLabel = canonicalScaleLabel;
window.propPhysicalScaleLabel = propPhysicalScaleLabel; window.shotObjectScaleClause = shotObjectScaleClause;
// Environment-scale directive for a LOCATION plate, keyed to its occupants' scale class.
// B → render the SPACE itself at critter scale (gigantism); C → at giant scale. A → "" (inert).
// This is the location-side counterpart to shotScaleClause (which works on in-frame subjects).
function worldScaleClause(cls){
  if(cls==="B") return "CRITTER SCALE — render this as a colossal, cavernous space exactly as a tiny insect-sized inhabitant (a couple of centimetres tall) would experience it: ordinary natural features (bark grain, a knot-hole, moss, a fallen leaf, a dewdrop) read as TOWERING architecture, landmarks and furniture at that scale; the whole space is built for and seen by something tiny.";
  if(cls==="C") return "GIANT SCALE — render this as a vast expanse seen by an enormous, building-sized inhabitant: the ordinary world reads as a fragile MINIATURE diorama far below — structures matchbox-sized, paths like threads.";
  if(cls==="D") return "MICROSCOPIC SCALE — render this as a vast molecular / cellular realm seen by a microscopic inhabitant: dust motes read as boulders, a single water droplet as a towering trembling wall held by surface tension, fibres and pollen grains as colossal structures, and the very medium (air, water) becomes a visible, tangible environment.";
  return "";
}
window.SCALE_CLASSES = SCALE_CLASSES; window.scaleClassOf = scaleClassOf;
window.scaleInfoOf = scaleInfoOf; window.shotScaleClause = shotScaleClause; window.worldScaleClause = worldScaleClause;

/* The SCALE SHEET prompt (the user's "height chart" / Option A): a full-body front view
   beside a vertical ruler whose markings come from the entity's scale class. Built from the
   character's body + texture + height; rendered FROM the master sheet so identity matches. */
function buildScaleSheetPrompt(c){
  const info = scaleInfoOf(c);
  const clean = (x)=>String(x||"").replace(/\s+/g," ").trim().replace(/\.$/,"");
  const body = clean(c && (c.coreBody||c.look)) || "the character";
  const tex  = clean(c && c.materialTexture);
  const ht   = clean(c && c.height);
  const ruler = ((typeof scaleRulerFor==="function") ? scaleRulerFor(c) : info.ruler).join(", ");
  const cls = scaleClassOf(c);
  const unitRule = cls==="B"
    ? "CRITTER SCALE: the ruler must use millimetres or centimetres only; NEVER use metres or an 'm' unit. "
    : cls==="D"
      ? "MICROSCOPIC SCALE: the ruler must use micrometres (µm) only; NEVER use mm, cm, metres or an 'm' unit. "
      : cls==="C"
        ? "GIANT SCALE: metre markings are allowed. "
        : "";
  return "A full-body FRONT view of "+body+(tex?(", "+tex):"")+". "
    + (ht?("The figure is "+ht+" tall. "):"")
    + "They stand in a relaxed, neutral pose, head to toe fully in frame, against a solid light-grey studio background, "
    + "directly beside a VERTICAL measurement bar positioned on the LEFT edge. "
    + unitRule+"The bar strictly displays height markings for "+ruler+" in clear black text. "
    + "Soft, even studio lighting, sharp focus. No text anywhere except the ruler's numeric markings.";
}
window.buildScaleSheetPrompt = buildScaleSheetPrompt;

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

/* ---- the SHOT's RENDER STYLE. Shots composite the Art Room sheets, so the frame
   must speak the SAME language those sheets were rendered in — a hardcoded photoreal
   spine on top of Pixar/anime sheets makes the model fight its own references.
   Resolution: majority vote across the in-frame cast's style (explicit pick or the
   inferred default), then the location's picked style, then photoreal. Tuned shot
   phrasings for the photoreal family; every other style (incl. locked 🔒 and admin 🌐
   styles) falls back to its own registry descriptor, so a new style works here from
   one definition — same pattern as renderStyleText(). ---- */
const SHOT_RENDER_TEXT = {
  photoreal:           "Cinematic live-action photorealistic still",
  photorealNatural:    "Cinematic photorealistic natural-history still — real biological macro realism, believable creature-scale world",
  photorealCreature:   "Cinematic live-action photorealistic still — practical-effects / VFX creature-film realism",
  photorealOrnamental: "Cinematic live-action photorealistic still — ornamental couture creature-world production design",
  horror:              "Cinematic live-action photorealistic horror still — deep filmic blacks",
};
window.SHOT_RENDER_TEXT = SHOT_RENDER_TEXT;
function shotRenderStyleKey(subjects, loc){
  const keys = [];
  (subjects||[]).forEach(c=>{ if(!c) return;
    const k = (typeof inferCharacterRenderStyleKey==="function") ? inferCharacterRenderStyleKey(c) : (c.renderStyleKey||"");
    if(k) keys.push(k); });
  if(!keys.length && loc && loc.renderStyleKey && loc.renderStyleKey!=="surprise") keys.push(loc.renderStyleKey);
  if(!keys.length) return "photoreal";
  const tally = {}; let best = keys[0], n = 0;
  keys.forEach(k=>{ tally[k]=(tally[k]||0)+1; if(tally[k]>n){ n=tally[k]; best=k; } });
  return best;
}
window.shotRenderStyleKey = shotRenderStyleKey;
function shotStyleIsPhotoreal(key){ return /^(photoreal|horror)/.test(String(key||"photoreal")); }
function shotRenderStyleLine(key, subjects){
  if(SHOT_RENDER_TEXT[key]) return SHOT_RENDER_TEXT[key];
  if(key==="surprise"){
    const c = (subjects||[]).find(x=>x && x.surpriseRender && x.surpriseRender.render && x.surpriseRender.render.rendering);
    if(c) return "Cinematic still in the film's locked render style: "+String(c.surpriseRender.render.rendering).replace(/\bcharacter\b/gi,"scene");
  }
  const cs = (window.CHAR_RENDER_STYLES||{})[key];
  if(cs && cs.rendering) return "Cinematic still in the film's locked render style: "+String(cs.rendering).replace(/\bcharacter\b/gi,"scene");
  return SHOT_RENDER_TEXT.photoreal;
}
window.shotRenderStyleLine = shotRenderStyleLine;

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
  const propsAll = ((typeof inFrameProps==="function") ? inFrameProps(sh, scene, charById, propById) : (sh.props||[])).map(id=>propById[id]).filter(Boolean);
  // ATTACHED prop sheets (the image-map entries): dressing sheets ride only on tight
  // shots / when the object is the action's subject — wides trust the plate. The SCALE
  // clauses below still see propsAll: an in-plate fixture stays scale-constrained.
  // WORN items ride as TEXT by default (their canon is the owner's character sheet
  // — numbering them once produced prompts naming "Image 5..13" with 4 files
  // attached). EXCEPTION: a worn item with a generated CLOSE-UP sheet on a tight
  // shot IS attached — shotPropAttachable owns that rule for prompt + attach alike.
  const wornProps = propsAll.filter(p=> p.kind==="worn" && !shotPropAttachable(p, sh));
  const props    = propsAll.filter(p=> shotPropAttachable(p, sh));
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
  // the opening line follows the CAST/LOCATION's picked render style — not hardcoded
  // photoreal — so frames come out in the same language as the sheets they composite
  const _styleKey = shotRenderStyleKey(subjects, loc);
  const _styleLine = shotRenderStyleLine(_styleKey, subjects);
  const spine = [];
  spine.push(_styleLine + ((preset && clean(preset.texture)) ? (", "+clean(preset.texture))
    : (shotStyleIsPhotoreal(_styleKey) ? ", subtle 35mm film grain" : "")));
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
  const cameraSettings = (typeof shotCameraSettingsClause==="function") ? clean(shotCameraSettingsClause(sh)) : "";
  if(cameraSettings) stage.push(cameraSettings);
  if(clean(sh.action))      stage.push(cap(clean(sh.action)));
  if(clean(screenDir.composition)) stage.push(cap(clean(screenDir.composition)));
  if(clean(screenDir.clause)) stage.push(clean(screenDir.clause));
  // the director's OWN words (the card's Director's-notes field): appended as their
  // own clause so they COMPOSE with the derived prompt, never replacing any part of it
  if(clean(sh.directives)) stage.push("DIRECTOR'S NOTES (binding): "+clean(sh.directives));
  const _depth = (typeof shotFramingClause==="function") ? clean(shotFramingClause(loc, sh.size)) : "";
  if(_depth) stage.push(_depth);
  // SCALE / POV — when an in-frame subject isn't human-scale, recontextualize the world
  // from its perspective (gigantism / miniaturization), or render relative scale for a
  // mixed-scale frame. All-human frames add nothing (inert).
  const _scale = (typeof shotScaleClause==="function") ? shotScaleClause(subjects, propsAll) : "";
  if(_scale) stage.push(_scale);
  const _objectScale = (typeof shotObjectScaleClause==="function") ? shotObjectScaleClause(subjects, [...propsAll, ...((ctx.carriedForward)||[])], loc) : "";
  if(_objectScale) stage.push(_objectScale);
  // SCENE LOOK-AHEAD — stage for what's COMING (user ruling 2026-07-18): this frame
  // (especially the chain HEAD that seeds every later frame) must accommodate what
  // later beats of the same continuous scene will need — fixtures a later beat uses
  // (the till), objects that change hands (the groceries), characters who enter or
  // queue. Derived from the LATER shots' own action text; guidance only — the clause
  // forbids depicting later people/actions in THIS frame.
  const later = Array.isArray(ctx.laterShots) ? ctx.laterShots : [];
  if(later.length){
    const curCast = new Set(subjects.map(c=>c.id));
    const curProps = new Set(propsAll.map(p=>p.id));
    const upProps=[], upCast=[], seenP=new Set(), seenC=new Set();
    later.forEach(ls=>{
      ((typeof inFrameProps==="function") ? inFrameProps(ls, scene, charById, propById) : (ls.props||[])).forEach(pid=>{
        if(curProps.has(pid)||seenP.has(pid)) return; seenP.add(pid);
        const pp=propById[pid]; if(pp) upProps.push(pp); });
      ((typeof inFrameCast==="function") ? inFrameCast(ls, scene, _chars) : (ls.subjects||[])).forEach(cid=>{
        if(curCast.has(cid)||seenC.has(cid)) return; seenC.add(cid);
        const cc=charById[cid]; if(cc) upCast.push(cc); });
    });
    const bits=[];
    if(upProps.length) bits.push("these objects/fixtures: "+upProps.slice(0,6).map(pp=>pp.name+(pp.kind==="dressing"?" (part of the set)":"")).join("; ")+(upProps.length>6?" (and more)":""));
    if(upCast.length) bits.push(upCast.slice(0,3).map(cc=>cc.name).join(" and ")+" entering or queuing into this space");
    if(bits.length) stage.push("SCENE CONTINUITY \u2014 STAGE FOR WHAT'S COMING: later beats of this same continuous scene will show "
      + bits.join("; and ")
      + ". Compose THIS frame so the space accommodates them \u2014 the relevant counter/fixtures visible or clearly implied, objects staged where the action will find them, open room where the later blocking happens \u2014 but depict ONLY this beat's own action and people, nothing from later beats");
  }
  // WHO IS IN FRAME — EXCLUSIVE: name the count so an attached reference face with
  // no staged action can never become an invented extra figure. Skipped when the
  // action itself stages unnamed people (a crowd, punters, customers).
  const _crowdRx = /\b(crowd|crowds|punters?|customers?|bystanders?|passers|pedestrians?|queue|onlookers?|mob|patrons?|strangers?|extras)\b/i;
  if(subjects.length && !_crowdRx.test(String(sh.action||"")+" "+String(sh.composition||""))){
    stage.push("Exactly "+subjects.length+" "+(subjects.length===1?"person":"people")+" in frame — ONLY "
      + subjects.map(c=>c.name).join(" and ")+"; no bystanders, no extras, no additional figures");
  }
  // FIRST-FRAME BIAS: this still seeds the beat's VIDEO clip, so stage its opening
  // instant, not its peak — and never freeze a mouth mid-vowel (bad start frame,
  // bad lip-sync anchor; the audio drives the mouth once the clip moves).
  stage.push("Stage the beat's OPENING instant — the action just beginning, not its peak; this frame starts the moving clip");
  const _dlg = clean(sh.dialogue).replace(/^["“]|["”]$/g,"");
  if(_dlg) stage.push('About to speak — face engaged, lips just parting for "'+_dlg+'", not frozen mid-vowel');
  const STAGING = stage.join(". ") + ".";

  // ---- THE NUMBERED IMAGE MAP (the FIRST thing in the prompt) — tells the generator
  // which attached file is which, BY POSITION. The order MUST mirror the real attachment
  // order in collectShotRefs (shots-ui.jsx) and generateShotFrame: the seed (previous
  // approved frame) leads as Image 1 when present, then the sheets by location weight
  // (wide → set first; tight → cast first), then props, then carried-forward. ----
  const imgs = [];
  if(ctx.prevFrameRole) imgs.push("the PREVIOUS approved frame — carry its colour grade, lighting and every established physical state (wardrobe wear, wetness, dirt, damage) forward exactly, but do NOT copy its framing");
  // user-unticked reference sheets (sh.refOff) drop out of the image map ONLY — the
  // entity stays in the staging text; just its sheet isn't attached (labels must
  // mirror the real attachment list or the numbered map mislabels the files)
  const _refOff = (sh && Array.isArray(sh.refOff)) ? sh.refOff : [];
  const _locSpecs = (typeof shotLocationCoverageSpecs==="function") ? shotLocationCoverageSpecs(loc, sh, scene, (window.turnContinuity||{}).drafts||{}) : [];
  const _locLabels = _locSpecs.filter(s=>_refOff.indexOf(s.id)<0).map(s=>s.note+" — "
    + (locWeight==="ambient" ? "a background reference for the grade and surfaces only; the character fills this tight frame" : "reproduce its architecture, surfaces, fixtures, sightlines and signage exactly"));
  const _castLabels = subjects.filter(c=>_refOff.indexOf(c.id)<0).map(c=> {
    const scale = (typeof canonicalScaleLabel==="function") ? canonicalScaleLabel(c) : (c.name||"character");
    return c.name+"'s character sheet — match the face, build, hair and wardrobe exactly; canonical scale: "+scale;
  });
  // STATE-AWARE prop labels: when a prop's ACTIVE appearance state (story-order ≤ this
  // scene) has a generated variant sheet, that variant is what attaches — the label must
  // name the state so the numbered map matches the file (shotPropSheetId, sync-cache rule)
  const _storyScenes = (ctx.scenes || ((window.turnContinuity||{}).scenes) || []);
  // CUSTODY-AWARE holder: who actually holds the object in THIS scene (custodyOwnerAt —
  // same story-order rule as appearance states). A handover names the new holder and
  // orders the established design + accumulated wear preserved.
  const _custodyBit = (p, co)=>{ if(!co || !co.handover) return "";
    const hoSc = _storyScenes.find(s=>s.id===co.handover.fromSceneId);
    return " — passed to "+co.name+(hoSc && hoSc.no!=null ? (" at Sc "+hoSc.no) : "")+"; keep its established design and accumulated wear"; };
  const _propLabels = props.filter(p=>_refOff.indexOf(p.id)<0).map(p=> {
    const scale = (typeof propPhysicalScaleLabel==="function") ? propPhysicalScaleLabel(p) : (p.name||"prop");
    const so = (typeof shotPropSheetId==="function") ? shotPropSheetId(p, scene, _storyScenes) : { id:p.id, state:null };
    const co = (typeof custodyOwnerAt==="function") ? custodyOwnerAt(p, scene, _storyScenes) : { name:p.ownerName, handover:null };
    const holder = co.name || p.ownerName;
    return "the "+p.name+" (prop sheet"+(so.state?(", "+so.state.label+" state"):"")+(holder?(", "+((p.kind==="worn")?"worn by ":"carried by ")+holder):"")+")"+_custodyBit(p, co)+" — match it exactly as designed; physical scale: "+scale;
  });
  const _carriedLabels = (ctx.carriedForward||[]).filter(p=>_refOff.indexOf(p.id)<0).map(p=> {
    const scale = (typeof propPhysicalScaleLabel==="function") ? propPhysicalScaleLabel(p) : (p.name||"prop");
    const so = (typeof shotPropSheetId==="function") ? shotPropSheetId(p, scene, _storyScenes) : { id:p.id, state:null };
    const co = (typeof custodyOwnerAt==="function") ? custodyOwnerAt(p, scene, _storyScenes) : { name:p.ownerName, handover:null };
    const holder = co.name || p.ownerName;
    return "the "+p.name+" (prop sheet"+(so.state?(", "+so.state.label+" state"):"")+(holder?(", "+((p.kind==="worn")?"worn by ":"carried by ")+holder):"")+")"+_custodyBit(p, co)+" — still in frame from an earlier beat; keep it present, matching its sheet; physical scale: "+scale;
  });
  if(locWeight==="ambient"){ _castLabels.forEach(l=>imgs.push(l)); _locLabels.forEach(l=>imgs.push(l)); }
  else { _locLabels.forEach(l=>imgs.push(l)); _castLabels.forEach(l=>imgs.push(l)); }
  _propLabels.forEach(l=>imgs.push(l));
  _carriedLabels.forEach(l=>imgs.push(l));
  let MAP = imgs.length
    ? ("Compose a new cinematic still. " + imgs.map((m,i)=>"Image "+(i+1)+" is "+m+".").join(" "))
    : "Compose a new cinematic still.";
  if(wornProps.length){
    MAP += " Worn items have no separate sheets — each is part of its owner's character sheet and must match exactly as designed there: "
      + wornProps.map(p=> p.name+" (on "+(p.ownerName||"its owner")+")").join("; ")+".";
  }
  if(_locLabels.length){
    MAP += " If the framing crosses between attached location views, preserve the exact threshold/sightline relationship between them; otherwise extend the SAME set consistently from the attached view.";
  }

  // ---- ASSEMBLE: image map, then the style spine, then the staging line, then constraints ----
  let out = MAP + "\n\n" + STYLE_SPINE + "\n\n— " + STAGING;
  out += "\n\nConstraints: " + shotNegativePrompt(sh, _styleKey) + ".";
  return out;
}
window.buildShotPrompt = buildShotPrompt;

/* the negative prompt for a shot frame */
function shotNegativePrompt(sh, styleKey){
  if(sh && sh.negativePrompt) return sh.negativePrompt;
  // "not a cartoon" only guards PHOTOREAL frames — on a stylized film (Pixar, anime,
  // flat…) it would fight the very look the sheets were rendered in
  return "no text, no captions, no watermark, no logo, no split-screen, no grid, no collage, "
    + "no contact sheet, "
    + (shotStyleIsPhotoreal(styleKey||"photoreal") ? "not a cartoon, " : "")
    + "no extra fingers, no deformed anatomy, no duplicate people";
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
    // the director's OWN words (authored on the card): they COMPOSE with the
    // derived spec — never replace it — and survive every prompt re-derive
    custom_directives: clean(sh.directives) || undefined,
    keep_identical_to_base: [
      "the set's architecture, surfaces, signage and layout",
      "the light sources and colour grade",
      "every character's face, hair and wardrobe",
    ],
    if_new_space_revealed: "extend the SAME set consistently"+(loc?" from the attached location view — it is one angle of ONE real set":""),
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
  const _ep = (typeof nbEpoch==="function") ? nbEpoch() : null;   // asset scope at generation start
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
  const _locPanel = (ctx.location && typeof shotLocPanel==="function") ? shotLocPanel(sh) : null;
  const locSpec  = ctx.location
    ? ((typeof shotLocationCoverageSpecs==="function")
      ? shotLocationCoverageSpecs(ctx.location, sh, ctx.scene, (window.turnContinuity||{}).drafts||{})
      : [{ id:ctx.location.id, locPanelQ:(_locPanel?_locPanel.q:null),
        note:(ctx.location.name||"location")+" — the set seen as its "+(_locPanel?_locPanel.label:"coverage view")+" (one full-frame view)" }])
    : [];
  const castSpec = inCast.map(id=>{ const c=(ctx.charById||{})[id]; return c?{ id, note:c.name+" character sheet" }:null; }).filter(Boolean);
  // same dressing gate as buildShotPrompt/collectShotRefs — labels must match files
  const propSpec = inPr.map(id=>{ const p=(ctx.propById||{})[id];
    if(!p || !shotPropAttachable(p, sh)) return null;   // worn attach only on tight shots WITH a generated close-up sheet
    // STATE-AWARE: attach the active appearance-state variant when one exists (baseId
    // keeps the user's refOff untick working against the prop's own id). CUSTODY-AWARE:
    // the note names the scene's actual holder after a handover.
    const _scs = (ctx.scenes || ((window.turnContinuity||{}).scenes) || []);
    const so = (typeof shotPropSheetId==="function") ? shotPropSheetId(p, ctx.scene, _scs) : { id:p.id, state:null };
    const co = (typeof custodyOwnerAt==="function") ? custodyOwnerAt(p, ctx.scene, _scs) : { name:p.ownerName, handover:null };
    return { id:so.id, baseId:p.id, note:p.name+" prop sheet"+(so.state?(" \u2014 "+so.state.label):"")+(co.handover&&co.name?(" \u2014 "+co.name+" holds it now"):"") }; }).filter(Boolean);
  const carrySpec= carried.map(id=>{ const p=(ctx.propById||{})[id]; if(!p) return null;
    const _scs = (ctx.scenes || ((window.turnContinuity||{}).scenes) || []);
    const so = (typeof shotPropSheetId==="function") ? shotPropSheetId(p, ctx.scene, _scs) : { id:p.id, state:null };
    const co = (typeof custodyOwnerAt==="function") ? custodyOwnerAt(p, ctx.scene, _scs) : { name:p.ownerName, handover:null };
    return { id:so.id, baseId:p.id, note:p.name+" prop sheet (carried over from an earlier beat)"+(so.state?(" \u2014 "+so.state.label):"")+(co.handover&&co.name?(" \u2014 "+co.name+" holds it now"):"") }; }).filter(Boolean);
  // user-unticked sheets (sh.refOff) drop out here AND in buildShotPrompt's image
  // map together — the numbered labels always match the attached files
  const _refOff = Array.isArray(sh.refOff) ? sh.refOff : [];
  const orderedSpecs = ((locWeight==="ambient")
    ? [...castSpec, ...locSpec, ...propSpec, ...carrySpec]   // tight: the cast leads, the set recedes
    : [...locSpec, ...castSpec, ...propSpec, ...carrySpec])  // wide: the set leads
    .filter(s=> _refOff.indexOf(s.baseId||s.id)<0);
  const refs = [];
  for(const s of orderedSpecs){ let u=await grab(s.id);
    if(u && s.locPanelQ!=null && typeof shotLocPanelCrop==="function"){ const cu=await shotLocPanelCrop(u, s.locPanelQ); if(cu) u=cu; }
    if(u) refs.push({ url:u, note:s.note }); }
  // buildShotPrompt now emits the STYLE SPINE + staging + the named reference stack itself
  // (it reads ctx.carriedForward + ctx.prevFrameRole), so we don't re-list references here.
  const _ordAll = (typeof sceneShotsOrdered==="function") ? sceneShotsOrdered(sceneShots) : (sceneShots||[]);
  const _selfIdx = _ordAll.findIndex(x=>x.id===sh.id);
  ctx = { ...ctx, carriedForward: carried.map(id=>(ctx.propById||{})[id]).filter(Boolean),
    laterShots: _selfIdx>=0 ? _ordAll.slice(_selfIdx+1) : [],
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
  const r = (typeof nbCommit==="function") ? await nbCommit(sh.id, url, meta, [], "shot", _ep) : null;
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
  const tokensOf = (name)=> String(name||"").toLowerCase().trim()
    .split(/[^a-z0-9]+/).filter(w=> w.length>=3 && !/^[0-9]+$/.test(w));
  // a token SHARED by 2+ cast members (a family name like KARAHAN) is AMBIGUOUS —
  // "ADEM KARAHAN hauls the shutter" must never pull REECE KARAHAN into frame via
  // the surname (that attached a third face and the generator invented a third man).
  const tokCount = {};
  (characters||[]).forEach(c=> Array.from(new Set(tokensOf(c.name))).forEach(w=>{ tokCount[w]=(tokCount[w]||0)+1; }));
  (characters||[]).forEach(c=>{
    const full = (c.name||"").toLowerCase().trim();
    if(!full) return;
    // split on ANY non-alphanumeric (not just whitespace) so a hyphenated/serial name like
    // "VANYA-71" yields the human token "vanya" — otherwise the whole "vanya-71" token never
    // matches the script's "Vanya" and the character is silently dropped from the frame.
    const parts = tokensOf(full).filter(w=> tokCount[w]===1);
    const fullNorm = full.replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim();
    // the FULL name always matches (unambiguous even when every token is shared)
    const names = Array.from(new Set([fullNorm, ...parts])).filter(Boolean);
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
  const rawBeat = Number(raw && raw.beat);
  const beatNo = Number.isFinite(rawBeat) && rawBeat > 0 ? rawBeat : (idx+1);
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
  const beatRow = (beats && beats[scene.id] && (beats[scene.id].rows||[]).find(r=>String(r.n)===String(beatNo)));
  const beatAction = beatRow ? ((beatRow.drive&&beatRow.drive.d)||(beatRow.react&&beatRow.react.d)||"") : "";
  const specText = (v,max)=>{
    const clean = (typeof scrubBrand==="function" ? scrubBrand(String(v||"")) : String(v||"")).replace(/\s+/g," ").trim();
    return (typeof clipWords==="function") ? clipWords(clean,max) : clean.slice(0,max);
  };
  const action = specText(raw.action,300) || specText(beatAction,300) || specText(scene.summary,300);
  const sideRaw = String(raw.locationSide || raw.side || "").toUpperCase();
  return {
    id: "shot-"+scene.id+"-"+beatNo+"-"+Date.now().toString(36)+idx,
    sceneId: scene.id, beatN: beatNo, order: idx,
    size: pick(raw.size, sizeIds, "MS"),
    angle: pick(raw.angle, angleIds, "eye"),
    move: pick(raw.move || raw.movement, moveIds, "static"),
    lens: pick(raw.lens, lensIds, "50"),
    composition: specText(raw.composition,240),
    subjects: resolveSubjects(raw, action),
    locationId: loc?loc.id:"",
    props: resolveProps(raw.props),
    locationSide: /^(INT|EXT|BOTH)$/.test(sideRaw) ? sideRaw : undefined,
    action: action,
    dialogue: specText(raw.dialogue,200),
    // micro-beat mapping (pre-production layer): which of the beat's discrete
    // filmable actions this shot covers, why it exists, and whether it carries
    // the beat's protected emotional core. The per-beat plan (micro list +
    // protect line) rides denormalized on every shot of its beat.
    covers: Array.isArray(raw.covers) ? raw.covers.map(Number).filter(n=>Number.isFinite(n)&&n>0&&n<=20).slice(0,12) : [],
    purpose: specText(raw.purpose,160),
    priority: !!raw.priority,
    beatPlan: (raw.beatPlan && Array.isArray(raw.beatPlan.micro) && raw.beatPlan.micro.length)
      ? { micro: raw.beatPlan.micro.map(t=> specText(t,180)).filter(Boolean).slice(0,10),
          protect: specText(raw.beatPlan.protect,220) }
      : undefined,
    // no dur: a drafted shot stays on AUTO — its length can't be predicted, only
    // budgeted (dialogue-anchored estimate via shotDur); the user pins by hand
    negativePrompt:""
  };
}
window.normalizeShot = normalizeShot;

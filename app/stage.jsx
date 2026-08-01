/* stage.jsx — The Stage (Production), Step 10.

   The SEEDANCE 2.0 DIRECTOR CONSOLE. The unit of work is the CLIP (one
   sceneSequences group, the <=15s render unit) = exactly one Seedance generation.
   Each clip's START FRAME (its first shot's rendered frame) + a composed multi-beat
   prompt + the locked-voice line audio + derived reference sheets are assembled into
   a multimodal Seedance job (see app/videogen.jsx seedanceGenerate / useSeedanceGen,
   bytedance/seedance-2.0 via the fal.ai proxy). Generation is deploy-gated exactly
   like voice — without the proxy route + FAL_KEY it shows a friendly message.

   Layout: a left STORY-SPINE rail (acts → scenes → clips), a CENTER (player +
   shot-take filmstrip + prompt box + input assets) and a RIGHT Seedance panel
   (capability card + mode selector + assets summary + controls + Generate). Reuses
   the same window helpers as the Shot List / Storyboard so the partition matches. */

const _stEl = React.createElement;

function _pad2(n){ return String(n||0).padStart(2,"0"); }
function _clipLetter(i){ return (i<26) ? String.fromCharCode(65+i) : String(i+1); }
function _uniq(a){ const o=[], s=new Set(); (a||[]).forEach(x=>{ if(x && !s.has(x)){ s.add(x); o.push(x); } }); return o; }
function _clipDur(g){ return Math.max(4, Math.min(15, Math.round(g.dur||5))); }
function _firstWords(t, n){ const w=String(t||"").trim().split(/\s+/).filter(Boolean); return w.slice(0,n).join(" ")+(w.length>n?"…":""); }
function _stageAspect(project){ return (typeof aspectFor==="function") ? aspectFor(project) : "16:9"; }
function _stageAspectCss(aspect){
  const raw = String(aspect||"16:9").trim();
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  return { "--stage-aspect": m ? (m[1]+" / "+m[2]) : "16 / 9" };
}
function _stageSavedSource(){
  try{ const v=localStorage.getItem("turn_stage_visual_source"); return v==="halves" ? "halves" : "shots"; }catch(e){ return "shots"; }
}
/* Full-screen for any rendered-video player: native fullscreen on the <video>,
   falling back to a self-mounting in-app overlay (same .stage2-lightbox chrome)
   when the browser refuses — embedded frames often leave the request pending or
   reject it. Shared by the clip console, the Versions viewer and the Timeline/
   Audio players so every generated video can go full screen the same way. */
function _stageVideoFullscreen(v, url){
  const src = url || (v && (v.currentSrc || v.src)) || "";
  const overlay = ()=>{
    if(!src) return;
    const wrap = document.createElement("div"); wrap.className = "stage2-lightbox";
    const vid = document.createElement("video");
    vid.className = "stage2-lightbox-media"; vid.src = src;
    vid.controls = true; vid.autoplay = true; vid.playsInline = true;
    if(v){ try{ vid.currentTime = v.currentTime||0; }catch(e){} }
    wrap.appendChild(vid);
    const onKey = (e)=>{ if(e.key==="Escape") close(); };
    const close = ()=>{ try{ wrap.remove(); }catch(e){} document.removeEventListener("keydown", onKey); };
    wrap.addEventListener("mousedown",(e)=>{ if(e.target===wrap) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(wrap);
  };
  if(!v){ overlay(); return; }
  try{
    if(v.requestFullscreen){ const p = v.requestFullscreen(); if(p&&p.catch) p.catch(()=>{}); }
    else if(v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    else if(v.webkitEnterFullscreen){ v.webkitEnterFullscreen(); return; }   // iOS Safari
    else { overlay(); return; }
    // an embedded frame can leave the request PENDING forever — if nothing is
    // fullscreen shortly after, open the overlay instead
    setTimeout(()=>{ if(!document.fullscreenElement && !document.webkitFullscreenElement) overlay(); }, 600);
  }catch(e){ overlay(); }
}
function _chipClass(k){ return String(k||"").toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"") || "tag"; }
function _fmtSecs(n){ n=Number(n)||0; return (Math.round(n*10)/10).toString().replace(/\.0$/,"")+"s"; }
function stageCreditInfo(balance, cost){
  cost = Number(cost)||1;
  const b = balance || (typeof window!=="undefined" ? window.turnCreditBalance : null);
  const remaining = b && Number(b.remaining);
  const known = Number.isFinite(remaining);
  const after = known ? Math.max(0, remaining-cost) : null;
  return {
    known,
    remaining:known ? remaining : null,
    after,
    empty:known && remaining < cost,
    label: known
      ? ("Uses "+cost+" generation credit"+(cost!==1?"s":"")+" · "+remaining+" remaining"+(remaining>=cost ? (" → "+after+" after render") : ""))
      : ("Uses "+cost+" generation credit"+(cost!==1?"s":"")+" · remaining credits unavailable"),
    title: known
      ? ("Current balance: "+remaining+" generation credit"+(remaining===1?"":"s")+". This render costs "+cost+".")
      : "Cinema Machine could not read a credit balance from the current account/backend yet."
  };
}
function stageFriendlyVideoError(err){
  const raw = String((err&&err.message)||err||"").trim();
  if(!raw) return "";
  const low = raw.toLowerCase();
  if(low.includes("failed to download") || low.includes("download the file") || low.includes("url is accessible")){
    return "The video model couldn't download one of the selected input assets. Cinema Machine now refreshes cloud image URLs and stages browser-only blobs through the proxy, so if this persists, one selected asset is likely missing, expired, private, or too large to stage. Re-open or regenerate that source asset, make sure the selected thumbnails load, then try Generate clip again.";
  }
  return raw;
}
/* raw fal queue statuses (IN_QUEUE / IN_PROGRESS…) are for machines — this is what
   people see. Batch composites like "2/4 takes · IN_PROGRESS" humanize too. */
function stageStatusLabel(s){
  const raw = String(s||"").trim();
  if(!raw) return "";
  return raw
    .replace(/\bIN_QUEUE\b/g,"Waiting in the queue")
    .replace(/\bIN_PROGRESS\b/g,"Rendering")
    .replace(/\bCOMPLETED\b/g,"Finishing up")
    .replace(/\bCANCELL?ED\b/g,"Cancelled")
    .replace(/_/g," ");
}
async function stageServerAssetUrl(asset, fallbackUrl){
  const raw = (asset&&asset.url) || fallbackUrl || "";
  const id = asset && asset.id;
  if(id && typeof nbRemoteImageUrl==="function"){
    try{ const u = await nbRemoteImageUrl(id); if(u) return u; }catch(e){}
  }
  return raw;
}
function _shotAudioReady(sh, auds){ return !!((auds&&auds[sh.id]) || (sh&&sh.lineAudio&&sh.lineAudio.durationMs)); }
/* the clip's AUDIO-CLOCK duration — measured line audio PLUS breathing room. Scenes
   need air: 0.6s to settle in, 0.8s between lines (a look, a reaction), 0.6s to hold
   the final moment. Without it a two-line clip rendered wall-to-wall speech and the
   prompt's action beats had zero seconds to happen in. Clamped to the model's ceiling. */
const CLIP_AIR = { lead:0.6, gap:0.8, tail:0.6 };
function _clipMeasuredSec(clip, maxSec){
  const shots = ((clip&&clip.data&&clip.data.shots)||[]);
  const lines = ((clip&&clip.data&&clip.data.lineShots)||[]).filter(sh=>String(sh.dialogue||"").trim());
  if(!lines.length) return 0;
  if(!lines.every(sh=>sh.lineAudio && sh.lineAudio.durationMs)) return 0;
  // walk EVERY member shot, the same way the Timeline recipe lays its windows:
  // dialogue shots = air + the measured line; ACTION shots = their runtime estimate
  // (capped — an estimate must never eat the whole clip). Counting only the lines
  // used to squeeze a one-line + two-action clip to ~4s with no time to act.
  let t = CLIP_AIR.lead, spoken = 0;
  shots.forEach(sh=>{
    const talks = String((sh&&sh.dialogue)||"").trim();
    if(talks){ if(spoken>0) t += CLIP_AIR.gap; t += Number((sh.lineAudio||{}).durationMs||0)/1000; spoken++; }
    else t += Math.min(3.5, (typeof stageShotRuntime==="function") ? stageShotRuntime(sh) : 2);
  });
  t += CLIP_AIR.tail;
  return Math.max(4, Math.min(maxSec||15, Math.round(t*10)/10));
}
function _normStageText(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function stageBeatRow(beatsMap, sceneId, beatN){
  return (((beatsMap||{})[sceneId]||{}).rows||[]).find(r=>Number(r.n)===Number(beatN)) || null;
}
function stageShotMicroTexts(sh){
  // the micro-beats this shot COVERS are the story canon ("what happens"); sh.action is
  // the camera's staging of them. Coverage is explicit (sh.covers, 1-based into
  // beatPlan.micro); older shots drafted before covers existed fall back to the SAME fuzzy
  // matcher the Shots UI badges use — never a second, divergent heuristic.
  const micro = (sh && sh.beatPlan && Array.isArray(sh.beatPlan.micro)) ? sh.beatPlan.micro : [];
  if(!micro.length) return [];
  let nums = [];
  if(Array.isArray(sh.covers) && sh.covers.length) nums = sh.covers;
  else if(typeof window.microCoverage==="function" && sh.id){
    // window.microCoverage explicitly (not a bare global): vm test harnesses isolate
    // globals, and a silent no-op here would only surface as missing prompt text.
    // force:true bypasses the UI's no-data-no-signal gate — see microCoverage.
    try{
      const r = window.microCoverage([sh], micro, {force:true});
      const s = r && r.map && r.map[sh.id];
      if(s && s.size) nums = Array.from(s);
    }catch(e){}
  }
  const out = nums.map(n=>String(micro[Number(n)-1]||"").replace(/\s+/g," ").trim()).filter(Boolean);
  // legacy clips carry a baked-in "\u2026" (180-char drafting cap) — heal against the
  // beat's screenplay canon so prompts and the shoot package get the FULL sentence
  if(out.some(t=>/\u2026\s*$/.test(t)) && typeof window.microHealText==="function"
      && typeof window.beatScriptText==="function" && sh.sceneId){
    const canon = window.beatScriptText(sh.sceneId, sh.beatN);
    if(canon) return out.map(t=>window.microHealText(t, canon));
  }
  return out;
}
function stageShotScriptText(scene, drafts, sh, max){
  // resolve through the beat's micro-beats first: the covered micro-beat is the complete,
  // canonical statement of the event (and names characters the camera line may only imply,
  // which the cast-sheet scan relies on). sh.action is appended as staging detail when it
  // adds information beyond the micro-beat. Beat prose is the last-resort fallback for
  // shots with neither — reading it FIRST stamped the whole beat's prose onto every shot.
  const M = (max==null) ? 160 : max;   // 0 = NO cap — editor views show the FULL line
  const own = String((sh&&sh.action)||"").replace(/\s+/g," ").trim();
  const microT = stageShotMicroTexts(sh).join(" ").replace(/\s+/g," ").trim();
  let base = "";
  if(microT && own){
    const a = _normStageText(microT), b = _normStageText(own);
    if(a && b && a!==b && a.indexOf(b)<0 && b.indexOf(a)<0) base = microT+" "+own;
    else base = (own.length >= microT.length) ? own : microT; // one contains the other: keep the fuller
  } else base = microT || own;
  if(base){
    return (M>0 && base.length>M) ? base.slice(0, Math.max(0, M-1)).replace(/\s+\S*$/,"")+"\u2026" : base;
  }
  if(typeof screenplayBeatTitle==="function"){
    const t = screenplayBeatTitle(scene, drafts||{}, sh&&sh.beatN, M>0?M:undefined);
    if(t) return t;
  }
  return "";
}
function stageCharNameMatch(name, characters){
  const n = _normStageText(String(name||"").replace(/\(cont'?d\)/ig,""));
  if(!n) return null;
  return (characters||[]).find(c=>{
    const cn = _normStageText(c&&c.name);
    return cn && (cn===n || cn.indexOf(n)>=0 || n.indexOf(cn)>=0);
  }) || null;
}
function stageDialogueSpeaker(scene, drafts, beatsMap, sh, ctx){
  const blocks = (((drafts||{})[scene.id]||{}).blocks||[]).filter(b=>Number(b.beat)===Number(sh&&sh.beatN));
  const line = _normStageText(sh&&sh.dialogue);
  for(let i=0;i<blocks.length;i++){
    const b = blocks[i] || {}, next = blocks[i+1] || {};
    if(b.type==="char" && (next.type==="dia" || next.type==="paren")){
      const nextText = _normStageText(next.text);
      if(!line || !nextText || nextText.indexOf(line)>=0 || line.indexOf(nextText)>=0){
        const c = stageCharNameMatch(b.text, ctx&&ctx.characters);
        if(c) return { id:c.id, name:c.name };
        const nm = String(b.text||"").replace(/\(cont'?d\)/ig,"").trim();
        if(nm) return { id:"", name:nm };
      }
    }
  }
  const script = stageShotScriptText(scene, drafts, sh, 220);
  const m = String(script||"").match(/^\s*([A-Z0-9][A-Z0-9 _.'-]{1,40})\s*:/);
  if(m){
    const c = stageCharNameMatch(m[1], ctx&&ctx.characters);
    if(c) return { id:c.id, name:c.name };
    return { id:"", name:m[1].replace(/\(cont'?d\)/ig,"").trim() };
  }
  // text drift tolerance: when the beat's script has exactly ONE speaking character,
  // trust it even though the dialogue string didn't substring-match above
  const charBlocks = blocks.filter(b=>b && b.type==="char");
  const distinct = Array.from(new Set(charBlocks.map(b=>_normStageText(b.text))));
  if(charBlocks.length && distinct.length===1){
    const c = stageCharNameMatch(charBlocks[0].text, ctx&&ctx.characters);
    if(c) return { id:c.id, name:c.name };
    const nm = String(charBlocks[0].text||"").replace(/\(cont'?d\)/ig,"").trim();
    if(nm) return { id:"", name:nm };
  }
  // From here down it's guessing (the script named no speaker). The FRESH guess —
  // the character named EARLIEST in the action text (its subject) — outranks the
  // lineAudio stamp, because that stamp was itself minted by this resolver at
  // voicing time: trusting it first made a wrong guess permanent (every re-voice
  // re-read its own stale answer). Cast-array order is never used — that bias
  // credited the protagonist with everyone's lines.
  const ids = (typeof inFrameCast==="function") ? inFrameCast(sh, scene, (ctx&&ctx.characters)||[]) : ((sh&&sh.subjects)||[]);
  const act = " "+String((sh&&sh.action)||"").toLowerCase().replace(/[^a-z0-9 ]+/g," ")+" ";
  const posOf = (c)=>{ const w = String(c.name||"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>=3)[0];
    const i = w ? act.indexOf(" "+w+" ") : -1; return i<0 ? 1e9 : i; };
  const first = (ids||[]).map(id=>ctx&&ctx.charById&&ctx.charById[id]).filter(Boolean)
    .sort((a,b)=>posOf(a)-posOf(b))[0];
  if(first) return { id:first.id, name:first.name };
  const la = sh && sh.lineAudio;
  if(la && (la.speaker || la.speakerId)){
    const c = (la.speakerId && ctx && ctx.charById && ctx.charById[la.speakerId]) || stageCharNameMatch(la.speaker, ctx&&ctx.characters);
    return { id:(c&&c.id)||la.speakerId||"", name:(c&&c.name)||la.speaker||"" };
  }
  return { id:"", name:"the speaker" };
}
function stageShotSheetText(scene, beatsMap, sh, max){
  let t = String((sh&&sh.action)||"").replace(/\s+/g," ").trim();
  if(!t){
    const r = stageBeatRow(beatsMap, scene&&scene.id, sh&&sh.beatN);
    t = [r&&r.drive&&r.drive.d, r&&r.react&&r.react.d].filter(Boolean).join(" ");
  }
  if(max && t.length>max) t = t.slice(0, max-1).replace(/\s+\S*$/,"")+"…";
  return t;
}
function stageShotCanonLine(scene, drafts, beatsMap, sh, max){
  const cap = (max==null) ? 180 : max;   // 0 = NO cap — full canon (the Multi-shot editor)
  const script = stageShotScriptText(scene, drafts, sh, cap);
  const sheet = stageShotSheetText(scene, beatsMap, sh, cap);
  if(script && sheet){
    const a=_normStageText(script), b=_normStageText(sheet);
    if(a && b && a!==b && a.indexOf(b)<0 && b.indexOf(a)<0) return script+" Storyboard panel action: "+sheet;
  }
  return script || sheet || "";
}
function stageSheetPanelMeta(g, i){
  const abs = (Number(g&&g.start)||0) + i;
  const cell = abs % 4;
  return { abs, page:Math.floor(abs/4)+1, panel:cell+1, half:cell<2?"top":"bottom" };
}

/* ---------- derive everything a clip needs from existing pre-production --------- */
function buildClipData(scene, g, ctx){
  const shots = g.shots||[];
  const first = shots[0]||{};
  // in-frame cast (union across the clip's shots), de-duped, names + ids
  const castIds = [];
  shots.forEach(sh=>{
    const inc=(typeof inFrameCast==="function")?inFrameCast(sh, scene, ctx.characters||[]):(sh.subjects||[]);
    // ALSO scan the text the prompt actually SPEAKS (the vidText override or the beat-prose
    // canon line, composed exactly as panelLines does): beat prose can name characters the
    // per-shot action line omits ("the rear door clunks. MARCUS folds in…"), and anyone the
    // prompt names MUST have their identity sheet attached or the model invents them.
    const spoken = String(sh.vidText||"").trim()
      || ((typeof stageShotCanonLine==="function") ? stageShotCanonLine(scene, ctx.drafts, ctx.beatsMap, sh, 190) : "");
    // dialogue surfaces too: the voice-cast preamble, lip-sync recipes and audio role
    // labels all name the SPEAKER — a speaker-only character (never in the prose) still
    // needs their identity sheet attached or lip-sync renders an invented face.
    const dlg = String(sh.dialogue||"");
    const spk = dlg.trim() && (typeof stageDialogueSpeaker==="function")
      ? stageDialogueSpeaker(scene, ctx.drafts, ctx.beatsMap, sh, ctx) : null;
    const named = (typeof scanTextForChars==="function")
      ? scanTextForChars([spoken, dlg, (spk&&spk.name)||""].filter(Boolean).join("\n"), ctx.characters||[]) : [];
    inc.concat(named).forEach(id=>{ if(castIds.indexOf(id)<0) castIds.push(id); });
  });
  const cast = castIds.map(id=>({ id, name:(ctx.charById[id]||{}).name||"" })).filter(c=>c.name);
  // in-frame props (union)
  const propIds = [];
  let propLedger = {};
  try{ propLedger = (typeof sceneContinuityLedger==="function") ? sceneContinuityLedger(scene, shots, ctx.charById, ctx.propById) : {}; }catch(e){}
  shots.forEach(sh=>{ const inc=(typeof inFrameProps==="function")?inFrameProps(sh, scene, ctx.charById, ctx.propById):[];
    (inc||[]).concat((propLedger&&propLedger[sh.id])||[]).forEach(id=>{ if(propIds.indexOf(id)<0) propIds.push(id); }); });
  // STATE + CUSTODY aware prop resolution — the same story-order rules the Shots room
  // uses: the prop's ACTIVE appearance-state variant sheet attaches (never the stale
  // base), and the reference label names who actually holds it in this scene.
  const _storyScenes = ctx.scenes || ((window.turnContinuity||{}).scenes) || [];
  const clipProps = propIds.map(id=>{
    const p = ctx.propById[id];
    if(!p || !p.name) return null;
    const so = (typeof shotPropSheetId==="function") ? shotPropSheetId(p, scene, _storyScenes) : { id:p.id, state:null };
    const co = (typeof custodyOwnerAt==="function") ? custodyOwnerAt(p, scene, _storyScenes) : { name:p.ownerName, handover:null };
    return { id:p.id, sheetId:so.id||p.id, name:p.name, kind:p.kind||"",
      stateLabel:(so.state&&so.state.label)||"", holder:co.name||p.ownerName||"", handover:co.handover||null };
  }).filter(Boolean);
  const loc = (typeof locationForScene==="function") ? locationForScene(ctx.locations, scene.id) : null;
  // coverage-sheet resolution: the screenplay-derived unit/coverage sheet (e.g. "Minicab
  // · NIGHT") beats the master plate when the clip's shots call for it — the same
  // resolver the Shots room's frame pipeline uses, run over every shot in the clip.
  let locSheet = null;
  if(loc && typeof shotLocationCoverageSpecs==="function"){
    const drafts0 = ctx.drafts || ((window.turnContinuity||{}).drafts) || {};
    const recs = (Array.isArray(loc.coverageSheets)&&loc.coverageSheets.length) ? loc.coverageSheets
      : ((typeof deriveLocationCoverageSheets==="function") ? (deriveLocationCoverageSheets(loc,[scene],drafts0)||[]) : []);
    const seen = {};
    for(const sh of shots){
      const specs = shotLocationCoverageSpecs(loc, sh, scene, drafts0) || [];
      for(const sp of specs){
        if(!sp || sp.id===loc.id || seen[sp.id]) continue;
        seen[sp.id] = true;
        const suffix = String(sp.id).slice(String(loc.id).length+1);
        const rec = (recs||[]).find(v=>v.id===suffix);
        if(!locSheet) locSheet = { id:sp.id, name:(rec&&rec.name)||loc.name||"Location", role:sp.role||(rec&&rec.role)||"" };
      }
      if(locSheet) break;
    }
  }
  const preset = (typeof scenePreset==="function") ? scenePreset(ctx.project, scene.id) : null;
  // camera arc: first -> last distinct move label
  const moves = _uniq(shots.map(sh=> (typeof shotMoveOf==="function") ? shotMoveOf(sh.move).label : (sh.move||"")).filter(Boolean));
  const camera = moves.length ? moves.join(" → ") : "Static";
  const lighting = (preset && (preset.lighting||preset.grade)) || "Naturalistic, motivated light";
  const lead = cast[0] ? cast[0].name : "the subject";
  // composed director prompt (prose, multi-beat) — readable, not the image-gen JSON
  const panelLines = shots.map((sh,i)=>{
    const meta = stageSheetPanelMeta(g, i);
    const speaker = String(sh&&sh.dialogue||"").trim() ? stageDialogueSpeaker(scene, ctx.drafts, ctx.beatsMap, sh, ctx) : null;
    // the Shots tab's camera grammar, preserved PER SHOT — the clip-level "camera arc"
    // flattens these into one description; the shoot package and timeline recipes need
    // each setup intact (size · angle · move · lens + the composition note).
    const camSpec = (typeof shotSizeOf==="function")
      ? [shotSizeOf(sh.size).label, shotAngleOf(sh.angle).label, shotMoveOf(sh.move).label, shotLensOf(sh.lens).label].filter(Boolean).join(" · ")
      : "";
    return { shotId:sh.id, beatN:sh.beatN, sheetPage:meta.page, sheetPanel:meta.panel, half:meta.half,
      // sh.vidText = the user's per-shot VIDEO description override (Multi-shot
      // editor) — video-only, never touches the canon action the image side uses
      text: String(sh.vidText||"").trim() || stageShotCanonLine(scene, ctx.drafts, ctx.beatsMap, sh, 190),
      script:stageShotScriptText(scene, ctx.drafts, sh, 190),
      sheet:stageShotSheetText(scene, ctx.beatsMap, sh, 190),
      speaker,
      camera:camSpec, composition:String((sh&&sh.composition)||"").trim(),
      dur:(typeof stageShotRuntime==="function") ? stageShotRuntime(sh) : 0,
      dialogue:String((sh&&sh.dialogue)||"").trim(),
      micro:stageShotMicroTexts(sh) };
  });
  const actions = _uniq(panelLines.map(p=>String(p.text||"").trim()).filter(Boolean));
  // multi-line: one action per line, sections separated by blank lines — readable
  // for humans, and video models take newlines fine
  const body = actions.join("\n");
  const setting = loc ? (loc.name) : (scene.loc||"");
  const styleClause = preset ? ("Style: "+preset.name+" — "+preset.grade+".") : "";
  const camClause = "Camera: "+camera.toLowerCase()+".";
  const prompt = [ body, camClause, styleClause ].filter(Boolean).join("\n\n");
  // tag chips
  const chips = [
    cast.length && { k:"subject", v:cast.map(c=>c.name).join(", ") },
    actions.length && { k:"action", v:actions.join(" "), label:_firstWords(actions[0], 4) },
    setting && { k:"setting", v:setting },
    { k:"camera", v:camera.toLowerCase() },
    preset && { k:"style", v:preset.name.toLowerCase() },
    preset && { k:"mood", v:String(preset.grade||"").trim().toLowerCase(), label:_firstWords(preset.grade, 4).toLowerCase() },
  ].filter(Boolean);
  // the beat's PROTECT line travels with the clip — the shoot package shows it as a
  // story obligation so the render never quietly drops what the beat exists to protect
  const protect = shots.map(sh=>sh&&sh.beatPlan&&String(sh.beatPlan.protect||"").trim()).find(Boolean) || "";
  return { shots, first, cast, props:clipProps, loc, locSheet, preset, camera, lighting, lead, prompt, chips, setting, panelLines, protect,
    dur:_clipDur(g), lineShots: shots.filter(sh=>String(sh.dialogue||"").trim()) };
}

/* ============================ the per-clip console ============================== */
function storyboardClipIds(clip){
  const legacy = "sbsheet-sbclip-"+clip.scene.id+"-"+clip.g.index;
  const start = Number(clip && clip.g && clip.g.start) || 0;
  const count = Math.max(1, ((clip&&clip.g&&clip.g.shots)||[]).length);
  const pages=[], halves=[];
  for(let n=start; n<start+count; n++){
    const pageNo = Math.floor(n/4);
    const pageId = "sbsheet-sbpage-"+clip.scene.id+"-2x2-"+pageNo;
    const half = (n % 4) < 2 ? "top" : "bottom";
    if(pages.indexOf(pageId)<0) pages.push(pageId);
    const halfId = pageId+":half-"+half;
    if(halves.indexOf(halfId)<0) halves.push(halfId);
  }
  const page = pages[0] || ("sbsheet-sbpage-"+clip.scene.id+"-2x2-"+Math.floor(start/4));
  return {
    sheet:page, pages, halves, top:halves[0]||"", bottom:halves[1]||"",
    legacySheet:legacy, legacyTop:legacy+":half-top", legacyBottom:legacy+":half-bottom",
    all:Array.from(new Set([].concat(pages, halves, [legacy, legacy+":half-top", legacy+":half-bottom"])))
  };
}
function storyboardClipAssets(clip, imgs){
  const ids = storyboardClipIds(clip);
  const halves = (ids.halves||[]).map(id=>({ id, url:imgs[id]||"" })).filter(h=>h.url);
  const pages = (ids.pages||[]).map(id=>({ id, url:imgs[id]||"" })).filter(p=>p.url);
  return {
    ids,
    sheet:imgs[ids.sheet]||imgs[ids.legacySheet]||"",
    pages,
    halves,
    top:imgs[ids.top]||imgs[ids.legacyTop]||"",
    bottom:imgs[ids.bottom]||imgs[ids.legacyBottom]||""
  };
}
function clipPrimaryFrame(clip, imgs, visualSource){
  const story = storyboardClipAssets(clip, imgs);
  if(visualSource==="halves") return story.top || story.bottom || story.sheet || "";
  return imgs[(clip.data.first||{}).id] || "";
}

/* ---- per-clip visual-source planner. Researched behaviour: individual frames give the
   best per-shot precision and identity (full-res, first-frame anchoring) but each frame
   costs one of the 9 image slots that cast/location/prop refs also need; multi-panel
   storyboard sheets pace a continuous clip well ("animates through it panel by panel")
   but the model misses the directional logic between panels without prose, and captions/
   panel borders can bleed into the output. So the pick is per-clip, not global:
     dialogue or 1 shot  → the shot frame (lip-sync/precision beats blocking)
     2 merged shots      → the 2-panel half (clear A→B, exact 16:9, one asset slot)
     3–4 merged shots    → per-shot frames IF they fit the image budget, else the 4-panel sheet
   with availability fallbacks so a missing source degrades gracefully. ---- */
const STAGE_SOURCE_MODES = {
  frame:  { label:"shot frame",      glyph:"▢",  pick:"Shot frame" },
  frames: { label:"per-shot frames", glyph:"▢▢", pick:"Per-shot frames" },
  halves: { label:"2-panel half",    glyph:"▤",  pick:"Storyboard halves" },
  sheet:  { label:"4-panel sheet",   glyph:"▦",  pick:"Full storyboard sheet" },
};
function stageClipSourcePlan(clip, imgs){
  const d = (clip&&clip.data)||{};
  const shots = d.shots||[];
  const story = storyboardClipAssets(clip, imgs);
  const hasHalves = !!((story.halves||[]).length || story.top || story.bottom);
  const hasSheet = !!story.sheet;
  const frameReady = !!imgs[(d.first||{}).id];
  const framesReady = shots.length>0 && shots.every(sh=>!!imgs[sh.id]);
  const refSlots = (d.cast||[]).length + (d.loc?1:0) + (d.props||[]).length;
  let mode;
  const hasLines = !!(d.lineShots||[]).length;
  if(shots.length<=1) mode = "frame";
  // dialogue clips avoid panel sources (lip-sync wants clean frame anchors), but a
  // small merged clip still gets per-shot frames when they exist and fit the budget —
  // full-res anchors per shot beat a single frame for the non-speaking beats.
  else if(hasLines) mode = (framesReady && (shots.length+refSlots)<=9) ? "frames" : "frame";
  else if(shots.length===2) mode = hasHalves ? "halves" : (framesReady ? "frames" : (hasSheet ? "sheet" : "frames"));
  else mode = (framesReady && (shots.length+refSlots)<=9) ? "frames"
    : hasSheet ? "sheet" : hasHalves ? "halves" : "frames";
  if(mode==="frames" && shots.length<=1) mode = "frame";
  // frames mode needs EVERY shot's frame — checking only the first green-lit clips
  // whose later shots had no anchor at all
  const ready = mode==="halves" ? hasHalves : mode==="sheet" ? hasSheet : mode==="frames" ? framesReady : frameReady;
  return { mode, ready, hasHalves, hasSheet, frameReady, framesReady,
    ...(STAGE_SOURCE_MODES[mode]||STAGE_SOURCE_MODES.frame) };
}

/* the recipe that best matches a clip's shape + visual source — the DEFAULT, not a
   lock: a SINGLE-shot dialogue moment wants the @Audio-anchored lip-sync phrasing;
   a MULTI-shot clip wants structure (per-panel narration for storyboard sources,
   time-coded windows otherwise — both carry per-line speaker + @AudioN tags now,
   so dialogue attribution survives either way); a single silent frame reads best
   as prose. */
function stageSmartRecipe(clip, sourceMode, modelId){
  const d = (clip&&clip.data)||{};
  const shotsN = ((d.shots||[]).length);
  // Kling 3.0 renders each Multi-shot row natively on its own prompt — for any
  // multi-beat clip on Kling, Multi-shot IS the model's native language.
  if(modelId==="kling-3.0" && shotsN>=2) return "multishot";
  if((d.lineShots||[]).length && shotsN<=1) return "lipsync";
  if(sourceMode==="halves" || sourceMode==="sheet") return "panels";
  if(shotsN>=2) return "timeline";
  return "narrative";
}

/* ---- Seedance 2.0 prompt RECIPES — named ways to phrase the SAME clip for the model.
   Each rebuilds the (still hand-editable) prompt from the clip's beats. Researched from
   how Seedance 2.0 responds best: a flowing paragraph (Narrative), a per-panel beat board
   with dialogue durations + anti-hallucination rules (Panel-by-panel), labelled control
   fields (Structured), and an audio-anchored lip-sync phrasing (Dialogue). ---- */
const SEEDANCE_RECIPES = [
  ["narrative",  "Narrative",        "One flowing paragraph — the default."],
  ["panels",     "Panel-by-panel",   "Explicit SHOT 1 / SHOT 2 cut points tied to the screenplay, storyboard panel, camera, motion and dialogue."],
  ["timeline",   "Timeline",         "Time-coded windows (0–4s, 4–9s…) scripted from each shot's measured runtime — paces motion across the clip."],
  ["structured", "Structured",       "Labelled fields: Subject / Action / Setting / Camera / Lighting / Style."],
  ["lipsync",    "Dialogue / lip-sync","Phrased around the spoken lines — each speaker paired with their own audio reference for accurate lip-sync."],
];

/* ---- model/tier registry — the single source of truth the model picker renders from.
   Adding a future model (Seedance 2.5, a third provider, etc.) is one entry here; the
   UI below just maps over this list, so it never needs a second edit. "soon" entries
   render disabled with their note as a tooltip. Standard/Fast tiers researched against
   fal.ai's live Seedance 2.0 API + this app's own docs/Voice & Lip-Sync (Seedance) Plan.md. ---- */
const SEEDANCE_MODELS = [
  // maxShotsPerClip drives the CLIP PACKER (sceneSequences): 3 keeps per-shot frames +
  // identity refs inside 2.0's 9-image budget; 0 = unlimited (whole-scene single pass).
  // creditRate = generation credits PER SECOND at each resolution (cost = ceil(seconds ×
  // rate), min 1). Scaled off fal's real per-second pricing so the relative cost of every
  // tier/resolution choice is honest: 1 credit ≈ 1s of 720p Standard (~$0.30 of fal spend).
  // metaRes/metaDur render as small badge chips on each dropdown option;
  // capabilities feed the panel's model card, so the card follows the selection.
  { id:"seedance-2.0", label:"Seedance 2.0", status:"active", maxShotsPerClip:3,
    metaRes:"4K", metaDur:"4–15s",
    capabilities:["Multimodal video generation","Up to 12 assets combined","Up to 4K output (Standard tier)","Start→end frame transitions","Typical clip length 4–15s","Strong motion stability","Character consistency","Native audio","Director controls"],
    tiers:[
      // Rates come from app/pricing.jsx as provider USD/sec converted into base
      // credits/sec. The final visible-denomination cost is computed below.
      { id:"standard", label:"Standard", fast:false, maxRes:"4K", note:"Best quality and motion consistency · resolution up to 4K",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("seedance-2.0","standard")) || { "480p":0.5, "720p":1, "1080p":2, "4K":5 } },
      { id:"fast",     label:"Fast",     fast:true,  maxRes:"720p",  note:"Lower latency and cost for iteration · capped at 720p",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("seedance-2.0","fast")) || { "480p":0.4, "720p":0.8 } },
    ] },
  // Kling 3.0 via fal — ONE start image (identity rides the frame: no reference
  // sheets, no audio refs; speech is generated NATIVELY by the model), optional
  // end frame, and NATIVE MULTI-SHOT: the Multi-shot tab's rows map 1:1 onto its
  // multi_prompt array (per-shot prompt + seconds, ≤15s total). refs/audioRefs
  // false drives the asset strip; the proxy maps the payload (kling branch).
  { id:"kling-3.0", label:"Kling 3.0", status:"active", maxShotsPerClip:3,
    refs:false, audioRefs:false, maxClipSec:15,
    metaRes:"1080p", metaDur:"3–15s",
    capabilities:["NATIVE multi-shot — each Multi-shot row renders on its own prompt & seconds","Native audio & speech (English/Chinese) generated by the model — no line-audio refs","Start→end frame in one request","ONE start image — identity rides the frame, not reference sheets","3–15s per render"],
    tiers:[
      // fal prices vary by audio/control mode; app/pricing.jsx carries the current
      // Cinema Machine assumption for native-audio renders.
      { id:"standard", label:"Standard", fast:false, maxRes:"1080p", falModel:"fal-ai/kling-video/v3/standard/image-to-video",
        note:"Kling 3.0 Standard — cinematic image-to-video with native audio & multi-shot",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("kling-3.0","standard")) || { "480p":0.4, "720p":0.4, "1080p":0.4 } },
      { id:"pro", label:"Pro", fast:false, maxRes:"1080p", falModel:"fal-ai/kling-video/v3/pro/image-to-video",
        note:"Kling 3.0 Pro — top-tier motion & fidelity",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("kling-3.0","pro")) || { "480p":0.8, "720p":0.8, "1080p":0.8 } },
    ] },
  // (Sora 2 was removed from the picker 2026-07-05 by user decision — its proxy
  // routing and videogen isSora branch remain dormant, so re-adding it later is
  // just restoring a registry entry here.)
  // Seedance 2.5 — released 2026-07-31; NOT yet listed on fal.ai (checked 2026-08-01),
  // so it stays "soon" — but the whole app is already 30s-wired: maxClipSec:30 feeds the
  // caphead / tick guard / duration options / measured-seconds floor; the Stage raises
  // the packing budget to 30 and these caps lift (maxShotsPerClip:0, maxDialoguePerClip:0);
  // videogen clamps at 30s, accepts up to 50 image refs (maxAssets) and polls ~20 min;
  // the proxy already allowlists the endpoints below. When fal lists it: verify the tier
  // falModel ids + creditRates against the live listing, then flip status to "active".
  { id:"seedance-2.5", label:"Seedance 2.5", status:"soon", maxShotsPerClip:0, maxDialoguePerClip:0,
    maxClipSec:30, maxAssets:50,
    metaRes:"4K", metaDur:"4–30s",
    capabilities:["Native single-pass 30s clips","4K output · 10-bit colour","Up to 50 multimodal references","Local in-clip edits","Whole-scene generation","Native audio"],
    tiers:[
      // PROVISIONAL endpoint ids (mirroring 2.0's naming) + rates (+25% over 2.0) —
      // confirm both against fal's listing before flipping status to "active".
      { id:"standard", label:"Standard", fast:false, maxRes:"4K", falModel:"bytedance/seedance-2.5/reference-to-video",
        note:"Best quality · single-pass 30s · resolution up to 4K",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("seedance-2.5","standard")) || { "480p":0.65, "720p":1.25, "1080p":2.5, "4K":6.5 } },
      { id:"fast",     label:"Fast",     fast:true,  maxRes:"720p", falModel:"bytedance/seedance-2.5/fast/reference-to-video",
        note:"Lower latency and cost for iteration · capped at 720p",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("seedance-2.5","fast")) || { "480p":0.5, "720p":1 } },
    ],
    note:"Released 2026-07-31: native single-pass 30s clips in 4K (10-bit colour), up to 50 multimodal references, and local in-clip edits. Waiting on fal.ai to list it — the app is already wired for its 30s ceiling, so activation is a status flip once the endpoint ids are confirmed." },
];
function seedanceModelOf(id){ return SEEDANCE_MODELS.find(m=>m.id===id) || SEEDANCE_MODELS[0]; }
function seedanceTierOf(model, tierId){ return (model&&model.tiers||[]).find(t=>t.id===tierId) || (model&&model.tiers||[])[0] || null; }
/* resolution ladder — gates each tier's ceiling (Fast caps at 720p; Standard reaches 4K) */
const STAGE_RESOLUTIONS = ["480p","720p","1080p","4K"];
function stageResRank(r){ const i = STAGE_RESOLUTIONS.indexOf(String(r||"")); return i<0 ? 1 : i; }
function stageResAllowed(tierObj, r){ return stageResRank(r) <= stageResRank((tierObj&&tierObj.maxRes)||"1080p"); }

/* this render's credit cost from the registry rates: seconds × tier/resolution rate,
   rounded up, never below 1. Every cost-bearing setting (model tier, resolution,
   duration) flows through here so the Generate button always shows the true price. */
function stageRenderCost(tierObj, resolution, durationSec){
  const rate = Number(tierObj && tierObj.creditRate && tierObj.creditRate[resolution]);
  const r = rate>0 ? rate : 1;
  const s = Math.max(1, Number(durationSec)||5);
  // credits are denominated ×CREDIT_SCALE so plan allowances read generously (800 not
  // 80) — grant AND cost scale together, so real value is unchanged. Round after
  // scaling so lower-cost models/resolutions don't over-round to a whole base credit.
  const scale = Number(window.CREDIT_SCALE)||1;
  return Math.max(1, Math.ceil(s*r*scale));
}
window.SEEDANCE_MODELS = SEEDANCE_MODELS;
/* tier creditRates are COPIES of the pricing table (turnVideoCreditRates builds a
   new object), so an admin-applied pricing override would leave them stale —
   refresh them in place whenever the table changes. */
window.addEventListener("turn-pricing-changed", ()=>{
  SEEDANCE_MODELS.forEach(m=> (m.tiers||[]).forEach(t=>{
    const r = (typeof window.turnVideoCreditRates==="function") && window.turnVideoCreditRates(m.id, t.id);
    if(r) t.creditRate = r;
  }));
});
/* per-shot seconds interval grid for the Multi-shot composer (bounded per model —
   the stepper filters anything past the model's cap, so the 20s/30s rungs only ever
   surface on Seedance 2.5-class models) */
window.STAGE_MS_STEPS = [4, 8, 12, 15, 20, 30];

/* ---- camera vocabulary Seedance 2.0 is tuned to recognise (fal.ai prompting guide:
   "Subject + Action + Camera + Scene/Lighting + Style", named cinematographer terms). ---- */
const SEEDANCE_CAMERA_MOVES = [
  "Slow push in", "Push in", "Pull back", "Dolly zoom", "Rack focus", "Tracking shot",
  "Handheld drift", "POV switch", "Aerial shot", "Orbit", "Whip pan", "Tilt up", "Crane up",
  "Locked-off tableau",
];
function _seedanceVoiceSec(sh){
  const ms = sh && sh.lineAudio && sh.lineAudio.durationMs;
  if(ms) return Math.round(ms/100)/10;                                  // measured audio
  const w = String((sh&&sh.dialogue)||"").trim().split(/\s+/).filter(Boolean).length;
  return w ? Math.max(1, Math.round(w/2.4)) : 0;                        // estimate from word count
}
function _seedanceShotGrammar(sh){
  if(typeof shotGrammarLabel==="function") return shotGrammarLabel(sh);
  const size = (typeof shotSizeOf==="function") ? shotSizeOf(sh&&sh.size).label : (sh&&sh.size);
  const angle = (typeof shotAngleOf==="function") ? shotAngleOf(sh&&sh.angle).label : (sh&&sh.angle);
  const move = (typeof shotMoveOf==="function") ? shotMoveOf(sh&&sh.move).label : (sh&&sh.move);
  const lens = (typeof shotLensOf==="function") ? shotLensOf(sh&&sh.lens).label : (sh&&sh.lens);
  return [size, angle, move, lens].filter(Boolean).join(" · ");
}
function _stageAgo(ts){
  if(!ts) return "";
  const s = Math.max(0, (Date.now()-Number(ts))/1000);
  if(s<60) return "just now";
  if(s<3600) return Math.round(s/60)+"m ago";
  if(s<86400) return Math.round(s/3600)+"h ago";
  return Math.round(s/86400)+"d ago";
}
// short + long names for a take's visual source (meta.source) in version labels
const STAGE_SOURCE_SHORT = { frame:"frame", frames:"frames", halves:"halves", sheet:"sheet" };
function _stageTakeVno(t, list, i){
  const v = t && t.meta && t.meta.vno;
  return v ? ("v"+v) : ("v"+((list?list.length:0)-i));   // legacy takes (pre-vno) fall back to position
}
/* @AudioN numbering follows the clip's lineShots order — the same order the audio
   assets are pushed into the composer (and the REFERENCES block) at render. */
function stageLineAudioIndex(d, shotId){
  if(d && d.audioRefsOn===false) return 0;   // native performance: no audio refs → no @Audio tags
  let list = ((d&&d.lineShots)||[]);
  // when the console tells us which lines actually attach (user deselections), number
  // within THAT order — a dropped line must not shift the tags off their files
  if(d && Array.isArray(d.audioIncluded)) list = list.filter(sh=>sh && d.audioIncluded.indexOf(sh.id)>=0);
  const i = list.findIndex(sh=>sh&&sh.id===shotId);
  return i>=0 ? i+1 : 0;
}
function _seedancePanelText(sh, p, i, clip){
  const label = p.sheetPage ? ("Sheet "+p.sheetPage+" Panel "+p.sheetPanel) : ("Panel "+(((clip.scene&&clip.scene.no)||1)+"."+(i+1)));
  const grammar = _seedanceShotGrammar(sh);
  const script = String(p.script||"").trim();
  const blocking = String(p.sheet||sh.action||"").trim();
  const speaker = (p.speaker&&p.speaker.name) || "the speaker";
  const dialogue = String(sh&&sh.dialogue||"").trim().replace(/^["“]|["”]$/g,"");
  const dur = dialogue ? _seedanceVoiceSec(sh) : 0;
  return [
    "SHOT "+(i+1)+" — "+label+" · Beat "+(sh.beatN||"—"),
    grammar && ("Camera: "+grammar+"."),
    script && ("Script intent: "+script),
    blocking && (!script || _normStageText(blocking)!==_normStageText(script)) && ("Storyboard blocking: "+blocking),
    dialogue && (()=>{ const aIdx = stageLineAudioIndex(clip&&clip.data, sh.id);
      return "Dialogue/audio: "+speaker+" says \""+dialogue+"\""+(dur?(" (~"+dur+"s)"):"")+"."
        + (aIdx?(" Lip-sync "+speaker+" to @Audio"+aIdx+"."):" Sync to the matching audio reference if included."); })(),
    "Motion: animate only this beat's physical change; keep it continuous from the prior shot unit and ready for the next."
  ].filter(Boolean).join("\n");
}
function seedancePrompt(recipe, clip){
  const d = (clip&&clip.data) || {}, shots = d.shots || [];
  const cast = (d.cast||[]).map(c=>c.name);
  const props = (d.props||[]).map(p=>p.name);
  const setting = d.setting || "";
  const style = d.preset ? (d.preset.name+" — "+d.preset.grade) : "";
  const lead = d.lead || (cast[0] || "the subject");
  const panelLines = d.panelLines || [];
  const actionLines = _uniq((panelLines.length ? panelLines.map(p=>p.text) : shots.map(s=>String(s.action||"").trim())).filter(Boolean));
  const dialogueSpeakers = _uniq(panelLines.filter(p=>p&&p.speaker&&p.speaker.name).map(p=>p.speaker.name));
  const voiceLead = dialogueSpeakers[0] || lead;
  if(recipe==="structured"){
    return [
      cast.length && ("Subject: "+cast.join(", ")+"."),
      "Action: "+actionLines.join(" "),
      setting && ("Setting: "+setting+"."),
      "Camera: "+(d.camera||"static")+".",
      d.lighting && ("Lighting: "+d.lighting+"."),
      style && ("Style: "+style+"."),
    ].filter(Boolean).join("\n");
  }
  if(recipe==="lipsync"){
    // every spoken line gets ITS OWN speaker + @AudioN pairing (clip-wide lineShots
    // order = the order the audio assets are attached), so a two-hander never reads
    // as one character delivering both lines.
    const lineShotsAll = d.lineShots||[];
    // number lip-sync tags only over the lines that really attach (user deselections)
    const lineShots = Array.isArray(d.audioIncluded)
      ? lineShotsAll.filter(sh=>sh && d.audioIncluded.indexOf(sh.id)>=0)
      : lineShotsAll;
    const allLines = d.allPanelLines || panelLines;
    const nameOf = (sh)=>{ const p = allLines.find(x=>x&&x.shotId===(sh&&sh.id));
      return (p&&p.speaker&&p.speaker.name) || (sh&&sh.lineAudio&&sh.lineAudio.speaker) || voiceLead; };
    const tail = (setting?(" "+setting+"."):"") + (style?(" "+style+"."):"");
    // NATIVE PERFORMANCE (no audio refs): the model acts the lines itself — name the
    // words, not @Audio files, and leave the pacing to the performance
    if(d.audioRefsOn===false){
      const say = (sh)=>String((sh&&sh.dialogue)||"").trim().replace(/^["“]|["”]$/g,"");
      if(lineShots.length>1){
        const seq = lineShots.map((sh)=> nameOf(sh)+" says \""+say(sh)+"\"").join(", then ");
        return "@Image1 comes alive. "+seq+" — each performing their line in their own natural, in-character voice. Let the moment breathe between the lines — a look, a reaction. Grounded performances; subtle, motivated motion; hold the framing, lighting and identity steady."+tail;
      }
      const one = lineShots[0];
      const sp1 = one ? nameOf(one) : voiceLead;
      const ln1 = one ? say(one) : "";
      return "@Image1 comes alive. "+sp1+" performs the line "+(ln1?("\""+ln1+"\" "):"")+"in a natural, in-character voice with free, believable pacing. Subtle, motivated motion; hold the framing, lighting and identity steady."+tail;
    }
    // PLACEMENT: when the clip runs longer than the speech (the 4s floor, or budgeted
    // air), say where the line lands — otherwise the model guesses and the extra
    // seconds come out as unguided vamping.
    const lineSecTotal = lineShots.reduce((t,sh)=>t+(_seedanceVoiceSec(sh)||0),0);
    const clipSec = Number(d.dur)||0;
    const roomy = !!(clipSec && lineSecTotal && (clipSec-lineSecTotal)>=1.2);
    if(lineShots.length>1){
      const seq = lineShots.map((sh,i)=> nameOf(sh)+" delivers their line in @Audio"+(i+1)).join(", then ");
      return "@Image1 comes alive. "+seq+" — each line lip-synced to its own audio reference, and only the named speaker's lips move on their line. Let the moment breathe between the lines — a look, a reaction, a beat of stillness. Grounded, in-character performances; subtle, motivated motion; hold the framing, lighting and identity steady."+tail;
    }
    const speaker1 = lineShots[0] ? nameOf(lineShots[0]) : voiceLead;
    return "@Image1 comes alive. "+speaker1+" delivers the line in @Audio1 with natural, accurate lip-sync — a grounded, in-character performance."
      +(roomy ? (" The line lands about "+CLIP_AIR.lead+"s in — settle the moment before it and hold "+speaker1+"'s reaction after it.") : "")
      +" Subtle, motivated motion; hold the framing, lighting and identity steady."+tail;
  }
  if(recipe==="timeline"){
    // time-coded windows — Seedance paces motion to described segments (0–4s, 4–9s…).
    // Dialogue windows carry BREATHING ROOM (the same CLIP_AIR the clip clock budgets):
    // the line is PLACED inside its window with air before and after, so the described
    // action has real seconds to happen in instead of wall-to-wall speech.
    const r1 = (x)=>Math.round(x*10)/10;
    let t = 0, spokenSeen = 0;
    const lastSpokenIdx = shots.reduce((k,sh,i)=> String(sh&&sh.dialogue||"").trim() ? i : k, -1);
    const windows = shots.map((sh,i)=>{
      const p = panelLines[i]||{};
      const dialogue = String(sh&&sh.dialogue||"").trim().replace(/^["“]|["”]$/g,"");
      const lineSec = dialogue ? _seedanceVoiceSec(sh) : 0;
      const lead = dialogue ? (spokenSeen===0 ? CLIP_AIR.lead : CLIP_AIR.gap) : 0;
      const tail = (dialogue && i===lastSpokenIdx) ? CLIP_AIR.tail : 0;
      const dur = dialogue ? (lead + lineSec + tail) : stageShotRuntime(sh);
      const a = r1(t), b = r1(t+dur), lineAt = r1(t+lead), lineEnd = r1(t+lead+lineSec);
      t += dur; if(dialogue) spokenSeen++;
      const grammar = _seedanceShotGrammar(sh);
      const speaker = (p.speaker&&p.speaker.name) || "the speaker";
      const aIdx = dialogue ? stageLineAudioIndex(d, sh.id) : 0;
      return a+"–"+b+"s: "+(String(p.text||sh.action||"").trim()||"Hold the moment.")
        + (grammar?(" Camera: "+grammar+"."):"")
        + (dialogue?(" "+speaker+" says \""+dialogue+"\" at ~"+lineAt+"–"+lineEnd+"s"
            +(aIdx?(" — lip-sync "+speaker+" to @Audio"+aIdx):"")
            +"; let the moment breathe before and after the line."):"");
    });
    const head = [
      "One continuous "+(d.dur||"4-15")+"s clip, paced to the time-coded segments below — no hard cuts unless a segment demands one.",
      cast.length && ("Cast: "+cast.join(", ")+"."),
      setting && ("Setting: "+setting+"."),
      style && ("Style: "+style+"."),
      d.lighting && ("Lighting: "+d.lighting+"."),
    ].filter(Boolean).join(" ");
    return head+"\n"+windows.join("\n");
  }
  if(recipe==="panels"){
    const context = [
      "SEEDANCE MULTIMODAL SHOT PLAN",
      "Clip: "+((clip&&clip.label)||"selected clip")+" from "+((clip&&clip.scene&&clip.scene.title)||"the scene")+".",
      setting && ("Setting: "+setting+"."),
      cast.length && ("Cast in frame: "+cast.join(", ")+"."),
      props.length && ("Props that must carry through when present: "+props.join(", ")+"."),
      style && ("Look: "+style+"."),
      d.lighting && ("Lighting: "+d.lighting+"."),
      d.camera && ("Camera arc: "+d.camera+"."),
      "Reference roles: the selected start image or storyboard half/page controls composition and blocking; character, prop and location references control identity, objects and geography; audio references control spoken timing and lip-sync.",
      "Generate one continuous "+(d.dur||"4-15")+"s clip. Treat the shot units below as ordered key moments inside that clip, not as separate unrelated images."
    ].filter(Boolean).join("\n");
    const panels = shots.map((sh,i)=>_seedancePanelText(sh, panelLines[i]||{}, i, clip)).join("\n\n");
    const rules = [
      "Continuity rules:",
      "1. Match the referenced storyboard panel order and the screenplay beat order exactly.",
      "2. If screenplay intent and storyboard blocking differ, keep the screenplay dialogue/intent but use storyboard blocking for where bodies, props and camera begin.",
      "3. Do not invent extra beats, extra speakers, new props, new costumes or a different location.",
      "4. Preserve character identity, wardrobe, carried props, lighting and location geometry across the whole clip.",
      "5. Let Seedance pace the motion naturally inside the target duration; avoid freeze-frame panel cuts unless the action demands a cut."
    ].join("\n");
    return [context, panels, rules].filter(Boolean).join("\n\n");
  }
  return d.prompt || "";   // narrative (default)
}

function seedanceBeatPrompt(clip, sh){
  const d = (clip&&clip.data) || {};
  const p = ((d.panelLines||[]).find(x=>x.shotId===(sh&&sh.id))) || {};
  const cast = (d.cast||[]).map(c=>c.name).filter(Boolean);
  const props = (d.props||[]).map(p=>p.name).filter(Boolean);
  const setting = d.setting || (clip&&clip.scene&&clip.scene.loc) || "";
  const style = d.preset ? (d.preset.name+" — "+d.preset.grade) : "";
  const script = String(p.script||stageShotScriptText(clip&&clip.scene, {}, sh, 220)||"").trim();
  const blocking = String(p.sheet||sh&&sh.action||"").trim();
  const dialogue = String(sh&&sh.dialogue||"").trim().replace(/^["“]|["”]$/g,"");
  const speaker = (p.speaker&&p.speaker.name) || "the speaker";
  const parts = [
    cast.length && ("Subject: "+cast.join(", ")+"."),
    (script || blocking) && ("Action: "+(script || blocking)+(script && blocking && _normStageText(script)!==_normStageText(blocking) ? (" Storyboard blocking: "+blocking) : "")),
    dialogue && ("Dialogue/audio: "+speaker+" says \""+dialogue+"\""
      +(d.audioRefsOn===false ? "; performed in a natural, in-character voice." : "; sync performance to the locked audio if present.")),
    setting && ("Setting: "+setting+"."),
    "Camera: "+(_seedanceShotGrammar(sh)||d.camera||"static")+".",
    d.lighting && ("Lighting: "+d.lighting+"."),
    style && ("Style: "+style+"."),
    "Continuity: preserve identity, wardrobe, carried props, lighting and location geography from the references; animate only this beat's physical change."
  ].filter(Boolean);
  // one labelled field per line — readable, and the model parses it just as well
  return parts.join("\n");
}

/* seedancePrompt()/SEEDANCE_RECIPES above describe a whole CLIP (every shot in the
   sceneSequences group). The console renders one BEAT at a time, so reuse the same
   recipes scoped to just the active beat's shots (shownShots) rather than the clip's —
   otherwise "Panel-by-panel"/"Structured" would describe shots the render never sees. */
function seedanceBeatData(clip, shots){
  const d = (clip&&clip.data) || {};
  const ids = new Set((shots||[]).map(s=>s&&s.id));
  // allPanelLines stays CLIP-WIDE: @AudioN indices + speaker names must resolve against
  // the whole clip's line order even when the prompt is scoped to one beat.
  return { ...d, shots:shots||[], panelLines:(d.panelLines||[]).filter(p=>ids.has(p.shotId)), allPanelLines:d.panelLines||[] };
}
function seedanceRecipePrompt(recipeId, clip, shots, activeShot, audioRefsOn, audioIncluded){
  const scoped = { ...clip, data:{ ...seedanceBeatData(clip, shots),
    audioRefsOn: audioRefsOn!==false,
    audioIncluded: Array.isArray(audioIncluded) ? audioIncluded : null } };
  const base = (!recipeId || recipeId==="narrative") ? seedanceBeatPrompt(scoped, activeShot) : seedancePrompt(recipeId, scoped);
  // Standing soundtrack rule (user direction): generation audio is the WORLD only —
  // spoken dialogue (when specified above) plus environmental/diegetic SFX and
  // ambience. Music belongs to post; text must never be burned into pixels.
  return base + "\nAUDIO & OVERLAYS: besides any spoken dialogue specified above, the soundtrack is environmental and diegetic sound effects with natural ambience ONLY — NO background music, NO score, NO soundtrack. NO subtitles, captions or any burned-in text overlays anywhere in the frame.";
}

/* ---- @mention role assignment. Seedance treats attached references it isn't told
   about as ambient at best — best practice is one declared-role sentence per input
   ("Use @Image1 as the main character reference", "match the pacing from @Video1").
   Derived automatically from each asset's key/label; appended to the prompt at render. */
function stageAssetTagShort(a){
  const n = (String(a&&a.tag||"").match(/\d+$/)||[""])[0];
  return "@"+({ text:"Txt", image:"Img", video:"Vid", audio:"Aud" }[a&&a.kind]||"Ref")+n;
}
function stageAssetMention(a){
  const n = (String(a&&a.tag||"").match(/\d+$/)||[""])[0];
  return "@"+({ image:"Image", video:"Video", audio:"Audio" }[a&&a.kind]||"")+n;
}
function stageAssetRole(a){
  if(!a || a.kind==="text") return "";
  const T = stageAssetMention(a);
  const k = String(a.key||"");
  const label = String(a.label||"").trim();
  if(a.kind==="audio") return T+" is "+(label.replace(/\s+line$/i,"")||"the speaker")+"'s spoken line — sync lip movement and timing to it.";
  if(a.kind==="video") return T+" is the previous clip — match its camera movement, pacing and continuity.";
  if(k==="frame") return T+" is the first frame — start from this exact composition.";
  if(k.indexOf("shotframe:")===0) return T+" is "+(label.toLowerCase()||"a later shot's frame")+" — anchor that shot's composition and blocking to it.";
  if(k.indexOf("sb-half")===0 || k==="sb-sheet") return T+" is the storyboard for this clip — follow its composition, blocking and panel order.";
  if(k.indexOf("c:")===0) return T+" is "+(label.replace(/\s+reference$/i,"")||"the character")+"'s identity reference — keep their appearance exactly consistent.";
  if(k==="loc") return T+" is the "+(label||"location plate")+" — keep its geography and lighting.";
  if(k.indexOf("p:")===0) return T+" is the "+(label||"prop")+" — keep this object's design consistent.";
  return T+" is "+(label||"a reference")+".";
}

function ClipConsole({ clip, selectedShot, sceneClips, ctx, imgs, auds, beatsMap, drafts, prevClipVideoId, aspect, visualSource, setVisualSource, creditBalance, onVoiceLine, onUpdateShot, onSelectClip, modelId, setModelId, packMode, setPackMode, onOpenVersions, pendingReuse, onReuseConsumed }){
  const scene = clip.scene, g = clip.g, d = clip.data;
  // the CLIP is the unit of generation — it may bundle 2+ merged shots (Art Room Shots
  // "merge" / Storyboards "Compose from shot frames" / a cropped sheet-half = 1 clip).
  // activeShot is just which of the clip's shots is shown as context/poster, not a
  // separate render target.
  const activeShot = selectedShot || d.first || (d.shots||[])[0] || {};
  const beatVideoId = clip.id;
  const gen = useSeedanceGen(beatVideoId);
  const [takeList, setTakeList] = React.useState(()=> typeof vidGetTakes==="function" ? vidGetTakes(beatVideoId) : []);
  const [activeTakeUrl, setActiveTakeUrl] = React.useState(()=> (typeof vidGetVideo==="function" ? vidGetVideo(beatVideoId) : "") || "");
  // versions actions (approve/notes/restore/delete) change take meta WITHOUT changing
  // the current video url — bump a tick off vid-done so the lists re-read either way
  const [takeTick, setTakeTick] = React.useState(0);
  React.useEffect(()=>{
    const onDone=(e)=>{ if(e.detail&&e.detail.ids&&e.detail.ids.indexOf(beatVideoId)>=0) setTakeTick(t=>t+1); };
    window.addEventListener("vid-done", onDone);
    return ()=>window.removeEventListener("vid-done", onDone);
  }, [beatVideoId]);
  React.useEffect(()=>{ let alive=true;
    const sync = typeof vidGetTakes==="function" ? vidGetTakes(beatVideoId) : [];
    setTakeList(sync);
    setActiveTakeUrl((sync[0]&&sync[0].url) || "");
    if(typeof vidLoadTakes==="function"){
      vidLoadTakes(beatVideoId).then(t=>{ if(alive){ setTakeList(t||[]); setActiveTakeUrl((t&&t[0]&&t[0].url) || ""); } });
    } else if(typeof vidLoadVideo==="function") {
      vidLoadVideo(beatVideoId).then(u=>{ if(alive&&u){ const t=typeof vidGetTakes==="function"?vidGetTakes(beatVideoId):[{id:beatVideoId+":current",url:u,current:true}]; setTakeList(t); setActiveTakeUrl((t[0]&&t[0].url)||u); } });
    }
    return ()=>{ alive=false; };
  }, [beatVideoId, gen.videoUrl, takeTick]);
  const visibleTakes = (takeList&&takeList.length) ? takeList : (gen.videoUrl ? [{ id:beatVideoId+":current", url:gen.videoUrl, meta:(typeof vidGetMeta==="function"?vidGetMeta(beatVideoId):null), current:true }] : []);
  const playerUrl = activeTakeUrl || (visibleTakes[0]&&visibleTakes[0].url) || gen.videoUrl || "";
  const shotStartFrame = imgs[activeShot.id] || imgs[(d.first||{}).id] || "";
  const storyAssets = storyboardClipAssets(clip, imgs);
  // visual source: Auto follows the researched per-clip rule (stageClipSourcePlan);
  // the Render-settings panel can override it for this clip.
  const sourcePlan = stageClipSourcePlan(clip, imgs);
  const [sourceOverride, setSourceOverride] = React.useState("auto");
  React.useEffect(()=>{ setSourceOverride("auto"); }, [clip.id]);
  const sourceMode = sourceOverride==="auto" ? sourcePlan.mode : sourceOverride;
  const sourceMeta = STAGE_SOURCE_MODES[sourceMode] || STAGE_SOURCE_MODES.frame;
  const usePanels = sourceMode==="halves" || sourceMode==="sheet";
  const firstStoryHalf = ((storyAssets.halves||[])[0]||{}).url || storyAssets.top || storyAssets.bottom || "";
  const startFrame = sourceMode==="halves" ? (firstStoryHalf || storyAssets.sheet || "")
    : sourceMode==="sheet" ? (storyAssets.sheet || firstStoryHalf || "")
    : (imgs[(d.first||{}).id] || shotStartFrame);
  const prevVideo = prevClipVideoId ? ((typeof vidGetVideo==="function") ? vidGetVideo(prevClipVideoId) : "") : "";
  const [previewId, setPreviewId] = React.useState(activeShot.id || (d.first||{}).id || null);
  React.useEffect(()=>{ setPreviewId(activeShot.id || (d.first||{}).id || null); }, [activeShot.id, clip.id]);
  const previewFrame = usePanels ? startFrame : (imgs[previewId] || startFrame);
  // the clip's own shots — this IS the render unit now, not a same-beatN subset.
  const shownShots = (d.shots||[]).length ? d.shots : [activeShot].filter(Boolean);
  const beatLabel = clip.label;
  const beatName = clipBeatName(clip, beatsMap, drafts);
  const clipsInScene = (sceneClips&&sceneClips.length) ? sceneClips : [clip];

  // ---- the derived INPUT ASSETS (tagged, toggleable), capped to Seedance's 12 ----
  /* DIALOGUE AUDIO MODE (per clip): "locked" = lip-sync to the ElevenLabs line audio
     (refs attached, duration locked to speech + air); "native" = let the model ACT the
     lines itself — no audio refs, free pacing, and the voices get swapped to the locked
     ones in post (ElevenLabs Voice Changer keeps the performance, changes the timbre). */
  const [dialogueAudio, setDialogueAudio] = React.useState("locked");
  const assets = React.useMemo(()=>{
    // model shape decides WHAT can ride: a Sora-class engine takes one start image
    // only, so identity/prop/location/video refs never appear as inputs, and audio
    // lines appear only when they'd really attach (locked voice mode on a refs model)
    const _m = seedanceModelOf(modelId);
    const _mRefs = _m.refs!==false, _mAud = _m.audioRefs!==false;
    const out = [];
    out.push({ key:"text", kind:"text", label:"Prompt", ready:true, locked:true });
    if(sourceMode==="halves"){
      const hs = (storyAssets.halves&&storyAssets.halves.length) ? storyAssets.halves : [
        storyAssets.top && { id:storyAssets.ids&&storyAssets.ids.legacyTop, url:storyAssets.top },
        storyAssets.bottom && { id:storyAssets.ids&&storyAssets.ids.legacyBottom, url:storyAssets.bottom },
      ].filter(Boolean);
      hs.forEach((h,i)=>out.push({ key:"sb-half-"+i, kind:"image", label:"Storyboard "+(i+1)+" / "+hs.length+" for this clip", url:h.url, ready:true, locked:true, id:h.id }));
      if(!hs.length) out.push({ key:"sb-missing", kind:"image", label:"Storyboard halves", ready:false, locked:true });
    } else if(sourceMode==="sheet"){
      if(storyAssets.sheet) out.push({ key:"sb-sheet", kind:"image", label:"Full storyboard sheet", url:storyAssets.sheet, ready:true, locked:true, id:storyAssets.ids&&storyAssets.ids.sheet });
      else out.push({ key:"sb-missing", kind:"image", label:"Storyboard sheet", ready:false, locked:true });
    } else if(sourceMode==="frames"){
      // per-shot frames: each merged shot's frame anchors its own moment in the clip —
      // the first is the start frame; ALL are deselectable (excluding the start frame
      // renders the clip from the prompt + remaining references, no image anchor).
      // A one-image model (Sora) takes only the first frame, so only that one shows.
      (d.shots||[]).slice(0, _mRefs ? undefined : 1).forEach((sh,i)=>{ const u=imgs[sh.id];
        out.push({ key:i===0?"frame":("shotframe:"+sh.id), kind:"image",
          label:"Shot "+(i+1)+" frame", url:u, ready:!!u, id:sh.id }); });
    } else {
      const firstFrame = imgs[(d.first||{}).id] || shotStartFrame;
      // deselectable: excluding the start frame renders from the prompt + references
      // alone (no image anchor) — the user's call, e.g. to escape a bad frame's pull
      if(firstFrame) out.push({ key:"frame", kind:"image", label:(d.cast[0]?d.cast[0].name+" — shot frame":"Shot start frame"), url:firstFrame, ready:true, id:(d.first||{}).id||activeShot.id });
      else out.push({ key:"frame-missing", kind:"image", label:"Shot start frame", ready:false, locked:true });
    }
    if(_mRefs){
      d.cast.forEach(c=>{ const u=imgs[c.id]; out.push({ key:"c:"+c.id, kind:"image", label:c.name+" reference", url:u, ready:!!u, id:c.id }); });
      if(d.loc){
        // prefer the screenplay-derived coverage sheet (TOD/side accurate) when its
        // image exists; the master plate is the fallback, never the blind default
        const useCov = d.locSheet && imgs[d.locSheet.id];
        const lid = useCov ? d.locSheet.id : d.loc.id;
        const llab = useCov
          ? (d.locSheet.name+(d.locSheet.role?(" \u00b7 "+d.locSheet.role):"")+" coverage sheet")
          : (d.loc.name||"Location")+" plate";
        out.push({ key:"loc", kind:"image", label:llab, url:imgs[lid]||"", ready:!!imgs[lid], id:lid });
      }
      d.props.forEach(p=>{
        // the ACTIVE appearance-state variant sheet (never the stale base), labelled with
        // its state and current holder so the References block tells the video model
        // exactly who carries/wears it in this scene. A MISSING sheet must surface as a
        // missing ingredient — silently dropping it made the render invent the prop.
        const sid = p.sheetId || p.id;
        const u = imgs[sid];
        const plab = p.name+(p.stateLabel?(" \u2014 "+p.stateLabel):"")+(p.holder?(" \u00b7 "+(p.kind==="worn"?"worn by ":"carried by ")+p.holder):"");
        out.push({ key:"p:"+p.id, kind:"image", label:plab, url:u||"", ready:!!u, id:sid });
      });
      // SCENE-WIDE references: every cast/prop sheet used ANYWHERE in the scene is
      // available to TICK IN — per-clip packing defaults them OFF (they're not in this
      // clip's frame); whole-scene packing already lists them via d.cast/d.props, so
      // this only adds what the current clip doesn't already carry.
      const _inClip = {}; d.cast.forEach(c=>{ _inClip["c:"+c.id]=true; }); d.props.forEach(p=>{ _inClip["p:"+p.id]=true; });
      const _seenScene = {};
      (clipsInScene||[]).forEach(c2=>{
        const dd = (c2&&c2.data)||{};
        (dd.cast||[]).forEach(c=>{
          if(!c || !c.id || !c.name || _inClip["c:"+c.id] || _seenScene["c:"+c.id]) return;
          _seenScene["c:"+c.id]=true;
          const u = imgs[c.id];
          out.push({ key:"c:"+c.id, kind:"image", label:c.name+" reference (scene)", url:u||"", ready:!!u, id:c.id, sceneOnly:true });
        });
        (dd.props||[]).forEach(p=>{
          if(!p || !p.id || !p.name || _inClip["p:"+p.id] || _seenScene["p:"+p.id]) return;
          _seenScene["p:"+p.id]=true;
          const sid = p.sheetId || p.id, u = imgs[sid];
          out.push({ key:"p:"+p.id, kind:"image",
            label:p.name+(p.stateLabel?(" \u2014 "+p.stateLabel):"")+(p.holder?(" \u00b7 "+(p.kind==="worn"?"worn by ":"carried by ")+p.holder):"")+" (scene)",
            url:u||"", ready:!!u, id:sid, sceneOnly:true });
        });
      });
      if(prevVideo) out.push({ key:"prev", kind:"video", label:"Previous clip (continuity)", url:prevVideo, ready:true });
    }
    // every dialogue line IN THE CLIP (not just the previewed shot) is a candidate lip-sync
    // audio reference — a merged multi-shot clip needs all of its speakers' lines.
    // Only in LOCKED mode on a refs-capable model — and DESELECTABLE (not locked): a
    // user can drop a line's audio and let the model play that moment natively.
    if(_mAud && dialogueAudio==="locked") (d.lineShots||[]).forEach((sh,i)=>{
      const u=auds[sh.id];
      const p = (d.panelLines||[]).find(x=>x.shotId===sh.id);
      const speaker = (p&&p.speaker&&p.speaker.name) || (sh.lineAudio&&sh.lineAudio.speaker) || "Line";
      // an unvoiced dialogue line is a MISSING ingredient, not an absent one — the
      // package must show it or the user only learns at lip-sync time
      out.push({ key:"a:"+sh.id, kind:"audio", label:speaker+" line", url:u||"", ready:!!u, shotId:sh.id });
    });
    return out;
  }, [clip.id, activeShot.id, sourceMode, dialogueAudio, modelId, shotStartFrame, JSON.stringify((storyAssets.halves||[]).map(h=>h.id+":"+!!h.url)), storyAssets.top, storyAssets.bottom, storyAssets.sheet, prevVideo, JSON.stringify(d.cast), JSON.stringify(d.props), d.loc&&d.loc.id, d.locSheet&&d.locSheet.id, JSON.stringify((clipsInScene||[]).map(c=>c.id+":"+JSON.stringify((c.data&&c.data.cast)||[])+":"+JSON.stringify(((c.data&&c.data.props)||[]).map(p=>p.id+"|"+(p.sheetId||"")+"|"+(p.stateLabel||"")+"|"+(p.holder||""))))), imgs, auds]);

  // assets default ON when ready; user can toggle (off set). @tags number the INCLUDED
  // assets only — attachment order is what fal sees, so excluding @Image2 must renumber
  // the rest or every later label points at the wrong file.
  const [off, setOff] = React.useState(()=>new Set());
  // scene-wide references default OFF (not in this clip's frame) — ticking one adds it
  // to extraOn; clip-derived references keep the include-by-default off-set. Both are
  // id-keyed, so choices carry sensibly across clips of the same scene.
  const [extraOn, setExtraOn] = React.useState(()=>new Set());
  const [imgFail, setImgFail] = React.useState(()=>new Set());   // "key|url" pairs whose image failed to load — keyed BY URL so a regenerated/refreshed image (new URL) automatically retries instead of staying stuck on the placeholder
  const imgFailed = (a)=> imgFail.has(a.key+"|"+(a.url||""));
  const noteImgFail = (a)=> setImgFail(s=>{ const k=a.key+"|"+(a.url||""); if(s.has(k)) return s; const n=new Set(s); n.add(k); return n; });
  const on = (a)=> a.ready && (a.sceneOnly ? extraOn.has(a.key) : !off.has(a.key));
  const tagged = React.useMemo(()=>{ const n={text:0,image:0,video:0,audio:0};
    return assets.map(a=>{
      if(!on(a)) return { ...a, tag:"" };
      n[a.kind]++; return { ...a, tag:"@"+a.kind+n[a.kind] }; }); }, [assets, off, extraOn]);
  const toggle = (a)=>{ if(a.locked||!a.ready) return;
    const set = a.sceneOnly ? setExtraOn : setOff;
    set(s=>{ const n=new Set(s); n.has(a.key)?n.delete(a.key):n.add(a.key); return n; }); };
  const assetState = (a)=> !a.ready ? "missing" : a.locked ? "required" : on(a) ? "included" : "excluded";
  const assetStateLabel = (a)=> assetState(a)==="required" ? "Required" : assetState(a)==="included" ? "Included" : assetState(a)==="excluded" ? "Excluded" : "Missing";
  const assetTitle = (a)=>{
    const st = assetState(a), base = a.label+(a.tag?(" · "+a.tag):"");
    if(st==="required") return base+" · required for this render";
    if(st==="included") return base+" · included, click to exclude";
    if(st==="excluded") return base+" · excluded, click to include";
    return base+" · missing; generate this source asset first";
  };
  const onImages = tagged.filter(a=>a.kind==="image" && on(a));
  const onVideos = tagged.filter(a=>a.kind==="video" && on(a));
  const onAudios = tagged.filter(a=>a.kind==="audio" && on(a));
  // the line-audio files that will REALLY attach (order = @AudioN order) — the recipes
  // number their lip-sync tags from this, so a deselected line drops out consistently
  const audioIncluded = onAudios.map(a=>a.shotId).filter(Boolean);
  const onAssets = tagged.filter(on);
  // NB: `model` is only declared further below — resolve from modelId here instead
  const assetLimit = seedanceModelOf(modelId).maxAssets || 12;   // Seedance 2.5 raises the input budget to 50
  const assetOver = onAssets.length > assetLimit;
  const budgetUsed = onAssets.length;
  const budgetOverBy = Math.max(0, budgetUsed-assetLimit);
  const budgetLeft = Math.max(0, assetLimit-budgetUsed);
  const budgetPct = Math.min(100, Math.round((budgetUsed/assetLimit)*100));
  const budgetState = assetOver ? "over" : budgetLeft===0 ? "full" : budgetLeft<=2 ? "near" : "ok";
  const budgetText = assetOver ? (budgetOverBy+" over cap") : budgetLeft===0 ? "At cap" : (budgetLeft+" slot"+(budgetLeft!==1?"s":"")+" left");
  const counts = { text:tagged.filter(a=>a.kind==="text" && on(a)).length, images:onImages.length, videos:onVideos.length, audio:onAudios.length };
  // the planner is the single source of truth for source readiness — in frames mode
  // EVERY shot's frame must exist (sourcePlan.ready), not just the first, or Generate
  // green-lights a clip whose later shots have no anchor at all
  const sourceReady = sourceMode==="halves" ? sourcePlan.hasHalves
    : sourceMode==="sheet" ? sourcePlan.hasSheet
    : sourceMode==="frames" ? sourcePlan.framesReady
    : !!(imgs[(d.first||{}).id] || shotStartFrame);
  const sourceLabel = sourceMeta.label;

  // ---- console controls (rendered in the composer pills + the Settings drawer below) ----
  const dialogueSpeakers = _uniq((d.panelLines||[]).filter(p=>p&&p.speaker&&p.speaker.name).map(p=>p.speaker.name));
  const [camera, setCamera] = React.useState(d.camera);
  const [lighting, setLighting] = React.useState(d.lighting);
  const [perf, setPerf] = React.useState(dialogueSpeakers[0] || d.lead);
  // modelId/setModelId come from StageView — the model choice drives CLIP PACKING
  // (sceneSequences shot caps), so it has to live above the per-clip console.
  const [tier, setTier] = React.useState("standard");
  const [resolution, setResolution] = React.useState("720p");
  const [bitrate, setBitrate] = React.useState("standard");   // fal bitrate_mode: standard | high (compression, not price)
  const [seedInput, setSeedInput] = React.useState("");
  const [lastSeed, setLastSeed] = React.useState(null);
  const [nativeAudio, setNativeAudio] = React.useState(true);
  const [durationOverride, setDurationOverride] = React.useState(null);   // null = auto/locked
  const [endFrameId, setEndFrameId] = React.useState("");
  const [aspectOverride, setAspectOverride] = React.useState(null);   // null = project format's ratio
  const effAspect = aspectOverride || aspect || "16:9";
  const [batchN, setBatchN] = React.useState(1);   // takes per Generate (1-4 parallel fal jobs, distinct seeds)
  // recipe defaults follow the clip's shape + visual source; a manual pick sticks
  // (per clip) and stops the auto-follow until the next clip is selected.
  // whole-scene packing defaults to its dedicated "Whole scene" tab (the combined
  // scene prompt); per-clip packing keeps the smart per-clip recipe pick
  const defaultRecipe = ()=> packMode==="scene" ? "scene" : stageSmartRecipe(clip, sourceMode, modelId);
  const [recipe, setRecipe] = React.useState(defaultRecipe);
  const [recipeTouched, setRecipeTouched] = React.useState(false);
  const pickRecipe = (id)=>{ setRecipeTouched(true); setRecipe(id); };
  // NOTE: the "new clip → reset recipe" effect lives BELOW with the Multi-shot row
  // state — clip.id alone can't key it (see the repack note there).
  React.useEffect(()=>{ if(!recipeTouched) setRecipe(defaultRecipe()); }, [sourceMode, modelId]);
  // leaving whole-scene mode retires the "scene" tab — fall back to the smart pick
  React.useEffect(()=>{
    if(packMode==="scene" && !recipeTouched) setRecipe("scene");
    if(packMode!=="scene" && recipe==="scene"){ setRecipeTouched(false); setRecipe(stageSmartRecipe(clip, sourceMode, modelId)); }
  }, [packMode]);
  // the render-settings panel docks on the RIGHT like the Writers' Room inspector —
  // open by default, collapsible to a slim strip, remembered across sessions.
  const [settingsOpen, _setSettingsOpen] = React.useState(()=>{ try{ return localStorage.getItem("turn_stage_settings_open")!=="0"; }catch(e){ return true; } });
  const setSettingsOpen = React.useCallback((v)=>{
    _setSettingsOpen(prev=>{
      const next = (typeof v==="function") ? v(prev) : !!v;
      try{ localStorage.setItem("turn_stage_settings_open", next?"1":"0"); }catch(e){}
      return next;
    });
  },[]);
  const model = seedanceModelOf(modelId);
  const tierObj = seedanceTierOf(model, tier) || { id:"standard", label:"Standard", fast:false, maxRes:"1080p" };
  // PLAN GATES — per-tier entitlements (plans.jsx): Writer=Kling+720p, Director=all
  // models+1080p, Studio=4K+batch. Locked options stay visible and clickable — the
  // click opens the plans modal (upsell), never a silent dead button.
  const planGate = (typeof window.turnTierGates==="function") ? window.turnTierGates(creditBalance) : null;
  const planAllowsModel = (id)=> !planGate || (typeof window.turnGateAllowsModel!=="function") || window.turnGateAllowsModel(planGate, id);
  const planAllowsRes = (r)=> !planGate || (typeof window.turnGateAllowsRes!=="function") || window.turnGateAllowsRes(planGate, r);
  const planMaxBatch = planGate ? (planGate.maxBatch||1) : 4;
  const planResNote = (r)=>{ const p = (typeof window.turnPlanForRes==="function") && window.turnPlanForRes(r); return p ? (r+" needs the "+p+" plan") : (r+" is locked on this plan"); };
  const openPlansUpsell = ()=>{ if(typeof window.turnOpenPlans==="function") window.turnOpenPlans(); };
  // clamp to BOTH ceilings — the model tier's (Fast caps at 720p) and the plan's
  React.useEffect(()=>{
    const cap = ["4K","1080p","720p","480p"].find(r=>stageResAllowed(tierObj,r) && planAllowsRes(r)) || "480p";
    if(!stageResAllowed(tierObj, resolution) || !planAllowsRes(resolution)) setResolution(cap);
  }, [tierObj.maxRes, planGate && planGate.maxRes]);
  // a plan that locks the selected model steers to the first allowed active one
  React.useEffect(()=>{
    if(planAllowsModel(modelId)) return;
    const ok = SEEDANCE_MODELS.find(m=>m.status==="active" && planAllowsModel(m.id));
    if(ok){ setModelId(ok.id); const t0=seedanceTierOf(ok, tier); if(t0) setTier(t0.id); }
  }, [modelId, planGate && planGate.tier]);
  // DEFAULT MODEL — Seedance 2.0 for every clip until the user picks one by hand
  // (then their choice rules): voice-locked lip-sync, per-shot frames and identity
  // refs in one budget. Tier gates always respected.
  const modelTouchedRef = React.useRef(false);
  React.useEffect(()=>{
    if(modelTouchedRef.current) return;
    const want = "seedance-2.0";
    if(want===modelId) return;
    const m = seedanceModelOf(want);
    if(m.id!==want || m.status!=="active" || !planAllowsModel(want)) return;
    setModelId(want); const t0=seedanceTierOf(m, tier); if(t0) setTier(t0.id);
  }, [clip.id]);
  React.useEffect(()=>{ if(batchN>planMaxBatch) setBatchN(planMaxBatch); }, [planMaxBatch]);
  // dialogue/duration are now CLIP-wide — a clip can bundle several merged shots, so the
  // voice lock and measured duration must account for every dialogue line in the clip,
  // not just the one shot a user happens to be looking at (_clipMeasuredSec already sums
  // all of the clip's line audio and requires every line to be voiced before it locks).
  const lineShots = d.lineShots || [];
  const hasDialogue = lineShots.length>0;
  const voicedLineCount = lineShots.filter(sh=>_shotAudioReady(sh, auds)).length;
  // capability flags from the model registry — Sora-class models take ONE start image
  // (no reference stacks) and perform dialogue themselves (no line-audio lip-sync)
  const modelRefs = model.refs!==false;
  const modelAudioRefs = model.audioRefs!==false;
  // voiceLocked = this render lip-syncs to the ElevenLabs lines (refs + locked clock);
  // otherwise the model performs the dialogue itself (native mode, or a Sora-class engine)
  const voiceLocked = hasDialogue && modelAudioRefs && dialogueAudio==="locked";
  const voiceReady = !hasDialogue || voicedLineCount===lineShots.length;
  const needsVoice = voiceLocked && !voiceReady;
  const audioRefsOn = !hasDialogue || voiceLocked;   // prompts drop @Audio tags without refs
  const measuredSec = _clipMeasuredSec(clip, model.maxClipSec||15);
  const durationLocked = !!measuredSec;
  // measured voice+air is a FLOOR, not a lock — extending buys more acting time, but
  // shrinking below it would cut the lines off
  // MULTI-SHOT include set — which shots ride THIS render (render-local, resets per
  // clip; excluded shots leave the compiled prompt, the native multi_prompt payload,
  // the ceiling math and the duration — their line-audio chips stay individually
  // toggleable in the references tray).
  const [msOff, setMsOff] = React.useState(()=>new Set());
  // which rows are COLLAPSED (display only — the shot stays in the list and, unless
  // also excluded, in the render). Excluding a shot auto-collapses it; the chevron
  // overrides either way. Both reset per clip.
  const [msFolded, setMsFolded] = React.useState(()=>new Set());
  const msTouchedRef = React.useRef(false);         // user drove the rows — auto-fit stands down
  const msAutoFitRef = React.useRef(null);          // last clip auto-fitted (once per visit)
  // A REPACK IS NOT A NEW CLIP. clip.id hashes the member shots, and the scene's
  // clips re-pack whenever a shot's seconds change — so editing a Multi-shot row
  // used to mint a "new" clip id, which reset the recipe tab to the smart default
  // (snapping the user to Timeline/Narrative mid-edit) and re-armed auto-fit,
  // which rewrote the durations and repacked AGAIN. Only a clip sharing NO member
  // shots with the previous one counts as the user actually moving clips.
  const msMembersRef = React.useRef(null);
  React.useEffect(()=>{
    const cur = ((d.shots)||[]).map(s=>s&&s.id).filter(Boolean);
    const prev = msMembersRef.current;
    msMembersRef.current = cur;
    if(prev && cur.some(id=>prev.indexOf(id)>=0)){
      msAutoFitRef.current = clip.id;   // repack — keep the tab, rows and hand-set seconds
      return;
    }
    setRecipeTouched(false); setRecipe(defaultRecipe());
    setMsOff(new Set()); setMsFolded(new Set()); msTouchedRef.current=false;
  }, [clip.id]);
  // MULTI-SHOT is a PER-BEAT composer: one beat at a time — the rows are exactly the
  // active clip's packed shots (the beat's equivalent), never the whole scene's 20+.
  // Pick a different beat with the scene rail's clip chips or the ◀ ▶ arrows; each
  // beat gets its own rows, its own ticked total and its own render.
  const msAllShots = shownShots;
  const msPanelLines = d.panelLines || [];
  const msCast = d.cast || [];
  const msClip = (recipe==="multishot")
    ? { ...clip, data:{ ...d, shots: msAllShots, panelLines: msPanelLines, allPanelLines: msPanelLines, cast: msCast,
        lineShots: d.lineShots || [] } }
    : clip;
  const msShots = msAllShots.filter(sh=>!msOff.has(sh.id));
  const msTotal = msShots.reduce((a,sh)=> a + (Number(sh.dur) || (typeof shotDur==="function" ? shotDur(sh) : 3)), 0);
  // AUTO-FIT — the first time a clip is shown in Multi-shot (and until the user touches
  // the rows), tick as many leading shots as fit under the model ceiling and give each
  // a grid duration (4/8/12/15) so the total never spills over. Voiced lines keep their
  // measured minimum. Runs once per clip visit; hand-editing a row/check stops it.
  React.useEffect(()=>{
    if(recipe!=="multishot" || msTouchedRef.current || !onUpdateShot) return;
    if(msAutoFitRef.current===clip.id) return;
    msAutoFitRef.current = clip.id;
    const cap = model.maxClipSec || 15;
    const grid = (window.STAGE_MS_STEPS || [4,8,12,15]).slice().sort((a,b)=>a-b);
    const minOf = (sh)=> (sh.lineAudio && sh.lineAudio.durationMs) ? Math.max(1, Math.round(((sh.lineAudio.durationMs/1000)+0.4)*10)/10) : grid[0];
    const off = new Set(), durs = {};
    let used = 0;
    msAllShots.forEach(sh=>{
      const floor = minOf(sh);
      const room = cap - used;
      if(floor > room + 0.001){ off.add(sh.id); return; }     // no room left → leave this shot out
      // biggest grid step that fits the remaining budget (but at least the voiced floor)
      const fit = grid.filter(g=> g>=floor-0.001 && g<=room+0.001).pop();
      const secs = fit!=null ? fit : Math.min(room, Math.max(floor, grid[0]));
      durs[sh.id] = Math.round(secs*10)/10;
      used += durs[sh.id];
    });
    if(!Object.keys(durs).length && msAllShots[0]){ durs[msAllShots[0].id] = Math.min(cap, grid[0]); off.delete(msAllShots[0].id); }
    msAllShots.forEach(sh=>{ const want = durs[sh.id]; if(want!=null && Math.abs((Number(sh.dur)||0)-want)>0.001) onUpdateShot(sh.id,{ dur:want }); });
    setMsOff(off);
  }, [clip.id, recipe, modelId]);
  // LIMIT REACHED → collapse every UNTICKED row: once the ticked shots fill the
  // model's clip ceiling, rows that can't join fold away. This only ever FOLDS —
  // a hand-expanded row is never re-folded until the totals change again.
  React.useEffect(()=>{
    if(recipe!=="multishot") return;
    const cap = model.maxClipSec || 15;
    if(msTotal < cap-0.001) return;
    setMsFolded(f=>{
      let changed = false; const n = new Set(f);
      msAllShots.forEach(sh=>{ if(msOff.has(sh.id) && !n.has(sh.id)){ n.add(sh.id); changed=true; } });
      return changed ? n : f;
    });
  }, [recipe, msTotal, msOff, modelId]);
  const duration = (voiceLocked && measuredSec)
    ? Math.max(measuredSec, durationOverride||0)
    : (durationOverride
        || (recipe==="multishot"
            ? Math.max(3, Math.min(model.maxClipSec||15, Math.round(msTotal)))
            : d.dur));
  // WHOLE-SCENE packing: a dedicated "Whole scene" recipe tab carries the exact same
  // text the Shots tab's "Copy video prompt" builds — one combined prompt for the scene
  const wholeScenePrompt = (packMode==="scene" && typeof window.sceneVideoPromptText==="function")
    ? window.sceneVideoPromptText(scene, shownShots, { location:d.loc, project:ctx.project,
        // dialogue attribution from the clip's resolved panel speakers
        speakerOf:(sh)=>{ const p=(d.panelLines||[]).find(x=>x.shotId===sh.id);
          return (p&&p.speaker&&p.speaker.name)||""; } })
    : "";
  // VOICE CAST — when locked line-audio rides the render, declare which audio
  // reference is WHOSE voice BEFORE any dialogue instruction, so the model casts
  // the voices first and then performs the lines. @AudioN numbering mirrors the
  // included-audio order (audioIncluded), the same order the attachments use.
  const voiceCast = (audioRefsOn && audioIncluded.length) ? (()=>{
    // GROUP tags per speaker — six lines by one character read as one voice, never
    // six ("@Audio1 is X's; @Audio2 is X's; …" invited the model to invent variety)
    const bySpeaker = new Map();
    audioIncluded.forEach((sid,i)=>{
      const p = (d.panelLines||[]).find(x=>x.shotId===sid);
      const sh = (d.lineShots||[]).find(s=>s.id===sid);
      const speaker = (p&&p.speaker&&p.speaker.name) || (sh&&sh.lineAudio&&sh.lineAudio.speaker) || "the speaker";
      if(!bySpeaker.has(speaker)) bySpeaker.set(speaker, []);
      bySpeaker.get(speaker).push("@Audio"+(i+1));
    });
    const entries = Array.from(bySpeaker.entries());
    const body = entries.length===1
      ? "every spoken line is "+entries[0][0]+"'s voice ("+(entries[0][1].length>2
          ? entries[0][1][0]+"–"+entries[0][1][entries[0][1].length-1]
          : entries[0][1].join(", "))+")"
      : entries.map(([n,tags])=>n+"'s voice: "+tags.join(", ")).join("; ");
    return "VOICE CAST — assign these voices before performing any dialogue: "+body
      +". Each character speaks ONLY in their assigned voice, lip-synced to that audio.";
  })() : "";
  const recipeText = (id)=>{
    const base = id==="scene" ? (wholeScenePrompt || d.prompt || "")
      // Multi-shot editor compiles to the TIME-CODED prompt (Seedance's segment
      // grammar) — the structured rows are the editor, this is the model payload
      : id==="multishot" ? seedanceRecipePrompt("timeline", msClip, msShots, activeShot, audioRefsOn, audioIncluded)
      : id==="narrative" ? (d.prompt || seedanceRecipePrompt(id, clip, shownShots, activeShot, audioRefsOn, audioIncluded))
      : seedanceRecipePrompt(id, clip, shownShots, activeShot, audioRefsOn, audioIncluded);
    return (voiceCast && base) ? (voiceCast+"\n\n"+base) : base;
  };
  // per-shot overrides (vidText / dur) and include toggles recompile the prompt live
  const msSig = msAllShots.map(s=>s.id+":"+(s.vidText||"")+":"+(s.dur||"")+":"+(msOff.has(s.id)?0:1)).join("|");
  const beatPrompt = recipeText(recipe);
  const [prompt, setPrompt] = React.useState(beatPrompt);
  // @-mention autocomplete — hand-written @Tokens map to INCLUDED assets only; the
  // dropdown resolves which @name is which asset, and tokens that don't resolve get
  // flagged under the box instead of silently mis-directing the model.
  const [mentionBox, setMentionBox] = React.useState(null);   // {start, query, hi}
  const mentionables = tagged.filter(a=>a.kind!=="text" && on(a))
    .map(a=>({ t:stageAssetMention(a), label:String(a.label||""), kind:a.kind, url:String(a.url||"") }));
  const mentionItems = (q)=>{ q=String(q||"").toLowerCase();
    return mentionables.filter(m=>!q || m.t.toLowerCase().indexOf(q)>=0 || m.label.toLowerCase().indexOf(q)>=0).slice(0,8); };
  const promptCaretToken = (el)=>{ const upto = el.value.slice(0, el.selectionStart||0);
    const m = /(?:^|[\s\n])@([A-Za-z0-9]*)$/.exec(upto);
    return m ? { start:(el.selectionStart||0)-m[1].length-1, query:m[1] } : null; };
  const onPromptChange = (e)=>{ setPrompt(e.target.value.slice(0,PANEL_PROMPT_MAX));
    const tk = promptCaretToken(e.target); setMentionBox(tk ? { ...tk, hi:0 } : null); };
  const insertMention = (tok)=>{ const el=promptRef.current; if(!el||!mentionBox) return;
    const caret = el.selectionStart||0;
    const next = (prompt.slice(0,mentionBox.start)+tok+" "+prompt.slice(caret)).slice(0,PANEL_PROMPT_MAX);
    const pos = mentionBox.start+tok.length+1;
    setPrompt(next); setMentionBox(null);
    requestAnimationFrame(()=>{ try{ el.focus(); el.setSelectionRange(pos,pos); }catch(_e){} }); };
  const onPromptKeyDown = (e)=>{ if(!mentionBox) return;
    const items = mentionItems(mentionBox.query);
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault();
      setMentionBox(b=>({ ...b, hi:(b.hi+(e.key==="ArrowDown"?1:-1)+Math.max(1,items.length))%Math.max(1,items.length) })); }
    else if((e.key==="Enter"||e.key==="Tab") && items.length){ e.preventDefault();
      insertMention(items[Math.min(mentionBox.hi, items.length-1)].t); }
    else if(e.key==="Escape"){ setMentionBox(null); } };
  // tokens that don't resolve to an included asset (typo, or the asset was excluded)
  const badMentions = (()=>{ const known = new Set(mentionables.map(m=>m.t.toLowerCase()));
    const out = [], re = /@(image|video|audio)\d+/gi; let mm;
    while((mm = re.exec(prompt))){ if(!known.has(mm[0].toLowerCase()) && out.indexOf(mm[0])<0) out.push(mm[0]); }
    return out; })();
  const [modeOverride, setModeOverride] = React.useState(null);
  const [voicingClip, setVoicingClip] = React.useState(false);
  const [maxImg, setMaxImg] = React.useState(null);   // {url,label,kind} — maximised reference viewer
  // ---- Reuse/Branch handoff from the VERSIONS tab: apply the take's settings to the
  // composer once, then consume — an explicit pick from the Versions view always wins.
  React.useEffect(()=>{
    if(!pendingReuse || pendingReuse.clipId!==clip.id) return;
    const m = pendingReuse.meta || {};
    if(m.source && STAGE_SOURCE_MODES[m.source]) setSourceOverride(m.source);
    if(m.tier) setTier(m.tier);
    const tObj = seedanceTierOf(model, m.tier||tier);
    if(m.resolution && tObj && tObj.creditRate && tObj.creditRate[m.resolution]!=null) setResolution(m.resolution);
    if(m.bitrate) setBitrate(m.bitrate==="high"?"high":"standard");
    if(m.recipe){ setRecipe(m.recipe); setRecipeTouched(true); }
    setSeedInput(pendingReuse.pin && m.seed!=null ? String(m.seed) : "");
    if(onReuseConsumed) onReuseConsumed();
    if(typeof window.appToast==="function") window.appToast(pendingReuse.pin
      ? "Settings + seed loaded — Generate now renders a controlled variation of that take."
      : "That take's settings are loaded into the composer.","ok");
  },[pendingReuse]);
  // full-screen preview of the rendered clip — native fullscreen on the <video>, with
  // the in-app lightbox as the fallback when the browser refuses (e.g. embedded frames)
  const playerVideoRef = React.useRef(null);
  const playerFullscreen = ()=>{
    if(!playerUrl) return;
    const v = playerVideoRef.current;
    const overlay = ()=>setMaxImg({ url:playerUrl, label:"", kind:"video" });
    if(!v){ overlay(); return; }
    try{
      if(v.requestFullscreen){ const p=v.requestFullscreen(); if(p&&p.catch) p.catch(()=>{}); }
      else if(v.webkitRequestFullscreen) v.webkitRequestFullscreen();
      else if(v.webkitEnterFullscreen){ v.webkitEnterFullscreen(); return; }   // iOS Safari
      else { overlay(); return; }
      // embedded frames can leave the fullscreen request PENDING forever (it neither
      // grants nor rejects) — if nothing is fullscreen shortly after, use the overlay
      setTimeout(()=>{ if(!document.fullscreenElement && !document.webkitFullscreenElement) overlay(); }, 600);
    }catch(e){ overlay(); }
  };
  /* the NATIVE player's own fullscreen control (bottom-right ⛶) can't be re-wired —
     but when the browser refuses it (embedded frame without fullscreen permission) it
     fires "fullscreenerror"; catch that and open the same overlay so the button always
     lands the user somewhere full screen. */
  React.useEffect(()=>{
    const onErr = ()=>{
      const v = playerVideoRef.current;
      if(v && playerUrl && !document.fullscreenElement && !document.webkitFullscreenElement)
        setMaxImg({ url:playerUrl, label:"", kind:"video" });
    };
    document.addEventListener("fullscreenerror", onErr);
    document.addEventListener("webkitfullscreenerror", onErr);
    return ()=>{ document.removeEventListener("fullscreenerror", onErr); document.removeEventListener("webkitfullscreenerror", onErr); };
  }, [playerUrl]);
  const blockerRef = React.useRef(null);              // the banner naming what blocks Generate
  const [blockPulse, setBlockPulse] = React.useState(0);   // bumped when a blocked Generate is clicked → shake + scroll
  const [panelTab, setPanelTab] = React.useState("inputs"); // Render-settings panel tab: model | inputs | director
  // fixed-height prompt box (scrolls when the text runs longer) — keeps the composer
  // compact even on wordy recipes; the resize handle still lets users pull it taller.
  const promptRef = React.useRef(null);
  React.useEffect(()=>{
    setPrompt(recipeText(recipe));
    setPerf(dialogueSpeakers[0] || d.lead);
  }, [clip.id, activeShot.id, recipe, dialogueSpeakers.join("|"), d.lead, audioRefsOn, audioIncluded.join("|"), packMode, msSig]);
  // a different beat resets per-beat render choices — a reused manual seed or end-frame
  // target from the last beat wouldn't make sense applied to this one.
  React.useEffect(()=>{ setSeedInput(""); setLastSeed(null); setEndFrameId(""); setDurationOverride(null); setAspectOverride(null); setBatchN(1); }, [clip.id, activeShot.id]);
  // mode auto-inferred from which asset kinds are on (overridable in the selector)
  const autoMode = (()=>{ const hasI=onImages.length>0, hasV=onVideos.length>0, hasA=onAudios.length>0;
    if(hasV && (hasI||hasA)) return "multimodal";
    if(hasA && hasI) return "multimodal";
    if(hasV) return "v2v";
    if(hasI) return "i2v";
    return "t2v"; })();
  const mode = modeOverride || autoMode;
  const MODES = [["t2v","Text to Video"],["i2v","Image to Video"],["v2v","Video to Video"],["multimodal","Multimodal"]];

  // ---- start->end frame transition: a genuinely new Seedance 2.0 capability (the
  // dedicated image-to-video endpoint's end_image_url) this console didn't expose at
  // all before. Routes through the next CLIP's frame by default, or any ready image
  // reference. Incompatible with dialogue lip-sync / video refs — see videogen.jsx. ----
  const nextClip = (()=>{ const i=clipsInScene.findIndex(c=>c.id===clip.id); return i>=0 ? clipsInScene[i+1] : null; })();
  const nextFrameUrl = nextClip ? clipPrimaryFrame(nextClip, imgs, visualSource) : "";
  const endFrameCandidates = [
    nextClip && nextFrameUrl && { id:"next", label:"Next clip · "+nextClip.label, url:nextFrameUrl },
    ...tagged.filter(a=>a.kind==="image" && a.ready && a.url && a.url!==startFrame).map(a=>({ id:"asset:"+a.key, label:a.label, url:a.url })),
  ].filter(Boolean);
  const endFrameAvailable = !hasDialogue && onVideos.length===0 && endFrameCandidates.length>0 && modelRefs;   // Sora has no end-frame endpoint
  const endFrameUrl = endFrameAvailable ? ((endFrameCandidates.find(c=>c.id===endFrameId)||{}).url || "") : "";

  // ---- auto reference roles: one declared-role sentence per included asset, appended
  // to the prompt at render (and previewed read-only under the prompt box). Skipped for
  // start->end transitions — that renders on the dedicated i2v endpoint, which takes only
  // the two frames and has no @mention array to point at. ----
  const refLines = (endFrameUrl || !modelRefs) ? [] : tagged.filter(a=>on(a) && a.kind!=="text").map(stageAssetRole).filter(Boolean);
  // multi-panel sources have a documented bleed failure mode — captions/panel borders
  // can leak into the video unless explicitly negated in the prompt.
  if(refLines.length && usePanels) refLines.push("The storyboard is blocking reference only — do not render its captions, text overlays, panel numbers or panel borders in the output.");
  const refBlock = refLines.length ? ("References:\n"+refLines.join("\n")) : "";

  const onGenerate = async ()=>{
    // the start frame leads ONLY when its asset chip is included — an excluded start
    // frame means a promptless-anchor render (prompt + remaining references only),
    // never a silent fallback to some other included image
    const frameAsset = onImages.find(a=>a.url===startFrame) || null;
    const frameUrl = frameAsset ? await stageServerAssetUrl(frameAsset, startFrame || frameAsset.url || "") : "";
    const imageUrls = [];
    for(const a of onImages){ if(a===frameAsset) continue; const u=await stageServerAssetUrl(a); if(u) imageUrls.push(u); }
    const videoUrls = onVideos.map(a=>a.url).filter(Boolean);
    let audioUrls = voiceLocked ? onAudios.map(a=>a.url).filter(Boolean) : [];
    // voice overflow → BLACK-MP4 carriers in the video slots (fal caps audio refs at
    // 3): the mp4's audio track is the voice, its black picture carries nothing, so
    // the prompt flags it voice-only. In-browser conversion (WebCodecs); a browser
    // that can't encode keeps the first 3 voices and gets told what was left out.
    const voiceRefLines = [];
    if(audioUrls.length>3){
      const overflow = onAudios.slice(3).filter(a=>a.url);
      audioUrls = audioUrls.slice(0,3);
      const baseVideos = videoUrls.length;
      const carried = overflow.slice(0, Math.max(0, 3-baseVideos));
      let dropped = overflow.slice(carried.length);
      if(carried.length){
        if(typeof blackMp4FromAudio!=="function"){ dropped = dropped.concat(carried); }
        else{
          try{
            for(const a of carried){
              videoUrls.push(await blackMp4FromAudio(a.url));
              voiceRefLines.push("@Video"+(baseVideos+voiceRefLines.length+1)+" is "
                +(String(a.label||"the speaker").replace(/\s+line$/i,""))+"'s voice riding a black screen — use ONLY its audio track for that character's voice; ignore the picture entirely.");
            }
          }catch(e){
            videoUrls.splice(baseVideos);   // roll back any partial muxes
            dropped = dropped.concat(carried.slice(voiceRefLines.length));
            voiceRefLines.length = 0;
            if(typeof window.appToast==="function") window.appToast(String((e&&e.message)||e),"error");
          }
        }
      }
      if(dropped.length && typeof window.appToast==="function")
        window.appToast((3+voiceRefLines.length)+" of "+onAudios.length+" voices attach to this render — left out: "+dropped.map(a=>a.label||"a line").join(", ")+".","error");
    }
    const controls = "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+".";
    if(assetOver){ if(typeof window.appToast==="function") window.appToast((model.label||"This model")+" accepts up to "+assetLimit+" inputs — exclude a few assets first.","error"); return; }
    if(!sourceReady){ if(typeof window.appToast==="function") window.appToast((usePanels?"Save this clip's storyboard "+(sourceMode==="sheet"?"sheet":"halves")+" in Storyboards first.":"Generate this clip's first shot frame first."),"error"); return; }
    if(needsVoice){ if(typeof window.appToast==="function") window.appToast("Voice this clip's dialogue first — duration and lip-sync are locked to line audio.","error"); return; }
    if(creditInfo.empty){ if(typeof window.appToast==="function") window.appToast("No generation credits remaining.","error"); return; }
    const seedVal = seedInput.trim() ? Number(seedInput.trim()) : undefined;
    const promptPayload = (refBlock ? (prompt.trim()+"\n\n"+refBlock) : prompt)
      + (voiceRefLines.length ? (refBlock?"":"\n\nReferences:")+"\n"+voiceRefLines.join("\n") : "");
    // Multi-shot rows ride the payload as structured segments — models with native
    // multi-shot (Kling 3.0's multi_prompt) render them per-shot; others ignore
    // them and use the compiled time-coded prompt text.
    const multiShot = recipe==="multishot" ? msShots.map(sh=>{
      const p = msPanelLines.find(x=>x.shotId===sh.id) || {};
      const text = String(sh.vidText||"").trim() || String(p.text||"").trim();
      return { prompt:text, duration:Math.max(1, Math.round(Number(sh.dur) || (typeof shotDur==="function" ? shotDur(sh) : 3))) };
    }).filter(s=>s.prompt) : undefined;
    const payload = { frameUrl, imageUrls, videoUrls, audioUrls, prompt:promptPayload, controls, multiShot,
      durationMs:duration*1000, aspectRatio:effAspect||"auto", fast:!!tierObj.fast, resolution,
      seed:seedVal, generateAudio: hasDialogue ? true : nativeAudio,   // audio track must stay ON for the lip-synced line to be heard
      bitrateMode:bitrate,
      falModel: tierObj.falModel || undefined,   // non-Seedance engines (Sora 2) name their fal endpoint per tier
      // facts the Versions view shows per take — stamped into the take's meta at commit
      takeMeta:{ source:sourceMode, tier:tierObj.id, tierLabel:tierObj.label, resolution, bitrate, recipe,
        audio: hasDialogue ? (voiceLocked ? "voice" : "native") : (nativeAudio ? "native" : "silent"),
        inputs: counts.text+" text · "+counts.images+" img · "+counts.videos+" vid · "+counts.audio+" aud",
        durationSec: duration },
      // start→end transitions render on the dedicated i2v endpoint, which needs BOTH
      // frames — with the start frame excluded, the end frame quietly stands down
      endImageUrl: (frameUrl ? endFrameUrl : "") || undefined, force:true };
    try{
      // batch: N parallel jobs with distinct seeds, every completion lands as a take
      const results = batchN>1 && typeof gen.generateBatch==="function"
        ? await gen.generateBatch(payload, batchN)
        : [await gen.generate(payload)];
      const fresh = results.filter(r=>r && !r.cached);
      const lastWithSeed = results.filter(r=>r && r.seed!=null).slice(-1)[0];
      if(lastWithSeed) setLastSeed(lastWithSeed.seed);
      // record the spend (supabase/credits.sql) for the takes that actually rendered
      if(fresh.length && typeof window.cloudSpendCredit==="function"){ try{ await window.cloudSpendCredit(renderCost*fresh.length); }catch(_e){} }
      try{ window.dispatchEvent(new CustomEvent("turn-credits-changed",{ detail:{ reason:"stage-video-render", cost:renderCost*Math.max(1,fresh.length) } })); }catch(_e){}
      if(typeof window.appToast==="function") window.appToast("Clip "+beatLabel+" — "+results.length+" take"+(results.length!==1?"s":"")+" rendered","ok");
    }catch(e){ if(typeof window.appToast==="function") window.appToast(stageFriendlyVideoError(e),"err"); }
  };
  const onExtend = async ()=>{
    if(!playerUrl) return;
    if(creditInfo.empty){ if(typeof window.appToast==="function") window.appToast("No generation credits remaining.","error"); return; }
    const controls = "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+".";
    try{
      const frameAsset = onImages.find(a=>a.url===startFrame) || onImages[0] || null;
      const freshFrameUrl = await stageServerAssetUrl(frameAsset, startFrame || (frameAsset&&frameAsset.url) || "");
      // Seedance's canonical extension grammar: name the video and the added length,
      // then describe the continuation — not a bare re-render with a video attached.
      const extendPrompt = "Extend @Video1 by ~"+Math.round(duration)+" seconds, continuing seamlessly from where it ends: "+prompt.trim();
      const res = await gen.generate({ frameUrl:freshFrameUrl, videoUrls:[playerUrl], prompt:extendPrompt, controls,
        durationMs:duration*1000, aspectRatio:effAspect||"auto", fast:!!tierObj.fast, resolution, bitrateMode:bitrate, force:true });
      if(res && res.seed!=null) setLastSeed(res.seed);
      if(res && !res.cached && typeof window.cloudSpendCredit==="function"){ try{ await window.cloudSpendCredit(renderCost); }catch(_e){} }
      try{ window.dispatchEvent(new CustomEvent("turn-credits-changed",{ detail:{ reason:"stage-video-extend", cost:renderCost } })); }catch(_e){}
    }catch(e){ if(typeof window.appToast==="function") window.appToast(stageFriendlyVideoError(e),"err"); }
  };
  const onVoiceClip = async ()=>{
    if(!onVoiceLine || voicingClip) return;
    const todo = lineShots.filter(sh=>String(sh.dialogue||"").trim() && !_shotAudioReady(sh, auds));
    if(!todo.length) return;
    setVoicingClip(true);
    for(const sh of todo){ await onVoiceLine(sh); }
    setVoicingClip(false);
  };
  const onChip = (ch)=>{
    const line = String((ch&&ch.k)||"").trim()+": "+String((ch&&ch.v)||"").trim();
    if(!line.trim() || line.indexOf(": ")===0) return;
    setPrompt(p=>{
      const cur = String(p||"").trim();
      if(cur.toLowerCase().indexOf(line.toLowerCase())>=0) return p;
      return cur ? (cur+"\n"+line) : line;
    });
  };
  const gening = gen.gening;
  const genErr = stageFriendlyVideoError(gen.err);
  // this render's price from the current settings — every cost-bearing choice contributes;
  // a batch multiplies it (N parallel takes) and the balance gates on the TOTAL.
  const renderCost = stageRenderCost(tierObj, resolution, duration);
  const totalCost = renderCost*Math.max(1, batchN);
  const renderCostTitle = totalCost+" credit"+(totalCost!==1?"s":"")+" — "
    +(batchN>1 ? (batchN+" takes × (") : "")+_fmtSecs(duration)+" × "+resolution+" × "+tierObj.label+(batchN>1?")":"");
  const creditInfo = stageCreditInfo(creditBalance, totalCost);
  const PANEL_PROMPT_MAX = 1999;
  const activePanel = (d.panelLines||[]).find(p=>p.shotId===activeShot.id) || {};
  const scriptText = activePanel.script || stageShotScriptText(scene, drafts, activeShot, 280) || "";
  const blockingText = activePanel.sheet || stageShotSheetText(scene, beatsMap, activeShot, 280) || "";
  const castNames = (d.cast||[]).map(c=>c.name).filter(Boolean);
  const propNames = (d.props||[]).map(p=>p.name).filter(Boolean);
  const contextRows = [
    ["Scene", _pad2(scene.no)+" · "+(scene.title||scene.loc||"Untitled")],
    ["Beat", beatLabel+" · "+beatName],
    ["Video", playerUrl ? "locked · "+_fmtSecs(duration) : "not rendered"],
    ["Source", sourceReady ? sourceLabel : "missing visual source"],
    ["Audio", hasDialogue
      ? (!modelAudioRefs ? "native — the model voices the lines"
        : voiceLocked ? (voiceReady ? "locked voice" : "needs voice")
        : "native performance — swap voices in post")
      : "native / silent"]
  ];
  const promptChips = [
    ["subject", perf || d.lead || "selected performer"],
    ["action", _firstWords(activeShot&&activeShot.action, 8) || "clip action"],
    ["setting", scene.loc || (d.loc&&d.loc.name) || "scene location"],
    ["camera", camera || "director camera"],
    ["style", d.sceneStyle || d.style || "scene style"],
    ["mood", lighting || "scene lighting"]
  ].filter(x=>x[1]);
  // EVERY input reference shows in the strip (no +N overflow) — excluded ones dim,
  // clicking any chip still toggles it in/out of the render.
  const composerAssets = tagged;
  const composerCredit = String(totalCost);   // the render's TOTAL cost, number only (balance lives in the footer)
  // each pill opens a dropdown of options — the inline alternative to the right panel.
  const composerMenus = [
    { key:"model", icon:Icon.sparkles, label:model.label, title:"Video model", heading:"Model",
      options:SEEDANCE_MODELS.map(m=>{
        const planLocked = m.status==="active" && !planAllowsModel(m.id);
        return { value:m.id, label:m.label, selected:m.id===modelId,
          disabled:m.status!=="active",
          note:m.status!=="active" ? m.note : (planLocked ? "Every model unlocks on the Director plan — click to upgrade" : undefined),
          tag:m.status!=="active" ? "Soon" : (planLocked ? "Director plan" : undefined),
          meta:[ m.metaRes && { icon:Icon.diamond||Icon.image, label:m.metaRes },
                 m.metaDur && { icon:Icon.clock, label:m.metaDur } ].filter(Boolean) };
      }),
      onPick:(id)=>{ const m=seedanceModelOf(id); if(m.status!=="active") return;
        if(!planAllowsModel(id)){ openPlansUpsell(); return; }
        modelTouchedRef.current = true;   // a hand-picked model rules — auto-pick stands down
        setModelId(id); const t0=seedanceTierOf(m,tier); if(t0) setTier(t0.id); } },
    { key:"aspect", icon:Icon.monitor, label:effAspect, title:"Aspect ratio — the project format's default is "+(aspect||"16:9"), heading:"Aspect ratio",
      options:["auto","21:9","16:9","4:3","1:1","3:4","9:16"].map(v=>({ value:v,
        label: v==="auto" ? ("Project default ("+(aspect||"16:9")+")") : v,
        selected: aspectOverride ? v===aspectOverride : v==="auto" })),
      onPick:(v)=>setAspectOverride(v==="auto"?null:v) },
    { key:"res", icon:Icon.diamond||Icon.image, label:resolution, title:"Resolution", heading:"Resolution",
      options:STAGE_RESOLUTIONS.map(r=>{
        const locked = !stageResAllowed(tierObj, r);          // model-tier ceiling (hard)
        const planLocked = !locked && !planAllowsRes(r);      // plan ceiling (upsell)
        // honest lock copy: "needs the Standard tier" only when SOME tier of this
        // model reaches it — otherwise the model itself can't do it at all
        const anyTier = (model.tiers||[]).some(t0=>stageResAllowed(t0, r));
        return { value:r, label:r, selected:r===resolution,
          disabled:locked,
          note:locked ? (anyTier ? (r+" needs the Standard tier") : (r+" isn't available on "+model.label)) : (planLocked ? planResNote(r)+" — click to upgrade" : undefined),
          tag:planLocked ? ((typeof window.turnPlanForRes==="function" && window.turnPlanForRes(r))||"Plan")+" plan" : undefined,
          meta: r==="4K" ? [{ icon:Icon.sparkles, label:"5× credits" }] : undefined };
      }),
      onPick:(r)=>{ if(!planAllowsRes(r)){ openPlansUpsell(); return; } setResolution(r); } },
    { key:"dur", icon:Icon.clock, label:_fmtSecs(duration), heading:"Clip duration",
      title: durationLocked
        ? "The measured voice + breathing room ("+_fmtSecs(measuredSec)+") is the MINIMUM — extend for more acting time"
        : "Clip duration",
      options:_uniq([duration, measuredSec||0, 4,5,6,8,10,12,15, model.maxClipSec||15])
        .filter(v=> v>0 && v<=(model.maxClipSec||15) && (!durationLocked || v>=measuredSec))
        .sort((a,b)=>a-b)
        .map(v=>({ value:v, label:_fmtSecs(v)+(durationLocked&&v===measuredSec?" · voice + air":""), selected:v===duration })),
      onPick:(v)=>setDurationOverride(Number(v)===measuredSec ? null : Number(v)) },
  ].filter(Boolean);
  // (tier / bitrate / audio live as LABELLED rows in the Render settings panel;
  //  References/Elements open from labelled buttons there too)
  // ---- References / Elements trays: full asset management from the composer's two
  // tool buttons. "References" lists every derived input (source, identity, audio,
  // video); "Elements" is the story-element subset (cast · location · props). Rows
  // toggle include/exclude exactly like the (hidden) full asset row. ----
  const [trayOpen, setTrayOpen] = React.useState(null);   // "refs" | "elems" | null
  const [trayPos, setTrayPos] = React.useState(null);
  const trayRef = React.useRef(null);
  const openTray = (which, e)=>{
    const r = e.currentTarget.getBoundingClientRect();
    setTrayPos({ left:Math.round(Math.min(r.left, window.innerWidth-340)), top:Math.round(r.bottom+6) });
    setTrayOpen(t=> t===which ? null : which);
  };
  React.useEffect(()=>{
    if(!trayOpen) return;
    const close=(e)=>{
      if(trayRef.current && trayRef.current.contains(e.target)) return;
      if(e.target && e.target.closest && e.target.closest(".stage2-gen-tool, .sd-gen-refbtns")) return;
      setTrayOpen(null);
    };
    const esc=(e)=>{ if(e.key==="Escape") setTrayOpen(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return ()=>{ document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  },[trayOpen]);
  React.useEffect(()=>{ setTrayOpen(null); }, [clip.id]);
  const trayAssets = trayOpen==="elems"
    ? tagged.filter(a=>String(a.key).indexOf("c:")===0 || a.key==="loc" || String(a.key).indexOf("p:")===0)
    : tagged;
  const tray = trayOpen && trayPos && _stEl("div",{ref:trayRef,className:"stage2-asset-tray",style:{left:trayPos.left+"px",top:trayPos.top+"px"}},
    _stEl("b",{className:"stage2-tray-h"}, trayOpen==="elems" ? "ELEMENTS — cast · location · props" : "REFERENCES — every derived input"),
    trayAssets.length
      ? trayAssets.map(a=>_stEl("div",{key:a.key,className:"stage2-tray-row"+(on(a)?" on":"")+(!a.ready?" missing":"")},
          _stEl("button",{type:"button",className:"stage2-tray-main",title:assetTitle(a),onClick:()=>toggle(a)},
            _stEl("span",{className:"stage2-tray-thumb"},
              a.kind==="text" ? "T"
              : a.kind==="audio" ? (Icon.mic&&_stEl(Icon.mic,{s:12}))
              : a.url ? (a.kind==="video"
                  ? _stEl("video",{src:a.url,muted:true,playsInline:true,preload:"metadata"})
                  : _stEl("img",{src:a.url,alt:"",loading:"lazy"}))
              : (Icon.image&&_stEl(Icon.image,{s:12}))),
            _stEl("span",{className:"stage2-tray-name"}, a.label),
            _stEl("small",null, stageAssetTagShort(a)),
            _stEl("span",{className:"stage2-tray-state"}, assetStateLabel(a))),
          (a.url&&(a.kind==="image"||a.kind==="video")) && _stEl("button",{type:"button",className:"stage2-tray-max",title:"Maximise "+a.label,
            onClick:()=>setMaxImg({url:a.url,label:a.label,kind:a.kind})}, Icon.maximize&&_stEl(Icon.maximize,{s:11}))))
      : _stEl("div",{className:"stage2-tray-empty"},"Nothing derived for this clip yet — design its cast, location and props in the Art Room."),
    _stEl("div",{className:"stage2-tray-foot"}, budgetUsed+" / "+assetLimit+" input slots used"));
  // native audio is on but the prompt gives the soundtrack no direction — research flags
  // missing sound cues as the most common silent prompting mistake (audio comes out generic).
  const soundCueMissing = !hasDialogue && nativeAudio && !!prompt.trim() &&
    !/\b(sound|sfx|audio|music|score|jazz|melody|drone|ambien\w*|hum|rain|wind|thunder|footsteps|creak\w*|whisper\w*|roar\w*|buzz\w*|rustl\w*|echo\w*|silence|silent|quiet|crackl\w*|chirp\w*|drip\w*|splash\w*|clang\w*|click\w*|heartbeat|breath\w*|rumbl\w*|hiss\w*|murmur\w*)\b/i.test(prompt);
  // recipe ↔ inputs mismatches — soft guidance, never a block. The assets stay recipe-
  // independent (story facts drive them); these just flag phrasings that fight the inputs.
  const recipeHint =
    recipe==="lipsync" && !hasDialogue
      ? "Dialogue / lip-sync phrases the render around a spoken line in @Audio1, but this clip has no dialogue — Narrative or Timeline usually fits better."
    : recipe==="panels" && sourceMode==="frame"
      ? "Panel-by-panel writes explicit SHOT-by-SHOT cut points, but this render's visual source is a single frame — Narrative usually fits better, or switch the Visual source (Render settings panel → Controls) to storyboard halves / per-shot frames."
    : recipe==="timeline" && (d.shots||[]).length<=1
      ? "Timeline paces multiple time-coded windows, but this clip is a single shot — Narrative usually fits better."
    : (recipe==="narrative"||recipe==="structured") && usePanels
      ? "A storyboard source works best with per-panel narration — the model can't infer the story logic between panels from the image alone. Consider the Panel-by-panel or Timeline recipe."
    : "";
  // ---- what's blocking Generate, in priority order. The FIRST one renders as a
  // prominent actionable banner (not a modal — this is persistent state, and a popup
  // would re-interrupt on every visit); clicking the blocked Generate button shakes
  // and scrolls to it. Where a one-click fix exists, the banner carries the button. ----
  const blockers = [];
  if(needsVoice) blockers.push({ key:"voice",
    text:"Voice this clip before rendering — duration and lip-sync lock to the line audio.",
    actionLabel: onVoiceLine ? (voicingClip ? "Voicing…" : "Voice clip now") : null,
    action:onVoiceClip, busy:voicingClip });
  if(!sourceReady) blockers.push({ key:"source",
    text: usePanels ? "No storyboard source is ready yet — save this clip's "+(sourceMode==="sheet"?"sheet":"halves")+" in Storyboards."
      : "This clip has no shot frame yet — generate it in Art Room → Shots." });
  // OVER THE MODEL'S CLIP CEILING — the render would clamp silently and compress
  // the pacing; force the choice instead (the fit / untick / parts fixes sit
  // with the rows). Only reachable via the seconds steppers — ticking is capped.
  if(recipe==="multishot" && msTotal > (model.maxClipSec||15)+0.001) blockers.push({ key:"overcap",
    text:"The ticked shots total "+_fmtSecs(Math.round(msTotal*10)/10)+" — over "+(model.label||"this model")+"'s "+_fmtSecs(model.maxClipSec||15)+" maximum per clip. Fit the seconds, untick rows, or render in parts (the fixes sit under the rows)." });
  if(assetOver) blockers.push({ key:"budget",
    text:"Too many inputs selected — exclude "+budgetOverBy+" optional asset"+(budgetOverBy!==1?"s":"")+" before rendering." });
  if(creditInfo.empty) blockers.push({ key:"credits",
    text:"Not enough generation credits — this render needs "+totalCost+(creditInfo.known?(", "+creditInfo.remaining+" remaining"):"")+".",
    actionLabel:"Choose a plan", action:()=>{ if(typeof window.turnOpenPlans==="function") window.turnOpenPlans(); } });
  if(!prompt.trim()) blockers.push({ key:"prompt", text:"Write a prompt — describe the motion you want." });
  const blocker = blockers[0] || null;
  const onBlockedGenerate = ()=>{
    setBlockPulse(x=>x+1);
    if(blockerRef.current){ try{ blockerRef.current.scrollIntoView({ behavior:"smooth", block:"center" }); }catch(e){} }
  };
  // the Generate button — inside the pills box normally; in Multi-shot mode it
  // stands OUTSIDE the box, inline to its right (the rows are the editor there)
  const genSubmitBtn = _stEl("button",{className:"stage2-gen-submit-neon"+(blocker?" blocked":"")+(recipe==="multishot"?" standalone":""),type:"button",
      title: blocker ? (blocker.text+" (click to see why)") : renderCostTitle,
      "aria-disabled": blocker ? "true" : undefined,
      disabled: gening,
      onClick: ()=>{ if(gening) return; if(blocker){ onBlockedGenerate(); return; } onGenerate(); }},
      _stEl("span",null,gening?"GENERATING":"GENERATE"),
      _stEl("small",null,gening ? (stageStatusLabel(gen.status)||"Rendering…") : composerCredit));
  const composer = _stEl("div",{className:"stage2-gen-composer"+(gening?" working":"")+(creditInfo.empty?" no-credits":"")},
    _stEl("div",{className:"stage2-gen-assets"},
      composerAssets.map(a=>_stEl("button",{key:a.key,type:"button",
        className:"stage2-gen-asset "+a.kind+(a.locked?" locked":"")+(on(a)?"":" off")+(!a.ready?" missing":""),
        title:assetTitle(a),
        onClick:()=>toggle(a)},
        a.kind==="text" ? _stEl("span",{className:"stage2-gen-asset-text"},"T")
        : a.kind==="audio" ? _stEl("span",{className:"stage2-gen-asset-icon"},Icon.mic&&_stEl(Icon.mic,{s:14}))
        : (a.url && !imgFailed(a)) ? (a.kind==="video"
            ? _stEl("video",{src:a.url,muted:true,playsInline:true,preload:"metadata"})
            : _stEl("img",{src:a.url,alt:"",loading:"lazy",
                onError:()=>noteImgFail(a)}))
        : _stEl("span",{className:"stage2-gen-asset-ph"+(a.ready?"":" miss")},
            a.kind==="video" ? (Icon.play&&_stEl(Icon.play,{s:13})) : (Icon.image&&_stEl(Icon.image,{s:13})),
            _stEl("small",null,a.label)),
        (a.url && !imgFailed(a) && (a.kind==="image"||a.kind==="video")) && _stEl("span",{className:"stage2-gen-asset-max",role:"button","aria-label":"Maximise",title:"Maximise "+a.label,
          onClick:(e)=>{ e.stopPropagation(); e.preventDefault(); setMaxImg({url:a.url, label:a.label, kind:a.kind}); }},
          Icon.maximize&&_stEl(Icon.maximize,{s:10})),
        a.kind!=="text" && a.ready && _stEl("span",{className:"stage2-gen-asset-tag",title:"Reference this asset in the prompt as "+stageAssetMention(a)}, stageAssetTagShort(a)),
        on(a) && _stEl("span",{className:"stage2-gen-asset-check"},Icon.check&&_stEl(Icon.check,{s:10}))))),
    // prompt recipe — the structure lever, promoted to the composer itself. In
    // whole-scene packing a dedicated "Whole scene" tab leads: the combined scene
    // prompt (same text as the Shots tab's "Copy video prompt").
    _stEl("div",{className:"stage2-recipe-row stage2-gen-recipes",role:"radiogroup","aria-label":"Prompt recipe"},
      [ ...(packMode==="scene" ? [["scene","Whole scene","The combined whole-scene prompt — every shot's action + dialogue in order, the camera arc and the scene's grade; identical to the Shots tab's 'Copy video prompt'."]] : []),
        ["multishot","Multi-shot","Structured per-shot rows — edit each shot's video description and seconds; compiles into the time-coded prompt the model renders."],
        ...SEEDANCE_RECIPES,
      ].map(([id,label,desc])=>_stEl("button",{key:id,type:"button",
        className:"stage2-recipe"+(recipe===id?" on":""),
        "aria-pressed":recipe===id?"true":"false",
        title:label+" — "+desc,
        onClick:()=>{ pickRecipe(id); setPrompt(recipeText(id)); }},
        label))),
    // MULTI-SHOT editor — Kling-style structured rows over the ACTIVE BEAT's shots
    // (one beat at a time, matching the clip the console is pointed at): a duration
    // stepper + a video-only description per shot + an include checkbox. Edits
    // persist on the shot (vidText/dur), feed EVERY recipe, and recompile the prompt
    // live. The canon Action (image side) is never touched; shots are added on the Shots tab.
    recipe==="multishot" && _stEl("div",{className:"stage2-ms"},
      (()=>{ // the model's clip ceiling, always visible while picking rows: the live
        // total of TICKED seconds vs the cap — amber at the limit, red over it
        const cap = model.maxClipSec || 15;
        const tot = Math.round(msTotal*10)/10;
        const over = tot > cap+0.001, at = !over && tot >= cap-0.001;
        return _stEl("div",{className:"stage2-ms-caphead"+(over?" over":(at?" at":""))},
          _stEl("span",{className:"stage2-ms-caphead-model"}, Icon.clock&&_stEl(Icon.clock,{s:12}),
            (model.label||"This model")+" renders up to "+_fmtSecs(cap)+" per clip"),
          _stEl("span",{className:"stage2-ms-caphead-total"},
            "("+_fmtSecs(tot)+" / "+_fmtSecs(cap)+" ticked)"));
      })(),
      msAllShots.map((sh,i)=>{
        const p = msPanelLines.find(x=>x.shotId===sh.id) || {};
        // the editor shows the FULL canon line — the 190-char panel-line cap (and its
        // trailing "…") is a prompt budget, not what the user reads or edits here
        const canon = String(sh.vidText||"").trim() || stageShotCanonLine(scene, drafts, beatsMap, sh, 0) || String(p.text||"").trim();
        const voicedMin = (sh.lineAudio && sh.lineAudio.durationMs) ? Math.max(1, Math.round(((sh.lineAudio.durationMs/1000)+0.4)*10)/10) : 1;
        const curDur = Math.max(1, Math.round((Number(sh.dur) || (typeof shotDur==="function" ? shotDur(sh) : 3))*10)/10);
        const setDur = (nv)=>{ if(!onUpdateShot) return;
          msTouchedRef.current = true;   // hand-set seconds — auto-fit stands down
          const v = Math.min(model.maxClipSec||15, Math.max(voicedMin, Math.round(nv*10)/10));
          onUpdateShot(sh.id, { dur:v }); };
        // an EMPTY override means "derived" (clearing the box restores the derived
        // text) — only real text counts as an edit
        const edited = sh.vidText!=null && String(sh.vidText).trim()!=="";
        const included = !msOff.has(sh.id);
        const folded = msFolded.has(sh.id);
        // would including this row burst the model's clip ceiling? The tick is then
        // refused (with a toast) and the checkbox shows the dashed "blocked" state
        const blockedIn = !included && (msTotal + curDur > (model.maxClipSec||15)+0.001);
        const toggleInclude = ()=>{
          msTouchedRef.current = true;   // hand-picked rows — auto-fit stands down
          setMsOff(s=>{
            const n = new Set(s);
            if(n.has(sh.id)){
              const cap = model.maxClipSec || 15;
              if(msTotal + curDur > cap+0.001){
                if(window.appToast) window.appToast("Shot "+(i+1)+" ("+_fmtSecs(curDur)+") would push the render to "+_fmtSecs(Math.round((msTotal+curDur)*10)/10)+" — over "+(model.label||"the model")+"'s "+_fmtSecs(cap)+" maximum. Shorten a row's seconds or untick another shot first.","error");
                return s;
              }
              n.delete(sh.id);
            }
            else {
              if(msShots.length<=1){ if(window.appToast) window.appToast("At least one shot must stay in the render."); return s; }
              n.add(sh.id);
            }
            return n;
          });
          // excluding auto-collapses the row; re-including auto-expands it
          setMsFolded(f=>{ const n=new Set(f); if(msOff.has(sh.id)) n.delete(sh.id); else n.add(sh.id); return n; });
        };
        const toggleFold = ()=> setMsFolded(f=>{ const n=new Set(f); n.has(sh.id)?n.delete(sh.id):n.add(sh.id); return n; });
        return _stEl("div",{key:sh.id,className:"stage2-ms-row"+(included?"":" off")+(folded?" folded":"")},
          _stEl("div",{className:"stage2-ms-head"},
            _stEl("button",{type:"button",className:"stage2-ms-fold",
              "aria-expanded":folded?"false":"true",
              title: folded ? "Expand this shot" : "Collapse this shot (it stays in the list)",
              onClick:toggleFold}, folded ? "▸" : "▾"),
            _stEl("button",{type:"button",className:"stage2-ms-check"+(included?" on":"")+(blockedIn?" blocked":""),
              "aria-pressed":included?"true":"false",
              title: included
                ? "Included in this render — click to leave this shot out (prompt, native multi-shot and duration all skip it; the shot itself is untouched)"
                : blockedIn
                ? "Over "+(model.label||"the model")+"'s "+_fmtSecs(model.maxClipSec||15)+" maximum — including this "+_fmtSecs(curDur)+" shot would push the total over. Shorten a row's seconds or untick another shot first."
                : "Excluded from this render — click to include this shot again",
              onClick:toggleInclude}, included?"✓":""),
            _stEl("span",{className:"stage2-ms-tag"},"Shot "+(i+1)),
            _stEl("span",{className:"stage2-ms-beat"},"Beat "+(sh.beatN||"—")),
            included && edited && _stEl("button",{type:"button",className:"stage2-ms-reset",
              title:"Restore this shot's derived text (your edit is video-only and will be discarded)",
              onClick:()=> onUpdateShot && onUpdateShot(sh.id,{ vidText: undefined })},"↺ derived"),
            !included && _stEl("span",{className:"stage2-ms-offlab"},"not in this render"),
            _stEl("span",{className:"stage2-ms-dur"},(()=>{
              // per-shot seconds live on the INTERVAL GRID 4/8/12/15 (bounded by the
              // voiced line's measured minimum and the model's per-render cap) — the
              // current value and voiced minimum are always offered so nothing snaps
              // out from under the user; − / + step through the grid.
              const cap = model.maxClipSec||15;
              const opts = Array.from(new Set(
                  [ ...(window.STAGE_MS_STEPS||[4,8,12,15]), cap, curDur, Math.round(voicedMin*10)/10 ]))
                .filter(v=> v>=Math.max(1,voicedMin)-0.001 && v<=cap)
                .sort((a,b)=>a-b);
              const idx = opts.findIndex(v=>Math.abs(v-curDur)<0.001);
              const stepTo = (di)=>{ const v=opts[Math.max(0,Math.min(opts.length-1,(idx<0?0:idx)+di))]; if(v>0) setDur(v); };
              return [
                _stEl("button",{key:"m",type:"button",disabled:!onUpdateShot||idx<=0,
                  title: idx<=0 && voicedMin>1 ? ("Minimum "+_fmtSecs(voicedMin)+" — locked to the voiced line") : "Shorter",
                  onClick:()=>stepTo(-1)},"−"),
                _stEl("select",{key:"s",className:"stage2-ms-durpick",value:String(curDur),disabled:!onUpdateShot,
                  title:"Seconds for this shot — 4 / 8 / 12 / "+cap+"s"+(voicedMin>1?(", minimum "+_fmtSecs(voicedMin)+" (the voiced line's measured audio)"):"")
                    +", on "+(model.label||"this model"),
                  onChange:(e)=>{ const v=Number(e.target.value); if(v>0) setDur(v); }},
                  opts.map(v=>_stEl("option",{key:v,value:String(v)},_fmtSecs(Math.round(v*10)/10)))),
                _stEl("button",{key:"p",type:"button",disabled:!onUpdateShot||idx>=opts.length-1,title:"Longer",
                  onClick:()=>stepTo(1)},"+")];
            })())),
          // the shot's text sits IN the box (editable) — editing saves a video-only
          // override on the shot; ↺ derived brings the live derived line back.
          // A COLLAPSED row hides only its text box; the shot stays fully in the list.
          !folded && _stEl("textarea",{className:"stage2-ms-text"+(edited?" edited":""),rows:3,
            placeholder:"Describe the shot — who is where and what is happening.",
            value: edited ? String(sh.vidText) : canon,
            onChange:(e)=>{ if(!onUpdateShot) return; const v = e.target.value.slice(0,500);
              onUpdateShot(sh.id, { vidText: v.trim()==="" ? undefined : v }); },
            title:"This shot's video description — compiled into the prompt. Editing saves a video-only override (the shot card's canon Action is never changed); ↺ derived restores the live text."}));
      }),
      (()=>{ // ceiling notice with ONE-CLICK fixes. "Fit" leads — whole-scene mode
        // means the user wants ONE render, so rescaling the seconds honestly (instead
        // of letting the render clamp silently) is the best default; "Render in parts"
        // (per-clip packing) is the alternative when every second matters. Voiced
        // lines keep their measured minimum — if those alone exceed the ceiling,
        // fitting is impossible and parts is the only path.
        const durOf = (sh)=> Number(sh.dur) || (typeof shotDur==="function" ? shotDur(sh) : 3);
        const minOf = (sh)=> (sh.lineAudio && sh.lineAudio.durationMs) ? Math.max(1, Math.round(((sh.lineAudio.durationMs/1000)+0.4)*10)/10) : 1;
        // ceiling math counts INCLUDED shots only — excluding a shot is itself a fix
        const totalSec = msShots.reduce((a,sh)=> a + durOf(sh), 0);
        const cap = model.maxClipSec || 15;
        if(totalSec <= cap) return null;
        const minTotal = msShots.reduce((a,sh)=> a + minOf(sh), 0);
        const canFit = !!onUpdateShot && minTotal <= cap;
        const fit = ()=>{
          if(!canFit) return;
          const fixed = minTotal;
          const flexBudget = cap - fixed;
          const flexCurrent = msShots.reduce((a,sh)=> a + Math.max(0, durOf(sh)-minOf(sh)), 0) || 1;
          msShots.forEach(sh=>{
            const extra = Math.max(0, durOf(sh)-minOf(sh)) * flexBudget / flexCurrent;
            onUpdateShot(sh.id, { dur: Math.max(minOf(sh), Math.round((minOf(sh)+extra)*10)/10) });
          });
          if(window.appToast) window.appToast("Shot seconds fitted to "+(model.label||"the model")+"'s "+cap+"s — the steppers now show the real pacing.");
        };
        return _stEl("div",{className:"stage2-ms-over"},
          _stEl("span",{className:"stage2-ms-over-text"},
            "Rows total "+_fmtSecs(Math.round(totalSec*10)/10)+" — over "+(model.label||"this model")+"'s "+cap+"s ceiling."
            +(canFit ? "" : " Voiced lines alone need "+_fmtSecs(Math.round(minTotal*10)/10)+", so one render can't hold this scene.")),
          canFit && _stEl("button",{type:"button",className:"stage2-ms-over-act primary",
            title:"Rescale the shots' seconds proportionally into ONE "+cap+"s render (voiced lines keep their measured minimum) — the recommended fix for shooting the whole scene in one pass.",
            onClick:fit},"Fit to "+cap+"s"),
          setPackMode && _stEl("button",{type:"button",className:"stage2-ms-over-act",
            title:"Switch packing to Per clip — every shot keeps its full seconds and the scene renders in parts (more renders, more credits), stitched on the Timeline.",
            onClick:()=>setPackMode("auto")},"Render in parts"));
      })(),
      _stEl("div",{className:"stage2-ms-hint"},"One row = one shot. Edit the text freely — it shapes the video prompt only; Generate renders these rows as one continuous, time-coded clip"+(seedanceModelOf(modelId).id==="kling-3.0"?" (Kling renders each row natively on its own prompt)":"")+". (Add or remove shots on the Art Room's Shots tab.)")),
    _stEl("div",{className:"stage2-gen-row"+(recipe==="multishot"?" ms":"")},
    _stEl("div",{className:"stage2-gen-box"+(recipe==="multishot"?" ms-mode":"")},
      // in Multi-shot mode the ROWS are the prompt editor — the compiled text is
      // hidden (it still compiles and renders; switch to Timeline to read it)
      recipe!=="multishot" && _stEl("div",{className:"stage2-gen-promptwrap"},
        _stEl("textarea",{ref:promptRef,className:"stage2-gen-prompt",value:prompt,
          placeholder:"Describe the video you want to create…",
          maxLength:PANEL_PROMPT_MAX,spellCheck:false,onChange:onPromptChange,onKeyDown:onPromptKeyDown,
          onBlur:()=>setTimeout(()=>setMentionBox(null),120)}),
        badMentions.length>0 && _stEl("div",{className:"stage2-mention-warn"},
          "⚠ "+badMentions.join(", ")+" — not among this render's included assets; the model will guess. Fix the token or include the asset."),
        mentionBox && mentionItems(mentionBox.query).length>0 && _stEl("div",{className:"stage2-mention-box"},
          mentionItems(mentionBox.query).map((m,i)=>_stEl("button",{key:m.t,type:"button",
            className:"stage2-mention-item"+(i===mentionBox.hi?" hi":""),
            onMouseDown:e=>{ e.preventDefault(); insertMention(m.t); }},
            // thumbnail, Seedance-style: the asset's image, or a glyph tile for video/audio
            m.kind==="image" && m.url
              ? _stEl("img",{className:"stage2-mention-thumb",src:m.url,alt:""})
              : _stEl("span",{className:"stage2-mention-thumb tile"},
                  m.kind==="video" ? (Icon.film&&_stEl(Icon.film,{s:13})) : (Icon.mic&&_stEl(Icon.mic,{s:13}))),
            _stEl("span",{className:"stage2-mention-main"},
              _stEl("b",null,m.t), m.label && _stEl("span",{className:"stage2-mention-label"},m.label)),
            _stEl("span",{className:"stage2-mention-kind"},
              m.kind==="image"?"Image":m.kind==="video"?"Video":"Audio"))))),
      _stEl("div",{className:"stage2-gen-controls"},
        // References/Elements trays + tier/bitrate/audio moved to the Render settings
        // panel (labelled) — the composer keeps only the per-take creative levers.
        _stEl("button",{className:"stage2-gen-tool"+(settingsOpen?" on":""),type:"button",
          title:(settingsOpen?"Hide":"Show")+" render settings — references, tier, bitrate, audio, seed, end frame",
          "aria-pressed":settingsOpen?"true":"false",
          onClick:()=>setSettingsOpen(o=>!o)},
          Icon.grid&&_stEl(Icon.grid,{s:14})),
        composerMenus.map(p=>_stEl(StagePillMenu,{key:p.key,...p})),
        _stEl("span",{className:"stage2-gen-pill stage2-gen-batch"+(batchN>1?" on":""),
          title:planMaxBatch<=1
            ? "Takes per Generate — batch rendering (up to 4 parallel takes) unlocks on the Studio plan"
            : "Takes per Generate — "+batchN+" parallel render"+(batchN!==1?"s":"")+" with distinct seeds, every take lands in the Version list ("+totalCost+" credits total)"},
          _stEl("button",{type:"button",title:"Fewer takes","aria-label":"Fewer takes",disabled:batchN<=1||gening,
            onClick:()=>setBatchN(n=>Math.max(1,n-1))},"−"),
          _stEl("span",null,batchN+"/"+planMaxBatch),
          _stEl("button",{type:"button",disabled:batchN>=4||gening,
            title:batchN>=planMaxBatch&&planMaxBatch<4 ? "Batch takes need the Studio plan — click to upgrade" : "More takes",
            "aria-label":"More takes",
            onClick:()=>{ if(batchN>=planMaxBatch){ if(planMaxBatch<4) openPlansUpsell(); return; } setBatchN(n=>Math.min(4,n+1)); }},"+")),
        endFrameUrl && _stEl("button",{type:"button",className:"stage2-gen-pill on",title:"Transitioning into a chosen end frame (End frame control in Render settings)"},
          Icon.image&&_stEl(Icon.image,{s:14}),_stEl("span",null,"→ End frame")),
      recipe!=="multishot" && genSubmitBtn)),
    // Multi-shot: Generate stands OUTSIDE the pills box, inline to its right
    recipe==="multishot" && genSubmitBtn),
      // (cancelling an in-flight render lives in the Render settings panel — "Cancel render";
      //  the REFERENCES-added-at-render preview lives in the panel's Inputs tab)
    (blocker || genErr || soundCueMissing || recipeHint || !modelRefs
      || (hasDialogue && (!modelAudioRefs || dialogueAudio==="native"))) && _stEl("div",{className:"stage2-gen-notices"},
      // the PRIMARY blocker — prominent, actionable, and the target of a blocked
      // Generate click (key remount restarts the shake animation on every pulse)
      blocker && _stEl("div",{ref:blockerRef,key:"blk-"+blocker.key+"-"+blockPulse,
          className:"stage2-blocker"+(blockPulse?" pulse":"")},
        Icon.alert&&_stEl(Icon.alert,{s:14}),
        _stEl("span",{className:"stage2-blocker-text"}, blocker.text),
        blocker.actionLabel && _stEl("button",{type:"button",className:"stage2-blocker-act",disabled:blocker.busy,onClick:blocker.action}, blocker.actionLabel)),
      blockers.slice(1).map(b=>_stEl("div",{key:b.key,className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}),
        _stEl("span",{className:"stage2-warn-text"}, b.text),
        b.actionLabel && _stEl("button",{type:"button",className:"stage2-warn-act",disabled:b.busy,onClick:b.action}, b.actionLabel))),
      genErr && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), genErr),
      recipeHint && _stEl("div",{className:"stage2-hint"}, Icon.script&&_stEl(Icon.script,{s:12}), recipeHint),
      soundCueMissing && _stEl("div",{className:"stage2-hint"}, Icon.mic&&_stEl(Icon.mic,{s:12}), "Native audio is on but the prompt has no sound direction — name the sounds you want (ambience, effects, music) or the soundtrack comes out generic."),
      hasDialogue && !modelAudioRefs && _stEl("div",{className:"stage2-hint"}, Icon.mic&&_stEl(Icon.mic,{s:12}),
        model.label+" performs the dialogue ITSELF from the prompt (native synced voices) — the locked ElevenLabs voices don't ride along on this model. Switch to Seedance for voice-locked lip-sync."),
      hasDialogue && modelAudioRefs && dialogueAudio==="native" && _stEl("div",{className:"stage2-hint"}, Icon.mic&&_stEl(Icon.mic,{s:12}),
        "Native performance: the model acts the lines in its own voice with free, natural pacing. Swap to your locked ElevenLabs voices in post with Voice Changer — it keeps the performance and timing, changes only the timbre."),
      !modelRefs && _stEl("div",{className:"stage2-hint"}, Icon.image&&_stEl(Icon.image,{s:12}),
        model.label+" takes ONE start image — identity rides that frame, not the reference sheets. Only the selected visual source is sent; other assets stay behind.")),
    tray);

  // ----- CENTER: player + filmstrip + prompt + input assets -----
  const center = _stEl("div",{className:"stage2-center stage2-compose-mode"},
    _stEl("div",{className:"stage2-clip-head"},
      _stEl("div",{className:"stage2-clip-slug"}, beatLabel+"  ",
        _stEl("span",{className:"stage2-clip-loc"}, scene.loc),
        _stEl("span",{className:"stage2-clip-name"}, " · "+_firstWords(beatName, 6))),
      _stEl("div",{className:"stage2-clip-tools"},
        // clip-packing switcher — lives on the player head so the shooting mode is
        // visible before any prompt work: beat-by-beat clips vs the ENTIRE scene as
        // one render (whole-scene models like Seedance 2.5; today's model clamps
        // long scenes to its duration ceiling, compressing pacing)
        setPackMode && _stEl("div",{className:"stage2-packseg",role:"group","aria-label":"Clip packing"},
          _stEl("button",{type:"button",className:"stage2-packbtn"+(packMode!=="scene"?" on":""),
            title:"Per clip (auto) — pack shots into clips by the model's duration & shot budget; render the scene clip by clip.",
            onClick:()=>setPackMode("auto")},"Per clip"),
          _stEl("button",{type:"button",className:"stage2-packbtn"+(packMode==="scene"?" on":""),
            title:"Whole scene — every shot of the scene in ONE render (ignores manual clip splits); the prompt tabs below compose for the entire scene, and Narrative auto-fills the combined scene prompt. On today's model the clip clamps to its duration ceiling.",
            onClick:()=>setPackMode("scene")},"Whole scene")),
        _stEl("select",{className:"stage2-version-select",
          value: activeTakeUrl || (visibleTakes[0]&&visibleTakes[0].url) || "",
          disabled: !visibleTakes.length,
          title: visibleTakes.length ? "Switch between this clip's rendered takes" : "No takes rendered yet",
          onChange:e=>setActiveTakeUrl(e.target.value)},
          visibleTakes.length
            ? visibleTakes.map((t,i)=>{ const m=t.meta||{};
                const bits=[_stageTakeVno(t, visibleTakes, i),
                  m.status==="approved" ? "★" : null,
                  m.source ? (STAGE_SOURCE_SHORT[m.source]||m.source) : null,
                  _stageAgo(m.createdAt)||null].filter(Boolean).join(" · ");
                return _stEl("option",{key:t.id,value:t.url}, bits+(i===0?" (latest)":"")); })
            : _stEl("option",{value:""},"No renders yet")),
        // take MANAGEMENT (approve / restore / reuse) lives one click from the
        // dropdown — the dedicated room tab is gone, this button opens the same view
        onOpenVersions && _stEl("button",{type:"button",className:"stage2-version-manage",
          disabled: !visibleTakes.length,
          title: visibleTakes.length
            ? "Manage this clip's takes — approve, restore, reuse"
            : "No takes rendered yet",
          onClick:()=>onOpenVersions()},
          Icon.copy&&_stEl(Icon.copy,{s:13}), _stEl("span",null,"Takes")),
        // (full screen is a double-click on the video itself)
        )),
    // player
    _stEl("div",{className:"stage2-player",style:_stageAspectCss(aspect)},
      playerUrl
        ? _stEl("video",{ref:playerVideoRef,src:playerUrl,poster:shotStartFrame||undefined,controls:true,playsInline:true,
            title:"Double-click for full screen",onDoubleClick:playerFullscreen})
        : _stEl("div",{className:"stage2-player-empty"},
            _stEl("span",{className:"stage2-player-playring"+(gening?" busy":"")}, Icon.play&&_stEl(Icon.play,{s:22})),
            _stEl("div",{className:"stage2-player-msg"}, gening ? (stageStatusLabel(gen.status)||"Rendering…") : "Not rendered yet"),
            _stEl("div",{className:"stage2-player-sub"}, gening ? ((model.label||"The model")+" is generating this clip…") : "Generate this clip to create the video"))),
    !playerUrl && _stEl("div",{className:"stage2-ruler"},
      _stEl("div",{className:"stage2-ruler-fill",style:{width:"22%"}}),
      _stEl("span",{className:"stage2-ruler-dur"}, "0:00 / 0:"+_pad2(duration))),
    // filmstrip below the player — one card PER CLIP (not per raw shot): a clip can
    // bundle 2+ merged shots (Art Room Shots merge / Storyboards compose-from-frames /
    // a cropped sheet half), and each card's thumbnail is that clip's own merged
    // reference frame, matching what Generate actually renders.
    _stEl("div",{className:"stage2-timeline"},
      _stEl("button",{type:"button",className:"stage2-time-arrow",title:"Previous clip",
        disabled:clipsInScene.findIndex(c=>c.id===clip.id)<=0,
        onClick:()=>{ const i=clipsInScene.findIndex(c=>c.id===clip.id); if(i>0) onSelectClip&&onSelectClip(clipsInScene[i-1].id); }},
        Icon.chevL&&_stEl(Icon.chevL,{s:14})),
      _stEl("div",{className:"stage2-time-track"},
        _stEl("div",{className:"stage2-time-ruler"},
          [0,2,4,6,8].map(n=>_stEl("span",{key:n,className:n===2?"on":""},"00:"+_pad2(n)))),
        _stEl("div",{className:"stage2-time-cards"},
          // the strip is RESERVED FOR GENERATED VIDEOS — one single scrolling line,
          // no placeholder tiles for unrendered clips, no add tile. Clips without a
          // take are still reached with the ◀ ▶ clip arrows (they cycle every clip).
          (()=>{ const rendered = clipsInScene.filter(c=> (typeof vidGetVideo==="function") && vidGetVideo(c.id));
            if(!rendered.length) return _stEl("div",{className:"stage2-time-empty"},
              "No generated videos yet — render this clip and the take lands here.");
            return rendered.map(c=>{
              const active = c.id===clip.id;
              const name = clipBeatName(c, beatsMap, drafts);
              const vid = vidGetVideo(c.id);
              const shotCount = (c.data.shots||[]).length;
              return _stEl("button",{key:c.id,type:"button",className:"stage2-time-card rendered"+(active?" on":""),
                onClick:()=>onSelectClip&&onSelectClip(c.id),title:c.label+" · "+name+" · rendered"+(shotCount>1?" · "+shotCount+" shots merged":"")},
                _stEl("div",{className:"stage2-time-thumb"},
                  _stEl("video",{src:vid,muted:true,playsInline:true,preload:"metadata"}),
                  shotCount>1 && _stEl("span",{className:"stage2-time-merge",title:shotCount+" shots merged into this clip"}, "×"+shotCount),
                  _stEl("span",{className:"stage2-time-play"},Icon.play&&_stEl(Icon.play,{s:12}))),
                _stEl("div",{className:"stage2-time-meta"},
                  _stEl("b",null,c.label+" "+name),
                  _stEl("span",null,_fmtSecs(c.data.dur)))); }); })())),
      _stEl("button",{type:"button",className:"stage2-time-arrow",title:"Next clip",
        disabled:(()=>{ const i=clipsInScene.findIndex(c=>c.id===clip.id); return i<0 || i>=clipsInScene.length-1; })(),
        onClick:()=>{ const i=clipsInScene.findIndex(c=>c.id===clip.id); if(i>=0 && i<clipsInScene.length-1) onSelectClip&&onSelectClip(clipsInScene[i+1].id); }},
        Icon.chevR&&_stEl(Icon.chevR,{s:14}))),
    composer,
    _stEl("div",{className:"stage2-director-prompt"},
      _stEl("div",{className:"stage2-director-head"},
        _stEl("div",{className:"stage2-director-title"},
          _stEl("b",null,model.label+" Director"),
          _stEl("span",{className:"stage2-director-badge"},"PRIMARY PROMPT"))),
      _stEl("textarea",{className:"stage2-director-text",value:prompt,
        placeholder:"Describe the video you want to create…",
        maxLength:PANEL_PROMPT_MAX,spellCheck:false,onChange:e=>setPrompt(e.target.value.slice(0,PANEL_PROMPT_MAX))}),
      _stEl("div",{className:"stage2-director-chips"},
        promptChips.map(([k,v],i)=>_stEl("button",{key:k+i,type:"button",onClick:()=>onChip({k,v,label:v}),title:"Add "+k+" to prompt"},
          _stEl("b",null,k),_stEl("span",null,v))))),
    _stEl("div",{className:"stage2-assets-lab"},
      _stEl("span",null,"INPUT ASSETS ("+budgetUsed+"/"+assetLimit+")"),
      _stEl("b",null, budgetText)),
    _stEl("div",{className:"stage2-assets-row "+budgetState},
      tagged.map(a=> _stEl("button",{key:a.key,
        type:"button",
        className:"stage2-asset "+a.kind+" "+assetState(a)+(on(a)?" on":"")+(a.locked?" locked":""),
        "aria-pressed":(!a.locked&&a.ready)?(on(a)?"true":"false"):undefined,
        "aria-disabled":(a.locked||!a.ready)?"true":undefined,
        title:assetTitle(a),
        onClick:()=>toggle(a)},
        _stEl("span",{className:"stage2-asset-check"}, on(a) ? (Icon.check&&_stEl(Icon.check,{s:10})) : ""),
        _stEl("div",{className:"stage2-asset-vis"},
          a.kind==="text" ? _stEl("span",{className:"stage2-asset-textic"},"T")
          : a.kind==="audio" ? _stEl("span",{className:"stage2-asset-icon"}, Icon.mic&&_stEl(Icon.mic,{s:16}))
          : (a.url && !imgFailed(a)) ? _stEl(React.Fragment,null,
              a.kind==="video" ? _stEl("video",{src:a.url,muted:true,playsInline:true,preload:"metadata"}) : _stEl("img",{src:a.url,alt:"",loading:"lazy",
                onError:()=>noteImgFail(a)}),
              (a.kind==="image"||a.kind==="video") && _stEl("span",{className:"stage2-asset-max",role:"button","aria-label":"Maximise",title:"Maximise",
                onClick:(e)=>{ e.stopPropagation(); e.preventDefault(); setMaxImg({url:a.url, label:a.label, kind:a.kind}); }},
                Icon.maximize&&_stEl(Icon.maximize,{s:11})))
          : _stEl("span",{className:"stage2-asset-icon"}, a.kind==="video" ? (Icon.play&&_stEl(Icon.play,{s:16})) : (Icon.image&&_stEl(Icon.image,{s:16})))),
        _stEl("span",{className:"stage2-asset-name"}, a.label),
        _stEl("small",null,a.tag+(a.locked?" · REQUIRED":on(a)?" · INCLUDED":"")))),
      _stEl("button",{className:"stage2-asset add",type:"button",
        title:"Assets are derived from the selected clip's storyboard, frame, cast, location, props and audio"},
        _stEl("div",{className:"stage2-asset-vis"},Icon.plus&&_stEl(Icon.plus,{s:17})),
        _stEl("span",{className:"stage2-asset-name"},"Add asset"))),
    (!sourceReady || assetOver || genErr || needsVoice || creditInfo.empty) && _stEl("div",{className:"stage2-assets-warnings"},
      needsVoice && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), "Voice this clip before rendering so timing and lip-sync stay locked."),
      !sourceReady && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), usePanels ? "No storyboard source is ready yet." : "This clip has no shot frame yet."),
      assetOver && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), "Too many inputs selected. Exclude "+budgetOverBy+" optional asset"+(budgetOverBy!==1?"s":"")+" before rendering."),
      creditInfo.empty && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}),
        _stEl("span",{className:"stage2-warn-text"}, "Not enough generation credits — this render needs "+totalCost+(creditInfo.known?(", "+creditInfo.remaining+" remaining"):"")+"."),
        _stEl("button",{type:"button",className:"stage2-warn-act",
          title:"Top up your balance with a one-off credit pack, or subscribe for a monthly allowance",
          onClick:()=>{ if(typeof window.turnOpenPlans==="function") window.turnOpenPlans(); }}, "Get credits")),
      genErr && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), genErr))
    /* Target Stage UI keeps supporting beat/story/reference context out of the main surface. */,
    false && _stEl("div",{className:"stage2-midcards"},
      _stEl("div",{className:"stage2-midcard"},
        _stEl("div",{className:"stage2-midcard-head"},
          _stEl("span",null,"Beat context"),
          _stEl("b",null,beatLabel)),
        _stEl("div",{className:"stage2-context-list compact"},
          contextRows.map((r,i)=>_stEl("div",{key:i,className:"stage2-context-row"},
            _stEl("span",null,r[0]), _stEl("b",null,r[1]))))),
      _stEl("div",{className:"stage2-midcard"},
        _stEl("div",{className:"stage2-midcard-head"},
          _stEl("span",null,"Story match"),
          _stEl("b",null,"live")),
        _stEl("div",{className:"stage2-context-copy"},
          _stEl("label",null,"Screenplay"),
          _stEl("p",null, scriptText || "No screenplay excerpt mapped to this beat yet."),
          blockingText && _stEl(React.Fragment,null,
            _stEl("label",null,"Storyboard blocking"),
            _stEl("p",null, blockingText)))),
      _stEl("div",{className:"stage2-midcard"},
        _stEl("div",{className:"stage2-midcard-head"},
          _stEl("span",null,"References"),
          _stEl("b",null,budgetUsed+" / "+assetLimit)),
        _stEl("div",{className:"stage2-ref-tags"},
          castNames.map(n=>_stEl("span",{key:"c"+n,className:"stage2-ref-tag cast"}, n)),
          (d.loc&&d.loc.name) && _stEl("span",{className:"stage2-ref-tag loc"}, d.loc.name),
          propNames.map(n=>_stEl("span",{key:"p"+n,className:"stage2-ref-tag prop"}, n)),
          !castNames.length && !propNames.length && !(d.loc&&d.loc.name) && _stEl("span",{className:"stage2-ref-empty"},"No derived references yet"))),
      (d.chips||[]).length>0 && _stEl("div",{className:"stage2-midcard wide"},
        _stEl("div",{className:"stage2-midcard-head"},
          _stEl("span",null,"Prompt ingredients"),
          _stEl("b",null,(d.chips||[]).length)),
        _stEl("div",{className:"stage2-chips"},
          d.chips.map((ch,i)=>_stEl("button",{key:i,type:"button",className:"stage2-chip "+_chipClass(ch.k),
            title:"Add "+ch.k+": "+(ch.v||""),onClick:()=>onChip(ch)},
            _stEl("b",null,ch.k),_stEl("span",null,ch.label||ch.v)))))));

  // ----- Render-settings panel: the full per-clip control surface (model/tier,
  // resolution, seed, end frame, camera/lighting/performance, audio, duration, recipe).
  // Docked on the RIGHT like the Writers' Room inspector — collapsible to a slim strip;
  // the composer stays a compact prompt box + pills. -----
  // ---- Render settings panel, organised into three tabs (the Writers' Room
  // segmented pattern): MODEL (engine + quality), INPUTS (what feeds the render),
  // DIRECTOR (how it's staged). Voice/errors/Generate stay persistent below. ----
  const panelTabs = [["model","Model"],["inputs","Inputs"],["director","Director"]];
  // ---- the unified RENDER card: EVERY cost-bearing choice (model · tier · resolution ·
  // duration) plus the LIVE credit cost and the model's capabilities as compact chips —
  // one glanceable answer to "what will this render cost and why". Always visible above
  // the tabs; the tabs below keep only the advanced knobs (seed, bitrate, batch, end frame). ----
  const renderCard = _stEl("div",{className:"stage2-rendercard"},
    _stEl("div",{className:"stage2-rc-head"},
      _stEl("span",{className:"eyebrow"},"Render"),
      _stEl("b",{className:"stage2-rc-cost"+(creditInfo.empty?" empty":""),
        title:renderCostTitle+". "+creditInfo.title},
        Icon.sparkles&&_stEl(Icon.sparkles,{s:11}), totalCost+" credit"+(totalCost!==1?"s":""))),
    // model picker — data-driven from SEEDANCE_MODELS; a future model is one registry
    // entry, so it shows up here (disabled, with its note as a tooltip) automatically.
    _stEl("div",{className:"sd-gen-modelrow",role:"radiogroup","aria-label":"Model"},
      SEEDANCE_MODELS.map(m=>{
        const planLocked = m.status==="active" && !planAllowsModel(m.id);
        return _stEl("button",{key:m.id,type:"button",
          className:"sd-gen-model"+(modelId===m.id?" on":"")+(m.status==="soon"?" soon":"")+(planLocked?" plan-locked":""),
          disabled:m.status==="soon",
          title:m.status==="soon" ? (m.label+" — "+m.note)
              : planLocked ? (m.label+" — every model unlocks on the Director plan. Click to upgrade.")
              : m.label,
          onClick:()=>{ if(m.status!=="active") return;
            if(planLocked){ openPlansUpsell(); return; }
            modelTouchedRef.current = true;   // hand-pick from the settings panel also stands down the auto default
            setModelId(m.id); const t0=seedanceTierOf(m,tier); if(t0) setTier(t0.id); }},
          m.label,
          m.status==="soon" && _stEl("span",{className:"sd-gen-model-soon"},"Soon"),
          planLocked && _stEl("span",{className:"sd-gen-model-soon plan"},"Director"));
      })),
    !!(model.tiers||[]).length && _ctrlRow("Tier", _stEl("div",{className:"sd-gen-quality"},
      model.tiers.map(t0=>_stEl("button",{key:t0.id,className:tier===t0.id?"on":"",type:"button",title:t0.note,onClick:()=>setTier(t0.id)},
        t0.fast&&Icon.sparkles&&_stEl(Icon.sparkles,{s:12}),t0.label)))),
    _ctrlRow("Resolution", _stEl("div",{className:"stage2-respills"},
      STAGE_RESOLUTIONS.map(r=>{
        const planLocked = stageResAllowed(tierObj, r) && !planAllowsRes(r);
        if(planLocked) return _stEl("button",{key:r,type:"button",
          className:"stage2-respill plan-locked"+(resolution===r?" on":""),
          title:planResNote(r)+" — click to upgrade",
          onClick:openPlansUpsell}, r, _stEl("span",{className:"respill-lock"},"↑"));
        const disabled = !stageResAllowed(tierObj, r);
        const reachable = (model.tiers||[]).some(t0=>stageResAllowed(t0, r));   // any tier of THIS model
        return _stEl("button",{key:r,type:"button",className:"stage2-respill"+(resolution===r?" on":""),
          disabled, title:disabled?(reachable?(r+" needs the Standard tier"):(r+" isn't available on "+model.label)):(r==="4K"?"4K — ~5× the 720p credit rate":r), onClick:()=>setResolution(r)}, r);
      }))),
    _ctrlRow("Duration", _stEl("select",{value:String(duration),
        title: durationLocked ? ("Minimum "+_fmtSecs(measuredSec)+" — the measured voice + breathing room; extend for more acting time") : "Clip duration",
        onChange:e=>{ const v=Number(e.target.value); setDurationOverride(durationLocked && v===measuredSec ? null : v); }},
        _uniq([duration, measuredSec||0, 4,5,6,8,10,12,15, model.maxClipSec||15])
          .filter(v=> v>0 && v<=(model.maxClipSec||15) && (!durationLocked || v>=measuredSec))
          .sort((a,b)=>a-b)
          .map(v=>_stEl("option",{key:v,value:String(v)},_fmtSecs(v)+(durationLocked&&v===measuredSec?" · voice + air (min)":""))))),
    // the cost math, spelled out — updates live with any choice above (and the batch pill)
    _stEl("div",{className:"stage2-rc-math",title:creditInfo.title},
      (batchN>1 ? (batchN+" takes × ") : "")+_fmtSecs(duration)+" × "+resolution+" × "+tierObj.label
        +" = "+totalCost+" credit"+(totalCost!==1?"s":"")
        +(creditInfo.known ? (" · "+creditInfo.remaining+" remaining") : "")),
    // capabilities as compact chips (full text on hover) — replaces the long text list
    _stEl("div",{className:"stage2-rc-caps"},
      (model.capabilities||[]).map((txt,i)=>
        _stEl("span",{key:i,className:"stage2-rc-cap",title:txt}, _firstWords(txt, 4)))));
  const tabModel = _stEl(React.Fragment,null,
    _stEl("div",{className:"sd-gen-modegrid"},
      MODES.map(([id,label])=>_stEl("button",{key:id,type:"button",
        className:"sd-gen-mode "+(mode===id?"on":""),
        onClick:()=>setModeOverride(id===autoMode?null:id),
        title:id===autoMode?"Auto-selected from current inputs":"Use "+label},
        label.split(" ").map((w,i)=>_stEl(React.Fragment,{key:w+i},i===2?_stEl("br",null):null,w+(i===label.split(" ").length-1?"":" ")))))),
    _stEl("label",{className:"sd-gen-label"},"Advanced"),
    // batch takes — parallel renders with distinct seeds; the Render card's cost
    // multiplies live as this changes (same state as the composer's batch pill)
    _ctrlRow("Batch takes", _stEl("div",{className:"stage2-seedrow stage2-batchrow"},
      _stEl("button",{type:"button",className:"stage2-seed-btn",title:"Fewer takes","aria-label":"Fewer takes",
        disabled:batchN<=1||gening,onClick:()=>setBatchN(n=>Math.max(1,n-1))},"−"),
      _stEl("span",{className:"stage2-batchrow-n",
        title:"Takes per Generate — "+batchN+" parallel render"+(batchN!==1?"s":"")+" with distinct seeds ("+totalCost+" credits total)"},
        batchN+" / "+planMaxBatch),
      _stEl("button",{type:"button",className:"stage2-seed-btn",disabled:batchN>=4||gening,
        title:batchN>=planMaxBatch&&planMaxBatch<4 ? "Batch takes need the Studio plan — click to upgrade" : "More takes",
        onClick:()=>{ if(batchN>=planMaxBatch){ if(planMaxBatch<4) openPlansUpsell(); return; } setBatchN(n=>Math.min(4,n+1)); }},"+"))),
    // bitrate is a Seedance-only lever — Sora-class engines have no bitrate_mode
    modelRefs && _ctrlRow("Bitrate", _stEl("select",{value:bitrate,
        title:"Compression of the delivered file — no cost difference",
        onChange:e=>setBitrate(e.target.value==="high"?"high":"standard")},
      _stEl("option",{value:"high"},"High — less compression, larger file"),
      _stEl("option",{value:"standard"},"Standard — more compression, smaller file"))));
  const tabInputs = _stEl(React.Fragment,null,
    _stEl("label",{className:"sd-gen-label"},"Assets summary"),
    _stEl("div",{className:"sd-gen-summary"},
      [["Text",counts.text,Icon.text],["Images",counts.images,Icon.image],["Videos",counts.videos,Icon.play],["Audio",counts.audio,Icon.mic]].map(([label,n,Ic])=>
        _stEl("div",{className:"sd-gen-summary-card",key:label},
          _stEl("span",null,label),
          _stEl("b",null,Ic&&_stEl(Ic,{s:12}),n)))),
    _stEl("label",{className:"sd-gen-label"},"References"),
    _stEl("div",{className:"sd-gen-refbtns"},
      _stEl("button",{type:"button",className:trayOpen==="refs"?"on":"",
        title:"Every derived input for this render — toggle in/out, inspect",
        onClick:(e)=>openTray("refs", e)},
        Icon.plus&&_stEl(Icon.plus,{s:13}),"All references ("+budgetUsed+"/"+assetLimit+")"),
      _stEl("button",{type:"button",className:trayOpen==="elems"?"on":"",
        title:"The story elements referenced in this clip — cast, location, props",
        onClick:(e)=>openTray("elems", e)},
        (Icon.userScan||Icon.user)&&_stEl(Icon.userScan||Icon.user,{s:13}),"Elements")),
    // read-only preview of the auto reference-role block appended at render — kept out
    // of the editable prompt so it always matches the CURRENT included assets.
    refLines.length>0 && _stEl("div",{className:"stage2-gen-refs",title:"Appended to the prompt at render, so Seedance knows what each attached reference is for. Updates as you include/exclude assets."},
      _stEl("b",null,"REFERENCES — added at render"),
      refLines.map((l,i)=>_stEl("span",{key:i},l))),
    _ctrlRow("Visual source", _stEl("select",{value:sourceOverride,
        title:"Which visual source anchors this render. Auto follows the per-clip rule: dialogue or 1 shot → the shot frame; 2 merged shots → the 2-panel storyboard half; 3–4 merged shots → per-shot frames when they fit the image budget, else the 4-panel sheet.",
        onChange:e=>setSourceOverride(e.target.value)},
      _stEl("option",{value:"auto"},"Auto — "+sourcePlan.label),
      _stEl("option",{value:"frame"},"Shot frame"),
      _stEl("option",{value:"frames",disabled:(d.shots||[]).length<2},"Per-shot frames"),
      _stEl("option",{value:"halves",disabled:!sourcePlan.hasHalves},"Storyboard halves"+(sourcePlan.hasHalves?"":" — none saved")),
      _stEl("option",{value:"sheet",disabled:!sourcePlan.hasSheet},"Full storyboard sheet"+(sourcePlan.hasSheet?"":" — none saved")))),
    _ctrlRow("End frame", _stEl("select",{
        value: endFrameAvailable ? endFrameId : "",
        disabled: !endFrameAvailable,
        title: endFrameAvailable
          ? "Transition this clip's start frame into the chosen end frame — renders through Seedance's dedicated image-to-video endpoint"
          : hasDialogue ? "Unavailable — this clip's lip-synced voice line needs the multimodal endpoint instead"
          : onVideos.length ? "Unavailable while a video reference is included"
          : "No end-frame candidates yet",
        onChange:e=>setEndFrameId(e.target.value)},
      _stEl("option",{value:""},"None — single take"),
      endFrameCandidates.map(c=>_stEl("option",{key:c.id,value:c.id},c.label)))));
  const tabDirector = _stEl(React.Fragment,null,
    _stEl("label",{className:"sd-gen-label"},"Direction"),
    _ctrlRow("Camera movement", _stEl("select",{value:camera,onChange:e=>setCamera(e.target.value)},
      _uniq([camera,...SEEDANCE_CAMERA_MOVES].filter(Boolean)).map(v=>_stEl("option",{key:v,value:v},v)))),
    _ctrlRow("Lighting", _stEl("select",{value:lighting,onChange:e=>setLighting(e.target.value)},
      _uniq([lighting,"Blue night + Warm practicals","Moonlit rain","Backlit silhouette","Soft ambient glow","High contrast noir"].filter(Boolean)).map(v=>_stEl("option",{key:v,value:v},v)))),
    _ctrlRow("Performance", _stEl("select",{value:perf,onChange:e=>setPerf(e.target.value)},
      _uniq([perf,d.lead].concat(dialogueSpeakers).filter(Boolean)).map(v=>_stEl("option",{key:v,value:v},v)))),
    _stEl("label",{className:"sd-gen-label"},"Timing & sound"),
    _ctrlRow("Audio", (hasDialogue && modelAudioRefs)
      ? _stEl("select",{value:dialogueAudio,
          title:"Locked voice lip-syncs to your ElevenLabs lines; Native performance lets the model act the lines itself (swap voices in post)",
          onChange:e=>setDialogueAudio(e.target.value==="native"?"native":"locked")},
          _stEl("option",{value:"locked"},"Locked voice — lip-synced to your lines"),
          _stEl("option",{value:"native"},"Native performance — model acts the lines"))
      : (hasDialogue && !modelAudioRefs)
      ? _stEl("select",{value:"native",disabled:true,onChange:()=>{}},
          _stEl("option",{value:"native"},"Native — the model voices the lines"))
      : _stEl("select",{value:nativeAudio?"on":"off",onChange:e=>setNativeAudio(e.target.value==="on")},
          _stEl("option",{value:"on"},"Generate native audio"),
          _stEl("option",{value:"off"},"Silent — no audio"))),
    _ctrlRow("Seed", modelRefs ? _stEl("div",{className:"stage2-seedrow"},
      _stEl("input",{className:"stage2-seed-input",type:"text",inputMode:"numeric",placeholder:"Random",
        value:seedInput, onChange:e=>setSeedInput(e.target.value.replace(/[^0-9]/g,""))}),
      lastSeed!=null && _stEl("button",{type:"button",className:"stage2-seed-btn",title:"Reuse the last rendered seed ("+lastSeed+")",onClick:()=>setSeedInput(String(lastSeed))},"↺"),
      seedInput && _stEl("button",{type:"button",className:"stage2-seed-btn",title:"Clear — render with a random seed",onClick:()=>setSeedInput("")},"✕"))
      : _stEl("select",{value:"na",disabled:true,onChange:()=>{}},
          _stEl("option",{value:"na"},"No seed control on this model"))),
    _stEl("div",{className:"sd-gen-pills"},
      _stEl("button",{type:"button",title:measuredSec?("Voice + breathing room = "+_fmtSecs(measuredSec)+" minimum — rendering "+_fmtSecs(duration)):"Estimated clip duration"},
        Icon.clock&&_stEl(Icon.clock,{s:14}), _fmtSecs(duration)),
      _stEl("button",{type:"button",title:"Aspect ratio"},
        Icon.monitor&&_stEl(Icon.monitor,{s:14}), effAspect||"16:9"),
      _stEl("button",{type:"button",title:hasDialogue ? (voiceReady?"Audio is on":"Voice this clip before rendering") : "No dialogue; native/silent audio"},
        Icon.mic&&_stEl(Icon.mic,{s:14}), hasDialogue ? (voiceReady?"ON":"NEEDS") : "ON")));
  const settings = _stEl("div",{className:"stage2-settings-drawer"},
    _stEl("div",{className:"stage2-settings-head"},
      _stEl("span",{className:"eyebrow"}, Icon.grid&&_stEl(Icon.grid,{s:12}),
        _stEl("span",{style:{marginLeft:7}},"Render settings")),
      _stEl("button",{className:"panel-collapse",onClick:()=>setSettingsOpen(false),title:"Collapse render settings"},
        Icon.chevR&&_stEl(Icon.chevR,{s:14}))),
    // the unified Render card leads — cost-bearing choices + live price, above the tabs
    _stEl("div",{className:"stage2-rc-wrap"}, renderCard),
    // the Writers' Room INSPECTOR tab style (underline .insp-tab), reused verbatim
    _stEl("div",{className:"insp-tabs stage2-settings-tabs"},
      panelTabs.map(([id,lab])=>_stEl("button",{key:id,className:"insp-tab"+(panelTab===id?" on":""),type:"button",
        onClick:()=>setPanelTab(id)},lab))),
    _stEl("div",{className:"sd-gen-panel"},
      panelTab==="model" && tabModel,
      panelTab==="inputs" && tabInputs,
      panelTab==="director" && tabDirector,
      needsVoice && onVoiceLine && _stEl("button",{className:"sd-gen-voice",type:"button",onClick:onVoiceClip,disabled:voicingClip},
        Icon.mic&&_stEl(Icon.mic,{s:14}), voicingClip?"Voicing…":"Voice clip first"),
      genErr && _stEl("div",{className:"stage2-err sd-gen-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), genErr),
      !sourceReady && _stEl("div",{className:"stage2-err sd-gen-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), usePanels
        ? "No storyboard source is ready yet."
        : "This clip has no shot frame yet."),
      assetOver && _stEl("div",{className:"stage2-err sd-gen-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), "Asset budget is over by "+budgetOverBy+". Exclude optional assets in the center panel."),
      creditInfo.empty && _stEl("div",{className:"stage2-err sd-gen-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), "No generation credits remaining."),
      gening
        ? _stEl("div",{className:"stage2-gen-busy sd-gen-busy"},
            _stEl("div",{className:"stage2-gen-prog"}, _stEl("div",{className:"orb"}), (stageStatusLabel(gen.status)||"Rendering…")),
            _stEl("button",{className:"sd-gen-cancel",type:"button",onClick:gen.cancel},"Cancel render"))
        : _stEl("button",{className:"sd-gen-submit"+(blocker?" blocked":""),type:"button",
            title: blocker ? (blocker.text+" (click to see why)") : renderCostTitle,
            "aria-disabled": blocker ? "true" : undefined, disabled:gening,
            onClick:()=>{ if(gening) return; if(blocker){ onBlockedGenerate(); return; } onGenerate(); }},
            playerUrl?"Regenerate clip":"Generate clip", Icon.sparkles&&_stEl(Icon.sparkles,{s:15})),
      _stEl("button",{className:"sd-gen-extend",type:"button",onClick:onExtend,disabled:!playerUrl||gening||creditInfo.empty},
        Icon.pencil&&_stEl(Icon.pencil,{s:13}),"Extend / edit"),
      _stEl("div",{className:"stage2-credit sd-gen-credit"+(creditInfo.empty?" empty":""),title:creditInfo.title},
        Icon.sparkles&&_stEl(Icon.sparkles,{s:11}),creditInfo.label),
      lastSeed!=null && _stEl("div",{className:"stage2-credit sd-gen-credit",title:"The seed fal returned for the last render — reuse it from the Seed control for repeatable variations"},
        "Seed "+lastSeed)));

  const lightbox = maxImg && _stEl("div",{className:"stage2-lightbox",onClick:()=>setMaxImg(null)},
    _stEl("button",{className:"stage2-lightbox-x",title:"Close",onClick:()=>setMaxImg(null)}, Icon.x&&_stEl(Icon.x,{s:18})),
    maxImg.kind==="video"
      ? _stEl("video",{className:"stage2-lightbox-media",src:maxImg.url,controls:true,autoPlay:true,playsInline:true,onClick:(e)=>e.stopPropagation()})
      : _stEl("img",{className:"stage2-lightbox-media",src:maxImg.url,alt:maxImg.label||"",onClick:(e)=>e.stopPropagation()}),
    maxImg.label && _stEl("div",{className:"stage2-lightbox-cap"}, maxImg.label));
  // buttoned strip, matching the Writers' Room Story/Inspector strips exactly
  const settingsStrip = (typeof CollapsedStrip!=="undefined")
    ? _stEl(CollapsedStrip,{ side:"right", label:"Render settings", icon:Icon.panelRight||Icon.grid, onExpand:()=>setSettingsOpen(true) })
    : _stEl("button",{className:"strip right strip-clickable",onClick:()=>setSettingsOpen(true),title:"Expand render settings"},
        _stEl("div",{className:"strip-label"},"Render settings"));
  return _stEl("div",{className:"stage2-console stage2-console-composer"+(settingsOpen?" settings-open":"")},
    center, settingsOpen ? settings : settingsStrip, lightbox);
}
function _ctrlRow(label, control){ return _stEl("div",{className:"stage2-ctrl"},
  _stEl("span",{className:"stage2-ctrl-l"}, label), control); }

/* ---- VERSIONS view — every take this clip has rendered, as reviewable versions.
   Left: version cards (stable vN + status + facts). Center: player + version details.
   Right: iteration tools (restore / approve / reuse / branch / delete) + filters.
   Takes come from vidGetTakes (current first); actions run through window.vid* helpers
   and refresh via the vid-done event the console already listens to. ---- */
function _stageVAudioLabel(a){ return a==="voice" ? "Locked voice" : a==="native" ? "Native audio" : a==="silent" ? "Silent" : ""; }
function _stageVSourceLabel(s){ const m = STAGE_SOURCE_MODES[s]; return (m&&m.label)||""; }
function _stageVRecipeLabel(r){ if(r==="scene") return "Whole scene"; const row = SEEDANCE_RECIPES.find(x=>x[0]===r); return (row&&row[1])||""; }
/* the VERSIONS view — a full Stage tab (was a per-clip modal). Loads the selected
   clip's takes itself, mutates them via the window.vid* helpers, and hands "Reuse /
   Branch" back to the Stage tab through onReuse (the composer applies the settings). */
function StageVersionsView({ clip, stageModel, onBack, onReuse }){
  const clipId = clip && clip.id;
  const [takes, setTakes] = React.useState(()=> (clipId && typeof vidGetTakes==="function") ? vidGetTakes(clipId) : []);
  React.useEffect(()=>{ let alive=true;
    if(clipId && typeof vidLoadTakes==="function") vidLoadTakes(clipId).then(t=>{ if(alive) setTakes(t||[]); });
    const onDone=(e)=>{ if(alive && e.detail && e.detail.ids && e.detail.ids.indexOf(clipId)>=0 && typeof vidGetTakes==="function") setTakes(vidGetTakes(clipId)); };
    window.addEventListener("vid-done", onDone);
    return ()=>{ alive=false; window.removeEventListener("vid-done", onDone); };
  }, [clipId]);
  const act = {
    approve:(url,on)=>{ if(window.vidApproveTake) window.vidApproveTake(clipId, url, on); },
    restore:(url)=>{ if(window.vidRestoreTake) window.vidRestoreTake(clipId, url)
      .then(()=>{ if(typeof window.appToast==="function") window.appToast("Restored as the current take — the filmstrip and assembly use it now.","ok"); }); },
    del:(url)=>{ if(!window.vidDeleteTake) return;
      if(window.confirm("Delete this take? The rendered video link is removed from this clip's versions.")) window.vidDeleteTake(clipId, url); },
    note:(url,text)=>{ if(window.vidUpdateTake) window.vidUpdateTake(clipId, url, { note:String(text||"").slice(0,300) }); },
  };
  const [selUrl, setSelUrl] = React.useState((takes[0]&&takes[0].url)||"");
  const [fStatus, setFStatus] = React.useState("all");
  const [fSource, setFSource] = React.useState("all");
  const [sortNew, setSortNew] = React.useState(true);
  // keep the selection valid when takes change under us (restore/delete re-order the list)
  React.useEffect(()=>{ if(!takes.some(t=>t.url===selUrl)) setSelUrl((takes[0]&&takes[0].url)||""); }, [takes.map(t=>t.url).join("|")]);
  const sel = takes.find(t=>t.url===selUrl) || takes[0] || null;
  const selMeta = (sel&&sel.meta)||{};
  const selApproved = selMeta.status==="approved";
  const list = takes.filter(t=>{
    const m = t.meta||{};
    if(fStatus==="approved" && m.status!=="approved") return false;
    if(fStatus==="drafts" && (m.status==="approved" || t.current)) return false;
    if(fSource!=="all" && m.source!==fSource) return false;
    return true;
  }).slice().sort((a,b)=>{
    const ka=((a.meta||{}).createdAt)||0, kb=((b.meta||{}).createdAt)||0;
    return sortNew ? (kb-ka) : (ka-kb);
  });
  const statusBadges = (t)=>{
    const m = t.meta||{}, out = [];
    if(t.current) out.push(_stEl("span",{key:"c",className:"stage2-vbadge current"},"Current"));
    if(m.status==="approved") out.push(_stEl("span",{key:"a",className:"stage2-vbadge approved"},"Approved"));
    if(!t.current && m.status!=="approved") out.push(_stEl("span",{key:"d",className:"stage2-vbadge draft"},"Draft"));
    return out;
  };
  const detailRows = sel ? [
    ["Model", (selMeta.model||"").indexOf("sora-2")>=0
      ? ("Sora 2"+((selMeta.model||"").indexOf("/pro")>=0?" · Pro":""))
      : (selMeta.model||"").indexOf("seedance-2.0")>=0
      ? ("Seedance 2.0"+((selMeta.model||"").indexOf("/fast/")>=0?" · Fast":"")+((selMeta.model||"").indexOf("image-to-video")>=0?" · transition":""))
      : (selMeta.model||"Seedance 2.0")],
    ["Workflow", _stageVSourceLabel(selMeta.source) || "—"],
    ["Duration", selMeta.durationSec ? (selMeta.durationSec+"s") : (selMeta.durationMs ? Math.round(selMeta.durationMs/1000)+"s" : "—")],
    ["Inputs", selMeta.inputs || "—"],
    ["Audio", _stageVAudioLabel(selMeta.audio) || "—"],
    ["Quality", [selMeta.tierLabel||selMeta.tier, selMeta.resolution, selMeta.bitrate==="high"?"high bitrate":null].filter(Boolean).join(" · ") || "—"],
    ["Recipe", _stageVRecipeLabel(selMeta.recipe) || "—"],
    ["Seed", selMeta.seed!=null ? String(selMeta.seed) : "—"],
    ["Take", selMeta.batchCount>1 ? (selMeta.batchIndex+" of "+selMeta.batchCount+" (batch)") : "single"],
    ["Created", selMeta.createdAt ? new Date(selMeta.createdAt).toLocaleString() : "—"],
  ] : [];
  // right-column MODEL CARD (mockup-style): the active engine + its capability chips
  const modelCard = stageModel && _stEl("div",{className:"stage2-vers-model"},
    _stEl("div",{className:"stage2-vers-model-t"}, stageModel.label,
      _stEl("span",{className:"stage2-vers-model-badge"}, stageModel.metaDur||"")),
    _stEl("div",{className:"stage2-vers-model-caps"},
      (stageModel.capabilities||[]).slice(0,8).map((c,i)=>_stEl("div",{key:i,className:"stage2-vers-cap"},
        _stEl("span",{className:"stage2-vers-cap-dot"}), c))));
  return _stEl("div",{className:"stage2-vers"},
      _stEl("div",{className:"stage2-versions-head"},
        _stEl("button",{className:"stage2-iconbtn",title:"Back to Shoot",onClick:onBack}, Icon.chevL&&_stEl(Icon.chevL,{s:15})),
        _stEl("div",{className:"stage2-versions-title"},
          Icon.layers&&_stEl(Icon.layers,{s:14}), "Takes",
          _stEl("span",{className:"stage2-versions-sub"}, (clip&&clip.label)||"")),
        _stEl("span",{className:"stage2-versions-count"}, takes.length+(takes.length===1?" take":" takes")),
        _stEl("button",{className:"stage2-iconbtn",title:"Back to Shoot",onClick:onBack}, Icon.x&&_stEl(Icon.x,{s:15}))),
      _stEl("div",{className:"stage2-versions-body"},
        // left — version cards
        _stEl("div",{className:"stage2-versions-list"},
          list.length ? list.map(t=>{
            const m = t.meta||{};
            return _stEl("button",{key:t.url,type:"button",
              className:"stage2-vcard"+(sel&&sel.url===t.url?" sel":""),
              onClick:()=>setSelUrl(t.url)},
              _stEl("video",{className:"stage2-vcard-thumb",src:t.url+"#t=0.1",preload:"metadata",muted:true,playsInline:true}),
              _stEl("div",{className:"stage2-vcard-main"},
                _stEl("div",{className:"stage2-vcard-row"},
                  _stEl("span",{className:"stage2-vcard-vno"}, _stageTakeVno(t, takes, takes.indexOf(t))),
                  statusBadges(t)),
                _stEl("div",{className:"stage2-vcard-chips"},
                  [ m.tierLabel||m.tier, m.resolution,
                    m.source ? (STAGE_SOURCE_SHORT[m.source]||m.source) : null,
                    _stageVAudioLabel(m.audio)||null,
                    m.batchCount>1 ? ("take "+m.batchIndex+"/"+m.batchCount) : null
                  ].filter(Boolean).map((c,i)=>_stEl("span",{key:i,className:"stage2-vchip"},String(c)))),
                m.note && _stEl("div",{className:"stage2-vcard-note"}, m.note),
                _stEl("div",{className:"stage2-vcard-time"}, _stageAgo(m.createdAt)||"")));
          }) : _stEl("div",{className:"stage2-versions-empty"},"No versions match these filters.")),
        // center — player + details
        _stEl("div",{className:"stage2-versions-viewer"},
          sel ? _stEl("video",{key:sel.url,className:"stage2-versions-video",src:sel.url,controls:true,playsInline:true,
            title:"Double-click for full screen",onDoubleClick:(e)=>_stageVideoFullscreen(e.currentTarget)}) : null,
          sel && _stEl("div",{className:"stage2-versions-details"},
            _stEl("div",{className:"stage2-versions-dhead"},"Version details"),
            detailRows.map(([k,v])=>_stEl("div",{key:k,className:"stage2-vdetail"},
              _stEl("span",{className:"stage2-vdetail-k"},k), _stEl("span",{className:"stage2-vdetail-v"},v))),
            _stEl("div",{className:"stage2-vdetail notes"},
              _stEl("span",{className:"stage2-vdetail-k"},"Notes"),
              _stEl("input",{key:sel.url,className:"stage2-vnote-input",defaultValue:selMeta.note||"",
                placeholder:"Why this take matters — e.g. best performance for this beat",
                onBlur:(e)=>{ const v=e.target.value.trim(); if(v!==(selMeta.note||"")) act.note(sel.url, v); },
                onKeyDown:(e)=>{ if(e.key==="Enter") e.target.blur(); }})))),
        // right — model card + iteration tools + filters
        _stEl("div",{className:"stage2-versions-tools"},
          modelCard,
          _stEl("div",{className:"stage2-versions-dhead"},"Iteration tools"),
          _stEl("button",{className:"stage2-vtool",disabled:!sel||!!(sel&&sel.current),
            title:"Make this take the clip's current video — the filmstrip and assembly use it",
            onClick:()=>sel&&act.restore(sel.url)}, "Restore as current"),
          _stEl("button",{className:"stage2-vtool"+(selApproved?" on":""),disabled:!sel,
            title:selApproved?"Remove the approval star":"Star this take as the clip's approved version — it never rolls off the version list",
            onClick:()=>sel&&act.approve(sel.url, !selApproved)}, selApproved?"★ Approved — unstar":"☆ Approve this take"),
          _stEl("button",{className:"stage2-vtool",disabled:!sel,
            title:"Load this take's visual source, tier, resolution, bitrate and recipe back into the Stage composer",
            onClick:()=>sel&&onReuse(selMeta,false)}, "Reuse settings"),
          _stEl("button",{className:"stage2-vtool",disabled:!sel||selMeta.seed==null,
            title:"Reuse settings AND pin this take's seed — Generate renders a controlled variation",
            onClick:()=>sel&&onReuse(selMeta,true)}, "Branch from version"),
          sel && _stEl("a",{className:"stage2-vtool link",href:sel.url,target:"_blank",rel:"noreferrer",download:""},"Download / open"),
          _stEl("button",{className:"stage2-vtool danger",disabled:!sel,
            onClick:()=>sel&&act.del(sel.url)}, "Delete take"),
          _stEl("div",{className:"stage2-versions-dhead filters"},"Filters"),
          _stEl("label",{className:"stage2-vfilter"},"Status",
            _stEl("select",{value:fStatus,onChange:(e)=>setFStatus(e.target.value)},
              _stEl("option",{value:"all"},"All"),
              _stEl("option",{value:"approved"},"Approved"),
              _stEl("option",{value:"drafts"},"Drafts"))),
          _stEl("label",{className:"stage2-vfilter"},"Source",
            _stEl("select",{value:fSource,onChange:(e)=>setFSource(e.target.value)},
              _stEl("option",{value:"all"},"All sources"),
              Object.keys(STAGE_SOURCE_MODES).map(k=>_stEl("option",{key:k,value:k},_stageVSourceLabel(k)||k)))),
          _stEl("label",{className:"stage2-vfilter"},"Sort",
            _stEl("select",{value:sortNew?"new":"old",onChange:(e)=>setSortNew(e.target.value==="new")},
              _stEl("option",{value:"new"},"Newest first"),
              _stEl("option",{value:"old"},"Oldest first"))))));
}

/* where each voiced line lands inside its clip — the SAME CLIP_AIR walk the clock and
   the Timeline recipe use, so the post mixer lays the pristine ElevenLabs lines exactly
   where the render was told to put them. */
function clipLinePlacements(clip, auds){
  const shots = ((clip&&clip.data&&clip.data.shots)||[]);
  const out = []; let t = CLIP_AIR.lead, spoken = 0;
  shots.forEach(sh=>{
    const talks = String((sh&&sh.dialogue)||"").trim();
    if(talks){
      if(spoken>0) t += CLIP_AIR.gap;
      const sec = Number((sh.lineAudio||{}).durationMs||0)/1000 || ((typeof _seedanceVoiceSec==="function")?_seedanceVoiceSec(sh):2);
      const p = (((clip.data||{}).panelLines)||[]).find(x=>x&&x.shotId===sh.id);
      out.push({ shotId:sh.id, at:Math.round(t*10)/10, sec:Math.round(sec*10)/10,
        url:(auds&&auds[sh.id])||"", speaker:(p&&p.speaker&&p.speaker.name)||(sh.lineAudio&&sh.lineAudio.speaker)||"Line",
        text:String(sh.dialogue||"").trim() });
      t += sec; spoken++;
    } else t += Math.min(3.5, (typeof stageShotRuntime==="function") ? stageShotRuntime(sh) : 2);
  });
  return out;
}

/* ---- TIMELINE tab — the FILM ASSEMBLY. Every clip in story order, grouped by scene,
   playing the CURRENT take back-to-back ("Restore as current" in Versions decides what
   plays). Read-only on purpose: the story defines the order; the Stage tab renders,
   the Versions tab picks takes, this tab watches the film. ---- */
function StageTimelineView({ allClips, vids, imgs, visualSource, selId, onSelectClip, onOpenStage }){
  const ordered = allClips||[];
  const startIdx = Math.max(0, ordered.findIndex(c=>c.id===selId));
  const [idx, setIdx] = React.useState(startIdx);
  const [playAll, setPlayAll] = React.useState(false);
  const videoRef = React.useRef(null);
  const cur = ordered[idx] || null;
  const curUrl = cur ? (vids[cur.id]||"") : "";
  const renderedN = ordered.filter(c=>vids[c.id]).length;
  const totalSec = ordered.reduce((t,c)=>t+(Number(c.data&&c.data.dur)||0),0);
  const doneSec = ordered.reduce((t,c)=>t+(vids[c.id]?(Number(c.data&&c.data.dur)||0):0),0);
  const jump = (i, autoplay)=>{ setIdx(i); const c=ordered[i]; if(c && onSelectClip) onSelectClip(c.id);
    if(autoplay) setTimeout(()=>{ try{ videoRef.current && videoRef.current.play(); }catch(e){} }, 60); };
  const nextPlayable = (from)=>{ for(let i=from+1;i<ordered.length;i++){ if(vids[ordered[i].id]) return i; } return -1; };
  const onEnded = ()=>{ if(!playAll) return; const n = nextPlayable(idx); if(n>=0) jump(n, true); else setPlayAll(false); };
  const playFilm = ()=>{ const first = vids[ordered[idx]&&ordered[idx].id] ? idx : nextPlayable(-1);
    if(first<0) return; setPlayAll(true); jump(first, true); };
  // scene grouping for the strip
  const groups = []; ordered.forEach((c,i)=>{ const last=groups[groups.length-1];
    if(last && last.scene.id===c.scene.id) last.items.push({c,i});
    else groups.push({ scene:c.scene, items:[{c,i}] }); });
  return _stEl("div",{className:"stage2-tl"},
    _stEl("div",{className:"stage2-versions-head"},
      _stEl("div",{className:"stage2-versions-title"}, Icon.grid&&_stEl(Icon.grid,{s:14}), "Timeline",
        _stEl("span",{className:"stage2-versions-sub"},"the film, assembled from each clip's current take")),
      _stEl("span",{className:"stage2-versions-count"},
        renderedN+" / "+ordered.length+" clips rendered · "+_fmtSecs(doneSec)+" of ~"+_fmtSecs(totalSec)),
      _stEl("button",{className:"stage2-vtool",style:{width:"auto"},disabled:!renderedN,
        title:renderedN?"Play every rendered clip in story order":"Render clips in the Shoot tab first",
        onClick:playFilm}, playAll?"Playing…":"▶ Play film")),
    _stEl("div",{className:"stage2-tl-player"},
      curUrl
        ? _stEl("video",{key:curUrl,ref:videoRef,src:curUrl,controls:true,playsInline:true,onEnded,
            title:"Double-click for full screen",onDoubleClick:(e)=>_stageVideoFullscreen(e.currentTarget),
            poster:cur?clipPrimaryFrame(cur, imgs, visualSource)||undefined:undefined})
        : _stEl("div",{className:"stage2-tl-empty"},
            _stEl("div",null,(cur?cur.label+" isn't rendered yet.":"No clips yet.")),
            cur && _stEl("button",{className:"stage2-vtool",style:{width:"auto"},onClick:()=>onOpenStage&&onOpenStage(cur.id)},"Render it in Shoot"))),
    _stEl("div",{className:"stage2-tl-strip"},
      groups.map(g=>_stEl("div",{key:g.scene.id,className:"stage2-tl-scene"},
        _stEl("div",{className:"stage2-tl-scene-lab"},_pad2(g.scene.no)+" · "+(g.scene.title||g.scene.loc||"Scene")),
        _stEl("div",{className:"stage2-tl-clips"},
          g.items.map(({c,i})=>{
            const has = !!vids[c.id];
            const thumb = clipPrimaryFrame(c, imgs, visualSource);
            return _stEl("button",{key:c.id,type:"button",
              className:"stage2-tl-clip"+(i===idx?" on":"")+(has?"":" missing"),
              title:c.label+(has?" — click to play":" — not rendered yet (double-click to open in the Stage)"),
              onClick:()=>jump(i,false), onDoubleClick:()=>onOpenStage&&onOpenStage(c.id)},
              thumb ? _stEl("img",{src:thumb,alt:""}) : _stEl("span",{className:"stage2-tl-clip-blank"}),
              _stEl("span",{className:"stage2-tl-clip-lab"}, c.label+" · "+_fmtSecs(Number(c.data&&c.data.dur)||0)),
              _stEl("span",{className:"stage2-tl-dot"+(has?" ok":"")})); }))))));
}

/* ---- AUDIO tab — the POST-MIX preview. Generation audio is a scratch track; this is
   where the real sound happens: the pristine ElevenLabs lines auto-placed over the
   picture (same CLIP_AIR walk the prompts used), the clip's native mix duckable under
   them, and imported ambience/music beds per scene. Session-preview for now — export
   lands with the post engine. ---- */
function StageAudioView({ allClips, vids, auds, selId, onSelectClip }){
  const scenes = []; (allClips||[]).forEach(c=>{ if(!scenes.some(s=>s.id===c.scene.id)) scenes.push(c.scene); });
  const selScene = (allClips.find(c=>c.id===selId)||allClips[0]||{}).scene;
  const [sceneId, setSceneId] = React.useState(selScene ? selScene.id : (scenes[0]&&scenes[0].id));
  const sceneClips = (allClips||[]).filter(c=>c.scene.id===sceneId);
  const [gain, setGain] = React.useState({ native:0.35, dialogue:1, amb:0.7, music:0.5 });
  const [mute, setMute] = React.useState({});
  const [beds, setBeds] = React.useState({});          // {amb:{url,name}, music:{url,name}}
  const [clipIdx, setClipIdx] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const videoRef = React.useRef(null);
  const bedRefs = { amb:React.useRef(null), music:React.useRef(null) };
  const live = React.useRef({ timers:[], audios:[] });
  const g = (k)=> mute[k] ? 0 : gain[k];
  const stopLines = ()=>{ live.current.timers.forEach(clearTimeout); live.current.audios.forEach(a=>{ try{ a.pause(); }catch(e){} });
    live.current = { timers:[], audios:[] }; };
  const scheduleLines = (clip)=>{
    stopLines();
    clipLinePlacements(clip, auds).forEach(pl=>{ if(!pl.url) return;
      const t = setTimeout(()=>{ const a = new Audio(pl.url); a.volume = g("dialogue"); live.current.audios.push(a);
        a.play().catch(()=>{}); }, Math.round(pl.at*1000));
      live.current.timers.push(t); });
  };
  const playScene = ()=>{ if(!sceneClips.length) return;
    const first = sceneClips.findIndex(c=>vids[c.id]); if(first<0) return;
    setClipIdx(first); setPlaying(true);
    Object.keys(bedRefs).forEach(k=>{ const el=bedRefs[k].current; if(el && beds[k]){ el.volume=g(k); el.currentTime=0; el.play().catch(()=>{}); } });
    setTimeout(()=>{ const v=videoRef.current; if(v){ v.volume=g("native"); v.play().catch(()=>{}); scheduleLines(sceneClips[first]); } }, 80);
  };
  const stopAll = ()=>{ setPlaying(false); stopLines();
    try{ videoRef.current && videoRef.current.pause(); }catch(e){}
    Object.keys(bedRefs).forEach(k=>{ const el=bedRefs[k].current; if(el){ try{ el.pause(); }catch(e){} } }); };
  const onClipEnded = ()=>{ if(!playing) return;
    for(let i=clipIdx+1;i<sceneClips.length;i++){ if(vids[sceneClips[i].id]){ setClipIdx(i);
      setTimeout(()=>{ const v=videoRef.current; if(v){ v.volume=g("native"); v.play().catch(()=>{}); scheduleLines(sceneClips[i]); } }, 80);
      return; } }
    stopAll(); };
  React.useEffect(()=>()=>stopAll(), []);
  React.useEffect(()=>{ stopAll(); setClipIdx(0); }, [sceneId]);
  // live volume updates
  React.useEffect(()=>{ const v=videoRef.current; if(v) v.volume=g("native");
    Object.keys(bedRefs).forEach(k=>{ const el=bedRefs[k].current; if(el) el.volume=g(k); });
    live.current.audios.forEach(a=>{ a.volume=g("dialogue"); });
  }, [gain, mute]);
  const importBed = (k)=>(e)=>{ const f=e.target.files&&e.target.files[0]; if(!f) return;
    setBeds(b=>({ ...b, [k]:{ url:URL.createObjectURL(f), name:f.name } })); e.target.value=""; };
  const cur = sceneClips[clipIdx];
  const curUrl = cur ? (vids[cur.id]||"") : "";
  const lane = (key, label, extra)=>_stEl("div",{className:"stage2-au-lane"},
    _stEl("div",{className:"stage2-au-lane-h"},
      _stEl("b",null,label),
      _stEl("button",{type:"button",className:"stage2-au-mute"+(mute[key]?" on":""),title:mute[key]?"Unmute":"Mute",
        onClick:()=>setMute(m=>({ ...m, [key]:!m[key] }))}, mute[key]?"M":"🔊"),
      _stEl("input",{type:"range",min:0,max:1,step:0.05,value:gain[key],
        onChange:e=>setGain(x=>({ ...x, [key]:Number(e.target.value) }))})),
    extra);
  return _stEl("div",{className:"stage2-au"},
    _stEl("div",{className:"stage2-versions-head"},
      _stEl("div",{className:"stage2-versions-title"}, Icon.mic&&_stEl(Icon.mic,{s:14}), "Mix",
        _stEl("span",{className:"stage2-versions-sub"},"pristine voices over picture · beds under it · generation audio is the scratch track")),
      _stEl("select",{className:"stage2-au-scene",value:sceneId||"",onChange:e=>setSceneId(e.target.value)},
        scenes.map(s=>_stEl("option",{key:s.id,value:s.id},_pad2(s.no)+" · "+(s.title||s.loc||"Scene")))),
      _stEl("button",{className:"stage2-vtool",style:{width:"auto"},
        onClick:playing?stopAll:playScene,
        disabled:!sceneClips.some(c=>vids[c.id]),
        title:sceneClips.some(c=>vids[c.id])?"Play the scene with the post mix":"Render this scene's clips first"},
        playing?"■ Stop":"▶ Play scene mix")),
    _stEl("div",{className:"stage2-au-player"},
      curUrl ? _stEl("video",{key:curUrl,ref:videoRef,src:curUrl,controls:true,playsInline:true,onEnded:onClipEnded,
          title:"Double-click for full screen",onDoubleClick:(e)=>_stageVideoFullscreen(e.currentTarget)})
        : _stEl("div",{className:"stage2-tl-empty"},"This scene has no rendered clips yet — render them in the Shoot tab.")),
    _stEl("div",{className:"stage2-au-lanes"},
      lane("native","Picture (native mix)",
        _stEl("div",{className:"stage2-au-blocks"}, sceneClips.map(c=>_stEl("span",{key:c.id,
          className:"stage2-au-block"+(vids[c.id]?"":" missing")+(cur&&cur.id===c.id?" on":""),
          title:c.label+(vids[c.id]?"":" — not rendered")}, c.label)))),
      lane("dialogue","Dialogue (pristine ElevenLabs)",
        _stEl("div",{className:"stage2-au-blocks"}, sceneClips.flatMap(c=>clipLinePlacements(c, auds).map(pl=>
          _stEl("span",{key:c.id+":"+pl.shotId,className:"stage2-au-block line"+(pl.url?"":" missing"),
            title:pl.speaker+" — \""+pl.text.slice(0,60)+"\" · lands ~"+pl.at+"s into "+c.label+(pl.url?"":" · not voiced yet")},
            pl.speaker+" · "+pl.sec+"s"))))),
      lane("amb","Ambience bed",
        _stEl("div",{className:"stage2-au-blocks"},
          beds.amb ? _stEl("span",{className:"stage2-au-block bed",title:beds.amb.name}, beds.amb.name.slice(0,34)) : _stEl("span",{className:"stage2-au-note"},"No bed yet — import a scene-long ambience file"),
          _stEl("label",{className:"stage2-au-import"},"Import audio",
            _stEl("input",{type:"file",accept:"audio/*",style:{display:"none"},onChange:importBed("amb")})),
          _stEl("audio",{ref:bedRefs.amb,src:(beds.amb&&beds.amb.url)||undefined,loop:true}))),
      lane("music","Music bed",
        _stEl("div",{className:"stage2-au-blocks"},
          beds.music ? _stEl("span",{className:"stage2-au-block bed",title:beds.music.name}, beds.music.name.slice(0,34)) : _stEl("span",{className:"stage2-au-note"},"No bed yet — import a track"),
          _stEl("label",{className:"stage2-au-import"},"Import audio",
            _stEl("input",{type:"file",accept:"audio/*",style:{display:"none"},onChange:importBed("music")})),
          _stEl("audio",{ref:bedRefs.music,src:(beds.music&&beds.music.url)||undefined})))),
    _stEl("div",{className:"stage2-au-note foot"},
      "Preview mix — the picture plays each clip's current take with its native track at the Picture volume; your pristine line audio drops in exactly where the render placed it. Beds live for this session; bounced exports land with the post engine."));
}

/* a composer pill that opens a dropdown of options — the inline alternative to the
   Render-settings panel. The menu renders position:fixed so the controls row's
   horizontal scroll/overflow can't clip it. */
function StagePillMenu({ icon:Ic, label, title, heading, on, disabled, options, onPick }){
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  React.useEffect(()=>{
    if(!open) return;
    const close=(e)=>{
      if(btnRef.current && btnRef.current.contains(e.target)) return;
      if(menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const esc=(e)=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return ()=>{ document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  },[open]);
  const toggle=()=>{
    if(disabled || !(options&&options.length)) return;
    if(!open && btnRef.current){
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left:Math.round(Math.min(r.left, window.innerWidth-210)), top:Math.round(r.bottom+6) });
    }
    setOpen(o=>!o);
  };
  return _stEl(React.Fragment,null,
    _stEl("button",{ref:btnRef,type:"button",title,
      className:"stage2-gen-pill"+(on?" on":"")+(open?" open":""),
      "aria-haspopup":"menu","aria-expanded":open?"true":"false",
      onClick:toggle},
      Ic&&_stEl(Ic,{s:14}), _stEl("span",null,label)),
    open && pos && _stEl("div",{ref:menuRef,className:"stage2-pill-menu",role:"menu",style:{left:pos.left+"px",top:pos.top+"px"}},
      heading && _stEl("b",{className:"stage2-pill-menu-h"}, heading),
      options.map(o=>_stEl("button",{key:String(o.value),type:"button",role:"menuitemradio","aria-checked":o.selected?"true":"false",
        className:"stage2-pill-opt"+(o.selected?" on":""),
        disabled:!!o.disabled, title:o.note||undefined,
        onClick:()=>{ if(o.disabled) return; setOpen(false); onPick&&onPick(o.value); }},
        _stEl("div",{className:"stage2-pill-opt-main"},
          _stEl("span",null,o.label),
          o.tag&&_stEl("small",null,o.tag)),
        // metadata chips (resolution ceiling, duration range…) — spec at a glance
        (o.meta&&o.meta.length>0) && _stEl("div",{className:"stage2-pill-opt-meta"},
          o.meta.map((m,i)=>_stEl("span",{key:i},
            m.icon&&_stEl(m.icon,{s:10}), m.label))),
        // one-line description (e.g. bitrate trade-off)
        o.desc && _stEl("div",{className:"stage2-pill-opt-desc"}, o.desc)))));
}

/* ================================ the room shell =============================== */
const STAGE_ACT_TITLES = { 1:"Setup", 2:"Complication", 3:"Resolution" };
/* the beat name(s) a clip covers — prefer the stored screenplay text, then fall back to the beat map. */
function screenplayBeatTitle(scene, drafts, beatN, max){
  const fn = typeof window!=="undefined" && window.screenplayBeatExcerpt;
  if(!fn || !scene || !drafts || !drafts[scene.id]) return "";
  try{ return fn(drafts[scene.id], beatN, max||38); }catch(e){ return ""; }
}
function clipBeatName(clip, beatsMap, drafts){
  const rows = ((beatsMap||{})[clip.scene.id]||{}).rows || [];
  const shots = (clip.g.shots||[]);
  const ns = _uniq(shots.map(sh=>sh.beatN).filter(Boolean));
  const scriptNames = ns.map(n=>screenplayBeatTitle(clip.scene, drafts, n, 34)).filter(Boolean);
  if(scriptNames.length) return scriptNames[0] + (scriptNames.length>1 ? (" +"+(scriptNames.length-1)) : "");
  const shotNames = shots.map(sh=>_firstWords(sh.action||sh.dialogue||"", 5)).filter(Boolean);
  if(shotNames.length) return shotNames[0] + (shotNames.length>1 ? (" +"+(shotNames.length-1)) : "");
  const names = ns.map(n=>{ const r=rows.find(x=>x.n===n); return r && r.drive && r.drive.a; }).filter(Boolean);
  if(!names.length) return _firstWords(clip.data.first.action||clip.scene.title, 3);
  return names[0] + (names.length>1 ? (" +"+(names.length-1)) : "");
}
function chargeColor(s){ const c=Number(s&&s.closeCharge)||0; return c>0?"var(--pos)":c<0?"var(--neg)":"var(--txt-3)"; }
function clipVoiceState(clip, auds){
  const lines = ((clip&&clip.data&&clip.data.lineShots)||[]).filter(sh=>String(sh.dialogue||"").trim());
  if(!lines.length) return { key:"silent", label:"silent" };
  const ready = lines.filter(sh=>_shotAudioReady(sh, auds)).length;
  if(ready===lines.length) return { key:"ready", label:"voice ✓" };
  if(ready>0) return { key:"partial", label:ready+"/"+lines.length+" voice" };
  return { key:"missing", label:"needs voice" };
}
function clipFrameState(clip, imgs, visualSource){
  if(visualSource==="halves"){
    const story = storyboardClipAssets(clip, imgs);
    if((story.halves||[]).length || story.top || story.bottom) return { key:"ready", label:"halves ✓" };
    if(story.sheet) return { key:"partial", label:"sheet ✓" };
    return { key:"missing", label:"needs halves" };
  }
  const id = clip && clip.data && clip.data.first && clip.data.first.id;
  return id && imgs && imgs[id] ? { key:"ready", label:"frame ✓" } : { key:"missing", label:"needs frame" };
}
function clipVideoReady(clip, vids){ return !!(clip && ((vids&&vids[clip.id]) || (typeof vidGetVideo==="function" && vidGetVideo(clip.id)))); }
function stageBeatVidId(sh){ return sh && sh.id ? ("beat-"+sh.id) : ""; }
function stageShotRuntime(sh){
  const ms = sh && sh.lineAudio && sh.lineAudio.durationMs;
  if(ms) return Math.max(1, Math.round((Number(ms)/1000)*10)/10);
  if(typeof shotDur==="function") return Math.max(1, Number(shotDur(sh))||5);
  return Math.max(1, Number(sh&&sh.dur)||5);
}

function sceneStoryboardItems(scene, sceneShots, imgs, visualSource){
  const out = [];
  const total = Math.max(1, Math.ceil(((sceneShots||[]).length||1) / 4));
  for(let i=0;i<total;i++){
    const sheetId = "sbsheet-sbpage-"+scene.id+"-2x2-"+i;
    const sheet = imgs[sheetId] || "";
    const topId = sheetId+":half-top", bottomId = sheetId+":half-bottom";
    const top = imgs[topId] || "", bottom = imgs[bottomId] || "";
    if(visualSource==="halves" && (top || bottom)){
      out.push({ id:topId, kind:"half", half:"top", page:i+1, label:"Page "+(i+1)+" · top half", url:top, missing:!top });
      out.push({ id:bottomId, kind:"half", half:"bottom", page:i+1, label:"Page "+(i+1)+" · bottom half", url:bottom, missing:!bottom });
    } else {
      out.push({ id:sheetId, kind:"sheet", page:i+1, label:"Page "+(i+1)+" · full sheet", url:sheet, missing:!sheet,
        note:visualSource==="halves" ? "No saved halves yet" : "" });
    }
  }
  return out;
}

function StageSceneSheets({ scene, sceneShots, clips, imgs, visualSource, aspect, onOpenClip }){
  const items = sceneStoryboardItems(scene, sceneShots, imgs, visualSource);
  const clipForItem = (it)=>{
    const start = (it.page-1)*4 + (it.kind==="half" && it.half==="bottom" ? 2 : 0);
    return (clips||[]).find(c=>{
      const a = Number(c&&c.g&&c.g.start)||0;
      const b = a + (((c&&c.g&&c.g.shots)||[]).length||1) - 1;
      return b>=start && a<=start+(it.kind==="half"?1:3);
    }) || (clips||[])[0] || null;
  };
  const cards = items.map(it=>{
    const c = clipForItem(it);
    const canOpen = !!(c && onOpenClip);
    return _stEl("button",{key:it.id,type:"button",className:"stage2-sheet-card "+it.kind+(it.missing?" missing":""),
      disabled:!canOpen, onClick:()=>canOpen&&onOpenClip(c.id),
      title:canOpen ? ("Open "+c.label+" from "+it.label) : it.label},
      _stEl("div",{className:"stage2-sheet-thumb",style:it.kind==="half"?{"--stage-aspect":"3 / 1"}:_stageAspectCss(aspect)},
        it.url ? _stEl("img",{src:it.url,alt:"",loading:"lazy"})
          : _stEl("div",{className:"stage2-sheet-missing"}, Icon.image&&_stEl(Icon.image,{s:20}), it.note||"Not saved yet")),
      _stEl("div",{className:"stage2-sheet-meta"},
        _stEl("span",{className:"stage2-sheet-label"}, it.label),
        c && _stEl("span",{className:"stage2-sheet-clip"}, c.label)));
  });
  return _stEl("div",{className:"stage2-sheets"},
    _stEl("div",{className:"stage2-sheets-head"},
      _stEl("div",null,
        _stEl("div",{className:"stage2-board-scene-k"},"SCENE "+_pad2(scene.no)),
        _stEl("div",{className:"stage2-sheets-title"}, scene.title||scene.loc)),
      _stEl("div",{className:"stage2-board-progress"},
        items.filter(x=>!x.missing).length+" / "+items.length+" "+(visualSource==="halves"?"halves":"sheets"))),
    _stEl("div",{className:"stage2-sheets-grid"}, cards));
}

function StageBoard({ scenesWithShots, allClips, imgs, auds, vids, beatsMap, drafts, visualSource, selectedId, onSelect, aspect }){
  return _stEl("div",{className:"stage2-board-scroll"},
    scenesWithShots.map(scene=>{
      const cs = allClips.filter(c=>c.scene.id===scene.id);
      const done = cs.filter(c=>clipVideoReady(c, vids)).length;
      return _stEl("section",{key:scene.id,className:"stage2-board-scene"},
        _stEl("div",{className:"stage2-board-scene-head"},
          _stEl("div",null,
            _stEl("div",{className:"stage2-board-scene-k"},"SCENE "+_pad2(scene.no)),
            _stEl("div",{className:"stage2-board-scene-t"}, scene.title||scene.loc)),
          _stEl("div",{className:"stage2-board-progress"}, done+" / "+cs.length+" clips")),
        _stEl("div",{className:"stage2-board-grid"},
          cs.map(c=>{
            const frame = clipPrimaryFrame(c, imgs, visualSource);
            const voice = clipVoiceState(c, auds);
            const frameState = clipFrameState(c, imgs, visualSource);
            const rendered = clipVideoReady(c, vids);
            return _stEl("button",{key:c.id,className:"stage2-card"+(c.id===selectedId?" on":"")+(rendered?" done":""),
              onClick:()=>onSelect(c.id),title:"Open "+c.label+" — "+clipBeatName(c, beatsMap, drafts)},
              _stEl("div",{className:"stage2-card-thumb",style:_stageAspectCss(aspect)},
                frame ? _stEl("img",{src:frame,alt:"",loading:"lazy"}) : _stEl("div",{className:"stage2-card-blank"}, Icon.image&&_stEl(Icon.image,{s:18}),"No frame"),
                rendered && _stEl("span",{className:"stage2-card-play"}, Icon.play&&_stEl(Icon.play,{s:12}))),
              _stEl("div",{className:"stage2-card-body"},
                _stEl("div",{className:"stage2-card-top"},
                  _stEl("span",{className:"stage2-card-lab"}, c.label),
                  _stEl("span",{className:"stage2-card-dur"}, _fmtSecs(c.data.dur))),
                _stEl("div",{className:"stage2-card-beat"}, clipBeatName(c, beatsMap, drafts)),
                _stEl("div",{className:"stage2-card-chips"},
                  _stEl("span",{className:"stage2-status "+frameState.key}, frameState.label),
                  _stEl("span",{className:"stage2-status "+voice.key}, voice.label),
                  _stEl("span",{className:"stage2-status "+(rendered?"ready":"missing")}, rendered?"video ✓":"pending"))));
          })));
    }));
}

function StageView({ project, scenes, shots, characters, locations, props, beatsMap, drafts, creditBalance, onVoiceAll, voicingLines, onCancelVoiceAll, onVoiceLine, onUpdateShot, onStageNav }){
  const [visualSource, _setVisualSource] = React.useState(_stageSavedSource);
  const setVisualSource = React.useCallback((v)=>{
    const next = v==="halves" ? "halves" : "shots";
    _setVisualSource(next);
    try{ localStorage.setItem("turn_stage_visual_source", next); }catch(e){}
  },[]);
  const ordered = React.useMemo(()=> scenesInStoryOrder(scenes), [scenes]);
  const charById = React.useMemo(()=>{ const m={}; (characters||[]).forEach(c=>{ m[c.id]=c; }); return m; }, [characters]);
  const propById = React.useMemo(()=>{ const m={}; (props||[]).forEach(p=>{ m[p.id]=p; }); return m; }, [props]);
  const shotsByScene = React.useMemo(()=>{ const m={}; (shots||[]).forEach(s=>{ (m[s.sceneId]=m[s.sceneId]||[]).push(s); });
    Object.values(m).forEach(arr=>arr.sort((a,b)=>(a.order||0)-(b.order||0)||(a.beatN||0)-(b.beatN||0))); return m; }, [shots]);
  const scenesWithShots = ordered.filter(s=>(shotsByScene[s.id]||[]).length);
  const clipMax = (typeof clipMaxFor==="function") ? clipMaxFor(project) : (window.CLIP_MAX_SECONDS||15);
  // the MODEL choice lives here (not in the per-clip console) because it drives the
  // clip PACKER: Seedance 2.0 caps clips at 3 shots so per-shot frames + identity refs
  // fit its 9-image budget; a whole-scene model (2.5) lifts the cap. Persisted.
  const [modelId, _setModelId] = React.useState(()=>{
    try{ const v = localStorage.getItem("turn_stage_model");
      return (SEEDANCE_MODELS.find(m=>m.id===v && m.status==="active") || SEEDANCE_MODELS.find(m=>m.status==="active") || SEEDANCE_MODELS[0]).id;
    }catch(e){ return SEEDANCE_MODELS[0].id; }
  });
  const setModelId = React.useCallback((id)=>{ _setModelId(id); try{ localStorage.setItem("turn_stage_model", id); }catch(e){} },[]);
  const stageModel = seedanceModelOf(modelId);
  // CLIP PACKING mode: "auto" = the model's per-clip budget (beat-by-beat clips);
  // "scene" = ONE clip per scene, ignoring budgets and manual splits — the way to
  // shoot once whole-scene models (Seedance 2.5, 30s) land; usable today accepting
  // that the render clamps to the current model's duration ceiling. Persisted.
  const [packMode, _setPackMode] = React.useState(()=>{
    try{ return localStorage.getItem("turn_stage_pack")==="scene" ? "scene" : "auto"; }catch(e){ return "auto"; }
  });
  const setPackMode = React.useCallback((v)=>{ _setPackMode(v==="scene"?"scene":"auto");
    try{ localStorage.setItem("turn_stage_pack", v==="scene"?"scene":"auto"); }catch(e){} },[]);
  // in-room view: the director console ("stage") or the take browser ("versions");
  // pendingReuse carries a Versions-tab "Reuse/Branch" pick back into the composer
  const [stageView, setStageView] = React.useState("stage");
  const [pendingReuse, setPendingReuse] = React.useState(null);
  const clipsByScene = React.useMemo(()=>{ const m={};
    // the packing budget follows the MODEL's ceiling upward — a 30s model (Seedance
    // 2.5) packs whole beats into 30s clips even when the format's budget is 15s
    const packMax = Math.max(clipMax, stageModel.maxClipSec||15);
    const packOpts = packMode==="scene"
      ? { wholeScene:true }
      : { maxShots: stageModel.maxShotsPerClip!=null ? stageModel.maxShotsPerClip : (window.CLIP_MAX_SHOTS||3),
          maxDialogue: stageModel.maxDialoguePerClip!=null ? stageModel.maxDialoguePerClip : (window.CLIP_MAX_DIALOGUE||3) };
    scenesWithShots.forEach(s=>{ m[s.id]=(typeof sceneSequences==="function")?sceneSequences(shotsByScene[s.id]||[], packMax, packOpts):[]; });
    return m; }, [scenesWithShots, shotsByScene, clipMax, modelId, packMode]);

  // ctx.scenes = the story-ORDERED list — shotPropSheetId/custodyOwnerAt resolve by story
  // position, so the raw array would mis-resolve active states/holders out of order
  const ctx = { characters, charById, props, propById, locations, project, beatsMap, drafts, scenes:ordered };
  const aspect = _stageAspect(project);
  const charSig = JSON.stringify((characters||[]).map(c=>[c.id,c.name]));
  // CONTENT-based signatures — a state/custody/coverage edit that keeps the same counts
  // (re-pinned scene, renamed holder, new trigger words) must still bust the clip memo
  const propSig = JSON.stringify((props||[]).map(p=>[p.id,p.name,
    (p.states||[]).map(st=>[st.id,st.sceneId,st.label]).join("|"),
    (p.custody||[]).map(cu=>[cu.charId,cu.charName,cu.fromSceneId]).join("|"),
    p.ownerId||p.ownerName||""]));
  const locSig = JSON.stringify((locations||[]).map(l=>[l.id,l.name,(l.scenes||[]).join("|"),
    (l.coverageSheets||[]).map(v=>[v.id,v.role,v.name,(v.triggerWords||[]).join("~")]).join("|")]));
  const draftSig = JSON.stringify(Object.entries(drafts||{}).map(([id,d])=>[id,(d&&d.version)||"",((d&&d.blocks)||[]).map(b=>[b.beat,b.type,b.text]).join("|")]));
  const beatsSig = JSON.stringify(Object.entries(beatsMap||{}).map(([id,b])=>[id,((b&&b.rows)||[]).map(r=>[r.n,r&&r.drive&&r.drive.d,r&&r.react&&r.react.d]).join("|")]));

  // flatten clips with labels + derived data
  const allClips = React.useMemo(()=>{ const out=[];
    scenesWithShots.forEach(scene=>{ (clipsByScene[scene.id]||[]).forEach(g=>{
      // CONTENT-STABLE id (hash of member shots) so takes survive repacking; the old
      // positional id rides along as legacyId for the one-time take migration
      out.push({ id:(typeof clipStableId==="function")?clipStableId(scene.id, g.shots):("clip-"+scene.id+"-"+g.index),
        legacyId:(typeof clipVidId==="function")?clipVidId(scene.id,g.index):("clip-"+scene.id+"-"+g.index),
        label:_pad2(scene.no)+_clipLetter(g.index), scene, g, data:buildClipData(scene, g, ctx) }); }); });
    return out; }, [scenesWithShots, clipsByScene, charSig, propSig, locSig, draftSig, beatsSig, project]);
  // migrate any takes still stored under the OLD positional ids (fire-and-forget; the
  // vid-done event each migration dispatches makes mounted consoles re-read)
  React.useEffect(()=>{
    if(typeof window.vidAdoptTakes!=="function") return;
    allClips.forEach(c=>{ if(c.legacyId && c.legacyId!==c.id) window.vidAdoptTakes(c.id, c.legacyId); });
  }, [allClips.map(c=>c.id).join("|")]);

  // load every needed image (shot frames + storyboard clip sheets/halves + character / location / prop sheets) into one map
  const shotIdsKey = (shots||[]).map(s=>s.id).join(",");
  const charIdsKey = (characters||[]).map(c=>c.id).join(",");
  const locIdsKey = (locations||[]).map(l=>l.id).join(",");
  const propIdsKey = (props||[]).map(p=>p.id).join(",");
  const neededIds = React.useMemo(()=>{ const s=new Set();
    (shots||[]).forEach(sh=>s.add(sh.id)); (characters||[]).forEach(c=>s.add(c.id));
    (locations||[]).forEach(l=>s.add(l.id)); (props||[]).forEach(p=>s.add(p.id));
    scenesWithShots.forEach(scene=>{
      const total = Math.max(1, Math.ceil((((shotsByScene||{})[scene.id]||[]).length||1) / 4));
      for(let i=0;i<total;i++){
        const sheetId = "sbsheet-sbpage-"+scene.id+"-2x2-"+i;
        s.add(sheetId); s.add(sheetId+":half-top"); s.add(sheetId+":half-bottom");
      }
    });
    allClips.forEach(c=>{ const ids=storyboardClipIds(c); (ids.all||[]).forEach(id=>s.add(id)); });
    // the clip-derived VARIANT ids too — a prop's active state sheet and the scene's
    // coverage sheet aren't in the base id lists above, so they'd never be fetched
    allClips.forEach(c=>{ const dd=c.data||{}; (dd.props||[]).forEach(p=>s.add(p.sheetId||p.id)); if(dd.locSheet&&dd.locSheet.id) s.add(dd.locSheet.id); });
    return Array.from(s); }, [shotIdsKey, charIdsKey, locIdsKey, propIdsKey, allClips.map(c=>c.id).join(","), scenesWithShots.map(s=>s.id).join(","),
      JSON.stringify(allClips.map(c=>[(((c.data||{}).props)||[]).map(p=>p.sheetId||p.id).join("|"), (((c.data||{}).locSheet)||{}).id||""]))]);
  const [imgs, setImgs] = React.useState({});
  const [imgTick, setImgTick] = React.useState(0);
  React.useEffect(()=>{ const h=()=>setImgTick(x=>x+1); window.addEventListener("nb-gen-done", h); window.addEventListener("nb-prefetched", h); return ()=>{ window.removeEventListener("nb-gen-done", h); window.removeEventListener("nb-prefetched", h); }; }, []);
  React.useEffect(()=>{ let alive=true;
    const ids = Array.from(new Set(neededIds||[]));
    const sync = {}, missing = [];
    ids.forEach(id=>{ const u=(typeof nbGetImage==="function")?nbGetImage(id):""; if(u) sync[id]=u; else missing.push(id); });
    setImgs(sync);
    if(typeof nbLoadImage!=="function" || !missing.length){ return ()=>{ alive=false; }; }
    (async()=>{
      const limit = 8;
      let idx = 0;
      const worker = async()=>{
        while(alive && idx<missing.length){
          const id = missing[idx++];
          try{
            const u = await nbLoadImage(id);
            if(alive && u) setImgs(prev=> prev[id] ? prev : ({...prev, [id]:u}));
          }catch(e){}
        }
      };
      await Promise.all(Array.from({length:Math.min(limit, missing.length)}, worker));
    })();
    return ()=>{ alive=false; }; }, [neededIds.join(","), imgTick]);

  // load voiced line audio for shots that have it
  const [auds, setAuds] = React.useState({});
  const [audTick, setAudTick] = React.useState(0);
  React.useEffect(()=>{ const h=()=>setAudTick(x=>x+1); window.addEventListener("vg-audio-done", h); return ()=>window.removeEventListener("vg-audio-done", h); }, []);
  React.useEffect(()=>{ let alive=true;
    (async()=>{ const out={};
      for(const sh of (shots||[])){ if(!String(sh.dialogue||"").trim()) continue;
        let u=(typeof vgGetAudio==="function")?vgGetAudio(sh.id):"";
        if(!u && typeof vgLoadAudio==="function"){ try{ u=await vgLoadAudio(sh.id); }catch(e){} } if(u) out[sh.id]=u; }
      if(alive) setAuds(out); })();
    return ()=>{ alive=false; }; }, [(shots||[]).map(s=>s.id+":"+(s.lineAudio?1:0)).join(","), audTick]);

  const videoIds = React.useMemo(()=>Array.from(new Set([].concat(allClips.map(c=>c.id), (shots||[]).map(stageBeatVidId).filter(Boolean)))), [allClips.map(c=>c.id).join(","), shotIdsKey]);
  const clipIdsKey = videoIds.join(",");
  const [vids, setVids] = React.useState({});
  const [vidTick, setVidTick] = React.useState(0);
  React.useEffect(()=>{ const h=()=>setVidTick(x=>x+1); window.addEventListener("vid-done", h); return ()=>window.removeEventListener("vid-done", h); }, []);
  React.useEffect(()=>{ let alive=true;
    (async()=>{ const out={};
      for(const id of videoIds){ let u=(typeof vidGetVideo==="function")?vidGetVideo(id):"";
        if(!u && typeof vidLoadVideo==="function"){ try{ u=await vidLoadVideo(id); }catch(e){} } if(u) out[id]=u; }
      if(alive) setVids(out); })();
    return ()=>{ alive=false; }; }, [clipIdsKey, vidTick]);

  // CLIP is the unit of selection/generation (a clip can bundle 2+ merged shots —
  // see the Art Room Shots "merge" + Storyboards "Compose from shot frames" /
  // sheet-half workflows). selId is the primary selection; selShotId just tracks
  // which of the clip's own shots is previewed in its filmstrip-of-one context.
  const [selId, setSelId] = React.useState(allClips[0] ? allClips[0].id : null);
  const [selShotId, setSelShotId] = React.useState((shots||[])[0] ? (shots||[])[0].id : null);
  // REPACK-AWARE selection: clip ids hash their member shots, so editing a shot's
  // seconds re-packs the scene and the selected id can simply vanish. Falling back
  // to allClips[0] yanked the director to the first clip mid-edit — instead follow
  // the shots: re-select the clip that inherited the most of the old clip's members.
  const selMembersRef = React.useRef(null);
  React.useEffect(()=>{
    const cur = allClips.find(c=>c.id===selId);
    if(cur){ selMembersRef.current = (cur.g.shots||[]).map(s=>s.id); return; }
    const prev = selMembersRef.current || [];
    let best=null, bestN=0;
    allClips.forEach(c=>{ const n=(c.g.shots||[]).filter(s=>prev.indexOf(s.id)>=0).length; if(n>bestN){ best=c; bestN=n; } });
    const next = best || allClips[0] || null;
    selMembersRef.current = next ? (next.g.shots||[]).map(s=>s.id) : null;
    setSelId(next ? next.id : null);
  }, [allClips.map(c=>c.id).join(","), selId]);

  if(!scenesWithShots.length){
    return _stEl("div",{className:"stage2-root"},
      _stEl("div",{className:"prop-empty"},
        _stEl("div",{className:"art-soon-ic"}, Icon.clapper&&_stEl(Icon.clapper,{s:30})),
        _stEl("div",{className:"art-soon-t"},"Nothing to stage yet"),
        _stEl("div",{className:"art-soon-d"},"The Stage turns your shots into video clips. Break your scenes into shots in the Art Room → Shots first, then come back.")));
  }

  // the director console — one clip at a time
  const clip = allClips.find(c=>c.id===selId) || allClips[0];
  const selectedScene = clip.scene;
  const selectedSceneClips = allClips.filter(c=>c.scene.id===selectedScene.id);
  const selectedShot = (clip.g.shots||[]).find(sh=>sh.id===selShotId) || (clip.g.shots||[])[0] || clip.data.first;
  const clipIdx = allClips.findIndex(c=>c.id===clip.id);
  const prevBeatVideoId = clipIdx>0 ? allClips[clipIdx-1].id : null;
  const onSelectClip = (clipId)=>{
    const c = allClips.find(x=>x.id===clipId);
    setSelId(clipId);
    setSelShotId(c && (c.g.shots||[])[0] ? c.g.shots[0].id : null);
  };
  const sceneRow = (scene)=>{
    const sceneClips = allClips.filter(c=>c.scene.id===scene.id);
    const sceneShots = shotsByScene[scene.id]||[];
    const sceneDur = sceneShots.reduce((t,sh)=>t+stageShotRuntime(sh),0);
    const done = sceneClips.filter(c=>clipVideoReady(c, vids)).length;
    return _stEl("div",{key:scene.id,className:"stage2-scene-block"},
      _stEl("button",{type:"button",className:"stage2-scene-headrow"+(selectedScene.id===scene.id?" on":""),
          onClick:()=>{ if(sceneClips[0]) onSelectClip(sceneClips[0].id); },
          title:"Select Scene "+_pad2(scene.no)},
        _stEl("span",{className:"tree-scene-no"}, _pad2(scene.no)),
        _stEl("span",{className:"tree-scene-dot",style:{background:done===sceneClips.length&&sceneClips.length?"var(--pos)":chargeColor(scene)}}),
        _stEl("span",{className:"stage2-scene-ttl"}, scene.title||scene.loc),
        _stEl("span",{className:"stage2-scene-meta"}, _fmtSecs(sceneDur))),
      // one chip per CLIP — and the Multi-shot composer edits ONE beat at a time, so
      // each chip also names its beat: label + beat name + visual-source glyph
      // (▢ frame · ▢▢ per-shot frames · ▤ 2-panel half · ▦ 4-panel sheet) +
      // readiness/render state. Clicking a chip points the console at that beat.
      _stEl("div",{className:"stage2-clip-chips"},
        sceneClips.map(c=>{
          const p = stageClipSourcePlan(c, imgs);
          const rendered = clipVideoReady(c, vids);
          const shotCount = (c.data.shots||[]).length;
          const beatNm = clipBeatName(c, beatsMap, drafts);
          return _stEl("button",{key:c.id,type:"button",
            className:"stage2-clip-chip"+(c.id===clip.id?" on":"")+(rendered?" done":"")+(p.ready?"":" missing"),
            title:c.label+(beatNm?" · "+beatNm:"")+" · "+shotCount+" shot"+(shotCount!==1?"s":"")+" · renders from "+p.label
              +(p.ready?"":" — source missing, generate it first")+(rendered?" · rendered ✓":""),
            onClick:()=>onSelectClip(c.id)},
            _stEl("b",null,c.label),
            beatNm && _stEl("span",{className:"stage2-clip-chip-name"},beatNm),
            _stEl("span",{className:"stage2-clip-chip-glyph"},p.glyph),
            _stEl("span",{className:"stage2-clip-chip-st"}, rendered?"✓":(p.ready?"":"!")));
        })));
  };
  // the Scenes rail collapses to the same vertical strip the Writers' Room panels use
  const [railOpen, _setRailOpen] = React.useState(()=>{ try{ return localStorage.getItem("turn_stage_rail_open")!=="0"; }catch(e){ return true; } });
  const setRailOpen = (v)=>{ _setRailOpen(v); try{ localStorage.setItem("turn_stage_rail_open", v?"1":"0"); }catch(e){} };
  const rail = _stEl("div",{className:"stage2-rail"},
    _stEl("div",{className:"stage2-rail-head"},
      Icon.layers&&_stEl(Icon.layers,{s:12}), _stEl("span",null,"Scenes"),
      _stEl("button",{className:"panel-collapse",onClick:()=>setRailOpen(false),title:"Collapse scenes"},
        Icon.chevL&&_stEl(Icon.chevL,{s:14}))),
    _stEl("div",{className:"stage2-scene-list"}, scenesWithShots.map(sceneRow)));
  const railStrip = (typeof CollapsedStrip!=="undefined")
    ? _stEl(CollapsedStrip,{ side:"left", label:"Scenes", icon:Icon.panelLeft||Icon.layers, onExpand:()=>setRailOpen(true) })
    : _stEl("button",{className:"strip left",onClick:()=>setRailOpen(true),title:"Expand scenes"},
        _stEl("div",{className:"strip-label"},"Scenes"));
    // the Stage's IN-ROOM views, named for what HAPPENS inside and ordered as the
    // production workflow: SHOOT the clips → assemble the TIMELINE → MIX the sound.
    // Takes switched inline in the Shoot console (version dropdown) — no separate tab.
    // ("Stage" as a tab name clashed with the room itself.) Internal view ids stay
    // stable — only the labels are film-language.
    const stageTabs = [
      ["Shoot","stage",Icon.clapper||Icon.sparkles,"Render the clips — the director console"],
      ["Timeline","timeline",Icon.grid,"The film assembled from each clip's current take"],
      ["Mix","audio",Icon.mic,"Post-mix preview — pristine voices over picture, beds under"],
    ];
    const stageHead = _stEl("div",{className:"viewnav","aria-label":"Views"},
      _stEl("div",{className:"vn-side vn-left"}),
      _stEl("div",{className:"vn-center"},
        _stEl("div",{className:"segmented"},
          stageTabs.map(([label,id,Ic,tip])=>{
            const on = stageView===id;
            return _stEl("button",{key:id,type:"button",className:"seg"+(on?" on":""),
              onClick:()=>setStageView(id),
              title: on ? "Current workspace" : tip},
              Ic&&_stEl(Ic,{s:14}),_stEl("span",{className:"seg-lab"},label)); }))),
      _stEl("div",{className:"vn-side vn-right"}));
    // the view tabs span the FULL app width above the rail+console split — the same
    // TopBar → ViewNav → body stack every other room has.
    return _stEl("div",{className:"stage2-root",style:_stageAspectCss(aspect)},
      stageHead,
      _stEl("div",{className:"stage2-body"}, railOpen ? rail : railStrip,
        _stEl("div",{className:"stage2-main"},
          stageView==="versions"
            ? _stEl(StageVersionsView,{ key:"vers-"+clip.id, clip, stageModel,
                onBack:()=>setStageView("stage"),
                onReuse:(meta,pin)=>{ setPendingReuse({ clipId:clip.id, meta, pin }); setStageView("stage"); } })
            : stageView==="timeline"
            ? _stEl(StageTimelineView,{ key:"tl", allClips, vids, imgs, visualSource, selId, onSelectClip,
                onOpenStage:(id)=>{ onSelectClip(id); setStageView("stage"); } })
            : stageView==="audio"
            ? _stEl(StageAudioView,{ key:"au", allClips, vids, auds, selId, onSelectClip })
            // keyed by SCENE, not clip.id — clip ids change on every repack (they
            // hash the member shots), and remounting the console wiped the recipe
            // tab + Multi-shot row state mid-edit; the console's own member-overlap
            // effect handles real clip moves within the scene.
            : _stEl(ClipConsole,{ key:"console-"+selectedScene.id, clip, selectedShot, sceneClips:selectedSceneClips, ctx, imgs, auds, beatsMap, drafts, prevClipVideoId:prevBeatVideoId, aspect, visualSource, setVisualSource, creditBalance, onVoiceLine, onUpdateShot, modelId, setModelId, packMode, setPackMode,
                onSelectClip, onOpenVersions:()=>setStageView("versions"),
                pendingReuse, onReuseConsumed:()=>setPendingReuse(null) }))));
  }
window.StageView = StageView;

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
function _stageClock(n){
  n = Math.max(0, Number(n)||0);
  const m = Math.floor(n/60);
  const s = Math.floor(n%60);
  return m+":"+_pad2(s);
}
function stageScenePlace(scene){
  const raw = String((scene&&scene.loc) || (scene&&scene.title) || "Scene").replace(/\s+/g," ").trim();
  if(!raw) return "Scene";
  const stripped = raw.replace(/^\s*\d+[A-Z]?\s+/i,"").trim();
  const parts = stripped.split(/\s+\u00b7\s+/).map(s=>s.trim()).filter(Boolean);
  const loc = parts.find(p=>/\b(?:INT|EXT|INT\/EXT|I\/E)\.?\b/i.test(p)) || parts[0] || stripped;
  return loc.replace(/^\s*\d+[A-Z]?\s+/i,"").trim() || stripped;
}
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
  if((low.includes("video") && low.includes("reference") && (low.includes("resolution") || low.includes("720") || low.includes("480"))) ||
     (low.includes("reference video") && low.includes("duration"))){
    return "Seedance refused one selected video reference. Reference videos must be short and draft-resolution (roughly 480p/720p, 2–15s). The Stage now skips unsafe previous-clip references automatically; reload and try the render again.";
  }
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
    .replace(/\bRETRY\b/g,"Retrying — declared the cast as AI-made")
    .replace(/\bRECONNECTING\b/g,"Connection blip — reconnecting to the render")
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
function stageBeatScriptBlocks(scene, drafts, beatN){
  const n = Number(beatN);
  const d = scene && drafts && drafts[scene.id];
  const blocks = (d && Array.isArray(d.blocks)) ? d.blocks : [];
  return blocks.filter(b=>b && b.type!=="scene" && Number(b.beat)===n);
}
function stageBeatDialogueLines(scene, drafts, beatN){
  const blocks = stageBeatScriptBlocks(scene, drafts, beatN);
  const out = [];
  let speaker = "", parenthetical = "";
  blocks.forEach(b=>{
    const t = String(b.text||"").replace(/\s+/g," ").trim();
    if(!t) return;
    if(b.type==="char"){ speaker = t.replace(/\(cont'?d\)/ig,"").trim(); parenthetical = ""; return; }
    if(b.type==="paren"){ parenthetical = t.replace(/^\(|\)$/g,"").trim(); return; }
    if(b.type==="dia"){
      out.push({ speaker:speaker||"the speaker", parenthetical, text:t });
      parenthetical = "";
      return;
    }
    parenthetical = "";
  });
  return out;
}
function stageShotDialogueLine(scene, drafts, sh, ctx){
  const lines = stageBeatDialogueLines(scene, drafts, sh&&sh.beatN);
  const fallbackText = String((sh&&sh.dialogue) || (sh&&sh.lineAudio&&sh.lineAudio.text) || "").trim().replace(/^["“]|["”]$/g,"");
  if(!lines.length) return fallbackText ? {
    speaker:(stageDialogueSpeaker(scene, drafts, (ctx&&ctx.beatsMap)||{}, sh, ctx)||{}).name || "the speaker",
    text:fallbackText
  } : null;
  if(!fallbackText) return null;
  if(lines.length===1) return { ...lines[0], char:stageCharNameMatch(lines[0].speaker, ctx&&ctx.characters) };
  const raw = _normStageText(fallbackText);
  let best = null, score = -1;
  lines.forEach(ln=>{
    const n = _normStageText(ln.text);
    let s = 0;
    if(raw && n && (n.indexOf(raw)>=0 || raw.indexOf(n)>=0)) s = 2;
    else if(raw && n){
      const rt = new Set(raw.split(/\s+/).filter(Boolean));
      const nt = new Set(n.split(/\s+/).filter(Boolean));
      let hit = 0; rt.forEach(w=>{ if(nt.has(w)) hit++; });
      s = hit / Math.max(1, Math.sqrt(rt.size*nt.size));
    }
    if(s>score){ score=s; best=ln; }
  });
  const pick = (best && score>=0.25) ? best : lines[0];
  return { ...pick, char:stageCharNameMatch(pick.speaker, ctx&&ctx.characters) };
}
function stageShotMicroPromptText(scene, drafts, beatsMap, sh, max){
  const micro = stageShotMicroTexts(sh);
  let text = micro.length ? micro.map((m,i)=>"Micro-beat "+(i+1)+": "+m.replace(/[\s.;]+$/,".")).join(" ") : "";
  if(!text) text = stageShotCanonLine(scene, drafts, beatsMap, sh, max||0);
  if(max && text.length>max) text = text.slice(0, Math.max(0, max-1)).replace(/\s+\S*$/,"")+"…";
  return text;
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
    if(a && b && a!==b && a.indexOf(b)<0 && b.indexOf(a)<0){
      // BUDGETED merge: canon + staging combine ONLY when both fit the cap whole.
      // Otherwise return just the canon and let stageShotCanonLine carry the staging
      // as its "Storyboard panel action" part — a mid-sentence "…" cut of the merge
      // is worse than either complete half (and broke canon-line dedupe downstream,
      // duplicating the staging text verbatim in derived prompts).
      const merged = microT+" "+own;
      base = (M>0 && merged.length>M) ? microT : merged;
    }
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
    // judge "does the storyboard line add information" on the text actually RETURNED.
    // stageShotScriptText never returns a truncated merge anymore (budgeted merge:
    // canon+staging combine only when both fit whole), so this containment check is
    // exact — when the budget forced canon-only, the staging line rides here instead.
    const a=_normStageText(script), b=_normStageText(sheet);
    if(a && b && a!==b && a.indexOf(b)<0 && b.indexOf(a)<0)
      return script+" Storyboard panel action: "+String(sheet||"").replace(/[\s.;…]+$/,"");
  }
  return script || sheet || "";
}
function stageSheetPanelMeta(g, i, scene){
  const abs = (Number(g&&g.start)||0) + i;
  const sceneShots = scene ? ((window.__sbShots||[]).filter(sh=>sh && sh.sceneId===scene.id)
    .sort((a,b)=>(a.order||0)-(b.order||0) || (a.beatN||0)-(b.beatN||0))) : null;
  const ranges = stagePageRanges(sceneShots);
  let page = Math.floor(abs/4)+1, cell = abs % 4;   // legacy fallback
  let acc = 0;
  for(let p=0;p<ranges.length;p++){
    if(abs>=acc && abs<acc+ranges[p].count){ page=p+1; cell=abs-acc; break; }
    acc += ranges[p].count;
  }
  return { abs, page, panel:cell+1, half:cell<2?"top":"bottom" };
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
  const cameraProfile = shots.map(sh=>sh&&sh.cameraSettings&&sh.cameraSettings.camera).find(v=>v&&v!=="auto") || "auto";
  const lighting = (preset && (preset.lighting||preset.grade)) || "Naturalistic, motivated light";
  const lead = cast[0] ? cast[0].name : "the subject";
  // composed director prompt (prose, multi-beat) — readable, not the image-gen JSON
  const panelLines = shots.map((sh,i)=>{
    const meta = stageSheetPanelMeta(g, i, scene);
    const exactLine = stageShotDialogueLine(scene, ctx.drafts, sh, ctx);
    const speaker = exactLine && exactLine.text
      ? (exactLine.char ? { id:exactLine.char.id, name:exactLine.char.name } : { id:"", name:exactLine.speaker||"the speaker" })
      : (String(sh&&sh.dialogue||"").trim() ? stageDialogueSpeaker(scene, ctx.drafts, ctx.beatsMap, sh, ctx) : null);
    const micro = stageShotMicroTexts(sh);
    const microText = stageShotMicroPromptText(scene, ctx.drafts, ctx.beatsMap, sh, 190);
    // the Shots tab's camera grammar, preserved PER SHOT — the clip-level "camera arc"
    // flattens these into one description; the shoot package and timeline recipes need
    // each setup intact (size · angle · move · lens + the composition note).
    const camSpec = (typeof shotSizeOf==="function")
      ? [shotSizeOf(sh.size).label, shotAngleOf(sh.angle).label, shotMoveOf(sh.move).label, shotLensOf(sh.lens).label].filter(Boolean).join(" · ")
      : "";
    return { shotId:sh.id, beatN:sh.beatN, sheetPage:meta.page, sheetPanel:meta.panel, half:meta.half,
      // sh.vidText = the user's per-shot VIDEO description override (Multi-shot
      // editor) — video-only, never touches the canon action the image side uses
      text: String(sh.vidText||"").trim() || microText || stageShotCanonLine(scene, ctx.drafts, ctx.beatsMap, sh, 190),
      script:stageShotScriptText(scene, ctx.drafts, sh, 190),
      sheet:stageShotSheetText(scene, ctx.beatsMap, sh, 190),
      speaker,
      camera:camSpec, composition:String((sh&&sh.composition)||"").trim(),
      dur:(typeof stageShotRuntime==="function") ? stageShotRuntime(sh) : 0,
      dialogue:exactLine && exactLine.text ? exactLine.text : String((sh&&sh.dialogue)||"").trim(),
      dialogueParenthetical:exactLine && exactLine.parenthetical ? exactLine.parenthetical : "",
      micro };
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
  const lineShots = panelLines.filter(p=>String(p.dialogue||"").trim()).map(p=>{
    const src = shots.find(sh=>sh && sh.id===p.shotId) || {};
    return { ...src, dialogue:p.dialogue, lineAudio:src.lineAudio };
  });
  const beatDialogues = {};
  _uniq(shots.map(sh=>sh&&sh.beatN).filter(Boolean)).forEach(n=>{ beatDialogues[n] = stageBeatDialogueLines(scene, ctx.drafts, n); });
  return { shots, first, cast, props:clipProps, loc, locSheet, preset, camera, cameraProfile, lighting, lead, prompt, chips, setting, panelLines, protect, beatDialogues,
    dur:_clipDur(g), lineShots };
}

/* beat-boundary page geometry for a scene — the SAME source of truth as the
   Storyboards tab (window.sbPageRanges); falls back to fixed 4-shot chunks when the
   geometry or the shot list isn't available. */
function stagePageRanges(sceneShots){
  if(typeof window.sbPageRanges==="function" && (sceneShots||[]).length){
    try{ return window.sbPageRanges(sceneShots); }catch(e){}
  }
  const n = (sceneShots||[]).length;
  const total = Math.max(1, Math.ceil((n||1)/4));
  const out=[]; for(let i=0;i<total;i++) out.push({ start:i*4, count:Math.min(4, Math.max(1,n-i*4)) });
  return out;
}

/* ============================ the per-clip console ============================== */
function storyboardClipIds(clip){
  const legacy = "sbsheet-sbclip-"+clip.scene.id+"-"+clip.g.index;
  const start = Number(clip && clip.g && clip.g.start) || 0;
  const count = Math.max(1, ((clip&&clip.g&&clip.g.shots)||[]).length);
  // Beat-boundary pagination (Storyboards tab): pages no longer map to fixed 4-shot
  // chunks, so the page/cell a shot lands in comes from the SAME geometry the tab used —
  // window.sbPageRanges over the scene's live shots (bridged onto window.__sbShots by
  // StageView). Falls back to the legacy fixed-4 math when the geometry isn't available.
  const sceneShots = ((window.__sbShots||[]).filter(s=>s && s.sceneId===clip.scene.id))
    .sort((a,b)=>(a.order||0)-(b.order||0) || (a.beatN||0)-(b.beatN||0));
  const ranges = stagePageRanges(sceneShots);
  const pages=[], halves=[];
  for(let n=start; n<start+count; n++){
    let pageNo = Math.floor(n/4), cell = n%4;   // legacy fallback
    if(ranges){ let acc=0;
      for(let i=0;i<ranges.length;i++){
        if(n>=acc && n<acc+ranges[i].count){ pageNo=i; cell=n-acc; break; }
        acc+=ranges[i].count; } }
    const pageId = "sbsheet-sbpage-"+clip.scene.id+"-2x2-"+pageNo;
    const half = cell < 2 ? "top" : "bottom";
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
    // researched prompting guidance (fal + community prompt guides, 2026-08) —
    // bestFor rides the dropdown option, promptFormula the menu footer
    bestFor:"Reference-driven shots — @-mention frames, clips & voices (up to 12); strong lip-sync and character consistency.",
    promptFormula:"subject → action → camera move (dolly, orbit, pan, push-in — it knows the vocabulary) → specific lighting → sound. Camera and subject motion in SEPARATE clauses; @-mention assets instead of re-describing them; timeline blocks pace each beat.",
    capabilities:["Multimodal video generation","Up to 12 assets combined","Up to 4K output (Standard tier)","Start→end frame transitions","Typical clip length 4–15s","Strong motion stability","Character consistency","Native audio","Director controls"],
    tiers:[
      // Rates come from app/pricing.jsx as provider USD/sec converted into base
      // credits/sec. The final visible-denomination cost is computed below.
      { id:"standard", label:"Standard", fast:false, maxRes:"4K", note:"Best quality and motion consistency · resolution up to 4K",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("seedance-2.0","standard")) || { "480p":0.5, "720p":1, "1080p":2, "4K":5 } },
      { id:"fast",     label:"Fast",     fast:true,  maxRes:"720p",  note:"Lower latency and cost for iteration · capped at 720p",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("seedance-2.0","fast")) || { "480p":0.4, "720p":0.8 } },
    ] },
  // (Sora 2 was removed from the picker 2026-07-05 by user decision — its proxy
  // routing and videogen isSora branch remain dormant, so re-adding it later is
  // just restoring a registry entry here.)
  // Seedance 2.5 — LIVE on fal (verified 2026-08-07): bytedance/seedance-2.5/reference-to-video.
  // Real listing facts: up to 50 multimodal refs, 4–30s (or auto) duration, resolutions
  // 480p/720p ONLY (no 1080p/4K output despite the launch material), generate_audio
  // default on, @-mention reference grammar, and NO fast endpoint exists. The whole app
  // was pre-wired for the 30s ceiling: maxClipSec:30 feeds the caphead / tick guard /
  // duration options / measured-seconds floor; caps lift (maxShotsPerClip:0,
  // maxDialoguePerClip:0); videogen clamps at 30s and polls ~20 min; the proxy
  // allowlists the endpoint and caps its resolution ladder at 720p.
  { id:"seedance-2.5", label:"Seedance 2.5", status:"active", maxShotsPerClip:0, maxDialoguePerClip:0,
    maxClipSec:30, maxAssets:50,
    metaRes:"720p", metaDur:"4–30s",
    bestFor:"Whole scenes in ONE pass — single-pass 30s clips with up to 50 multimodal references.",
    promptFormula:"the 2.0 layered grammar stretched over up to 30s — timeline blocks carry an entire scene in a single render.",
    capabilities:["Native single-pass 30s clips","Up to 50 multimodal references","Whole-scene generation","Native audio","Strong character consistency","Output up to 720p"],
    tiers:[
      // fal lists ONE endpoint (no fast tier) at 480p/720p only — rates in
      // app/pricing.jsx are the real fal per-second prices (2026-08-07).
      { id:"standard", label:"Standard", fast:false, maxRes:"720p", falModel:"bytedance/seedance-2.5/reference-to-video",
        note:"Single-pass up to 30s · up to 50 references · resolution up to 720p",
        creditRate:(window.turnVideoCreditRates&&window.turnVideoCreditRates("seedance-2.5","standard")) || { "480p":0.75, "720p":1.6 } },
    ],
    note:"Live on fal: native single-pass 30s clips with up to 50 multimodal references and whole-scene generation. Output tops out at 720p (fal lists no 1080p/4K for 2.5) — render in 2.0 Standard when you need 1080p/4K masters." },
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
const STAGE_PROMPT_SCHEMA = "seedance-micro-beats-v5";
function _seedanceVoiceSec(sh, textOverride){
  const ms = sh && sh.lineAudio && sh.lineAudio.durationMs;
  if(ms) return Math.round(ms/100)/10;                                  // measured audio
  const w = String(textOverride!=null ? textOverride : ((sh&&sh.dialogue)||"")).trim().split(/\s+/).filter(Boolean).length;
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
function stageVideoRefSafe(meta){
  if(!meta) return false;
  const res = String(meta.resolution||"").toLowerCase();
  if(res && res!=="480p" && res!=="720p") return false;
  const sec = Number(meta.durationSec || (meta.durationMs ? meta.durationMs/1000 : 0));
  return !sec || (sec>=2 && sec<=15);
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
/* the SCREENPLAY words, quoted. Micro-beat canon PARAPHRASES the moment ("Yusuf
   offers his polite greeting into the mirror") — a motion prompt that never quotes
   the line itself leaves the model to improvise dialogue the film never wrote, and
   hides from the director what the render will actually say. In locked-voice renders
   the words still ride alongside the @Audio tag: the audio pins the performance,
   the words steer the tone. */
function _stagePromptEntityToken(refs, kind, item){
  if(!refs) return "";
  if(kind==="character" && typeof refs.character==="function") return refs.character(item);
  if(kind==="speaker" && typeof refs.speaker==="function") return refs.speaker(item);
  if(kind==="prop" && typeof refs.prop==="function") return refs.prop(item);
  if(kind==="setting" && typeof refs.setting==="function") return refs.setting(item);
  if(kind==="audio" && typeof refs.audioForShot==="function") return refs.audioForShot(item);
  return "";
}
function _stagePromptEntityLabel(refs, kind, item, fallback){
  return _stagePromptEntityToken(refs, kind, item) || String(fallback||"").trim();
}
function _seedanceDialogueClause(sh, p, d, refs){
  const dialogue = String((p&&p.dialogue) || (sh&&sh.dialogue) || (sh&&sh.lineAudio&&sh.lineAudio.text) || "").trim().replace(/^["“]|["”]$/g,"");
  if(!dialogue) return "";
  const speakerName = (p&&p.speaker&&p.speaker.name) || (sh&&sh.lineAudio&&sh.lineAudio.speaker) || "the speaker";
  const speaker = _stagePromptEntityLabel(refs, "speaker", speakerName, speakerName);
  const aIdx = (typeof stageLineAudioIndex==="function") ? stageLineAudioIndex(d, sh.id) : 0;
  const paren = String((p&&p.dialogueParenthetical)||"").trim();
  return speaker+" says \""+dialogue+"\""+(paren?(" ("+paren+")"):"")+(aIdx?(" (lip-sync @Audio"+aIdx+")"):"");
}
function _seedanceMicroLines(d, shots){
  const panelLines = d && d.panelLines || [];
  const list = shots && shots.length ? shots : ((d&&d.shots)||[]);
  return (list||[]).map((sh,i)=>{
    const p = panelLines.find(x=>x&&x.shotId===(sh&&sh.id)) || panelLines[i] || {};
    const micro = Array.isArray(p.micro) ? p.micro.filter(Boolean) : [];
    const text = micro.length
      ? micro.map((m,j)=>(j+1)+") "+String(m||"").replace(/[\s.;]+$/,"")).join("; ")
      : String(p.text||sh&&sh.action||"").trim();
    return { sh, p, text };
  }).filter(x=>String(x.text||"").trim());
}
function _seedanceMicroPlan(d, shots){
  const rows = _seedanceMicroLines(d, shots);
  if(!rows.length) return "";
  return "Micro-beat action plan:\n"+rows.map((r,i)=>"SHOT "+(i+1)+" / Beat "+((r.sh&&r.sh.beatN)||"—")+": "+r.text+".").join("\n");
}
function _seedanceBeatMicroText(d, shots, activeShot){
  const beatN = activeShot && activeShot.beatN;
  const planShot = (activeShot && activeShot.beatPlan && Array.isArray(activeShot.beatPlan.micro) && activeShot.beatPlan.micro.length)
    ? activeShot
    : ((shots||[]).find(sh=>sh && sh.beatN===beatN && sh.beatPlan && Array.isArray(sh.beatPlan.micro) && sh.beatPlan.micro.length)
      || (shots||[]).find(sh=>sh && sh.beatPlan && Array.isArray(sh.beatPlan.micro) && sh.beatPlan.micro.length));
  const micro = (planShot && planShot.beatPlan && Array.isArray(planShot.beatPlan.micro)) ? planShot.beatPlan.micro : [];
  if(micro.length){
    const items = micro.map(m=>String(m||"").replace(/[\s.;]+$/,"")).filter(Boolean);
    return {
    beatN:(planShot&&planShot.beatN)||beatN,
    items,
    text:items.map((m,i)=>(i+1)+") "+m).join("; "),
    protect:String((planShot.beatPlan&&planShot.beatPlan.protect)||"").trim()
    };
  }
  const rows = _seedanceMicroLines(d, shots);
  if(!rows.length) return { beatN, text:"", protect:"" };
  const items = rows.map(r=>String(r.text||"").replace(/[\s.;]+$/,"")).filter(Boolean);
  return { beatN, items, text:items.map((r,i)=>(i+1)+") "+r).join("; "), protect:"" };
}
function _seedanceDialogueLinesForBeat(d, beatN){
  const fromBeat = d && d.beatDialogues && Array.isArray(d.beatDialogues[beatN]) ? d.beatDialogues[beatN] : [];
  if(fromBeat.length) return fromBeat;
  return ((d&&d.panelLines)||[]).filter(p=>String(p&&p.dialogue||"").trim()).map(p=>({
    speaker:(p.speaker&&p.speaker.name)||"the speaker",
    parenthetical:p.dialogueParenthetical||"",
    text:p.dialogue
  }));
}
function seedanceMicroBeatDirectorPrompt(clip, shots, activeShot, audioRefsOn, audioIncluded, refs){
  const d = (clip&&clip.data) || {};
  const cast = (d.cast||[]).map(c=>_stagePromptEntityLabel(refs, "character", c, c.name)).filter(Boolean);
  const props = (d.props||[]).map(p=>_stagePromptEntityLabel(refs, "prop", p, p.name)).filter(Boolean);
  const setting = d.setting || (clip&&clip.scene&&clip.scene.loc) || "";
  const settingRef = _stagePromptEntityLabel(refs, "setting", d.loc || setting, setting);
  const style = d.preset ? (d.preset.name+" — "+d.preset.grade) : "";
  const beat = _seedanceBeatMicroText(d, shots, activeShot);
  const beatN = beat.beatN || (activeShot&&activeShot.beatN) || (((shots||[])[0]||{}).beatN);
  const beatDialogue = _seedanceDialogueLinesForBeat(d, beatN);
  const panelLines = d.panelLines || [];
  const audioShotIds = Array.isArray(audioIncluded) ? audioIncluded : [];
  const audioLine = (ln)=>{
    const p = panelLines.find(x=>_normStageText(x&&x.dialogue)===_normStageText(ln&&ln.text)) || {};
    const aIdx = audioRefsOn===false ? 0 : (p.shotId ? stageLineAudioIndex({ ...d, audioIncluded:audioShotIds }, p.shotId) : 0);
    const par = String(ln&&ln.parenthetical||"").trim();
    const speakerName = ln.speaker || "the speaker";
    const speaker = _stagePromptEntityLabel(refs, "speaker", speakerName, speakerName);
    return speaker+" says \""+String(ln.text||"").replace(/^["“]|["”]$/g,"")+"\""
      +(par?(" ("+par+")"):"")+(aIdx?(" — lip-sync to @Audio"+aIdx):"");
  };
  const cameraRows = _uniq((shots||[]).map(sh=>_seedanceShotGrammar(sh)).filter(Boolean));
  const beatAction = (beat.items&&beat.items.length)
    ? "Action: Animate Beat "+(beatN||"")+" as one continuous moment, following these micro-beats in exact order:\n"
      + beat.items.map((m,i)=>(i+1)+") "+m+";").join("\n")
    : (beat.text && ("Action: Animate Beat "+(beatN||"")+" as one continuous moment, following these micro-beats in exact order:\n"+beat.text+"."));
  const rows = [
    cast.length && ("Subject: "+cast.join(", ")+"."),
    settingRef && ("Setting: "+settingRef+"."),
    beatAction,
    beat.protect && ("Protected dramatic core: "+beat.protect+"."),
    beatDialogue.length && ("Dialogue from screenplay: "+beatDialogue.map(audioLine).join("; ")+"."),
    cameraRows.length && ("Camera: "+cameraRows.join(" → ")+". Keep camera movement motivated and separate from subject movement."),
    props.length && ("Continuity props: "+props.join(", ")+". Keep them present unless the micro-beats explicitly remove them."),
    style && ("Look: "+style+"."),
    d.lighting && ("Lighting: "+d.lighting+"."),
    "Performance: grounded, cinematic, subtle physical business; let looks and pauses breathe between actions.",
    "Continuity: use the selected visual source and references for identity, wardrobe, location geometry, prop design and blocking. Do not add extra story beats, new characters, new props, captions, subtitles, panel borders or burned-in text."
  ].filter(Boolean);
  return rows.join("\n");
}
function _seedancePanelText(sh, p, i, clip, refs){
  const label = p.sheetPage ? ("Sheet "+p.sheetPage+" Panel "+p.sheetPanel) : ("Panel "+(((clip.scene&&clip.scene.no)||1)+"."+(i+1)));
  const grammar = _seedanceShotGrammar(sh);
  const micro = Array.isArray(p.micro) ? p.micro.filter(Boolean) : [];
  const script = String(p.script||"").trim();
  const blocking = String(p.sheet||sh.action||"").trim();
  const speakerName = (p.speaker&&p.speaker.name) || "the speaker";
  const speaker = _stagePromptEntityLabel(refs, "speaker", speakerName, speakerName);
  const dialogue = String((p&&p.dialogue) || (sh&&sh.dialogue)||"").trim().replace(/^["“]|["”]$/g,"");
  const dur = dialogue ? _seedanceVoiceSec(sh, dialogue) : 0;
  return [
    "SHOT "+(i+1)+" — "+label+" · Beat "+(sh.beatN||"—"),
    grammar && ("Camera: "+grammar+"."),
    micro.length && ("Micro-beats to animate: "+micro.map((m,j)=>(j+1)+") "+m.replace(/[\s.;]+$/,"")).join("; ")+"."),
    script && ("Script intent: "+script),
    blocking && (!script || _normStageText(blocking)!==_normStageText(script)) && ("Storyboard blocking: "+blocking),
    dialogue && (()=>{ const aIdx = stageLineAudioIndex(clip&&clip.data, sh.id);
      return "Dialogue/audio: "+speaker+" says \""+dialogue+"\""+(dur?(" (~"+dur+"s)"):"")+"."
        + (aIdx?(" Lip-sync "+speaker+" to @Audio"+aIdx+"."):" Sync to the matching audio reference if included."); })(),
    "Motion: animate only this beat's physical change; keep it continuous from the prior shot unit and ready for the next."
  ].filter(Boolean).join("\n");
}
function seedancePrompt(recipe, clip, refs){
  const d = (clip&&clip.data) || {}, shots = d.shots || [];
  const cast = (d.cast||[]).map(c=>_stagePromptEntityLabel(refs, "character", c, c.name));
  const props = (d.props||[]).map(p=>_stagePromptEntityLabel(refs, "prop", p, p.name));
  const setting = d.setting || "";
  const settingRef = _stagePromptEntityLabel(refs, "setting", d.loc || setting, setting);
  const style = d.preset ? (d.preset.name+" — "+d.preset.grade) : "";
  const lead = d.lead || (cast[0] || "the subject");
  const panelLines = d.panelLines || [];
  const actionLines = _uniq((panelLines.length ? panelLines.map(p=>p.text) : shots.map(s=>String(s.action||"").trim())).filter(Boolean));
  const dialogueSpeakers = _uniq(panelLines.filter(p=>p&&p.speaker&&p.speaker.name).map(p=>p.speaker.name));
  const voiceLead = dialogueSpeakers[0] || lead;
  if(recipe==="structured"){
    const dlgLines = shots.map((sh,i)=>_seedanceDialogueClause(sh, panelLines[i]||{}, d, refs)).filter(Boolean);
    return [
      cast.length && ("Subject: "+cast.join(", ")+"."),
      "Action: "+actionLines.join(" "),
      dlgLines.length && ("Dialogue: "+dlgLines.join("; ")+"."),
      settingRef && ("Setting: "+settingRef+"."),
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
    const microPlan = _seedanceMicroPlan({ ...d, panelLines:allLines }, lineShots.length ? lineShots : shots);
    const visualLead = "Start from the selected visual source"+(d.audioRefsOn===false ? "" : " and keep the frame anchored while the beat plays")+".";
    const nameOf = (sh)=>{ const p = allLines.find(x=>x&&x.shotId===(sh&&sh.id));
      const nm = (p&&p.speaker&&p.speaker.name) || (sh&&sh.lineAudio&&sh.lineAudio.speaker) || voiceLead;
      return _stagePromptEntityLabel(refs, "speaker", nm, nm); };
    const sayOf = (sh)=>{ const p = allLines.find(x=>x&&x.shotId===(sh&&sh.id));
      return String((p&&p.dialogue) || (sh&&sh.dialogue) || (sh&&sh.lineAudio&&sh.lineAudio.text) || "").trim().replace(/^["“]|["”]$/g,""); };
    const tail = (settingRef?(" "+settingRef+"."):"") + (style?(" "+style+"."):"");
    // NATIVE PERFORMANCE (no audio refs): the model acts the lines itself — name the
    // words, not @Audio files, and leave the pacing to the performance
    if(d.audioRefsOn===false){
      if(lineShots.length>1){
        const seq = lineShots.map((sh)=> nameOf(sh)+" says \""+sayOf(sh)+"\"").join(", then ");
        return [microPlan, visualLead+" "+seq+" — each performing their line in their own natural, in-character voice. Let the moment breathe between the lines — a look, a reaction. Grounded performances; subtle, motivated motion; hold the framing, lighting and identity steady."+tail].filter(Boolean).join("\n\n");
      }
      const one = lineShots[0];
      const sp1 = one ? nameOf(one) : voiceLead;
      const ln1 = one ? sayOf(one) : "";
      return [microPlan, visualLead+" "+sp1+" performs "+(ln1?("\""+ln1+"\" "):"the screenplay line ")+"in a natural, in-character voice with free, believable pacing. Subtle, motivated motion; hold the framing, lighting and identity steady."+tail].filter(Boolean).join("\n\n");
    }
    // PLACEMENT: when the clip runs longer than the speech (the 4s floor, or budgeted
    // air), say where the line lands — otherwise the model guesses and the extra
    // seconds come out as unguided vamping.
    const lineSecTotal = lineShots.reduce((t,sh)=>t+(_seedanceVoiceSec(sh, sayOf(sh))||0),0);
    const clipSec = Number(d.dur)||0;
    const roomy = !!(clipSec && lineSecTotal && (clipSec-lineSecTotal)>=1.2);
    if(lineShots.length>1){
      const seq = lineShots.map((sh,i)=>{ const w = sayOf(sh);
        return nameOf(sh)+" delivers "+(w?("\""+w+"\""):"their line")+" in @Audio"+(i+1); }).join(", then ");
      return [microPlan, visualLead+" "+seq+" — each line lip-synced to its own audio reference, and only the named speaker's lips move on their line. Let the micro-beat action plan drive the physical business between and around the lines. Grounded, in-character performances; subtle, motivated motion; hold the framing, lighting and identity steady."+tail].filter(Boolean).join("\n\n");
    }
    const speaker1 = lineShots[0] ? nameOf(lineShots[0]) : voiceLead;
    const words1 = lineShots[0] ? sayOf(lineShots[0]) : "";
    return [microPlan, visualLead+" "+speaker1+" delivers "+(words1?("\""+words1+"\" "):"the screenplay line ")+"in @Audio1 with natural, accurate lip-sync — a grounded, in-character performance."
      +(roomy ? (" The line lands about "+CLIP_AIR.lead+"s in — settle the moment before it and hold "+speaker1+"'s reaction after it.") : "")
      +" Let the micro-beat action plan drive the physical business. Subtle, motivated motion; hold the framing, lighting and identity steady."+tail].filter(Boolean).join("\n\n");
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
      const dialogue = String((p&&p.dialogue) || (sh&&sh.dialogue)||"").trim().replace(/^["“]|["”]$/g,"");
      const lineSec = dialogue ? _seedanceVoiceSec(sh, dialogue) : 0;
      const lead = dialogue ? (spokenSeen===0 ? CLIP_AIR.lead : CLIP_AIR.gap) : 0;
      const tail = (dialogue && i===lastSpokenIdx) ? CLIP_AIR.tail : 0;
      const dur = dialogue ? (lead + lineSec + tail) : stageShotRuntime(sh);
      const a = r1(t), b = r1(t+dur), lineAt = r1(t+lead), lineEnd = r1(t+lead+lineSec);
      t += dur; if(dialogue) spokenSeen++;
      const grammar = _seedanceShotGrammar(sh);
      const speakerName = (p.speaker&&p.speaker.name) || "the speaker";
      const speaker = _stagePromptEntityLabel(refs, "speaker", speakerName, speakerName);
      const aIdx = dialogue ? stageLineAudioIndex(d, sh.id) : 0;
      const microLead = (Array.isArray(p.micro) && p.micro.length) ? p.micro.map((m,j)=>(j+1)+") "+String(m||"").replace(/[\s.;]+$/,"")).join("; ") : "";
      return a+"–"+b+"s: "+(microLead || String(p.text||sh.action||"").trim() || "Hold the moment.")
        + (grammar?(" Camera: "+grammar+"."):"")
        + (dialogue?(" "+speaker+" says \""+dialogue+"\" at ~"+lineAt+"–"+lineEnd+"s"
            +(aIdx?(" — lip-sync "+speaker+" to @Audio"+aIdx):"")
            +"; let the moment breathe before and after the line."):"");
    });
    const head = [
      "One continuous "+(d.dur||"4-15")+"s clip, paced to the time-coded segments below — no hard cuts unless a segment demands one.",
      cast.length && ("Cast: "+cast.join(", ")+"."),
      settingRef && ("Setting: "+settingRef+"."),
      style && ("Style: "+style+"."),
      d.lighting && ("Lighting: "+d.lighting+"."),
    ].filter(Boolean).join(" ");
    return head+"\n"+windows.join("\n");
  }
  if(recipe==="panels"){
    const context = [
      "SEEDANCE MULTIMODAL SHOT PLAN",
      "Clip: "+((clip&&clip.label)||"selected clip")+" from "+((clip&&clip.scene&&clip.scene.title)||"the scene")+".",
      settingRef && ("Setting: "+settingRef+"."),
      cast.length && ("Cast in frame: "+cast.join(", ")+"."),
      props.length && ("Props that must carry through when present: "+props.join(", ")+"."),
      style && ("Look: "+style+"."),
      d.lighting && ("Lighting: "+d.lighting+"."),
      d.camera && ("Camera arc: "+d.camera+"."),
      "Reference roles: the selected start image or storyboard half/page controls composition and blocking; character, prop and location references control identity, objects and geography; audio references control spoken timing and lip-sync.",
      "Generate one continuous "+(d.dur||"4-15")+"s clip. Treat the shot units below as ordered key moments inside that clip, not as separate unrelated images."
    ].filter(Boolean).join("\n");
    const panels = shots.map((sh,i)=>_seedancePanelText(sh, panelLines[i]||{}, i, clip, refs)).join("\n\n");
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

function seedanceBeatPrompt(clip, sh, refs){
  const d = (clip&&clip.data) || {};
  const p = ((d.panelLines||[]).find(x=>x.shotId===(sh&&sh.id))) || {};
  const cast = (d.cast||[]).map(c=>_stagePromptEntityLabel(refs, "character", c, c.name)).filter(Boolean);
  const setting = d.setting || (clip&&clip.scene&&clip.scene.loc) || "";
  const settingRef = _stagePromptEntityLabel(refs, "setting", d.loc || setting, setting);
  const style = d.preset ? (d.preset.name+" — "+d.preset.grade) : "";
  const script = String(p.script||stageShotScriptText(clip&&clip.scene, {}, sh, 220)||"").trim();
  const blocking = String(p.sheet||sh&&sh.action||"").trim();
  const micro = Array.isArray(p.micro) ? p.micro.filter(Boolean) : [];
  const dialogue = String((p&&p.dialogue) || (sh&&sh.dialogue)||"").trim().replace(/^["“]|["”]$/g,"");
  const speakerName = (p.speaker&&p.speaker.name) || "the speaker";
  const speaker = _stagePromptEntityLabel(refs, "speaker", speakerName, speakerName);
  // append storyboard blocking ONLY when it adds real information — a 1% text wobble
  // ("sodium light" vs "sodium light,") made the sentence read twice; strip trailing
  // punctuation (as everywhere else in prompt assembly) so the dedupe is exact
  const scriptN = _normStageText(script), blockingN = _normStageText(blocking);
  const blockingAdds = !!(blockingN && blockingN!==scriptN && scriptN.indexOf(blockingN)<0 && blockingN.indexOf(scriptN)<0);
  const parts = [
    cast.length && ("Subject: "+cast.join(", ")+"."),
    (micro.length || script || blocking) && ("Action: "+(micro.length
      ? ("Animate these micro-beats in order: "+micro.map((m,i)=>(i+1)+") "+String(m||"").replace(/[\s.;]+$/,"")).join("; ")+".")
      : (script || blocking))+(script && blocking && blockingAdds ? (" Storyboard blocking: "+blocking.replace(/[\s.;…]+$/,"")) : "")),
    dialogue && ("Dialogue/audio: "+speaker+" says \""+dialogue+"\""
      +(d.audioRefsOn===false ? "; performed in a natural, in-character voice." : "; sync performance to the locked audio if present.")),
    settingRef && ("Setting: "+settingRef+"."),
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
function seedanceRecipePrompt(recipeId, clip, shots, activeShot, audioRefsOn, audioIncluded, refs){
  const scoped = { ...clip, data:{ ...seedanceBeatData(clip, shots),
    audioRefsOn: audioRefsOn!==false,
    audioIncluded: Array.isArray(audioIncluded) ? audioIncluded : null } };
  const base = seedanceMicroBeatDirectorPrompt(scoped, shots, activeShot, audioRefsOn!==false, audioIncluded, refs)
    || ((!recipeId || recipeId==="narrative") ? seedanceBeatPrompt(scoped, activeShot, refs) : seedancePrompt(recipeId, scoped, refs));
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
function stagePromptMentionContext(includedAssets, d){
  const byKey = {};
  const byName = {};
  const cleanName = (s)=>String(s||"")
    .replace(/\s+(reference|line|plate|coverage sheet)$/i,"")
    .replace(/\s+—\s+.*$/,"")
    .replace(/\s+·\s+.*$/,"")
    .trim();
  const addName = (name, tok, force)=>{
    const n = _normStageText(name);
    if(n && tok && (force || !byName[n])) byName[n] = tok;
  };
  (includedAssets||[]).forEach(a=>{
    if(!a || a.kind==="text") return;
    const tok = stageAssetMention(a);
    if(!tok || tok==="@") return;
    byKey[String(a.key||"")] = tok;
    if(a.kind==="image"){
      addName(cleanName(a.label), tok);
      addName(a.label, tok);
    }
  });
  (d&&d.cast||[]).forEach(c=>{
    const tok = byKey["c:"+c.id] || byName[_normStageText(c.name)];
    addName(c.name, tok, !!byKey["c:"+c.id]);
  });
  (d&&d.props||[]).forEach(p=>{
    const tok = byKey["p:"+p.id] || byName[_normStageText(p.name)];
    addName(p.name, tok, !!byKey["p:"+p.id]);
  });
  return {
    character(c){
      if(!c) return "";
      if(typeof c==="string") return byName[_normStageText(c)] || "";
      return byKey["c:"+c.id] || byName[_normStageText(c.name)] || "";
    },
    speaker(name){ return byName[_normStageText(name)] || ""; },
    prop(p){
      if(!p) return "";
      if(typeof p==="string") return byName[_normStageText(p)] || "";
      return byKey["p:"+p.id] || byName[_normStageText(p.name)] || "";
    },
    setting(){ return byKey.loc || ""; },
    audioForShot(shotId){ return byKey["a:"+shotId] || ""; }
  };
}
function stageCleanRefName(label){
  return String(label||"")
    .replace(/\s+(reference|line|plate|coverage sheet)$/i,"")
    .replace(/\s+—\s+.*$/,"")
    .replace(/\s+·\s+.*$/,"")
    .trim();
}
function stageRemapImageMentionPayload(text, oldAssets, keptAssets){
  const kept = new Map();
  (keptAssets||[]).forEach((a,i)=>kept.set(stageAssetMention(a), "@Image"+(i+1)));
  const dropped = new Map();
  (oldAssets||[]).forEach(a=>{
    const tok = stageAssetMention(a);
    if(tok && !kept.has(tok)) dropped.set(tok, stageCleanRefName(a.label) || "the character");
  });
  let out = String(text||"").split(/\n/).filter(line=>{
    for(const tok of dropped.keys()){
      if(new RegExp("^\\s*"+tok.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\s+is\\b","i").test(line)) return false;
    }
    return true;
  }).join("\n");
  [...kept.entries(), ...dropped.entries()].forEach(([from,to])=>{
    out = out.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),"g"), to);
  });
  return out.replace(/\n{3,}/g,"\n\n").trim();
}
function stageAssetRole(a, refs){
  if(!a || a.kind==="text") return "";
  const T = stageAssetMention(a);
  const k = String(a.key||"");
  const label = String(a.label||"").trim();
  if(a.kind==="audio"){
    const speakerName = label.replace(/\s+line$/i,"") || "the speaker";
    const speaker = _stagePromptEntityLabel(refs, "speaker", speakerName, speakerName);
    return T+" is "+speaker+"'s spoken line — sync lip movement and timing to it.";
  }
  if(a.kind==="video") return T+" is the previous clip — match its camera movement, pacing and continuity.";
  if(k==="frame") return T+" is the first frame — start from this exact composition.";
  if(k.indexOf("shotframe:")===0) return T+" is "+(label.toLowerCase()||"a later shot's frame")+" — anchor that shot's composition and blocking to it.";
  if(k.indexOf("sb-half")===0 || k==="sb-sheet") return T+" is the storyboard for this clip — follow its composition, blocking and panel order.";
  if(k.indexOf("c:")===0) return T+" is "+(label.replace(/\s+reference$/i,"")||"the character")+"'s identity reference — keep their appearance exactly consistent.";
  if(k==="loc") return T+" is the "+(label||"location plate")+" — keep its geography and lighting.";
  if(k.indexOf("p:")===0) return T+" is the "+(label||"prop")+" — keep this object's design consistent.";
  return T+" is "+(label||"a reference")+".";
}

/* ---- In-text @mention CHIP editor (Seedance-style). A contentEditable prompt box
   where resolved @Image/@Video/@Audio tokens render as inline chips — thumbnail +
   token + a caret that opens a same-kind swap picker — while the canonical value
   stays the PLAIN STRING the recipes/generate path already use (chips serialize back
   to their raw token). Caret positions are tracked as absolute offsets into that
   string (a chip counts as its token's length), so autocomplete, insert-at-caret and
   maxLength all keep working exactly as they did on the old <textarea>. */
function StageMentionEditor({ value, mentionables, maxLen, placeholder, onChange, onKeyDown, onBlur, apiRef }){
  const elRef = React.useRef(null);
  const lastVal = React.useRef(null);          // last value REFLECTED in the DOM
  const [swap, setSwap] = React.useState(null); // {tok, start, kind} — chip swap picker
  const swapRef = React.useRef(null); swapRef.current = swap;
  const byTokRef = React.useRef({});
  byTokRef.current = {}; (mentionables||[]).forEach(m=>{ byTokRef.current[String(m.t||"").toLowerCase()] = m; });
  const tokRe = ()=>/@(?:Image|Video|Audio)\d+/gi;
  const isChip = (n)=> n && n.nodeType===1 && n.getAttribute && n.getAttribute("data-token");

  /* DOM -> string. Only text nodes, chips and BRs exist after our own renders; DIVs
     (rare browser artifacts) serialize defensively as newline + contents. */
  const serialize = ()=>{
    let out = "";
    const walk = (n)=>{ Array.from(n.childNodes).forEach(c=>{
      if(c.nodeType===3) out += c.nodeValue;
      else if(c.nodeType===1){
        if(isChip(c)) out += c.getAttribute("data-token");
        else if(c.tagName==="BR") out += "\n";
        else { if(out && !/\n$/.test(out)) out += "\n"; walk(c); }
      } }); };
    if(elRef.current) walk(elRef.current);
    return out;
  };
  const caretOffset = ()=>{
    const el = elRef.current, sel = window.getSelection();
    const cur = lastVal.current||"";
    if(!el || !sel || !sel.rangeCount) return cur.length;
    const fN = sel.focusNode, fO = sel.focusOffset;
    if(!el.contains(fN)) return cur.length;
    let off = 0, done = false;
    const walk = (n)=>{
      const kids = Array.from(n.childNodes);
      for(let i=0;i<kids.length;i++){
        if(n===fN && n.nodeType===1 && i===fO){ done = true; return; }
        const c = kids[i];
        if(c.nodeType===3){
          if(c===fN){ off += Math.min(fO, c.nodeValue.length); done = true; return; }
          off += c.nodeValue.length;
        } else if(c.nodeType===1){
          if(isChip(c)){ const L = c.getAttribute("data-token").length;
            if(c===fN || c.contains(fN)){ off += L; done = true; return; }
            off += L; }
          else if(c.tagName==="BR") off += 1;
          else { if(c===fN && fO===0){ done = true; return; } walk(c); if(done) return; }
        }
      }
      if(n===fN && n.nodeType===1 && kids.length<=fO) done = true;
    };
    walk(el);
    return done ? off : cur.length;
  };
  const setCaret = (off)=>{
    const el = elRef.current; if(!el) return;
    const sel = window.getSelection(), r = document.createRange();
    let rem = Math.max(0, off), placed = false;
    const place = (node, o)=>{ r.setStart(node, o); r.collapse(true); placed = true; };
    const walk = (n)=>{
      for(const c of Array.from(n.childNodes)){
        if(placed) return;
        if(c.nodeType===3){
          if(rem <= c.nodeValue.length){ place(c, rem); return; }
          rem -= c.nodeValue.length;
        } else if(c.nodeType===1){
          const p = c.parentNode, idx = Array.prototype.indexOf.call(p.childNodes, c);
          if(isChip(c)){ const L = c.getAttribute("data-token").length;
            if(rem <= L){ place(p, rem===0 ? idx : idx+1); return; }  // inside a chip snaps AFTER it
            rem -= L; }
          else if(c.tagName==="BR"){ if(rem===0){ place(p, idx); return; } rem -= 1; }
          else { walk(c); if(placed) return; }
        }
      }
    };
    walk(el);
    if(!placed){ r.selectNodeContents(el); r.collapse(false); }
    try{ sel.removeAllRanges(); sel.addRange(r); }catch(_e){}
  };
  /* absolute string-offset of a node (chips count as their token length) */
  const nodeStartOffset = (target)=>{
    let off = 0, found = false;
    const walk = (n)=>{
      for(const c of Array.from(n.childNodes)){
        if(found) return;
        if(c===target){ found = true; return; }
        if(c.nodeType===3) off += c.nodeValue.length;
        else if(c.nodeType===1){
          if(isChip(c)) off += c.getAttribute("data-token").length;
          else if(c.tagName==="BR") off += 1;
          else { walk(c); if(found) return; }
        }
      }
    };
    if(elRef.current) walk(elRef.current);
    return found ? off : -1;
  };
  const chipEl = (m)=>{
    const s = document.createElement("span");
    s.className = "stage2-chip "+(m.kind||""); s.contentEditable = "false";
    s.setAttribute("data-token", m.t);
    s.title = m.t+(m.label ? " — "+m.label : "");
    if(m.kind==="image" && m.url){ const img = document.createElement("img"); img.src = m.url; img.alt = ""; s.appendChild(img); }
    else { const t = document.createElement("span"); t.className = "stage2-chip-tile"; t.textContent = m.kind==="video" ? "▸" : "♪"; s.appendChild(t); }
    const b = document.createElement("b"); b.textContent = m.t; s.appendChild(b);
    const car = document.createElement("span");
    car.className = "stage2-chip-caret"; car.textContent = "▾";
    car.setAttribute("role","button"); car.title = "Swap the referenced asset";
    car.addEventListener("mousedown", (e)=>{ e.preventDefault(); e.stopPropagation(); });
    car.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation();
      const start = nodeStartOffset(s);
      if(start>=0) setSwap(sw => (sw && sw.start===start) ? null : { tok:m.t, start, kind:m.kind }); });
    s.appendChild(car);
    return s;
  };
  const renderDom = (txt)=>{
    const el = elRef.current; if(!el) return;
    txt = String(txt||"");
    el.textContent = "";
    const frag = document.createDocumentFragment();
    const re = tokRe(); let last = 0, m;
    while((m = re.exec(txt))){
      if(m.index>last) frag.appendChild(document.createTextNode(txt.slice(last, m.index)));
      const mm = byTokRef.current[m[0].toLowerCase()];
      frag.appendChild(mm ? chipEl(mm) : document.createTextNode(m[0]));
      last = m.index + m[0].length;
    }
    if(last<txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));
    el.appendChild(frag);
  };
  /* raw (not-yet-chip) resolved tokens sitting in plain text nodes, as [start,end) */
  const rawResolvedRanges = ()=>{
    const out = []; let off = 0;
    const walk = (n)=>{
      for(const c of Array.from(n.childNodes)){
        if(c.nodeType===3){
          const re = tokRe(); let m;
          while((m = re.exec(c.nodeValue))){
            if(byTokRef.current[m[0].toLowerCase()]) out.push({ start:off+m.index, end:off+m.index+m[0].length });
          }
          off += c.nodeValue.length;
        } else if(c.nodeType===1){
          if(isChip(c)) off += c.getAttribute("data-token").length;
          else if(c.tagName==="BR") off += 1;
          else walk(c);
        }
      }
    };
    if(elRef.current) walk(elRef.current);
    return out;
  };
  const handleInput = ()=>{
    if(swapRef.current) setSwap(null);
    let txt = serialize();
    let caret = caretOffset();
    if(maxLen && txt.length>maxLen){          // e.g. a drop that slipped past beforeinput
      txt = txt.slice(0, maxLen); caret = Math.min(caret, maxLen);
      lastVal.current = txt; renderDom(txt); setCaret(caret);
    } else {
      lastVal.current = txt;
      // chipify tokens the caret is NOT touching — a token still being typed stays text
      if(rawResolvedRanges().some(r=> caret<r.start || caret>r.end)){ renderDom(txt); setCaret(caret); }
    }
    onChange && onChange(lastVal.current, caret);
  };
  const handleKeyDown = (e)=>{
    if(e.key==="Escape" && swapRef.current){ e.preventDefault(); setSwap(null); return; }
    if(onKeyDown) onKeyDown(e);
    if(e.defaultPrevented) return;
    if(e.key==="Enter"){                       // keep newlines predictable (BR, serialized "\n")
      e.preventDefault();
      try{ if(!document.execCommand("insertLineBreak")) document.execCommand("insertText", false, "\n"); }
      catch(_e){ try{ document.execCommand("insertText", false, "\n"); }catch(_e2){} }
    }
  };
  const handlePaste = (e)=>{
    e.preventDefault();
    const t = (e.clipboardData && e.clipboardData.getData("text/plain")) || "";
    if(!t) return;
    const sel = window.getSelection();
    const selLen = (sel && sel.rangeCount) ? sel.getRangeAt(0).toString().length : 0;
    const room = (maxLen||1e9) - ((lastVal.current||"").length - selLen);
    const ins = t.slice(0, Math.max(0, room)).replace(/\r\n?/g,"\n");
    if(ins){ try{ document.execCommand("insertText", false, ins); }catch(_e){} }
  };
  const doSwap = (m)=>{
    const sw = swapRef.current; if(!sw) return;
    const cur = lastVal.current||"";
    if(m.t!==sw.tok && cur.slice(sw.start, sw.start+sw.tok.length).toLowerCase()===sw.tok.toLowerCase()){
      const next = (cur.slice(0, sw.start)+m.t+cur.slice(sw.start+sw.tok.length)).slice(0, maxLen||1e9);
      lastVal.current = next; renderDom(next);
      onChange && onChange(next, null);
    }
    setSwap(null);
    const el = elRef.current; if(el){ try{ el.focus(); setCaret(sw.start+m.t.length); }catch(_e){} }
  };
  // external value changes (recipe recompiles, chip buttons, insertMention) rebuild the DOM
  React.useEffect(()=>{
    if(value===lastVal.current) return;
    lastVal.current = String(value||"");
    setSwap(null);
    renderDom(lastVal.current);
  },[value]);
  // asset set changed — tokens may (un)resolve; re-chipify, preserving the caret if focused
  const mentionSig = (mentionables||[]).map(m=>m.t+":"+(m.url||"")).join("|");
  React.useEffect(()=>{
    const el = elRef.current; if(!el) return;
    const focused = document.activeElement===el;
    const caret = focused ? caretOffset() : null;
    renderDom(lastVal.current||"");
    if(focused && caret!=null){ el.focus(); setCaret(caret); }
  },[mentionSig]);
  // maxLength guard at the source (native beforeinput — React's synthetic one is unreliable here)
  React.useEffect(()=>{
    const el = elRef.current; if(!el || !maxLen) return;
    const onBI = (e)=>{
      const t = String(e.inputType||"");
      if(t.indexOf("insert")!==0 || t==="insertFromPaste") return;   // paste is pre-sliced
      const ins = (e.data!=null) ? e.data : ((t==="insertLineBreak"||t==="insertParagraph") ? "\n" : "");
      const sel = window.getSelection();
      const selLen = (sel && sel.rangeCount) ? sel.getRangeAt(0).toString().length : 0;
      if(((lastVal.current||"").length - selLen + ins.length) > maxLen) e.preventDefault();
    };
    el.addEventListener("beforeinput", onBI);
    return ()=> el.removeEventListener("beforeinput", onBI);
  },[maxLen]);
  React.useEffect(()=>{
    if(!apiRef) return;
    apiRef.current = {
      caretOffset,
      applyValue:(txt, pos)=>{ lastVal.current = String(txt||""); renderDom(lastVal.current);
        const el = elRef.current; if(el){ try{ el.focus(); if(pos!=null) setCaret(pos); }catch(_e){} } },
      focus:()=>{ try{ elRef.current && elRef.current.focus(); }catch(_e){} },
      el:elRef.current
    };
  });
  const swapItems = swap ? (mentionables||[]).filter(m=>m.kind===swap.kind) : [];
  return _stEl("div",{className:"stage2-gen-prompt-shell"},
    _stEl("div",{ref:elRef, className:"stage2-gen-prompt stage2-gen-prompt-rich",
      contentEditable:true, suppressContentEditableWarning:true, spellCheck:false,
      role:"textbox","aria-multiline":"true","aria-label":placeholder||"Prompt",
      "data-placeholder":placeholder||"",
      onInput:handleInput, onKeyDown:handleKeyDown, onPaste:handlePaste,
      onBlur:(e)=>{ setTimeout(()=>setSwap(null),120); onBlur && onBlur(e); }}),
    swap && swapItems.length>0 && _stEl("div",{className:"stage2-mention-box stage2-swap-box"},
      _stEl("div",{className:"stage2-swap-head"},"Swap "+swap.tok+" →"),
      swapItems.map(m=>_stEl("button",{key:m.t,type:"button",
        className:"stage2-mention-item"+(m.t===swap.tok?" hi":""),
        onMouseDown:e=>{ e.preventDefault(); doSwap(m); }},
        m.kind==="image" && m.url
          ? _stEl("img",{className:"stage2-mention-thumb",src:m.url,alt:""})
          : _stEl("span",{className:"stage2-mention-thumb tile"}, m.kind==="video" ? "▸" : "♪"),
        _stEl("span",{className:"stage2-mention-main"},
          _stEl("b",null,m.t), m.label && _stEl("span",{className:"stage2-mention-label"},m.label)),
        m.t===swap.tok && _stEl("span",{className:"stage2-mention-kind"},"Current")))));
}

function ClipConsole({ clip, selectedShot, sceneClips, ctx, imgs, auds, beatsMap, drafts, prevClipVideoId, aspect, visualSource, setVisualSource, creditBalance, onVoiceLine, onUpdateShot, onSelectClip, onFirstVideo, modelId, setModelId, pendingReuse, onReuseConsumed }){
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
  const orderedVisibleTakes = visibleTakes.slice().sort((a,b)=>{
    const am = (a&&a.meta)||{}, bm = (b&&b.meta)||{};
    const at = Number(am.createdAt || a.savedAt || 0);
    const bt = Number(bm.createdAt || b.savedAt || 0);
    if(bt!==at) return bt-at;
    return (b.current?1:0) - (a.current?1:0);
  });
  const approvedVisibleTakes = orderedVisibleTakes.filter(t=>((t&&t.meta)||{}).status==="approved");
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
  const prevVideoMeta = prevClipVideoId && typeof vidGetMeta==="function" ? vidGetMeta(prevClipVideoId) : null;
  const prevVideoSafe = !!(prevVideo && stageVideoRefSafe(prevVideoMeta));
  const [previewId, setPreviewId] = React.useState(activeShot.id || (d.first||{}).id || null);
  React.useEffect(()=>{ setPreviewId(activeShot.id || (d.first||{}).id || null); }, [activeShot.id, clip.id]);
  const previewFrame = usePanels ? startFrame : (imgs[previewId] || startFrame);
  // the clip's own shots — this IS the render unit now, not a same-beatN subset.
  const shownShots = (d.shots||[]).length ? d.shots : [activeShot].filter(Boolean);
  const beatLabel = clip.label;
  const beatName = clipBeatName(clip, beatsMap, drafts);
  const clipsInScene = (sceneClips&&sceneClips.length) ? sceneClips : [clip];
  /* the filmstrip reads vidGetVideo SYNCHRONOUSLY from the in-memory cache — only the
     clip loaded in the player ever gets vidLoadVideo'd, so takes rendered in earlier
     sessions never became cards. Preload every scene clip's stored video (IndexedDB /
     cloud) and re-read the strip when one lands, or when vid-done fires for ANY scene
     clip (background recovery, a Versions action on another clip). */
  const [stripTick, setStripTick] = React.useState(0);
  const clipIdsKey = (clipsInScene||[]).map(c=>c&&c.id).join("|");
  React.useEffect(()=>{ let alive=true;
    if(typeof vidLoadVideo==="function"){
      (clipsInScene||[]).forEach(c=>{
        if(!c||!c.id||((typeof vidGetVideo==="function")&&vidGetVideo(c.id))) return;
        vidLoadVideo(c.id).then(u=>{ if(alive&&u) setStripTick(t=>t+1); });
      });
    }
    const onDone=(e)=>{ const ids=(e&&e.detail&&e.detail.ids)||[];
      if(ids.some(id=>(clipsInScene||[]).some(c=>c&&c.id===id))) setStripTick(t=>t+1); };
    window.addEventListener("vid-done", onDone);
    return ()=>{ alive=false; window.removeEventListener("vid-done", onDone); };
  }, [clipIdsKey]);   // stripTick re-runs the strip's vidGetVideo scan below

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
      hs.forEach((h,i)=>out.push({ key:"sb-half-"+i, kind:"image", label:"Storyboard "+(i+1)+" / "+hs.length+" for this clip", url:h.url, ready:true, locked:true, id:h.id,
        assetRole:"derived_reference", assetSourceQuality:"storyboard_half_full_frame" }));
      if(!hs.length) out.push({ key:"sb-missing", kind:"image", label:"Storyboard halves", ready:false, locked:true });
    } else if(sourceMode==="sheet"){
      if(storyAssets.sheet) out.push({ key:"sb-sheet", kind:"image", label:"Full storyboard sheet", url:storyAssets.sheet, ready:true, locked:true, id:storyAssets.ids&&storyAssets.ids.sheet,
        assetRole:"derived_reference", assetSourceQuality:"storyboard_sheet_full_frame" });
      else out.push({ key:"sb-missing", kind:"image", label:"Storyboard sheet", ready:false, locked:true });
    } else if(sourceMode==="frames"){
      // per-shot frames: each merged shot's frame anchors its own moment in the clip —
      // the first is the start frame; ALL are deselectable (excluding the start frame
      // renders the clip from the prompt + remaining references, no image anchor).
      // A one-image model (Sora) takes only the first frame, so only that one shows.
      (d.shots||[]).slice(0, _mRefs ? undefined : 1).forEach((sh,i)=>{ const u=imgs[sh.id];
        out.push({ key:i===0?"frame":("shotframe:"+sh.id), kind:"image",
          label:"Shot "+(i+1)+" frame", url:u, ready:!!u, id:sh.id,
          assetRole:"shot_anchor", assetSourceQuality:"shot_frame_full_frame" }); });
    } else {
      const firstFrame = imgs[(d.first||{}).id] || shotStartFrame;
      // deselectable: excluding the start frame renders from the prompt + references
      // alone (no image anchor) — the user's call, e.g. to escape a bad frame's pull
      if(firstFrame) out.push({ key:"frame", kind:"image", label:(d.cast[0]?d.cast[0].name+" — shot frame":"Shot start frame"), url:firstFrame, ready:true, id:(d.first||{}).id||activeShot.id,
        assetRole:"shot_anchor", assetSourceQuality:"shot_frame_full_frame" });
      else out.push({ key:"frame-missing", kind:"image", label:"Shot start frame", ready:false, locked:true });
    }
    if(_mRefs){
      d.cast.forEach(c=>{ const u=imgs[c.id]; out.push({ key:"c:"+c.id, kind:"image", label:c.name+" reference", url:u, ready:!!u, id:c.id,
        assetRole:"master_reference", assetSourceQuality:"character_master_sheet" }); });
      if(d.loc){
        // prefer the screenplay-derived coverage sheet (TOD/side accurate) when its
        // image exists; the master plate is the fallback, never the blind default
        const useCov = d.locSheet && imgs[d.locSheet.id];
        const lid = useCov ? d.locSheet.id : d.loc.id;
        const llab = useCov
          ? (d.locSheet.name+(d.locSheet.role?(" \u00b7 "+d.locSheet.role):"")+" coverage sheet")
          : (d.loc.name||"Location")+" plate";
        out.push({ key:"loc", kind:"image", label:llab, url:imgs[lid]||"", ready:!!imgs[lid], id:lid,
          assetRole:useCov?"derived_reference":"master_reference",
          assetSourceQuality:useCov?"location_coverage_full_frame":"location_master_plate" });
      }
      d.props.forEach(p=>{
        // the ACTIVE appearance-state variant sheet (never the stale base), labelled with
        // its state and current holder so the References block tells the video model
        // exactly who carries/wears it in this scene. A MISSING sheet must surface as a
        // missing ingredient — silently dropping it made the render invent the prop.
        const sid = p.sheetId || p.id;
        const u = imgs[sid];
        const plab = p.name+(p.stateLabel?(" \u2014 "+p.stateLabel):"")+(p.holder?(" \u00b7 "+(p.kind==="worn"?"worn by ":"carried by ")+p.holder):"");
        out.push({ key:"p:"+p.id, kind:"image", label:plab, url:u||"", ready:!!u, id:sid,
          assetRole:sid===p.id?"master_reference":"derived_reference",
          assetSourceQuality:sid===p.id?"prop_master_sheet":"prop_state_sheet" });
      });
      // SCENE-WIDE references (user ruling 2026-08-07): the rest of this scene's cast
      // and props — from the OTHER clips' derivations — are offerable too, so the user
      // decides when to combine elements into their own shots. They default OFF
      // (sceneOnly → the extraOn set) and ride the same include/exclude machinery;
      // @mentioning one in a prompt box auto-includes it.
      const _seen = new Set(out.map(a=>a.key));
      (sceneClips||[]).forEach(c2=>{
        const dd = (c2&&c2.data)||{};
        (dd.cast||[]).forEach(c=>{ const k="c:"+c.id; if(_seen.has(k)) return; _seen.add(k);
          const u=imgs[c.id];
          out.push({ key:k, kind:"image", label:c.name+" reference", url:u, ready:!!u, id:c.id, sceneOnly:true,
            assetRole:"master_reference", assetSourceQuality:"character_master_sheet" }); });
        (dd.props||[]).forEach(p=>{ const k="p:"+p.id; if(_seen.has(k)) return; _seen.add(k);
          const sid = p.sheetId || p.id, u = imgs[sid];
          const plab = p.name+(p.stateLabel?(" \u2014 "+p.stateLabel):"")+(p.holder?(" \u00b7 "+(p.kind==="worn"?"worn by ":"carried by ")+p.holder):"");
          out.push({ key:k, kind:"image", label:plab, url:u||"", ready:!!u, id:sid, sceneOnly:true,
            assetRole:sid===p.id?"master_reference":"derived_reference",
            assetSourceQuality:sid===p.id?"prop_master_sheet":"prop_state_sheet" }); });
      });
      // The previous clip stays beat/clip-scoped continuity: it attaches only when
      // this selected beat really follows a rendered clip.
      if(prevVideoSafe) out.push({ key:"prev", kind:"video", label:"Previous clip (continuity)", url:prevVideo, ready:true,
        assetRole:"final_take", assetSourceQuality:"approved_or_current_video_take" });
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
  }, [clip.id, activeShot.id, sourceMode, dialogueAudio, modelId, shotStartFrame, JSON.stringify((storyAssets.halves||[]).map(h=>h.id+":"+!!h.url)), storyAssets.top, storyAssets.bottom, storyAssets.sheet, prevVideo, prevVideoSafe, JSON.stringify(prevVideoMeta||{}), JSON.stringify(d.cast), JSON.stringify(d.props), d.loc&&d.loc.id, d.locSheet&&d.locSheet.id, JSON.stringify((sceneClips||[]).map(c2=>{ const dd=(c2&&c2.data)||{}; return (dd.cast||[]).map(x=>x.id).join(",")+"|"+(dd.props||[]).map(x=>x.id+":"+(x.sheetId||"")).join(","); })), imgs, auds]);

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
  // CHARACTER-level voice groups — the Voices tray adds/removes a speaker's WHOLE
  // voice as a reference in one click (a merged clip can scatter one character's
  // lines across shots). Same speaker resolution as the audio chips above; the
  // per-line toggles stay in the References tray, and both write the same `off`
  // set so the @Audio numbering never disagrees between them.
  const voiceGroups = React.useMemo(()=>{
    const g = [], seen = {};
    (d.lineShots||[]).forEach(sh=>{
      const p = (d.panelLines||[]).find(x=>x.shotId===sh.id);
      const name = (p&&p.speaker&&p.speaker.name) || (sh.lineAudio&&sh.lineAudio.speaker) || "Line";
      if(!seen[name]){ seen[name]={ name, shots:[] }; g.push(seen[name]); }
      seen[name].shots.push(sh);
    });
    return g;
  }, [clip.id, JSON.stringify((d.lineShots||[]).map(s=>s.id+":"+((s.lineAudio&&s.lineAudio.speaker)||""))), JSON.stringify(d.panelLines)]);
  const voiceCharState = (g)=>{
    const voiced = g.shots.filter(sh=>_shotAudioReady(sh, auds));
    if(!voiced.length) return "missing";
    const inc = voiced.filter(sh=>!off.has("a:"+sh.id)).length;
    return inc===voiced.length ? "included" : inc===0 ? "excluded" : "mixed";
  };
  // any line on → remove them all; none on → add them all
  const toggleVoice = (g)=> setOff(s=>{
    const n = new Set(s);
    const keys = g.shots.filter(sh=>_shotAudioReady(sh, auds)).map(sh=>"a:"+sh.id);
    const anyOn = keys.some(k=>!n.has(k));
    keys.forEach(k=>{ anyOn ? n.add(k) : n.delete(k); });
    return n;
  });
  const onAssets = tagged.filter(on);
  const promptRefAssets = tagged.filter(a=>a.kind!=="text" && on(a));
  const promptRefs = stagePromptMentionContext(promptRefAssets, d);
  const promptRefSig = promptRefAssets.map(a=>a.key+":"+stageAssetMention(a)).join("|");
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
  // Shot frames are optional for video: users can render from the prompt alone, or
  // from one available first frame plus other references. Storyboard source modes
  // still block only when that explicit source is selected and missing.
  const sourceReady = sourceMode==="halves" ? sourcePlan.hasHalves
    : sourceMode==="sheet" ? sourcePlan.hasSheet
    : sourceMode==="frames" ? !!(d.shots||[]).some(sh=>imgs[sh.id])
    : true;
  const sourceBlocking = usePanels && !sourceReady;
  const sourceLabel = sourceMeta.label;
  const sourceDisplay = usePanels ? (sourceReady ? sourceLabel : "missing visual source")
    : ((sourceMode==="frames" ? sourceReady : !!(imgs[(d.first||{}).id] || shotStartFrame)) ? sourceLabel : "prompt only");

  // ---- console controls (rendered in the composer pills + the Settings drawer below) ----
  const dialogueSpeakers = _uniq((d.panelLines||[]).filter(p=>p&&p.speaker&&p.speaker.name).map(p=>p.speaker.name));
  const [camera, setCamera] = React.useState(d.camera);
  const [cameraProfile, setCameraProfile] = React.useState(d.cameraProfile || "auto");
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
  const stageCameraProfiles = (window.SHOT_CAMERA_PROFILES && window.SHOT_CAMERA_PROFILES.length)
    ? window.SHOT_CAMERA_PROFILES
    : [{ id:"auto", label:"Project default / None", desc:"do not add camera-body language" }];
  const cameraProfileLine = (cameraProfile && cameraProfile!=="auto" && typeof shotCameraProfilePrompt==="function")
    ? shotCameraProfilePrompt(cameraProfile)
    : "";
  // ONE derived prompt (user ruling 2026-08-02): the recipe TABS are gone — the
  // console always assembles the prompt the way that fits the clip's shape, visual
  // source and model (stageSmartRecipe; Multi-shot's row editor still surfaces
  // automatically when the pick lands on it. `recipe`
  // stays internal state so the clip/source/model effects re-derive it; nothing
  // user-facing sets it anymore.
  const defaultRecipe = ()=> stageSmartRecipe(clip, sourceMode, modelId);
  const [recipe, setRecipe] = React.useState(defaultRecipe);
  // NOTE: the "new clip → reset recipe" effect lives BELOW with the Multi-shot row
  // state — clip.id alone can't key it (see the repack note there).
  React.useEffect(()=>{ setRecipe(defaultRecipe()); }, [sourceMode, modelId]);
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
  // PLAN GATES — per-tier entitlements (plans.jsx): higher plans unlock higher Stage resolution/batch ceilings
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
    setRecipe(defaultRecipe());
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
      const speakerRef = _stagePromptEntityLabel(promptRefs, "speaker", speaker, speaker);
      if(!bySpeaker.has(speakerRef)) bySpeaker.set(speakerRef, []);
      bySpeaker.get(speakerRef).push("@Audio"+(i+1));
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
    // Multi-shot editor compiles to the TIME-CODED prompt (Seedance's segment
    // grammar) — the structured rows are the editor, this is the model payload
    const base = id==="multishot" ? seedanceRecipePrompt("timeline", msClip, msShots, activeShot, audioRefsOn, audioIncluded, promptRefs)
      : seedanceRecipePrompt(id, clip, shownShots, activeShot, audioRefsOn, audioIncluded, promptRefs);
    return (voiceCast && base) ? (voiceCast+"\n\n"+base) : base;
  };
  // per-shot overrides (vidText / dur) and include toggles recompile the prompt live
  const msSig = msAllShots.map(s=>s.id+":"+(s.vidText||"")+":"+(s.dur||"")+":"+(msOff.has(s.id)?0:1)).join("|");
  const beatPrompt = recipeText(recipe);
  const [prompt, setPrompt] = React.useState(beatPrompt);
  // MANUAL EDITS survive input toggles: the derivation only overwrites an untouched
  // box, and "Reset to script" rebuilds from the beat + Art Room design on demand.
  // Refs (not state) so the rebuild effect below always reads the CURRENT flag even
  // on the same render pass that switches beats.
  const promptEditedRef = React.useRef(false);
  const promptKeyRef = React.useRef(STAGE_PROMPT_SCHEMA+"·"+clip.id+"·"+activeShot.id);
  // @-mention autocomplete lives in StagePromptArea (module level) so EVERY prompt
  // box — composer, Director and each multi-shot row — shares the same dropdown +
  // unresolved-token warning. The dropdown offers EVERY ready asset (user ruling
  // 2026-08-07: all scene-level elements reachable from the prompt): included ones
  // under their real token, not-yet-included ones under the PROSPECTIVE token they'd
  // get once included — @tokens number the INCLUDED set only, so picking one
  // auto-includes it (see includeMention) before the token lands in the text.
  const mentionables = (()=>{ const n={image:0,video:0,audio:0}, out=[];
    tagged.forEach(a=>{
      if(a.kind==="text" || n[a.kind]==null) return;
      if(on(a)){ n[a.kind]++;
        out.push({ t:stageAssetMention(a), label:String(a.label||""), kind:a.kind, url:String(a.url||""), key:a.key, included:true }); }
      else if(a.ready)
        out.push({ t:"@"+({image:"Image",video:"Video",audio:"Audio"}[a.kind])+(n[a.kind]+1), label:String(a.label||""), kind:a.kind, url:String(a.url||""), key:a.key, included:false });
    });
    return out; })();
  // picking a NOT-yet-included asset from the dropdown includes it first (its token
  // has no meaning otherwise); returns false — and warns — when the input budget is full
  const includeMention = (m)=>{
    if(!m || m.included!==false) return true;
    const a = tagged.find(x=>x.key===m.key);
    if(!a || !a.ready) return false;
    if(on(a)) return true;
    if(a.locked) return false;
    if(budgetLeft<=0){
      if(typeof window.appToast==="function") window.appToast((model.label||"This model")+" accepts up to "+assetLimit+" inputs — exclude an asset before adding this one.","error");
      return false;
    }
    toggle(a);
    return true;
  };
  const [mentionBox, setMentionBox] = React.useState(null);  // {start, query, hi}
  const promptRef = React.useRef(null);                      // StageMentionEditor imperative API
  const mentionItems = (q)=>{ q=String(q||"").toLowerCase();
    return mentionables.filter(m=>!q || m.t.toLowerCase().indexOf(q)>=0 || m.label.toLowerCase().indexOf(q)>=0).slice(0,8); };
  // the chip editor reports (text, absolute caret offset) — same @-token detection
  // the old textarea did against selectionStart
  const onPromptChange = (text, caret)=>{ const t = String(text||"").slice(0,PANEL_PROMPT_MAX);
    promptEditedRef.current = true;
    setPrompt(t);
    const pos = (caret==null) ? t.length : Math.min(caret, t.length);
    const m = /(?:^|[\s\n])@([A-Za-z0-9]*)$/.exec(t.slice(0, pos));
    setMentionBox(m ? { start:pos-m[1].length-1, query:m[1], hi:0 } : null); };
  const insertMention = (m)=>{ const api=promptRef.current; if(!api||!mentionBox) return;
    if(!includeMention(m)){ setMentionBox(null); return; }
    const tok = m.t;
    const caret = api.caretOffset();
    const next = (prompt.slice(0,mentionBox.start)+tok+" "+prompt.slice(caret)).slice(0,PANEL_PROMPT_MAX);
    const pos = Math.min(mentionBox.start+tok.length+1, next.length);
    promptEditedRef.current = true;
    setPrompt(next); setMentionBox(null);
    requestAnimationFrame(()=>{ try{ api.applyValue(next, pos); }catch(_e){} }); };
  const onPromptKeyDown = (e)=>{ if(!mentionBox) return;
    const items = mentionItems(mentionBox.query);
    if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault();
      setMentionBox(b=>({ ...b, hi:(b.hi+(e.key==="ArrowDown"?1:-1)+Math.max(1,items.length))%Math.max(1,items.length) })); }
    else if((e.key==="Enter"||e.key==="Tab") && items.length){ e.preventDefault();
      insertMention(items[Math.min(mentionBox.hi, items.length-1)]); }
    else if(e.key==="Escape"){ setMentionBox(null); } };
  // tokens that don't resolve to an INCLUDED asset (typo, or the asset was excluded) —
  // prospective tokens of not-yet-included assets deliberately don't count as known
  const badMentions = (()=>{ const known = new Set(mentionables.filter(m=>m.included!==false).map(m=>m.t.toLowerCase()));
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
    // (the take's recipe is deliberately NOT restored — since the tab row went, the
    // prompt assembly is always the smart per-clip derivation; a legacy recipe id
    // would park the composer on a shape the UI can no longer explain.)
    setSeedInput(pendingReuse.pin && m.seed!=null ? String(m.seed) : "");
    if(onReuseConsumed) onReuseConsumed();
    if(typeof window.appToast==="function") window.appToast(pendingReuse.pin
      ? "Settings + seed loaded — Generate now renders a controlled variation of that take."
      : "That take's settings are loaded into the composer.","ok");
  },[pendingReuse]);
  // full-screen preview of the rendered clip — native fullscreen on the <video>, with
  // the in-app lightbox as the fallback when the browser refuses (e.g. embedded frames)
  const playerVideoRef = React.useRef(null);
  const [playerClock, setPlayerClock] = React.useState({ time:0, duration:0, playing:false });
  React.useEffect(()=>{ setPlayerClock({ time:0, duration:0, playing:false }); }, [playerUrl, clip.id]);
  const syncPlayerClock = (playing)=>{
    const v = playerVideoRef.current;
    if(!v){ setPlayerClock({ time:0, duration:0, playing:false }); return; }
    const time = Number.isFinite(v.currentTime) ? v.currentTime : 0;
    const dur = Number.isFinite(v.duration) ? v.duration : 0;
    setPlayerClock({ time, duration:dur, playing: playing==null ? !v.paused : !!playing });
  };
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
  React.useEffect(()=>{
    const key = STAGE_PROMPT_SCHEMA+"·"+clip.id+"·"+activeShot.id;
    if(promptKeyRef.current!==key){ promptKeyRef.current=key; promptEditedRef.current=false; }
    if(!promptEditedRef.current) setPrompt(recipeText(recipe));
    setPerf(dialogueSpeakers[0] || d.lead);
  }, [clip.id, activeShot.id, recipe, dialogueSpeakers.join("|"), d.lead, audioRefsOn, audioIncluded.join("|"), promptRefSig, msSig]);
  React.useEffect(()=>{ setCamera(d.camera); setCameraProfile(d.cameraProfile || "auto"); setLighting(d.lighting); },
    [clip.id, activeShot.id, d.camera, d.cameraProfile, d.lighting]);
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
  const refLines = (endFrameUrl || !modelRefs) ? [] : promptRefAssets.map(a=>stageAssetRole(a, promptRefs)).filter(Boolean);
  // multi-panel sources have a documented bleed failure mode — captions/panel borders
  // can leak into the video unless explicitly negated in the prompt.
  if(refLines.length && usePanels) refLines.push("The storyboard is blocking reference only — do not render its captions, text overlays, panel numbers or panel borders in the output.");
  const refBlock = refLines.length ? ("References:\n"+refLines.join("\n")) : "";

  const [staging,setStaging] = React.useState(false);
  const [prepPct,setPrepPct] = React.useState(0);
  /* gen.cancel only reaches the fal POLL loop — during pre-submit staging it was a
     no-op and the job submitted anyway. This ref is the staging-phase cancel: the
     Cancel-render button sets it, and onGenerate checks it at the one point that
     matters — right before submission, where credits would be spent. */
  const stagingCancelRef = React.useRef(false);
  const onGenerate = async ()=>{
    /* ASSET STAGING (cloud URL refresh, blob→data-url, black-mp4 voice carriers) runs
       BEFORE the hook's gening flag can light — a slow stage looked like a dead click
       and a staging throw was an uncaught rejection with no toast at all. staging
       lights the player/buttons immediately; the outer catch always surfaces. */
    if(staging) return;
    stagingCancelRef.current=false;
    setStaging(true);
    setPrepPct(8);
    try{
    // the start frame leads ONLY when its asset chip is included — an excluded start
    // frame means a promptless-anchor render (prompt + remaining references only),
    // never a silent fallback to some other included image
    const frameAsset = onImages.find(a=>a.url===startFrame) || null;
    const frameUrl = frameAsset ? await stageServerAssetUrl(frameAsset, startFrame || frameAsset.url || "") : "";
    setPrepPct(22);
    const imageEntries = [];
    for(const a of onImages){ if(a===frameAsset) continue; const u=await stageServerAssetUrl(a); if(u) imageEntries.push({ asset:a, url:u }); }
    const imageUrls = imageEntries.map(e=>e.url);
    setPrepPct(38);
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
    setPrepPct(55);
    const controls = [cameraProfileLine, "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+"."]
      .filter(Boolean).join("\n");
    if(assetOver){ if(typeof window.appToast==="function") window.appToast((model.label||"This model")+" accepts up to "+assetLimit+" inputs — exclude a few assets first.","error"); return; }
    if(sourceBlocking){ if(typeof window.appToast==="function") window.appToast("Save this clip's storyboard "+(sourceMode==="sheet"?"sheet":"halves")+" in Storyboards first, or switch Visual source back to shot/prompt rendering.","error"); return; }
    if(needsVoice){ if(typeof window.appToast==="function") window.appToast("Voice this clip's dialogue first — duration and lip-sync are locked to line audio.","error"); return; }
	    if(creditInfo.empty){ if(typeof window.appToast==="function") window.appToast("No generation credits remaining.","error"); return; }
	    const hadTakeBefore = !!((typeof vidGetTakes==="function" && vidGetTakes(beatVideoId).length) || playerUrl || gen.videoUrl);
	    const seedVal = seedInput.trim() ? Number(seedInput.trim()) : undefined;
	    const promptPayload = (refBlock ? (prompt.trim()+"\n\n"+refBlock) : prompt)
	      + (voiceRefLines.length ? (refBlock?"":"\n\nReferences:")+"\n"+voiceRefLines.join("\n") : "");
	    const takeReferences = promptRefAssets.map(a=>({
	      key:a.key||"",
	      tag:stageAssetMention(a),
	      kind:a.kind,
	      label:a.label||stageAssetMention(a),
	      role:stageAssetRole(a, promptRefs),
	      assetRole:a.assetRole || ((typeof nbInferAssetRole==="function") ? nbInferAssetRole({ id:a.id, kind:a.kind==="video"?"video":"asset" }) : ""),
	      assetRoleLabel:a.assetRoleLabel || ((typeof nbAssetRoleLabel==="function") ? nbAssetRoleLabel(a.assetRole || ((a.kind==="video") ? "final_take" : "")) : ""),
	      assetRolePriority:a.assetRolePriority || ((typeof nbAssetRolePriority==="function") ? nbAssetRolePriority(a.assetRole || ((a.kind==="video") ? "final_take" : "")) : 0),
	      assetSourceQuality:a.assetSourceQuality || "",
	      url:(a.kind==="text"||a.kind==="audio") ? "" : (a.url||"")
	    })).concat(voiceRefLines.map((l,i)=>({
	      tag:"@Video"+(videoUrls.length-voiceRefLines.length+i+1),
	      kind:"video",
	      label:"Voice carrier",
	      role:l,
	      assetRole:"final_take",
	      assetRoleLabel:(typeof nbAssetRoleLabel==="function") ? nbAssetRoleLabel("final_take") : "Final take",
	      assetRolePriority:(typeof nbAssetRolePriority==="function") ? nbAssetRolePriority("final_take") : 100,
	      url:""
	    })));
	    // Multi-shot rows ride the payload as structured segments — models with native
	    // multi-shot-capable providers can render these per-shot; Seedance uses the
	    // compiled micro-beat director prompt text.
    const multiShot = recipe==="multishot" ? msShots.map(sh=>{
      const p = msPanelLines.find(x=>x.shotId===sh.id) || {};
      const text = String(sh.vidText||"").trim() || String(p.text||"").trim();
      // bake the screenplay words into each native row — the row text paraphrases the
      // moment (micro-beat canon); without the quoted line the per-shot prompt would
      // have the model improvise the dialogue.
      const dlg = _seedanceDialogueClause(sh, p, { ...d, audioRefsOn, audioIncluded }, promptRefs);
      // …but not twice: a hand-written row (vidText) that already quotes the line
      // keeps its own phrasing instead of getting a second "says" appended.
      const words = String((p&&p.dialogue) || sh.dialogue||"").trim().replace(/^["“]|["”]$/g,"");
      const dup = !!(words && text) && _normStageText(text).indexOf(_normStageText(words))>=0;
      return { prompt:text+((dlg && !dup)?(" — "+dlg):""), duration:Math.max(1, Math.round(Number(sh.dur) || (typeof shotDur==="function" ? shotDur(sh) : 3))) };
    }).filter(s=>s.prompt) : undefined;
    const payload = { frameUrl, imageUrls, videoUrls, audioUrls, prompt:promptPayload, controls, multiShot,
      durationMs:duration*1000, aspectRatio:effAspect||"auto", fast:!!tierObj.fast, resolution,
      seed:seedVal, generateAudio: hasDialogue ? true : nativeAudio,   // audio track must stay ON for the lip-synced line to be heard
      bitrateMode:bitrate,
      falModel: tierObj.falModel || undefined,   // non-Seedance engines (Sora 2) name their fal endpoint per tier
      // facts the Versions view shows per take — stamped into the take's meta at commit
	      takeMeta:{ source:sourceMode, tier:tierObj.id, tierLabel:tierObj.label, resolution, bitrate, recipe,
	        assetRole:"final_take", assetRoleLabel:(typeof nbAssetRoleLabel==="function") ? nbAssetRoleLabel("final_take") : "Final take",
	        cameraProfile:cameraProfile, cameraProfileLabel:(cameraProfile!=="auto" ? ((stageCameraProfiles.find(x=>x.id===cameraProfile)||{}).label||cameraProfile) : ""),
	        audio: hasDialogue ? (voiceLocked ? "voice" : "native") : (nativeAudio ? "native" : "silent"),
	        inputs: counts.text+" text · "+counts.images+" img · "+counts.videos+" vid · "+counts.audio+" aud",
	        durationSec: duration, references: takeReferences },
      // start→end transitions render on the dedicated i2v endpoint, which needs BOTH
      // frames — with the start frame excluded, the end frame quietly stands down
      endImageUrl: (frameUrl ? endFrameUrl : "") || undefined, force:true };
    // cancelled while staging? Bail BEFORE submission — nothing was spent yet.
    if(stagingCancelRef.current){ if(typeof window.appToast==="function") window.appToast("Render cancelled.","info"); return; }
    try{
      setPrepPct(70);
      setStaging(false);
      // batch: N parallel jobs with distinct seeds, every completion lands as a take
      const runPayload = (p)=> batchN>1 && typeof gen.generateBatch==="function"
        ? gen.generateBatch(p, batchN)
        : gen.generate(p).then(r=>[r]);
      let results;
      try{ results = await runPayload(payload); }
      catch(e){
        const msg = String((e&&e.message)||e||"");
        const charEntries = imageEntries.filter(en=>String(en&&en.asset&&en.asset.key||"").indexOf("c:")===0);
        if(!(typeof window.vidLikenessError==="function" && window.vidLikenessError(msg) && charEntries.length)) throw e;
	        const keptEntries = imageEntries.filter(en=>String(en&&en.asset&&en.asset.key||"").indexOf("c:")!==0);
	        const oldAssetsForTags = [frameAsset, ...imageEntries.map(en=>en.asset)].filter(Boolean);
	        const keptAssetsForTags = [frameAsset, ...keptEntries.map(en=>en.asset)].filter(Boolean);
	        const keptImageTags = new Map();
	        keptAssetsForTags.forEach((a,i)=>keptImageTags.set(stageAssetMention(a), "@Image"+(i+1)));
	        const fallbackReferences = takeReferences
	          .filter(r=>String(r&&r.key||"").indexOf("c:")!==0)
	          .map(r=>{
	            if(r&&r.kind==="image"&&keptImageTags.has(r.tag)){
	              const nextTag = keptImageTags.get(r.tag);
	              return { ...r, tag:nextTag, role:String(r.role||"").replace(String(r.tag||""), nextTag) };
	            }
	            return r;
	          });
	        const fallbackPayload = { ...payload,
	          imageUrls: keptEntries.map(en=>en.url),
	          prompt: stageRemapImageMentionPayload(promptPayload, oldAssetsForTags, keptAssetsForTags),
	          takeMeta:{ ...(payload.takeMeta||{}), safetyFallback:"dropped character refs",
	            references: fallbackReferences } };
        if(typeof window.appToast==="function") window.appToast("Seedance flagged a character reference; retrying with the shot frame plus non-character references.","info");
        results = await runPayload(fallbackPayload);
      }
      const fresh = results.filter(r=>r && !r.cached);
      const lastWithSeed = results.filter(r=>r && r.seed!=null).slice(-1)[0];
      if(lastWithSeed) setLastSeed(lastWithSeed.seed);
      // record the spend (supabase/credits.sql) for the takes that actually rendered
      if(fresh.length && typeof window.cloudSpendCredit==="function"){ try{ await window.cloudSpendCredit(renderCost*fresh.length); }catch(_e){} }
      try{ window.dispatchEvent(new CustomEvent("turn-credits-changed",{ detail:{ reason:"stage-video-render", cost:renderCost*Math.max(1,fresh.length) } })); }catch(_e){}
      if(!hadTakeBefore && results.some(r=>r) && onFirstVideo) setTimeout(()=>onFirstVideo(), 0);
      if(typeof window.appToast==="function") window.appToast("Clip "+beatLabel+" — "+results.length+" take"+(results.length!==1?"s":"")+" rendered","ok");
    }catch(e){ if(typeof window.appToast==="function") window.appToast(stageFriendlyVideoError(e),"error"); }
    }catch(e){ if(typeof window.appToast==="function") window.appToast(stageFriendlyVideoError(e)||"Video render failed.","error"); }
    finally{ setStaging(false); setPrepPct(0); }
  };
  const onExtend = async ()=>{
    if(!playerUrl) return;
    if(creditInfo.empty){ if(typeof window.appToast==="function") window.appToast("No generation credits remaining.","error"); return; }
    const controls = [cameraProfileLine, "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+"."]
      .filter(Boolean).join("\n");
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
    }catch(e){ if(typeof window.appToast==="function") window.appToast(stageFriendlyVideoError(e),"error"); }
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
  const gening = staging || gen.gening;   // staging = pre-submit asset prep — a slow stage must not look like a dead click
  const genBusyLabel = staging ? ("Preparing inputs · "+Math.max(1, Math.min(99, Math.round(prepPct||1)))+"%") : (stageStatusLabel(gen.status)||"Rendering…");
  const genBusySub = staging ? "Preparing selected references for Seedance…" : ((model.label||"The model")+" is generating this clip…");
  // the poll loop bakes "· NN%" into the status string — lift it back out for the bar
  const genPctMatch = gening ? String(genBusyLabel).match(/(\d{1,3})%/) : null;
  const genPct = genPctMatch ? Math.min(100, Number(genPctMatch[1])) : null;
  const genErr = stageFriendlyVideoError(gen.err);
  const playerClockDuration = playerUrl ? (playerClock.duration || duration || 0) : 0;
  const playerClockFill = playerUrl && playerClockDuration
    ? Math.max(0, Math.min(100, (playerClock.time/playerClockDuration)*100))
    : 0;
  const playerClockLabel = _stageClock(playerUrl ? playerClock.time : 0)+" / "+_stageClock(playerClockDuration);
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
    ["Source", sourceDisplay],
    ["Audio", hasDialogue
      ? (!modelAudioRefs ? "native — the model voices the lines"
        : voiceLocked ? (voiceReady ? "locked voice" : "needs voice")
        : "native performance — swap voices in post")
      : "native / silent"]
  ];
  const promptChips = [
    ["subject", perf || d.lead || "selected performer"],
    ["micro-beats", (activePanel.micro&&activePanel.micro.length)
      ? activePanel.micro.map((m,i)=>(i+1)+") "+m).join("; ")
      : (_firstWords(activeShot&&activeShot.action, 8) || "clip action")],
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
          // what this model is best at — the selection aid under each option
          desc:m.bestFor,
          meta:[ m.metaRes && { icon:Icon.diamond||Icon.image, label:m.metaRes },
                 m.metaDur && { icon:Icon.clock, label:m.metaDur } ].filter(Boolean) };
      }),
      // how to prompt the CURRENTLY SELECTED model — sits at the bottom of the
      // dropdown so the guidance is one click away while writing the prompt
      foot: model.promptFormula && _stEl(React.Fragment,null,
        _stEl("b",null,"Prompt formula — "), model.promptFormula),
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
    _stEl("b",{className:"stage2-tray-h"},
      trayOpen==="elems" ? "ELEMENTS — cast · location · props"
      : trayOpen==="voices" ? "VOICES — a character's recorded lines as references"
      : "REFERENCES — every derived input"),
    trayOpen==="voices" && dialogueAudio!=="locked"
      ? _stEl("div",{className:"stage2-tray-empty"},"Audio is set to Native performance — the model voices the lines itself. Switch Audio (Render settings → Timing & sound) to Locked voice to attach your recorded lines.")
    : trayOpen==="voices"
      ? (voiceGroups.length ? voiceGroups.map(g=>{
          const st = voiceCharState(g);
          const voicedN = g.shots.filter(sh=>_shotAudioReady(sh, auds)).length;
          return _stEl("div",{key:g.name,className:"stage2-tray-row"+(st==="included"||st==="mixed"?" on":"")+(st==="missing"?" missing":"")},
            _stEl("button",{type:"button",className:"stage2-tray-main",disabled:st==="missing",
              title: st==="missing" ? "No recorded voice for "+g.name+" in this clip yet — voice the line first"
                : st==="included" ? g.name+"'s voice is a reference — click to remove"
                : "Add "+g.name+"'s voice as a reference",
              onClick:()=>toggleVoice(g)},
              _stEl("span",{className:"stage2-tray-thumb"}, Icon.mic&&_stEl(Icon.mic,{s:12})),
              _stEl("span",{className:"stage2-tray-name"}, g.name),
              _stEl("small",null, voicedN+" of "+g.shots.length+" line"+(g.shots.length!==1?"s":"")+" voiced"),
              _stEl("span",{className:"stage2-tray-state"},
                st==="included"?"Included":st==="excluded"?"Excluded":st==="mixed"?"Partial":"No voice")));
        }) : _stEl("div",{className:"stage2-tray-empty"},"No dialogue in this clip — nothing to voice."))
    : trayAssets.length
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
  // (the recipe ↔ inputs mismatch hints died with the tab row — the smart per-clip
  // derivation can't produce those mismatches, and the hints told users to switch
  // tabs that no longer exist.)
  // ---- what's blocking Generate, in priority order. The FIRST one renders as a
  // prominent actionable banner (not a modal — this is persistent state, and a popup
  // would re-interrupt on every visit); clicking the blocked Generate button shakes
  // and scrolls to it. Where a one-click fix exists, the banner carries the button. ----
  const blockers = [];
  if(needsVoice) blockers.push({ key:"voice",
    text:"Voice this clip before rendering — duration and lip-sync lock to the line audio.",
    actionLabel: onVoiceLine ? (voicingClip ? "Voicing…" : "Voice clip now") : null,
    action:onVoiceClip, busy:voicingClip });
  if(sourceBlocking) blockers.push({ key:"source",
    text:"No storyboard source is ready yet — save this clip's "+(sourceMode==="sheet"?"sheet":"halves")+" in Storyboards, or switch Visual source back to shot/prompt rendering." });
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
  const onSeedanceGenerateClick = ()=>{
    if(gening) return;
    if(blocker){ onBlockedGenerate(); return; }
    onGenerate();
  };
  const [sdMenu, setSdMenu] = React.useState(null);
  const sdBarRef = React.useRef(null);
  React.useEffect(()=>{
    if(!sdMenu) return;
    const close = (e)=>{ if(sdBarRef.current && sdBarRef.current.contains(e.target)) return; setSdMenu(null); };
    const esc = (e)=>{ if(e.key==="Escape") setSdMenu(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return ()=>{ document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [sdMenu]);
  React.useEffect(()=>{ setSdMenu(null); }, [clip.id]);
  const insertToolbarMention = (tok)=>{
    tok = String(tok||"").trim();
    if(!tok) return;
    const api = promptRef.current;
    const cur = String(prompt||"");
    let pos = api && api.caretOffset ? api.caretOffset() : cur.length;
    if(!Number.isFinite(pos)) pos = cur.length;
    pos = Math.max(0, Math.min(cur.length, pos));
    const before = cur.slice(0,pos), after = cur.slice(pos);
    const leftSpace = before && !/[\s([]$/.test(before) ? " " : "";
    const rightSpace = after && !/^[\s.,;:!?)]/.test(after) ? " " : "";
    const next = (before+leftSpace+tok+rightSpace+after).slice(0, PANEL_PROMPT_MAX);
    const nextPos = Math.min((before+leftSpace+tok+rightSpace).length, next.length);
    promptEditedRef.current = true;
    setPrompt(next);
    setMentionBox(null);
    requestAnimationFrame(()=>{ try{ api && api.applyValue && api.applyValue(next, nextPos); }catch(_e){} });
  };
  const sourceUiOptions = [
    { id:"auto", label:"Omni reference", desc:"Auto-pick the best references for this beat.", onPick:()=>setSourceOverride("auto") },
    { id:"frame", label:"First frame", desc:"Use one start frame when it exists, or render from prompt alone.", onPick:()=>{ setSourceOverride("frame"); setEndFrameId(""); } },
    { id:"first-last", label:"First and last frame", desc:"Animate from this beat into a chosen end frame.", disabled:!endFrameAvailable,
      note:endFrameAvailable ? "" : "No compatible end frame",
      onPick:()=>{ setSourceOverride("frame"); if(!endFrameId && endFrameCandidates[0]) setEndFrameId(endFrameCandidates[0].id); } },
    { id:"frames", label:"Reference frames", desc:"Attach each ready shot frame as a Seedance reference image.", disabled:(d.shots||[]).length<2, onPick:()=>setSourceOverride("frames") },
    { id:"halves", label:"Storyboard half", desc:"Use the saved sheet half as a reference image.", disabled:!sourcePlan.hasHalves, note:sourcePlan.hasHalves ? "" : "No saved half", onPick:()=>setSourceOverride("halves") },
    { id:"sheet", label:"Storyboard sheet", desc:"Use the saved full 2x2 sheet as a reference image.", disabled:!sourcePlan.hasSheet, note:sourcePlan.hasSheet ? "" : "No saved sheet", onPick:()=>setSourceOverride("sheet") },
  ];
  const sourceUiLabel = endFrameUrl ? "First and last frame"
    : sourceOverride==="auto" ? "Omni reference"
    : sourceMode==="frames" ? "Reference frames"
    : sourceMode==="frame" ? "First frame"
    : sourceMode==="halves" ? "Storyboard half"
    : sourceMode==="sheet" ? "Storyboard sheet"
    : sourceMeta.pick || sourceMeta.label || "Omni reference";
  const sdPill = (key, cls, title, body, popover)=>_stEl("div",{className:"sdbar-anchor"+(sdMenu===key?" open":"")},
    _stEl("button",{type:"button",className:"sdbar-pill "+(cls||""),title,
      onClick:(e)=>{ e.stopPropagation(); setSdMenu(m=>m===key?null:key); }},
      body, _stEl("span",{className:"sdbar-chevron"},"⌄")),
    sdMenu===key && popover);
  const sdOption = (o)=>_stEl("button",{key:o.id||o.value,type:"button",
      className:"sdbar-option"+(o.selected?" on":"")+(o.disabled?" disabled":""),
      disabled:!!o.disabled,
      title:o.note||o.desc||o.label,
      onClick:()=>{ if(o.disabled) return; o.onPick&&o.onPick(o.value||o.id); setSdMenu(null); }},
      _stEl("span",{className:"sdbar-option-main"},
        _stEl("b",null,o.label),
        o.selected && _stEl("span",{className:"sdbar-option-check"},"✓"),
        o.beta && _stEl("small",{className:"sdbar-beta"},"Beta")),
      o.desc && _stEl("span",{className:"sdbar-option-desc"},o.desc),
      o.note && _stEl("small",{className:"sdbar-option-note"},o.note));
  const durationMin = durationLocked ? Math.max(1, Math.ceil(measuredSec||1)) : 1;
  const durationMax = Math.max(durationMin, model.maxClipSec||15);
  const seedanceToolbar = _stEl("div",{ref:sdBarRef,className:"sdbar",onMouseDown:e=>e.stopPropagation()},
    _stEl("div",{className:"sdbar-left"},
      sdPill("model","model","Video model",
        _stEl(React.Fragment,null, Icon.cube&&_stEl(Icon.cube,{s:13}), _stEl("span",null,model.label), Icon.sparkles&&_stEl(Icon.sparkles,{s:10})),
        _stEl("div",{className:"sdbar-pop sdbar-pop-wide"},
          SEEDANCE_MODELS.map(m=>{
            const planLocked = m.status==="active" && !planAllowsModel(m.id);
            return sdOption({ id:m.id, label:m.label, selected:modelId===m.id, disabled:m.status!=="active",
              desc:m.bestFor, note:m.status!=="active" ? m.note : (planLocked ? "Director plan required" : ""),
              onPick:()=>{ if(planLocked){ openPlansUpsell(); return; }
                modelTouchedRef.current = true; setModelId(m.id);
                const t0=seedanceTierOf(m,tier); if(t0) setTier(t0.id); } });
          }))),
      sdPill("source","source","Reference mode",
        _stEl(React.Fragment,null, Icon.layers&&_stEl(Icon.layers,{s:13}), _stEl("span",null,sourceUiLabel)),
        _stEl("div",{className:"sdbar-pop sdbar-pop-wide"},
          sourceUiOptions.map(o=>sdOption({ ...o, selected:o.id==="auto" ? sourceOverride==="auto" : (o.id==="first-last" ? !!endFrameUrl : sourceOverride===o.id) })))),
      sdPill("format","format","Aspect ratio and resolution",
        _stEl(React.Fragment,null, Icon.monitor&&_stEl(Icon.monitor,{s:13}), _stEl("span",null,effAspect), _stEl("span",{className:"sdbar-muted"},String(resolution).toUpperCase())),
        _stEl("div",{className:"sdbar-pop sdbar-pop-format"},
          _stEl("label",null,"Aspect ratio"),
          _stEl("div",{className:"sdbar-grid six"},
            ["21:9","16:9","4:3","1:1","3:4","9:16"].map(a=>_stEl("button",{key:a,type:"button",className:a===effAspect?"on":"",
              onClick:()=>{ setAspectOverride(a); setSdMenu(null); }}, _stEl("span",{className:"sdbar-ratio-ico ratio-"+a.replace(":","x")}), a))),
          _stEl("label",null,"Resolution"),
          _stEl("div",{className:"sdbar-grid three"},
            STAGE_RESOLUTIONS.map(r=>{
              const planLocked = stageResAllowed(tierObj, r) && !planAllowsRes(r);
              const disabled = !stageResAllowed(tierObj, r);
              return _stEl("button",{key:r,type:"button",className:(r===resolution?"on ":"")+(planLocked?"plan-locked":""),
                disabled:disabled && !planLocked,
                title:planLocked ? planResNote(r)+" — click to upgrade" : (disabled ? (r+" isn't available on "+model.label) : r),
                onClick:()=>{ if(planLocked){ openPlansUpsell(); return; } if(disabled) return; setResolution(r); setSdMenu(null); }},
                String(r).toUpperCase(), (r==="1080p"||r==="4K") && Icon.sparkles&&_stEl(Icon.sparkles,{s:10}));
            })))),
      sdPill("duration","duration","Duration",
        _stEl(React.Fragment,null, Icon.clock&&_stEl(Icon.clock,{s:13}), _stEl("span",null,_fmtSecs(duration))),
        _stEl("div",{className:"sdbar-pop sdbar-pop-duration"},
          _stEl("label",null,"Total duration"),
          _stEl("input",{type:"range",min:durationMin,max:durationMax,step:1,value:Math.round(duration),
            title:durationLocked ? "Minimum locked to voiced line timing" : "Clip duration",
            onChange:e=>setDurationOverride(Number(e.target.value))}),
          _stEl("div",{className:"sdbar-duration-row"}, _stEl("span",null,"0"), _stEl("span",null,"5"), _stEl("span",null,"10"), _stEl("span",null,String(durationMax))),
          _stEl("b",null,_fmtSecs(duration)))),
      sdPill("mention","mention","Mention references",
        _stEl(React.Fragment,null,_stEl("span",{className:"sdbar-at"},"@")),
        _stEl("div",{className:"sdbar-pop sdbar-pop-mention"},
          _stEl("label",null,'Use "@" to mention'),
          mentionables.length
            ? _stEl("div",{className:"sdbar-mention-list"},
                mentionables.slice(0,8).map(m=>_stEl("button",{key:m.t,type:"button",onClick:()=>{ insertToolbarMention(m.t); setSdMenu(null); }},
                  m.kind==="image" && m.url ? _stEl("img",{src:m.url,alt:""}) : _stEl("span",{className:"tile"},m.kind==="audio"?"♪":"▸"),
                  _stEl("span",null,_stEl("b",null,m.t), _stEl("small",null,m.label)))))
            : _stEl("div",{className:"sdbar-empty"},"No included references yet."),
          _stEl("div",{className:"sdbar-addbox"},
            _stEl("button",{type:"button",onClick:()=>{ if(window.appToast) window.appToast("Upload new references from the Art Room asset tabs."); }},"↑ Upload from device"))))),
    _stEl("div",{className:"sdbar-right"},
      _stEl("span",{className:"sdbar-cost",title:renderCostTitle+". "+creditInfo.title}, Icon.sparkles&&_stEl(Icon.sparkles,{s:11}), composerCredit),
      _stEl("button",{type:"button",className:"sdbar-send"+(blocker?" blocked":"")+(gening?" working":""),
        title:blocker ? (blocker.text+" (click to see why)") : renderCostTitle,
        "aria-disabled":blocker?"true":undefined,
        disabled:gening,
        onClick:onSeedanceGenerateClick}, gening ? "…" : "↑")));
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
    // (the recipe TAB row is gone — user ruling 2026-08-02: ONE derived prompt.
    // The smart per-clip pick assembles screenplay text + Art Room cinematography;
    // the Multi-shot row editor below surfaces automatically when the pick lands on it.)
    // MULTI-SHOT editor — structured rows over the ACTIVE BEAT's shots
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
        const canon = String(sh.vidText||"").trim() || stageShotMicroPromptText(scene, drafts, beatsMap, sh, 0) || String(p.text||"").trim();
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
        return _stEl("div",{key:sh.id,"data-ms-shot":sh.id,className:"stage2-ms-row"+(sh.id===activeShot.id?" on":"")+(included?"":" off")+(folded?" folded":"")},
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
          !folded && _stEl(StagePromptArea,{className:"stage2-ms-text"+(edited?" edited":""),rows:3,fill:true,
            placeholder:"Describe the shot — who is where and what is happening.",
            value: edited ? String(sh.vidText) : canon,
            maxLength:500,mentionables,onMentionPick:includeMention,
            setValue:(v)=>{ if(!onUpdateShot) return;
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
            onClick:fit},"Fit to "+cap+"s"));
      })(),
      _stEl("div",{className:"stage2-ms-hint"},"One row = one shot. Edit the text freely — it shapes the video prompt only; Generate renders these rows as one continuous Seedance clip. (Add or remove shots on the Art Room's Shots tab.)")),
    _stEl("div",{className:"stage2-gen-row"+(recipe==="multishot"?" ms":"")},
    _stEl("div",{className:"stage2-gen-box"+(recipe==="multishot"?" ms-mode":"")},
      // in Multi-shot mode the ROWS are the prompt editor — the compiled text is
      // hidden (it still compiles and renders; switch to Timeline to read it)
      // composer uses the CHIP editor (resolved @tokens render as inline chips);
      // other prompt boxes (Director, multi-shot rows) keep the shared StagePromptArea
      recipe!=="multishot" && _stEl("div",{className:"stage2-gen-promptwrap"},
        _stEl(StageMentionEditor,{apiRef:promptRef, value:prompt, mentionables,
          maxLen:PANEL_PROMPT_MAX, placeholder:"Describe the video you want to create…",
          onChange:onPromptChange, onKeyDown:onPromptKeyDown,
          onBlur:()=>setTimeout(()=>setMentionBox(null),120)}),
        // edited away from the derivation → offer the way back to the script
        prompt!==beatPrompt && _stEl("button",{type:"button",className:"stage2-prompt-reset",
          title:"Rebuild this prompt from the screenplay beat and the Art Room shot design — discards manual edits",
          onClick:()=>{ promptEditedRef.current=false; setPrompt(beatPrompt); }},
          "↺ Reset to script"),
        badMentions.length>0 && _stEl("div",{className:"stage2-mention-warn"},
          "⚠ "+badMentions.join(", ")+" — not among this render's included assets; the model will guess. Fix the token or include the asset."),
        mentionBox && mentionItems(mentionBox.query).length>0 && _stEl("div",{className:"stage2-mention-box"},
          mentionItems(mentionBox.query).map((m,i)=>_stEl("button",{key:m.t+":"+(m.key||""),type:"button",
            className:"stage2-mention-item"+(i===mentionBox.hi?" hi":""),
            title: m.included===false ? m.label+" — not among this render's inputs yet; picking it includes it" : undefined,
            onMouseDown:e=>{ e.preventDefault(); insertMention(m); }},
            // thumbnail, Seedance-style: the asset's image, or a glyph tile for video/audio
            m.kind==="image" && m.url
              ? _stEl("img",{className:"stage2-mention-thumb",src:m.url,alt:""})
              : _stEl("span",{className:"stage2-mention-thumb tile"},
                  m.kind==="video" ? (Icon.film&&_stEl(Icon.film,{s:13})) : (Icon.mic&&_stEl(Icon.mic,{s:13}))),
            _stEl("span",{className:"stage2-mention-main"},
              _stEl("b",null,m.t), m.label && _stEl("span",{className:"stage2-mention-label"},m.label)),
            _stEl("span",{className:"stage2-mention-kind"},
              (m.kind==="image"?"Image":m.kind==="video"?"Video":"Audio")+(m.included===false?" · add":"")))))),
      seedanceToolbar)),
      // (cancelling an in-flight render lives in the Render settings panel — "Cancel render";
      //  the REFERENCES-added-at-render preview lives in the panel's Inputs tab)
    (blocker || genErr || soundCueMissing || !modelRefs
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
      _stEl("div",{className:"stage2-clip-slug",title:beatName||""}, beatLabel+" · ",
        _stEl("span",{className:"stage2-clip-loc"}, stageScenePlace(scene)))),
      // take switching & management live in the room's Versions view (the tab above) —
      // the clip head is just the slug (full screen is a double-click on the video)
    // player
    _stEl("div",{className:"stage2-player",style:_stageAspectCss(aspect)},
      playerUrl
        ? _stEl("video",{ref:playerVideoRef,src:playerUrl,poster:shotStartFrame||undefined,controls:true,playsInline:true,
            title:"Double-click for full screen",onDoubleClick:playerFullscreen,
            onLoadedMetadata:()=>syncPlayerClock(false),onTimeUpdate:()=>syncPlayerClock(),
            onPlay:()=>syncPlayerClock(true),onPause:()=>syncPlayerClock(false),onEnded:()=>syncPlayerClock(false)})
        : _stEl("div",{className:"stage2-player-empty"},
            _stEl("span",{className:"stage2-player-playring"+(gening?" busy":"")}, Icon.play&&_stEl(Icon.play,{s:22})),
            _stEl("div",{className:"stage2-player-msg"}, gening ? genBusyLabel : "Not rendered yet"),
            gening && genPct!=null && _stEl("div",{className:"stage2-player-bar",role:"progressbar",
                "aria-valuenow":genPct,"aria-valuemin":0,"aria-valuemax":100,"aria-label":"Render progress"},
              _stEl("div",{className:"stage2-player-bar-fill",style:{width:genPct+"%"}})),
            _stEl("div",{className:"stage2-player-sub"}, gening ? genBusySub : "Generate this clip to create the video"))),
    _stEl("div",{className:"stage2-ruler"+(playerUrl?" has-video":" empty")},
      _stEl("div",{className:"stage2-ruler-track"},
        _stEl("div",{className:"stage2-ruler-fill",style:{width:playerClockFill+"%"}})),
      _stEl("span",{className:"stage2-ruler-dur"}, playerClockLabel)),
    // filmstrip below the player — approved takes for THIS selected clip, newest first.
    _stEl("div",{className:"stage2-timeline"},
      _stEl("button",{type:"button",className:"stage2-time-arrow",title:"Previous clip",
        disabled:clipsInScene.findIndex(c=>c.id===clip.id)<=0,
        onClick:()=>{ const i=clipsInScene.findIndex(c=>c.id===clip.id); if(i>0) onSelectClip&&onSelectClip(clipsInScene[i-1].id); }},
        Icon.chevL&&_stEl(Icon.chevL,{s:14})),
      _stEl("div",{className:"stage2-time-track"},
        _stEl("div",{className:"stage2-time-ruler"},
          [0,2,4,6,8].map(n=>_stEl("span",{key:n,className:n===2?"on":""},"00:"+_pad2(n)))),
        _stEl("div",{className:"stage2-time-cards"},
          (()=>{ if(!approvedVisibleTakes.length) return _stEl("div",{className:"stage2-time-empty"},
              "No approved videos yet — review this clip in Takes and approve the one that should live here.");
            return approvedVisibleTakes.map((t,i)=>{
              const m = (t&&t.meta)||{};
              const active = (activeTakeUrl || playerUrl)===t.url;
              const shotCount = (d.shots||[]).length;
              const label = _stageTakeVno(t, visibleTakes, visibleTakes.indexOf(t));
              return _stEl("button",{key:t.id||t.url,type:"button",className:"stage2-time-card rendered"+(active?" on":""),
                onClick:()=>setActiveTakeUrl(t.url),title:beatLabel+" · "+label+" · "+(_stageAgo(m.createdAt)||"rendered")},
                _stEl("div",{className:"stage2-time-thumb"},
                  _stEl("video",{src:t.url+"#t=0.1",muted:true,playsInline:true,preload:"metadata"}),
                  shotCount>1 && _stEl("span",{className:"stage2-time-merge",title:shotCount+" shots merged into this clip"}, "×"+shotCount),
                  _stEl("span",{className:"stage2-time-play"},Icon.play&&_stEl(Icon.play,{s:12}))),
                _stEl("div",{className:"stage2-time-meta"},
                  _stEl("b",null,label+" "+(i===0?"Newest":"")),
                  _stEl("span",null,[m.durationSec?_fmtSecs(m.durationSec):_fmtSecs(d.dur), m.resolution].filter(Boolean).join(" · ")))); }); })())),
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
      _stEl(StagePromptArea,{className:"stage2-director-text",value:prompt,setValue:setPrompt,
        mentionables,onMentionPick:includeMention,fill:true,placeholder:"Describe the video you want to create…",maxLength:PANEL_PROMPT_MAX}),
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
    (sourceBlocking || assetOver || genErr || needsVoice || creditInfo.empty) && _stEl("div",{className:"stage2-assets-warnings"},
      needsVoice && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), "Voice this clip before rendering so timing and lip-sync stay locked."),
      sourceBlocking && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), "No storyboard source is ready yet."),
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
        (Icon.userScan||Icon.user)&&_stEl(Icon.userScan||Icon.user,{s:13}),"Elements"),
      hasDialogue && modelAudioRefs && _stEl("button",{type:"button",className:trayOpen==="voices"?"on":"",
        title:"Add or remove a character's recorded voice as a reference for this render",
        onClick:(e)=>openTray("voices", e)},
        Icon.mic&&_stEl(Icon.mic,{s:13}),
        "Voices ("+voiceGroups.filter(g=>voiceCharState(g)!=="excluded"&&voiceCharState(g)!=="missing").length+"/"+voiceGroups.length+")")),
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
    _ctrlRow("Camera profile", _stEl("select",{value:cameraProfile,onChange:e=>setCameraProfile(e.target.value),
        title:"Optional capture-style hint only — it does not override the Art Room Style Preset"},
      stageCameraProfiles.map(v=>_stEl("option",{key:v.id,value:v.id,title:v.desc||""},v.label)))),
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
      sourceBlocking && _stEl("div",{className:"stage2-err sd-gen-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), "No storyboard source is ready yet."),
      assetOver && _stEl("div",{className:"stage2-err sd-gen-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), "Asset budget is over by "+budgetOverBy+". Exclude optional assets in the center panel."),
      creditInfo.empty && _stEl("div",{className:"stage2-err sd-gen-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), "No generation credits remaining."),
      gening
        ? _stEl("div",{className:"stage2-gen-busy sd-gen-busy"},
            _stEl("div",{className:"stage2-gen-prog"}, _stEl("div",{className:"orb"}), genBusyLabel),
            _stEl("button",{className:"sd-gen-cancel",type:"button",onClick:()=>{ stagingCancelRef.current=true; gen.cancel(); }},"Cancel render"))
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

  const lightbox = maxImg && (maxImg.kind==="video"
    ? _stEl("div",{className:"stage2-lightbox",onClick:()=>setMaxImg(null)},
        _stEl("button",{className:"stage2-lightbox-x",title:"Close",onClick:()=>setMaxImg(null)}, Icon.x&&_stEl(Icon.x,{s:18})),
        _stEl("video",{className:"stage2-lightbox-media",src:maxImg.url,controls:true,autoPlay:true,playsInline:true,onClick:(e)=>e.stopPropagation()}),
        maxImg.label && _stEl("div",{className:"stage2-lightbox-cap"}, maxImg.label))
    : _stEl("div",{className:"lb-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) setMaxImg(null); }},
        _stEl("div",{className:"lb-panel"},
          _stEl("div",{className:"lb-head"},
            _stEl("span",{className:"lb-title"}, maxImg.label || "Image preview"),
            _stEl("button",{className:"ag-x",title:"Close",onClick:()=>setMaxImg(null)}, Icon.x&&_stEl(Icon.x,{s:17}))),
          _stEl("div",{className:"lb-imgwrap"},
            _stEl("img",{className:"lb-img",src:maxImg.url,alt:maxImg.label||"full view"})))));
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
function _stageTakeRefs(meta){
  const refs = (meta&&Array.isArray(meta.references)) ? meta.references : [];
  return refs.filter(r=>r&&r.label).slice(0,40);
}
function _stagePromptCopy(txt){
  txt = String(txt||"");
  if(!txt) return;
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt);
      if(window.appToast) window.appToast("Prompt copied.","ok");
    }
  }catch(e){}
}
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
  const selRefs = _stageTakeRefs(selMeta);
  const selPrompt = String(selMeta.prompt||"").trim();
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
    ["Camera profile", selMeta.cameraProfileLabel || "Project default / None"],
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
	                onKeyDown:(e)=>{ if(e.key==="Enter") e.target.blur(); }})),
            _stEl("div",{className:"stage2-versions-dhead with-action"},
              _stEl("span",null,"Prompt used"),
              selPrompt && _stEl("button",{type:"button",className:"stage2-vcopy",onClick:()=>_stagePromptCopy(selPrompt)},Icon.copy&&_stEl(Icon.copy,{s:12}),"Copy")),
            _stEl("pre",{className:"stage2-vprompt"}, selPrompt || "No prompt metadata was saved for this older take."),
            _stEl("div",{className:"stage2-versions-dhead"},"References used"),
            selRefs.length
              ? _stEl("div",{className:"stage2-vrefs"},
                  selRefs.map((r,i)=>_stEl("button",{key:(r.tag||"ref")+i,type:"button",className:"stage2-vref",
                    title:[r.tag,r.label,r.assetRoleLabel,r.role].filter(Boolean).join(" — ")},
                    r.url && r.kind!=="audio" ? (r.kind==="video"
                      ? _stEl("video",{src:r.url,muted:true,playsInline:true,preload:"metadata"})
                      : _stEl("img",{src:r.url,alt:"",loading:"lazy"}))
                      : _stEl("span",{className:"stage2-vref-tile"}, r.kind==="audio" ? "♪" : r.kind==="text" ? "T" : "•"),
                    _stEl("span",{className:"stage2-vref-copy"},
                      _stEl("b",null,[r.tag,r.label].filter(Boolean).join(" · ")),
                      r.assetRoleLabel && _stEl("em",null,r.assetRoleLabel),
                      r.role && _stEl("small",null,r.role)))))
              : _stEl("div",{className:"stage2-vrefs-empty"},"No reference assets were attached to this take, or this older take was saved before reference snapshots existed."))),
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
function StagePillMenu({ icon:Ic, label, title, heading, on, disabled, options, onPick, foot }){
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  const [hi, setHi] = React.useState(-1);   // keyboard highlight — arrows move it, Enter picks
  React.useEffect(()=>{
    if(!open) return;
    const close=(e)=>{
      if(btnRef.current && btnRef.current.contains(e.target)) return;
      if(menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const keys=(e)=>{
      if(e.key==="Escape"){ setOpen(false); return; }
      const list = options||[];
      const step = e.key==="ArrowDown" ? 1 : e.key==="ArrowUp" ? -1 : 0;
      if(step){ e.preventDefault();
        // cycle to the next ENABLED option, wrapping at the ends
        setHi(h=>{ let i=h; for(let n=0;n<list.length;n++){ i=(i+step+list.length)%list.length; if(!list[i].disabled) return i; } return h; }); }
      else if(e.key==="Enter" && hi>=0 && list[hi] && !list[hi].disabled){
        e.preventDefault(); setOpen(false); onPick&&onPick(list[hi].value); }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", keys);
    return ()=>{ document.removeEventListener("mousedown", close); document.removeEventListener("keydown", keys); };
  },[open, hi, options, onPick]);
  const toggle=()=>{
    if(disabled || !(options&&options.length)) return;
    if(!open && btnRef.current){
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left:Math.round(Math.min(r.left, window.innerWidth-300)), top:Math.round(r.bottom+6) });
      // opening pre-highlights the selected option so arrows continue from it
      const sel = options.findIndex(o=>o.selected && !o.disabled);
      setHi(sel>=0 ? sel : options.findIndex(o=>!o.disabled));
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
      options.map((o,i)=>_stEl("button",{key:String(o.value),type:"button",role:"menuitemradio","aria-checked":o.selected?"true":"false",
        className:"stage2-pill-opt"+(o.selected?" on":"")+(i===hi?" hi":""),
        disabled:!!o.disabled, title:o.note||undefined,
        onMouseEnter:()=>setHi(i),
        onClick:()=>{ if(o.disabled) return; setOpen(false); onPick&&onPick(o.value); }},
        _stEl("div",{className:"stage2-pill-opt-main"},
          _stEl("span",null,o.label),
          o.tag&&_stEl("small",null,o.tag)),
        // metadata chips (resolution ceiling, duration range…) — spec at a glance
        (o.meta&&o.meta.length>0) && _stEl("div",{className:"stage2-pill-opt-meta"},
          o.meta.map((m,i)=>_stEl("span",{key:i},
            m.icon&&_stEl(m.icon,{s:10}), m.label))),
        // one-line description (e.g. bitrate trade-off)
        o.desc && _stEl("div",{className:"stage2-pill-opt-desc"}, o.desc))),
      foot && _stEl("div",{className:"stage2-pill-menu-foot"}, foot)));
}

/* ================================ the room shell =============================== */
const STAGE_ACT_TITLES = { 1:"Setup", 2:"Complication", 3:"Resolution" };
/* the beat name(s) a clip covers — prefer the stored screenplay text, then fall back to the beat map. */
function screenplayBeatTitle(scene, drafts, beatN, max){
  const fn = typeof window!=="undefined" && window.screenplayBeatExcerpt;
  if(!fn || !scene || !drafts || !drafts[scene.id]) return "";
  try{ return fn(drafts[scene.id], beatN, max||38); }catch(e){ return ""; }
}
// StagePromptArea — ONE mention-aware prompt box shared by every Stage prompt:
// the composer, the Director (primary) box, and each multi-shot row. Typing @
// opens the included-asset dropdown (thumbs + kind chips, Seedance-style);
// arrows/Enter/Tab insert, Esc/blur closes; @Tokens that don't resolve to an
// included asset are flagged under the box. The parent owns the value via
// setValue, so each instance keeps its own dropdown/caret state.
function StagePromptArea(props){
  const max = props.maxLength || 1999;
  const ment = props.mentionables || [];
  const [box, setBox] = React.useState(null);   // {start, query, hi}
  const taRef = React.useRef(null);
  const items = (q)=>{ q=String(q||"").toLowerCase();
    return ment.filter(m=>!q || m.t.toLowerCase().indexOf(q)>=0 || m.label.toLowerCase().indexOf(q)>=0).slice(0,8); };
  const caretToken = (el)=>{ const upto = el.value.slice(0, el.selectionStart||0);
    const m = /(?:^|[\s\n])@([A-Za-z0-9]*)$/.exec(upto);
    return m ? { start:(el.selectionStart||0)-m[1].length-1, query:m[1] } : null; };
  const insert = (m)=>{ const el=taRef.current; if(!el||!box) return;
    // a not-yet-included asset must be included before its token means anything —
    // the parent's onMentionPick does that (returns false when it can't, e.g. budget full)
    if(props.onMentionPick && props.onMentionPick(m)===false){ setBox(null); return; }
    const tok = m.t;
    const caret = el.selectionStart||0;
    const val = String(props.value||"");
    const next = (val.slice(0,box.start)+tok+" "+val.slice(caret)).slice(0,max);
    const pos = box.start+tok.length+1;
    props.setValue(next); setBox(null);
    requestAnimationFrame(()=>{ try{ el.focus(); el.setSelectionRange(pos,pos); }catch(_e){} }); };
  // tokens that don't resolve to an INCLUDED asset (typo, or the asset was excluded) —
  // prospective tokens of not-yet-included assets deliberately don't count as known
  const bad = (()=>{ const known = new Set(ment.filter(m=>m.included!==false).map(m=>m.t.toLowerCase()));
    const out = [], re = /@(image|video|audio)\d+/gi; let mm; const val = String(props.value||"");
    while((mm = re.exec(val))){ if(!known.has(mm[0].toLowerCase()) && out.indexOf(mm[0])<0) out.push(mm[0]); }
    return out; })();
  const list = box ? items(box.query) : [];
  return _stEl("div",{className:"stage2-gen-promptwrap"+(props.fill?" fill":"")},
    _stEl("textarea",{ref:taRef,className:props.className,value:props.value,rows:props.rows,
      placeholder:props.placeholder,maxLength:max,spellCheck:false,title:props.title,
      onChange:(e)=>{ props.setValue(e.target.value.slice(0,max));
        const tk = caretToken(e.target); setBox(tk ? { ...tk, hi:0 } : null); },
      onKeyDown:(e)=>{ if(!box) return;
        if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault();
          setBox(b=>({ ...b, hi:(b.hi+(e.key==="ArrowDown"?1:-1)+Math.max(1,list.length))%Math.max(1,list.length) })); }
        else if((e.key==="Enter"||e.key==="Tab") && list.length){ e.preventDefault();
          insert(list[Math.min(box.hi, list.length-1)]); }
        else if(e.key==="Escape"){ setBox(null); } },
      onBlur:()=>setTimeout(()=>setBox(null),120)}),
    props.warn!==false && bad.length>0 && _stEl("div",{className:"stage2-mention-warn"},
      "⚠ "+bad.join(", ")+" — not among this render's included assets; the model will guess. Fix the token or include the asset."),
    box && list.length>0 && _stEl("div",{className:"stage2-mention-box"},
      list.map((m,i)=>_stEl("button",{key:m.t+":"+(m.key||""),type:"button",
        className:"stage2-mention-item"+(i===box.hi?" hi":""),
        title: m.included===false ? m.label+" — not among this render's inputs yet; picking it includes it" : undefined,
        onMouseDown:e=>{ e.preventDefault(); insert(m); }},
        m.kind==="image" && m.url
          ? _stEl("img",{className:"stage2-mention-thumb",src:m.url,alt:""})
          : _stEl("span",{className:"stage2-mention-thumb tile"},
              m.kind==="video" ? (Icon.film&&_stEl(Icon.film,{s:13})) : (Icon.mic&&_stEl(Icon.mic,{s:13}))),
        _stEl("span",{className:"stage2-mention-main"},
          _stEl("b",null,m.t), m.label && _stEl("span",{className:"stage2-mention-label"},m.label)),
        _stEl("span",{className:"stage2-mention-kind"},
          (m.kind==="image"?"Image":m.kind==="video"?"Video":"Audio")+(m.included===false?" · add":""))))));
}
/* one BEAT's rail name, resolved the way the Art Room names it: the scripted beat
   title first (the canon text the Shots tab shows as "Scripted"), then the beat
   map's drive, then the first shot's own words. */
function stageBeatRailName(scene, drafts, beatsMap, beat){
  const n = beat && beat.n;
  if(n){
    const t = screenplayBeatTitle(scene, drafts, n, 34);
    if(t) return t;
    const rows = ((beatsMap||{})[scene.id]||{}).rows || [];
    const r = rows.find(x=>Number(x.n)===Number(n));
    if(r && r.drive && r.drive.a) return r.drive.a;
  }
  const sh0 = (beat && beat.shots && beat.shots[0]) || {};
  return _firstWords(sh0.action||sh0.dialogue||"", 5);
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
  const total = stagePageRanges(sceneShots).length;
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
  const ranges = stagePageRanges(sceneShots);
  const clipForItem = (it)=>{
    const pg = ranges[it.page-1] || { start:(it.page-1)*4, count:4 };
    const cell0 = (it.kind==="half" && it.half==="bottom") ? 2 : 0;
    const span = Math.max(1, Math.min(it.kind==="half" ? 2 : pg.count, pg.count-cell0));
    const start = pg.start + cell0;
    return (clips||[]).find(c=>{
      const a = Number(c&&c.g&&c.g.start)||0;
      const b = a + (((c&&c.g&&c.g.shots)||[]).length||1) - 1;
      return b>=start && a<=start+span-1;
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
  // bridge for storyboardClipIds: the Storyboards tab's beat-boundary page geometry
  // (window.sbPageRanges) needs the scene's live shots; the pure clip→sheet helpers
  // read them from here rather than threading the list through every call site.
  window.__sbShots = shots;
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
  // CLIP PACKING is always PER-CLIP: shots pack into clips by the model's duration &
  // shot budget, and the left rail lists those clips. (The Per clip / Whole scene
  // switcher was removed 2026-08-02 by user ruling — sceneSequences' wholeScene
  // branch stays dormant for a future whole-scene model.)
  // in-room view: the director console ("stage") or the take browser ("versions");
  // pendingReuse carries a Versions-tab "Reuse/Branch" pick back into the composer
  const [stageView, setStageView] = React.useState("stage");
  const [pendingReuse, setPendingReuse] = React.useState(null);
  const clipsByScene = React.useMemo(()=>{ const m={};
    // the packing budget follows the MODEL's ceiling upward — a 30s model (Seedance
    // 2.5) packs whole beats into 30s clips even when the format's budget is 15s
    const packMax = Math.max(clipMax, stageModel.maxClipSec||15);
    const packOpts = { maxShots: stageModel.maxShotsPerClip!=null ? stageModel.maxShotsPerClip : (window.CLIP_MAX_SHOTS||3),
      maxDialogue: stageModel.maxDialoguePerClip!=null ? stageModel.maxDialoguePerClip : (window.CLIP_MAX_DIALOGUE||3) };
    scenesWithShots.forEach(s=>{ m[s.id]=(typeof sceneSequences==="function")?sceneSequences(shotsByScene[s.id]||[], packMax, packOpts):[]; });
    return m; }, [scenesWithShots, shotsByScene, clipMax, modelId]);

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
      const total = stagePageRanges((shotsByScene||{})[scene.id]||[]).length;
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
    const total = sceneClips.length;
    const allDone = total>0 && done===total;
    return _stEl("div",{key:scene.id,className:"stage2-scene-block"},
      _stEl("button",{type:"button",className:"stage2-scene-headrow"+(selectedScene.id===scene.id?" on":"")+(allDone?" done":""),
          onClick:()=>{ if(sceneClips[0]) onSelectClip(sceneClips[0].id); },
          title:"Select Scene "+_pad2(scene.no)+" · "+done+" of "+total+" clip"+(total!==1?"s":"")+" rendered · "+_fmtSecs(sceneDur)+" runtime"},
        _stEl("span",{className:"tree-scene-no"}, _pad2(scene.no)),
        _stEl("span",{className:"tree-scene-dot",style:{background:allDone?"var(--pos)":chargeColor(scene)}}),
        _stEl("span",{className:"stage2-scene-ttl"}, scene.title||scene.loc),
        // per-scene rollup: rendered/total clips (✓-green when complete, matching the
        // chip done styling) + the scene's total runtime — the at-a-glance answer to
        // "how far along is this scene?" without scanning chips
        _stEl("span",{className:"stage2-scene-prog"+(allDone?" done":"")}, allDone?"✓ ":"", done+"/"+total),
        _stEl("span",{className:"stage2-scene-meta"}, _fmtSecs(sceneDur))),
      // thin progress bar that fills as clips render
      _stEl("div",{className:"stage2-scene-bar"+(allDone?" done":""),role:"progressbar",
          "aria-valuenow":done,"aria-valuemin":0,"aria-valuemax":total,
          "aria-label":"Scene "+_pad2(scene.no)+" render progress"},
        _stEl("div",{className:"stage2-scene-bar-fill",style:{width:(total?Math.round(done/total*100):0)+"%"}})),
      // BEATS below scenes, matching the Art Room exactly: one row per beatN (the
      // Shots tab's "Beat N" cards), in shot order. Clips stay the render unit —
      // a beat row selects the clip holding the beat's FIRST shot, but only the
      // clicked/current beat highlights (packing can span beats without looking like
      // a multi-select).
      _stEl("div",{className:"stage2-beat-list"},
        (()=>{ const beats=[];
          sceneShots.forEach(sh=>{ const n=sh.beatN||null;
            const b=beats.find(x=>x.n===n); if(b) b.shots.push(sh); else beats.push({ n, shots:[sh] }); });
          return beats.map(b=>{
            const bIds = new Set(b.shots.map(s=>s.id));   // id-compare, never object identity
            const coverClips = sceneClips.filter(c=> (c.g.shots||[]).some(sh=> bIds.has(sh.id)));
            const firstClip = coverClips[0] || null;
            const p = firstClip ? stageClipSourcePlan(firstClip, imgs) : { glyph:"", ready:false, label:"shots" };
            const rendered = coverClips.length>0 && coverClips.every(c=>clipVideoReady(c, vids));
            const on = selectedScene.id===scene.id && b.shots.some(sh=>sh.id===((selectedShot||{}).id));
            const beatNm = stageBeatRailName(scene, drafts, beatsMap, b);
            const label = "Beat "+(b.n||"—");
            return _stEl("div",{key:"beat-"+(b.n||"none"),className:"stage2-beat"+(on?" on":"")},
              _stEl("button",{type:"button",
                className:"stage2-beat-row"+(rendered?" done":"")+(p.ready?"":" missing"),
                title:label+(beatNm?" · "+beatNm:"")+" · "+b.shots.length+" shot"+(b.shots.length!==1?"s":"")
                  +(coverClips.length>1?" · spans "+coverClips.length+" clips":"")
                  +" · renders from "+p.label+(p.ready?"":" — source missing, generate it first")+(rendered?" · rendered ✓":""),
                onClick:()=>{ if(!firstClip) return; if(firstClip.id!==clip.id) onSelectClip(firstClip.id); setSelShotId(b.shots[0].id); }},
                _stEl("b",null,label),
                _stEl("span",{className:"stage2-beat-name"},beatNm||"—"),
                _stEl("span",{className:"stage2-clip-chip-glyph"},p.glyph),
                _stEl("span",{className:"stage2-clip-chip-st"}, rendered?"✓":(p.ready?"":"!"))));
          });
        })()));
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
    // production workflow: SHOOT the clips → manage the TAKES → assemble the
    // TIMELINE → MIX the sound. ("Stage" as a tab name clashed with the room
    // itself.) Internal view ids stay stable — only the labels are film-language.
    const stageTabs = [
      ["Shoot","stage",Icon.clapper||Icon.sparkles,"Render the clips — the director console"],
      ["Takes","versions",Icon.copy,"Approve, restore & reuse the selected clip's rendered takes"],
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
            : _stEl(ClipConsole,{ key:"console-"+selectedScene.id, clip, selectedShot, sceneClips:selectedSceneClips, ctx, imgs, auds, beatsMap, drafts, prevClipVideoId:prevBeatVideoId, aspect, visualSource, setVisualSource, creditBalance, onVoiceLine, onUpdateShot, modelId, setModelId,
                onSelectClip,
                onFirstVideo:()=>setStageView("versions"),
                pendingReuse, onReuseConsumed:()=>setPendingReuse(null) }))));
  }
window.StageView = StageView;

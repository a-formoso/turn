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
function _chipClass(k){ return String(k||"").toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"") || "tag"; }
function _fmtSecs(n){ n=Number(n)||0; return (Math.round(n*10)/10).toString().replace(/\.0$/,"")+"s"; }
function _shotAudioReady(sh, auds){ return !!((auds&&auds[sh.id]) || (sh&&sh.lineAudio&&sh.lineAudio.durationMs)); }
function _clipMeasuredSec(clip){
  const lines = ((clip&&clip.data&&clip.data.lineShots)||[]).filter(sh=>String(sh.dialogue||"").trim());
  if(!lines.length) return 0;
  if(!lines.every(sh=>sh.lineAudio && sh.lineAudio.durationMs)) return 0;
  const ms = lines.reduce((t,sh)=>t+Number((sh.lineAudio||{}).durationMs||0),0);
  return Math.max(4, Math.min(15, Math.round(((ms/1000)+0.4)*10)/10));
}
function _normStageText(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim(); }
function stageBeatRow(beatsMap, sceneId, beatN){
  return (((beatsMap||{})[sceneId]||{}).rows||[]).find(r=>Number(r.n)===Number(beatN)) || null;
}
function stageShotScriptText(scene, drafts, sh, max){
  if(typeof screenplayBeatTitle==="function"){
    const t = screenplayBeatTitle(scene, drafts||{}, sh&&sh.beatN, max||160);
    if(t) return t;
  }
  return "";
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
  const script = stageShotScriptText(scene, drafts, sh, max||180);
  const sheet = stageShotSheetText(scene, beatsMap, sh, max||180);
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
  shots.forEach(sh=>{ const inc=(typeof inFrameCast==="function")?inFrameCast(sh, scene, ctx.characters||[]):(sh.subjects||[]);
    inc.forEach(id=>{ if(castIds.indexOf(id)<0) castIds.push(id); }); });
  const cast = castIds.map(id=>({ id, name:(ctx.charById[id]||{}).name||"" })).filter(c=>c.name);
  // in-frame props (union)
  const propIds = [];
  let propLedger = {};
  try{ propLedger = (typeof sceneContinuityLedger==="function") ? sceneContinuityLedger(scene, shots, ctx.charById, ctx.propById) : {}; }catch(e){}
  shots.forEach(sh=>{ const inc=(typeof inFrameProps==="function")?inFrameProps(sh, scene, ctx.charById, ctx.propById):[];
    (inc||[]).concat((propLedger&&propLedger[sh.id])||[]).forEach(id=>{ if(propIds.indexOf(id)<0) propIds.push(id); }); });
  const clipProps = propIds.map(id=>({ id, name:(ctx.propById[id]||{}).name||"" })).filter(p=>p.name);
  const loc = (typeof locationForScene==="function") ? locationForScene(ctx.locations, scene.id) : null;
  const preset = (typeof scenePreset==="function") ? scenePreset(ctx.project, scene.id) : null;
  // camera arc: first -> last distinct move label
  const moves = _uniq(shots.map(sh=> (typeof shotMoveOf==="function") ? shotMoveOf(sh.move).label : (sh.move||"")).filter(Boolean));
  const camera = moves.length ? moves.join(" → ") : "Static";
  const lighting = (preset && (preset.lighting||preset.grade)) || "Naturalistic, motivated light";
  const lead = cast[0] ? cast[0].name : "the subject";
  // composed director prompt (prose, multi-beat) — readable, not the image-gen JSON
  const panelLines = shots.map((sh,i)=>{
    const meta = stageSheetPanelMeta(g, i);
    return { shotId:sh.id, beatN:sh.beatN, sheetPage:meta.page, sheetPanel:meta.panel, half:meta.half,
      text:stageShotCanonLine(scene, ctx.drafts, ctx.beatsMap, sh, 190),
      script:stageShotScriptText(scene, ctx.drafts, sh, 190),
      sheet:stageShotSheetText(scene, ctx.beatsMap, sh, 190) };
  });
  const actions = _uniq(panelLines.map(p=>String(p.text||"").trim()).filter(Boolean));
  const body = actions.join(" ");
  const setting = loc ? (loc.name) : (scene.loc||"");
  const styleClause = preset ? (preset.name+" — "+preset.grade+".") : "";
  const camClause = "Camera: "+camera.toLowerCase()+".";
  const prompt = [ body, camClause, styleClause ].filter(Boolean).join(" ");
  // tag chips
  const chips = [
    cast.length && { k:"subject", v:cast.map(c=>c.name).join(", ") },
    actions.length && { k:"action", v:_firstWords(actions[0], 4) },
    setting && { k:"setting", v:setting },
    { k:"camera", v:camera.toLowerCase() },
    preset && { k:"style", v:preset.name.toLowerCase() },
    preset && { k:"mood", v:_firstWords(preset.grade, 4).toLowerCase() },
  ].filter(Boolean);
  return { shots, first, cast, props:clipProps, loc, preset, camera, lighting, lead, prompt, chips, setting, panelLines,
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

/* ---- Seedance 2.0 prompt RECIPES — named ways to phrase the SAME clip for the model.
   Each rebuilds the (still hand-editable) prompt from the clip's beats. Researched from
   how Seedance 2.0 responds best: a flowing paragraph (Narrative), a per-panel beat board
   with dialogue durations + anti-hallucination rules (Panel-by-panel), labelled control
   fields (Structured), and an audio-anchored lip-sync phrasing (Dialogue). ---- */
const SEEDANCE_RECIPES = [
  ["narrative",  "Narrative",        "One flowing paragraph — the default."],
  ["panels",     "Panel-by-panel",   "One line per beat/panel, with dialogue durations + anti-hallucination rules."],
  ["structured", "Structured",       "Labelled fields: Subject / Action / Setting / Camera / Lighting / Style."],
  ["lipsync",    "Dialogue / lip-sync","Phrased around the spoken line in @Audio1 for accurate lip-sync."],
];
function _seedanceVoiceSec(sh){
  const ms = sh && sh.lineAudio && sh.lineAudio.durationMs;
  if(ms) return Math.round(ms/100)/10;                                  // measured audio
  const w = String((sh&&sh.dialogue)||"").trim().split(/\s+/).filter(Boolean).length;
  return w ? Math.max(1, Math.round(w/2.4)) : 0;                        // estimate from word count
}
function seedancePrompt(recipe, clip){
  const d = (clip&&clip.data) || {}, shots = d.shots || [];
  const cast = (d.cast||[]).map(c=>c.name);
  const setting = d.setting || "";
  const style = d.preset ? (d.preset.name+" — "+d.preset.grade) : "";
  const lead = d.lead || (cast[0] || "the subject");
  const panelLines = d.panelLines || [];
  const actionLines = _uniq((panelLines.length ? panelLines.map(p=>p.text) : shots.map(s=>String(s.action||"").trim())).filter(Boolean));
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
    return "@Image1 comes alive. "+lead+" delivers the line in @Audio1 with natural, accurate lip-sync — a grounded, in-character performance. Subtle, motivated motion; hold the framing, lighting and identity steady."
      + (setting?(" "+setting+"."):"") + (style?(" "+style+"."):"");
  }
  if(recipe==="panels"){
    const header = [ setting&&(setting+"."), style&&(style+"."), cast.length&&("Cast: "+cast.join(", ")+".") ].filter(Boolean).join(" ");
    const panels = shots.map(function(sh,i){
      const p = panelLines[i] || {};
      const label = p.sheetPage ? ("Sheet "+p.sheetPage+" Panel "+p.sheetPanel) : ("Panel "+(((clip.scene&&clip.scene.no)||1)+"."+(i+1)));
      let line = "["+label+" · Beat "+(sh.beatN||"—")+"] "+(String(p.text||sh.action||"").trim());
      if(String(sh.dialogue||"").trim()){ const dur=_seedanceVoiceSec(sh);
        line += " "+lead+" speaks"+(dur?(" (~"+dur+"s of dialogue, may begin mid-panel)"):"")+"."; }
      return line;
    }).join("\n");
    const rules = "Rules: match the referenced storyboard sheet half/page panel order exactly; the bracketed Sheet/Panel labels refer to the 2x2 Storyboards sheet. Do not invent different beats, props or blocking. Let Seedance pace the cut; hold every character's identity, wardrobe, props, location geometry and lighting continuous across panels.";
    return [header, panels, rules].filter(Boolean).join("\n");
  }
  return d.prompt || "";   // narrative (default)
}

function ClipConsole({ clip, ctx, imgs, auds, beatsMap, drafts, prevClipVideoId, aspect, visualSource, setVisualSource, onVoiceLine }){
  const scene = clip.scene, g = clip.g, d = clip.data;
  const gen = useSeedanceGen(clip.id);
  const shotStartFrame = imgs[(d.first||{}).id] || "";
  const storyAssets = storyboardClipAssets(clip, imgs);
  const hasHalves = !!((storyAssets.halves||[]).length || storyAssets.top || storyAssets.bottom);
  const hasStoryboardSource = !!(hasHalves || storyAssets.sheet);
  const useHalves = visualSource==="halves";
  const firstStoryHalf = ((storyAssets.halves||[])[0]||{}).url || storyAssets.top || storyAssets.bottom || "";
  const startFrame = useHalves ? (firstStoryHalf || storyAssets.sheet || "") : shotStartFrame;
  const prevVideo = prevClipVideoId ? ((typeof vidGetVideo==="function") ? vidGetVideo(prevClipVideoId) : "") : "";
  // the clip's shots ARE its takes — each shot covers a beat. Click one to preview its frame.
  const beatRows = ((beatsMap||{})[scene.id]||{}).rows || [];
  const shotBeat = (sh)=> screenplayBeatTitle(scene, drafts, sh.beatN, 32) || _firstWords(sh.action||sh.dialogue||"", 6) || (()=>{ const r=beatRows.find(x=>x.n===sh.beatN); return (r && r.drive && r.drive.a) || ("Beat "+(sh.beatN||"—")); })();
  const [previewId, setPreviewId] = React.useState((d.first||{}).id || null);
  const previewFrame = useHalves ? startFrame : (imgs[previewId] || startFrame);

  // ---- the derived INPUT ASSETS (tagged, toggleable), capped to Seedance's 12 ----
  const assets = React.useMemo(()=>{
    const out = [];
    out.push({ key:"text", kind:"text", label:"Prompt", ready:true, locked:true });
    if(useHalves){
      const hs = (storyAssets.halves&&storyAssets.halves.length) ? storyAssets.halves : [
        storyAssets.top && { id:"legacy-top", url:storyAssets.top },
        storyAssets.bottom && { id:"legacy-bottom", url:storyAssets.bottom },
      ].filter(Boolean);
      hs.forEach((h,i)=>out.push({ key:"sb-half-"+i, kind:"image", label:"Storyboard "+(i+1)+" / "+hs.length+" for this clip", url:h.url, ready:true, locked:true }));
      if(storyAssets.sheet && !hs.length) out.push({ key:"sb-sheet", kind:"image", label:"Full storyboard sheet", url:storyAssets.sheet, ready:true, locked:true });
      else if(storyAssets.sheet) out.push({ key:"sb-sheet", kind:"image", label:"Full storyboard sheet", url:storyAssets.sheet, ready:true, locked:false });
      if(!hasStoryboardSource) out.push({ key:"sb-missing", kind:"image", label:"Storyboard halves", ready:false, locked:true });
    } else {
      if(shotStartFrame) out.push({ key:"frame", kind:"image", label:(d.cast[0]?d.cast[0].name+" — shot frame":"Shot start frame"), url:shotStartFrame, ready:true, locked:true });
      else out.push({ key:"frame-missing", kind:"image", label:"Shot start frame", ready:false, locked:true });
    }
    d.cast.forEach(c=>{ const u=imgs[c.id]; out.push({ key:"c:"+c.id, kind:"image", label:c.name+" reference", url:u, ready:!!u, id:c.id }); });
    if(d.loc){ const u=imgs[d.loc.id]; out.push({ key:"loc", kind:"image", label:(d.loc.name||"Location")+" plate", url:u, ready:!!u, id:d.loc.id }); }
    d.props.forEach(p=>{ const u=imgs[p.id]; if(u) out.push({ key:"p:"+p.id, kind:"image", label:p.name, url:u, ready:true, id:p.id }); });
    if(prevVideo) out.push({ key:"prev", kind:"video", label:"Previous clip (continuity)", url:prevVideo, ready:true });
    d.lineShots.forEach((sh,i)=>{ const u=auds[sh.id]; if(u) out.push({ key:"a:"+sh.id, kind:"audio", label:(d.cast[0]?d.cast[0].name+" line":"Line audio")+(d.lineShots.length>1?(" "+(i+1)):""), url:u, ready:true, locked:true, shotId:sh.id }); });
    return out;
  }, [clip.id, visualSource, shotStartFrame, JSON.stringify((storyAssets.halves||[]).map(h=>h.id+":"+!!h.url)), storyAssets.top, storyAssets.bottom, storyAssets.sheet, prevVideo, JSON.stringify(d.cast), JSON.stringify(d.props), JSON.stringify(d.lineShots), d.loc&&d.loc.id, imgs, auds]);

  // assets default ON when ready; user can toggle (off set). tag numbers per kind.
  const [off, setOff] = React.useState(()=>new Set());
  const tagged = React.useMemo(()=>{ const n={text:0,image:0,video:0,audio:0};
    return assets.map(a=>{ n[a.kind]++; return { ...a, tag:"@"+a.kind+n[a.kind] }; }); }, [assets]);
  const on = (a)=> a.ready && !off.has(a.key);
  const toggle = (a)=>{ if(a.locked||!a.ready) return; setOff(s=>{ const n=new Set(s); n.has(a.key)?n.delete(a.key):n.add(a.key); return n; }); };
  const assetState = (a)=> !a.ready ? "missing" : a.locked ? "required" : on(a) ? "included" : "excluded";
  const assetStateLabel = (a)=> assetState(a)==="required" ? "Required" : assetState(a)==="included" ? "Included" : assetState(a)==="excluded" ? "Excluded" : "Missing";
  const assetTitle = (a)=>{
    const st = assetState(a), base = a.label+" · "+a.tag;
    if(st==="required") return base+" · required for this render";
    if(st==="included") return base+" · included, click to exclude";
    if(st==="excluded") return base+" · excluded, click to include";
    return base+" · missing; generate this source asset first";
  };
  const onImages = tagged.filter(a=>a.kind==="image" && on(a));
  const onVideos = tagged.filter(a=>a.kind==="video" && on(a));
  const onAudios = tagged.filter(a=>a.kind==="audio" && on(a));
  const onAssets = tagged.filter(on);
  const assetLimit = 12;
  const assetOver = onAssets.length > assetLimit;
  const budgetUsed = onAssets.length;
  const budgetOverBy = Math.max(0, budgetUsed-assetLimit);
  const budgetLeft = Math.max(0, assetLimit-budgetUsed);
  const budgetPct = Math.min(100, Math.round((budgetUsed/assetLimit)*100));
  const budgetState = assetOver ? "over" : budgetLeft===0 ? "full" : budgetLeft<=2 ? "near" : "ok";
  const budgetText = assetOver ? (budgetOverBy+" over cap") : budgetLeft===0 ? "At cap" : (budgetLeft+" slot"+(budgetLeft!==1?"s":"")+" left");
  const counts = { text:tagged.filter(a=>a.kind==="text" && on(a)).length, images:onImages.length, videos:onVideos.length, audio:onAudios.length };
  const sourceReady = useHalves ? hasStoryboardSource : !!shotStartFrame;
  const sourceLabel = useHalves ? (hasHalves ? "sheet halves" : (storyAssets.sheet ? "full sheet" : "storyboard halves")) : "shot frame";

  // ---- console controls (the original right-panel design) ----
  const [camera, setCamera] = React.useState(d.camera);
  const [lighting, setLighting] = React.useState(d.lighting);
  const [perf, setPerf] = React.useState(d.lead);
  const [quality, setQuality] = React.useState("standard");
  const measuredSec = _clipMeasuredSec(clip);
  const hasDialogue = (d.lineShots||[]).length>0;
  const voicedLineCount = (d.lineShots||[]).filter(sh=>_shotAudioReady(sh, auds)).length;
  const voiceReady = !hasDialogue || voicedLineCount===(d.lineShots||[]).length;
  const needsVoice = hasDialogue && !voiceReady;
  const duration = measuredSec || d.dur;
  const [prompt, setPrompt] = React.useState(d.prompt);
  const [modeOverride, setModeOverride] = React.useState(null);
  const [voicingClip, setVoicingClip] = React.useState(false);
  const [recipe, setRecipe] = React.useState("narrative");
  React.useEffect(()=>{ setRecipe("narrative"); setPrompt(d.prompt); }, [clip.id, d.prompt]);
  const applyRecipe = (k)=>{ setRecipe(k); setPrompt(seedancePrompt(k, clip)); };
  // mode auto-inferred from which asset kinds are on (overridable in the selector)
  const autoMode = (()=>{ const hasI=onImages.length>0, hasV=onVideos.length>0, hasA=onAudios.length>0;
    if(hasV && (hasI||hasA)) return "multimodal";
    if(hasA && hasI) return "multimodal";
    if(hasV) return "v2v";
    if(hasI) return "i2v";
    return "t2v"; })();
  const mode = modeOverride || autoMode;
  const MODES = [["t2v","Text to Video"],["i2v","Image to Video"],["v2v","Video to Video"],["multimodal","Multimodal"]];

  const onGenerate = async ()=>{
    const frameUrl = startFrame || (onImages[0]&&onImages[0].url) || "";
    const imageUrls = onImages.map(a=>a.url).filter(u=>u && u!==frameUrl);
    const videoUrls = onVideos.map(a=>a.url).filter(Boolean);
    const audioUrls = hasDialogue ? onAudios.map(a=>a.url).filter(Boolean) : [];
    const controls = "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+".";
    if(assetOver){ if(typeof window.appToast==="function") window.appToast("Seedance accepts up to "+assetLimit+" inputs — exclude a few assets first.","error"); return; }
    if(!sourceReady){ if(typeof window.appToast==="function") window.appToast((useHalves?"Save halves for this clip in Storyboards first.":"Generate this clip's first shot frame first."),"error"); return; }
    if(needsVoice){ if(typeof window.appToast==="function") window.appToast("Voice this clip's dialogue first — duration and lip-sync are locked to line audio.","error"); return; }
    try{
      await gen.generate({ frameUrl, imageUrls, videoUrls, audioUrls, prompt, controls,
        durationMs:duration*1000, aspectRatio:aspect||"auto", fast:quality==="turbo", force:true });
      if(typeof window.appToast==="function") window.appToast("Clip "+clip.label+" rendered","ok");
    }catch(e){ if(typeof window.appToast==="function") window.appToast(String((e&&e.message)||e),"err"); }
  };
  const onExtend = async ()=>{
    if(!gen.videoUrl) return;
    const controls = "Camera movement: "+camera+". Lighting: "+lighting+". Performance: "+perf+".";
    try{
      await gen.generate({ frameUrl:startFrame, videoUrls:[gen.videoUrl], prompt, controls,
        durationMs:duration*1000, aspectRatio:aspect||"auto", fast:quality==="turbo", force:true });
    }catch(e){ if(typeof window.appToast==="function") window.appToast(String((e&&e.message)||e),"err"); }
  };
  const onVoiceClip = async ()=>{
    if(!onVoiceLine || voicingClip) return;
    const todo = (d.lineShots||[]).filter(sh=>String(sh.dialogue||"").trim() && !_shotAudioReady(sh, auds));
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
  const PROMPT_MAX = 3000;

  // ----- CENTER: player + filmstrip + prompt + input assets -----
  const center = _stEl("div",{className:"stage2-center"},
    _stEl("div",{className:"stage2-clip-head"},
      _stEl("div",{className:"stage2-clip-slug"}, clip.label+"  ",
        _stEl("span",{className:"stage2-clip-loc"}, scene.loc),
        _stEl("span",{className:"stage2-clip-name"}, " · "+(d.first.action?_firstWords(d.first.action,3):(scene.title||"")))),
      _stEl("span",{className:"stage2-ver"}, gen.videoUrl?"Rendered":"Not rendered")),
    _stEl("div",{className:"stage2-sourcebar"},
      _stEl("div",{className:"stage2-source-copy"},
        _stEl("span",{className:"stage2-source-k"},"Visual source"),
        _stEl("span",{className:"stage2-source-v"}, useHalves
          ? (hasHalves ? "Using saved storyboard halves" : (storyAssets.sheet ? "Using full storyboard sheet" : "No saved halves for this clip"))
          : (shotStartFrame ? "Using Shot List frame" : "No shot frame yet"))),
      _stEl("div",{className:"stage2-source-toggle"},
        _stEl("button",{className:"stage2-source-btn"+(!useHalves?" on":""),onClick:()=>setVisualSource("shots"),
          title:"Use individual Shot List frames as the Seedance start frame"},"Shot frames"),
        _stEl("button",{className:"stage2-source-btn"+(useHalves?" on":""),
          onClick:()=>setVisualSource("halves"),
          title:hasStoryboardSource?"Use saved storyboard sheet halves as Seedance image inputs":"Save halves from this clip's 2x2 storyboard sheet first"},"Sheet halves"))),
    // player
    _stEl("div",{className:"stage2-player",style:_stageAspectCss(aspect)},
      gen.videoUrl
        ? _stEl("video",{src:gen.videoUrl,poster:startFrame||undefined,controls:true,playsInline:true})
        : _stEl("div",{className:"stage2-player-poster"},
            previewFrame ? _stEl("img",{src:previewFrame,alt:""}) : _stEl("div",{className:"stage2-noframe"}, Icon.image&&_stEl(Icon.image,{s:24}), useHalves ? "No storyboard halves yet — save halves in Storyboards" : "No frame yet — generate these shots in the Shot List"),
            _stEl("div",{className:"stage2-player-badge"}, gening ? (gen.status||"Rendering…") : (previewFrame?(sourceLabel+" · not rendered yet"):"")))),
    !gen.videoUrl && _stEl("div",{className:"stage2-ruler"},
      _stEl("div",{className:"stage2-ruler-fill",style:{width:"22%"}}),
      _stEl("span",{className:"stage2-ruler-dur"}, "0:00 / 0:"+_pad2(duration))),
    // filmstrip — the SHOTS (takes) that make up THIS clip; each covers a beat. Click to preview.
    _stEl("div",{className:"stage2-strip-cap"}, "Shots in "+clip.label+" — "+(d.shots||[]).length+" take"+((d.shots||[]).length!==1?"s":"")),
    _stEl("div",{className:"stage2-strip"},
      (d.shots||[]).map(function(sh,i){ const u=imgs[sh.id]; const sd=(typeof shotDur==="function")?shotDur(sh):5;
        return _stEl("button",{key:sh.id,className:"stage2-strip-cell"+(sh.id===previewId?" on":""),onClick:()=>setPreviewId(sh.id),
          title:shotBeat(sh)+((typeof shotGrammarLabel==="function")?(" — "+shotGrammarLabel(sh)):"")},
          _stEl("div",{className:"stage2-strip-thumb",style:_stageAspectCss(aspect)},
            u ? _stEl("img",{src:u,alt:"",loading:"lazy"}) : _stEl("div",{className:"stage2-strip-blank"}),
            _stEl("span",{className:"stage2-strip-no"}, (i+1))),
          _stEl("div",{className:"stage2-strip-meta"},
            _stEl("span",{className:"stage2-strip-lab"}, shotBeat(sh)),
            _stEl("span",{className:"stage2-strip-dur"}, sd+"s"))); })),
    // prompt box
      _stEl("div",{className:"sd-prompt"},
        _stEl("div",{className:"sd-recipes"},
          _stEl("span",{className:"sd-recipes-lab"}, Icon.wand&&_stEl(Icon.wand,{s:12}), "Recipe"),
          SEEDANCE_RECIPES.map(r=> _stEl("button",{key:r[0],type:"button",
            className:"sd-recipe"+(recipe===r[0]?" on":""), title:r[2], onClick:()=>applyRecipe(r[0])}, r[1]))),
        _stEl("textarea",{className:"sd-prompt-ta",value:prompt,placeholder:"Describe your scene in detail…",
          maxLength:PROMPT_MAX,rows:3,spellCheck:false,onChange:e=>setPrompt(e.target.value)}),
        _stEl("div",{className:"sd-prompt-foot"},
          _stEl("button",{className:"sd-prompt-helper",onClick:()=>setPrompt(d.prompt),title:"Rebuild the prompt from this clip's beats"},
            Icon.wand&&_stEl(Icon.wand,{s:13}), "Prompt helper"),
          _stEl("span",{className:"sd-prompt-count"}, prompt.length+" / "+PROMPT_MAX)),
        (d.chips||[]).length>0 && _stEl("div",{className:"stage2-chipbox"},
          _stEl("div",{className:"stage2-chipbox-lab"},"Prompt ingredients"),
          _stEl("div",{className:"stage2-chips"},
            d.chips.map((ch,i)=>_stEl("button",{key:i,type:"button",className:"stage2-chip "+_chipClass(ch.k),
              title:"Add "+ch.k+" to the prompt",onClick:()=>onChip(ch)},
              _stEl("b",null,ch.k),_stEl("span",null,ch.v)))))),
    // input assets (references)
    _stEl("div",{className:"stage2-assets"},
      _stEl("div",{className:"stage2-assets-lab"}, "INPUT ASSETS ("+onAssets.length+"/"+assetLimit+")",
        _stEl("span",null, tagged.filter(a=>assetState(a)==="required").length+" required · "+tagged.filter(a=>assetState(a)==="excluded").length+" excluded · "+tagged.filter(a=>assetState(a)==="missing").length+" missing")),
      _stEl("div",{className:"stage2-assets-row"},
        tagged.map(a=> _stEl("button",{key:a.key,
          type:"button",
          className:"stage2-asset "+a.kind+" "+assetState(a)+(on(a)?" on":"")+(a.locked?" locked":""),
          "aria-pressed":(!a.locked&&a.ready)?(on(a)?"true":"false"):undefined,
          "aria-disabled":(a.locked||!a.ready)?"true":undefined,
          title:assetTitle(a),
          onClick:()=>toggle(a)},
          _stEl("div",{className:"stage2-asset-vis"},
            a.kind==="text" ? _stEl("span",{className:"stage2-asset-T"},"T")
            : a.kind==="audio" ? _stEl("span",{className:"stage2-asset-wave"}, Icon.mic&&_stEl(Icon.mic,{s:16}))
            : a.url ? _stEl("img",{src:a.url,alt:"",loading:"lazy"})
            : _stEl("span",{className:"stage2-asset-ph"}, "—"),
            on(a) && _stEl("span",{className:"stage2-asset-tick"}, Icon.check&&_stEl(Icon.check,{s:11})),
            a.kind==="video" && _stEl("span",{className:"stage2-asset-vid"}, Icon.play&&_stEl(Icon.play,{s:12}))),
          _stEl("div",{className:"stage2-asset-lab"}, a.label),
          _stEl("div",{className:"stage2-asset-foot"},
            _stEl("span",{className:"stage2-asset-tag"}, a.tag),
            _stEl("span",{className:"stage2-asset-state"}, assetStateLabel(a))))),
        _stEl("div",{className:"stage2-asset add",title:"Assets derive from Characters, Props, Locations & voiced lines"},
          _stEl("div",{className:"stage2-asset-vis"}, Icon.plus&&_stEl(Icon.plus,{s:18})),
          _stEl("div",{className:"stage2-asset-lab"},"Derived"))),
      _stEl("div",{className:"stage2-budget "+budgetState},
        _stEl("div",{className:"stage2-budget-top"},
          _stEl("span",null,"Seedance input budget"),
          _stEl("b",null,budgetUsed+" / "+assetLimit),
          _stEl("em",null,budgetText)),
        _stEl("div",{className:"stage2-budget-bar"}, _stEl("i",{style:{width:budgetPct+"%"}}))),
      assetOver && _stEl("div",{className:"stage2-warn"}, Icon.alert&&_stEl(Icon.alert,{s:12}), "Too many inputs selected. Exclude "+budgetOverBy+" optional asset"+(budgetOverBy!==1?"s":"")+" before rendering.")));

  // ----- RIGHT: the original Seedance panel -----
  const CAPS = ["Multimodal video generation","Up to 12 assets combined","Typical clip length 4–15s",
    "Strong motion stability","Character consistency","Native audio","Director controls"];
  const right = _stEl("div",{className:"stage2-panel"},
    _stEl("div",{className:"stage2-panel-card"},
      _stEl("div",{className:"stage2-panel-head"},
        _stEl("span",{className:"stage2-panel-t"},"Seedance 2.0"),
        _stEl("span",{className:"stage2-panel-v"},"v2.0")),
      _stEl("div",{className:"stage2-caps"},
        CAPS.map((c,i)=> _stEl("div",{key:i,className:"stage2-cap"}, _stEl("span",{className:"stage2-cap-d"}), c)))),
    // mode selector
    _stEl("div",{className:"stage2-modes"},
      MODES.map(m=> _stEl("button",{key:m[0],className:"stage2-mode"+(mode===m[0]?" on":""),
        onClick:()=>setModeOverride(m[0])}, m[1]))),
    // assets summary
    _stEl("div",{className:"stage2-sec-lab"},"ASSETS SUMMARY"),
    _stEl("div",{className:"stage2-summary"},
      [["Text",counts.text],["Images",counts.images],["Videos",counts.videos],["Audio",counts.audio]].map((s,i)=>
        _stEl("div",{key:i,className:"stage2-sum"},
          _stEl("div",{className:"stage2-sum-k"},s[0]),
          _stEl("div",{className:"stage2-sum-n"}, s[1])))),
    _stEl("div",{className:"stage2-budget stage2-budget-panel "+budgetState},
      _stEl("div",{className:"stage2-budget-top"},
        _stEl("span",null,"Budget"),
        _stEl("b",null,budgetUsed+" / "+assetLimit),
        _stEl("em",null,budgetText)),
      _stEl("div",{className:"stage2-budget-bar"}, _stEl("i",{style:{width:budgetPct+"%"}}))),
    // controls
    _stEl("div",{className:"stage2-sec-lab"},"CONTROLS"),
    _stEl("div",{className:"stage2-ctrls"},
      _ctrlRow("Camera movement", _stEl("input",{className:"stage2-inp",value:camera,onChange:e=>setCamera(e.target.value)})),
      _ctrlRow("Lighting", _stEl("input",{className:"stage2-inp",value:lighting,onChange:e=>setLighting(e.target.value)})),
      _ctrlRow("Performance", _stEl("input",{className:"stage2-inp",value:perf,onChange:e=>setPerf(e.target.value)})),
      _ctrlRow("Audio", hasDialogue
        ? (voiceReady
          ? _stEl("div",{className:"stage2-lockval",title:"Locked to rendered character line audio"}, "Locked voice", _stEl("span",null, voicedLineCount+" line"+(voicedLineCount!==1?"s":"")))
          : _stEl("div",{className:"stage2-lockval warn",title:"Run Voice all lines before rendering this dialogue clip"}, "Needs voice", _stEl("span",null, voicedLineCount+" / "+(d.lineShots||[]).length)))
        : _stEl("div",{className:"stage2-lockval",title:"No dialogue in this clip"}, "Native audio", _stEl("span",null,"silent clip"))),
      _ctrlRow("Quality mode", _stEl("div",{className:"stage2-toggle"},
        _stEl("button",{className:"stage2-tg"+(quality==="standard"?" on":""),onClick:()=>setQuality("standard")},"Standard"),
        _stEl("button",{className:"stage2-tg"+(quality==="turbo"?" on":""),onClick:()=>setQuality("turbo")}, Icon.sparkles&&_stEl(Icon.sparkles,{s:12}),"Turbo"))),
      needsVoice
        ? _ctrlRow("Clip duration", _stEl("div",{className:"stage2-lockval warn",title:"Duration is created by the line audio"}, "Needs voice", _stEl("span",null,"not timed")))
        : measuredSec
        ? _ctrlRow("Clip duration", _stEl("div",{className:"stage2-lockval",title:"Locked to measured line audio"}, _fmtSecs(measuredSec), _stEl("span",null,"from voice")))
        : _ctrlRow("Clip duration", _stEl("div",{className:"stage2-lockval",title:"Estimated from the shot sequence until real audio exists"}, _fmtSecs(duration), _stEl("span",null,"estimate")))),
    // generate
    gen.err && _stEl("div",{className:"stage2-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), gen.err),
    !sourceReady && _stEl("div",{className:"stage2-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), useHalves
      ? "Sheet halves are selected, but this clip has no saved storyboard halves yet. In Storyboards, generate or upload the matching 2x2 sheet, then Save halves."
      : "Shot frames are selected, but this clip has no first shot frame yet. Generate the frame in the Shot List or switch to Sheet halves."),
    assetOver && _stEl("div",{className:"stage2-err"}, Icon.alert&&_stEl(Icon.alert,{s:13}), "Asset budget is over by "+budgetOverBy+". Exclude optional assets before rendering."),
      gening
        ? _stEl("div",{className:"stage2-gen-busy"},
            _stEl("div",{className:"stage2-gen-prog"}, _stEl("div",{className:"orb"}), (gen.status||"Rendering…")),
            _stEl("button",{className:"stage2-extend",onClick:gen.cancel},"Cancel render"))
      : _stEl(React.Fragment,null,
          needsVoice && onVoiceLine && _stEl("button",{className:"stage2-extend",onClick:onVoiceClip,disabled:voicingClip},
            Icon.mic&&_stEl(Icon.mic,{s:13}), voicingClip?"Voicing clip…":"Voice this clip"),
          _stEl("button",{className:"stage2-generate",onClick:onGenerate,disabled:assetOver||needsVoice||!sourceReady},
            Icon.sparkles&&_stEl(Icon.sparkles,{s:15}), gen.videoUrl?"Re-generate clip":"Generate clip"),
          _stEl("button",{className:"stage2-extend",onClick:onExtend,disabled:!gen.videoUrl},
            Icon.pencil&&_stEl(Icon.pencil,{s:13}),"Extend / edit")),
    _stEl("div",{className:"stage2-credit"}, Icon.sparkles&&_stEl(Icon.sparkles,{s:11}),"Uses 1 generation credit"));

  return _stEl("div",{className:"stage2-console"}, center, right);
}
function _ctrlRow(label, control){ return _stEl("div",{className:"stage2-ctrl"},
  _stEl("span",{className:"stage2-ctrl-l"}, label), control); }

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

function StageView({ project, scenes, shots, characters, locations, props, beatsMap, drafts, onVoiceAll, voicingLines, onCancelVoiceAll, onVoiceLine }){
  const [visualSource, _setVisualSource] = React.useState(_stageSavedSource);
  const setVisualSource = React.useCallback((v)=>{
    const next = v==="halves" ? "halves" : "shots";
    _setVisualSource(next);
    try{ localStorage.setItem("turn_stage_visual_source", next); }catch(e){}
  },[]);
  const ordered = React.useMemo(()=> (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0)), [scenes]);
  const charById = React.useMemo(()=>{ const m={}; (characters||[]).forEach(c=>{ m[c.id]=c; }); return m; }, [characters]);
  const propById = React.useMemo(()=>{ const m={}; (props||[]).forEach(p=>{ m[p.id]=p; }); return m; }, [props]);
  const shotsByScene = React.useMemo(()=>{ const m={}; (shots||[]).forEach(s=>{ (m[s.sceneId]=m[s.sceneId]||[]).push(s); });
    Object.values(m).forEach(arr=>arr.sort((a,b)=>(a.order||0)-(b.order||0)||(a.beatN||0)-(b.beatN||0))); return m; }, [shots]);
  const scenesWithShots = ordered.filter(s=>(shotsByScene[s.id]||[]).length);
  const clipMax = (typeof clipMaxFor==="function") ? clipMaxFor(project) : (window.CLIP_MAX_SECONDS||15);
  const clipsByScene = React.useMemo(()=>{ const m={};
    scenesWithShots.forEach(s=>{ m[s.id]=(typeof sceneSequences==="function")?sceneSequences(shotsByScene[s.id]||[], clipMax):[]; });
    return m; }, [scenesWithShots, shotsByScene, clipMax]);

  const ctx = { characters, charById, props, propById, locations, project, beatsMap, drafts };
  const aspect = _stageAspect(project);
  const charSig = JSON.stringify((characters||[]).map(c=>[c.id,c.name]));
  const propSig = JSON.stringify((props||[]).map(p=>[p.id,p.name]));
  const locSig = JSON.stringify((locations||[]).map(l=>[l.id,l.name,(l.scenes||[]).join("|")]));
  const draftSig = JSON.stringify(Object.entries(drafts||{}).map(([id,d])=>[id,(d&&d.version)||"",((d&&d.blocks)||[]).map(b=>[b.beat,b.type,b.text]).join("|")]));
  const beatsSig = JSON.stringify(Object.entries(beatsMap||{}).map(([id,b])=>[id,((b&&b.rows)||[]).map(r=>[r.n,r&&r.drive&&r.drive.d,r&&r.react&&r.react.d]).join("|")]));

  // flatten clips with labels + derived data
  const allClips = React.useMemo(()=>{ const out=[];
    scenesWithShots.forEach(scene=>{ (clipsByScene[scene.id]||[]).forEach(g=>{
      out.push({ id:(typeof clipVidId==="function")?clipVidId(scene.id,g.index):("clip-"+scene.id+"-"+g.index),
        label:_pad2(scene.no)+_clipLetter(g.index), scene, g, data:buildClipData(scene, g, ctx) }); }); });
    return out; }, [scenesWithShots, clipsByScene, charSig, propSig, locSig, draftSig, beatsSig, project]);

  // load every needed image (shot frames + storyboard clip sheets/halves + character / location / prop sheets) into one map
  const shotIdsKey = (shots||[]).map(s=>s.id).join(",");
  const charIdsKey = (characters||[]).map(c=>c.id).join(",");
  const locIdsKey = (locations||[]).map(l=>l.id).join(",");
  const propIdsKey = (props||[]).map(p=>p.id).join(",");
  const neededIds = React.useMemo(()=>{ const s=new Set();
    (shots||[]).forEach(sh=>s.add(sh.id)); (characters||[]).forEach(c=>s.add(c.id));
    (locations||[]).forEach(l=>s.add(l.id)); (props||[]).forEach(p=>s.add(p.id));
    allClips.forEach(c=>{ const ids=storyboardClipIds(c); (ids.all||[]).forEach(id=>s.add(id)); });
    return Array.from(s); }, [shotIdsKey, charIdsKey, locIdsKey, propIdsKey, allClips.map(c=>c.id).join(",")]);
  const [imgs, setImgs] = React.useState({});
  const [imgTick, setImgTick] = React.useState(0);
  React.useEffect(()=>{ const h=()=>setImgTick(x=>x+1); window.addEventListener("nb-gen-done", h); window.addEventListener("nb-prefetched", h); return ()=>{ window.removeEventListener("nb-gen-done", h); window.removeEventListener("nb-prefetched", h); }; }, []);
  React.useEffect(()=>{ let alive=true;
    (async()=>{ const out={};
      for(const id of neededIds){ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
        if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } if(u) out[id]=u; }
      if(alive) setImgs(out); })();
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

  const clipIdsKey = allClips.map(c=>c.id).join(",");
  const [vids, setVids] = React.useState({});
  const [vidTick, setVidTick] = React.useState(0);
  React.useEffect(()=>{ const h=()=>setVidTick(x=>x+1); window.addEventListener("vid-done", h); return ()=>window.removeEventListener("vid-done", h); }, []);
  React.useEffect(()=>{ let alive=true;
    (async()=>{ const out={};
      for(const c of allClips){ let u=(typeof vidGetVideo==="function")?vidGetVideo(c.id):"";
        if(!u && typeof vidLoadVideo==="function"){ try{ u=await vidLoadVideo(c.id); }catch(e){} } if(u) out[c.id]=u; }
      if(alive) setVids(out); })();
    return ()=>{ alive=false; }; }, [clipIdsKey, vidTick]);

  const [selId, setSelId] = React.useState(allClips[0] ? allClips[0].id : null);
  const [mode, setMode] = React.useState("board");
  const [actOpen, setActOpen] = React.useState({1:true,2:true,3:true});

  if(!scenesWithShots.length){
    return _stEl("div",{className:"stage2-root"},
      _stEl("div",{className:"prop-empty"},
        _stEl("div",{className:"art-soon-ic"}, Icon.clapper&&_stEl(Icon.clapper,{s:30})),
        _stEl("div",{className:"art-soon-t"},"Nothing to stage yet"),
        _stEl("div",{className:"art-soon-d"},"The Stage turns your shots into video clips. Break your scenes into shots in the Art Room → Shots first, then come back.")));
  }

  // the director console — one clip at a time
  const clip = allClips.find(c=>c.id===selId) || allClips[0];
  const clipIdx = allClips.findIndex(c=>c.id===clip.id);
  const prevClipVideoId = clipIdx>0 ? allClips[clipIdx-1].id : null;
  // left rail: the STORY SPINE — acts → scenes (charge dot) → clips (beat names),
  // mirroring the Writers' Room rail. Acts collapse; clips are the selectable leaves.
  const acts = [1,2,3].map(a=>({ act:a, scenes:scenesWithShots.filter(s=>(s.act||1)===a) })).filter(a=>a.scenes.length);
  const rail = _stEl("div",{className:"stage2-rail"},
    _stEl("div",{className:"stage2-rail-head"},
      Icon.layers&&_stEl(Icon.layers,{s:12}), _stEl("span",null,"Story Spine")),
    acts.map(a=> _stEl("div",{key:a.act,className:"tree-act"},
      _stEl("div",{className:"tree-act-head",onClick:()=>setActOpen(o=>({...o,[a.act]:!o[a.act]}))},
        _stEl("span",{style:{color:"var(--txt-2)",display:"flex"}}, _stEl(actOpen[a.act]?Icon.chevD:Icon.chevR,{s:13})),
        _stEl("span",{className:"tree-act-no"}, ["I","II","III"][a.act-1]),
        _stEl("span",{className:"tree-act-title"}, STAGE_ACT_TITLES[a.act]||("Act "+a.act)),
        _stEl("span",{className:"tree-act-count"}, a.scenes.length)),
      actOpen[a.act] && _stEl("div",{className:"tree-scenes"},
        a.scenes.map(scene=>{ const cs=allClips.filter(c=>c.scene.id===scene.id);
          return _stEl("div",{key:scene.id,className:"stage2-scene-grp"},
            _stEl("div",{className:"stage2-scene-row"},
              _stEl("span",{className:"tree-scene-no"}, _pad2(scene.no)),
              _stEl("span",{className:"tree-scene-dot",style:{background:chargeColor(scene)}}),
              _stEl("span",{className:"stage2-scene-ttl"}, scene.title||scene.loc)),
            _stEl("div",{className:"stage2-cliplist"},
              cs.map(function(c){
                const done=clipVideoReady(c, vids);
                return _stEl("button",{key:c.id,className:"stage2-cliprow"+(c.id===clip.id?" on":""),onClick:()=>{ setSelId(c.id); setMode("timeline"); },title:scene.loc+" — "+clipBeatName(c, beatsMap, drafts)},
                  _stEl("span",{className:"stage2-clip-lab"}, c.label),
                  _stEl("span",{className:"stage2-clip-beat"}, clipBeatName(c, beatsMap, drafts)),
                  done
                    ? _stEl("span",{className:"stage2-clip-done",title:"Rendered"}, Icon.play&&_stEl(Icon.play,{s:9}))
                    : _stEl("span",{className:"stage2-clip-dur"}, c.data.dur+"s")
                );
              })
            )
          );
        })
      )
    ))
    );
    const renderedCount = allClips.filter(c=>clipVideoReady(c, vids)).length;
    const voicedCount = allClips.filter(c=>clipVoiceState(c,auds).key==="ready").length;
    const frameCount = allClips.filter(c=>clipFrameState(c,imgs,visualSource).key==="ready").length;
    const stageHead = _stEl("div",{className:"stage2-head"},
      _stEl("div",{className:"stage2-head-left"},
        _stEl("div",{className:"stage2-head-title"},"The Stage"),
        _stEl("div",{className:"stage2-head-meta"},
          _stEl("span",null, allClips.length+" clips"),
          _stEl("span",null, frameCount+" "+(visualSource==="halves"?"halves":"frames")),
          _stEl("span",null, voicedCount+" voiced"),
          _stEl("span",null, renderedCount+" rendered"),
          _stEl("span",null, aspect))),
      _stEl("div",{className:"stage2-head-actions"},
        _stEl("div",{className:"stage2-nav"},
          [["board","Board"],["timeline","Timeline"]].map(m=>
            _stEl("button",{key:m[0],className:"stage2-navbtn"+(mode===m[0]?" on":""),onClick:()=>setMode(m[0])}, m[1]))),
        onVoiceAll && _stEl("div",{className:"stage2-voiceall"},
          voicingLines
            ? _stEl(React.Fragment,null,
                _stEl("span",{className:"stage2-voiceprog"}, "Voicing "+voicingLines.done+" / "+voicingLines.total),
                _stEl("button",{className:"stage2-link",onClick:onCancelVoiceAll},"Cancel"))
            : _stEl("button",{className:"stage2-link primary",onClick:onVoiceAll}, Icon.mic&&_stEl(Icon.mic,{s:13}),"Voice all lines"))));
    return _stEl("div",{className:"stage2-root",style:_stageAspectCss(aspect)},
      _stEl("div",{className:"stage2-body"}, rail,
        _stEl("div",{className:"stage2-main"},
          stageHead,
          mode==="board"
            ? _stEl(StageBoard,{scenesWithShots,allClips,imgs,auds,vids,beatsMap,drafts,visualSource,selectedId:clip.id,aspect,
                onSelect:(id)=>{ setSelId(id); setMode("timeline"); }})
            : _stEl(ClipConsole,{ key:clip.id, clip, ctx, imgs, auds, beatsMap, drafts, prevClipVideoId, aspect, visualSource, setVisualSource, onVoiceLine }))));
  }
window.StageView = StageView;

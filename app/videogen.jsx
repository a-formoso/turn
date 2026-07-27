/* videogen.jsx — VIDEO generation (Seedance 2.0 via fal.ai) for the Stage, Phase 3.
   The async twin of voicegen.jsx: a shot FRAME + the locked-voice LINE AUDIO →
   a lip-synced clip. Runs through the SAME server proxy (image-proxy, task:"video"),
   using the proxy's FAL_KEY server secret, with admin API Keys able to override for testing.
   Videos take minutes, so the flow is
   SUBMIT → POLL (each proxy call is short; the waiting is the client's poll loop).
   See docs/Voice & Lip-Sync (Seedance) Plan.md §6A.

   Public surface:
     seedanceGenerate(id, { frameUrl, audioUrl, prompt, durationMs, aspectRatio,
                            resolution, fast, seed, generateAudio, endImageUrl,
                            force, onStatus, shouldCancel })
       -> { videoUrl, seed, cached }
     vidGetVideo(id) / vidGetMeta(id) / vidGetTakes(id) / vidLoadVideo(id) / vidLoadTakes(id) / vidClear(id)
     useSeedanceGen(id) -> { videoUrl, status, gening, err, generate, clear }
*/

const VID_MODEL      = "bytedance/seedance-2.0/reference-to-video";
const VID_MODEL_FAST = "bytedance/seedance-2.0/fast/reference-to-video";
// the dedicated image-to-video endpoint — used only for start->end frame transitions.
// reference-to-video's multi-asset shape (image_urls[]) has no confirmed end_image_url
// support; the singular image-to-video endpoint does, so a transition request switches
// to this pair instead of guessing at an undocumented field on the multimodal endpoint.
const VID_MODEL_I2V      = "bytedance/seedance-2.0/image-to-video";
const VID_MODEL_I2V_FAST = "bytedance/seedance-2.0/fast/image-to-video";
window.VID_MODEL = VID_MODEL; window.VID_MODEL_FAST = VID_MODEL_FAST;
window.VID_MODEL_I2V = VID_MODEL_I2V; window.VID_MODEL_I2V_FAST = VID_MODEL_I2V_FAST;

// video always runs server-side — proxy on + signed-in
function videoProxyReady(){
  return !!(window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxy
    && typeof window.sbClient==="function" && window.sbClient());
}
window.videoProxyReady = videoProxyReady;

// ---- local IndexedDB for rendered clip URLs + meta (the fal.media URL is a CDN link) ---
const VIDIDB_DB="turn-video", VIDIDB_STORE="video";
let _vidIdbPromise=null;
function vidIdbOpen(){
  if(_vidIdbPromise) return _vidIdbPromise;
  _vidIdbPromise = new Promise((res,rej)=>{
    try{
      if(!window.indexedDB){ rej(new Error("no idb")); return; }
      const req=indexedDB.open(VIDIDB_DB,1);
      req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(VIDIDB_STORE)) db.createObjectStore(VIDIDB_STORE); };
      req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);
    }catch(e){ rej(e); }
  });
  return _vidIdbPromise;
}
function vidIdbSet(k,v){ return vidIdbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(VIDIDB_STORE,"readwrite"); tx.objectStore(VIDIDB_STORE).put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); })); }
function vidIdbGet(k){ return vidIdbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(VIDIDB_STORE,"readonly"); const r=tx.objectStore(VIDIDB_STORE).get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); })); }
function vidIdbDel(k){ return vidIdbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(VIDIDB_STORE,"readwrite"); tx.objectStore(VIDIDB_STORE).delete(k); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); })); }

const _vidMem = new Map();      // id -> { url, meta }
function vidKey(id){ return "v:"+id; }
function vidGetVideo(id){ const e=_vidMem.get(id); return (e&&e.url)||""; }
function vidGetMeta(id){ const e=_vidMem.get(id); return (e&&e.meta)||null; }
function vidGetTakes(id){
  const e=_vidMem.get(id), out=[];
  if(e&&e.url) out.push({ id:id+":current", url:e.url, meta:e.meta||null, current:true });
  (((e&&e.meta&&e.meta.takes)||[])).forEach((t,i)=>{ if(t&&t.url) out.push({ id:id+":take-"+i, url:t.url, meta:t.meta||null, current:false }); });
  return out;
}
async function vidLoadVideo(id){
  const sync=vidGetVideo(id); if(sync) return sync;
  try{ const v=await vidIdbGet(vidKey(id)); if(v && v.url){ _vidMem.set(id,{url:v.url,meta:v.meta||null}); return v.url; } }catch(e){}
  return "";
}
async function vidLoadTakes(id){ await vidLoadVideo(id); return vidGetTakes(id); }
window.vidGetVideo=vidGetVideo; window.vidGetMeta=vidGetMeta; window.vidGetTakes=vidGetTakes; window.vidLoadVideo=vidLoadVideo; window.vidLoadTakes=vidLoadTakes;
// drop the in-memory clip cache (call on project switch so no video leaks across films)
function vidResetAll(){ _vidMem.clear(); }
window.vidResetAll=vidResetAll;

// stable per-clip asset id (a sceneSequences group → one Seedance generation)
function clipVidId(sceneId, index){ return "clip-"+sceneId+"-"+index; }
window.clipVidId=clipVidId;
/* CONTENT-STABLE clip id — derived from the MEMBER SHOTS, not the position. Positional
   ids migrate: re-voicing a line changes its duration, repacking shifts every later
   clip's index, and clip #2's takes suddenly display under a different shot group.
   Hashing the shot ids means a clip keeps its takes as long as it's the same shots. */
function clipStableId(sceneId, shots){
  const key = (shots||[]).map(s=>s&&s.id).filter(Boolean).join("|");
  let h=5381; for(let i=0;i<key.length;i++){ h=((h<<5)+h+key.charCodeAt(i))|0; }
  return "clip-"+sceneId+"-s"+(h>>>0).toString(36);
}
window.clipStableId=clipStableId;
/* one-time MIGRATION: takes saved under the old positional id move to the stable id
   the first time the clip is seen (queued like every store write; no-op afterwards). */
function vidAdoptTakes(id, legacyId){
  if(!id || !legacyId || id===legacyId) return Promise.resolve(null);
  return _vidQueued(async ()=>{
    const cur = await _vidLoadEntry(id);
    if(cur && cur.url) return null;                      // already migrated / has its own takes
    const old = await _vidLoadEntry(legacyId);
    if(!old || !old.url) return null;
    await _vidWriteEntry(id, old);
    _vidMem.delete(legacyId);
    try{ await vidIdbDel(vidKey(legacyId)); }catch(e){}
    return { migrated:true };
  });
}
window.vidAdoptTakes=vidAdoptTakes;

// skip-if-unchanged: same assets + prompt + settings → reuse the existing clip
function vidHash(assets, prompt, settings){
  const tail = (u)=> String(u||"").slice(-120);
  const a = Array.isArray(assets)
    ? assets.map(tail)
    : [tail(assets&&assets.frameUrl), tail(assets&&assets.audioUrl)];   // back-compat (frame,audio)
  const s = JSON.stringify({ a, p:prompt||"", st:settings||{} });
  let h=5381; for(let i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))|0; }
  return (h>>>0).toString(36);
}
window.vidHash=vidHash;

/* Commits are SERIALIZED through a queue: a batch render finishes N takes near-
   simultaneously, and vidCommit's read-merge-write of the take list would otherwise
   let a later commit clobber an earlier one's take. */
let _vidCommitQ = Promise.resolve();
function _vidQueued(run){
  const p = _vidCommitQ.then(run, run);
  _vidCommitQ = p.catch(()=>{});
  return p;
}
function vidCommitQueued(id, url, meta){
  return _vidQueued(()=>_vidCommitRaw(id, url, meta));
}
async function _vidCommitRaw(id, url, meta){
  const prev = _vidMem.get(id) || (async()=>{ try{ return await vidIdbGet(vidKey(id)); }catch(e){ return null; } })();
  const old = prev && typeof prev.then==="function" ? await prev : prev;
  const takes = [];
  const oldMeta = (old&&old.meta)||null;
  if(old&&old.url&&old.url!==url) takes.push({ url:old.url, meta:oldMeta, savedAt:(oldMeta&&oldMeta.createdAt)||Date.now() });
  ((oldMeta&&oldMeta.takes)||[]).forEach(t=>{ if(t&&t.url&&t.url!==url&&!takes.some(x=>x.url===t.url)) takes.push(t); });
  meta = { ...(meta||{}) };
  /* STABLE version number: assigned once on first commit, carried by the take forever
     (never renumbered when older takes roll over) — restoring an old take keeps its vno. */
  if(meta.vno==null){
    const nums = [oldMeta&&oldMeta.vno].concat(takes.map(t=>t&&t.meta&&t.meta.vno)).map(Number).filter(n=>n>0);
    meta.vno = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  }
  // APPROVED takes never roll over; everything else keeps the newest 20
  const capped = [];
  takes.forEach(t=>{ const ap = t&&t.meta&&t.meta.status==="approved"; if(ap || capped.length<20) capped.push(t); });
  meta = { ...meta, createdAt:meta.createdAt||Date.now(), takes:capped };
  _vidMem.set(id, { url, meta:meta||null });
  if(typeof window.cloudCommitVideo==="function" && typeof window.nbBackend==="function" && window.nbBackend()==="cloud"){
    try{ const r=await window.cloudCommitVideo(id, url, meta); if(r && r.url){ _vidMem.set(id,{url:r.url,meta:meta||null}); } }catch(e){}
  }
  try{ await vidIdbSet(vidKey(id), { url, meta:meta||null }); }catch(e){}
  try{ window.dispatchEvent(new CustomEvent("vid-done",{ detail:{ ids:[id] } })); }catch(e){}
  return { url };
}
async function vidClear(id){
  _vidMem.delete(id);
  try{ await vidIdbDel(vidKey(id)); }catch(e){}
  try{ window.dispatchEvent(new CustomEvent("vid-done",{ detail:{ ids:[id] } })); }catch(e){}
}
const vidCommit = vidCommitQueued;   // every commit path goes through the queue
window.vidCommit=vidCommit; window.vidClear=vidClear;

/* ---- Versions-view helpers — approve / annotate / restore / delete ONE take.
   All writes run through the same serialized queue as commits so a mid-batch
   completion can never clobber an approval. The clip entry shape is
   { url, meta:{ ..., takes:[{url, meta, savedAt}] } } — current first. ---- */
async function _vidLoadEntry(id){
  let e = _vidMem.get(id);
  if(!e){ try{ e = await vidIdbGet(vidKey(id)); }catch(err){ e = null; } if(e) _vidMem.set(id, e); }
  return e || null;
}
async function _vidWriteEntry(id, e){
  _vidMem.set(id, e);
  try{ await vidIdbSet(vidKey(id), e); }catch(err){}
  try{ window.dispatchEvent(new CustomEvent("vid-done",{ detail:{ ids:[id] } })); }catch(err){}
  return e;
}
// merge a meta patch into one take (current or archived), matched by url
function vidUpdateTake(id, url, patch){
  return _vidQueued(async ()=>{
    const e = await _vidLoadEntry(id); if(!e || !e.url) return null;
    if(e.url===url) return _vidWriteEntry(id, { url:e.url, meta:{ ...(e.meta||{}), ...patch } });
    const takes = ((e.meta&&e.meta.takes)||[]).map(t=> (t&&t.url===url) ? { ...t, meta:{ ...(t.meta||{}), ...patch } } : t);
    return _vidWriteEntry(id, { url:e.url, meta:{ ...(e.meta||{}), takes } });
  });
}
// one approved take per clip: approving a url clears the star everywhere else
function vidApproveTake(id, url, on){
  return _vidQueued(async ()=>{
    const e = await _vidLoadEntry(id); if(!e || !e.url) return null;
    const set = (m, hit)=>{ const n = { ...(m||{}) }; if(hit && on) n.status="approved"; else delete n.status; return n; };
    const takes = ((e.meta&&e.meta.takes)||[]).map(t=> ({ ...t, meta:set(t&&t.meta, t&&t.url===url) }));
    return _vidWriteEntry(id, { url:e.url, meta:{ ...set(e.meta, e.url===url), takes } });
  });
}
// make an archived take the CURRENT one (the old current becomes a take; vno travels)
function vidRestoreTake(id, url){
  return _vidQueued(async ()=>{
    const e = await _vidLoadEntry(id); if(!e) return null;
    const t = ((e.meta&&e.meta.takes)||[]).find(x=>x&&x.url===url);
    if(!t) return null;
    const m = { ...(t.meta||{}) }; delete m.takes;
    return _vidCommitRaw(id, t.url, m);
  });
}
// delete one take; deleting the current promotes the newest remaining take
function vidDeleteTake(id, url){
  return _vidQueued(async ()=>{
    const e = await _vidLoadEntry(id); if(!e || !e.url) return null;
    const takes = ((e.meta&&e.meta.takes)||[]);
    if(e.url===url){
      const next = takes[0];
      if(!next){ _vidMem.delete(id); try{ await vidIdbDel(vidKey(id)); }catch(err){}
        try{ window.dispatchEvent(new CustomEvent("vid-done",{ detail:{ ids:[id] } })); }catch(err){}
        return { cleared:true }; }
      return _vidWriteEntry(id, { url:next.url, meta:{ ...(next.meta||{}), takes:takes.slice(1) } });
    }
    return _vidWriteEntry(id, { url:e.url, meta:{ ...(e.meta||{}), takes:takes.filter(t=>!(t&&t.url===url)) } });
  });
}
window.vidUpdateTake=vidUpdateTake; window.vidApproveTake=vidApproveTake;
window.vidRestoreTake=vidRestoreTake; window.vidDeleteTake=vidDeleteTake;

// ---- the proxy call (task:"video") ------------------------------------------
async function vidProxy(op, payload){
  if(!videoProxyReady()) throw new Error("Video runs through your server proxy — sign in and make sure Supabase + the proxy are configured.");
  const sb = window.sbClient();
  const fnName = (window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxyFn) || "image-proxy";
  let data, error;
  try{ ({ data, error } = await sb.functions.invoke(fnName, { body:{ task:"video", op, ...(payload||{}),
    userApiKeys: window.turnApiKeysForProxy ? window.turnApiKeysForProxy(["fal"]) : undefined } })); }
  catch(e){ error=e; }
  if(error){
    const status=(error&&error.context&&error.context.status)||error.status||0;
    const _safe = window.turnSafeError || (x=>x);
    if(status===401) throw new Error("Sign in to render video — it runs on your server, not the browser.");
    if(status===404) throw new Error(_safe("The media proxy isn't deployed yet. Deploy supabase/functions/image-proxy (the video route), then have an administrator set FAL_KEY."));
    throw new Error(_safe("Couldn't reach the video proxy: "+((error&&error.message)||"unknown error")+"."));
  }
  if(data && data.error) throw new Error((window.turnSafeError||(x=>x))(data.error));   // fal error relayed by the proxy
  return data||{};
}

// ---- render ONE clip: multimodal assets (frame/images + line audio + ref videos) →
//      lip-synced mp4; cache by hash. Seedance 2.0 takes up to ~12 combined assets. ----
function _dedupCap(arr, cap){ const out=[], seen=new Set();
  (arr||[]).forEach(u=>{ if(u && !seen.has(u)){ seen.add(u); out.push(u); } });
  return cap ? out.slice(0,cap) : out; }
function _blobToDataUrl(blob){
  return new Promise((resolve,reject)=>{
    try{
      const r = new FileReader();
      r.onload = ()=>resolve(String(r.result||""));
      r.onerror = ()=>reject(r.error||new Error("Could not read media blob."));
      r.readAsDataURL(blob);
    }catch(e){ reject(e); }
  });
}
async function vidProxyReadyUrl(url){
  url = String(url||"");
  if(!url) return "";
  if(/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url;
  if(/^blob:/i.test(url)){
    const res = await fetch(url);
    if(!res.ok) throw new Error("One selected Stage asset is no longer available in this browser. Re-open or regenerate it, then try Generate clip again.");
    return await _blobToDataUrl(await res.blob());
  }
  return url;
}
async function vidProxyReadyUrls(urls){
  const out = [];
  for(const u of (urls||[])){
    const r = await vidProxyReadyUrl(u);
    if(r) out.push(r);
  }
  return out;
}
window.vidProxyReadyUrl = vidProxyReadyUrl;

/* fal validates audio references at >= 2.0s ("Audio duration is too short. Minimum is
   2.0 seconds."); a short spoken line ("Yes.") measures well under that. Pad the decoded
   audio with trailing silence and re-encode as 16-bit WAV before staging. Best-effort:
   any fetch/decode failure sends the original through untouched. */
const VID_MIN_AUDIO_SEC = 2.4;
function _vidWavFromBuffer(buf, frames){
  const ch = Math.min(2, buf.numberOfChannels||1), rate = buf.sampleRate;
  const data = new DataView(new ArrayBuffer(44 + frames*ch*2));
  const ws = (o,s)=>{ for(let i=0;i<s.length;i++) data.setUint8(o+i, s.charCodeAt(i)); };
  ws(0,"RIFF"); data.setUint32(4, 36 + frames*ch*2, true); ws(8,"WAVE");
  ws(12,"fmt "); data.setUint32(16,16,true); data.setUint16(20,1,true); data.setUint16(22,ch,true);
  data.setUint32(24,rate,true); data.setUint32(28,rate*ch*2,true); data.setUint16(32,ch*2,true); data.setUint16(34,16,true);
  ws(36,"data"); data.setUint32(40, frames*ch*2, true);
  for(let c=0;c<ch;c++){
    const src = buf.getChannelData(Math.min(c, buf.numberOfChannels-1));
    for(let i=0;i<frames;i++){
      const v = i<src.length ? Math.max(-1, Math.min(1, src[i])) : 0;
      data.setInt16(44 + (i*ch+c)*2, v<0 ? v*0x8000 : v*0x7FFF, true);
    }
  }
  return new Blob([data.buffer], { type:"audio/wav" });
}
let _vidAC = null;
async function vidPadShortAudio(url){
  try{
    if(!/^(data:audio|blob:|https?:)/i.test(String(url||""))) return url;
    const res = await fetch(url); if(!res.ok) return url;
    const raw = await res.arrayBuffer();
    _vidAC = _vidAC || new (window.AudioContext||window.webkitAudioContext)();
    const dec = await _vidAC.decodeAudioData(raw.slice(0));
    if(!dec || dec.duration >= 2.05) return url;      // already clears fal's 2.0s floor
    const frames = Math.ceil(dec.sampleRate * VID_MIN_AUDIO_SEC);
    return await _blobToDataUrl(_vidWavFromBuffer(dec, frames));
  }catch(e){ return url; }
}
window.vidPadShortAudio = vidPadShortAudio;

/* ---- RELOAD/CRASH RECOVERY: a render is a server-side fal job — if the page reloads
   mid-poll the job still finishes, but nobody collects it (credits spent, take lost).
   Every submitted job persists in localStorage until it definitively completes; the
   next load re-polls the leftovers once and commits any finished video as a take. ---- */
const VID_PENDING_KEY = "turn_vid_pending";
function _vidPendingList(){ try{ return JSON.parse(localStorage.getItem(VID_PENDING_KEY)||"[]")||[]; }catch(e){ return []; } }
function _vidPendingSave(list){ try{ localStorage.setItem(VID_PENDING_KEY, JSON.stringify(list.slice(-12))); }catch(e){} }
function _vidPendingAdd(job){ const l=_vidPendingList().filter(j=>j.requestId!==job.requestId); l.push(job); _vidPendingSave(l); }
function _vidPendingRemove(requestId){ _vidPendingSave(_vidPendingList().filter(j=>j.requestId!==requestId)); }
async function vidRecoverPending(){
  const list = _vidPendingList(); if(!list.length) return 0;
  let saved = 0;
  for(const j of list){
    if(!j || !j.requestId || (Date.now()-(j.at||0)) > 6*3600*1000){ if(j&&j.requestId) _vidPendingRemove(j.requestId); continue; }
    try{
      const st = await vidProxy("poll", { model:j.model, statusUrl:j.statusUrl, responseUrl:j.responseUrl });
      if(st.status==="COMPLETED" && st.videoUrl){
        await vidCommit(j.id, st.videoUrl, { ...(j.meta||{}), seed:st.seed||null, recovered:true });
        _vidPendingRemove(j.requestId); saved++;
      } else if(st.error){ _vidPendingRemove(j.requestId); }
      // still IN_QUEUE / IN_PROGRESS → leave it for the next load
    }catch(e){}
  }
  if(saved && typeof window.appToast==="function")
    window.appToast(saved===1 ? "Recovered a finished render from before the reload — it's saved in its clip's takes." : ("Recovered "+saved+" finished renders from before the reload — saved as takes."),"success");
  return saved;
}
window.vidRecoverPending = vidRecoverPending;
// one recovery pass per load, after the auth/proxy state has settled
setTimeout(()=>{ try{ if(videoProxyReady()) vidRecoverPending(); }catch(e){} }, 4000);

async function seedanceGenerate(id, opts){
  opts = opts||{};
  // assemble the multimodal asset lists (single frameUrl/audioUrl kept for back-compat)
  const images = _dedupCap([opts.frameUrl, ...(opts.imageUrls||[])], 9);
  const videos = _dedupCap(opts.videoUrls||[], 3);
  const audios = _dedupCap([opts.audioUrl, ...(opts.audioUrls||[])], 3);
  if(!images.length && !videos.length) throw new Error("This clip has no start frame yet — generate the shot's frame in the Shot List first.");
  /* SORA 2 rides the same queue but a different shape: the tier names its fal endpoint
     (opts.falModel), takes ONE start image, and has no video/audio refs, no end-frame
     transition, no seed. The proxy maps the payload to Sora's field names + snaps the
     duration to its 4/8/12/16/20s grid. */
  const isSora = /sora-2/.test(String(opts.falModel||""));
  /* KLING 3.0 rides the same queue: ONE start image (identity rides the frame — no
     reference sheets, no audio refs; speech is generated natively by the model),
     optional end frame, and NATIVE MULTI-SHOT — opts.multiShot [{prompt,duration}]
     maps to Kling's multi_prompt so each Multi-shot row renders on its own prompt. */
  const isKling = /kling-video/.test(String(opts.falModel||""));
  // a start->end frame transition only makes sense with exactly a start image and no
  // video/audio refs — those require the multimodal reference-to-video shape instead.
  // (Kling takes end_image_url natively on its one endpoint — no endpoint switch.)
  const endFrame = isSora ? "" : (opts.endImageUrl||"").trim();
  const useTransition = !isKling && !!(endFrame && images.length && !videos.length && !audios.length);
  const model = (isSora || isKling) ? opts.falModel
    : useTransition
    ? (opts.fast ? VID_MODEL_I2V_FAST : VID_MODEL_I2V)
    : (opts.fast ? VID_MODEL_FAST : VID_MODEL);
  // audio-as-clock: the measured line duration sets the clip length (Seedance/Kling 3–15s; Sora up to 20s)
  const duration = opts.durationMs ? Math.max(isKling?3:4, Math.min(isSora?20:15, Math.round(opts.durationMs/1000))) : (opts.duration||"auto");
  const klingShots = (isKling && Array.isArray(opts.multiShot))
    ? opts.multiShot.map(s=>({ prompt:String(s&&s.prompt||"").trim(), duration:Math.max(1,Math.round(Number(s&&s.duration)||3)) })).filter(s=>s.prompt)
    : [];
  const resolution = String(opts.resolution || "720p").toLowerCase();   // fal's enum is lowercase ("4k")
  const aspectRatio = opts.aspectRatio || "auto";
  const controls = (opts.controls||"").trim();
  const basePrompt = (opts.prompt||"").trim() || (audios.length
    ? "@Image1 comes alive — the character speaks the line in @Audio1 with natural, accurate lip-sync. Subtle, grounded motion; hold the framing and the lighting."
    : "@Image1 comes alive with subtle, natural motion; hold the framing and the lighting.");
  const promptText = controls ? (basePrompt + "\n" + controls) : basePrompt;
  /* generate_audio controls the WHOLE output audio track (SFX, ambience AND the
     lip-synced speech built from audio references) — sending false with audio refs
     yields a silent video, so it stays ON whenever line audio rides along. */
  const generateAudio = opts.generateAudio!=null ? !!opts.generateAudio : true;
  const bitrateMode = opts.bitrateMode==="high" ? "high" : "standard";
  const settings = { model, resolution, aspectRatio, duration, endFrame, generateAudio, bitrateMode, seed:opts.seed!=null?opts.seed:null };
  const hash = vidHash([...images, ...videos, ...audios], promptText, settings);
  // skip-if-unchanged
  if(id && !opts.force){
    const url = vidGetVideo(id) || await vidLoadVideo(id);
    const meta = vidGetMeta(id);
    if(url && meta && meta.hash===hash) return { videoUrl:url, seed:(meta&&meta.seed)||null, cached:true };
  }
  const proxyImages = await vidProxyReadyUrls((isSora||isKling) ? images.slice(0,1) : images);   // Sora/Kling: the start frame only
  const proxyVideos = (isSora||isKling) ? [] : await vidProxyReadyUrls(videos);
  const proxyAudios = [];
  if(!isSora && !isKling) for(const u of await vidProxyReadyUrls(audios)) proxyAudios.push(await vidPadShortAudio(u));
  const proxyEndFrame = (useTransition || (isKling && endFrame)) ? await vidProxyReadyUrl(endFrame) : "";
  const sub = await vidProxy("submit", {
    model, prompt:promptText,
    ...(isKling
      ? { image_url:proxyImages[0],
          ...(proxyEndFrame ? { end_image_url:proxyEndFrame } : {}),
          ...(klingShots.length>1 ? { multi_prompt:klingShots } : {}) }
      : useTransition
      ? { image_url:proxyImages[0], end_image_url:proxyEndFrame }
      : { image_urls:proxyImages,
          ...(proxyVideos.length ? { video_urls:proxyVideos } : {}),
          ...(proxyAudios.length ? { audio_urls:proxyAudios } : {}) }),
    duration, resolution, aspectRatio,
    generateAudio,    // ON with audio refs (they become the speech in the track); user-toggled otherwise
    bitrateMode,      // "high" = less compression / larger file; "standard" = smaller draft
    ...(opts.seed!=null && !isSora && !isKling ? { seed:opts.seed } : {}),   // Sora/Kling have no seed control
  });
  if(!sub.requestId || !sub.statusUrl || !sub.responseUrl) throw new Error("The video proxy didn't accept the job.");
  // persist the job until it DEFINITIVELY completes — a reload mid-poll would otherwise
  // orphan a paid render (recovery re-polls leftovers on the next load). Cancels and
  // timeouts keep the entry on purpose: the job may still finish server-side.
  _vidPendingAdd({ requestId:sub.requestId, id, model, statusUrl:sub.statusUrl, responseUrl:sub.responseUrl, at:Date.now(),
    meta:{ hash, model, durationMs:opts.durationMs||0, aspectRatio, prompt:promptText, ...(opts.takeMeta||{}) } });
  if(opts.onStatus) opts.onStatus(sub.status||"IN_QUEUE");
  // poll until COMPLETED — each call is short; the wait is here on the client
  const pollMs = opts.pollMs || 4000;
  const maxPolls = opts.maxPolls || 150;       // ~10 min ceiling at 4s
  for(let i=0; i<maxPolls; i++){
    if(opts.shouldCancel && opts.shouldCancel()) throw new Error("Render cancelled.");
    await new Promise(r=>setTimeout(r, pollMs));
    const st = await vidProxy("poll", { model, statusUrl:sub.statusUrl, responseUrl:sub.responseUrl });
    if(opts.onStatus && st.status) opts.onStatus(st.status);
    if(st.status==="COMPLETED" && st.videoUrl){
      const meta = { hash, model, durationMs:opts.durationMs||0, aspectRatio, seed:st.seed||null, prompt:promptText,
        ...(opts.takeMeta||{}) };   // Versions-view facts: source, tier, resolution, recipe, audio, batch position…
      if(id) await vidCommit(id, st.videoUrl, meta);
      _vidPendingRemove(sub.requestId);   // delivered — nothing left to recover
      return { videoUrl:st.videoUrl, seed:st.seed||null, cached:false };
    }
  }
  throw new Error("The video render timed out — try again, or pick a faster tier / lower resolution in Render settings.");
}
window.seedanceGenerate=seedanceGenerate;

// ---- React hook (mirrors useVoiceGen) — one clip's video, by asset id --------
function useSeedanceGen(id){
  const [videoUrl,setVideoUrl]=React.useState(()=>vidGetVideo(id));
  const [status,setStatus]=React.useState("");
  const [gening,setGening]=React.useState(false);
  const [err,setErr]=React.useState("");
  const idRef=React.useRef(id); idRef.current=id;
  const cancelRef=React.useRef(false);

  React.useEffect(()=>{ let alive=true;
    if(!vidGetVideo(id)){ vidLoadVideo(id).then(u=>{ if(alive&&u) setVideoUrl(u); }); }
    const onDone=(e)=>{ if(!alive||!e.detail||!e.detail.ids||e.detail.ids.indexOf(idRef.current)<0) return; setVideoUrl(vidGetVideo(idRef.current)); };
    window.addEventListener("vid-done", onDone);
    return ()=>{ alive=false; window.removeEventListener("vid-done", onDone); };
  },[id]);

  const generate = React.useCallback(async (opts)=>{
    cancelRef.current=false; setGening(true); setErr(""); setStatus("IN_QUEUE");
    try{
      const r = await seedanceGenerate(idRef.current, { ...(opts||{}),
        onStatus:setStatus, shouldCancel:()=>cancelRef.current });
      setVideoUrl(r.videoUrl); return r;
    }catch(e){ setErr(String((e&&e.message)||"Video render failed.")); throw e; }
    finally{ setGening(false); setStatus(""); }
  },[]);
  const cancel = React.useCallback(()=>{ cancelRef.current=true; },[]);
  const clear = React.useCallback(async ()=>{ await vidClear(idRef.current); setVideoUrl(""); },[]);

  /* BATCH: N parallel Seedance jobs for the same clip. Each job gets a distinct random
     seed (a pinned seed is honoured on the first job only — identical seeds would just
     produce identical takes); every completion lands as a take via the serialized commit
     queue. Resolves with the successful results; partial failures surface in `err`
     without discarding the takes that did land. */
  const generateBatch = React.useCallback(async (base, count)=>{
    const n = Math.max(1, Math.min(4, Number(count)||1));
    if(n===1) return [await generate(base)];
    cancelRef.current=false; setGening(true); setErr("");
    const states = new Array(n).fill("IN_QUEUE");
    const paint = ()=>{ const done=states.filter(s=>s==="COMPLETED").length;
      setStatus(done+"/"+n+" takes · "+(states.find(s=>s!=="COMPLETED")||"COMPLETED")); };
    paint();
    try{
      const jobs = Array.from({length:n},(_,i)=> seedanceGenerate(idRef.current, { ...(base||{}),
        seed: (base && base.seed!=null && i===0) ? base.seed : undefined,
        takeMeta: { ...((base&&base.takeMeta)||{}), batchIndex:i+1, batchCount:n },
        force:true,
        onStatus:(s)=>{ states[i]=s; paint(); },
        shouldCancel:()=>cancelRef.current }));
      const settled = await Promise.allSettled(jobs);
      const ok = settled.filter(s=>s.status==="fulfilled").map(s=>s.value);
      const bad = settled.filter(s=>s.status==="rejected");
      if(!ok.length){
        const m = String((bad[0]&&bad[0].reason&&bad[0].reason.message)||"Video render failed.");
        setErr(m); throw new Error(m);
      }
      if(bad.length) setErr(bad.length+" of "+n+" takes failed: "+String((bad[0].reason&&bad[0].reason.message)||"render error"));
      setVideoUrl(vidGetVideo(idRef.current));
      return ok;
    } finally { setGening(false); setStatus(""); }
  },[generate]);

  return { videoUrl, status, gening, err, generate, generateBatch, cancel, clear };
}
window.useSeedanceGen=useSeedanceGen;

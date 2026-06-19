/* videogen.jsx — VIDEO generation (Seedance 2.0 via fal.ai) for the Stage, Phase 3.
   The async twin of voicegen.jsx: a shot FRAME + the locked-voice LINE AUDIO →
   a lip-synced clip. Runs through the SAME server proxy (image-proxy, task:"video"),
   so FAL_KEY never touches the browser. Videos take minutes, so the flow is
   SUBMIT → POLL (each proxy call is short; the waiting is the client's poll loop).
   See docs/Voice & Lip-Sync (Seedance) Plan.md §6A.

   Public surface:
     seedanceGenerate(id, { frameUrl, audioUrl, prompt, durationMs, aspectRatio,
                            resolution, fast, seed, force, onStatus, shouldCancel })
       -> { videoUrl, seed, cached }
     vidGetVideo(id) / vidGetMeta(id) / vidGetTakes(id) / vidLoadVideo(id) / vidLoadTakes(id) / vidClear(id)
     useSeedanceGen(id) -> { videoUrl, status, gening, err, generate, clear }
*/

const VID_MODEL      = "bytedance/seedance-2.0/reference-to-video";
const VID_MODEL_FAST = "bytedance/seedance-2.0/fast/reference-to-video";
window.VID_MODEL = VID_MODEL; window.VID_MODEL_FAST = VID_MODEL_FAST;

// video always runs server-side (FAL_KEY is a server secret) — proxy on + signed-in
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

async function vidCommit(id, url, meta){
  const prev = _vidMem.get(id) || (async()=>{ try{ return await vidIdbGet(vidKey(id)); }catch(e){ return null; } })();
  const old = prev && typeof prev.then==="function" ? await prev : prev;
  const takes = [];
  const oldMeta = (old&&old.meta)||null;
  if(old&&old.url&&old.url!==url) takes.push({ url:old.url, meta:oldMeta, savedAt:(oldMeta&&oldMeta.createdAt)||Date.now() });
  ((oldMeta&&oldMeta.takes)||[]).forEach(t=>{ if(t&&t.url&&t.url!==url&&!takes.some(x=>x.url===t.url)) takes.push(t); });
  meta = { ...(meta||{}), createdAt:Date.now(), takes:takes.slice(0,8) };
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
window.vidCommit=vidCommit; window.vidClear=vidClear;

// ---- the proxy call (task:"video") ------------------------------------------
async function vidProxy(op, payload){
  if(!videoProxyReady()) throw new Error("Video runs through your server proxy — sign in and make sure Supabase + the proxy are configured.");
  const sb = window.sbClient();
  const fnName = (window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxyFn) || "image-proxy";
  let data, error;
  try{ ({ data, error } = await sb.functions.invoke(fnName, { body:{ task:"video", op, ...(payload||{}) } })); }
  catch(e){ error=e; }
  if(error){
    const status=(error&&error.context&&error.context.status)||error.status||0;
    if(status===401) throw new Error("Sign in to render video — it runs on your server, not the browser.");
    if(status===404) throw new Error("The media proxy isn't deployed yet. Deploy supabase/functions/image-proxy (the video route) and set FAL_KEY.");
    throw new Error("Couldn't reach the video proxy: "+((error&&error.message)||"unknown error")+".");
  }
  if(data && data.error) throw new Error(data.error);   // fal error relayed by the proxy
  return data||{};
}

// ---- render ONE clip: multimodal assets (frame/images + line audio + ref videos) →
//      lip-synced mp4; cache by hash. Seedance 2.0 takes up to ~12 combined assets. ----
function _dedupCap(arr, cap){ const out=[], seen=new Set();
  (arr||[]).forEach(u=>{ if(u && !seen.has(u)){ seen.add(u); out.push(u); } });
  return cap ? out.slice(0,cap) : out; }

async function seedanceGenerate(id, opts){
  opts = opts||{};
  // assemble the multimodal asset lists (single frameUrl/audioUrl kept for back-compat)
  const images = _dedupCap([opts.frameUrl, ...(opts.imageUrls||[])], 9);
  const videos = _dedupCap(opts.videoUrls||[], 3);
  const audios = _dedupCap([opts.audioUrl, ...(opts.audioUrls||[])], 3);
  if(!images.length && !videos.length) throw new Error("This clip has no start frame yet — generate the shot's frame in the Shot List first.");
  const model = opts.fast ? VID_MODEL_FAST : VID_MODEL;
  // audio-as-clock: the measured line duration sets the clip length (Seedance takes 4–15s)
  const duration = opts.durationMs ? Math.max(4, Math.min(15, Math.round(opts.durationMs/1000))) : (opts.duration||"auto");
  const resolution = opts.resolution || "720p";
  const aspectRatio = opts.aspectRatio || "auto";
  const controls = (opts.controls||"").trim();
  const basePrompt = (opts.prompt||"").trim() || (audios.length
    ? "@Image1 comes alive — the character speaks the line in @Audio1 with natural, accurate lip-sync. Subtle, grounded motion; hold the framing and the lighting."
    : "@Image1 comes alive with subtle, natural motion; hold the framing and the lighting.");
  const promptText = controls ? (basePrompt + "\n" + controls) : basePrompt;
  const settings = { model, resolution, aspectRatio, duration };
  const hash = vidHash([...images, ...videos, ...audios], promptText, settings);
  // skip-if-unchanged
  if(id && !opts.force){
    const url = vidGetVideo(id) || await vidLoadVideo(id);
    const meta = vidGetMeta(id);
    if(url && meta && meta.hash===hash) return { videoUrl:url, seed:(meta&&meta.seed)||null, cached:true };
  }
  const sub = await vidProxy("submit", {
    model, prompt:promptText,
    image_urls:images,
    ...(videos.length ? { video_urls:videos } : {}),
    ...(audios.length ? { audio_urls:audios } : {}),
    duration, resolution, aspectRatio,
    generateAudio: audios.length ? false : true,    // a locked-voice line IS the clip's audio when present
    ...(opts.seed!=null ? { seed:opts.seed } : {}),
  });
  if(!sub.requestId || !sub.statusUrl || !sub.responseUrl) throw new Error("The video proxy didn't accept the job.");
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
      const meta = { hash, model, durationMs:opts.durationMs||0, aspectRatio, seed:st.seed||null, prompt:promptText };
      if(id) await vidCommit(id, st.videoUrl, meta);
      return { videoUrl:st.videoUrl, seed:st.seed||null, cached:false };
    }
  }
  throw new Error("The video render timed out — try again, or switch to the Fast model.");
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

  return { videoUrl, status, gening, err, generate, cancel, clear };
}
window.useSeedanceGen=useSeedanceGen;

/* voicegen.jsx — the VOICE generation + persistence layer for the Stage (audio-first).
   Structural twin of imagegen.jsx's nb* layer, for ElevenLabs audio instead of images.
   Every call goes through the SAME server-side Supabase proxy (the `image-proxy`
   Edge Function, task:"voice"), so the ElevenLabs key never touches the browser
   (Voice & Lip-Sync plan §4 / §8A). Local-first persistence (IndexedDB); cloud is a
   guarded extension hook (window.cloudCommitAudio) wired in a later turn.

   Public surface (mirrors the plan):
     elGenerate(id, text, {voiceId, settings, modelId, force}) -> {audioUrl, durationMs, alignment, cached}
     elDesignVoice(description, {text, modelId})  -> [{generatedVoiceId, audioUrl}]   (audition)
     elSaveVoice(generatedVoiceId, {name, description}) -> {voiceId}                  (the lock)
     elListVoices()                               -> [{voiceId, name, ...}]           (library)
     elCloneVoice(samples[], {name, description}) -> {voiceId}                        (consent-gated)
     vgGetAudio(id) / vgGetMeta(id) / vgLoadAudio(id) / vgClearAudio(id)
     useVoiceGen(id) -> {audioUrl, durationMs, gening, err, generate, clear}
*/

// ---- config -----------------------------------------------------------------
const VG_TTS_MODEL = "eleven_multilingual_v2";      // consistent timbre across every line
const VG_OUTPUT_FORMAT = "mp3_44100_128";
const VG_DEFAULTS = { stability:0.70, similarity:0.75, style:0.10, speed:1.0, speakerBoost:true };
window.VG_DEFAULTS = VG_DEFAULTS; window.VG_TTS_MODEL = VG_TTS_MODEL;

/* voice always runs server-side (the ElevenLabs key is a server secret) — so it needs
   the proxy on, the Supabase client, and a signed-in user. There is no browser-direct path. */
function voiceProxyReady(){
  return !!(window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxy
    && typeof window.sbClient==="function" && window.sbClient());
}
window.voiceProxyReady = voiceProxyReady;

// ---- local IndexedDB store for audio (mp3 data URLs are large, like images) ---
const VGIDB_DB="turn-audio", VGIDB_STORE="audio";
let _vgIdbPromise=null;
function vgIdbOpen(){
  if(_vgIdbPromise) return _vgIdbPromise;
  _vgIdbPromise = new Promise((res,rej)=>{
    try{
      if(!window.indexedDB){ rej(new Error("no idb")); return; }
      const req=indexedDB.open(VGIDB_DB,1);
      req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(VGIDB_STORE)) db.createObjectStore(VGIDB_STORE); };
      req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);
    }catch(e){ rej(e); }
  });
  return _vgIdbPromise;
}
function vgIdbSet(k,v){ return vgIdbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(VGIDB_STORE,"readwrite"); tx.objectStore(VGIDB_STORE).put(v,k); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); })); }
function vgIdbGet(k){ return vgIdbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(VGIDB_STORE,"readonly"); const r=tx.objectStore(VGIDB_STORE).get(k); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); })); }
function vgIdbDel(k){ return vgIdbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(VGIDB_STORE,"readwrite"); tx.objectStore(VGIDB_STORE).delete(k); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); })); }

// in-memory mirror for instant SYNC reads (mirrors imagegen's _nbImgMemory)
const _vgMem = new Map();          // id -> { url, meta }
function vgKey(id){ return "a:"+id; }

function vgGetAudio(id){ const e=_vgMem.get(id); return (e&&e.url)||""; }
function vgGetMeta(id){ const e=_vgMem.get(id); return (e&&e.meta)||null; }
async function vgLoadAudio(id){
  const sync=vgGetAudio(id); if(sync) return sync;
  try{ const v=await vgIdbGet(vgKey(id)); if(v && v.url){ _vgMem.set(id,{url:v.url,meta:v.meta||null}); return v.url; } }catch(e){}
  return "";
}
window.vgGetAudio=vgGetAudio; window.vgGetMeta=vgGetMeta; window.vgLoadAudio=vgLoadAudio;
// drop the in-memory line-audio cache (call on project switch so no audio leaks across films)
function vgResetAll(){ _vgMem.clear(); }
window.vgResetAll=vgResetAll;

// ---- hash for skip-if-unchanged (text + voice + resolved settings) -----------
// Cost discipline (§5): a line whose text/voice/settings haven't changed is never re-rendered.
function vgHash(text, voiceId, settings){
  const s = JSON.stringify({ t:text||"", v:voiceId||"", st:settings||{} });
  let h=5381; for(let i=0;i<s.length;i++){ h=((h<<5)+h+s.charCodeAt(i))|0; }
  return (h>>>0).toString(36);
}
window.vgHash=vgHash;

// ---- persist one rendered line ----------------------------------------------
async function elCommit(id, dataUrl, meta){
  _vgMem.set(id, { url:dataUrl, meta:meta||null });
  // cloud extension hook (the turn_audios table) — guarded; defaults to local IDB until wired
  if(typeof window.cloudCommitAudio==="function" && typeof window.nbBackend==="function" && window.nbBackend()==="cloud"){
    try{ const r=await window.cloudCommitAudio(id, dataUrl, meta); if(r && r.url){ _vgMem.set(id,{url:r.url,meta:meta||null}); } }catch(e){}
  }
  try{ await vgIdbSet(vgKey(id), { url:dataUrl, meta:meta||null }); }catch(e){}
  try{ window.dispatchEvent(new CustomEvent("vg-audio-done",{ detail:{ ids:[id] } })); }catch(e){}
  return { url:dataUrl };
}
async function vgClearAudio(id){
  _vgMem.delete(id);
  try{ await vgIdbDel(vgKey(id)); }catch(e){}
  try{ window.dispatchEvent(new CustomEvent("vg-audio-done",{ detail:{ ids:[id] } })); }catch(e){}
}
window.elCommit=elCommit; window.vgClearAudio=vgClearAudio;

// ---- the proxy call (task:"voice") ------------------------------------------
async function vgProxy(op, payload){
  if(!voiceProxyReady()) throw new Error("Voice runs through your server proxy — sign in and make sure Supabase + the proxy are configured.");
  const sb = window.sbClient();
  const fnName = (window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxyFn) || "image-proxy";
  let data, error;
  try{ ({ data, error } = await sb.functions.invoke(fnName, { body:{ task:"voice", op, ...(payload||{}) } })); }
  catch(e){ error=e; }
  if(error){
    const status=(error&&error.context&&error.context.status)||error.status||0;
    if(status===401) throw new Error("Sign in to render voice — it runs on your server, not the browser.");
    if(status===404) throw new Error("The media proxy isn't deployed yet. Deploy supabase/functions/image-proxy (the voice route) and set ELEVENLABS_API_KEY.");
    throw new Error("Couldn't reach the voice proxy: "+((error&&error.message)||"unknown error")+".");
  }
  if(data && data.error) throw new Error(data.error);   // ElevenLabs error relayed by the proxy
  return data||{};
}

// ---- TTS one line: render + (with-timestamps) duration; cache by hash --------
async function elGenerate(id, text, opts){
  opts = opts||{};
  const voiceId=opts.voiceId; const t=String(text||"").trim();
  if(!voiceId) throw new Error("No locked voice for this character yet — lock one on their character card (the Voice button, Characters tab).");
  if(!t) return { audioUrl:"", durationMs:0 };
  const settings = { ...VG_DEFAULTS, ...(opts.settings||{}) };
  const modelId = opts.modelId || VG_TTS_MODEL;
  const hash = vgHash(t, voiceId, { ...settings, modelId });
  // skip-if-unchanged: same text+voice+settings already rendered for this id → reuse
  if(id && !opts.force){
    const url = vgGetAudio(id) || await vgLoadAudio(id);
    const meta = vgGetMeta(id);
    if(url && meta && meta.hash===hash) return { audioUrl:url, durationMs:meta.durationMs||0, alignment:meta.alignment||null, cached:true };
  }
  const d = await vgProxy("tts", { voiceId, text:t, modelId, settings, outputFormat:VG_OUTPUT_FORMAT });
  if(!d.audioB64) throw new Error("The proxy returned no audio.");
  const audioUrl = "data:"+(d.mime||"audio/mpeg")+";base64,"+d.audioB64;
  const meta = { durationMs:d.durationMs||0, voiceId, text:t, modelId, hash, alignment:d.alignment||null };
  if(id) await elCommit(id, audioUrl, meta);
  return { audioUrl, durationMs:d.durationMs||0, alignment:d.alignment||null, cached:false };
}
window.elGenerate=elGenerate;

// ---- New Story "Talk it through" voice: one-off speak (no caching/commit) + transcribe ----
// Resolve a default interviewer voice once: the account's first voice, else a known public one.
let _interviewVoiceId = "";
async function elInterviewVoiceId(){
  if(_interviewVoiceId) return _interviewVoiceId;
  try{ const r = await elListVoices(); const v = r && r.voices && r.voices[0]; if(v && v.voiceId) _interviewVoiceId = v.voiceId; }catch(e){}
  if(!_interviewVoiceId) _interviewVoiceId = "21m00Tcm4TlvDq8ikWAM";   // ElevenLabs default ("Rachel")
  return _interviewVoiceId;
}
// speak one line and return an audio data URL — NOT committed to the asset store (ephemeral).
async function elSpeak(text, opts){
  opts = opts||{}; const t = String(text||"").trim(); if(!t) return "";
  const voiceId = opts.voiceId || await elInterviewVoiceId();
  const settings = { ...VG_DEFAULTS, ...(opts.settings||{}) };
  const d = await vgProxy("tts", { voiceId, text:t, modelId:opts.modelId||VG_TTS_MODEL, settings, outputFormat:VG_OUTPUT_FORMAT });
  if(!d.audioB64) throw new Error("The proxy returned no audio.");
  return "data:"+(d.mime||"audio/mpeg")+";base64,"+d.audioB64;
}
// transcribe recorded audio (base64 + mime) → text, via the proxy's ElevenLabs Scribe route.
async function elTranscribe(audioB64, mime){
  if(!audioB64) return "";
  const d = await vgProxy("stt", { audioB64, mime: mime||"audio/webm" });
  return String(d.text||"").trim();
}
window.elInterviewVoiceId=elInterviewVoiceId; window.elSpeak=elSpeak; window.elTranscribe=elTranscribe;

// ---- Voice Design: previews to audition before locking ----------------------
async function elDesignVoice(description, opts){
  opts=opts||{};
  const d = await vgProxy("design", { description:String(description||""), text:opts.text, modelId:opts.modelId });
  return (d.previews||[]).map(p=>({
    generatedVoiceId: p.generatedVoiceId,
    audioUrl: p.audioB64 ? ("data:"+(p.mime||"audio/mpeg")+";base64,"+p.audioB64) : "",
  })).filter(p=>p.generatedVoiceId);
}
// lock a chosen preview into a permanent voiceId (the identity lock)
async function elSaveVoice(generatedVoiceId, opts){
  opts=opts||{};
  const d = await vgProxy("saveVoice", { generatedVoiceId, name:opts.name, description:opts.description });
  if(!d.voiceId) throw new Error("Couldn't save that voice — try another preview.");
  return { voiceId:d.voiceId, name:d.name||opts.name };
}
// the account's voices (the "picked from library" origin)
async function elListVoices(){
  const d = await vgProxy("listVoices", {});
  return d.voices||[];
}
// instant clone from samples (consent-gated on the client, like a cameo face)
async function elCloneVoice(samples, opts){
  opts=opts||{};
  if(!samples || !samples.length) throw new Error("Add at least one voice sample to clone.");
  const d = await vgProxy("clone", { samples, name:opts.name, description:opts.description });
  if(!d.voiceId) throw new Error("Cloning failed — check the samples and try again.");
  return { voiceId:d.voiceId, name:d.name||opts.name };
}
window.elDesignVoice=elDesignVoice; window.elSaveVoice=elSaveVoice;
window.elListVoices=elListVoices; window.elCloneVoice=elCloneVoice;

// ---- React hook (mirrors useImageGen) — one line's audio, by asset id --------
function useVoiceGen(id){
  const [audioUrl,setAudioUrl]=React.useState(()=>vgGetAudio(id));
  const [durationMs,setDurationMs]=React.useState(()=>(vgGetMeta(id)||{}).durationMs||0);
  const [gening,setGening]=React.useState(false);
  const [err,setErr]=React.useState("");
  const idRef=React.useRef(id); idRef.current=id;

  React.useEffect(()=>{ let alive=true;
    if(!vgGetAudio(id)){ vgLoadAudio(id).then(u=>{ if(alive&&u){ setAudioUrl(u); setDurationMs((vgGetMeta(id)||{}).durationMs||0); } }); }
    const onDone=(e)=>{ if(!alive||!e.detail||!e.detail.ids||e.detail.ids.indexOf(idRef.current)<0) return;
      setAudioUrl(vgGetAudio(idRef.current)); setDurationMs((vgGetMeta(idRef.current)||{}).durationMs||0); };
    window.addEventListener("vg-audio-done", onDone);
    return ()=>{ alive=false; window.removeEventListener("vg-audio-done", onDone); };
  },[id]);

  const generate = React.useCallback(async (text, opts)=>{
    setGening(true); setErr("");
    try{ const r=await elGenerate(idRef.current, text, opts); setAudioUrl(r.audioUrl); setDurationMs(r.durationMs||0); return r; }
    catch(e){ setErr(String((e&&e.message)||"Voice render failed.")); throw e; }
    finally{ setGening(false); }
  },[]);
  const clear = React.useCallback(async ()=>{ await vgClearAudio(idRef.current); setAudioUrl(""); setDurationMs(0); },[]);

  return { audioUrl, durationMs, gening, err, generate, clear };
}
window.useVoiceGen=useVoiceGen;

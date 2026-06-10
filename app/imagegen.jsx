/* imagegen.jsx — Nano Banana (Gemini 2.5 Flash Image) integration.
   Path B: real client-side image generation with the user's own Google AI Studio
   API key (stored locally). Combines the master reference prompt + negative prompt
   into one final prompt and returns a data URL for the generated character sheet.

   Honest note: the key lives in this browser's localStorage and the call goes
   straight to Google from the page. That's fine for a single creator's tool; a
   multi-user product would proxy this through a backend so keys aren't client-side. */

const NB_KEY = "turn-nanobanana-key";
const NB_MODEL_KEY = "turn-nb-model";
const NB_AR_KEY = "turn-nb-aspect";
const NB_RES_KEY = "turn-nb-res";

/* selectable models. provider:"google" → Nano Banana (Gemini), which runs directly
   from the browser. provider:"openai" → GPT Image, which CANNOT run from the browser
   (OpenAI blocks cross-origin calls); it is offered ONLY when the server-side proxy
   is enabled (window.TURN_SUPABASE.imageProxy), in which case generation is routed
   through the `image-proxy` Supabase Edge Function and the key lives server-side. */
const _imageProxyOn = !!(window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxy);
const NB_MODELS = [
  { id:"gemini-3.1-flash-image", label:"Nano Banana 2",   provider:"google", note:"fast \u00b7 high quality" },
  { id:"gemini-3-pro-image",     label:"Nano Banana Pro", provider:"google", note:"highest fidelity" },
  ...(_imageProxyOn ? [{ id:"gpt-image-2-2026-04-21", label:"GPT Image 2", provider:"openai", via:"proxy", note:"server-side \u00b7 in-image text" }] : []),
];
const NB_ASPECTS = ["16:9","21:9","9:16"];
const NB_RESOLUTIONS = ["1K","2K","4K"];
window.NB_MODELS = NB_MODELS; window.NB_ASPECTS = NB_ASPECTS; window.NB_RESOLUTIONS = NB_RESOLUTIONS;

function nbGetKey(){ try{ return localStorage.getItem(NB_KEY)||""; }catch(e){ return ""; } }
function nbSetKey(k){ try{ k=(typeof sanitizeKey==="function"?sanitizeKey(k):k); k ? localStorage.setItem(NB_KEY,k) : localStorage.removeItem(NB_KEY); }catch(e){} }
function nbHasKey(){ return !!nbGetKey(); }
function nbGetModel(){ try{ const s=localStorage.getItem(NB_MODEL_KEY); if(s && NB_MODELS.find(m=>m.id===s)) return s; if(s){ try{ localStorage.setItem(NB_MODEL_KEY, NB_MODELS[0].id); }catch(e){} } return NB_MODELS[0].id; }catch(e){ return NB_MODELS[0].id; } }
function nbSetModel(m){ try{ localStorage.setItem(NB_MODEL_KEY,m); }catch(e){} }
function nbGetAspect(){ try{ const a=localStorage.getItem(NB_AR_KEY)||"16:9"; return (NB_ASPECTS.indexOf(a)>=0)?a:"16:9"; }catch(e){ return "16:9"; } }
function nbSetAspect(a){ try{ localStorage.setItem(NB_AR_KEY,a); }catch(e){} }
function nbGetRes(){ try{ return localStorage.getItem(NB_RES_KEY)||"2K"; }catch(e){ return "2K"; } }
function nbSetRes(r){ try{ localStorage.setItem(NB_RES_KEY,r); }catch(e){} }
window.nbGetKey = nbGetKey; window.nbSetKey = nbSetKey; window.nbHasKey = nbHasKey;
window.nbGetModel = nbGetModel; window.nbSetModel = nbSetModel;
window.nbGetAspect = nbGetAspect; window.nbSetAspect = nbSetAspect;
window.nbGetRes = nbGetRes; window.nbSetRes = nbSetRes;

/* ---- OpenAI (GPT Image) key — a SECOND provider key, stored separately ---- */
const OAI_KEY = "turn-openai-key";
/* Sanitize a pasted API key: strip ALL whitespace (incl. non-breaking U+00A0),
   zero-width chars, and control/non-printable chars. Mobile paste (email-wrapped
   keys, autocorrect) injects these and a plain .trim() leaves them in the middle
   or as zero-width edges — which corrupts the Bearer header and reads as a 401
   "key rejected" even though the visible characters look correct. */
function sanitizeKey(k){
  return String(k||"")
    .replace(/[\s\u00a0\u200b-\u200d\ufeff]/g, "")  // whitespace + nbsp + zero-width
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")   // control chars
    .trim();
}
window.sanitizeKey = sanitizeKey;
function oaiGetKey(){ try{ return localStorage.getItem(OAI_KEY)||""; }catch(e){ return ""; } }
function oaiSetKey(k){ try{ k=sanitizeKey(k); k ? localStorage.setItem(OAI_KEY,k) : localStorage.removeItem(OAI_KEY); }catch(e){} }
function oaiHasKey(){ return !!oaiGetKey(); }
window.oaiGetKey = oaiGetKey; window.oaiSetKey = oaiSetKey; window.oaiHasKey = oaiHasKey;

/* is the server-side image proxy enabled? When on, ALL providers (Google + OpenAI)
   run through the Edge Function and NO provider key lives in the browser. */
function imageProxyOn(){ return !!(window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxy); }
window.imageProxyOn = imageProxyOn;

/* map a UI slot id to its Storage asset type (drives the {assetType} path segment).
   Slot ids are typed by prefix: charref- / propref- / locref- / locvar- / shot-.
   Cameos take their own "cameo" type via cloudSyncCameo, not this path. */
function slotAssetKind(slotId){
  const s = String(slotId||"");
  if(s.indexOf("propref-")===0) return "prop";
  if(s.indexOf("locref-")===0 || s.indexOf("locvar-")===0) return "location";
  if(s.indexOf("shot-")===0) return "shot";
  if(s.indexOf("charref-")===0) return "character";
  return "asset";
}
window.slotAssetKind = slotAssetKind;

/* which provider a model id belongs to ("google" default for back-compat) */
function providerOfModel(model){
  const m = (window.NB_MODELS||NB_MODELS).find(x=>x.id===model);
  return (m && m.provider) || "google";
}
function nbProviderLabel(provider){ return provider==="openai" ? "GPT Image" : "Nano Banana"; }
/* key presence per provider — used by the key bar and the batch/generate gates.
   OpenAI (GPT Image) goes through the server proxy, which holds the key server-side,
   so the CLIENT needs no OpenAI key — the real gate there is being signed in, which
   the Edge Function enforces and the call surfaces as a clear error if missing. */
function nbHasKeyForModel(model){ return (providerOfModel(model)==="openai" || imageProxyOn()) ? true : nbHasKey(); }
function nbHasKeyForCurrent(){ return nbHasKeyForModel(nbGetModel()); }
window.providerOfModel = providerOfModel; window.nbProviderLabel = nbProviderLabel;
window.nbHasKeyForModel = nbHasKeyForModel; window.nbHasKeyForCurrent = nbHasKeyForCurrent;

/* grounding with Google Search — Nano Banana 2 (gemini-3.1-flash-image) only */
const NB_GROUND_KEY = "turn-nb-ground";
function nbGetGroundSearch(){ try{ return localStorage.getItem(NB_GROUND_KEY)==="1"; }catch(e){ return false; } }
function nbSetGroundSearch(v){ try{ v ? localStorage.setItem(NB_GROUND_KEY,"1") : localStorage.removeItem(NB_GROUND_KEY); }catch(e){} }
window.nbGetGroundSearch = nbGetGroundSearch; window.nbSetGroundSearch = nbSetGroundSearch;

/* simplified fallback prompt — fewer words, less detail, less likely to hit content filters */
function buildSimpleCharPrompt(c){
  const body = ((c.coreBody||c.look)||"").replace(/\.$/,"").trim();
  const wardrobe = ((c.wardrobeMask||c.wardrobe)||"").replace(/\.$/,"").trim();
  const parts = [
    "Character reference \u2014 "+(c.name||"character"),
    body||"",
    wardrobe ? ("wearing "+wardrobe) : "",
    "full-body front view, side profile, and back view",
    "plain grey background, studio lighting, photoreal, sharp focus"
  ].filter(Boolean);
  return parts.join(". ")+".";
}
window.buildSimpleCharPrompt = buildSimpleCharPrompt;

/* master reference prompt + negative prompt -> one final prompt the model receives */
function combinedImagePrompt(c, project){
  const master = (typeof buildCharRefPrompt==="function") ? buildCharRefPrompt(c, project) : "";
  const v = (typeof charVisualDefaults==="function") ? charVisualDefaults(c) : {};
  const neg = (c.negativePrompt || v.negativePrompt || "").trim();
  let s = master;
  if(neg) s += "\n\nAvoid (negative prompt): "+neg.replace(/\.$/,"")+".";
  return s.trim();
}
window.combinedImagePrompt = combinedImagePrompt;

/* ===== storage backend selector: 'local' (IndexedDB) or 'cloud' (Supabase) =====
   The app calls one set of nb* functions; this routes them to the right backend.
   In cloud mode, sync reads come from these caches (filled by the async loaders). */
let _nbBackend = "local";   // 'local' | 'cloud'
let _nbProject = null;      // current cloud project id
let _nbUid = null;          // current cloud user id
const _cloudUrlCache = new Map();    // entityId -> signed url
const _cloudMetaCache = new Map();   // entityId -> meta
function nbUseCloud(projectId, uid){ _nbBackend="cloud"; _nbProject=projectId; _nbUid=uid; _cloudUrlCache.clear(); _cloudMetaCache.clear(); if(typeof nbResetPrefetchAll==="function") nbResetPrefetchAll(); }
function nbUseLocal(){ _nbBackend="local"; _nbProject=null; _nbUid=null; _cloudUrlCache.clear(); _cloudMetaCache.clear(); if(typeof nbResetPrefetchAll==="function") nbResetPrefetchAll(); }
function nbBackend(){ return _nbBackend; }
window.nbUseCloud = nbUseCloud; window.nbUseLocal = nbUseLocal; window.nbBackend = nbBackend;

/* per-character generated image store — 3-tier: localStorage → sessionStorage → in-memory Map */
const _nbImgMemory = new Map();
function nbImgKey(id){ return "turn-charimg-"+id; }
function localGetImage(id){
  const k = nbImgKey(id);
  try{ const v=localStorage.getItem(k); if(v) return v; }catch(e){}
  try{ const v=sessionStorage.getItem(k); if(v) return v; }catch(e){}
  return _nbImgMemory.get(k)||"";
}
/* sync read — cloud cache when in cloud mode, else local 3-tier */
function nbGetImage(id){
  if(_nbBackend==="cloud") return _cloudUrlCache.get(id) || "";
  return localGetImage(id);
}

/* ---- IndexedDB layer: generated sheets are large base64 data URLs (often >1MB),
   which overflow localStorage's ~5MB cap. IndexedDB holds them durably with room
   to spare. Reads are async; the in-memory Map mirrors writes for instant reads. ---- */
const IDB_DB="turn-images", IDB_STORE="images";
let _idbPromise=null;
function idbOpen(){
  if(_idbPromise) return _idbPromise;
  _idbPromise = new Promise((resolve,reject)=>{
    try{
      if(!window.indexedDB){ reject(new Error("no idb")); return; }
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = ()=>{ const db=req.result; if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
      req.onsuccess = ()=>resolve(req.result);
      req.onerror = ()=>reject(req.error);
    }catch(e){ reject(e); }
  });
  return _idbPromise;
}
function idbSet(key,val){ return idbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,"readwrite"); tx.objectStore(IDB_STORE).put(val,key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); })); }
function idbGet(key){ return idbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,"readonly"); const r=tx.objectStore(IDB_STORE).get(key); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); })); }
function idbDel(key){ return idbOpen().then(db=>new Promise((res,rej)=>{ const tx=db.transaction(IDB_STORE,"readwrite"); tx.objectStore(IDB_STORE).delete(key); tx.oncomplete=()=>res(true); tx.onerror=()=>rej(tx.error); })); }

/* async load: memory → localStorage → sessionStorage → IndexedDB (hydrates on mount) */
async function localLoadImage(id){
  const sync = localGetImage(id);
  if(sync) return sync;
  try{ const v = await idbGet(nbImgKey(id)); if(v){ _nbImgMemory.set(nbImgKey(id), v); return v; } }catch(e){}
  return "";
}
/* ---- cloud byte-cache ----------------------------------------------------
   Signed URLs change every session, so the browser's HTTP cache NEVER hits in
   cloud mode — every app load re-downloads every multi-MB sheet. Cache the
   image bytes in IndexedDB keyed by entity and stamped with the storage path:
   same path → instant object URL, zero network; new path (a re-generation)
   → refreshed naturally. One blob per entity, so the cache can't balloon. */
function nbCloudKey(id){ return "turn-cloudimg-"+id; }
const _objUrls = new Map();   // entityId -> { url, path } (released when the path changes)
function _setObjUrl(id, blob, path){
  try{
    const cur = _objUrls.get(id);
    if(cur && cur.path===path) return cur.url;   // same version → reuse, don't churn live URLs
    const u = URL.createObjectURL(blob);
    if(cur){ try{ URL.revokeObjectURL(cur.url); }catch(e){} }
    _objUrls.set(id, { url:u, path });
    return u;
  }catch(e){ return ""; }
}
async function cloudBytesFromCache(id, path){
  const cur = _objUrls.get(id);
  if(cur && cur.path===path) return cur.url;     // already materialized this version
  try{
    const rec = await idbGet(nbCloudKey(id));
    if(rec && rec.path===path && rec.blob) return _setObjUrl(id, rec.blob, path);
  }catch(e){}
  return "";
}
let _byteQueue = Promise.resolve();   // serialize background caching — never hog bandwidth
function cloudCacheBytes(id, path, url){
  if(!path || !url || /^blob:/.test(url)) return;
  _byteQueue = _byteQueue.then(async ()=>{
    try{
      const rec = await idbGet(nbCloudKey(id));
      if(rec && rec.path===path) return;   // already cached for this version
      const res = await fetch(url); if(!res.ok) return;
      const blob = await res.blob();
      await idbSet(nbCloudKey(id), { path, blob });
    }catch(e){}
  }).catch(()=>{});
}
/* one hydrate path for every cloud load result {url, path, meta}: prefer cached
   bytes (instant, offline-tolerant); else paint from the signed URL now and
   cache its bytes in the background for the next session. */
async function cloudHydrate(id, r){
  if(!r || !r.url) return "";
  if(r.path){
    const cached = await cloudBytesFromCache(id, r.path);
    if(cached){ _cloudUrlCache.set(id, cached); _cloudMetaCache.set(id, r.meta||null); return cached; }
    cloudCacheBytes(id, r.path, r.url);
  }
  _cloudUrlCache.set(id, r.url); _cloudMetaCache.set(id, r.meta||null);
  return r.url;
}

async function nbLoadImage(id){
  if(_nbBackend==="cloud"){
    if(_cloudUrlCache.get(id)) return _cloudUrlCache.get(id);
    // a whole-project prefetch may already be in flight — ride it instead of
    // stampeding one DB query + one signing call per mounting card
    if(_prefetchAllPromise && _prefetchAllProj===_nbProject){
      try{ await _prefetchAllPromise; }catch(e){}
      if(_cloudUrlCache.get(id)) return _cloudUrlCache.get(id);
    }
    if(typeof window.cloudAssetLoad!=="function") return "";
    const r = await window.cloudAssetLoad(_nbProject, id);
    return await cloudHydrate(id, r);
  }
  return localLoadImage(id);
}
window.nbLoadImage = nbLoadImage;

/* warm the browser's image cache so it paints instantly when rendered */
function nbPreloadBytes(urls){
  for(const u of (urls||[])){ if(!u) continue; try{ const im = new Image(); im.decoding="async"; im.src=u; }catch(e){} }
}
/* Pre-warm the URL cache (and image bytes) for many entity ids in ONE batched round-trip,
   BEFORE their cards mount — so a tab like Characters shows images immediately instead of
   doing a DB query + signed-URL call per card on click. Skips ids already cached. Cards read
   the warmed cache synchronously via nbGetImage(); a 'nb-prefetched' event nudges any card
   that mounted before warming finished. Safe no-op until a backend is selected. */
async function nbPrefetch(ids){
  ids = Array.from(new Set((ids||[]).filter(id => id && !_cloudUrlCache.get(id) && !nbGetImage(id))));
  if(!ids.length) return;
  if(_nbBackend==="cloud"){
    if(typeof window.cloudAssetLoadMany!=="function") return;
    let map = {};
    try{ map = await window.cloudAssetLoadMany(_nbProject, ids) || {}; }catch(e){ return; }
    const got = [], urls = [];
    for(const id in map){ const u = await cloudHydrate(id, map[id]); if(u){ got.push(id); urls.push(u); } }
    if(got.length){ nbPreloadBytes(urls); window.dispatchEvent(new CustomEvent("nb-prefetched",{ detail:{ ids:got } })); }
  } else {
    const got = [];
    await Promise.all(ids.map(async id=>{ try{ const u = await localLoadImage(id); if(u) got.push(id); }catch(e){} }));
    if(got.length) window.dispatchEvent(new CustomEvent("nb-prefetched",{ detail:{ ids:got } }));
  }
}
window.nbPrefetch = nbPrefetch;

/* Pre-warm EVERY asset URL in the current project in one batched round-trip (memoized per
   project), so ANY Art Room tab paints without a per-card DB + signed-URL call. URLs only —
   bytes are loaded on render (or via nbPreloadFor for the active tab). */
let _prefetchAllProj = null, _prefetchAllPromise = null;
function nbResetPrefetchAll(){ _prefetchAllProj = null; _prefetchAllPromise = null; }
async function nbPrefetchAll(){
  if(_nbBackend!=="cloud") return;
  if(_prefetchAllPromise && _prefetchAllProj===_nbProject) return _prefetchAllPromise;
  _prefetchAllProj = _nbProject;
  _prefetchAllPromise = (async()=>{
    if(typeof window.cloudAssetLoadAll!=="function") return;
    let map = {};
    try{ map = await window.cloudAssetLoadAll(_nbProject) || {}; }catch(e){ return; }
    const got = [];
    for(const id in map){ const u = await cloudHydrate(id, map[id]); if(u) got.push(id); }
    if(got.length) window.dispatchEvent(new CustomEvent("nb-prefetched",{ detail:{ ids:got } }));
  })();
  return _prefetchAllPromise;
}
window.nbPrefetchAll = nbPrefetchAll;

/* Preload image BYTES for entity ids whose URLs are already cached — used for the tab on
   screen so it paints instantly. Capped to a couple screenfuls to bound bandwidth on big
   tabs (the rest lazy-load on scroll). */
async function nbPreloadFor(ids){
  ids = (ids||[]).filter(Boolean).slice(0, 24);
  if(!ids.length) return;
  if(_nbBackend==="cloud"){
    const urls = [];
    for(const id of ids){ const u = _cloudUrlCache.get(id); if(u) urls.push(u); }
    nbPreloadBytes(urls);
  } else {
    await Promise.all(ids.map(async id=>{ try{ await localLoadImage(id); }catch(e){} }));
  }
}
window.nbPreloadFor = nbPreloadFor;

/* local 3-tier save (used by the local backend) */
async function localSetImage(id, url){
  const k = nbImgKey(id);
  if(!url){
    _nbImgMemory.delete(k);
    try{ localStorage.removeItem(k); }catch(e){}
    try{ sessionStorage.removeItem(k); }catch(e){}
    try{ await idbDel(k); }catch(e){}
    try{ await idbDel(nbRefsKey(id)); }catch(e){}
    try{ await idbDel(nbHistKey(id)); }catch(e){}
    return { tier:"none" };
  }
  _nbImgMemory.set(k, url);
  try{ localStorage.removeItem(k); }catch(e){}
  try{ await idbSet(k, url); return { tier:"idb" }; }catch(e){}
  try{ localStorage.setItem(k, url); return { tier:"local" }; }catch(e){}
  try{ sessionStorage.setItem(k, url); return { tier:"session" }; }catch(e){}
  return { tier:"memory" };
}
window.nbGetImage = nbGetImage;

/* reference images used + version history of a generated sheet (IndexedDB — can be large) */
function nbRefsKey(id){ return "turn-charimg-refs-"+id; }
function nbHistKey(id){ return "turn-charimg-hist-"+id; }
async function localGetRefs(id){ try{ return (await idbGet(nbRefsKey(id)))||[]; }catch(e){ return []; } }
async function localSetRefs(id, refs){ try{ (refs&&refs.length) ? await idbSet(nbRefsKey(id), refs) : await idbDel(nbRefsKey(id)); }catch(e){} }
async function localGetHistory(id){ try{ return (await idbGet(nbHistKey(id)))||[]; }catch(e){ return []; } }
async function localSetHistory(id, hist){ try{ (hist&&hist.length) ? await idbSet(nbHistKey(id), hist) : await idbDel(nbHistKey(id)); }catch(e){} }
async function nbGetRefs(id){
  if(_nbBackend==="cloud"){ const d = (typeof window.cloudLoadDetails==="function") ? await window.cloudLoadDetails(_nbProject, id) : null; return d ? d.refs : []; }
  return localGetRefs(id);
}
async function nbGetHistory(id){
  if(_nbBackend==="cloud"){ const d = (typeof window.cloudLoadDetails==="function") ? await window.cloudLoadDetails(_nbProject, id) : null; return d ? d.history : []; }
  return localGetHistory(id);
}
window.nbGetRefs = nbGetRefs;

/* per-character generation metadata (model, aspect, size, date) */
function nbMetaKey(id){ return "turn-charimg-meta-"+id; }
function localGetMeta(id){ try{ return JSON.parse(localStorage.getItem(nbMetaKey(id))||"null"); }catch(e){ return null; } }
function localSetMeta(id, meta){ try{ meta ? localStorage.setItem(nbMetaKey(id),JSON.stringify(meta)) : localStorage.removeItem(nbMetaKey(id)); }catch(e){} }
function nbGetMeta(id){
  if(_nbBackend==="cloud") return _cloudMetaCache.get(id) || null;
  return localGetMeta(id);
}
window.nbGetMeta = nbGetMeta;

/* ============================================================
   CAMEO — "Cast yourself" identity capture (Increments A + B).
   A captured face becomes a persistent, reusable likeness token
   for one character: it is auto-attached as a conditioning
   reference on EVERY generation of that character (base + states)
   so the face stays consistent shot-to-shot.

   Increment B: MULTI-ANGLE capture (front + ¾ left/right) for far
   stronger consistency, full PROVENANCE metadata (source, subject,
   consent, capture date, angle count), and an explicit opt-in to
   SYNC the cameo to the cloud for cross-device use.

   Biometric data → LOCAL-ONLY by default (IndexedDB, this device).
   We only push a cameo to Supabase when sync===true.

   Record shape (IDB, key turn-cameo-<id>):
     { url, angles:[{label,url}], consent, sync, source, subject,
       w, h, iso, date }   — url mirrors angles[0] for back-compat.
   Registry (localStorage, images stripped): meta only.
   ============================================================ */
const _cameoMem = new Map();              // charId -> full record (instant sync reads)
function nbCameoKey(id){ return "turn-cameo-"+id; }
function nbCameoRegKey(){ return "turn-cameo-registry"; }
function cameoReg(){ try{ return JSON.parse(localStorage.getItem(nbCameoRegKey())||"{}"); }catch(e){ return {}; } }
function cameoRegWrite(o){ try{ localStorage.setItem(nbCameoRegKey(), JSON.stringify(o)); }catch(e){} }
function cameoMetaOf(rec){
  return { consent:!!rec.consent, sync:!!rec.sync, source:rec.source||"webcam",
    subject:rec.subject||"", angleCount:(rec.angles&&rec.angles.length)||1,
    w:rec.w||0, h:rec.h||0, iso:rec.iso, date:rec.date };
}
/* normalise any record to the multi-angle shape (handles Increment-A singles) */
function cameoNormalize(rec){
  if(!rec) return null;
  let angles = (rec.angles && rec.angles.length) ? rec.angles.slice()
             : (rec.url ? [{ label:"Front", url:rec.url }] : []);
  angles = angles.filter(a=>a && a.url);
  return { ...rec, angles, url: angles.length ? angles[0].url : (rec.url||"") };
}
/* sync existence + meta (registry is tiny, lives in localStorage) */
function nbHasCameo(id){ return !!cameoReg()[id]; }
function nbCameoMeta(id){ const r=cameoReg()[id]; return r||null; }
/* sync primary url + all angle urls, if already in memory */
function nbGetCameo(id){ const r=_cameoMem.get(id); return r&&r.url ? r.url : ""; }
function nbGetCameoAngles(id){ const r=_cameoMem.get(id); return (r&&r.angles)?r.angles.map(a=>a.url).filter(Boolean):[]; }
/* async load primary url (memory → IDB → cloud-if-synced) */
async function nbLoadCameo(id){
  const full = await nbLoadCameoFull(id);
  return full ? full.url : "";
}
async function nbLoadCameoAngles(id){
  const full = await nbLoadCameoFull(id);
  return full ? full.angles.map(a=>a.url).filter(Boolean) : [];
}
/* async load the FULL record (for the manager + generation) */
async function nbLoadCameoFull(id){
  const m=_cameoMem.get(id); if(m && m.angles && m.angles.length) return m;
  try{ const v=await idbGet(nbCameoKey(id)); if(v){ const n=cameoNormalize(v); _cameoMem.set(id,n); return n; } }catch(e){}
  /* cloud hydrate (only if this cameo was synced) */
  const meta=cameoReg()[id];
  if(meta && meta.sync && typeof window.cloudLoadCameo==="function" && _nbProject){
    try{
      const r = await window.cloudLoadCameo(_nbProject, id);
      if(r){ const n=cameoNormalize(r); _cameoMem.set(id,n); try{ await idbSet(nbCameoKey(id), n); }catch(e){} return n; }
    }catch(e){}
  }
  return null;
}
/* save/replace a cameo. rec = { angles:[{label,url}] | url, consent, sync, source, subject, w, h } */
async function nbSetCameo(id, rec){
  const now=new Date();
  const norm = cameoNormalize({ ...rec,
    iso: now.toISOString(),
    date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) });
  _cameoMem.set(id, norm);
  try{ await idbSet(nbCameoKey(id), norm); }catch(e){}
  const reg=cameoReg(); reg[id]=cameoMetaOf(norm); cameoRegWrite(reg);
  /* cloud sync (opt-in) — upload all angles + provenance row */
  if(norm.sync && typeof window.cloudSyncCameo==="function" && _nbProject && _nbUid){
    try{ await window.cloudSyncCameo(_nbProject, _nbUid, id, norm); }catch(e){}
  } else if(!norm.sync && typeof window.cloudDeleteCameo==="function" && _nbProject){
    /* sync turned off → remove any prior cloud copy */
    try{ await window.cloudDeleteCameo(_nbProject, id); }catch(e){}
  }
  return cameoMetaOf(norm);
}
async function nbClearCameo(id){
  const wasSynced = (cameoReg()[id]||{}).sync;
  _cameoMem.delete(id);
  try{ await idbDel(nbCameoKey(id)); }catch(e){}
  const reg=cameoReg(); delete reg[id]; cameoRegWrite(reg);
  if(wasSynced && typeof window.cloudDeleteCameo==="function" && _nbProject){
    try{ await window.cloudDeleteCameo(_nbProject, id); }catch(e){}
  }
}
/* registry listing for the Cameo Manager: [{id, ...meta}] */
function nbListCameos(){ const reg=cameoReg(); return Object.keys(reg).map(id=>({ id, ...reg[id] })); }
window.nbHasCameo=nbHasCameo; window.nbCameoMeta=nbCameoMeta; window.nbGetCameo=nbGetCameo;
window.nbGetCameoAngles=nbGetCameoAngles; window.nbLoadCameo=nbLoadCameo;
window.nbLoadCameoAngles=nbLoadCameoAngles; window.nbLoadCameoFull=nbLoadCameoFull;
window.nbSetCameo=nbSetCameo; window.nbClearCameo=nbClearCameo; window.nbListCameos=nbListCameos;

/* ===== backend-agnostic commit / clear / revert / details (used by useImageGen) ===== */
async function nbCommit(id, dataUrl, meta, refs, kind){
  if(_nbBackend==="cloud"){
    if(typeof window.cloudCommit!=="function") return { tier:"error", url:dataUrl };
    const r = await window.cloudCommit(_nbProject, _nbUid, id, dataUrl, meta, refs, kind);
    if(r && r.url){
      _cloudUrlCache.set(id, r.url); _cloudMetaCache.set(id, meta||null);
      // we hold the bytes we just generated — warm the byte-cache directly so the
      // next session never re-downloads this sheet
      if(r.path){ try{ const blob = await (await fetch(dataUrl)).blob(); await idbSet(nbCloudKey(id), { path:r.path, blob }); }catch(e){} }
      return r;
    }
    return { tier:"error", url:dataUrl };
  }
  const prev = localGetImage(id);
  if(prev){
    const hist = await localGetHistory(id);
    const prevRefs = await localGetRefs(id);
    hist.unshift({ url:prev, meta:localGetMeta(id), refs:prevRefs });
    await localSetHistory(id, hist.slice(0,12));
  }
  const res = await localSetImage(id, dataUrl);
  await localSetRefs(id, refs||[]);
  localSetMeta(id, meta||null);
  return { tier:(res&&res.tier)||"local", url:dataUrl };
}
async function nbClearAsset(id){
  if(_nbBackend==="cloud"){
    _cloudUrlCache.delete(id); _cloudMetaCache.delete(id);
    try{ await idbDel(nbCloudKey(id)); }catch(e){}   // drop the cached bytes too
    const old = _objUrls.get(id); if(old){ try{ URL.revokeObjectURL(old.url); }catch(e){} _objUrls.delete(id); }
    if(typeof window.cloudClear==="function") await window.cloudClear(_nbProject, id);
    return;
  }
  await localSetImage(id, "");
  localSetMeta(id, null);
}
async function nbRevertAsset(id, index){
  if(_nbBackend==="cloud"){
    if(typeof window.cloudRevert!=="function") return null;
    const r = await window.cloudRevert(_nbProject, _nbUid, id, index);
    if(r){ _cloudUrlCache.set(id, r.url); _cloudMetaCache.set(id, r.meta||null); }
    return r;
  }
  const history = await localGetHistory(id);
  if(index<0 || index>=history.length) return null;
  const chosen = history[index];
  const present = { url: localGetImage(id), meta: localGetMeta(id), refs: await localGetRefs(id) };
  const newHist = history.filter((_,i)=>i!==index);
  if(present.url) newHist.unshift(present);
  await localSetImage(id, chosen.url);
  localSetMeta(id, chosen.meta||null);
  await localSetRefs(id, chosen.refs||[]);
  await localSetHistory(id, newHist.slice(0,12));
  return { url:chosen.url, meta:chosen.meta||null };
}
async function nbLoadDetailsAsset(id, currentUrl){
  if(_nbBackend==="cloud"){
    if(typeof window.cloudLoadDetails==="function") return await window.cloudLoadDetails(_nbProject, id);
    return { id, url:currentUrl, meta:null, refs:[], history:[] };
  }
  const refs = await localGetRefs(id);
  const history = await localGetHistory(id);
  return { id, url:currentUrl, meta:localGetMeta(id), refs, history };
}
window.nbCommit = nbCommit; window.nbClearAsset = nbClearAsset;
window.nbRevertAsset = nbRevertAsset; window.nbLoadDetailsAsset = nbLoadDetailsAsset;

/* delete ONE entry from a sheet's version history (local + cloud). */
async function nbDeleteHistoryEntry(id, index){
  if(_nbBackend==="cloud"){
    if(typeof window.cloudDeleteHistoryEntry!=="function") return false;
    try{ return await window.cloudDeleteHistoryEntry(_nbProject, _nbUid, id, index); }catch(e){ return false; }
  }
  const hist = await localGetHistory(id);
  if(index<0 || index>=hist.length) return false;
  hist.splice(index,1);
  await localSetHistory(id, hist);
  return true;
}
window.nbDeleteHistoryEntry = nbDeleteHistoryEntry;

/* read the image URL from an <image-slot> by querying its shadow DOM */
function nbGetSlotImage(slotId){
  try{
    const el = document.getElementById(slotId);
    if(!el || !el.shadowRoot) return null;
    const img = el.shadowRoot.querySelector(".frame img");
    const src = img && img.getAttribute("src");
    return (src && src.startsWith("data:image/")) ? src : null;
  }catch(e){ return null; }
}
window.nbGetSlotImage = nbGetSlotImage;

/* split a data URL into {mimeType, data} for the API inlineData field */
function nbDataUrlParts(dataUrl){
  try{
    const m = (dataUrl||"").match(/^data:(image\/[^;]+);base64,(.+)$/);
    return m ? { mimeType:m[1], data:m[2] } : null;
  }catch(e){ return null; }
}
window.nbDataUrlParts = nbDataUrlParts;

/* normalize any image reference (data URL or http(s) signed URL) to inlineData
   {mimeType,data} for the API. Cloud refs are signed URLs and must be fetched. */
async function nbToInlineData(src){
  if(!src) return null;
  if(/^data:image\//.test(src)){ return (typeof nbDataUrlParts==="function") ? nbDataUrlParts(src) : null; }
  try{
    const res = await fetch(src);
    const blob = await res.blob();
    const dataUrl = await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(blob); });
    return (typeof nbDataUrlParts==="function") ? nbDataUrlParts(dataUrl) : null;
  }catch(e){ return null; }
}
window.nbToInlineData = nbToInlineData;

/* map our aspect labels to the sizes GPT Image supports (closest match) */
function oaiSize(aspect){
  if(aspect==="9:16") return "1024x1536";          // portrait
  if(aspect==="1:1")  return "1024x1024";           // square
  return "1536x1024";                                // 16:9 / 21:9 → landscape
}
/* any image ref (data URL or signed http URL) -> Blob, for multipart edits */
async function oaiToBlob(src){
  if(!src) return null;
  if(/^data:/.test(src)){
    const p = (typeof nbDataUrlParts==="function") ? nbDataUrlParts(src) : null;
    if(!p) return null;
    const bin = atob(p.data); const arr = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    return new Blob([arr], { type:p.mimeType });
  }
  try{ const r = await fetch(src); return await r.blob(); }catch(e){ return null; }
}
/* any image ref (data URL or signed http URL) -> data URL string, for JSON transport
   to the proxy (the Edge Function reconstructs Blobs server-side for /images/edits). */
async function oaiToDataUrl(src){
  if(!src) return null;
  if(/^data:/.test(src)) return src;
  const blob = await oaiToBlob(src);
  if(!blob) return null;
  return await new Promise((resolve)=>{
    const fr = new FileReader();
    fr.onload = ()=> resolve(fr.result);
    fr.onerror = ()=> resolve(null);
    fr.readAsDataURL(blob);
  });
}
/* Shrink a REFERENCE image before sending it to the proxy. Big 2K refs make the Edge
   Function slow (504 gateway timeouts) and bloat the request body; a reference only needs
   to convey identity / look / composition, so ~1024px JPEG is ample. The OUTPUT resolution
   is unaffected (set separately by imageSize) — only the inputs shrink. Returns the original
   on any failure (a big ref beats no ref). */
async function downscaleRef(dataUrl, maxDim, quality){
  maxDim = maxDim || 1024; quality = quality || 0.85;
  if(!dataUrl || !/^data:/.test(dataUrl)) return dataUrl;
  try{
    return await new Promise((resolve)=>{
      const img = new Image();
      const keep = ()=> resolve(dataUrl);
      img.onload = ()=>{
        try{
          const w0 = img.naturalWidth||img.width, h0 = img.naturalHeight||img.height;
          if(!w0 || !h0){ keep(); return; }
          const scale = Math.min(1, maxDim/Math.max(w0,h0));
          if(scale>=1){ keep(); return; }                  // already small enough
          const w = Math.round(w0*scale), h = Math.round(h0*scale);
          const cv = document.createElement("canvas"); cv.width=w; cv.height=h;
          cv.getContext("2d").drawImage(img, 0, 0, w, h);
          const out = cv.toDataURL("image/jpeg", quality);
          // always prefer the dimension-capped output (the point is fewer pixels for the
          // provider to chew on); only fall back to the original if the export failed.
          resolve(out && /^data:image\/jpeg/.test(out) ? out : dataUrl);
        }catch(e){ keep(); }
      };
      img.onerror = keep;
      img.src = dataUrl;
    });
  }catch(e){ return dataUrl; }
}
window.downscaleRef = downscaleRef;
/* Generate through the SERVER-SIDE proxy (Supabase Edge Function), provider-agnostic.
   The browser never holds a provider key and never calls the provider directly — it
   calls our `image-proxy` function, which holds the key as a server secret and makes
   the request server-side. Used for BOTH OpenAI GPT Image (which can't run in the
   browser at all) and, when imageProxy is on, Google Nano Banana (which can, but is
   routed here too so no key lives client-side). Requires the user to be signed in and
   the function deployed (see supabase/functions/image-proxy/index.ts). Resolves to a
   data URL; mirrors nbGenerate's signature and reports grounding via opts.metaOut. */
async function proxyGenerate(prompt, opts, provider){
  opts = opts || {};
  const model = opts.model || nbGetModel();
  const aspect = opts.aspectRatio || nbGetAspect();
  const imageSize = opts.imageSize || nbGetRes();
  const quality = opts.quality || "high";
  // reference images (for image-edit mode) → data URLs the proxy can rebuild
  const refs = [];
  if(opts.referenceImage) refs.push(opts.referenceImage);
  if(opts.extraImages && opts.extraImages.length) refs.push(...opts.extraImages);
  const images = [];
  for(const src of refs){ let du = await oaiToDataUrl(src); if(du) du = await downscaleRef(du); if(du) images.push(du); }

  const sb = (typeof window.sbClient==="function") ? window.sbClient() : null;
  if(!sb || !sb.functions){
    throw new Error(nbProviderLabel(provider)+" runs through your server proxy, which isn't available. Make sure you're signed in and Supabase is configured.");
  }
  const fnName = (window.TURN_SUPABASE && window.TURN_SUPABASE.imageProxyFn) || "image-proxy";
  const body = { provider, model, prompt, aspect, quality, imageSize, images,
                 groundSearch: !!opts.groundSearch, groundImageSearch: !!opts.groundImageSearch };
  // Only retry true NETWORK-level failures (DNS / "failed to send"): they fail FAST and no
  // server work was done, so a quick retry is safe and cheap. Do NOT retry 5xx/504 \u2014 a 504
  // only comes back after the gateway's full (~150s) timeout, and the Edge Function may STILL
  // be running the expensive generation, so retrying just multiplies the wait and the cost.
  // 504s are surfaced immediately (the real mitigation is the downscaled refs above).
  const statusOf = (err)=> (err && err.context && err.context.status) || (err && err.status) || 0;
  const isNetworkBlip = (err)=> !statusOf(err)
    && /failed to send|name_not_resolved|network|fetch|timeout|load failed/i.test(((err&&err.message)||"")+"");
  let data, error;
  for(let attempt=0; attempt<2; attempt++){
    error = null;
    try{ ({ data, error } = await sb.functions.invoke(fnName, { body })); }
    catch(e){ error = e; }
    if(!error) break;
    if(attempt<1 && isNetworkBlip(error)){ await new Promise(r=>setTimeout(r, 600)); continue; }
    break;
  }
  if(error){
    const status = statusOf(error);
    if(status===401) throw new Error("Sign in to use server-side image generation \u2014 it runs on your server, not in the browser.");
    if(status===404) throw new Error("The image proxy isn't deployed yet. Deploy supabase/functions/image-proxy and set imageProxy:true in supabase-config.js.");
    if(status===504 || status===502 || status===503) throw new Error("The image proxy timed out after retries \u2014 the model is taking too long. Try again, lower the quality (low / medium), or reduce reference images.");
    throw new Error("Couldn't reach the image proxy: "+((error && error.message) || "unknown error")+".");
  }
  if(data && data.error) throw new Error(data.error);          // provider error relayed by the proxy
  if(opts.metaOut && data && typeof data.grounded!=="undefined") opts.metaOut.grounded = !!data.grounded;
  if(data && data.b64) return "data:"+(data.mime||"image/png")+";base64,"+data.b64;
  if(data && data.url) return data.url;
  throw new Error("The proxy returned no image. Try simplifying the prompt.");
}
async function oaiGenerate(prompt, opts){ return proxyGenerate(prompt, opts||{}, "openai"); }
window.proxyGenerate = proxyGenerate;
window.oaiGenerate = oaiGenerate;

/* call Nano Banana; opts={model, aspectRatio, key}. resolves to a data URL or throws. */
async function nbGenerate(prompt, opts){
  opts = opts || {};
  const model = opts.model || nbGetModel();
  const provider = providerOfModel(model);
  /* dispatch to the right provider. OpenAI is always server-side. Google (Nano
     Banana) routes through the proxy too when imageProxy is on (no key in the
     browser); otherwise it calls Google directly with the user's local key. */
  if(provider==="openai") return proxyGenerate(prompt, { ...opts, model }, "openai");
  if(imageProxyOn()) return proxyGenerate(prompt, { ...opts, model }, "google");
  const key = opts.key || nbGetKey();
  if(!key) throw new Error("No API key set.");
  const aspectRatio = opts.aspectRatio || nbGetAspect();
  const imageSize = opts.imageSize || nbGetRes();
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/"+model+":generateContent";
  let res;
  try{
    /* parts: text prompt + optional reference/edit image + extra reference images */
    const parts = [{ text: prompt }];
    if(opts.referenceImage){
      const b64 = await nbToInlineData(opts.referenceImage);
      if(b64) parts.push({ inlineData: b64 });
    }
    if(opts.extraImages && opts.extraImages.length){
      for(const u of opts.extraImages){
        const b = await nbToInlineData(u);
        if(b) parts.push({ inlineData: b });
      }
    }
    /* body — with optional Google Search grounding */
    const reqBody = {
      contents:[{ parts }],
      generationConfig:{ responseModalities:["IMAGE"], imageConfig:{ aspectRatio, imageSize } }
    };
    if(opts.groundSearch){
      const isFlash = model === "gemini-3.1-flash-image";
      reqBody.tools = [{ googleSearch: (isFlash && opts.groundImageSearch)
        ? { searchTypes:{ webSearch:{}, imageSearch:{} } } : {} }];
    }
    res = await fetch(endpoint+"?key="+encodeURIComponent(key), {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(reqBody)
    });
  }catch(e){
    if(typeof navigator!=="undefined" && navigator.onLine===false)
      throw new Error("You appear to be offline. Reconnect and try again.");
    throw new Error("Couldn't reach Google's image API. Check your connection and try again.");
  }
  if(!res.ok){
    let msg = "Generation failed ("+res.status+")";
    try{ const j = await res.json(); if(j && j.error && j.error.message) msg = j.error.message; }catch(e){}
    if(res.status===400 && /api key/i.test(msg)) msg = "That API key was rejected. Check it in Google AI Studio.";
    if(res.status===404) msg = "This model isn't available on your key yet \u2014 try the other model.";
    throw new Error(msg);
  }
  const data = await res.json();
  const cand = (data.candidates||[])[0] || {};
  const parts = (cand.content||{}).parts || [];
  const img = parts.find(p=>p.inlineData && p.inlineData.data);
  if(!img) throw new Error("The model returned no image. Try simplifying the prompt.");
  /* report whether the model ACTUALLY grounded (groundingMetadata present), not just
     whether we requested it — written to opts.metaOut so callers can badge accurately */
  if(opts.metaOut){
    const gm = cand.groundingMetadata || cand.grounding_metadata || null;
    const chunks = gm && (gm.groundingChunks || gm.grounding_chunks || gm.groundingAttributions || []);
    opts.metaOut.grounded = !!(gm && ((chunks && chunks.length) || gm.webSearchQueries || gm.searchEntryPoint));
  }
  return "data:"+(img.inlineData.mimeType||"image/png")+";base64,"+img.inlineData.data;
}
window.nbGenerate = nbGenerate;

/* resize a data URL to a target long-edge and download it */
const NB_RES_PX = { "1K":1024, "2K":2048, "4K":4096 };
async function nbDownload(dataUrl, res, filename){
  const target = NB_RES_PX[res] || 2048;
  const name = filename || ("character-sheet-"+res+".png");
  // last-resort: download/open the original image untouched (used when canvas export
  // isn't possible, e.g. a cross-origin image with no CORS headers -> tainted canvas)
  const direct = ()=>{ try{
    const a = document.createElement("a");
    a.href = dataUrl; a.download = name; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }catch(e){} };
  await new Promise((resolve)=>{
    let settled = false;
    const done = ()=>{ if(!settled){ settled = true; resolve(); } };
    const fail = ()=>{ direct(); done(); };
    const img = new Image();
    img.crossOrigin = "anonymous";                 // so the canvas isn't tainted when CORS allows
    const guard = setTimeout(fail, 15000);          // never hang the UI
    img.onload = ()=>{
      try{
        const long = Math.max(img.width, img.height) || target;
        const scale = Math.min(1, target/long);     // only downscale, never upscale past source
        const w = Math.max(1, Math.round(img.width*scale)), h = Math.max(1, Math.round(img.height*scale));
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h);
        cv.toBlob((blob)=>{
          clearTimeout(guard);
          if(!blob){ fail(); return; }              // tainted canvas -> null blob
          try{
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob); a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
            done();
          }catch(e){ fail(); }
        }, "image/png");
      }catch(e){ clearTimeout(guard); fail(); }      // SecurityError from a tainted canvas
    };
    img.onerror = ()=>{ clearTimeout(guard); fail(); };
    img.src = dataUrl;
  });
}
window.nbDownload = nbDownload;

/* cloud.jsx — Supabase integration for TURN.
   Increment 1: client initialisation + authentication (email + password).
   Projects, cloud doc sync, and the cloud image storage adapter are layered on
   in later increments. Everything here no-ops gracefully when Supabase isn't
   configured or the library hasn't loaded, so the app still runs locally. */

/* ── client ──────────────────────────────────────────────────────────────── */
function sbClient(){
  if(window._sbClient) return window._sbClient;
  const cfg = window.TURN_SUPABASE;
  if(!cfg || !cfg.url || !cfg.anonKey || !window.supabase || !window.supabase.createClient) return null;
  try{
    window._sbClient = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "turn-auth" },
    });
  }catch(e){ return null; }
  return window._sbClient;
}
function cloudConfigured(){ return !!sbClient(); }
window.sbClient = sbClient;
window.cloudConfigured = cloudConfigured;

/* ── auth ────────────────────────────────────────────────────────────────── */
async function cloudSignUp(email, password){
  const sb = sbClient(); if(!sb) return { error:{ message:"Cloud not configured." } };
  return sb.auth.signUp({ email, password });
}
async function cloudSignIn(email, password){
  const sb = sbClient(); if(!sb) return { error:{ message:"Cloud not configured." } };
  return sb.auth.signInWithPassword({ email, password });
}
async function cloudSignOut(){
  const sb = sbClient(); if(!sb) return;
  try{ await sb.auth.signOut(); }catch(e){}
}
async function cloudGetSession(){
  const sb = sbClient(); if(!sb) return null;
  try{ const { data } = await sb.auth.getSession(); return data ? data.session : null; }catch(e){ return null; }
}
/* subscribe to auth changes; returns an unsubscribe fn */
function cloudOnAuth(cb){
  const sb = sbClient(); if(!sb) return ()=>{};
  const { data } = sb.auth.onAuthStateChange((_event, session)=>{ try{ cb(session); }catch(e){} });
  return ()=>{ try{ data.subscription.unsubscribe(); }catch(e){} };
}
function cloudUserEmail(session){ return session && session.user ? (session.user.email||"") : ""; }
function cloudUserId(session){ return session && session.user ? session.user.id : null; }

window.cloudSignUp = cloudSignUp;
window.cloudSignIn = cloudSignIn;
window.cloudSignOut = cloudSignOut;
window.cloudGetSession = cloudGetSession;
window.cloudOnAuth = cloudOnAuth;
window.cloudUserEmail = cloudUserEmail;
window.cloudUserId = cloudUserId;

/* ── projects ────────────────────────────────────────────────────────────────
   A project row holds the whole story `doc` (scenes, characters, props, drafts,
   beats, continuity) as JSON, scoped to the signed-in user by RLS. */
async function cloudListProjects(){
  const sb = sbClient(); if(!sb) return [];
  try{
    const { data, error } = await sb.from("turn_projects")
      .select("id,title,updated_at,created_at").order("updated_at",{ ascending:false });
    if(error) return [];
    return data || [];
  }catch(e){ return []; }
}
async function cloudCreateProject(title, doc){
  const sb = sbClient(); if(!sb) return null;
  const session = await cloudGetSession();
  const uid = session && session.user && session.user.id; if(!uid) return null;
  try{
    const { data, error } = await sb.from("turn_projects")
      .insert({ owner:uid, title: title || "Untitled film", doc: doc || {} }).select().single();
    if(error) return null;
    return data;
  }catch(e){ return null; }
}
async function cloudLoadProject(id){
  const sb = sbClient(); if(!sb) return null;
  try{
    const { data, error } = await sb.from("turn_projects").select("*").eq("id", id).single();
    if(error) return null;
    return data;
  }catch(e){ return null; }
}
async function cloudSaveDoc(id, doc){
  const sb = sbClient(); if(!sb || !id) return;
  try{ await sb.from("turn_projects").update({ doc }).eq("id", id); }catch(e){}
}
async function cloudRenameProject(id, title){
  const sb = sbClient(); if(!sb || !id) return;
  try{ await sb.from("turn_projects").update({ title }).eq("id", id); }catch(e){}
}
async function cloudDeleteProject(id){
  const sb = sbClient(); if(!sb || !id) return;
  try{ await sb.from("turn_projects").delete().eq("id", id); }catch(e){}
}
window.cloudListProjects = cloudListProjects;
window.cloudCreateProject = cloudCreateProject;
window.cloudLoadProject = cloudLoadProject;
window.cloudSaveDoc = cloudSaveDoc;
window.cloudRenameProject = cloudRenameProject;
window.cloudDeleteProject = cloudDeleteProject;

/* ── storage / generations (images) ──────────────────────────────────────────
   Images are uploaded to the private `turn-assets` bucket as real files; the
   turn_generations row keeps the storage path + metadata + reference list +
   version history (paths, not blobs). The app sees short-lived signed URLs. */
function turnBucket(){ const c = window.TURN_SUPABASE; return (c && c.bucket) || "turn-assets"; }
function dataUrlToBlob(dataUrl){
  const m = /^data:(.*?);base64,(.*)$/.exec(dataUrl || "");
  if(!m) return null;
  const mime = m[1] || "image/png";
  try{
    const bin = atob(m[2]); const u8 = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type:mime });
  }catch(e){ return null; }
}
const _signCache = new Map();   // path -> { url, exp }
async function cloudSignedUrl(path){
  if(!path) return "";
  const now = Date.now();
  const c = _signCache.get(path);
  if(c && c.exp > now + 30000) return c.url;
  const sb = sbClient(); if(!sb) return "";
  try{
    const { data, error } = await sb.storage.from(turnBucket()).createSignedUrl(path, 3600);
    if(error || !data) return "";
    _signCache.set(path, { url:data.signedUrl, exp: now + 3600*1000 });
    return data.signedUrl;
  }catch(e){ return ""; }
}
/* Batch sign many paths (cache-aware, chunked). Returns { path: url }. */
async function cloudSignedUrlsBatch(paths){
  const out = {}; const now = Date.now(); const need = [];
  for(const p of (paths||[])){ if(!p) continue; const c=_signCache.get(p);
    if(c && c.exp > now + 30000) out[p]=c.url; else if(need.indexOf(p)<0) need.push(p); }
  const sb = need.length ? sbClient() : null;
  if(sb){
    for(let i=0;i<need.length;i+=100){            // chunk so a big project stays within limits
      const chunk = need.slice(i, i+100);
      try{
        const { data } = await sb.storage.from(turnBucket()).createSignedUrls(chunk, 3600);
        for(const d of (data||[])){ if(d && d.signedUrl && d.path){
          _signCache.set(d.path, { url:d.signedUrl, exp: now + 3600*1000 }); out[d.path]=d.signedUrl; } }
      }catch(e){}
    }
  }
  return out;
}
/* Storage path convention (forward-only — see supabase/README.md and storage.sql):
     {userId}/{projectId}/{assetType}/{entityId}/{role}[-v{N}]-{timestamp}-{shortId}.png
   Level 1 MUST be the user id: RLS in storage.sql pins it to auth.uid(). Only stable
   IDs appear in the path — never mutable display names — so renaming a project or
   character never orphans a file. assetType ∈ character|prop|location|shot|cameo;
   role ∈ sheet|ref-<kind>|<cameo-angle>. The optional v{N} is a NON-AUTHORITATIVE
   version-at-birth hint (the live version shown in Details comes from the DB and
   stays correct after restore/delete; this filename token never changes). The
   {timestamp}-{shortId} remains the real uniqueness key (collision-proof). Old files
   keep their original paths and keep working; only new uploads use this. */
function turnSafeSeg(s){ return String(s==null?"":s).replace(/[^a-zA-Z0-9_:-]/g,"_"); }
function turnStamp(){
  const d = new Date(), p = (n)=>String(n).padStart(2,"0");   // sortable UTC YYYYMMDD-HHMMSS
  return ""+d.getUTCFullYear()+p(d.getUTCMonth()+1)+p(d.getUTCDate())+"-"+p(d.getUTCHours())+p(d.getUTCMinutes())+p(d.getUTCSeconds());
}
function turnShortId(){
  const u = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now()+"-"+Math.random().toString(36).slice(2));
  return String(u).replace(/-/g,"").slice(0,8);
}
function turnStoragePath(uid, projectId, entityId, assetType, role, ext, version){
  const vtag = (version!=null && version!=="") ? ("v"+turnSafeSeg(version)+"-") : "";
  return uid+"/"+projectId+"/"+turnSafeSeg(assetType||"asset")+"/"+turnSafeSeg(entityId)+"/"
    + turnSafeSeg(role||"file")+"-"+vtag+turnStamp()+"-"+turnShortId()+"."+(ext||"png");
}
window.turnStoragePath = turnStoragePath;   // exposed for inspection / tests

async function cloudUploadImage(projectId, uid, entityId, dataUrl, assetType, role, version){
  const sb = sbClient(); if(!sb) return null;
  const blob = dataUrlToBlob(dataUrl); if(!blob) return null;
  const path = turnStoragePath(uid, projectId, entityId, assetType, role, "png", version);
  try{
    const { error } = await sb.storage.from(turnBucket()).upload(path, blob, { contentType:blob.type, upsert:false });
    if(error) return null;
    return path;
  }catch(e){ return null; }
}
async function cloudRemovePaths(paths){
  const sb = sbClient(); if(!sb || !paths || !paths.length) return;
  try{ await sb.storage.from(turnBucket()).remove(paths.filter(Boolean)); }catch(e){}
}
async function cloudGetGen(projectId, entityId){
  const sb = sbClient(); if(!sb) return null;
  try{
    const { data } = await sb.from("turn_generations").select("*")
      .eq("project_id", projectId).eq("entity_id", entityId).maybeSingle();
    return data || null;
  }catch(e){ return null; }
}
async function cloudUpsertGen(projectId, uid, entityId, fields){
  const sb = sbClient(); if(!sb) return null;
  try{
    const { data } = await sb.from("turn_generations")
      .upsert({ project_id:projectId, owner:uid, entity_id:entityId, ...fields }, { onConflict:"project_id,entity_id" })
      .select().single();
    return data || null;
  }catch(e){ return null; }
}

/* commit a new generation: upload image, roll the previous one into history,
   upload + store reference images, persist metadata. refs in = [{kind,label,url}]. */
async function cloudCommit(projectId, uid, entityId, dataUrl, meta, refs, kind){
  const assetType = kind || "character";   // {assetType} path segment (see turnStoragePath)
  // version-at-birth hint in the filename (non-authoritative; the live version comes
  // from the DB). refs/cameo angles aren't versioned, so they pass no version.
  const ver = (meta && meta.version) || 1;
  const newPath = await cloudUploadImage(projectId, uid, entityId, dataUrl, assetType, "sheet", ver);
  if(!newPath) return null;
  const row = await cloudGetGen(projectId, entityId);
  let history = (row && row.history) || [];
  if(row && row.storage_path){
    history = [{ storage_path:row.storage_path, meta:row.meta||{}, refs:row.refs||[] }, ...history];
    if(history.length > 12){ const drop = history.slice(12); history = history.slice(0,12); cloudRemovePaths(drop.map(h=>h.storage_path)); }
  }
  const refRows = [];
  for(const r of (refs || [])){
    let p = null;
    if(r.url) p = await cloudUploadImage(projectId, uid, entityId, r.url, assetType, "ref-"+turnSafeSeg(r.kind||"img"));
    refRows.push({ kind:r.kind, label:r.label, storage_path:p });
  }
  await cloudUpsertGen(projectId, uid, entityId, { storage_path:newPath, meta:meta||{}, refs:refRows, history });
  const url = await cloudSignedUrl(newPath);
  return { tier:"cloud", url, path:newPath };
}
async function cloudAssetLoad(projectId, entityId){
  const row = await cloudGetGen(projectId, entityId);
  if(!row || !row.storage_path) return null;
  const url = await cloudSignedUrl(row.storage_path);
  return { url, path: row.storage_path, meta: row.meta || null };
}
/* Batch-load many assets: ONE lean DB query for all entity ids + ONE batched signing,
   instead of a query+sign per entity. Returns { entityId: { url, meta } }. Used to
   pre-warm the image cache so a tab (e.g. Characters) shows instantly. */
async function cloudAssetLoadMany(projectId, entityIds){
  const sb = sbClient();
  const ids = Array.from(new Set((entityIds||[]).filter(Boolean)));
  if(!sb || !ids.length) return {};
  let rows = [];
  try{
    const { data } = await sb.from("turn_generations")
      .select("entity_id, storage_path, meta")
      .eq("project_id", projectId).in("entity_id", ids);
    rows = data || [];
  }catch(e){ return {}; }
  const urlByPath = await cloudSignedUrlsBatch(rows.filter(r=>r.storage_path).map(r=>r.storage_path));
  const out = {};
  for(const r of rows){ const u = r.storage_path && urlByPath[r.storage_path]; if(u) out[r.entity_id] = { url:u, path:r.storage_path, meta:r.meta||null }; }
  return out;
}
/* Load EVERY current asset in a project in one lean query + batched signing. Format-agnostic
   (covers characters, props, locations, shots, variants — whatever has a generation), so the
   whole Art Room can be pre-warmed at once. Returns { entityId: { url, meta } }. */
async function cloudAssetLoadAll(projectId){
  const sb = sbClient();
  if(!sb || !projectId) return {};
  let rows = [];
  try{
    const { data } = await sb.from("turn_generations")
      .select("entity_id, storage_path, meta").eq("project_id", projectId);
    rows = data || [];
  }catch(e){ return {}; }
  const urlByPath = await cloudSignedUrlsBatch(rows.filter(r=>r.storage_path).map(r=>r.storage_path));
  const out = {};
  for(const r of rows){ const u = r.storage_path && urlByPath[r.storage_path]; if(u) out[r.entity_id] = { url:u, path:r.storage_path, meta:r.meta||null }; }
  return out;
}
async function cloudClear(projectId, entityId){
  const row = await cloudGetGen(projectId, entityId);
  if(!row) return;
  const paths = [];
  if(row.storage_path) paths.push(row.storage_path);
  (row.history||[]).forEach(h=>{ if(h.storage_path) paths.push(h.storage_path); });
  (row.refs||[]).forEach(r=>{ if(r.storage_path) paths.push(r.storage_path); });
  cloudRemovePaths(paths);
  const sb = sbClient(); try{ await sb.from("turn_generations").delete().eq("project_id",projectId).eq("entity_id",entityId); }catch(e){}
}
async function cloudRevert(projectId, uid, entityId, index){
  const row = await cloudGetGen(projectId, entityId);
  if(!row) return null;
  const history = (row.history || []).slice();
  if(index<0 || index>=history.length) return null;
  const chosen = history[index];
  const present = { storage_path:row.storage_path, meta:row.meta||{}, refs:row.refs||[] };
  let newHist = history.filter((_,i)=>i!==index);
  if(present.storage_path) newHist.unshift(present);
  await cloudUpsertGen(projectId, uid, entityId, { storage_path:chosen.storage_path, meta:chosen.meta||{}, refs:chosen.refs||[], history:newHist.slice(0,12) });
  const url = await cloudSignedUrl(chosen.storage_path);
  return { url, meta: chosen.meta || null };
}
/* delete ONE history entry (and its stored image) from a cloud generation row. */
async function cloudDeleteHistoryEntry(projectId, uid, entityId, index){
  const row = await cloudGetGen(projectId, entityId);
  if(!row) return false;
  const history = (row.history || []).slice();
  if(index<0 || index>=history.length) return false;
  const removed = history.splice(index,1)[0];
  await cloudUpsertGen(projectId, uid, entityId, { storage_path:row.storage_path, meta:row.meta||{}, refs:row.refs||[], history });
  if(removed && removed.storage_path) cloudRemovePaths([removed.storage_path]);
  return true;
}
window.cloudDeleteHistoryEntry = cloudDeleteHistoryEntry;
async function cloudLoadDetails(projectId, entityId){
  const row = await cloudGetGen(projectId, entityId);
  if(!row) return { id:entityId, url:"", meta:null, refs:[], history:[] };
  const url = row.storage_path ? await cloudSignedUrl(row.storage_path) : "";
  const refs = [];
  for(const r of (row.refs||[])) refs.push({ kind:r.kind, label:r.label, url: r.storage_path ? await cloudSignedUrl(r.storage_path) : "" });
  const history = [];
  for(const h of (row.history||[])) history.push({ url: h.storage_path ? await cloudSignedUrl(h.storage_path) : "", meta: h.meta || {} });
  return { id:entityId, url, meta: row.meta || null, refs, history };
}
window.cloudCommit = cloudCommit;
window.cloudAssetLoad = cloudAssetLoad;
window.cloudAssetLoadMany = cloudAssetLoadMany;
window.cloudAssetLoadAll = cloudAssetLoadAll;
window.cloudClear = cloudClear;
window.cloudRevert = cloudRevert;
window.cloudLoadDetails = cloudLoadDetails;
window.cloudGetGen = cloudGetGen;
window.cloudSignedUrl = cloudSignedUrl;

/* ── cameos (Increment B cloud sync) ─────────────────────────────────────────
   Opt-in only. Face angles are uploaded as private files (same per-user RLS as
   generations); the turn_cameos row keeps storage paths + provenance (paths,
   not blobs). Local IDB remains the source of truth; cloud is for cross-device. */
async function cloudCameoRow(projectId, charId){
  const sb = sbClient(); if(!sb) return null;
  try{ const { data } = await sb.from("turn_cameos").select("*")
    .eq("project_id",projectId).eq("char_id",charId).maybeSingle(); return data||null; }catch(e){ return null; }
}
async function cloudSyncCameo(projectId, uid, charId, rec){
  const sb = sbClient(); if(!sb) return null;
  /* drop any prior cloud copy's files first (replace semantics) */
  const prev = await cloudCameoRow(projectId, charId);
  if(prev && prev.angles){ try{ await sb.storage.from(turnBucket()).remove((prev.angles||[]).map(a=>a.storage_path).filter(Boolean)); }catch(e){} }
  const angleRows = [];
  for(const a of (rec.angles||[])){
    const p = await cloudUploadImage(projectId, uid, charId, a.url, "cameo", turnSafeSeg(a.label||"angle"));
    if(p) angleRows.push({ label:a.label, storage_path:p });
  }
  const prov = { consent:!!rec.consent, source:rec.source||"webcam", subject:rec.subject||"",
    iso:rec.iso, date:rec.date, w:rec.w||0, h:rec.h||0 };
  try{
    await sb.from("turn_cameos").upsert({ project_id:projectId, owner:uid, char_id:charId,
      angles:angleRows, prov:prov }, { onConflict:"project_id,char_id" });
    return true;
  }catch(e){ return null; }
}
async function cloudLoadCameo(projectId, charId){
  const row = await cloudCameoRow(projectId, charId);
  if(!row || !row.angles) return null;
  const angles = [];
  for(const a of row.angles){ const url = a.storage_path ? await cloudSignedUrl(a.storage_path) : ""; if(url) angles.push({ label:a.label, url }); }
  const p = row.prov || {};
  return { angles, url: angles.length?angles[0].url:"", consent:!!p.consent, sync:true,
    source:p.source||"webcam", subject:p.subject||"", iso:p.iso, date:p.date, w:p.w||0, h:p.h||0 };
}
async function cloudDeleteCameo(projectId, charId){
  const sb = sbClient(); if(!sb) return;
  const row = await cloudCameoRow(projectId, charId);
  if(row && row.angles){ try{ await sb.storage.from(turnBucket()).remove((row.angles||[]).map(a=>a.storage_path).filter(Boolean)); }catch(e){} }
  try{ await sb.from("turn_cameos").delete().eq("project_id",projectId).eq("char_id",charId); }catch(e){}
}
window.cloudSyncCameo = cloudSyncCameo;
window.cloudLoadCameo = cloudLoadCameo;
window.cloudDeleteCameo = cloudDeleteCameo;

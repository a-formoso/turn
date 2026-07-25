/* cloud.jsx — Supabase integration for Cinema Machine.
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
async function cloudResetPassword(email){
  const sb = sbClient(); if(!sb) return { error:{ message:"Cloud not configured." } };
  return sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
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
window.cloudResetPassword = cloudResetPassword;
window.cloudGetSession = cloudGetSession;
window.cloudOnAuth = cloudOnAuth;
window.cloudUserEmail = cloudUserEmail;
window.cloudUserId = cloudUserId;

/* ── credits / usage balance ─────────────────────────────────────────────────
   The billing schema may evolve, so this reader is intentionally tolerant:
   it first tries an RPC, then a few likely per-user balance tables, and finally
   falls back to auth metadata. UI can show "unavailable" instead of inventing a
   number when no backend balance source exists yet. */
function _turnCreditShape(row, source){
  if(!row || typeof row!=="object") return null;
  const pick = (...ks)=>{
    for(const k of ks){ if(row[k]!==undefined && row[k]!==null && row[k]!=="") return row[k]; }
    return null;
  };
  const remaining = pick("remaining","credits_remaining","credit_balance","balance","credits","available_credits","available");
  const used = pick("used","credits_used","usage","spent");
  const limit = pick("limit","credits_limit","monthly_credits","included_credits","quota");
  const plan = pick("plan","tier","subscription_tier");
  const n = remaining==null ? null : Number(remaining);
  if(!Number.isFinite(n)) return null;
  return {
    remaining:n,
    used: used==null || !Number.isFinite(Number(used)) ? null : Number(used),
    limit: limit==null || !Number.isFinite(Number(limit)) ? null : Number(limit),
    plan: plan==null ? "" : String(plan),
    source:source||"unknown"
  };
}
async function cloudGetCreditBalance(){
  const sb = sbClient(); if(!sb) return null;
  const session = await cloudGetSession();
  const uid = session && session.user && session.user.id;
  if(!uid) return null;
  const meta = {
    ...((session.user&&session.user.user_metadata)||{}),
    ...((session.user&&session.user.app_metadata)||{})
  };
  const fromMeta = _turnCreditShape(meta, "auth metadata");
  try{
    const { data, error } = await sb.rpc("turn_credit_balance");
    if(!error){
      const shaped = _turnCreditShape(Array.isArray(data)?data[0]:data, "turn_credit_balance");
      if(shaped) return shaped;
    }
  }catch(e){}
  const tables = [
    ["turn_credit_balances","owner"],
    ["turn_user_credits","owner"],
    ["turn_credits","owner"],
    ["turn_credit_balances","user_id"],
    ["turn_user_credits","user_id"],
    ["turn_credits","user_id"],
  ];
  for(const [table,col] of tables){
    try{
      const { data, error } = await sb.from(table).select("*").eq(col, uid).maybeSingle();
      if(!error){
        const shaped = _turnCreditShape(data, table);
        if(shaped) return shaped;
      }
    }catch(e){}
  }
  return fromMeta;
}
window.cloudGetCreditBalance = cloudGetCreditBalance;

async function cloudJoinStageWaitlist(){
  const sb = sbClient(); if(!sb) return { error:{ message:"Cloud not configured." } };
  try{
    const { data, error } = await sb.rpc("turn_join_stage_waitlist");
    return { data, error };
  }catch(e){ return { error:{ message:(e && e.message) || "Could not join the Stage waitlist." } }; }
}
window.cloudJoinStageWaitlist = cloudJoinStageWaitlist;

/* decrement after a successful render (supabase/credits.sql turn_spend_credit).
   Fire-and-forget from the render path; the UI refreshes via cloudGetCreditBalance
   on the "turn-credits-changed" event either way. Returns the new balance or null. */
async function cloudSpendCredit(cost){
  const sb = sbClient(); if(!sb) return null;
  try{
    const { data, error } = await sb.rpc("turn_spend_credit", { cost: Math.max(1, Number(cost)||1) });
    if(error) return null;
    return _turnCreditShape(Array.isArray(data)?data[0]:data, "turn_spend_credit");
  }catch(e){ return null; }
}
window.cloudSpendCredit = cloudSpendCredit;

/* ── projects ────────────────────────────────────────────────────────────────
   A project row holds the whole story `doc` (scenes, characters, props, drafts,
   beats, continuity) as JSON, scoped to the signed-in user by RLS. */
async function cloudListProjects(){
  const sb = sbClient(); if(!sb) return [];
  try{
    // show fields ride along (Phase 3): a SHOW is a project row whose doc carries
    // isShow + bible; an EPISODE carries showId + episodeNo. PostgREST returns the
    // jsonb ->> extracts as strings (or null).
    // hasShots/hasLocs: tiny scalar probes (the first element's id) so the Home
    // cards can show each film's honest pipeline PHASE without fetching whole
    // docs — shots exist → Production; location cards → Pre-production; else Development.
    const session = await cloudGetSession();
    const uid = session && session.user && session.user.id;
    const email = String((session && session.user && session.user.email) || "").toLowerCase();
    const { data, error } = await sb.from("turn_projects")
      .select("id,owner,title,updated_at,created_at,isShow:doc->>isShow,showId:doc->>showId,episodeNo:doc->>episodeNo,cover:doc->>cover,coverPrev:doc->>coverPrev,fmt:doc->project->>format,logline:doc->project->>logline,ord:doc->>homeOrder,hasShots:doc->shots->0->>id,hasLocs:doc->locations->0->>id")
      .order("updated_at",{ ascending:false });
    // null = REQUEST FAILED (e.g. expired token → 401), [] = genuinely no projects.
    // Callers must not treat a failure as "new user" — that's how an auth hiccup
    // once spawned a create-first-project during boot and stranded the app.
    if(error) return null;
    let memberships = [];
    try{
      const { data:ms } = await sb.from("turn_project_members")
        .select("project_id,role,member_email,status")
        .or("member_user.eq."+uid+",member_email.eq."+email);
      memberships = (ms||[]).filter(m=>String(m.status||"active")==="active");
    }catch(e){}
    const byProject = {};
    memberships.forEach(m=>{ if(m && m.project_id) byProject[m.project_id]=m; });
    return (data || []).map(p=>{
      const m = byProject[p.id] || null;
      const isOwner = !!(uid && p.owner===uid);
      return { ...p, isOwner, isShared:!isOwner && !!m, shareRole:m&&m.role || (isOwner?"owner":"") };
    });
  }catch(e){ return null; }
}
function _teamEmail(s){ return String(s||"").trim().toLowerCase(); }
function _teamSchemaMissing(err){
  const msg = String((err && err.message) || err || "");
  return /turn_project_members|schema cache|relation .* does not exist|could not find the table/i.test(msg);
}
function _teamSetupMessage(){
  return "Team collaboration needs the Supabase team-collaboration.sql migration before invites can be added.";
}
async function cloudListProjectMembers(projectId){
  const sb = sbClient(); if(!sb || !projectId) return [];
  try{
    const { data, error } = await sb.from("turn_project_members")
      .select("id,project_id,member_email,member_user,role,status,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending:true });
    if(error){
      window.turnTeamSchemaMissing = _teamSchemaMissing(error);
      return [];
    }
    window.turnTeamSchemaMissing = false;
    return data || [];
  }catch(e){ window.turnTeamSchemaMissing = _teamSchemaMissing(e); return []; }
}
async function cloudInviteProjectMember(projectId, email, role){
  const sb = sbClient(); if(!sb || !projectId) return { ok:false };
  const e = _teamEmail(email);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok:false, message:"Enter a valid email address." };
  const r = ["view_only","writer","art_director","producer_admin"].indexOf(role)>=0 ? role : "writer";
  try{
    const { error } = await sb.from("turn_project_members")
      .insert({ project_id:projectId, member_email:e, role:r, status:"active" });
    if(error){
      if(_teamSchemaMissing(error)){ window.turnTeamSchemaMissing = true; return { ok:false, setup:true, message:_teamSetupMessage() }; }
      return { ok:false, message:error.message };
    }
    window.turnTeamSchemaMissing = false;
    return { ok:true };
  }catch(err){
    if(_teamSchemaMissing(err)){ window.turnTeamSchemaMissing = true; return { ok:false, setup:true, message:_teamSetupMessage() }; }
    return { ok:false, message:(err&&err.message)||"Invite failed." };
  }
}
async function cloudUpdateProjectMember(memberId, patch){
  const sb = sbClient(); if(!sb || !memberId) return { ok:false };
  const role = patch && patch.role;
  const r = ["view_only","writer","art_director","producer_admin"].indexOf(role)>=0 ? role : null;
  try{
    const { error } = await sb.from("turn_project_members").update(r?{role:r}:patch).eq("id", memberId);
    if(error) return { ok:false, message:error.message };
    return { ok:true };
  }catch(err){ return { ok:false, message:(err&&err.message)||"Update failed." }; }
}
async function cloudRemoveProjectMember(memberId){
  const sb = sbClient(); if(!sb || !memberId) return { ok:false };
  try{
    const { error } = await sb.from("turn_project_members").delete().eq("id", memberId);
    if(error) return { ok:false, message:error.message };
    return { ok:true };
  }catch(err){ return { ok:false, message:(err&&err.message)||"Remove failed." }; }
}
window.cloudListProjectMembers = cloudListProjectMembers;
window.cloudInviteProjectMember = cloudInviteProjectMember;
window.cloudUpdateProjectMember = cloudUpdateProjectMember;
window.cloudRemoveProjectMember = cloudRemoveProjectMember;
/* persist a film's poster (a downscaled data URL) onto its doc.cover, merging so the
   rest of the story doc is untouched. Used by the Home screen's poster generator. */
async function cloudSaveCover(id, cover, prevCover){
  // fenced: a poster save must never revert story edits made while it was in flight
  await cloudPatchDoc(id, (doc)=>{
    doc.cover = cover || "";
    // one-deep poster history: a REGENERATE passes the outgoing poster so the
    // Home card's Restore can bring it back
    if(prevCover!==undefined) doc.coverPrev = prevCover || "";
  });
}
window.cloudSaveCover = cloudSaveCover;
/* swap a film's poster with its one-deep history (doc.cover <-> doc.coverPrev) —
   the Home card's Restore. Returns the new pair, or null on failure. */
async function cloudSwapCover(id){
  let out = null;
  const r = await cloudPatchDoc(id, (doc)=>{
    if(!doc.coverPrev) return false;   // nothing to restore
    const cur = doc.cover || "";
    doc.cover = doc.coverPrev; doc.coverPrev = cur;
    out = { cover:doc.cover, coverPrev:doc.coverPrev };
  });
  return (r && r.ok) ? out : null;
}
window.cloudSwapCover = cloudSwapCover;
/* persist a film's manual position on the Home wall onto doc.homeOrder (merged), so a
   user-arranged order survives reload and rides along in cloudListProjects (`ord`). */
async function cloudSaveOrder(id, order){
  await cloudPatchDoc(id, (doc)=>{ doc.homeOrder = order; });
}
window.cloudSaveOrder = cloudSaveOrder;
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
/* MULTI-WINDOW SAVE FENCE — the auto-save is a full-doc overwrite, so two open
   sessions on one account used to silently erase each other's edits (last writer
   wins). Every doc now carries a monotonic _rev; a save only lands if the cloud
   still holds the revision THIS session last saw (atomic .eq filter — no read
   race). A stale window's save matches 0 rows and reports {conflict:true}
   instead of clobbering the newer work. */
const _docRevSeen = {};   // project id -> the _rev this session last loaded/wrote
function cloudNoteDocRev(id, doc){ if(id) _docRevSeen[id] = (doc && Number(doc._rev)) || 0; }
window.cloudNoteDocRev = cloudNoteDocRev;
async function cloudSaveDoc(id, doc){
  const sb = sbClient(); if(!sb || !id) return { ok:false };
  const seen = _docRevSeen[id] || 0;
  const next = { ...doc, _rev: seen + 1 };
  try{
    let q = sb.from("turn_projects").update({ doc: next }).eq("id", id);
    // fence: overwrite only the revision we last saw. Legacy docs (no _rev yet)
    // match the null/0 branch once, then join the fenced world.
    q = seen ? q.eq("doc->>_rev", String(seen))
             : q.or("doc->>_rev.is.null,doc->>_rev.eq.0");
    const { data, error } = await q.select("id");
    if(error) return { ok:false };
    if(!data || !data.length) return { ok:false, conflict:true };
    _docRevSeen[id] = seen + 1;
    return { ok:true };
  }catch(e){ return { ok:false }; }
}
/* FENCED PATCH — change a FEW keys on a doc without the last-writer-wins hazard of a
   plain read-modify-write. The naive form (select doc → mutate → update) writes back the
   whole snapshot it read, so an autosave that lands in between is silently reverted AND
   _rev goes backwards, which then makes every later save conflict. This reads the current
   doc, applies `mutate`, and writes under the SAME atomic _rev fence cloudSaveDoc uses,
   retrying on a lost race. `mutate(doc)` returns false to abort (nothing to do).
   Fence bookkeeping: only advance this session's _docRevSeen when it was exactly in sync
   before the patch — if the session was already behind, leave it stale so the next
   autosave conflicts honestly and takes the reload path instead of clobbering. */
async function cloudPatchDoc(id, mutate){
  const sb = sbClient(); if(!sb || !id) return { ok:false };
  for(let attempt=0; attempt<3; attempt++){
    try{
      const { data, error } = await sb.from("turn_projects").select("doc").eq("id", id).single();
      if(error) return { ok:false };
      const doc = (data && data.doc) || {};
      const cur = Number(doc._rev) || 0;
      const wasInSync = (_docRevSeen[id] || 0) === cur;
      if(mutate(doc) === false) return { ok:false, skipped:true };
      let q = sb.from("turn_projects").update({ doc: { ...doc, _rev: cur + 1 } }).eq("id", id);
      q = cur ? q.eq("doc->>_rev", String(cur))
              : q.or("doc->>_rev.is.null,doc->>_rev.eq.0");
      const { data: rows, error: wErr } = await q.select("id");
      if(wErr) return { ok:false };
      if(rows && rows.length){
        if(wasInSync) _docRevSeen[id] = cur + 1;
        return { ok:true, doc };
      }
      // someone else wrote between our read and write — re-read and retry
    }catch(e){ return { ok:false }; }
  }
  return { ok:false, conflict:true };
}
window.cloudPatchDoc = cloudPatchDoc;
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
  // HISTORY-SAFE previous-row lookup: a transient failure here (expired JWT mid-refresh,
  // a network blip) must NEVER read as "no previous image" — that used to upsert
  // history:[] and silently WIPE the sheet's whole version chain (uploads included).
  // Distinguish error from empty, retry once after a session refresh, and on a
  // persistent failure upsert WITHOUT the history column so the server-side value
  // is preserved (one roll-in lost, not twelve versions).
  const sb = sbClient();
  const _get = async ()=>{ const { data, error } = await sb.from("turn_generations").select("*")
      .eq("project_id", projectId).eq("entity_id", entityId).maybeSingle();
    return { row: data||null, failed: !!error }; };
  let looked = { row:null, failed:true };
  try{ looked = await _get(); }catch(e){}
  if(looked.failed){ try{ await sb.auth.refreshSession(); looked = await _get(); }catch(e){} }
  const row = looked.row;
  let history = (row && row.history) || [];
  if(row && row.storage_path){
    history = [{ storage_path:row.storage_path, meta:row.meta||{}, refs:row.refs||[] }, ...history];
    if(history.length > 12){ const drop = history.slice(12); history = history.slice(0,12); cloudRemovePaths(drop.map(h=>h.storage_path)); }
  }
  const refRows = [];
  for(const r of (refs || [])){
    let p = null;
    if(r.url) p = await cloudUploadImage(projectId, uid, entityId, r.url, assetType, "ref-"+turnSafeSeg(r.kind||"img"));
    refRows.push({ kind:r.kind, label:r.label, storage_path:p, refId:r.refId||undefined });
  }
  const fields = { storage_path:newPath, meta:meta||{}, refs:refRows };
  if(!looked.failed) fields.history = history;   // never clobber history on a failed lookup
  await cloudUpsertGen(projectId, uid, entityId, fields);
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
async function cloudAssetLoadMany(projectId, entityIds, strict){
  const sb = sbClient();
  const ids = Array.from(new Set((entityIds||[]).filter(Boolean)));
  if(!sb){ if(strict) throw new Error("cloud unavailable"); return {}; }
  if(!ids.length) return {};
  let rows = [];
  try{
    // strict mode surfaces query failures (throws) so callers can tell a genuine
    // "no assets" result apart from a transient read failure; default stays lenient.
    const { data, error } = await sb.from("turn_generations")
      .select("entity_id, storage_path, meta")
      .eq("project_id", projectId).in("entity_id", ids);
    if(error) throw error;
    rows = data || [];
  }catch(e){ if(strict) throw e; return {}; }
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
/* delete the CURRENT image, promote the newest prior version, and do NOT keep the
   deleted current image in history. Used by Image Details' "Delete current" action. */
async function cloudDeleteCurrentAndPromote(projectId, uid, entityId){
  const row = await cloudGetGen(projectId, entityId);
  if(!row) return null;
  const history = (row.history || []).slice();
  if(!history.length) return null;
  const chosen = history.shift();
  const remove = [];
  if(row.storage_path) remove.push(row.storage_path);
  (row.refs||[]).forEach(r=>{ if(r.storage_path) remove.push(r.storage_path); });
  await cloudUpsertGen(projectId, uid, entityId, {
    storage_path:chosen.storage_path,
    meta:chosen.meta||{},
    refs:chosen.refs||[],
    history:history.slice(0,12),
  });
  if(remove.length) cloudRemovePaths(remove);
  const url = await cloudSignedUrl(chosen.storage_path);
  return { url, meta: chosen.meta || null };
}
window.cloudDeleteCurrentAndPromote = cloudDeleteCurrentAndPromote;
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
  for(const r of (row.refs||[])) refs.push({ kind:r.kind, label:r.label, refId:r.refId, url: r.storage_path ? await cloudSignedUrl(r.storage_path) : "" });
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

/* ── render styles (locked "Surprise me" styles) ──────────────────────────────
   Two tiers (see supabase/styles.sql):
     • turn_user_styles   — PERSONAL, RLS-scoped to the owner (cross-device sync).
     • turn_global_styles — admin-curated HOUSE styles; everyone reads, admin writes.
   All no-op gracefully when Supabase isn't configured. Shapes: {key,label,render}.
   Global render blocks may carry app metadata keys such as __hidden / __order;
   artroom.jsx strips those before using the style block in prompts. */
async function cloudListUserStyles(){
  const sb = sbClient(); if(!sb) return [];
  try{
    const { data, error } = await sb.from("turn_user_styles").select("style_key,label,render").order("created_at",{ ascending:true });
    if(error) return [];
    return (data||[]).map(r=>({ key:r.style_key, label:r.label, render:r.render }));
  }catch(e){ return []; }
}
async function cloudSaveUserStyle(key, label, render){
  const sb = sbClient(); if(!sb || !key) return false;
  const session = await cloudGetSession(); const uid = session && session.user && session.user.id; if(!uid) return false;
  try{
    const { error } = await sb.from("turn_user_styles")
      .upsert({ owner:uid, style_key:key, label:label||"Locked style", render:render||{} }, { onConflict:"owner,style_key" });
    return !error;
  }catch(e){ return false; }
}
async function cloudDeleteUserStyle(key){
  const sb = sbClient(); if(!sb || !key) return false;
  try{ const { error } = await sb.from("turn_user_styles").delete().eq("style_key", key); return !error; }catch(e){ return false; }
}
async function cloudListGlobalStyles(){
  const sb = sbClient(); if(!sb) return [];
  try{
    const { data, error } = await sb.from("turn_global_styles").select("style_key,label,render").order("created_at",{ ascending:true });
    if(error) return [];
    return (data||[]).map(r=>({ key:r.style_key, label:r.label, render:r.render }));
  }catch(e){ return []; }
}
async function cloudSaveGlobalStyle(key, label, render){
  const sb = sbClient(); if(!sb || !key) return false;
  const session = await cloudGetSession(); const uid = session && session.user && session.user.id;
  try{
    const { error } = await sb.from("turn_global_styles")
      .upsert({ style_key:key, label:label||"House style", render:render||{}, created_by:uid||null }, { onConflict:"style_key" });
    return !error;     // RLS rejects non-admins → error truthy → false
  }catch(e){ return false; }
}
async function cloudDeleteGlobalStyle(key){
  const sb = sbClient(); if(!sb || !key) return false;
  try{ const { error } = await sb.from("turn_global_styles").delete().eq("style_key", key); return !error; }catch(e){ return false; }
}
window.cloudListUserStyles = cloudListUserStyles;
window.cloudSaveUserStyle = cloudSaveUserStyle;
window.cloudDeleteUserStyle = cloudDeleteUserStyle;
window.cloudListGlobalStyles = cloudListGlobalStyles;
window.cloudSaveGlobalStyle = cloudSaveGlobalStyle;
window.cloudDeleteGlobalStyle = cloudDeleteGlobalStyle;

/* ---- app config (admin-editable global settings, e.g. plan-card copy) ----------
   Public READ (the landing shows plan cards to signed-out visitors); admin-only
   WRITE, enforced by RLS (supabase/app-config.sql). */
async function cloudGetAppConfig(key){
  const sb = sbClient(); if(!sb || !key) return null;
  try{ const { data, error } = await sb.from("turn_app_config").select("value").eq("key", key).maybeSingle();
    if(error) return null; return data ? data.value : null;
  }catch(e){ return null; }
}
async function cloudSaveAppConfig(key, value){
  const sb = sbClient(); if(!sb || !key) return false;
  try{ const { error } = await sb.from("turn_app_config").upsert({ key, value }, { onConflict:"key" });
    return !error;     // RLS rejects non-admins → error truthy → false
  }catch(e){ return false; }
}
window.cloudGetAppConfig = cloudGetAppConfig;
window.cloudSaveAppConfig = cloudSaveAppConfig;

/* pricing-watch.jsx — fal.ai price-drift watcher (admin alert + one-click apply).

   The provider-USD table in app/pricing.jsx only stays honest while it matches
   fal's real prices (found drifting on 2026-07-30: GPT Image 2 halved, Nano
   Banana Pro rose). This file:

   1. loads any saved admin overrides (turn_app_config "pricing-overrides") at
      boot for EVERY user, so applied prices take effect globally;
   2. for the ADMIN, calls the pricing-watch Edge Function (which parses fal's
      public model-search pricing text server-side) and diffs the parsed prices
      against the LIVE table;
   3. shows drift in a card with exact old → new numbers — never auto-applied;
   4. "Apply" writes the reviewed numbers through turnApplyPricingOverrides
      (validated, in-place) and persists them + a version bump via
      cloudSaveAppConfig — the same admin-edit pattern as plan copy in plans.jsx.

   FAIL-SAFE: a model the server couldn't parse produces NO row (it's listed as
   "not checked"); rate-derived rows are scaled off the current table, and the
   applied token rate is stored as the next reference so a change never
   compounds on re-check. */

(function(){
  const CONFIG_KEY = "pricing-overrides";
  const STAMP_KEY = "turn-pricing-watch-at";
  const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;   // auto-check at most twice a day

  const MODEL_LABELS = {
    "gemini-3.1-flash-lite-image": "Nano Banana 2 Lite",
    "gemini-3.1-flash-image": "Nano Banana 2",
    "gemini-3-pro-image": "Nano Banana Pro",
    "gpt-image-2": "GPT Image 2",
    "seedance-2.0": "Seedance 2.0",
    "seedance-2.5": "Seedance 2.5",
    "kling-3.0": "Kling 3.0",
  };

  function pathGet(obj, path){
    return String(path||"").split(".").reduce((o,k)=> (o && typeof o==="object") ? o[k] : undefined, obj);
  }
  function friendly(path){
    const p = String(path||"").split(".");
    if(p[0]==="image") return (MODEL_LABELS[p[2]]||p[2])+" · "+p[3];
    if(p[0]==="video") return (MODEL_LABELS[p[2]]||p[2])+" "+(p[3]||"")+" · "+p[4]+"/s";
    return path;
  }
  function fmt(v){ return "$"+(Math.round(Number(v)*10000)/10000); }
  function differs(cur, next){
    return Math.abs(next-cur) > Math.max(0.0005, cur*0.005);   // >0.5% or >$0.0005
  }

  /* boot: apply saved overrides for everyone (public-read config) */
  let _savedOverrides = null;
  async function turnPricingWatchLoadOverrides(){
    try{
      if(typeof window.cloudGetAppConfig!=="function") return;
      const ov = await window.cloudGetAppConfig(CONFIG_KEY);
      _savedOverrides = ov || null;
      if(ov && typeof window.turnApplyPricingOverrides==="function") window.turnApplyPricingOverrides(ov);
    }catch(e){}
  }
  window.turnPricingWatchLoadOverrides = turnPricingWatchLoadOverrides;

  /* server items → reviewed diff rows against the LIVE table */
  function buildRows(items){
    const rows = [];
    const tokenRefs = (_savedOverrides && _savedOverrides.tokenRefs) || {};
    (items||[]).forEach(it=>{
      if(!it) return;
      if(it.kind==="abs"){
        const cur = Number(pathGet(window.TURN_PRICING, it.path));
        const next = Number(it.usd);
        if(Number.isFinite(cur) && cur>0 && Number.isFinite(next) && next>0 && differs(cur,next)){
          rows.push({ path:it.path, cur, next, label:friendly(it.path) });
        }
      } else if(it.kind==="rate"){
        const ref = Number(tokenRefs[it.id]) > 0 ? Number(tokenRefs[it.id]) : Number(it.defaultRef);
        const factor = Number(it.rate) / ref;
        // sanity: a wildly implausible factor means a bad parse — show nothing
        if(!(Number.isFinite(factor) && factor>=0.05 && factor<=20)) return;
        if(Math.abs(factor-1) < 0.005) return;
        (it.paths||[]).forEach(p=>{
          const cur = Number(pathGet(window.TURN_PRICING, p));
          if(!(Number.isFinite(cur) && cur>0)) return;
          const next = Math.round(cur*factor*10000)/10000;
          if(differs(cur,next)) rows.push({ path:p, cur, next, label:friendly(p),
            derived:true, rateId:it.id, rate:Number(it.rate),
            note:"token rate "+fmt(ref)+" → "+fmt(it.rate)+" ("+(it.unit||"")+")" });
        });
      }
    });
    return rows;
  }

  /* one-click apply: reviewed rows → validated in-place table update + global save */
  async function applyRows(rows){
    const ov = JSON.parse(JSON.stringify(_savedOverrides || {}));
    ov.image = ov.image || {}; ov.video = ov.video || {}; ov.tokenRefs = ov.tokenRefs || {};
    rows.forEach(r=>{
      const p = r.path.split(".");
      if(p[0]==="image"){ (ov.image[p[2]] = ov.image[p[2]] || {})[p[3]] = r.next; }
      else if(p[0]==="video"){
        ov.video[p[2]] = ov.video[p[2]] || {};
        (ov.video[p[2]][p[3]] = ov.video[p[2]][p[3]] || {})[p[4]] = r.next;
      }
      // remember the applied token rate as the new reference so the same rate
      // change is never scaled onto the table twice
      if(r.derived && r.rateId && r.rate>0) ov.tokenRefs[r.rateId] = r.rate;
    });
    ov.version = new Date().toISOString().slice(0,10);   // version bump
    const applied = (typeof window.turnApplyPricingOverrides==="function") && window.turnApplyPricingOverrides(ov);
    let saved = false;
    if(applied && typeof window.cloudSaveAppConfig==="function"){
      try{ saved = await window.cloudSaveAppConfig(CONFIG_KEY, ov); }catch(e){}
    }
    if(saved) _savedOverrides = ov;
    try{ window.dispatchEvent(new CustomEvent("nb-settings-changed")); }catch(e){}  // refresh cost chips
    if(window.appToast) window.appToast(
      saved ? "Pricing table updated for everyone (v"+ov.version+")."
        : (applied ? "Applied locally, but couldn't save globally — check you're the admin (turn_app_config RLS)."
                   : "No valid prices to apply — nothing was changed."),
      saved ? "success" : "error");
    return saved;
  }

  /* ── the drift card (self-mounted, admin-only) ─────────────────────────── */
  let _host = null, _root = null;
  function removeCard(){
    if(_root){ try{ _root.unmount(); }catch(e){} _root = null; }
    if(_host){ try{ _host.remove(); }catch(e){} _host = null; }
  }
  function DriftCard({ rows, failures, checkedAt }){
    const R = window.React;
    const [busy, setBusy] = R.useState(false);
    const apply = async ()=>{ setBusy(true); const ok = await applyRows(rows); setBusy(false); if(ok) removeCard(); };
    return R.createElement("div",{className:"pricing-watch-card"},
      R.createElement("div",{className:"pw-title"},"fal.ai price drift detected"),
      R.createElement("div",{className:"pw-sub"},
        rows.length+" price"+(rows.length===1?"":"s")+" on fal.ai no longer match the pricing table (v"+
        ((window.TURN_PRICING||{}).version||"?")+")."),
      R.createElement("div",{className:"pw-rows"},
        rows.map(r=> R.createElement("div",{key:r.path,className:"pw-row",title:r.note||r.path},
          R.createElement("span",{className:"pw-label"}, r.label, r.derived ? R.createElement("em",null," (derived)") : null),
          R.createElement("span",{className:"pw-old"}, fmt(r.cur)),
          R.createElement("span",{className:"pw-arrow"},"→"),
          R.createElement("span",{className:"pw-new"}, fmt(r.next))))),
      failures && failures.length ? R.createElement("div",{className:"pw-fail",
        title:failures.map(f=>f.model+": "+f.reason).join("\n")},
        "Not checked (parse failed — no change suggested): "+
        Array.from(new Set(failures.map(f=>f.model))).join(", ")) : null,
      checkedAt ? R.createElement("div",{className:"pw-when"},"Checked "+new Date(checkedAt).toLocaleString()) : null,
      R.createElement("div",{className:"pw-actions"},
        R.createElement("button",{className:"pw-btn",disabled:busy,onClick:removeCard},"Later"),
        R.createElement("button",{className:"pw-btn primary",disabled:busy,onClick:apply},
          busy ? "Applying…" : "Apply new prices")));
  }
  function mountCard(rows, failures, checkedAt){
    if(!window.React || !window.ReactDOM) return;
    removeCard();
    _host = document.createElement("div");
    document.body.appendChild(_host);
    _root = window.ReactDOM.createRoot(_host);
    _root.render(window.React.createElement(DriftCard,{ rows, failures, checkedAt }));
  }

  /* ── scheduled-check pickup: the Supabase pg_cron job runs the same Edge
     Function daily and persists its result to turn_app_config
     "pricing-watch-last". When the browser throttle would skip a live check,
     we still read that record (public-read) and show any drift found while
     nobody had the app open. Same fail-safe diff (buildRows) — parse failures
     produce no rows, and applying stays the admin's reviewed click. */
  const STORED_MAX_AGE_MS = 48 * 60 * 60 * 1000;   // ignore stale records
  async function showStoredCheck(){
    try{
      if(typeof window.cloudGetAppConfig!=="function") return;
      const rec = await window.cloudGetAppConfig("pricing-watch-last");
      if(!rec || !rec.ok || !rec.checkedAt) return;
      if(Date.now() - new Date(rec.checkedAt).getTime() > STORED_MAX_AGE_MS) return;
      if(_savedOverrides===null) await turnPricingWatchLoadOverrides();
      const rows = buildRows(rec.items);
      if(rows.length) mountCard(rows, rec.failures, rec.checkedAt);
    }catch(e){}
  }

  /* ── the check itself (admin-only; force=true skips the 12h throttle) ───── */
  let _checking = false;
  async function turnPricingWatchCheck(force){
    if(!window.turnIsAdmin || _checking) return;
    if(!force){
      try{ if(Date.now() - Number(localStorage.getItem(STAMP_KEY)||0) < CHECK_EVERY_MS){ showStoredCheck(); return; } }catch(e){}
    }
    const sb = (typeof window.sbClient==="function") ? window.sbClient() : null;
    if(!sb || !sb.functions) return;
    _checking = true;
    try{
      // make sure saved overrides (and tokenRefs) are loaded before diffing
      if(_savedOverrides===null) await turnPricingWatchLoadOverrides();
      const { data, error } = await sb.functions.invoke("pricing-watch", { body:{} });
      if(error || !data || !data.ok){
        if(force && window.appToast) window.appToast("Price check failed: "+((error&&error.message)||"pricing-watch unavailable — is the Edge Function deployed?"),"error");
        return;   // fail safe: no diff shown on failure
      }
      try{ localStorage.setItem(STAMP_KEY, String(Date.now())); }catch(e){}
      const rows = buildRows(data.items);
      if(!rows.length){
        removeCard();
        if(force && window.appToast) window.appToast("fal.ai prices match the pricing table"+((data.failures||[]).length ? " ("+data.failures.length+" value(s) couldn't be checked)" : "")+".","success");
        return;
      }
      mountCard(rows, data.failures, data.checkedAt);
    }catch(e){
      if(force && window.appToast) window.appToast("Price check failed: "+(e&&e.message||e),"error");
    }finally{ _checking = false; }
  }
  window.turnPricingWatchCheck = turnPricingWatchCheck;
  /* called from app.jsx once the admin flag is known */
  window.turnPricingWatchStart = function(){ setTimeout(()=>{ turnPricingWatchCheck(false); }, 4000); };
})();

/* plans.jsx — Cinema Machine subscription plans + paywall modal.
   The three tiers and one-off credit packs open their Stripe Payment Link, tagged
   with the user's Supabase id (client_reference_id) so the webhook credits the
   right account. Credits are granted server-side by supabase/functions/stripe-webhook.

   TEST vs LIVE links auto-switch by hostname (see LIVE_HOSTS / planLink below):
   production domains use `live`, everything else (localhost, *.replit.dev preview)
   uses `test` — so local/preview testing can never hit a real card. At launch you
   fill in the plan and pack `live:` URLs; no code path changes. Until a `live`
   URL is set it safely falls back to `test`. */

/* Production hostnames that should use the LIVE payment links. Add the custom
   domain here once cinema.infinitestudioai.com is verified. */
const LIVE_HOSTS = ["cinema-machine.replit.app", "cinema.infinitestudioai.com", "cinemamachine.ai"];

/* Credit DENOMINATION. Credits are counted in a fine unit so plan allowances read
   generously (800, not 80) — this is cosmetic scale, NOT extra value: render/text/
   image COSTS scale by the same factor (stageRenderCost, nbImageCredits, textSpend),
   so 800 new credits buys exactly what 80 old credits did. The `credits` shown on each
   plan below is already in this denomination; the Stripe product's `plan_credits`
   metadata MUST match these numbers (that's what the webhook actually grants). */
window.CREDIT_SCALE = Number(window.CREDIT_SCALE) || 10;

const PLANS = [
  { tier:"writer",   name:"Writer",   price:"$19", credits:800,
    blurb:"Start with the story engine.",
    entitlements:{ writers_room:true, art_room:false, stage:false },
    features:["800 credits / month","Writers' Room","Story spine, beats and screenplay"],
    test:"https://buy.stripe.com/test_8x24gB63afmHgtS3eXc7u00",
    live:"https://buy.stripe.com/8x24gB63afmHgtS3eXc7u00" },
  { tier:"director", name:"Director", price:"$49", credits:2400, popular:true,
    blurb:"Write the film, then design it.",
    entitlements:{ writers_room:true, art_room:true, stage:false },
    features:["2,400 credits / month","Writers' Room + Art Room","Characters, props, locations, shots and storyboards"],
    test:"https://buy.stripe.com/test_00waEZ77eeiD6Ti4j1c7u01",
    live:"https://buy.stripe.com/00waEZ77eeiD6Ti4j1c7u01" },
  { tier:"studio",   name:"Studio",   price:"$149", credits:9000,
    blurb:"Move from script to production.",
    entitlements:{ writers_room:true, art_room:true, stage:true },
    features:["9,000 credits / month","Writers' Room + Art Room + Stage","Video, voice, timeline and production assets"],
    test:"https://buy.stripe.com/test_bJe9AVbnu6QbdhG2aTc7u02",
    live:"https://buy.stripe.com/bJe9AVbnu6QbdhG2aTc7u02" },
];
window.CINEMA_PLANS = PLANS;

/* One-off top-ups. Create these in Stripe as ONE-OFF products with metadata:
     app=cinema-machine
     kind=credit_pack
     pack_credits=<credits>
   Then paste each Payment Link below. Leave blank until the Stripe link exists. */
const CREDIT_PACKS = [
  { sku:"credits-300", name:"300 Credit Pack", price:"$9", credits:300,
    blurb:"A quick top-up for extra drafts or a few more renders.",
    test:"", live:"https://buy.stripe.com/8x200l63a2zVfpO9Dlc7u03" },
  { sku:"credits-1200", name:"1,200 Credit Pack", price:"$29", credits:1200, popular:true,
    blurb:"Enough room for a heavier design or production pass.",
    test:"", live:"https://buy.stripe.com/9B6cN73V28YjfpO02Lc7u04" },
  { sku:"credits-4000", name:"4,000 Credit Pack", price:"$79", credits:4000,
    blurb:"A production reserve for image, voice and video work.",
    test:"", live:"https://buy.stripe.com/8x200l77e1vR4La7vdc7u05" },
];
window.CINEMA_CREDIT_PACKS = CREDIT_PACKS;

/* ---- admin-editable plan-card COPY (name / blurb / features / most-popular) -------
   Price & credits are NOT editable here — Stripe owns them (product price +
   plan_credits metadata), so the card can never misrepresent the real charge/grant.
   Copy overrides persist globally via cloudSaveAppConfig("plans-copy", …) and every
   visitor reads them; a version bump re-renders any mounted plan surface + landing. */
let _plansVersion = 0;
const _plansListeners = new Set();
function _bumpPlans(){ _plansVersion++; _plansListeners.forEach(fn=>{ try{ fn(); }catch(e){} }); }
window.usePlansVersion = function(){
  const [, force] = React.useState(0);
  React.useEffect(()=>{ const fn=()=>force(v=>v+1); _plansListeners.add(fn); return ()=>_plansListeners.delete(fn); },[]);
  return _plansVersion;
};
/* apply { writer:{name,blurb,features[],popular}, … } onto the live PLANS copy */
window.turnApplyPlanCopy = function(ov){
  if(!ov || typeof ov!=="object") return;
  let popularTier = null;
  PLANS.forEach(p=>{
    const o = ov[p.tier]; if(!o) return;
    if(typeof o.name==="string" && o.name.trim()) p.name = o.name.trim();
    if(typeof o.blurb==="string") p.blurb = o.blurb;
    if(Array.isArray(o.features)) p.features = o.features.map(x=>String(x)).filter(x=>x.trim());
    if(o.popular) popularTier = p.tier;
  });
  if(popularTier!=null) PLANS.forEach(p=>{ p.popular = (p.tier===popularTier); });  // exactly one "most popular"
  _bumpPlans();
};
/* snapshot the current editable copy (for the editor's working state) */
window.turnPlanCopy = function(){ const o={}; PLANS.forEach(p=>{ o[p.tier]={ name:p.name, blurb:p.blurb, features:(p.features||[]).slice(), popular:!!p.popular }; }); return o; };

/* Pick the right Payment Link for the current origin.
   - Production host: the LIVE link, or "" if not set yet (NEVER fall back to a
     test checkout on a real domain — a "" makes startCheckout show a soft notice).
   - Anywhere else (localhost, *.replit.dev preview): the TEST link, so dev/preview
     testing can never touch a real card. */
function checkoutLink(item){
  let host = "";
  try{ host = (window.location && window.location.hostname || "").toLowerCase(); }catch(e){}
  const isLiveHost = LIVE_HOSTS.indexOf(host) >= 0;
  return isLiveHost ? (item.live || "") : item.test;
}
function planLink(plan){
  return checkoutLink(plan);
}
window.turnPlanLink = planLink;
window.turnCreditPackLink = checkoutLink;

/* ---- PER-TIER ENTITLEMENTS — the checkout copy, made true in the app. ----------
   Enforced in room navigation:
     Writer   → Writers' Room
     Director → Writers' Room + Art Room
     Studio   → Writers' Room + Art Room + Stage
   Enforced inside the Stage too (model picker, resolution ladder, takes-per-Generate):
     Writer   → Kling only, up to 720p, single take
     Director → every model, up to 1080p, single take
     Studio   → every model, 4K, batch takes (up to 4)
   Admin bypasses all gates. No ledger info (local/dev — balance not loaded) also
   bypasses: server-side credit spend still protects money there. A cancelled
   plan ("none") keeps its remaining credits at Writer-level access. */
const RES_RANK = { "480p":0, "720p":1, "1080p":2, "4K":3 };
const TIER_GATES = {
  writer:   { models:["kling-3.0"], maxRes:"720p",  maxBatch:1 },
  none:     { models:["kling-3.0"], maxRes:"720p",  maxBatch:1 },
  pro:      { models:"all",         maxRes:"1080p", maxBatch:1 }, // legacy tier name; treated as Director
  director: { models:"all",         maxRes:"1080p", maxBatch:1 },
  studio:   { models:"all",         maxRes:"4K",    maxBatch:4 },
};
const OPEN_GATE = { tier:"open", models:"all", maxRes:"4K", maxBatch:4 };
const ROOM_ENTITLEMENTS = {
  writer:   { writers_room:true, art_room:false, stage:false },
  none:     { writers_room:true, art_room:false, stage:false },
  free:     { writers_room:false, art_room:false, stage:false },
  pro:      { writers_room:true, art_room:true,  stage:false },
  director: { writers_room:true, art_room:true,  stage:false },
  studio:   { writers_room:true, art_room:true,  stage:true },
};
const OPEN_ROOM_ENTITLEMENTS = { writers_room:true, art_room:true, stage:true };
function _roomTier(balanceOrTier){
  if(typeof balanceOrTier==="string") return balanceOrTier.toLowerCase().trim();
  const b = balanceOrTier || window.turnCreditBalance || null;
  if(!b) return "open";
  return String(b.plan || b.tier || "none").toLowerCase().trim();
}
window.turnRoomEntitlements = function(balanceOrTier){
  if(window.turnIsAdmin) return { ...OPEN_ROOM_ENTITLEMENTS };
  const tier = _roomTier(balanceOrTier);
  if(tier==="open") return { ...OPEN_ROOM_ENTITLEMENTS };
  const e = ROOM_ENTITLEMENTS[tier] || ROOM_ENTITLEMENTS.none;
  return { ...e };
};
window.turnRoomRequiredPlan = function(room){
  const r = String(room||"").toLowerCase();
  if(r==="art" || r==="art_room") return "Director";
  if(r==="stage") return "Studio";
  return "Writer";
};
window.turnTierGates = function(balance){
  if(window.turnIsAdmin) return OPEN_GATE;
  const bal = (balance!==undefined) ? balance : window.turnCreditBalance;
  if(!bal) return OPEN_GATE;
  const plan = String(bal.plan||"none").toLowerCase();
  const g = TIER_GATES[plan] || TIER_GATES.none;
  return { tier:plan, models:g.models, maxRes:g.maxRes, maxBatch:g.maxBatch };
};
window.turnGateAllowsModel = function(g, modelId){
  return !g || g.models==="all" || g.models.indexOf(modelId)>=0;
};
window.turnGateAllowsRes = function(g, r){
  const rank = RES_RANK[r]; if(rank==null) return true;
  return !g || rank <= (RES_RANK[g.maxRes]!=null ? RES_RANK[g.maxRes] : 3);
};
/* which plan unlocks a locked thing — for "needs the X plan" copy */
window.turnPlanForRes = function(r){ return (RES_RANK[r]>=3) ? "Studio" : (RES_RANK[r]>=2) ? "Director" : null; };

/* open a plan's checkout tagged with the user's id (+ prefilled email). Needs a
   signed-in user — without a uid the webhook can't know whose balance to credit.
   opts.sameTab: navigate THIS tab to Stripe instead of window.open — required when
   checkout is triggered programmatically (post-signup auto-open): window.open
   outside a user gesture gets popup-blocked, silently stranding the buyer. Stripe's
   after-payment redirect brings them back to the app. */
function startCheckout(plan, opts){
  const uid = window.turnUserId || null;
  const email = window.turnUserEmail || "";
  if(!uid){
    if(window.appToast) window.appToast("Sign in first — purchases are tied to your account.","info");
    try{ window.dispatchEvent(new CustomEvent("turn-need-signin")); }catch(e){}
    return;
  }
  const base = checkoutLink(plan);
  if(!base){
    if(window.appToast) window.appToast("Checkout isn't available yet — please try again shortly.","info");
    return;
  }
  const url = base
    + (base.indexOf("?")>=0 ? "&" : "?")
    + "client_reference_id=" + encodeURIComponent(uid)
    + (email ? ("&prefilled_email=" + encodeURIComponent(email)) : "");
  if(opts && opts.sameTab){ try{ window.location.assign(url); return; }catch(e){} }
  window.open(url, "_blank", "noopener");
}
window.turnStartCheckout = startCheckout;

/* WELCOME MOMENT — shown once when Stripe's after-payment redirect returns the buyer
   to the app (/?welcome=1). Celebrates the plan going live and hands them straight to
   New Story. `activating` covers the few seconds before the webhook's grant streams
   into the balance — the card updates live and unlocks its CTA when credits land. */
function WelcomePlanCard({ plan, credits, activating, onNewStory, onClose }){
  const p = PLANS.find(x=>x.tier===String(plan||"").toLowerCase()) || null;
  const planLabel = p ? p.name : (plan ? String(plan).replace(/^./,c=>c.toUpperCase()) : "");
  return React.createElement("div",{className:"ns-overlay"},
    React.createElement("div",{className:"welcome-card"},
      React.createElement("div",{className:"welcome-eyebrow"},"Cinema Machine"),
      React.createElement("div",{className:"welcome-title"},
        activating ? "Setting up your plan…" : ("Your "+planLabel+" plan is live")),
      React.createElement("div",{className:"welcome-sub"},
        activating
          ? "Payment received — your credits are being added. This only takes a few seconds."
          : ((Number(credits)||0).toLocaleString()+" credits, refilled monthly. Every render — images, voices, video — runs on them.")),
      React.createElement("button",{className:"welcome-cta",disabled:!!activating,onClick:onNewStory},
        activating ? "Activating…" : "+ New Story"),
      React.createElement("button",{className:"welcome-later",onClick:onClose},"I’ll look around first")));
}
window.WelcomePlanCard = WelcomePlanCard;

function WelcomeCreditPackCard({ credits, activating, onClose }){
  return React.createElement("div",{className:"ns-overlay"},
    React.createElement("div",{className:"welcome-card"},
      React.createElement("div",{className:"welcome-eyebrow"},"Cinema Machine"),
      React.createElement("div",{className:"welcome-title"},
        activating ? "Adding your extra credits…" : "Extra credits added"),
      React.createElement("div",{className:"welcome-sub"},
        activating
          ? "Payment received — your top-up is being added to your balance. This only takes a few seconds."
          : ("Your balance is now "+(Number(credits)||0).toLocaleString()+" credits.")),
      React.createElement("button",{className:"welcome-cta",onClick:onClose},
        activating ? "Back to studio" : "Back to studio")));
}
window.WelcomeCreditPackCard = WelcomeCreditPackCard;

/* ADMIN copy editor — edits only the marketing text (name/blurb/features/popular),
   persisted globally via cloudSaveAppConfig. Price & credits stay Stripe-owned. */
function PlanCopyEditor({ onDone }){
  const [draft, setDraft] = React.useState(()=> window.turnPlanCopy());
  const [busy, setBusy] = React.useState(false);
  const set = (tier, patch)=> setDraft(d=> ({ ...d, [tier]:{ ...d[tier], ...patch } }));
  const setFeat = (tier, i, val)=> setDraft(d=>{ const f=d[tier].features.slice(); f[i]=val; return { ...d, [tier]:{ ...d[tier], features:f } }; });
  const addFeat = (tier)=> setDraft(d=> ({ ...d, [tier]:{ ...d[tier], features:[...d[tier].features, ""] } }));
  const delFeat = (tier, i)=> setDraft(d=>{ const f=d[tier].features.slice(); f.splice(i,1); return { ...d, [tier]:{ ...d[tier], features:f } }; });
  const save = async ()=>{
    setBusy(true);
    // clean empty feature rows, enforce single "most popular"
    const clean = {};
    Object.keys(draft).forEach(t=>{ clean[t] = { name:draft[t].name, blurb:draft[t].blurb,
      features:draft[t].features.map(x=>String(x)).filter(x=>x.trim()), popular:!!draft[t].popular }; });
    window.turnApplyPlanCopy(clean);
    let ok = false;
    if(typeof window.cloudSaveAppConfig==="function"){ try{ ok = await window.cloudSaveAppConfig("plans-copy", clean); }catch(e){} }
    setBusy(false);
    if(window.appToast) window.appToast(ok ? "Plan copy saved for everyone." : "Applied locally, but couldn't save globally — run supabase/app-config.sql and check you're the admin.", ok?"success":"error");
    onDone();
  };
  return React.createElement("div",{className:"plans-grid"},
    PLANS.map(p=>{
      const d = draft[p.tier] || { name:p.name, blurb:p.blurb, features:[], popular:false };
      return React.createElement("div",{key:p.tier,className:"plan-card editing"+(d.popular?" popular":"")},
        React.createElement("label",{className:"plan-edit-pop"},
          React.createElement("input",{type:"radio",name:"plan-popular",checked:!!d.popular,
            onChange:()=> setDraft(dr=>{ const n={...dr}; Object.keys(n).forEach(t=>n[t]={...n[t],popular:t===p.tier}); return n; })}),
          " Most popular"),
        React.createElement("input",{className:"plan-edit-name",value:d.name,onChange:e=>set(p.tier,{name:e.target.value}),placeholder:"Plan name"}),
        React.createElement("div",{className:"plan-price plan-edit-locked"},p.price,React.createElement("span",{className:"plan-per"},"/mo · Stripe")),
        React.createElement("div",{className:"plan-edit-locked-note"},p.credits.toLocaleString()+" credits · set in Stripe"),
        React.createElement("textarea",{className:"plan-edit-blurb",rows:2,value:d.blurb,onChange:e=>set(p.tier,{blurb:e.target.value}),placeholder:"One-line blurb"}),
        React.createElement("div",{className:"plan-edit-feats"},
          d.features.map((f,i)=>React.createElement("div",{key:i,className:"plan-edit-feat"},
            React.createElement("input",{value:f,onChange:e=>setFeat(p.tier,i,e.target.value),placeholder:"Feature line"}),
            React.createElement("button",{type:"button",className:"plan-edit-featx",title:"Remove",onClick:()=>delFeat(p.tier,i)},"×"))),
          React.createElement("button",{type:"button",className:"plan-edit-featadd",onClick:()=>addFeat(p.tier)},"+ Add feature")));
    }),
    React.createElement("div",{className:"plan-edit-bar"},
      React.createElement("button",{className:"plan-cta",disabled:busy,onClick:onDone},"Cancel"),
      React.createElement("button",{className:"plan-cta primary",disabled:busy,onClick:save}, busy?"Saving…":"Save for everyone")));
}

function PlansModal({ onClose, currentPlan }){
  if(typeof window.usePlansVersion==="function") window.usePlansVersion();   // re-render on copy edits
  const [editing, setEditing] = React.useState(false);
  const isAdmin = !!window.turnIsAdmin;
  const hasPlan = !!(window.turnIsPaidPlan && window.turnIsPaidPlan(currentPlan || ((window.turnCreditBalance||{}).plan)));
  const buyPack = (pack)=>{
    if(!hasPlan && !window.turnIsAdmin){
      if(window.appToast) window.appToast("Choose a monthly plan first — extra credits top up an active subscription.","info");
      return;
    }
    startCheckout(pack);
  };
  return React.createElement("div",{className:"ns-overlay",onMouseDown:e=>{ if(e.target===e.currentTarget && !editing) onClose(); }},
    React.createElement("div",{className:"plans-modal"},
      React.createElement("button",{className:"ag-x plans-x",onClick:onClose},React.createElement(Icon.x,{s:16})),
      React.createElement("div",{className:"plans-head"},
        React.createElement("div",{className:"plans-title"}, editing ? "Edit plan copy" : "Choose your plan"),
        React.createElement("div",{className:"plans-sub"}, editing
          ? "Marketing copy only — price and credits are set in Stripe. Saved changes show for everyone."
          : "Credits power every render — images, voices, and video. Cancel anytime."),
        isAdmin && !editing && React.createElement("button",{className:"plans-edit-btn",onClick:()=>setEditing(true),
          title:"Admin — edit the plan cards' copy (name, blurb, features, most-popular)"},
          React.createElement((Icon.wand||Icon.sparkles),{s:13})," Edit copy")),
      editing
        ? React.createElement(PlanCopyEditor,{ onDone:()=>setEditing(false) })
        : React.createElement(React.Fragment,null,
          React.createElement("div",{className:"plans-grid"},
            PLANS.map(p=>{
              const active = currentPlan && String(currentPlan).toLowerCase()===p.tier;
              return React.createElement("div",{key:p.tier,className:"plan-card"+(p.popular?" popular":"")+(active?" active":"")},
                p.popular && React.createElement("div",{className:"plan-flag"},"Most popular"),
                React.createElement("div",{className:"plan-name"},p.name),
                React.createElement("div",{className:"plan-price"},p.price,React.createElement("span",{className:"plan-per"},"/mo")),
                React.createElement("div",{className:"plan-blurb"},p.blurb),
                React.createElement("ul",{className:"plan-feats"},
                  p.features.map((f,i)=>React.createElement("li",{key:i},
                    React.createElement(Icon.check,{s:12}),f))),
                React.createElement("button",{className:"plan-cta"+(p.popular?" primary":"")+(active?" is-active":""),
                  disabled:active,
                  onClick:()=>{ if(!active) startCheckout(p); }},
                  active ? "Current plan" : ("Choose "+p.name)));
            })),
          React.createElement("div",{className:"credit-packs"},
            React.createElement("div",{className:"credit-packs-head"},
              React.createElement("div",null,
                React.createElement("div",{className:"credit-packs-title"},"Extra credits"),
                React.createElement("div",{className:"credit-packs-sub"},"One-off top-ups for active subscriptions. Purchased credits are added to your balance."))),
            React.createElement("div",{className:"credit-packs-grid"},
              CREDIT_PACKS.map(p=>{
                const unavailable = !checkoutLink(p);
                return React.createElement("div",{key:p.sku,className:"credit-pack"+(p.popular?" popular":"")},
                  p.popular && React.createElement("div",{className:"credit-pack-flag"},"Best value"),
                  React.createElement("div",{className:"credit-pack-name"},p.name),
                  React.createElement("div",{className:"credit-pack-price"},p.price),
                  React.createElement("div",{className:"credit-pack-blurb"},p.blurb),
                  React.createElement("button",{className:"plan-cta"+(p.popular?" primary":""),disabled:unavailable,
                    title:unavailable ? "Paste this pack's Stripe Payment Link into app/plans.jsx first" : "Buy extra credits",
                    onClick:()=>buyPack(p)},
                    unavailable ? "Coming soon" : ("Buy "+p.credits.toLocaleString())));
              })))),
      React.createElement("div",{className:"plans-foot"},
        "Secure checkout by Stripe · Cinema Machine, by Infinite Studio AI")));
}
window.PlansModal = PlansModal;

/* SELF-MOUNTING opener — any surface (account chip, out-of-credits render gate)
   calls window.turnOpenPlans(). It mounts the modal into its own React root on
   demand and tears it down on close, so it never depends on a host component being
   mounted in the app tree (robust even mid-auth-refresh). */
let _plansRoot = null, _plansEl = null;
function openPlans(){
  if(_plansEl) return;                                   // already open
  _plansEl = document.createElement("div");
  _plansEl.className = "plans-root";
  document.body.appendChild(_plansEl);
  _plansRoot = ReactDOM.createRoot(_plansEl);
  const close = ()=>{
    try{ _plansRoot && _plansRoot.unmount(); }catch(e){}
    if(_plansEl && _plansEl.parentNode) _plansEl.parentNode.removeChild(_plansEl);
    _plansRoot = null; _plansEl = null;
  };
  const plan = (window.turnCreditBalance && window.turnCreditBalance.plan) || null;
  _plansRoot.render(React.createElement(PlansModal,{ currentPlan:plan, onClose:close }));
}
window.turnOpenPlans = openPlans;

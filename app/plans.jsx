/* plans.jsx — Cinema Machine subscription plans + paywall modal.
   The three tiers open their Stripe Payment Link, tagged with the user's Supabase
   id (client_reference_id) so the webhook credits the right account. Credits are
   granted server-side by supabase/functions/stripe-webhook. TEST links for now —
   swap PLANS[].link to the Live payment links at launch. */

const PLANS = [
  { tier:"writer",   name:"Writer",   price:"$19", credits:80,
    blurb:"Write, design, and shoot short scenes.",
    features:["80 credits / month","Story, cast, props & locations","Video on Kling & 720p"],
    link:"https://buy.stripe.com/test_8x24gB63afmHgtS3eXc7u00" },
  { tier:"director", name:"Director", price:"$49", credits:240, popular:true,
    blurb:"Produce a whole short each month.",
    features:["240 credits / month","Every model unlocked","Up to 1080p","Priority render queue"],
    link:"https://buy.stripe.com/test_00waEZ77eeiD6Ti4j1c7u01" },
  { tier:"studio",   name:"Studio",   price:"$149", credits:900,
    blurb:"Full films, back to back.",
    features:["900 credits / month","4K output","Batch rendering","Front of the queue"],
    link:"https://buy.stripe.com/test_bJe9AVbnu6QbdhG2aTc7u02" },
];
window.CINEMA_PLANS = PLANS;

/* ---- PER-TIER ENTITLEMENTS — the checkout copy, made true in the app. ----------
   Enforced in the Stage (model picker, resolution ladder, takes-per-Generate):
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
  director: { models:"all",         maxRes:"1080p", maxBatch:1 },
  studio:   { models:"all",         maxRes:"4K",    maxBatch:4 },
};
const OPEN_GATE = { tier:"open", models:"all", maxRes:"4K", maxBatch:4 };
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
   signed-in user — without a uid the webhook can't know whose balance to credit. */
function startCheckout(plan){
  const uid = window.turnUserId || null;
  const email = window.turnUserEmail || "";
  if(!uid){
    if(window.appToast) window.appToast("Sign in first — your plan's credits are tied to your account.","info");
    try{ window.dispatchEvent(new CustomEvent("turn-need-signin")); }catch(e){}
    return;
  }
  const url = plan.link
    + (plan.link.indexOf("?")>=0 ? "&" : "?")
    + "client_reference_id=" + encodeURIComponent(uid)
    + (email ? ("&prefilled_email=" + encodeURIComponent(email)) : "");
  window.open(url, "_blank", "noopener");
}
window.turnStartCheckout = startCheckout;

function PlansModal({ onClose, currentPlan }){
  return React.createElement("div",{className:"ns-overlay",onMouseDown:e=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"plans-modal"},
      React.createElement("button",{className:"ag-x plans-x",onClick:onClose},React.createElement(Icon.x,{s:16})),
      React.createElement("div",{className:"plans-head"},
        React.createElement("div",{className:"plans-title"},"Choose your plan"),
        React.createElement("div",{className:"plans-sub"},"Credits power every render — images, voices, and video. Cancel anytime.")),
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

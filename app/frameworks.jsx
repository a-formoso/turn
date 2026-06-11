/* frameworks.jsx — the NARRATIVE FRAMEWORK registry: how the story is told.
   Single source of truth for everything framework-aware (docs/Frameworks Plan.md).
   The spine's primitive — a charge per scene — is framework-neutral; a framework
   defines the layer above it: the act bands, the audit rule & verdict language,
   the spine-builder grammar and the Story Doctor's criteria. "The Infinite Studio
   method" is the umbrella; frameworks are interchangeable lenses inside it.
   Orthogonal to FORMAT (formats.jsx): any format × any framework.

   The "threeact" entry is TODAY'S BEHAVIOR, FROZEN — its audit rule is the exact
   former turnInfo body, its labels the exact former copy. Three-act projects must
   render byte-identical before and after this registry existed. */

const FRAMEWORKS = [
  { id:"threeact", label:"Three-Act Turns", icon:"graph",
    blurb:"Conflict-driven. Every scene turns a value.",
    acts:{ 1:"Setup", 2:"Complication", 3:"Resolution" },
    kinds:{ incite:"Inciting Incident", "act-climax":"Act Climax", midpoint:"Mid-Act Climax",
            crisis:"Crisis", "story-climax":"Story Climax", resolution:"Resolution" },
    audit:{
      // EXACTLY the former turnInfo: turned = sign flip or |Δ| ≥ 2; resolution exempt
      rule:(sc)=>{
        const o = Math.sign(sc.openCharge), c = Math.sign(sc.closeCharge);
        const turned = (o !== c) || Math.abs(sc.closeCharge - sc.openCharge) >= 2;
        const exempt = sc.kind === "resolution";
        return { turned, flagged: !turned && !exempt, exempt };
      },
      okTitle:"This scene turns", flagTitle:"This scene doesn't turn",
      subline:"If a scene doesn't turn, cut it", flagIcon:"scissors",
      flagDetail:"If a scene doesn't turn a value, it's exposition — recharge it or cut it." },
    doctorCriteria:"flag scenes that open and close on the same charge; strengthen weak act climaxes",
    beatVocab:{ turnLabel:"the turn" } },

  { id:"kishotenketsu", label:"Kishōtenketsu", icon:"layers",
    blurb:"Four movements. The twist recontextualizes — no clash required.",
    acts:{ 1:"Ki — Introduction", 2:"Shō — Development", 3:"Ten — Twist", 4:"Ketsu — Reconciliation" },
    kinds:{ plant:"Planting", deepen:"Deepening", ten:"The Twist",
            "re-read":"Recontextualization", ketsu:"Reconciliation",
            // legacy three-act kinds still label sensibly if they appear
            incite:"Planting", "act-climax":"Deepening", midpoint:"Deepening",
            crisis:"The Twist", "story-climax":"Recontextualization", resolution:"Reconciliation" },
    audit:{
      /* Deterministic layer only (the semantic "does the ten re-read everything?"
         question belongs to the Story Doctor — Plan Phase 3). Band-aware:
         ki/shō (acts 1–2) pass unless INERT (zero movement on a flat charge);
         the TEN (act 3) must break the pattern (sign reversal or |Δ| ≥ 2);
         ketsu (act 4) is exempt, like three-act's resolution. */
      rule:(sc)=>{
        const act = Number(sc.act)||1;
        const delta = Math.abs((sc.closeCharge||0) - (sc.openCharge||0));
        const flip = Math.sign(sc.openCharge||0) !== Math.sign(sc.closeCharge||0);
        if(act>=4 || sc.kind==="ketsu" || sc.kind==="resolution") return { turned:true, flagged:false, exempt:true };
        if(act===3){ const turned = flip || delta>=2; return { turned, flagged:!turned, exempt:false }; }
        const inert = delta===0 && Math.abs(sc.closeCharge||0)<=0;
        return { turned:!inert, flagged:inert, exempt:false };
      },
      okTitle:"This scene carries its movement", flagTitle:"This scene is inert",
      subline:"Ki plants · Shō deepens · Ten re-reads everything · Ketsu reconciles",
      flagIcon:"alert",
      flagDetail:"A ki/shō scene must plant or deepen something; the ten must break the pattern. Give it movement — or fold it into its neighbour." },
    doctorCriteria:"the ten must make the reader re-read every scene before it — audit it as a question, not arithmetic; flag shō scenes that repeat instead of deepen; the ketsu must reconcile, not defeat",
    beatVocab:{ turnLabel:"the re-read" } },
];
window.FRAMEWORKS = FRAMEWORKS;

/* normalize project.framework (registry id, anything else, or nothing) to a
   registry entry. Default: threeact — every existing project keeps its behavior. */
function frameworkOf(project){
  const raw = ((project && project.framework) || "").toString().toLowerCase();
  return FRAMEWORKS.find(f=>f.id===raw) || FRAMEWORKS[0];
}
window.frameworkOf = frameworkOf;

/* helpers — the only way other files read framework behavior. Both read the
   CURRENT project via window.turnProject (set by app.jsx), so call sites that
   have no project param (turnInfo, KIND_LABEL lookups) keep their signatures. */
function fwAuditOf(){ return frameworkOf(window.turnProject).audit; }
function fwActName(act){ return frameworkOf(window.turnProject).acts[act] || ("Act "+act); }
function fwKindLabel(kind){ return frameworkOf(window.turnProject).kinds[kind]; }
window.fwAuditOf = fwAuditOf; window.fwActName = fwActName; window.fwKindLabel = fwKindLabel;

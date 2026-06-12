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
  { id:"threeact", label:"Three-Act Turns", badge:"Three-Act", icon:"graph",
    blurb:"Conflict-driven. Every scene turns a value.",
    acts:{ 1:"Setup", 2:"Complication", 3:"Resolution" },
    kinds:{ incite:"Inciting Incident", "act-climax":"Act Climax", midpoint:"Mid-Act Climax",
            crisis:"Crisis", "story-climax":"Story Climax", resolution:"Resolution" },
    // the Inspector's kind dropdown — TODAY'S list, frozen
    kindOpts:[["normal","Scene"],["incite","Inciting Incident"],["act-climax","Act Climax"],
      ["midpoint","Mid-Act Climax"],["crisis","Crisis"],["story-climax","Story Climax"],["resolution","Resolution"]],
    audit:{
      // EXACTLY the former turnInfo: turned = sign flip or |Δ| ≥ 2; resolution exempt
      rule:(sc)=>{
        const o = Math.sign(sc.openCharge), c = Math.sign(sc.closeCharge);
        const turned = (o !== c) || Math.abs(sc.closeCharge - sc.openCharge) >= 2;
        const exempt = sc.kind === "resolution";
        return { turned, flagged: !turned && !exempt, exempt };
      },
      okTitle:"This scene turns", flagTitle:"This scene doesn't turn",
      okBadge:"Turns", flagBadge:"No turn",
      subline:"If a scene doesn't turn, cut it", flagIcon:"scissors",
      flagDetail:"If a scene doesn't turn a value, it's exposition — recharge it or cut it.",
      analysisTurned:" — the value has reversed. The scene turns.",
      analysisFlat:" — unchanged. Flat exposition.",
      // the big-beat kinds whose peaks the Doctor checks for softness — TODAY'S list, frozen
      bigKinds:["midpoint","story-climax","act-climax","crisis"] },
    doctorCriteria:"flag scenes that open and close on the same charge; strengthen weak act climaxes",
    beatVocab:{ turnLabel:"the turn" },
    /* research-stage synopsis shape (pipeline Step 2) — TODAY'S three paragraphs, frozen */
    synopsis:{ shapeName:"classic design shape", paras:[
      { key:"setup",         label:"The Setup",                       guide:"the world, the protagonist and the inciting situation." },
      { key:"confrontation", label:"The Confrontation / Complication", guide:"escalating conflict, the midpoint turn, mounting stakes and cost." },
      { key:"resolution",    label:"The Resolution",                  guide:"crisis, climax, and the irreversible final change." } ] } },

  { id:"kishotenketsu", label:"Kishōtenketsu", badge:"Kishōtenketsu", icon:"layers",
    blurb:"Four movements. The twist recontextualizes — no clash required.",
    acts:{ 1:"Ki — Introduction", 2:"Shō — Development", 3:"Ten — Twist", 4:"Ketsu — Reconciliation" },
    kinds:{ plant:"Planting", deepen:"Deepening", ten:"The Twist",
            "re-read":"Recontextualization", ketsu:"Reconciliation",
            // legacy three-act kinds still label sensibly if they appear
            incite:"Planting", "act-climax":"Deepening", midpoint:"Deepening",
            crisis:"The Twist", "story-climax":"Recontextualization", resolution:"Reconciliation" },
    kindOpts:[["normal","Scene"],["plant","Planting"],["deepen","Deepening"],["ten","The Twist"],
      ["re-read","Recontextualization"],["ketsu","Reconciliation"]],
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
      okBadge:"Moves", flagBadge:"Inert",
      subline:"Ki plants · Shō deepens · Ten re-reads everything · Ketsu reconciles",
      flagIcon:"alert",
      flagDetail:"A ki/shō scene must plant or deepen something; the ten must break the pattern. Give it movement — or fold it into its neighbour.",
      analysisTurned:" — the movement lands. The scene carries its weight in the pattern.",
      analysisFlat:" — inert. It neither plants, deepens, nor shifts — fold it into a neighbour or give it something to plant." },
    doctorCriteria:"the ten must make the reader re-read every scene before it — audit it as a question, not arithmetic; flag shō scenes that repeat instead of deepen; the ketsu must reconcile, not defeat",
    beatVocab:{ turnLabel:"the re-read" },
    /* spine-builder grammar (Phase 2): two batched calls — ki+shō, then ten+ketsu.
       The ten is a RECONTEXTUALIZATION; the prompts forbid conflict-escalation. */
    spine:{
      intro:(total)=>"You are a story architect designing the "+total+"-scene spine of a KISHŌTENKETSU story with the Infinite Studio method — four movements: KI (introduction), SHŌ (development), TEN (twist/recontextualization), KETSU (reconciliation). Conflict is OPTIONAL; the engine is curiosity and the re-read, never a battle. ",
      firstRange:(firstN,total)=>"scenes 1–"+firstN+": the KI (plant the world, people and charged images — establish without forcing conflict) and the SHŌ (develop and deepen what was planted; let it breathe and accumulate meaning)",
      secondRange:(firstN,total)=>"scenes "+(firstN+1)+"–"+total+": the TEN (the twist — ONE recontextualizing revelation or perspective shift that makes the audience RE-READ everything before it; NOT a fight, NOT an escalation) and the KETSU (the reconciliation — settle the new understanding; calm and resonance, not victory)",
      sceneRule:"Every scene MOVES: ki scenes plant a charged image or question; shō scenes deepen it (charges may drift, not clash); the ten scene SHIFTS the pattern hard (charge sign reversal or a jump of 2+); ketsu scenes settle. ",
      closer:"Continue naturally; the ten recontextualizes, the ketsu reconciles. ",
      actSpec:"a=act 1-4 (1=ki, 2=shō, 3=ten, 4=ketsu)" },
    authorBrief:"FRAMEWORK: Kishōtenketsu — beats PRESENT and DEEPEN rather than clash; a scene's movement is a shift in understanding or pattern, not a conflict won or lost; the value charges trace mood and meaning, not victory.",
    synopsis:{ shapeName:"kishōtenketsu's four movements — conflict is optional; the engine is curiosity and the re-read", paras:[
      { key:"ki",    label:"Ki — Introduction",     guide:"the world, people and charged images, planted without forcing conflict." },
      { key:"sho",   label:"Shō — Development",     guide:"what was planted deepens and accumulates meaning; let it breathe." },
      { key:"ten",   label:"Ten — The Twist",       guide:"ONE recontextualizing revelation or perspective shift that makes everything before it re-read — not a fight, not an escalation." },
      { key:"ketsu", label:"Ketsu — Reconciliation", guide:"the new understanding settles; calm and resonance, not victory." } ] } },

  /* Hero's Journey — the mythic round (approved by owner, 2026-06-12). A
     three-act SKIN: the turn rule is the classic one; what changes is the act
     names (Departure / Initiation / Return), the twelve stage milestones and
     the builder's grammar. */
  { id:"herosjourney", label:"Hero's Journey", badge:"Hero's Journey", icon:"target",
    blurb:"Twelve mythic stages. The hero leaves, transforms, returns.",
    acts:{ 1:"Departure", 2:"Initiation", 3:"Return" },
    kinds:{ "ordinary-world":"Ordinary World", call:"Call to Adventure", refusal:"Refusal of the Call",
            mentor:"Meeting the Mentor", threshold:"Crossing the Threshold", tests:"Tests, Allies, Enemies",
            approach:"Approach to the Inmost Cave", ordeal:"The Ordeal", reward:"The Reward",
            "road-back":"The Road Back", resurrection:"Resurrection", elixir:"Return with the Elixir",
            // legacy three-act kinds still label sensibly if they appear
            incite:"Call to Adventure", "act-climax":"Crossing the Threshold", midpoint:"The Ordeal",
            crisis:"The Road Back", "story-climax":"Resurrection", resolution:"Return with the Elixir" },
    kindOpts:[["normal","Scene"],["ordinary-world","Ordinary World"],["call","Call to Adventure"],
      ["refusal","Refusal of the Call"],["mentor","Meeting the Mentor"],["threshold","Crossing the Threshold"],
      ["tests","Tests, Allies, Enemies"],["approach","Approach to the Inmost Cave"],["ordeal","The Ordeal"],
      ["reward","The Reward"],["road-back","The Road Back"],["resurrection","Resurrection"],
      ["elixir","Return with the Elixir"]],
    audit:{
      // the classic turn rule — the journey is conflict-driven; the elixir is exempt
      rule:(sc)=>{
        const o = Math.sign(sc.openCharge), c = Math.sign(sc.closeCharge);
        const turned = (o !== c) || Math.abs(sc.closeCharge - sc.openCharge) >= 2;
        const exempt = sc.kind === "elixir" || sc.kind === "resolution";
        return { turned, flagged: !turned && !exempt, exempt };
      },
      okTitle:"This scene turns", flagTitle:"This scene doesn't turn",
      okBadge:"Turns", flagBadge:"No turn",
      subline:"Depart · Initiate · Return — every stage turns",
      flagIcon:"scissors",
      flagDetail:"If a scene doesn't turn a value, it's exposition — recharge it or cut it.",
      analysisTurned:" — the value has reversed. The scene turns.",
      analysisFlat:" — unchanged. Flat exposition.",
      bigKinds:["threshold","ordeal","road-back","resurrection"] },
    doctorCriteria:"the ordeal must cost something real; the resurrection must prove the change the journey bought; flag a refusal that doesn't raise the stakes",
    beatVocab:{ turnLabel:"the turn" },
    spine:{
      intro:(total)=>"You are a story architect designing the "+total+"-scene spine of a HERO'S JOURNEY story with the Infinite Studio method — the mythic round in three phases: DEPARTURE (the hero leaves the ordinary world), INITIATION (trials, the ordeal at the journey's heart, the reward), RETURN (the road back, resurrection, the elixir brought home). ",
      firstRange:(firstN,total)=>"scenes 1–"+firstN+": the DEPARTURE (ordinary world, the call to adventure, a refusal, meeting the mentor, crossing the threshold) and the opening trials of the INITIATION (tests, allies and enemies; approaching the inmost cave)",
      secondRange:(firstN,total)=>"scenes "+(firstN+1)+"–"+total+": the heart of the INITIATION (the ORDEAL — a death-and-rebirth at the journey's center — then the reward and the road back) and the RETURN (the RESURRECTION — the final, hardest test, proving the change — and the return with the elixir)",
      sceneRule:"Each scene must TURN a value (opening and closing charge differ in sign or by >=2). Alternate positive/negative for rhythm. Frame beats as stages of the journey — calls, thresholds, ordeals, transformation — and make every trial COST something. ",
      closer:"Continue naturally; the resurrection is the hardest test, and the elixir shows what the journey bought. ",
      actSpec:"a=act 1-3 (1=departure, 2=initiation, 3=return)" },
    authorBrief:"FRAMEWORK: Hero's Journey — beats are stages of the mythic round: calls, refusals, thresholds, ordeals, resurrection; the value charges trace the descent and the return, and what each trial costs.",
    synopsis:{ shapeName:"the mythic round in three phases", paras:[
      { key:"departure",  label:"The Departure",  guide:"the ordinary world, the call to adventure, a refusal, the mentor, and crossing the threshold." },
      { key:"initiation", label:"The Initiation", guide:"tests, allies and enemies; the approach to the inmost cave; the ORDEAL at the journey's heart and what it costs; the reward and the road back." },
      { key:"return",     label:"The Return",     guide:"the resurrection — the final, hardest test, proving the change — and the return with the elixir." } ] } },

  /* Story Circle — eight steps around the wheel (approved by owner, 2026-06-12).
     Four act bands of two steps each (you/need · go/search · find/take ·
     return/change), so the existing I–IV ruler carries it. Built for episodic
     storytelling — pairs naturally with the Series format. */
  { id:"storycircle", label:"Story Circle", badge:"Story Circle", icon:"history",
    blurb:"Eight steps. Descend for what you need, pay, come back changed.",
    acts:{ 1:"You & Need", 2:"Go & Search", 3:"Find & Take", 4:"Return & Change" },
    kinds:{ you:"Comfort Zone", need:"The Need", go:"Crossing Over", search:"The Search",
            find:"The Find", take:"The Price", "return":"The Road Home", change:"Changed",
            // legacy three-act kinds still label sensibly if they appear
            incite:"The Need", "act-climax":"Crossing Over", midpoint:"The Find",
            crisis:"The Price", "story-climax":"The Road Home", resolution:"Changed" },
    kindOpts:[["normal","Scene"],["you","Comfort Zone"],["need","The Need"],["go","Crossing Over"],
      ["search","The Search"],["find","The Find"],["take","The Price"],["return","The Road Home"],
      ["change","Changed"]],
    audit:{
      // the classic turn rule — the circle runs on want and cost; "changed" is exempt
      rule:(sc)=>{
        const o = Math.sign(sc.openCharge), c = Math.sign(sc.closeCharge);
        const turned = (o !== c) || Math.abs(sc.closeCharge - sc.openCharge) >= 2;
        const exempt = sc.kind === "change" || sc.kind === "resolution";
        return { turned, flagged: !turned && !exempt, exempt };
      },
      okTitle:"This scene turns", flagTitle:"This scene doesn't turn",
      okBadge:"Turns", flagBadge:"No turn",
      subline:"You · Need · Go · Search · Find · Take · Return · Change",
      flagIcon:"scissors",
      flagDetail:"If a scene doesn't turn a value, it's exposition — recharge it or cut it.",
      analysisTurned:" — the value has reversed. The scene turns.",
      analysisFlat:" — unchanged. Flat exposition.",
      bigKinds:["go","find","take","return"] },
    doctorCriteria:"the take must exact a real price for the find; the change must be measurable against scene one's comfort; flag a search that doesn't adapt",
    beatVocab:{ turnLabel:"the turn" },
    spine:{
      intro:(total)=>"You are a story architect designing the "+total+"-scene spine of a STORY CIRCLE story with the Infinite Studio method — eight steps around the wheel: a character in a zone of COMFORT (you) WANTS something (need), enters an UNFAMILIAR situation (go), ADAPTS to it (search), GETS what they wanted (find), PAYS a heavy price for it (take), RETURNS to the familiar (return), having CHANGED (change). The top of the circle is order; the bottom is chaos. ",
      firstRange:(firstN,total)=>"scenes 1–"+firstN+": the top of the circle — YOU and NEED (act 1: establish the comfort zone and the want that disturbs it) then GO and SEARCH (act 2: crossing into the unfamiliar and adapting to its rules, road-of-trials style)",
      secondRange:(firstN,total)=>"scenes "+(firstN+1)+"–"+total+": the bottom of the circle and home — FIND and TAKE (act 3: getting what they wanted and paying its true, heavy price) then RETURN and CHANGE (act 4: coming back to the familiar world changed, master of both)",
      sceneRule:"Each scene must TURN a value (opening and closing charge differ in sign or by >=2). Alternate positive/negative for rhythm. The descent into the unfamiliar always costs — every gain in the bottom half carries a price. ",
      closer:"Continue naturally; the take exacts the price, the return proves the change. ",
      actSpec:"a=act 1-4 (1=you/need, 2=go/search, 3=find/take, 4=return/change)" },
    authorBrief:"FRAMEWORK: Story Circle — beats descend into the unfamiliar and climb back out: need, search, find, take, return, change; every gain carries a price and the value charges trace what it costs.",
    synopsis:{ shapeName:"the story circle — a descent for what they need and a return at a price", paras:[
      { key:"comfort", label:"You & Need",      guide:"the comfort zone, who they are in it, and the want that disturbs it." },
      { key:"descent", label:"Go & Search",     guide:"crossing into the unfamiliar and adapting to its rules." },
      { key:"price",   label:"Find & Take",     guide:"getting what they wanted and paying its true, heavy price." },
      { key:"home",    label:"Return & Change", guide:"coming home to the familiar world changed, master of both." } ] } },
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
function fwKindOpts(){ return frameworkOf(window.turnProject).kindOpts; }
function fwActNos(){ return Object.keys(frameworkOf(window.turnProject).acts).map(Number); }
window.fwAuditOf = fwAuditOf; window.fwActName = fwActName; window.fwKindLabel = fwKindLabel;
window.fwKindOpts = fwKindOpts; window.fwActNos = fwActNos;

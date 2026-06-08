/* app.jsx — compose TURN: state, views, tweaks */

const { PROJECT, CHARACTERS, SCENES, BEATS, SCREENPLAY, CONTINUITY, FACTS } = window.TURN_DATA;

/* ---- persistence: keep the user's edited story across refreshes ---- */
const STORY_KEY = "turn-story-v1";
function loadStory(){
  try{ const raw = localStorage.getItem(STORY_KEY); if(!raw) return null;
    const o = JSON.parse(raw); return (o && Array.isArray(o.scenes) && o.scenes.length) ? o : null;
  }catch(e){ return null; }
}
function clearStory(){ try{ localStorage.removeItem(STORY_KEY); }catch(e){} }

/* ---- navigation persistence (device-local, separate from the story doc) ----
   We keep the last room/view/artView in their own localStorage key so a refresh
   lands the user exactly where they were. It's read synchronously in the initial
   useState below — before first paint — and applyDoc never re-applies room, so
   cloud hydration can't flip it afterwards (that flip was the old Art Room flash). */
const NAV_KEY = "turn-nav-v1";
function loadNav(){ try{ return JSON.parse(localStorage.getItem(NAV_KEY)||"null")||{}; }catch(e){ return {}; } }

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "grade": "Teal & Orange",
  "framework": true,
  "density": "regular",
  "display": "Grotesk",
  "grain": true,
  "premium": true
}/*EDITMODE-END*/;

/* darken/saturate an oklch color for legibility on light surfaces */
function shadeOklch(str, dL, dC){
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(str);
  if(!m) return str;
  const L = Math.max(0, Math.min(1, parseFloat(m[1]) + (dL||0)));
  const C = Math.max(0, parseFloat(m[2]) + (dC||0));
  return "oklch("+L.toFixed(3)+" "+C.toFixed(3)+" "+m[3]+")";
}

const GRADES = {
  "Teal & Orange": { pos:"oklch(0.78 0.15 62)", posH:"62", neg:"oklch(0.72 0.10 232)", negH:"232" },
  "Amber & Indigo":{ pos:"oklch(0.80 0.15 85)", posH:"85", neg:"oklch(0.62 0.14 280)", negH:"280" },
  "Ember & Ice":   { pos:"oklch(0.68 0.18 35)", posH:"35", neg:"oklch(0.74 0.09 210)", negH:"210" },
};

/* ---- alternate view: Turn Audit table ---- */
function TurnAudit({ scenes, selId, onSelect }){
  return React.createElement(DragScroll,{className:"canvas-scroll",style:{padding:"18px 28px 40px"}},
    React.createElement("div",{style:{maxWidth:880,margin:"0 auto"}},
      React.createElement("div",{className:"divider"},
        React.createElement("span",{className:"eyebrow"},"Turn Audit · every scene must turn"),
        React.createElement("span",{className:"ln"})),
      React.createElement("div",{style:{border:"1px solid var(--line)",borderRadius:"var(--r-l)",overflow:"hidden"}},
        React.createElement("div",{style:{display:"grid",gridTemplateColumns:"44px 1fr 120px 150px 110px",
          background:"var(--bg-2)",borderBottom:"1px solid var(--line)"}},
          ["#","Scene","Charge","Value shift","Verdict"].map((h,i)=>
            React.createElement("div",{key:i,style:{padding:"10px 14px",fontFamily:"var(--f-mono)",
              fontSize:9,letterSpacing:".1em",textTransform:"uppercase",color:"var(--txt-2)",
              borderLeft:i?"1px solid var(--line)":"none"}},h))),
        scenes.map(s=>{
          const { flagged } = turnInfo(s);
          return React.createElement("div",{key:s.id,onClick:()=>onSelect(s.id),
            style:{display:"grid",gridTemplateColumns:"44px 1fr 120px 150px 110px",cursor:"pointer",
              borderBottom:"1px solid var(--line)",background:s.id===selId?"var(--bg-3)":"transparent",
              alignItems:"center"}},
            React.createElement("div",{style:{padding:"12px 14px",fontFamily:"var(--f-mono)",fontSize:11,color:"var(--txt-3)",fontWeight:700}},String(s.no).padStart(2,"0")),
            React.createElement("div",{style:{padding:"12px 14px",borderLeft:"1px solid var(--line)"}},
              React.createElement("div",{style:{fontFamily:"var(--f-display)",fontSize:13,color:"var(--txt-0)",fontWeight:500}},s.title),
              React.createElement("div",{style:{fontFamily:"var(--f-mono)",fontSize:9.5,color:"var(--txt-3)",marginTop:2}},
                `Act ${["I","II","III"][s.act-1]} · ${s.seq}`,KIND_LABEL[s.kind]?(" · "+KIND_LABEL[s.kind]):"")),
            React.createElement("div",{style:{padding:"12px 14px",borderLeft:"1px solid var(--line)",display:"flex",alignItems:"center",gap:6}},
              React.createElement(ChargeChip,{value:s.openCharge}),
              React.createElement("span",{style:{color:"var(--txt-3)",display:"flex"}},React.createElement(Icon.arrowSmall,{s:11})),
              React.createElement(ChargeChip,{value:s.closeCharge})),
            React.createElement("div",{style:{padding:"12px 14px",borderLeft:"1px solid var(--line)",fontSize:11.5,color:"var(--txt-1)"}},
              `${s.openValue} \u2192 ${s.closeValue}`),
            React.createElement("div",{style:{padding:"12px 14px",borderLeft:"1px solid var(--line)"}},
              flagged
                ? React.createElement("span",{className:"turn-badge no"},React.createElement(Icon.alert,{s:10}),"No turn")
                : React.createElement("span",{className:"turn-badge ok"},React.createElement(Icon.check,{s:10}),"Turns")));
        }))));
}

/* ---- alternate view: Board (acts as columns) ---- */
function Board({ scenes, selId, onSelect }){
  const acts=[1,2,3].map(a=>({act:a,scenes:scenes.filter(s=>s.act===a)}));
  const titles={1:"Act I · Setup",2:"Act II · Complication",3:"Act III · Resolution"};
  return React.createElement(DragScroll,{className:"canvas-scroll board-pan",style:{padding:"18px 22px 40px"}},
    React.createElement("div",{style:{display:"flex",gap:14,minWidth:"max-content"}},
      acts.map(a=>
        React.createElement("div",{key:a.act,style:{width:300,flex:"0 0 300px"}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10,padding:"0 2px"}},
            React.createElement("span",{className:"tree-act-no"},["I","II","III"][a.act-1]),
            React.createElement("span",{style:{fontFamily:"var(--f-display)",fontSize:13,fontWeight:500}},titles[a.act].split("· ")[1]),
            React.createElement("span",{style:{fontFamily:"var(--f-mono)",fontSize:10,color:"var(--txt-3)",marginLeft:"auto"}},a.scenes.length)),
          React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:8}},
            a.scenes.map(s=>{
              const {flagged}=turnInfo(s);
              return React.createElement("div",{key:s.id,onClick:()=>onSelect(s.id),
                className:`scard ${s.id===selId?"sel":""}`,
                style:{width:"auto",borderRadius:"var(--r-m)",border:"1px solid var(--line)",borderTop:"1px solid var(--line)"}},
                React.createElement("div",{className:"scard-top"},
                  React.createElement("span",{className:"scard-no"},String(s.no).padStart(2,"0")),
                  KIND_LABEL[s.kind]&&React.createElement("span",{className:"eyebrow",style:{fontSize:8.5}},KIND_LABEL[s.kind]),
                  React.createElement("div",{className:"scard-conf",style:{marginLeft:"auto"}},
                    [1,2,3].map(i=>React.createElement("span",{key:i,className:`conf-pip ${i<=s.conf?"on":""}`})))),
                React.createElement("div",{className:"scard-title"},s.title),
                React.createElement("div",{style:{fontSize:11,color:"var(--txt-2)",lineHeight:1.4,
                  display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}},s.summary),
                React.createElement("div",{className:"scard-charge"},
                  React.createElement(ChargeChip,{value:s.openCharge}),
                  React.createElement("span",{className:"chip-arrow"},React.createElement(Icon.arrowSmall,{s:11})),
                  React.createElement(ChargeChip,{value:s.closeCharge}),
                  flagged&&React.createElement("span",{className:"tree-flag",style:{marginLeft:"auto"}},React.createElement(Icon.alert,{s:13}))));
            })))))); 
}

/* viewport mode — drives responsive layout (mobile drawers vs desktop columns) */
function useViewport(){
  const get = ()=> typeof window==="undefined" ? "desktop"
    : window.innerWidth < 700 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop";
  const [vp, setVp] = React.useState(get);
  React.useEffect(()=>{
    let raf;
    const onR = ()=>{ cancelAnimationFrame(raf); raf = requestAnimationFrame(()=>setVp(get())); };
    window.addEventListener("resize", onR);
    return ()=>{ window.removeEventListener("resize", onR); cancelAnimationFrame(raf); };
  },[]);
  return vp;
}

function App(){
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const saved = React.useRef(loadStory()).current;
  const nav = React.useRef(loadNav()).current;   // device-local last room/view/artView
  // Clean canvas for everyone: with no saved local story, start EMPTY (not the Matrix
  // sample). A real saved story is still restored. The Matrix lives only in a user's
  // own saved/cloud projects + the seed (story-data.jsx, used by tests/sample).
  const [scenes, setScenes] = React.useState(()=> (saved && saved.scenes) || []);
  const [characters, setCharacters] = React.useState(()=> (saved && saved.characters) || []);
  const [props, setProps] = React.useState(()=> (saved && saved.props) || []);
  const [locations, setLocations] = React.useState(()=> (saved && saved.locations) || []);
  const [shots, setShots] = React.useState(()=> (saved && saved.shots) || []);
  const [project, setProject] = React.useState(()=> (saved && saved.project) || ({ title:"Untitled film", genre:"", logline:"", controllingIdea:{} }));
  const [selId, setSelId] = React.useState(()=> (saved && saved.selId) || null);
  const [selChar, setSelChar] = React.useState(null);
  // Restore the room the user last had open (Writers' or Art) from the device-local
  // NAV_KEY — read synchronously so it's correct on first paint. applyDoc never
  // re-applies room, so cloud hydration can't flip it (that flip was the old flash).
  const [room, setRoom] = React.useState(()=> nav.room || "writers");
  const [artView, setArtView] = React.useState(()=> nav.artView || (saved && saved.artView) || "props");
  // once-per-story guard so auto-seeding the Props tab from the cast doesn't
  // re-add props the user has deliberately deleted.
  const [propsSeeded, setPropsSeeded] = React.useState(()=> !!(saved && saved.propsSeeded));
  const [locsSeeded, setLocsSeeded] = React.useState(()=> !!(saved && saved.locsSeeded));
  // once-per-story guard so the cast is auto-drafted the first time the Art Room
  // opens (not re-drafted on every visit), plus the set of character ids currently
  // being drafted so each card can show its own inline "Drafting…" status.
  const [visualsSeeded, setVisualsSeeded] = React.useState(()=> !!(saved && saved.visualsSeeded));
  const [draftingVisualIds, setDraftingVisualIds] = React.useState([]);
  const [draftingVisualId, setDraftingVisualId] = React.useState(null);
  const [view, setView] = React.useState(()=> nav.view || (saved && saved.view) || "spine");
  const vp = useViewport();
  const railDrawer = vp !== "desktop";   // tablet + mobile: rail overlays as a drawer
  const inspDrawer = vp === "mobile";    // mobile only: inspector overlays as a drawer
  const [aiOpen, setAiOpen] = React.useState(()=> typeof window!=="undefined" && window.innerWidth>=1100);
  const [railOpen, setRailOpen] = React.useState(()=> typeof window==="undefined" || window.innerWidth>=1100);
  const [inspOpen, setInspOpen] = React.useState(()=> typeof window==="undefined" || window.innerWidth>=700);
  // when crossing a breakpoint, snap panels to a sane default for that size
  const lastVp = React.useRef(vp);
  React.useEffect(()=>{
    if(lastVp.current === vp){ return; }
    if(vp==="desktop"){ setRailOpen(true); setInspOpen(true); }
    else if(vp==="tablet"){ setRailOpen(false); setInspOpen(true); }
    else { setRailOpen(false); setInspOpen(false); setAiOpen(false); }
    lastVp.current = vp;
  },[vp]);
  // on mobile, only one overlay at a time
  const excl = ()=> vp==="mobile";
  const toggleRail = ()=> setRailOpen(o=>{ const n=!o; if(n && excl()){ setInspOpen(false); setAiOpen(false); } return n; });
  const toggleInsp = ()=> setInspOpen(o=>{ const n=!o; if(n && excl()){ setRailOpen(false); setAiOpen(false); } return n; });
  const toggleAI   = ()=> setAiOpen(o=>{ const n=!o; if(n && excl()){ setRailOpen(false); setInspOpen(false); } return n; });
  const [drafts, setDrafts] = React.useState(()=> (saved && saved.drafts) || ({}));
  const [drafting, setDrafting] = React.useState(null);
  const [beatsMap, setBeatsMap] = React.useState(()=> (saved && saved.beatsMap) || ({}));
  const [history, setHistory] = React.useState(()=> (saved && saved.history) || {});   // {sceneId:{back:[ver...], fwd:[ver...]}}
  const [continuityMap, setContinuityMap] = React.useState(()=> (saved && saved.continuityMap) || {});
  const [agentsOpen, setAgentsOpen] = React.useState(false);
  const [newStoryOpen, setNewStoryOpen] = React.useState(false);

  // ---- cloud auth (Supabase) ----
  const [session, setSession] = React.useState(null);
  const [authOpen, setAuthOpen] = React.useState(false);
  const [authMode, setAuthMode] = React.useState("signin");   // which tab the auth modal opens on
  const [authReady, setAuthReady] = React.useState(false);    // has the initial session check resolved?
  const openAuth = (mode)=>{ setAuthMode(mode==="signup"?"signup":"signin"); setAuthOpen(true); };

  // Intended plan from the landing pricing CTAs. Persisted to localStorage so checkout /
  // onboarding can read which tier the visitor chose AFTER they sign up:
  //   window.turnIntendedPlan()  -> "free" | "pro" | "studio" | null
  //   window.turnClearIntendedPlan()  (call once checkout has consumed it)
  const [intendedPlan, setIntendedPlan] = React.useState(()=>{ try{ return localStorage.getItem("turn-intended-plan")||null; }catch(e){ return null; } });
  const startWithPlan = (plan)=>{
    const p = (plan==="pro"||plan==="studio") ? plan : "free";
    try{ localStorage.setItem("turn-intended-plan", p); }catch(e){}
    setIntendedPlan(p); openAuth("signup");
  };
  React.useEffect(()=>{
    window.turnIntendedPlan = ()=>{ try{ return localStorage.getItem("turn-intended-plan")||null; }catch(e){ return null; } };
    window.turnClearIntendedPlan = ()=>{ try{ localStorage.removeItem("turn-intended-plan"); }catch(e){} setIntendedPlan(null); };
  },[]);
  React.useEffect(()=>{
    if(!(typeof cloudConfigured==="function" && cloudConfigured())){ setAuthReady(true); return; }
    let unsub = ()=>{};
    (async()=>{
      try{ setSession(await cloudGetSession()); }catch(e){}
      setAuthReady(true);   // landing/app gate waits for this so signed-in users never flash the landing
      unsub = cloudOnAuth((s)=>setSession(s));
    })();
    return ()=>{ try{ unsub(); }catch(e){} };
  },[]);
  const signOut = async ()=>{ try{ await cloudSignOut(); }catch(e){} setSession(null); };

  // ---- cloud projects + doc sync ----
  const [projects, setProjects] = React.useState([]);
  const [currentProjectId, setCurrentProjectId] = React.useState(null);
  const cloudMode = !!(session && currentProjectId);
  const hydratingRef = React.useRef(false);
  // bumped when a hydration pass finishes — lets effects that are gated on
  // hydratingRef (auto-seed) re-run once the doc has settled, even if the user
  // is already sitting on the tab (e.g. reloaded straight into Locations).
  const [hydrationTick, setHydrationTick] = React.useState(0);

  const freshDoc = ()=>({ scenes:SCENES, characters:CHARACTERS, props:(window.PROPS_SEED||[]), locations:[], shots:[],
    project:PROJECT, drafts:SCREENPLAY, beatsMap:BEATS, history:{}, continuityMap:CONTINUITY||{},
    selId:"s4", room:"writers", view:"spine", artView:"props", propsSeeded:false, locsSeeded:false, visualsSeeded:false });
  /* A clean canvas — what every NEW registered user (and every "New film") starts
     from. No sample data: empty spine, cast, props, etc. The Matrix sample lives only
     in the seed (story-data.jsx) and in projects already saved to a user's account. */
  const emptyDoc = ()=>({ scenes:[], characters:[], props:[], locations:[], shots:[],
    project:{ title:"Untitled film", genre:"", logline:"", controllingIdea:{} },
    drafts:{}, beatsMap:{}, history:{}, continuityMap:{},
    selId:null, room:"writers", view:"spine", artView:"props", propsSeeded:false, locsSeeded:false, visualsSeeded:false, blank:true });
  const applyDoc = (d)=>{
    d = d || {};
    hydratingRef.current = true;
    // honor an explicitly-empty project (clean canvas); only fall back to the sample
    // when the doc has no scenes array at all (missing/legacy doc).
    setScenes(Array.isArray(d.scenes)?d.scenes:SCENES);
    setCharacters(d.characters||CHARACTERS);
    setProps(d.props||(window.PROPS_SEED||[]));
    setLocations(d.locations||[]);
    setShots(d.shots||[]);
    setProject(d.project||PROJECT);
    setDrafts(d.drafts||SCREENPLAY);
    setBeatsMap(d.beatsMap||BEATS);
    setHistory(d.history||{});
    setContinuityMap(d.continuityMap||CONTINUITY||{});
    setSelId(d.selId||"s4");
    // Navigation (room / view / artView) is device-local UI state owned by NAV_KEY
    // and restored synchronously in useState above. Intentionally do NOT re-apply
    // any of it from the hydrated doc — that re-application is what produced the
    // Art Room flash (and would fight the user's restored place) on load.
    setPropsSeeded(!!d.propsSeeded);
    setLocsSeeded(!!d.locsSeeded);
    setVisualsSeeded(!!d.visualsSeeded);
    setTimeout(()=>{ hydratingRef.current = false; setHydrationTick(t=>t+1); }, 500);
  };
  const loadProjectIntoState = async (id)=>{
    const row = await cloudLoadProject(id);
    if(!row) return;
    const uid = (typeof cloudUserId==="function") ? cloudUserId(session) : null;
    if(typeof nbUseCloud==="function") nbUseCloud(id, uid);
    setCurrentProjectId(id);
    applyDoc(row.doc||{});
  };
  /* on sign-in: load the user's projects (creating a first one if needed) and open
     the most recent. On sign-out: drop cloud mode and fall back to local storage. */
  /* Bootstrap the project list ONCE per sign-in. `session` changes on every auth
     event (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED…), and the create-if-empty
     below is async — without this guard, several concurrent runs each see an empty
     list and each create a "My film", spawning duplicate empty projects. The ref
     resets on sign-out so the next sign-in bootstraps again. */
  const bootRef = React.useRef(false);
  // Depend on the STABLE user id, not the session object: Supabase fires several auth
  // events on sign-in (INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED), each a NEW session
  // object. If the effect keyed on `session`, a later event would re-run it and cancel the
  // in-flight bootstrap (alive=false) while bootRef blocked the new run — so the project
  // never loaded and the app sat on "Connecting". Keying on the uid runs it once per sign-in.
  const bootUserId = session ? (((typeof cloudUserId==="function") && cloudUserId(session)) || "signed-in") : null;
  React.useEffect(()=>{
    if(!(typeof cloudConfigured==="function" && cloudConfigured())) return;
    if(!bootUserId){ bootRef.current=false; setProjects([]); setCurrentProjectId(null); if(typeof nbUseLocal==="function") nbUseLocal(); return; }
    if(bootRef.current) return;            // already bootstrapped this sign-in
    bootRef.current = true;
    let alive = true;
    (async()=>{
      let list = await cloudListProjects();
      if(!list.length){
        const created = await cloudCreateProject("Untitled film", emptyDoc());
        if(created) list = [created];
      }
      if(!alive) return;
      setProjects(list);
      if(list[0]) await loadProjectIntoState(list[0].id);
    })().catch(()=>{});
    return ()=>{ alive=false; };
  },[bootUserId]);

  const switchProject = async (id)=>{ if(id===currentProjectId) return; await loadProjectIntoState(id); };
  const createProject = async (title)=>{
    const created = await cloudCreateProject(title||"Untitled film", emptyDoc());
    if(!created) return;
    setProjects(ps=>[created, ...ps]);
    await loadProjectIntoState(created.id);
  };
  const renameProject = async (id, title)=>{
    await cloudRenameProject(id, title);
    setProjects(ps=>ps.map(p=>p.id===id?{...p,title}:p));
  };
  const deleteProject = async (id)=>{
    await cloudDeleteProject(id);
    const remaining = projects.filter(p=>p.id!==id);
    setProjects(remaining);
    if(id===currentProjectId){
      if(remaining[0]) await loadProjectIntoState(remaining[0].id);
      else { const created = await cloudCreateProject("Untitled film", emptyDoc()); if(created){ setProjects([created]); await loadProjectIntoState(created.id); } }
    }
  };
  const [agentLaunch, setAgentLaunch] = React.useState(null);   // {id, input} to auto-run an agent

  // persist navigation (room/view/artView) to the device-local key on every change
  React.useEffect(()=>{
    try{ localStorage.setItem(NAV_KEY, JSON.stringify({ room, view, artView })); }catch(e){}
  },[room, view, artView]);

  // persist the editable story so a browser refresh / reopen keeps the user's work
  const saveTimer = React.useRef(null);
  React.useEffect(()=>{
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>{
      if(hydratingRef.current) return;
      const doc = { scenes, characters, props, locations, shots, project, drafts, beatsMap, history, continuityMap, selId, room, view, artView, propsSeeded, locsSeeded, visualsSeeded };
      if(cloudMode){ if(typeof cloudSaveDoc==="function") cloudSaveDoc(currentProjectId, doc); }
      else { try{ localStorage.setItem(STORY_KEY, JSON.stringify(doc)); }catch(e){} }
    }, cloudMode ? 700 : 250);
    return ()=> clearTimeout(saveTimer.current);
  },[scenes, characters, props, locations, shots, project, drafts, beatsMap, history, continuityMap, selId, room, view, artView, propsSeeded, locsSeeded, visualsSeeded, cloudMode, currentProjectId]);

  const resetStory = ()=>{
    clearStory();
    setScenes(SCENES); setCharacters(CHARACTERS); setProps((window.PROPS_SEED||[])); setLocations([]); setShots([]); setProject(PROJECT); setDrafts(SCREENPLAY); setBeatsMap(BEATS);
    setHistory({}); setContinuityMap(CONTINUITY||{}); setSelId("s4"); setSelChar(null); setPropsSeeded(false); setLocsSeeded(false); setVisualsSeeded(false);
  };

  // ---- character handlers ----
  const updateCharacter = (id,patch)=>setCharacters(cs=>cs.map(c=>c.id===id?{...c,...patch}:c));
  // add a character BY HAND (not from the script) — gets a manual flag so its sheet
  // generation is spec-gated like hand-added props/locations.
  const addCharacter = ()=>{
    const id = "char-"+Date.now().toString(36);
    setCharacters(cs=>[...cs, { id, name:"New character", role:"",
      color:"linear-gradient(135deg,#6a6f7a,#262a30)", conscious:"", unconscious:"", arc:"", manual:true }]);
  };
  const deleteCharacter = (id)=>{
    setCharacters(cs=>cs.filter(c=>c.id!==id));
    try{ if(typeof nbClearAsset==="function") nbClearAsset(id); }catch(e){}
  };
  const [charDrafting, setCharDrafting] = React.useState(null);
  const draftCharacter = async (ch)=>{
    if(charDrafting) return;
    setCharDrafting(ch.id);
    const driven = scenes.filter(s=>s.driver===ch.id);
    try{
      const res = (typeof aiDraftCharacter==="function") ? await aiDraftCharacter(ch, driven, project) : null;
      if(res) updateCharacter(ch.id, res);
    }catch(e){}
    setCharDrafting(null);
  };
  const selectScene = (id)=>{ setSelId(id); setSelChar(null); };

  // Art Room: draft a character's visual layer (look/wardrobe/props) from the script
  const draftCharacterVisuals = async (ch)=>{
    if(draftingVisualId) return;
    setDraftingVisualId(ch.id);
    const driven = scenes.filter(s=>s.driver===ch.id);
    try{
      const res = (typeof aiCharacterVisuals==="function") ? await aiCharacterVisuals(ch, driven, project) : null;
      if(res) updateCharacter(ch.id, res);
    }catch(e){}
    setDraftingVisualId(null);
  };
  const [draftingAllVisuals, setDraftingAllVisuals] = React.useState(false);
  // "Draft all characters" — fills the spec ONLY for characters that haven't been
  // drafted yet (identity, wardrobe, props & accessories, look dev), then suggests
  // continuity states for them. NON-DESTRUCTIVE by design: already-drafted or
  // hand-edited characters are never overwritten, so this is safe to auto-run.
  const draftAllVisuals = async ()=>{
    if(draftingAllVisuals || !(typeof aiCastVisualBible==="function")) return;
    const drafted = (typeof window.charVisualsDrafted==="function") ? window.charVisualsDrafted : (()=>true);
    const targets = characters.filter(c=> !drafted(c));
    if(!targets.length) return;                 // nothing to do — don't fire AI
    const targetIds = targets.map(c=>c.id);
    setDraftingVisualIds(targetIds);
    setDraftingAllVisuals(true);
    try{
      const map = await aiCastVisualBible(targets, scenes, project);
      // merge ONLY the targeted (undrafted) characters — never touch the rest
      if(map){
        const allow = new Set(targetIds);
        setCharacters(cs=>cs.map(c=> (allow.has(c.id) && map[c.id]) ? {...c, ...map[c.id]} : c));
      }
      // continuity (if applicable): add suggested appearance states, dedup by label, never remove
      if(typeof aiSuggestStates==="function"){
        const results = await Promise.all(targets.map(async c=>{
          const driven = scenes.filter(s=>s.driver===c.id);
          if(!driven.length) return { id:c.id, states:null };
          try{ return { id:c.id, states: await aiSuggestStates(c, driven, project) }; }
          catch(e){ return { id:c.id, states:null }; }
        }));
        const add = {}; results.forEach(r=>{ if(r.states && r.states.length) add[r.id]=r.states; });
        if(Object.keys(add).length){
          setCharacters(cs=>cs.map(c=>{
            const sug = add[c.id]; if(!sug) return c;
            const existing = c.states || [];
            const have = new Set(existing.map(s=>(s.label||"").trim().toLowerCase()));
            const adds = sug.filter(s=>!have.has((s.label||"").trim().toLowerCase()));
            return adds.length ? {...c, states:[...existing, ...adds]} : c;
          }));
        }
      }
    }catch(e){}
    setDraftingAllVisuals(false);
    setDraftingVisualIds([]);
  };

  // ---- Art Room: PROPS ----
  const updateProp = (id,patch)=>setProps(ps=>ps.map(p=>p.id===id?{...p,...patch}:p));
  const [draftingPropId, setDraftingPropId] = React.useState(null);
  const [draftingAllProps, setDraftingAllProps] = React.useState(false);
  const addProp = ()=>{
    const id = "prop-"+Date.now().toString(36);
    setProps(ps=>[...ps, { id, name:"New prop", kind:"carried", ownerId:"", ownerName:"",
      form:"", material:"", detail:"", renderStyle:"", negativePrompt:"", manual:true }]);
  };
  const deleteProp = (id)=>{
    setProps(ps=>ps.filter(p=>p.id!==id));
    try{ if(typeof nbClearAsset==="function") nbClearAsset(id); }catch(e){}
  };
  // merge a set of duplicate prop cards (same owner + same object) into ONE: keep the
  // richest card (most scenes, then one with a generated sheet, then longest name),
  // union the scene coverage, backfill any empty spec fields from the others, and
  // delete the rest. Non-destructive to the survivor's own image/spec.
  const mergeProps = (ids)=>{
    const set = (props||[]).filter(p=> ids.indexOf(p.id)>=0);
    if(set.length<2) return;
    const hasImg = (id)=> (typeof nbGetImage==="function") ? !!nbGetImage(id) : false;
    const score = (p)=> ((p.scenes||[]).length*100) + (hasImg(p.id)?40:0) + Math.min((p.name||"").length,30);
    const survivor = set.slice().sort((a,b)=> score(b)-score(a))[0];
    const others = set.filter(p=>p.id!==survivor.id);
    // union scenes (only if scene-mapping has happened on any of them)
    const anyScenes = set.some(p=>p.scenes!==undefined);
    const scenesU = anyScenes ? Array.from(new Set(set.flatMap(p=>p.scenes||[]))) : survivor.scenes;
    // backfill empty spec fields from the others
    const patch = { };
    if(anyScenes) patch.scenes = scenesU;
    ["form","material","detail","renderStyle"].forEach(f=>{
      if(!String(survivor[f]||"").trim()){ const donor = others.find(o=>String(o[f]||"").trim()); if(donor) patch[f]=donor[f]; }
    });
    setProps(ps=>ps.map(p=> p.id===survivor.id ? {...p, ...patch} : p).filter(p=> p.id===survivor.id || ids.indexOf(p.id)<0));
    others.forEach(o=>{ try{ if(typeof nbClearAsset==="function") nbClearAsset(o.id); }catch(e){} });
  };
  // prop card + its generated sheet from the Props tab (the card confirms first).
  // Match on owner + normalised name so it stays in sync with prop-seeding.
  const removeOwnedProp = (charId, itemText)=>{
    const norm = s=> String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
    const target = norm(itemText);
    if(!charId || !target) return;
    setProps(ps=>{
      const victims = ps.filter(p=> p.ownerId===charId && norm(p.name)===target);
      victims.forEach(p=>{ try{ if(typeof nbClearAsset==="function") nbClearAsset(p.id); }catch(e){} });
      return victims.length ? ps.filter(p=>!victims.includes(p)) : ps;
    });
  };
  const draftPropVisuals = async (pr)=>{
    if(draftingPropId || !(typeof aiPropVisuals==="function")) return;
    setDraftingPropId(pr.id);
    try{
      const res = await aiPropVisuals(pr, characters, project);
      if(res) updateProp(pr.id, res);
    }catch(e){}
    setDraftingPropId(null);
  };
  // "Draft all props" — the full props pipeline in one click:
  //   1) SYNC any missing cards from the cast (worn/carried, dedup by owner+name)
  //   2) DRAFT every card's spec (form/material/significance/look dev) from the script
  //   3) MAP every card to the scenes it appears in (worn -> owner presence, carried -> AI)
  // Replaces the old separate "Pull from cast" + "Re-map scenes" buttons.
  const draftAllProps = async ()=>{
    if(draftingAllProps) return;
    setDraftingAllProps(true);
    try{
      // 1) sync from cast
      let working = props;
      if(typeof propsFromCast==="function"){
        const derived = propsFromCast(characters, props);
        if(derived.length){ working = [...props, ...derived]; setProps(working); setPropsSeeded(true); }
      }
      // 2) draft specs
      if(typeof aiDesignPropBible==="function" && working.length){
        const map = await aiDesignPropBible(working, characters, project);
        if(map){ working = working.map(p=> map[p.id] ? {...p, ...map[p.id]} : p);
          setProps(ps=>ps.map(p=> map[p.id] ? {...p, ...map[p.id]} : p)); }
      }
      // 3) map scenes
      if(typeof aiPropScenes==="function" && working.length){
        const smap = await aiPropScenes(working, scenes, drafts, characters);
        if(smap) setProps(ps=>ps.map(p=> smap[p.id] ? {...p, scenes: smap[p.id]} : p));
      }
    }catch(e){}
    setDraftingAllProps(false);
  };
  // Pull standalone prop cards out of the cast's existing "Props & accessories"
  // fields (worn -> kind "worn", carried -> kind "carried"). Dedups against
  // what's already in the tab, so it's safe to call repeatedly.
  const seedPropsFromCast = React.useCallback(()=>{
    if(typeof propsFromCast!=="function") return;
    const derived = propsFromCast(characters, props);
    setPropsSeeded(true);
    if(derived.length) setProps(ps=>[...ps, ...derived]);
  },[characters, props]);
  // auto-seed once per story: when you first open the Art Room with an empty
  // Props tab while the cast already carries items, fill it from them.
  React.useEffect(()=>{
    if(propsSeeded || hydratingRef.current) return;
    if(room!=="art" || artView!=="props") return;
    if(props.length) { setPropsSeeded(true); return; }   // user already has props -> don't auto-pull
    if(typeof castHasProps==="function" && castHasProps(characters)) seedPropsFromCast();
  },[room, artView, propsSeeded, props.length, characters, seedPropsFromCast, hydrationTick]);
  // auto-draft the cast once per story: the FIRST time the Art Room opens (any tab),
  // silently fill the spec for any undrafted character so the user can go straight
  // to Props → generate → Characters → generate without a manual "Draft all" step.
  // Guarded so it only ever attempts once and never overwrites drafted/edited cards.
  React.useEffect(()=>{
    if(visualsSeeded || hydratingRef.current) return;
    if(room!=="art") return;
    if(!characters.length) return;                 // wait for hydration
    setVisualsSeeded(true);                         // attempt once per story, then never again
    const drafted = (typeof window.charVisualsDrafted==="function") ? window.charVisualsDrafted : (()=>true);
    if(characters.some(c=>!drafted(c))) draftAllVisuals();
  },[room, visualsSeeded, characters, hydrationTick]);
  // map each prop to the scenes it appears in (worn -> owner presence, carried -> AI exact)
  const [taggingScenes, setTaggingScenes] = React.useState(false);
  const tagPropScenes = async ()=>{
    if(taggingScenes || !(typeof aiPropScenes==="function") || !props.length) return;
    setTaggingScenes(true);
    try{
      const map = await aiPropScenes(props, scenes, drafts, characters);
      if(map) setProps(ps=>ps.map(p=> map[p.id] ? {...p, scenes: map[p.id]} : p));
    }catch(e){}
    setTaggingScenes(false);
  };
  // re-map ONE prop's scenes (without re-drafting its spec) — per-card action
  const [taggingSceneId, setTaggingSceneId] = React.useState(null);
  const tagOnePropScenes = async (p)=>{
    if(taggingSceneId || !p || !(typeof aiPropScenes==="function")) return;
    setTaggingSceneId(p.id);
    try{
      const map = await aiPropScenes([p], scenes, drafts, characters);
      const next = (map && map[p.id]) ? map[p.id] : [];
      setProps(ps=>ps.map(x=> x.id===p.id ? {...x, scenes: next} : x));
    }catch(e){}
    setTaggingSceneId(null);
  };

  // ---- Art Room: LOCATIONS ----
  const updateLocation = (id,patch)=>setLocations(ls=>ls.map(l=>l.id===id?{...l,...patch}:l));
  const [draftingLocId, setDraftingLocId] = React.useState(null);
  const [draftingAllLocs, setDraftingAllLocs] = React.useState(false);
  const [assigningStyles, setAssigningStyles] = React.useState(false);
  const addLocation = ()=>{
    const id = "loc-"+Date.now().toString(36);
    setLocations(ls=>[...ls, { id, key:id, name:"New location", intExt:"INT", times:[], areas:[], scenes:[],
      architecture:"", materials:"", lighting:"", significance:"", renderStyle:"", negativePrompt:"", variants:[], manual:true }]);
  };
  const deleteLocation = (id)=>{
    setLocations(ls=>ls.filter(l=>l.id!==id));
    try{ if(typeof nbClearAsset==="function") nbClearAsset(id); }catch(e){}
  };
  const draftLocationVisuals = async (l)=>{
    if(draftingLocId || !(typeof aiLocationVisuals==="function")) return;
    setDraftingLocId(l.id);
    try{
      const fields = await aiLocationVisuals(l, scenes, project);
      if(fields) setLocations(ls=>ls.map(x=>x.id===l.id?{...x, ...fields}:x));
    }catch(e){}
    setDraftingLocId(null);
  };
  // "Draft all locations" — the full locations pipeline in one click:
  //   1) PULL any missing places from the script's sluglines (+ refresh scene lists)
  //   2) DRAFT every card's spec (The space + Significance + Look dev) from the script
  //   3) STAGE each location's depth grid off the freshly-designed space
  // Replaces the old separate "Pull from script" button.
  const draftAllLocations = async ()=>{
    if(draftingAllLocs || !(typeof aiDesignLocationBible==="function")) return;
    setDraftingAllLocs(true);
    try{
      // 1) pull missing + refresh scene lists on existing
      let working = locations;
      if(typeof deriveLocations==="function"){
        const derived = deriveLocations(scenes, locations);   // places not yet present
        const fresh = deriveLocations(scenes, []);            // all, to refresh scene chips
        working = locations.map(l=>{ const m=fresh.find(f=>f.key===l.key);
          return m?{...l, scenes:m.scenes, times:[...new Set([...(l.times||[]),...m.times])], areas:[...new Set([...(l.areas||[]),...m.areas])]}:l; });
        if(derived.length) working = [...working, ...derived];
        setLocsSeeded(true);
        if(derived.length || working.length) setLocations(working);
      }
      if(!working.length){ setDraftingAllLocs(false); return; }
      // 2) draft specs
      const map = await aiDesignLocationBible(working, scenes, project);
      const merged = working.map(l=> (map && map[l.id]) ? {...l, ...map[l.id]} : l);
      if(map) setLocations(ls=>ls.map(l=> map[l.id] ? {...l, ...map[l.id]} : l));
      // 3) depth-grid staging, using the just-designed architecture/materials/lighting
      if(typeof aiDraftStaging==="function"){
        const stages = await Promise.all(merged.map(async l=>{
          try{ return { id:l.id, staging: await aiDraftStaging(l, scenes, project) }; }
          catch(e){ return { id:l.id, staging:null }; }
        }));
        const sMap = {}; stages.forEach(x=>{ if(x.staging) sMap[x.id]=x.staging; });
        if(Object.keys(sMap).length) setLocations(ls=>ls.map(l=> sMap[l.id] ? {...l, staging:sMap[l.id]} : l));
      }
    }catch(e){}
    setDraftingAllLocs(false);
  };
  // draft a location's depth-grid staging from the script
  const [draftingStageId, setDraftingStageId] = React.useState(null);
  const draftLocationStaging = async (l)=>{
    if(draftingStageId || !(typeof aiDraftStaging==="function")) return;
    setDraftingStageId(l.id);
    try{
      const staging = await aiDraftStaging(l, scenes, project);
      if(staging) setLocations(ls=>ls.map(x=>x.id===l.id?{...x, staging}:x));
    }catch(e){}
    setDraftingStageId(null);
  };
  // derive locations from the script's sluglines; dedups against existing
  const pullLocationsFromScript = React.useCallback(()=>{
    if(typeof deriveLocations!=="function") return;
    const derived = deriveLocations(scenes, locations);
    setLocsSeeded(true);
    if(derived.length) setLocations(ls=>[...ls, ...derived]);
    // also refresh the scene lists on existing locations as the script grows
    else if(locations.length){
      const fresh = deriveLocations(scenes, []);
      setLocations(ls=>ls.map(l=>{ const m=fresh.find(f=>f.key===l.key); return m?{...l, scenes:m.scenes, times:[...new Set([...(l.times||[]),...m.times])], areas:[...new Set([...(l.areas||[]),...m.areas])]}:l; }));
    }
  },[scenes, locations]);
  // auto-seed once per story: first time the Locations tab opens empty, derive them
  React.useEffect(()=>{
    if(locsSeeded || hydratingRef.current) return;
    if(room!=="art" || artView!=="locations") return;
    if(locations.length){ setLocsSeeded(true); return; }
    if(typeof scriptHasLocations==="function" && scriptHasLocations(scenes)) pullLocationsFromScript();
  },[room, artView, locsSeeded, locations.length, scenes, pullLocationsFromScript, hydrationTick]);
  // read the whole film and assign each scene a Style Bible preset
  const assignSceneStyles = async ()=>{
    if(assigningStyles || !(typeof aiAssignSceneStyles==="function")) return;
    setAssigningStyles(true);
    try{
      const presets = (typeof styleBibleOf==="function") ? styleBibleOf(project).presets : (window.STYLE_PRESETS_DEFAULT||[]);
      const res = await aiAssignSceneStyles(scenes, presets, drafts, project);
      if(res){
        setProject(p=>{
          const sb = (p.styleBible)||{};
          const mergedPresets = [...presets];
          (res.newPresets||[]).forEach(np=>{ if(!mergedPresets.find(x=>x.id===np.id)) mergedPresets.push(np); });
          return {...p, styleBible:{ presets:mergedPresets, sceneStyles:{...(sb.sceneStyles||{}), ...(res.sceneStyles||{})} }};
        });
      }
    }catch(e){}
    setAssigningStyles(false);
  };

  // ---- Art Room: SHOT LIST ----
  // A shot = one beat. "Draft all shots" derives the shot breakdown for every scene
  // that doesn't have one yet (non-destructive); per-scene re-draft replaces one scene.
  const updateShot = (id,patch)=> setShots(ss=>ss.map(s=>s.id===id?{...s,...patch}:s));
  const deleteShot = (id)=>{ setShots(ss=>ss.filter(s=>s.id!==id)); try{ if(typeof nbClearAsset==="function") nbClearAsset(id); }catch(e){} };
  const addShot = (sceneId)=>{
    const loc = (typeof locationForScene==="function") ? locationForScene(locations, sceneId) : null;
    const sc = scenes.find(s=>s.id===sceneId);
    const peers = shots.filter(s=>s.sceneId===sceneId);
    const id = "shot-"+sceneId+"-m"+Date.now().toString(36);
    setShots(ss=>[...ss, { id, sceneId, beatN:(peers.length+1), order:peers.length,
      size:"MS", angle:"eye", move:"static", lens:"50", composition:"",
      subjects:(sc&&sc.driver)?[sc.driver]:[], locationId:loc?loc.id:"", props:[],
      action:"", dialogue:"", negativePrompt:"", manual:true }]);
  };
  // derive one scene's shots (AI, with heuristic fallback). replace=true wipes its old shots.
  const draftOneSceneShots = async (scene, replace)=>{
    let made = null;
    if(typeof aiDraftShots==="function"){
      const raw = await aiDraftShots(scene, beatsMap, drafts, locations, props, characters, project);
      if(raw && raw.length && typeof normalizeShot==="function"){
        made = raw.map((r,i)=>normalizeShot(r, scene, i, locations, props, characters, beatsMap));
      }
    }
    if(!made && typeof deriveShotsHeuristic==="function"){
      made = deriveShotsHeuristic(scene, beatsMap, locations, props, characters);
    }
    if(!made || !made.length) return;
    setShots(ss=>{ const kept = replace ? ss.filter(s=>s.sceneId!==scene.id) : ss; return [...kept, ...made]; });
  };
  const [draftingSceneShots, setDraftingSceneShots] = React.useState(null);
  const draftSceneShots = async (scene)=>{
    if(draftingSceneShots) return;
    setDraftingSceneShots(scene.id);
    try{ await draftOneSceneShots(scene, true); }catch(e){}
    setDraftingSceneShots(null);
  };
  const [draftingAllShots, setDraftingAllShots] = React.useState(false);
  const draftAllShots = async ()=>{
    if(draftingAllShots) return;
    setDraftingAllShots(true);
    try{
      const ordered = scenes.slice().sort((a,b)=>(a.no||0)-(b.no||0));
      const have = new Set(shots.map(s=>s.sceneId));
      const todo = ordered.filter(s=>!have.has(s.id));   // non-destructive: skip scenes already broken down
      for(let i=0;i<todo.length;i+=3){
        await Promise.all(todo.slice(i,i+3).map(sc=>draftOneSceneShots(sc, false).catch(()=>{})));
      }
    }catch(e){}
    setDraftingAllShots(false);
  };

  // Art Room: suggest a character's appearance states (continuity variants) from the script
  const [suggestingStatesId, setSuggestingStatesId] = React.useState(null);
  const suggestCharacterStates = async (ch)=>{
    if(suggestingStatesId || !(typeof aiSuggestStates==="function")) return;
    setSuggestingStatesId(ch.id);
    const driven = scenes.filter(s=>s.driver===ch.id);
    try{
      const suggested = await aiSuggestStates(ch, driven, project);
      if(suggested && suggested.length){
        setCharacters(cs=>cs.map(c=>{
          if(c.id!==ch.id) return c;
          const existing = c.states || [];
          const have = new Set(existing.map(s=>(s.label||"").trim().toLowerCase()));
          const adds = suggested.filter(s=>!have.has((s.label||"").trim().toLowerCase()));
          return { ...c, states: [...existing, ...adds] };
        }));
      }
    }catch(e){}
    setSuggestingStatesId(null);
  };

  // ---- appearance: dark / light / system ----
  const [theme, setThemeState] = React.useState(()=>{ try{ return localStorage.getItem("turn-theme")||"dark"; }catch(e){ return "dark"; } });
  const [sysDark, setSysDark] = React.useState(()=> !window.matchMedia || window.matchMedia("(prefers-color-scheme: dark)").matches);
  React.useEffect(()=>{
    if(!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = ()=> setSysDark(mq.matches);
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return ()=> mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on);
  },[]);
  const effectiveTheme = theme==="system" ? (sysDark?"dark":"light") : theme;
  const setTheme = (m)=>{ setThemeState(m); try{ localStorage.setItem("turn-theme", m); }catch(e){} };
  React.useEffect(()=>{ document.documentElement.dataset.theme = effectiveTheme; },[effectiveTheme]);

  // large screens keep rail sections open; laptops/tablets/mobile fold them by default
  const [wide, setWide] = React.useState(()=> typeof window==="undefined" || window.innerWidth>=1500);
  React.useEffect(()=>{
    const on = ()=> setWide(window.innerWidth>=1500);
    window.addEventListener("resize", on);
    return ()=> window.removeEventListener("resize", on);
  },[]);

  // when a scene is selected, center it horizontally in the spine/board so the user
  // sees what they just picked (e.g. clicking a scene in the left sidebar)
  React.useEffect(()=>{
    const sel = view==="spine" ? ".canvas-scroll.spine-pan"
              : view==="board" ? ".canvas-scroll.board-pan" : null;
    if(!sel) return;
    const cont = document.querySelector(sel);
    if(!cont) return;
    const timer = setTimeout(()=>{
      const card = cont.querySelector(".scard.sel");
      if(!card) return;
      const cr = card.getBoundingClientRect();
      const kr = cont.getBoundingClientRect();
      if(cr.left >= kr.left + 4 && cr.right <= kr.right - 4) return; // already fully visible
      const delta = (cr.left + cr.width/2) - (kr.left + kr.width/2);
      cont.scrollTo({ left: cont.scrollLeft + delta, behavior:"smooth" });
    }, 60);
    return ()=> clearTimeout(timer);
  },[selId, view]);
  const [agentUndo, setAgentUndo] = React.useState([]);   // stack of pre-run snapshots
  const draftingRef = React.useRef(false);
  const uidRef = React.useRef(1000);
  const newId = ()=>"s"+(++uidRef.current);
  const renum = (arr)=>arr.map((s,i)=>({...s,no:i+1}));
  // human label describing a draft's provenance
  const labelOf = (v)=> !v ? null : v.polished ? "MUSE polish" : (v.ai ? "MUSE draft" : (v.auto ? "Structural draft" : "Original draft"));
  // replace a scene's draft, pushing the old version onto its history stack
  const commitVersion = (id, next)=>{
    const prev = drafts[id];
    if(prev) setHistory(h=>{ const e=h[id]||{back:[],fwd:[]};
      return {...h,[id]:{ back:[...e.back, prev], fwd:[] }}; });
    setDrafts(d=>({...d,[id]:next}));
  };
  const revertVersion = (id)=>{
    const e = history[id]; if(!e||!e.back.length) return;
    const prev = e.back[e.back.length-1];
    const cur = drafts[id];
    setHistory(h=>({...h,[id]:{ back:e.back.slice(0,-1), fwd:[cur,...e.fwd] }}));
    setDrafts(d=>({...d,[id]:prev}));
  };
  const redoVersion = (id)=>{
    const e = history[id]; if(!e||!e.fwd.length) return;
    const nextV = e.fwd[0];
    const cur = drafts[id];
    setHistory(h=>({...h,[id]:{ back:[...e.back,cur], fwd:e.fwd.slice(1) }}));
    setDrafts(d=>({...d,[id]:nextV}));
  };

  const draftOne = async (s)=>{
    if(drafts[s.id]) return;
    const i = scenes.findIndex(x=>x.id===s.id);
    setDrafting({ i:i<0?0:i, total:scenes.length, one:true });
    let scn = s, beats = beatsMap[s.id];
    // a beats-less scene: author the whole scene (summary, charge, beats) first
    if(!beats && typeof aiAuthorScene==="function" && aiAvailable()){
      const authored = await aiAuthorScene(s, i>0?scenes[i-1]:null, characters);
      if(authored){
        scn = {...s, ...authored.patch}; beats = authored.beats;
        setScenes(ss=>ss.map(x=>x.id===s.id?{...x,...authored.patch}:x));
        setBeatsFor(s.id, authored.beats);
      }
    }
    const res = await aiDraftScene(scn, beats, i>0?scenes[i-1]:null);
    setDrafts(d=>({...d,[s.id]:res}));
    setDrafting(null);
  };
  const draftAll = async ()=>{
    if(draftingRef.current) return;
    draftingRef.current = true;
    const tot = scenes.length;
    const have = {...drafts};
    for(let i=0;i<tot;i++){
      const s = scenes[i];
      setDrafting({ i, total:tot });
      if(have[s.id]) continue;
      let scn = s, beats = beatsMap[s.id];
      if(!beats && typeof aiAuthorScene==="function" && aiAvailable()){
        const authored = await aiAuthorScene(s, i>0?scenes[i-1]:null, characters);
        if(authored){
          scn = {...s, ...authored.patch}; beats = authored.beats;
          setScenes(ss=>ss.map(x=>x.id===s.id?{...x,...authored.patch}:x));
          setBeatsFor(s.id, authored.beats);
        }
      }
      const res = await aiDraftScene(scn, beats, i>0?scenes[i-1]:null);
      have[s.id] = res;
      setDrafts(d=>({...d,[s.id]:res}));
    }
    setDrafting({ i:tot, total:tot });
    setTimeout(()=>setDrafting(null), 320);
    draftingRef.current = false;
  };
  // polish: regenerate one scene's prose as genuinely new final text (beats locked)
  const polishScene = async (s, beatsForScene)=>{
    const i = scenes.findIndex(x=>x.id===s.id);
    const structural = autoDraftScene(s, beatsForScene, i>0?scenes[i-1]:null);
    const res = await aiPolishScene(s, beatsForScene, structural.blocks, i>0?scenes[i-1]:null);
    if(res){ commitVersion(s.id, res); return true; }
    return false; // fall back to seed prose animation
  };

  const sel = scenes.find(s=>s.id===selId) || null;
  const beats = sel ? beatsMap[sel.id] : null;

  // story-health issues that drive the Writers' Room badge + per-agent counts
  const turnIssues = scenes.filter(s=>turnInfo(s).flagged).length;
  const contIssues = (typeof window.continuityReport==="function")
    ? window.continuityReport(scenes, continuityMap, FACTS).conflicts.length : 0;
  const agentIssues = { doctor: turnIssues, continuity: contIssues };
  const totalIssues = turnIssues + contIssues;

  // ---- editing handlers (scenes + beats) ----
  const updateScene = (id,patch)=>setScenes(ss=>ss.map(s=>s.id===id?{...s,...patch}:s));
  const onCharge = (field,val)=>updateScene(selId,{[field]:val});
  const addScene = (afterId)=>{
    const id = newId();
    setScenes(ss=>{
      const i = afterId!=null ? ss.findIndex(s=>s.id===afterId) : ss.length-1;
      const ref = ss[i] || { act:1, seq:"New" };
      // default the driver to the current story's protagonist (or first cast member),
      // never a hardcoded sample-story character
      const protag = characters.find(c=>/protagon|lead|hero/i.test(c.role||"")) || characters[0];
      const defDriver = (ref && ref.driver) || (protag && protag.id) || "lead";
      const ns = { id, act:ref.act||1, seq:ref.seq||"New", no:0, title:"New Scene",
        loc:"INT. NEW LOCATION \u00b7 DAY", summary:"A new scene \u2014 describe what happens here.",
        openValue:"Value", openCharge:0, closeValue:"Value", closeCharge:1,
        conf:1, kind:"normal", driver:defDriver, objective:"", turningPoint:"" };
      const out = ss.slice(); out.splice((i<0?ss.length-1:i)+1, 0, ns); return renum(out);
    });
    setSelId(id);
  };
  const deleteScene = (id)=>{
    const i = scenes.findIndex(s=>s.id===id);
    const remaining = scenes.filter(s=>s.id!==id);
    if(!remaining.length) return;
    const nxt = remaining[Math.min(i, remaining.length-1)];
    setScenes(renum(remaining));
    setBeatsMap(m=>{ const n={...m}; delete n[id]; return n; });
    setDrafts(d=>{ const n={...d}; delete n[id]; return n; });
    setSelId(nxt ? nxt.id : null);
  };
  const reorderScenes = (fromIdx,toIdx)=>setScenes(ss=>{
    if(toIdx<0||toIdx>=ss.length||fromIdx===toIdx||fromIdx<0) return ss;
    const out=ss.slice(); const [m]=out.splice(fromIdx,1); out.splice(toIdx,0,m); return renum(out);
  });
  const moveScene = (id,dir)=>{ const i=scenes.findIndex(s=>s.id===id); reorderScenes(i,i+dir); };
  const setBeatsFor = (sceneId,next)=>setBeatsMap(m=>({...m,[sceneId]:next}));

  const onFixScene = (scene)=>{
    const target = scene.openCharge >= 0 ? Math.max(-3, scene.openCharge-2) : Math.min(3, scene.openCharge+2);
    updateScene(scene.id,{closeCharge:target}); setSelId(scene.id);
  };

  // ---- AGENTS: build a fresh working model + a sync() that pushes it to app state ----
  React.useEffect(()=>{ window.__turnJump = (no)=>{ const s = scenes.find(x=>x.no===no); if(s){ setSelId(s.id); setView("script"); setAgentsOpen(false); } }; },[scenes]);
  const agentCtxFactory = ({ input, emit, propose, cancelled, agentName })=>{
    // deep snapshot of the pre-run story state, committed to the undo stack
    // only when the agent actually applies its first change.
    const snapshot = ()=>({
      label: agentName || "Agent", ts: Date.now(),
      scenes: scenes.map(s=>({...s})),
      characters: characters.map(c=>({...c})),
      project: {...project},
      beats: {...beatsMap},
      drafts: {...drafts},
      continuity: Object.fromEntries(Object.entries(continuityMap).map(([k,v])=>[k,{
        establishes:[...(v.establishes||[])], references:[...(v.references||[])] }])),
    });
    let committed = false;
    const model = {
      scenes: scenes.map(s=>({...s})),
      characters: characters.map(c=>({...c})),
      project: {...project},
      beats: Object.fromEntries(Object.entries(beatsMap).map(([k,v])=>[k, v])),
      drafts: {...drafts},
      continuity: Object.fromEntries(Object.entries(continuityMap).map(([k,v])=>[k,{
        establishes:[...(v.establishes||[])], references:[...(v.references||[])] }])),
    };
    const sync = ()=>{
      if(!committed){ committed = true; const snap = snapshot(); setAgentUndo(st=>[...st, snap].slice(-8)); }
      setScenes(model.scenes.map(s=>({...s})));
      if(model.characters) setCharacters(model.characters.map(c=>({...c})));
      if(model.project){
        /* a new story identity (e.g. Adaptation) makes the old props irrelevant —
           clear them so sample-story props never bleed into a freshly built film */
        if(model.project.title && project && model.project.title !== project.title){ setProps([]); setPropsSeeded(false); setVisualsSeeded(false); }
        setProject({...model.project});
      }
      setBeatsMap({...model.beats});
      setDrafts({...model.drafts});
      setContinuityMap(Object.fromEntries(Object.entries(model.continuity).map(([k,v])=>[k,{...v}])));
    };
    return { model, sync, input, emit, propose, cancelled,
      project, facts:FACTS,
      ai:{ available: (typeof aiAvailable==="function" && aiAvailable()),
        suggestTurn:(s,p)=>window.aiSuggestTurn(s,p),
        plantLine:(s,f,m)=>window.aiPlantLine(s,f,m),
        tableRead:(sc,dr)=>window.aiTableRead(sc,dr),
        buildSpine:(b)=>window.aiBuildSpine(b),
        buildStoryWorld:(b,sp)=>window.aiBuildStoryWorld(b,sp),
        authorScene:(s,p)=>window.aiAuthorScene(s,p,model.characters),
        draftScene:(s,b,p)=>window.aiDraftScene(s,b,p),
      } };
  };

  // restore the most recent pre-run snapshot
  const undoLastAgent = ()=>{
    setAgentUndo(st=>{
      if(!st.length) return st;
      const snap = st[st.length-1];
      setScenes(snap.scenes.map(s=>({...s})));
      if(snap.characters) setCharacters(snap.characters.map(c=>({...c})));
      if(snap.project) setProject({...snap.project});
      setBeatsMap({...snap.beats});
      setDrafts({...snap.drafts});
      setContinuityMap(Object.fromEntries(Object.entries(snap.continuity).map(([k,v])=>[k,{...v}])));
      const ids = new Set(snap.scenes.map(s=>s.id));
      if(!ids.has(selId)) setSelId(snap.scenes[0] ? snap.scenes[0].id : null);
      return st.slice(0,-1);
    });
  };

  // apply grade vars (re-shaded for light mode)
  React.useEffect(()=>{
    const g = GRADES[t.grade] || GRADES["Teal & Orange"];
    const light = effectiveTheme === "light";
    const pos = light ? shadeOklch(g.pos, -0.16, 0.012) : g.pos;
    const neg = light ? shadeOklch(g.neg, -0.18, 0.012) : g.neg;
    const r = document.documentElement.style;
    r.setProperty("--pos", pos);
    r.setProperty("--neg", neg);
    r.setProperty("--pos-soft", pos.replace(")", light?" / .14)":" / .16)"));
    r.setProperty("--neg-soft", neg.replace(")", light?" / .14)":" / .16)"));
    r.setProperty("--pos-line", pos.replace(")", light?" / .42)":" / .5)"));
    r.setProperty("--neg-line", neg.replace(")", light?" / .42)":" / .5)"));
    r.setProperty("--brand", pos);
    r.setProperty("--f-display", t.display==="Serif" ? '"Spectral",serif' : '"Space Grotesk",sans-serif');
  },[t.grade,t.display,effectiveTheme]);

  const densClass = t.density==="compact"?"dens-compact":t.density==="comfy"?"dens-comfy":"";
  const premiumClass = t.premium ? "premium" : "";

  /* shared clean-canvas onboarding — used by the empty Writers' Room spine AND the
     hard-gated Art Room (the Art Room is downstream of the story — cast, props and
     locations are derived from it — so it stays blocked until a story exists). */
  const emptyCanvas = ()=> React.createElement("div",{className:"empty-canvas"},
    React.createElement("div",{className:"empty-canvas-card"},
      React.createElement("div",{className:"empty-canvas-title"},"Start your film"),
      React.createElement("div",{className:"empty-canvas-sub"},"Your canvas is clean. Describe an idea and TURN builds the value-charge spine, scene by scene — then characters, props, script and shots all follow from it."),
      React.createElement("button",{className:"empty-canvas-btn",onClick:()=>setNewStoryOpen(true)},"+ New Story")));
  // ── Signed-out gate: show the commercial landing page instead of the app. The
  //    departments (spine, Writers' Room, Art Room, Agents) are never exposed until
  //    sign-in. Only when cloud auth is configured; local-only mode runs the app as before.
  const authGate = (typeof cloudConfigured==="function" && cloudConfigured());
  // While the initial session check is in flight, show a minimal splash — never flash the
  // landing at a user who turns out to be signed in.
  if(authGate && !authReady){
    return React.createElement("div",{className:"lp-splash"},
      React.createElement("span",{className:"lp-logo"},"TURN"),
      React.createElement("span",{className:"lp-splash-dot"}));
  }
  if(authGate && !session && typeof Landing!=="undefined"){
    return React.createElement(React.Fragment,null,
      window.ConfirmHost && React.createElement(window.ConfirmHost,null),
      React.createElement(Landing,{ onStart:startWithPlan, onSignIn:()=>openAuth("signin") }),
      authOpen && React.createElement(AuthModal,{ initialMode:authMode, plan:intendedPlan,
        onClose:()=>setAuthOpen(false), onAuthed:(s)=>{ if(s) setSession(s); } }),
      (typeof MuseDock!=="undefined") && React.createElement(MuseDock,{
        scenes:[], selScene:null, signedIn:false, aiOn:false, onSignIn:()=>openAuth("signup") }));
  }

  return React.createElement("div",{className:`app vp-${vp} ${densClass} ${premiumClass}`},
    window.ConfirmHost && React.createElement(window.ConfirmHost,null),
    t.grain && React.createElement("div",{style:{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,
      opacity:.025,mixBlendMode:"overlay",
      backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"}}),

    React.createElement(TopBar,{view,setView,room,setRoom,artView,setArtView,project,scenes,drafts,onReset:resetStory,
      onToggleAI:toggleAI,
      onAgents:()=>setAgentsOpen(true),
      onNewStory:()=>setNewStoryOpen(true),
      theme,onTheme:setTheme,
      authSlot: React.createElement(AccountChip,{ session, cloudActive: cloudMode,
        onSignIn:()=>setAuthOpen(true), onSignOut:signOut }),
      projectSlot: cloudMode ? React.createElement(ProjectSwitcher,{ projects, currentId:currentProjectId,
        onSwitch:switchProject, onCreate:createProject, onRename:renameProject, onDelete:deleteProject }) : null,
      railOpen,inspOpen,
      onToggleRail:toggleRail,
      onToggleInsp:toggleInsp}),

    authOpen && React.createElement(AuthModal,{ initialMode:authMode, plan:intendedPlan,
      onClose:()=>setAuthOpen(false),
      onAuthed:(s)=>{ if(s) setSession(s); }}),

    React.createElement("div",{className:"body"},
      room==="art"
        ? (scenes.length===0
          // hard gate: the Art Room is downstream of the story, so with no scenes
          // show the onboarding instead of empty (and partly broken) tabs.
          ? React.createElement("div",{className:"canvas"}, emptyCanvas())
          : React.createElement(ArtRoom,{key:(cloudMode?currentProjectId:"local"),artView,setArtView,project,characters,scenes,props,
            onUpdateChar:updateCharacter,onDraftVisuals:draftCharacterVisuals,onDraftAllVisuals:draftAllVisuals,
            draftingVisualId,draftingAllVisuals,draftingVisualIds,onAddCharacter:addCharacter,onDeleteCharacter:deleteCharacter,
            onSuggestStates:suggestCharacterStates,suggestingStatesId,onRemoveOwnedItem:removeOwnedProp,
            onUpdateProp:updateProp,onDraftProp:draftPropVisuals,onDraftAllProps:draftAllProps,
            onAddProp:addProp,onDeleteProp:deleteProp,draftingPropId,draftingAllProps,onMergeProps:mergeProps,
            onSeedFromCast:seedPropsFromCast,castHasProps:(typeof castHasProps==="function" && castHasProps(characters)),
            scenes,onTagScenes:tagPropScenes,taggingScenes,onTagOne:tagOnePropScenes,taggingSceneId,
            locations,onUpdateLocation:updateLocation,onDraftLocation:draftLocationVisuals,onDraftAllLocs:draftAllLocations,
            onAddLocation:addLocation,onDeleteLocation:deleteLocation,draftingLocId,draftingAllLocs,
            onPullFromScript:pullLocationsFromScript,scriptHasLocs:(typeof scriptHasLocations==="function" && scriptHasLocations(scenes)),
            onAssignStyles:assignSceneStyles,assigningStyles,
            onDraftStaging:draftLocationStaging,draftingStageId,
            shots,beatsMap,onUpdateShot:updateShot,onAddShot:addShot,onDeleteShot:deleteShot,
            onDraftSceneShots:draftSceneShots,draftingSceneShots,onDraftAllShots:draftAllShots,draftingAllShots}))
        : React.createElement(React.Fragment,null,
      // scrim behind any open overlay drawer
      ((railDrawer&&railOpen)||(inspDrawer&&inspOpen)) && React.createElement("div",{className:"scrim",
        onClick:()=>{ setRailOpen(false); setInspOpen(false); }}),

      scenes.length>0 && (railDrawer
        ? (railOpen && React.createElement(LeftRail,{project,characters,scenes,selId,selChar,
            onSelect:(id)=>{ selectScene(id); setRailOpen(false); },
            onSelectChar:(id)=>{ setSelChar(id); setInspOpen(true); setRailOpen(false); },
            showFramework:t.framework,onCollapse:()=>setRailOpen(false),
            onAddScene:addScene,onReorder:reorderScenes,compact:!wide}))
        : (railOpen
          ? React.createElement(LeftRail,{project,characters,scenes,selId,selChar,
              onSelect:selectScene,
              onSelectChar:(id)=>{ setSelChar(id); setInspOpen(true); },
              showFramework:t.framework,onCollapse:()=>setRailOpen(false),
              onAddScene:addScene,onReorder:reorderScenes,compact:!wide})
          : React.createElement(CollapsedStrip,{side:"left",label:"Story",icon:Icon.panelLeft,
              onExpand:()=>setRailOpen(true),flagCount:scenes.filter(s=>turnInfo(s).flagged).length}))),

      React.createElement("div",{className:"canvas"},
        React.createElement("div",{className:"canvas-head"},
          React.createElement("div",null,
            React.createElement("div",{className:"canvas-title"},
              view==="spine"?"Value-Charge Spine":view==="beats"?"Turn Audit":view==="script"?"Screenplay Draft":"Story Board"),
            React.createElement("div",{className:"canvas-sub"},
              view==="spine"?"The emotional charge of every scene, end to end":
              view==="beats"?"If a scene doesn't turn, cut it":
              view==="script"?"Subtext (beats) becomes text (screenplay)":"16 scenes across 3 acts")),
          view==="spine" && React.createElement("div",{className:"legend"},
            React.createElement("div",{className:"legend-item"},
              React.createElement("span",{className:"legend-swatch",style:{background:"var(--pos)"}}),"Positive"),
            React.createElement("div",{className:"legend-item"},
              React.createElement("span",{className:"legend-swatch",style:{background:"var(--neg)"}}),"Negative"),
            React.createElement("div",{className:"legend-item"},
              React.createElement("span",{className:"legend-swatch",style:{background:"var(--alert)"}}),"No turn"))),

        view==="spine" && scenes.length>0 && React.createElement(DragScroll,{className:"canvas-scroll spine-pan"},
          React.createElement(SpineCanvas,{scenes,selId,onSelect:selectScene,showFramework:t.framework,
            onReorder:reorderScenes,onAddScene:addScene})),
        view==="spine" && scenes.length>0 && React.createElement("div",{className:"scroll-fade"}),
        // clean-canvas onboarding: a new/empty project has no scenes yet (shown for
        // ANY view so the data-assuming spine/audit/board/script never render empty).
        scenes.length===0 && emptyCanvas(),
        view==="beats" && scenes.length>0 && React.createElement(TurnAudit,{scenes,selId,onSelect:selectScene}),
        view==="board" && scenes.length>0 && React.createElement(Board,{scenes,selId,onSelect:selectScene}),
        view==="script" && scenes.length>0 && React.createElement(ScriptView,{scene:sel,beats,
          drafts, scenes, onSelectScene:selectScene, onPolish:polishScene,
          onDraftOne:draftOne, onDraftAll:draftAll, drafting, total:scenes.length,
          history: sel ? (history[sel.id]||{back:[],fwd:[]}) : {back:[],fwd:[]},
          labelOf, onRevert:revertVersion, onRedo:redoVersion, continuityMap}),

        // Floating Writers' Room (Agents) launcher — the agents refine an existing
        // story, so it only appears once a story exists (scenes > 0).
        ),

      scenes.length>0 && (()=>{
        const charObj = selChar ? characters.find(c=>c.id===selChar) : null;
        const inspectorEl = charObj
          ? React.createElement(CharacterPanel,{character:charObj, scenes,
              onUpdate:updateCharacter, onDraft:draftCharacter, drafting:charDrafting===charObj.id,
              onJumpScene:(id)=>selectScene(id), onClose:()=>setSelChar(null),
              onCollapse:()=>setInspOpen(false)})
          : React.createElement(Inspector,{scene:sel,beats,onCharge,onUpdate:updateScene,characters,scenes,
              onAddScene:addScene,onDeleteScene:deleteScene,onMove:moveScene,onBeats:setBeatsFor,
              sceneIndex:scenes.findIndex(s=>s.id===selId),sceneCount:scenes.length,
              onCollapse:()=>setInspOpen(false)});
        return inspDrawer
          ? (inspOpen && inspectorEl)
          : (inspOpen
            ? inspectorEl
            : React.createElement(CollapsedStrip,{side:"right",label:"Inspector",icon:Icon.panelRight,
                onExpand:()=>setInspOpen(true)}));
      })())),

    // compact primary nav — bottom tab bar for tablet + mobile (frees the top bar)
    vp!=="desktop" && React.createElement(BottomNav,{room,view,setView,artView,setArtView}),

    // Agents — Writers' Room modal
    agentsOpen && React.createElement(AgentsPanel,{
      onClose:()=>{ setAgentsOpen(false); setAgentLaunch(null); },
      onView:(v)=>{ setRoom("writers"); setView(v||"spine"); setAgentsOpen(false); setAgentLaunch(null); },
      ctxFactory:agentCtxFactory,
      initialAgentId: agentLaunch && agentLaunch.id,
      initialInput: agentLaunch && agentLaunch.input,
      autoStart: !!agentLaunch,
      undoCount:agentUndo.length,
      undoLabel:agentUndo.length?agentUndo[agentUndo.length-1].label:null,
      onUndo:undoLastAgent,
      issues:agentIssues,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // New Story intake — many seed types in, one logline out, then launch Adaptation
    newStoryOpen && React.createElement(NewStoryIntake,{
      onClose:()=>setNewStoryOpen(false),
      aiOn: (typeof aiAvailable==="function" && aiAvailable()),
      onLaunch:(logline, synopsis)=>{ setNewStoryOpen(false);
        const brief = (typeof composeStoryBrief==="function") ? composeStoryBrief(logline, synopsis) : logline;
        setAgentLaunch({id:"adapt", input:brief}); setAgentsOpen(true); }}),

    // MUSE — the floating help assistant, available in every room (separate from Agents).
    // Signed-in: full Claude-powered chat over your story. Signed-out: a curated teaser
    // (a few hand-written tastes + a sign-up nudge), so visitors get a feel without the
    // full studio. signedIn flips the mode; onSignIn opens the auth modal.
    (typeof MuseDock!=="undefined") && React.createElement(MuseDock,{
      scenes, selScene:sel, signedIn: !!session, onSignIn:()=>setAuthOpen(true),
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // Undo affordance — persists whether the Writers' Room is open or closed.
    // Suppressed for Adaptation (full build-from-scratch): the toast is easy to miss
    // beneath the result modal, and the in-room "Undo last" still covers it.
    agentUndo.length>0 && agentUndo[agentUndo.length-1].label!=="Adaptation" && React.createElement("div",{className:"agent-undo"},
      React.createElement("span",{className:"au-ic"},React.createElement(Icon.undo,{s:15})),
      React.createElement("div",{className:"au-text"},
        React.createElement("div",{className:"au-t"},agentUndo[agentUndo.length-1].label+" changed your story"),
        React.createElement("div",{className:"au-s"},
          agentUndo.length>1 ? (agentUndo.length+" agent runs can be undone") : "One click to revert it")),
      React.createElement("button",{className:"au-btn",onClick:undoLastAgent},
        React.createElement(Icon.undo,{s:13}),"Undo"),
      React.createElement("button",{className:"au-x",title:"Keep changes",onClick:()=>setAgentUndo([])},
        React.createElement(Icon.x,{s:14}))),

    // Tweaks panel
    React.createElement(TweaksPanel,null,
      React.createElement(TweakSection,{label:"Cinematic grade"}),
      React.createElement(TweakToggle,{label:"Premium polish",value:t.premium,onChange:v=>setTweak("premium",v)}),
      React.createElement(TweakColor,{label:"Charge palette",value:GRADES[t.grade].pos,
        options:Object.values(GRADES).map(g=>g.pos),
        onChange:(v)=>{const k=Object.keys(GRADES).find(k=>GRADES[k].pos===v);setTweak("grade",k);}}),
      React.createElement(TweakRadio,{label:"Grade",value:t.grade,
        options:Object.keys(GRADES),onChange:v=>setTweak("grade",v)}),
      React.createElement(TweakToggle,{label:"Film grain",value:t.grain,onChange:v=>setTweak("grain",v)}),
      React.createElement(TweakSection,{label:"Workspace"}),
      React.createElement(TweakToggle,{label:"Show story framework",value:t.framework,onChange:v=>setTweak("framework",v)}),
      React.createElement(TweakRadio,{label:"Density",value:t.density,
        options:["compact","regular","comfy"],onChange:v=>setTweak("density",v)}),
      React.createElement(TweakRadio,{label:"Display type",value:t.display,
        options:["Grotesk","Serif"],onChange:v=>setTweak("display",v)}),
    ),
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(App));

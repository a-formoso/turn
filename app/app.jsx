/* app.jsx — compose Cinema Machine: state, views, tweaks */

const { PROJECT, CHARACTERS, SCENES, BEATS, SCREENPLAY, CONTINUITY, FACTS } = window.TURN_DATA;

/* Is this ledger's plan a REAL, paid subscription? Cinema Machine has NO free tier,
   so "", "none" (cancelled) AND "free" (the generic Get-started signup default) are
   all NOT active plans — only Writer/Director/Studio count. Every plan-gate check
   funnels through here so the app can't disagree with itself about what "on a plan"
   means (a new account's ledger comes back plan:"free", which must still be gated). */
window.turnIsPaidPlan = function(plan){
  const p = String(plan||"").toLowerCase().trim();
  return !!p && p!=="none" && p!=="free";
};

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
                `Act ${["I","II","III","IV"][s.act-1]||s.act} · ${s.seq}`,KIND_LABEL[s.kind]?(" · "+KIND_LABEL[s.kind]):"")),
            React.createElement("div",{style:{padding:"12px 14px",borderLeft:"1px solid var(--line)",display:"flex",alignItems:"center",gap:6}},
              React.createElement(ChargeChip,{value:s.openCharge}),
              React.createElement("span",{style:{color:"var(--txt-3)",display:"flex"}},React.createElement(Icon.arrowSmall,{s:11})),
              React.createElement(ChargeChip,{value:s.closeCharge})),
            React.createElement("div",{style:{padding:"12px 14px",borderLeft:"1px solid var(--line)",fontSize:11.5,color:"var(--txt-1)"}},
              `${s.openValue} \u2192 ${s.closeValue}`),
            React.createElement("div",{style:{padding:"12px 14px",borderLeft:"1px solid var(--line)"}},
              flagged
                ? React.createElement("span",{className:"turn-badge no"},React.createElement(Icon.alert,{s:10}),
                    (typeof fwAuditOf==="function" && fwAuditOf().flagBadge)||"No turn")
                : React.createElement("span",{className:"turn-badge ok"},React.createElement(Icon.check,{s:10}),
                    (typeof fwAuditOf==="function" && fwAuditOf().okBadge)||"Turns")));
        }))));
}

/* ---- alternate view: Board (acts as columns) ---- */
function Board({ scenes, selId, onSelect }){
  // act columns come from the FRAMEWORK (three-act → 3 columns, Kishōtenketsu → 4)
  const fwB = (typeof frameworkOf==="function") ? frameworkOf(window.turnProject) : null;
  const actNos = fwB ? Object.keys(fwB.acts).map(Number) : [1,2,3];
  const acts=actNos.map(a=>({act:a,scenes:scenes.filter(s=>s.act===a)}));
  const ROMAN=["I","II","III","IV"];
  const titles={}; actNos.forEach(a=>{ titles[a]="Act "+(ROMAN[a-1]||a)+" · "+((fwB&&fwB.acts[a])||["Setup","Complication","Resolution"][a-1]||("Act "+a)); });
  // per-act fold state (persisted) — collapse an act column to a narrow strip to
  // focus on the act you're working in.
  const [collapsed,setCollapsed]=React.useState(()=>{ try{ return JSON.parse(localStorage.getItem("turn_board_collapsed")||"{}")||{}; }catch(e){ return {}; } });
  React.useEffect(()=>{ try{ localStorage.setItem("turn_board_collapsed",JSON.stringify(collapsed)); }catch(e){} },[collapsed]);
  const toggle=(act)=> setCollapsed(c=>({...c,[act]:!c[act]}));
  return React.createElement(DragScroll,{className:"canvas-scroll board-pan",style:{padding:"18px 22px 40px"}},
    React.createElement("div",{style:{display:"flex",gap:14,minWidth:"max-content"}},
      acts.map(a=>{
        const roman=["I","II","III","IV"][a.act-1]||String(a.act);
        // collapsed → a slim, clickable vertical strip
        if(collapsed[a.act]) return React.createElement("div",{key:a.act,className:"board-act-strip",
          onClick:()=>toggle(a.act),title:`Expand ${titles[a.act]}`,
          style:{width:46,flex:"0 0 46px",alignSelf:"flex-start",cursor:"pointer",
            display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"10px 0",
            border:"1px solid var(--line)",borderRadius:"var(--r-m)",background:"var(--bg-1)"}},
          React.createElement(Icon.chevR,{s:14}),
          React.createElement("span",{className:"tree-act-no"},roman),
          React.createElement("span",{style:{writingMode:"vertical-rl",fontFamily:"var(--f-display)",fontSize:12,
            fontWeight:500,color:"var(--txt-2)",letterSpacing:".02em"}},titles[a.act].split("· ")[1]),
          React.createElement("span",{style:{fontFamily:"var(--f-mono)",fontSize:10,color:"var(--txt-3)"}},a.scenes.length));
        return React.createElement("div",{key:a.act,style:{width:300,flex:"0 0 300px"}},
          React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10,padding:"0 2px"}},
            React.createElement("button",{className:"board-act-fold",onClick:()=>toggle(a.act),
              title:`Collapse ${titles[a.act]}`,
              style:{display:"flex",border:0,background:"transparent",cursor:"pointer",color:"var(--txt-2)",padding:2}},
              React.createElement(Icon.chevD,{s:13})),
            React.createElement("span",{className:"tree-act-no"},roman),
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
            })));})));
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

/* ============================================================================
   THE FILM BIBLE — one canonical JSON the whole studio reads from.

   This is a DETERMINISTIC PROJECTION of the live story state, never a second
   AI-authored copy: a generated parallel doc would itself drift and contradict
   the data it's meant to guard. Instead it RESOLVES the continuity graph from
   the single source of truth (the project doc) — props (worn/carried) tied to
   their owning characters, characters tied to the scenes they appear in, set
   dressing tied to its location — so every department reads the same relations
   and the AI can't go off-brand or contradict itself across tabs. Exposed on
   window for the Admin JSON viewer and any external/Stage consumer. ---------- */
function buildFilmBible(doc){
  doc = doc || {};
  const project = doc.project || {};
  const scenes = doc.scenes || [];
  const characters = doc.characters || [];
  const props = doc.props || [];
  const locations = doc.locations || [];
  const drafts = doc.drafts || {};
  const lookbook = doc.lookbook || [];
  const ordered = scenes.slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const noOf = {}; ordered.forEach(s=>{ noOf[s.id]=s.no; });
  const charById = {}; characters.forEach(c=>{ charById[c.id]=c; });
  const undef = (x)=>{ const v=(x==null?"":String(x)).trim(); return v||undefined; };
  const appears = (typeof scenesWhereCharacterAppears==="function") ? scenesWhereCharacterAppears : (()=>[]);
  const locForScene = (sid)=> (typeof locationForScene==="function") ? locationForScene(locations, sid) : null;
  const sb = (typeof styleBibleOf==="function") ? styleBibleOf(project) : {};

  // ---- resolve the edges once ----
  const scenesOfChar = {};                 // charId -> [sceneNo], by story order
  characters.forEach(c=>{ scenesOfChar[c.id] = appears(c.id, c.name, ordered, drafts).map(id=>noOf[id]).filter(n=>n!=null); });
  const shotsOfScene = {}; (doc.shots||[]).forEach(sh=>{ (shotsOfScene[sh.sceneId]=shotsOfScene[sh.sceneId]||[]).push(sh); });
  // ONE authoritative roster — sceneRoster (honours a hand-authored scene.cast, else the
  // union of driver + script presence + every shot's in-frame cast). The same function the
  // rest of the pipeline reads, so the bible can't disagree with what the shots reference.
  const charsInScene = (s)=> (typeof sceneRoster==="function")
    ? sceneRoster(s, characters, drafts, shotsOfScene[s.id]||[])
    : (s.driver && charById[s.driver] ? [s.driver] : []);
  const sceneNosOfProp = (p)=> (Array.isArray(p.scenes)?p.scenes:[]).map(id=>noOf[id]).filter(n=>n!=null);
  const envPropsOfLoc = (l)=> props.filter(p=> !p.ownerId && !p.ownerName && (p.kind||"carried")!=="worn"
    && (p.locationId ? p.locationId===l.id
        : (Array.isArray(p.scenes) && p.scenes.length
            && Array.from(new Set(p.scenes.map(sid=>{const m=locForScene(sid);return m?m.id:"";}).filter(Boolean))).join()===l.id)))
    .map(p=>p.name);

  return {
    film: {
      title: undef(project.title), genre: undef(project.genre), logline: undef(project.logline||project.premise),
      controlling_idea: (project.controllingIdea && Object.keys(project.controllingIdea).length) ? project.controllingIdea : undefined,
      setting: project.setting || undefined,
      format: undef(project.formatId), framework: undef(project.frameworkId),
    },
    look: {
      visual_statement: undef(doc.lookbookNote),
      film_stock: undef(sb.filmStock && sb.filmStock!=="none" ? sb.filmStock : ""),
      references: undef((sb.refs||"")),
      palette_presets: (sb.presets||[]).map(p=>({ id:p.id, name:p.name, palette:p.palette })),
      lookbook: lookbook.filter(c=>(c.note||"").trim()).map(c=>({ source:c.source, category:c.category, note:c.note })),
    },
    characters: characters.map(c=>({
      id: c.id, name: c.name, role: undef(c.role),
      wants: undef(c.conscious), fear: undef(c.unconscious), arc: undef(c.arc),
      physique: (c.physique && Object.keys(c.physique).length) ? c.physique : undefined,
      wardrobe: undef(c.wardrobeMask||c.wardrobe),
      worn: undef(c.accessories), carried: undef(c.props),
      appears_in_scenes: scenesOfChar[c.id],
      appearance_states: (c.states||[]).map(s=>s.label).filter(Boolean),
      sheet_id: c.id,
    })),
    props: props.map(p=>{
      const o = { id:p.id, name:p.name, type:(p.kind||"carried") };
      if(p.ownerName||p.ownerId){ o[(p.kind==="worn")?"worn_by":"carried_by"] = p.ownerName || (charById[p.ownerId]||{}).name || p.ownerId; }
      else { const L = p.locationId ? locations.find(x=>x.id===p.locationId) : null; if(L) o.fixture_of_location = L.name; }
      o.form = undef(p.form); o.material = undef(p.material);
      // a worn prop with no stored map is present wherever its owner is — resolve it here
      // so the bible is complete even for props seeded before worn-mapping existed.
      let sc = sceneNosOfProp(p);
      if(!sc.length && (p.kind||"carried")==="worn" && (p.ownerId||p.ownerName)){
        const oc = charById[p.ownerId]; sc = appears(p.ownerId, (oc&&oc.name)||p.ownerName, ordered, drafts).map(id=>noOf[id]).filter(n=>n!=null);
      }
      o.scenes = sc; o.sheet_id = p.id;
      return o;
    }),
    locations: locations.map(l=>({
      id: l.id, name: l.name, int_ext: l.intExt||"INT",
      times: l.times || undefined,
      scenes: ordered.filter(s=>{ const m=locForScene(s.id); return m&&m.id===l.id; }).map(s=>s.no),
      environment_props: (()=>{ const e=envPropsOfLoc(l); return e.length?e:undefined; })(),
      sheet_id: l.id,
    })),
    scenes: ordered.map(s=>{
      const loc = locForScene(s.id);
      const preset = (typeof scenePreset==="function") ? scenePreset(project, s.id) : null;
      return {
        no: s.no, id: s.id, title: undef(s.title), slug: undef(s.loc),
        value_charge: (typeof s.charge==="number") ? s.charge : undefined,
        driver: s.driver ? ((charById[s.driver]||{}).name || s.driver) : undefined,
        characters: charsInScene(s).map(id=>(charById[id]||{}).name||id),
        cast_authored: (Array.isArray(s.cast) && s.cast.length) ? true : undefined,
        props: props.filter(p=>Array.isArray(p.scenes)&&p.scenes.indexOf(s.id)>=0).map(p=>p.name),
        location: loc ? loc.name : undefined,
        preset: preset ? preset.name : undefined,
        summary: undef(s.summary),
      };
    }),
  };
}
window.buildFilmBible = buildFilmBible;

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
  const [lookbook, setLookbook] = React.useState(()=> (saved && saved.lookbook) || []);
  const [lookbookNote, setLookbookNote] = React.useState(()=> (saved && saved.lookbookNote) || "");
  // per-department: the lookbook brief in effect the last time that dept was fully drafted (for staleness)
  const [lookbookApplied, setLookbookApplied] = React.useState(()=> (saved && saved.lookbookApplied) || {});
  const [shots, setShots] = React.useState(()=> (saved && saved.shots) || []);
  const [project, setProject] = React.useState(()=> (saved && saved.project) || ({ title:"Untitled film", genre:"", logline:"", controllingIdea:{} }));
  // project augmented with the Lookbook references routed to one department, so each drafter's
  // prompt honours only its relevant references (see lookbookBriefFor / _lookbookBlock).
  const lbProject = (dept)=> ({ ...project, _lookbookBrief:(typeof lookbookBriefFor==="function" ? lookbookBriefFor(dept, lookbook, lookbookNote) : "") });
  // record that a department now reflects the current Lookbook (clears its "stale" flag)
  const markApplied = (dept)=> setLookbookApplied(m=> ({ ...m, [dept]:(typeof lookbookBriefFor==="function" ? lookbookBriefFor(dept, lookbook, lookbookNote) : "") }));
  const [selId, setSelId] = React.useState(()=> (saved && saved.selId) || null);
  const [selChar, setSelChar] = React.useState(null);
  // "follow this character" lens on the Spine view — session-only (not persisted)
  const [followChar, setFollowChar] = React.useState(null);
  // Restore the room the user last had open (Writers' or Art) from the device-local
  // NAV_KEY — read synchronously so it's correct on first paint. applyDoc never
  // re-applies room, so cloud hydration can't flip it (that flip was the old flash).
  const [room, setRoom] = React.useState(()=> nav.room || "writers");
  const [artView, setArtView] = React.useState(()=>{
    const v = nav.artView || (saved && saved.artView) || "characters";
    return v==="voices" ? "characters" : v;   // Voices is no longer a tab — it lives on the character card
  });
  // once-per-story guard so auto-seeding the Props tab from the cast doesn't
  // re-add props the user has deliberately deleted.
  const [propsSeeded, setPropsSeeded] = React.useState(()=> !!(saved && saved.propsSeeded));
  const [locsSeeded, setLocsSeeded] = React.useState(()=> !!(saved && saved.locsSeeded));
  // once-per-story guard so the cast is auto-drafted the first time the Art Room
  // opens (not re-drafted on every visit), plus the set of character ids currently
  // being drafted so each card can show its own inline "Drafting…" status.
  const [visualsSeeded, setVisualsSeeded] = React.useState(()=> !!(saved && saved.visualsSeeded));
  // RECENTLY DELETED (restore bin): deleting a character/prop/location moves the full
  // object here (with its scenes + spec + generated sheet kept) so it can be restored.
  const _emptyTrash = ()=>({ characters:[], props:[], locations:[] });
  const [trash, setTrash] = React.useState(()=> (saved && saved.trash) || _emptyTrash());
  const [draftingVisualIds, setDraftingVisualIds] = React.useState([]);
  const draftingVisualIdsRef = React.useRef([]); draftingVisualIdsRef.current = draftingVisualIds;
  const [draftingVisualId, setDraftingVisualId] = React.useState(null);
  const [view, setView] = React.useState(()=> nav.view || (saved && saved.view) || "spine");
  const vp = useViewport();
  // both side panels use the SAME mechanics: in-layout (a persistent collapsed strip when
  // closed, pushes the canvas when open) on tablet + desktop; an overlay drawer only on
  // mobile. Previously the rail drawered on tablet too — it overlaid the hero and vanished
  // when closed, unlike the inspector.
  const railDrawer = vp === "mobile";
  const inspDrawer = vp === "mobile";
  const [aiOpen, setAiOpen] = React.useState(()=> typeof window!=="undefined" && window.innerWidth>=1100);
  const [railOpen, setRailOpen] = React.useState(()=> typeof window==="undefined" || window.innerWidth>=1100);
  const [inspOpen, setInspOpen] = React.useState(()=> typeof window==="undefined" || window.innerWidth>=700);
  const [inspTab, setInspTab] = React.useState("scene");   // controlled Inspector tab (Scene / Beats / Analysis)
  const [focusBeat, setFocusBeat] = React.useState(null);  // beat # to reveal in the Beats editor (set from the Script gutter)
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
  const [directorOpen, setDirectorOpen] = React.useState(false);   // Storyboard Director (Art Room)
  const [sceneDirLaunch, setSceneDirLaunch] = React.useState(null); // Scene Director: {sceneId}|{} (whole film)|null
  const [coloristOpen, setColoristOpen] = React.useState(false);   // Cinematographer / Colorist (Art Room)
  const [shotDesignerOpen, setShotDesignerOpen] = React.useState(false);   // Shot Designer (Art Room)
  const [castingOpen, setCastingOpen] = React.useState(false);   // Casting Director (Art Room)
  const [propsMasterOpen, setPropsMasterOpen] = React.useState(false);   // Props Master (Art Room)
  const [locScoutOpen, setLocScoutOpen] = React.useState(false);   // Location Scout (Art Room)
  // when an agent is opened via the Lookbook "Re-draft & regenerate" action, run it in force mode
  const [castingForce, setCastingForce] = React.useState(false);
  const [propsMasterForce, setPropsMasterForce] = React.useState(false);
  const [locScoutForce, setLocScoutForce] = React.useState(false);
  // ---- Lookbook staleness: which Art Room tabs are out of date vs the current Lookbook ----
  // Memoized so it only recomputes when a real input changes — the App re-renders on
  // every keystroke/autosave across the studio, and this needn't recompute each time.
  const staleTabs = React.useMemo(()=>{
    // LOCATIONS gate on cards EXISTING (not fully drafted): location cards are pulled
    // from the script's sluglines long before they're drafted, so requiring a full draft
    // meant the "Lookbook changed" banner couldn't appear until the first Draft & Generate.
    // Counting present cards lets it appear the moment the Lookbook diverges from what was
    // last applied — there's something to apply it to. (Characters/props stay on the
    // drafted gate: the cast AUTO-drafts on Art Room open, and gating on mere existence
    // would pop a false banner right after that silent draft; both are usually drafted
    // via their batch anyway, so the strict gate rarely bites there.)
    const lbContentFlags = {
      characters: (characters||[]).some(c=> (typeof charVisualsDrafted==="function") ? charVisualsDrafted(c) : !!(c&&c.id)),
      props: (props||[]).some(p=> (typeof propVisualsDrafted==="function") ? propVisualsDrafted(p) : false),
      locations: (locations||[]).some(l=> l && l.id),
      colorist: !!(project && project.styleBible && project.styleBible.sceneStyles && Object.keys(project.styleBible.sceneStyles).length),
    };
    const staleDepts = (typeof lookbookStaleDepts==="function") ? lookbookStaleDepts(lookbook, lookbookNote, lookbookApplied, lbContentFlags) : {};
    const t = {};
    if(staleDepts.characters) t.characters = true;
    if(staleDepts.props) t.props = true;
    if(staleDepts.locations) t.locations = true;
    if(staleDepts.colorist) t.stylebible = true;
    return t;
  },[lookbook, lookbookNote, lookbookApplied, characters, props, locations, project]);
  // re-draft one department from the updated Lookbook (confirm first; agent runs in force
  // mode). mode "full" (default) also regenerates the sheets; mode "draft" re-drafts the
  // specs only and leaves every generated image untouched — regenerate later, when ready.
  const applyLookbook = async (dept, mode)=>{
    const draftOnly = mode==="draft";
    const label = { characters:"Characters", props:"Props", locations:"Locations", colorist:"Styles" }[dept] || dept;
    let ok = true;
    if(typeof window.appConfirm==="function"){
      ok = await window.appConfirm(draftOnly
        ? { title:"Re-draft "+label+" specs?",
            body:"This re-drafts every spec in "+label+" from the updated Lookbook — overwriting the current specs, including any manual edits — but leaves all generated images untouched. Regenerate them whenever you're ready.",
            confirmLabel:"Re-draft only", danger:true }
        : { title:"Re-draft & regenerate "+label+"?",
            body:"This re-drafts every spec in "+label+" from the updated Lookbook and regenerates its sheets. It overwrites the current specs, including any manual edits.",
            confirmLabel:"Re-draft & regenerate", danger:true });
    }
    if(!ok) return;
    const f = draftOnly ? "draft" : true;
    if(dept==="characters"){ setCastingForce(f); setCastingOpen(true); }
    else if(dept==="props"){ setPropsMasterForce(f); setPropsMasterOpen(true); }
    else if(dept==="locations"){ setLocScoutForce(f); setLocScoutOpen(true); }
    else if(dept==="colorist"){ setColoristOpen(true); }
  };
  const [researchOpen, setResearchOpen] = React.useState(false);   // Visual Researcher (Lookbook)
  const [coordOpen, setCoordOpen] = React.useState(false);   // Art Department Coordinator (meta-agent)
  const [coordConfirm, setCoordConfirm] = React.useState(false);  // cost/scope preview gate before it runs
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
    // carry the tier the visitor chose on the landing pricing cards through signup:
    // writer/director/studio (a real plan) or "free" for the generic Get-started CTA.
    const valid = (window.CINEMA_PLANS||[]).some(p=>String(p.tier).toLowerCase()===String(plan).toLowerCase());
    const p = valid ? String(plan).toLowerCase() : "free";
    try{ localStorage.setItem("turn-intended-plan", p); }catch(e){}
    setIntendedPlan(p); openAuth("signup");
  };
  React.useEffect(()=>{
    window.turnIntendedPlan = ()=>{ try{ return localStorage.getItem("turn-intended-plan")||null; }catch(e){ return null; } };
    window.turnClearIntendedPlan = ()=>{ try{ localStorage.removeItem("turn-intended-plan"); }catch(e){} setIntendedPlan(null); };
  },[]);
  // WELCOME MOMENT — Stripe's after-payment redirect returns the buyer to
  // /?welcome=1 (set on each payment link's after-payment URL). Show the
  // "your plan is live" card once, and strip the param so a refresh doesn't re-show.
  const [welcomeOpen, setWelcomeOpen] = React.useState(()=>{
    try{ return new URLSearchParams(window.location.search).has("welcome"); }catch(e){ return false; }
  });
  React.useEffect(()=>{
    if(!welcomeOpen) return;
    try{ const u = new URL(window.location.href); u.searchParams.delete("welcome");
      window.history.replaceState({}, "", u.pathname + (u.searchParams.toString()?("?"+u.searchParams.toString()):"") + u.hash); }catch(e){}
  },[]);
  // PLAN-LESS SIGNUP — a "Get started" signup carried no tier: once the ledger loads
  // and shows no plan and no credits, open the plans modal proactively ONE time —
  // "pick your plan to start creating" — instead of waiting for them to hit a wall.
  React.useEffect(()=>{
    if(!(session && session.user)) return;
    if(intendedPlan!=="free") return;
    if(!creditBalance) return;                         // wait for the ledger to load
    try{ localStorage.removeItem("turn-intended-plan"); }catch(e){}
    setIntendedPlan(null);                             // fires once, then never again
    if(window.turnIsPaidPlan(creditBalance.plan) || (Number(creditBalance.remaining)||0) > 0) return;   // already covered
    if(typeof window.appToast==="function") window.appToast("Pick your plan to start creating — every render runs on your plan's credits.","info");
    if(typeof window.turnOpenPlans==="function") setTimeout(()=>window.turnOpenPlans(), 400);
  },[session, intendedPlan, creditBalance]);
  // load the admin's plan-card copy overrides (global, public-read) so the plan cards
  // and landing pricing show the edited copy for everyone, including signed-out visitors.
  React.useEffect(()=>{
    (async()=>{ try{
      if(typeof window.cloudGetAppConfig!=="function") return;
      const ov = await window.cloudGetAppConfig("plans-copy");
      if(ov && typeof window.turnApplyPlanCopy==="function") window.turnApplyPlanCopy(ov);
    }catch(e){} })();
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
  const [homeOpen, setHomeOpen] = React.useState(false);   // Home / Dashboard overlay (only shown at >=2 films)
  const [currentProjectId, setCurrentProjectId] = React.useState(null);
  const cloudMode = !!(session && currentProjectId);
  // ADMIN — demo upkeep account. The Matrix sample story (and "Reset to sample story")
  // is admin-only: every other user (and signed-out local mode) never sees Matrix data.
  const isAdmin = (((typeof cloudUserEmail==="function" && cloudUserEmail(session))||"").toLowerCase()==="admin@infinitestudioai.com");
  // expose for leaf components that have no session prop (e.g. the Art Room key bar)
  React.useEffect(()=>{ window.turnIsAdmin = isAdmin; },[isAdmin]);
  // expose the signed-in user's email so leaf components can scope per-user data
  // (locked render styles live in localStorage keyed by this email). Empty in local/signed-out mode.
  const userEmail = ((typeof cloudUserEmail==="function" && cloudUserEmail(session))||"").toLowerCase();
  React.useEffect(()=>{ window.turnUserEmail = userEmail;
    // the Supabase uid rides into Stripe as client_reference_id (see plans.jsx)
    window.turnUserId = (session && session.user && session.user.id) || null;
    if(typeof window.turnRefreshLockedStyles==="function") window.turnRefreshLockedStyles(); },[userEmail, session]);
  // CONTINUITY from the landing pricing → checkout: if the visitor picked a paid plan
  // before signing up, open that plan's Stripe checkout automatically once they're in.
  React.useEffect(()=>{
    if(!(session && session.user && session.user.id)) return;
    const plan = intendedPlan;
    if(!plan || plan==="free") return;
    const planObj = (window.CINEMA_PLANS||[]).find(p=>String(p.tier).toLowerCase()===plan);
    try{ localStorage.removeItem("turn-intended-plan"); }catch(e){}
    setIntendedPlan(null);
    // sameTab: this fires from an effect (no user gesture) — window.open would be
    // popup-blocked; navigating this tab to Stripe is never blocked, and the
    // after-payment redirect brings the buyer straight back into the app.
    if(planObj && typeof window.turnStartCheckout==="function") setTimeout(()=>window.turnStartCheckout(planObj, { sameTab:true }), 350);
  },[session, intendedPlan]);
  const [creditBalance, setCreditBalance] = React.useState(null);
  const refreshCreditBalance = React.useCallback(async ()=>{
    if(typeof cloudGetCreditBalance!=="function"){ setCreditBalance(null); return null; }
    try{
      const b = await cloudGetCreditBalance();
      setCreditBalance(b || null);
      window.turnCreditBalance = b || null;
      return b || null;
    }catch(e){ setCreditBalance(null); window.turnCreditBalance = null; return null; }
  },[]);
  React.useEffect(()=>{ refreshCreditBalance(); },[userEmail, refreshCreditBalance]);
  React.useEffect(()=>{
    const h = ()=>refreshCreditBalance();
    window.addEventListener("turn-credits-changed", h);
    window.addEventListener("vid-done", h);
    window.addEventListener("nb-gen-done", h);
    window.addEventListener("vg-audio-done", h);
    return ()=>{
      window.removeEventListener("turn-credits-changed", h);
      window.removeEventListener("vid-done", h);
      window.removeEventListener("nb-gen-done", h);
      window.removeEventListener("vg-audio-done", h);
    };
  },[refreshCreditBalance]);
  // LIVE balance: refetch whenever the window regains focus, and STREAM the user's
  // turn_credits row from Supabase realtime — a grant from the SQL editor (or a
  // spend on another device) updates the readout with no reload. Realtime needs
  // the table in the publication (see supabase/credits.sql); the focus refresh is
  // the fallback when it isn't.
  React.useEffect(()=>{
    const onFocus = ()=>{ if(document.visibilityState!=="hidden") refreshCreditBalance(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    let channel = null, sbRef = null;
    try{
      const sb = (typeof window.sbClient==="function") ? window.sbClient() : null;
      const uid = session && session.user && session.user.id;
      if(sb && sb.channel && uid){
        sbRef = sb;
        channel = sb.channel("turn-credits-"+uid)
          .on("postgres_changes", { event:"*", schema:"public", table:"turn_credits", filter:"owner=eq."+uid },
            ()=>refreshCreditBalance())
          .subscribe();
      }
    }catch(e){}
    return ()=>{
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      try{ if(channel && sbRef) sbRef.removeChannel(channel); }catch(e){}
    };
  },[session && session.user && session.user.id, refreshCreditBalance]);
  // expose the current project for format-aware helpers with no project param
  // (e.g. the scene drafter reads formatOf(window.turnProject).screenplayBrief)
  React.useEffect(()=>{ window.turnProject = project; },[project]);
  // live cast on a global so the scene drafter can read each character's canonical
  // pronouns (castPronounBlock) — the root-cause fix for bible<->script gender drift.
  React.useEffect(()=>{ window.turnCast = characters; },[characters]);
  // the CONTINUITY GRAPH, exposed for prompt builders that have no props/scenes/locations
  // params (e.g. the location plate folds in the environment props it owns — locations.jsx)
  React.useEffect(()=>{ window.turnContinuity = { props, scenes, locations, characters, drafts }; },[props, scenes, locations, characters, drafts]);
  const hydratingRef = React.useRef(false);
  // bumped when a hydration pass finishes — lets effects that are gated on
  // hydratingRef (auto-seed) re-run once the doc has settled, even if the user
  // is already sitting on the tab (e.g. reloaded straight into Locations).
  const [hydrationTick, setHydrationTick] = React.useState(0);

  /* A clean canvas — what every NEW registered user (and every "New film") starts
     from. No sample data: empty spine, cast, props, etc. The Matrix sample lives only
     in the seed (story-data.jsx) and in projects already saved to a user's account. */
  const emptyDoc = ()=>({ scenes:[], characters:[], props:[], locations:[], lookbook:[], lookbookNote:"", lookbookApplied:{}, shots:[],
    project:{ title:"Untitled film", genre:"", logline:"", controllingIdea:{} },
    drafts:{}, beatsMap:{}, history:{}, continuityMap:{},
    selId:null, room:"writers", view:"spine", artView:"lookbook", propsSeeded:false, locsSeeded:false, visualsSeeded:false,
    trash:{ characters:[], props:[], locations:[] }, blank:true });
  /* The Matrix sample as a full project doc — used ONLY to seed the admin
     account's first project (the demo lives in the admin account by default). */
  const sampleDoc = ()=>({ scenes:SCENES, characters:CHARACTERS, props:(window.PROPS_SEED||[]), locations:[], lookbook:[], lookbookNote:"", lookbookApplied:{}, shots:[],
    project:PROJECT, drafts:SCREENPLAY, beatsMap:BEATS, history:{}, continuityMap:CONTINUITY||{},
    selId:"s4", propsSeeded:false, locsSeeded:false, visualsSeeded:false });
  const applyDoc = (d)=>{
    d = d || {};
    hydratingRef.current = true;
    // honor an explicitly-empty project (clean canvas). A missing/legacy field only
    // falls back to The Matrix sample for the ADMIN account (demo upkeep) — every
    // other user gets an empty field instead: the sample is admin-only.
    setScenes(Array.isArray(d.scenes)?d.scenes:(isAdmin?SCENES:[]));
    setCharacters(d.characters||(isAdmin?CHARACTERS:[]));
    setProps(d.props||(isAdmin?(window.PROPS_SEED||[]):[]));
    setLocations(d.locations||[]);
    setLookbook(d.lookbook||[]);
    setLookbookNote(d.lookbookNote||"");
    setLookbookApplied(d.lookbookApplied||{});
    setShots(d.shots||[]);
    setProject(d.project||(isAdmin?PROJECT:{ title:"Untitled film", genre:"", logline:"", controllingIdea:{} }));
    setDrafts(d.drafts||(isAdmin?SCREENPLAY:{}));
    setBeatsMap(d.beatsMap||(isAdmin?BEATS:{}));
    setHistory(d.history||{});
    setContinuityMap(d.continuityMap||(isAdmin?(CONTINUITY||{}):{}));
    setSelId(d.selId||(isAdmin?"s4":null));
    // Navigation (room / view / artView) is device-local UI state owned by NAV_KEY
    // and restored synchronously in useState above. Intentionally do NOT re-apply
    // any of it from the hydrated doc — that re-application is what produced the
    // Art Room flash (and would fight the user's restored place) on load.
    setPropsSeeded(!!d.propsSeeded);
    setLocsSeeded(!!d.locsSeeded);
    setVisualsSeeded(!!d.visualsSeeded);
    setTrash(d.trash && typeof d.trash==="object"
      ? { characters:d.trash.characters||[], props:d.trash.props||[], locations:d.trash.locations||[] }
      : _emptyTrash());
    setTimeout(()=>{ hydratingRef.current = false; setHydrationTick(t=>t+1); }, 500);
  };
  // SERIES (Phase 3): the show's BIBLE is itself a project row ({isShow, bible});
  // episodes are normal rows whose doc carries {showId, episodeNo}. On load, an
  // episode merges the bible's shared departments (cast/locations/props/lookbook)
  // into state, and the asset layer routes those entities' sheets to the show scope.
  const [currentShowId, setCurrentShowId] = React.useState(null);
  const [currentEpisodeNo, setCurrentEpisodeNo] = React.useState(null);
  const bibleEntityIds = (bible)=> [].concat(
    (bible.characters||[]).map(c=>c.id), (bible.locations||[]).map(l=>l.id),
    (bible.props||[]).map(p=>p.id), (bible.lookbook||[]).map(r=>r.id)).filter(Boolean);
  const loadProjectIntoState = async (id)=>{
    const row = await cloudLoadProject(id);
    if(!row) return;
    if(typeof window.cloudNoteDocRev==="function") window.cloudNoteDocRev(id, row.doc);
    const uid = (typeof cloudUserId==="function") ? cloudUserId(session) : null;
    if(typeof nbUseCloud==="function") nbUseCloud(id, uid);   // re-scope the image cache to this film
    if(typeof window.vgResetAll==="function") window.vgResetAll();   // and clear voice/video caches
    if(typeof window.vidResetAll==="function") window.vidResetAll();
    setCurrentProjectId(id);
    const d = row.doc || {};
    if(d.showId){
      const bibleRow = await cloudLoadProject(d.showId);
      if(bibleRow && typeof window.cloudNoteDocRev==="function") window.cloudNoteDocRev(d.showId, bibleRow.doc);
      const bible = (bibleRow && bibleRow.doc && bibleRow.doc.bible) || {};
      setCurrentShowId(d.showId);
      setCurrentEpisodeNo(d.episodeNo || null);
      if(typeof nbUseShared==="function") nbUseShared(d.showId, bibleEntityIds(bible));
      applyDoc({ ...d,
        characters: bible.characters || [], locations: bible.locations || [],
        props: bible.props || [], lookbook: bible.lookbook || [],
        lookbookNote: bible.lookbookNote || "" });
    } else {
      setCurrentShowId(null); setCurrentEpisodeNo(null);
      if(typeof nbUseShared==="function") nbUseShared(null);
      applyDoc(d);
    }
    // A project with no story can't live in the (locked) Art Room — applyDoc
    // deliberately never re-applies the room, so creating or switching to a blank
    // project while in the Art Room would otherwise strand the user there. Force the
    // Writers' Room so a new story always begins on the spine. (Only ever pulls TOWARD
    // writers — never flashes into art — so it doesn't reintroduce the load-flash bug.)
    if(!((d.scenes||[]).length)){ setRoom("writers"); setView("spine"); }
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
      // list === null means the REQUEST failed (expired token after the tab slept →
      // 401s), not an empty account. Without this retry the boot used to finish
      // against the failure — bootRef stayed latched, no later auth event re-keys
      // the effect, and the app sat on "Connecting" with an empty canvas until a
      // manual reload. Poke the session refresh and retry with backoff instead.
      for(let wait=3000; list===null && alive; wait=Math.min(wait*2,30000)){
        try{ const sb=(typeof sbClient==="function")&&sbClient(); if(sb) await sb.auth.refreshSession(); }catch(e){}
        await new Promise(r=>setTimeout(r,wait));
        if(!alive) return;
        list = await cloudListProjects();
      }
      if(!alive) return;
      // Read the session FRESH here — during sign-in the captured `isAdmin`
      // can lag a render behind the session this bootstrap is running for.
      const s = (typeof cloudGetSession==="function") ? await cloudGetSession() : null;
      const adminBoot = (((typeof cloudUserEmail==="function" && cloudUserEmail(s))||"").toLowerCase()==="admin@infinitestudioai.com");
      // LEGACY CLEANUP: before the demo was admin-gated, every new account was
      // seeded with The Matrix. Remove the UNMODIFIED demo from non-admin accounts
      // (same premise + scene count + first scene as the seed); anything the user
      // actually edited is left alone.
      if(!adminBoot){
        for(const row of list.filter(r=>/^the matrix$/i.test(r.title||""))){
          try{
            const full = await cloudLoadProject(row.id);
            const d = (full && full.doc) || {};
            const pr = d.project || {};
            const sc = Array.isArray(d.scenes) ? d.scenes : [];
            const pristine = pr.premise===PROJECT.premise && sc.length===SCENES.length
              && sc[0] && SCENES[0] && sc[0].title===SCENES[0].title;
            if(pristine){ await cloudDeleteProject(row.id); list = list.filter(x=>x.id!==row.id); }
          }catch(e){}
        }
      }
      if(!list.length){
        // admin's first project IS the Matrix demo; everyone else starts clean.
        const created = adminBoot
          ? await cloudCreateProject("The Matrix", sampleDoc())
          : await cloudCreateProject("Untitled film", emptyDoc());
        if(created) list = [created];
      }
      if(!alive) return;
      setProjects(list);
      // never auto-open a SHOW (bible) row — open the most recent episode/film
      const openable = list.filter(p=>String(p.isShow)!=="true");
      if(openable[0]) await loadProjectIntoState(openable[0].id);
    })().catch(()=>{});
    return ()=>{ alive=false; };
  },[bootUserId]);

  const switchProject = async (id)=>{ if(id===currentProjectId) return; await loadProjectIntoState(id); };
  const createProject = async (title)=>{
    const created = await cloudCreateProject(title||"Untitled film", emptyDoc());
    if(!created) return;
    setProjects(ps=>[created, ...ps]);
    await loadProjectIntoState(created.id);
    setArtView("lookbook");   // a fresh film opens the Art Room on the Lookbook (front of the pipeline)
  };
  /* Dashboard: mint an AI poster for a film from its title + logline and persist it
     onto doc.cover, so the Recent Projects cards show real key art. Routes through the
     same image proxy as the rest of the studio (no key in the browser). Returns the
     data URL (and stamps it into the projects list) so callers can show it immediately. */
  /* Resolve a film's LEAD cast portrait URLs to use as poster reference images.
     Loads from the cloud by film id, so it works for ANY recent film on the
     dashboard (not just the one currently open).
     Returns { ok, urls }:
       ok:false  → couldn't read the film's cast (auth/network blip). The caller
                   must NOT paint a poster this round (no spend); it retries on
                   the next dashboard open instead of baking in wrong art.
       ok:true, urls:[]  → the film genuinely has no cast portraits → paint a
                   character-free poster (never invent people).
     For a SHOW EPISODE the shared cast lives in the show's bible (keyed by
     doc.showId), and its portrait sheets are stored under the show id — so we
     read the bible and load assets from the show scope (falling back to the
     episode scope for any legacy per-episode sheets). Capped to a few leads for
     a coherent poster and sane cost. */
  const _posterCanonFor = async (proj)=>{
    const NONE = { ok:true, cast:[], world:null, prop:null, style:null };
    if(!proj || !proj.id || typeof window.cloudLoadProject!=="function") return NONE;
    let row;
    try{ row = await window.cloudLoadProject(proj.id); }catch(e){ return { ok:false }; }
    if(!row) return { ok:false };   // read failed — don't persist a wrong poster
    const doc = row.doc || {};
    const pickList = (k)=> (Array.isArray(doc[k]) && doc[k])
      || (doc.bible && Array.isArray(doc.bible[k]) && doc.bible[k]) || [];
    let chars = pickList("characters"), locs = pickList("locations"), props = pickList("props");
    let scopeId = proj.id;
    if(doc.showId){   // episode → pull the shared world from the show's bible
      let showRow;
      try{ showRow = await window.cloudLoadProject(doc.showId); }catch(e){ return { ok:false }; }
      if(!showRow) return { ok:false };   // couldn't reach the show bible — retry later
      const bible = (showRow.doc && showRow.doc.bible) || {};
      if(Array.isArray(bible.characters) && bible.characters.length){
        chars = bible.characters;
        if(Array.isArray(bible.locations) && bible.locations.length) locs = bible.locations;
        if(Array.isArray(bible.props) && bible.props.length) props = bible.props;
        scopeId = doc.showId;
      }
    }
    // The film's OWN medium: the dominant picked render style across its entities —
    // an animated film must get an animated one-sheet, not a photoreal one.
    const tally = {};
    [...chars, ...props, ...locs].forEach(e=>{ const k = e && e.renderStyleKey; if(k) tally[k]=(tally[k]||0)+1; });
    const topKey = Object.keys(tally).sort((a,b)=>tally[b]-tally[a])[0] || null;
    let style = null;
    if(topKey && topKey!=="photoreal"){
      const block = (window.CHAR_RENDER_STYLES||{})[topKey];
      const medium = block && block.rendering;
      if(medium) style = { label:String((window.RENDER_STYLE_LABELS||{})[topKey]||topKey).replace(/^[🔒🌐]\s*/,""), medium };
    }
    // one asset read covers everything: lead cast (identity-critical) + the first
    // few locations/props (world grounding — the poster must show THIS film's
    // world and objects, never invented ones)
    const castIds = chars.slice(0,3).map(c=>c && c.id).filter(Boolean);
    const locIds  = locs.slice(0,4).map(l=>l && l.id).filter(Boolean);
    const propIds = props.slice(0,4).map(p=>p && p.id).filter(Boolean);
    const ids = [...castIds, ...locIds, ...propIds];
    if(!ids.length) return { ...NONE, style };
    let byId;
    try{ byId = (typeof window.cloudAssetLoadMany==="function") ? (await window.cloudAssetLoadMany(scopeId, ids, true) || {}) : {}; }
    catch(e){ return { ok:false }; }
    if(scopeId!==proj.id){   // legacy fallback: some sheets may sit under the episode id
      const missing = ids.filter(id=> !(byId[id] && byId[id].url));
      if(missing.length){ try{ const ep = await window.cloudAssetLoadMany(proj.id, missing) || {}; byId = { ...ep, ...byId }; }catch(e){} }
    }
    const urlOf = (id)=> (byId[id] && byId[id].url) || "";
    const cast = castIds.map(urlOf).filter(Boolean);
    const firstWithArt = (list)=>{ for(const e of list.slice(0,4)){ const u = e && e.id && urlOf(e.id); if(u) return { url:u, name:(e.name||e.title||"").trim() }; } return null; };
    return { ok:true, cast, world:firstWithArt(locs), prop:firstWithArt(props), style };
  };
  /* THE POSTER LOOK — a recipe built from the classic one-sheet archetypes
     (Bass's single bold symbol; the Struzan painted montage; the lone figure
     dwarfed by a vast world à la Dune/Gravity/Lawrence; the Exorcist-style
     silhouette against one light source; the charged two-lead confrontation;
     the big-face portrait with the world ghosted into it; the uncanny frozen
     tableau). Each film gets ONE archetype (stable hash of its id, filtered to
     what its cast size supports) plus a palette and a light treatment — so
     posters are cinematic AND different film to film. Regenerate rotates to a
     different look, so a re-roll is a new concept, not the same image again. */
  const _posterLook = (proj, castN, vary)=>{
    const A = {
      symbol:     "THE ICONIC SYMBOL — distill the film into one bold symbolic image: a single object or motif from the story, monumental and graphic against a near-empty field. No figures.",
      vast:       "THE LONE FIGURE IN A VAST WORLD — the protagonist small in the frame, dwarfed by the enormous world around them; scale, weather and atmosphere carry the drama.",
      face:       "THE BIG FACE — an extreme close portrait of the protagonist filling the frame, eyes carrying the story; imagery of the film's world ghosted faintly into the shadows of the portrait.",
      silhouette: "THE SILHOUETTE — the protagonist as a dark shape against a single blazing light source (a doorway, a sky, a beam); identity read through outline and wardrobe.",
      back:       "THE THRESHOLD — the protagonist seen from behind, facing into the world or conflict that waits for them; we stand where they stand.",
      duel:       "THE CONFRONTATION — the two leads opposed across the frame, faces lit differently, charged negative space between them.",
      montage:    "THE PAINTED MONTAGE — a classic hand-painted cascade: the lead large and luminous, the others layered smaller around them on a sweeping diagonal, edges dissolving into the world.",
      tableau:    "THE FROZEN MOMENT — one arresting, uncanny moment from the story staged wide like a still from a dream; something is quietly wrong.",
    };
    const pool = castN===0 ? ["symbol","vast","tableau"]
      : castN===1 ? ["vast","face","silhouette","back"]
      : castN===2 ? ["duel","vast","silhouette","tableau"]
      : ["montage","tableau","vast"];
    const PALETTES = [
      "burnt orange against deep teal",
      "near-monochrome slate with a single crimson accent",
      "sodium-vapour amber night",
      "bleached bone-white and ink black",
      "wet neon — magenta and cyan on black rain",
      "golden-hour haze, long shadows",
      "cold moonlit blue broken by one warm lamplight",
      "storm green-grey with pale skin tones",
    ];
    const LIGHTS = [
      "one hard rim-light from behind, everything else falling to black",
      "a single overhead shaft of light through darkness",
      "low-key chiaroscuro, half the frame swallowed by shadow",
      "backlit through smoke or dust, god-rays",
      "practical glow — neon, fire or a lone bulb as the only source",
      "vast soft dusk light, the sky doing the work",
    ];
    const s = String(proj.id || proj.title || "poster");
    let hsh = 0; for(let i=0;i<s.length;i++) hsh = ((hsh*31) + s.charCodeAt(i)) >>> 0;
    let ai = hsh % pool.length, pi = (hsh>>>3) % PALETTES.length, li = (hsh>>>6) % LIGHTS.length;
    if(vary){   // a re-roll must LOOK different: step to another concept + treatment
      ai = (ai + 1 + Math.floor(Math.random()*Math.max(1, pool.length-1))) % pool.length;
      pi = (pi + 1 + Math.floor(Math.random()*(PALETTES.length-1))) % PALETTES.length;
      li = (li + 1 + Math.floor(Math.random()*(LIGHTS.length-1))) % LIGHTS.length;
    }
    return { concept:A[pool[ai]], usesCast: pool[ai]!=="symbol", palette:PALETTES[pi], light:LIGHTS[li] };
  };
  const generatePoster = async (proj, opts)=>{
    if(!proj || !proj.id) return "";
    // REGENERATE keeps the outgoing poster as one-deep history (doc.coverPrev)
    // so the Home card's Restore can bring it back.
    const keepPrev = (opts && opts.keepPrev) ? (proj.cover || "") : undefined;
    // In-flight dedupe (keyed by film id, app-level so it survives the dashboard
    // unmounting/remounting): if a poster for this film is ALREADY being painted,
    // hand back the SAME promise instead of launching a second, duplicate spend.
    const inflight = (window.__posterInflight = window.__posterInflight || {});
    if(inflight[proj.id]) return inflight[proj.id];
    const run = (async ()=>{
      const title = proj.title || "Untitled film";
      const logline = ((proj && proj.logline) || "").trim();
      // THE POSTER RECIPE — every poster is grounded in the film's own canon,
      // loaded from the cloud (works for any recent film, not just the open one):
      //   1. CAST     lead character portrait sheets ride as refs — the poster
      //               shows THESE people, never invented faces.
      //   2. WORLD    the primary location plate rides as a ref — the setting is
      //               THIS film's world, never an invented backdrop.
      //   3. PROP     a signature object may feature, faithful to its sheet.
      //   4. MEDIUM   the film's dominant render style (Pixar, ukiyo-e, …) sets
      //               the poster's medium — an animated film gets an animated
      //               one-sheet; photoreal films get a live-action one-sheet.
      // Identity-critical reads FAIL CLOSED (skip this round, no spend, retry on
      // the next dashboard open) so a wrong poster is never baked in.
      const canon = await _posterCanonFor(proj);
      if(!canon.ok) return "";
      const look = _posterLook(proj, canon.cast.length, !!(opts && opts.keepPrev));
      const castUsed = look.usesCast ? canon.cast : [];
      const refs = [];
      let prompt = "Theatrical one-sheet movie poster key art for “"+title+"”. "+
        (logline ? logline+" " : "")+
        "\nCONCEPT — "+look.concept+
        "\nPALETTE & LIGHT: "+look.palette+"; "+look.light+". ";
      if(castUsed.length){
        castUsed.forEach(u=>refs.push(u));
        prompt += "\nCAST: reference image"+(castUsed.length>1?("s 1-"+castUsed.length):" 1")+
          " show"+(castUsed.length>1?"":"s")+" this film's ACTUAL cast — the poster's figure"+
          (castUsed.length>1?"s":"")+" must be exactly these people: wherever a face is visible it is "+
          "faithful to the reference (likeness and wardrobe), and where the concept hides the face the "+
          "build, hair and wardrobe still match. Never invent, add or substitute people. ";
      }else{
        prompt += "\nNO PEOPLE: do not invent or depict any characters — carry the poster on object, "+
          "setting, atmosphere and iconography alone. ";
      }
      if(canon.world){
        refs.push(canon.world.url);
        prompt += "\nWORLD: reference image "+refs.length+" is the film's real primary location"+
          (canon.world.name?(" (“"+canon.world.name+"”)"):"")+" — the poster's setting is THIS world: its "+
          "architecture, landscape, era and weather. Do not invent a different setting. ";
      }
      if(canon.prop){
        refs.push(canon.prop.url);
        prompt += "\nOBJECT: reference image "+refs.length+" is "+
          (canon.prop.name?("“"+canon.prop.name+"”, "):"")+"a signature object from the film — feature it "+
          "only if it serves the concept, faithful to the reference. ";
      }
      prompt += canon.style
        ? "\nMEDIUM: render in the film's own medium — "+canon.style.medium+" ("+canon.style.label+" style); "+
          "the references define the exact look of the people and places. "
        : "\nMEDIUM: photographic live-action one-sheet, shot like a $100M campaign. ";
      prompt += "\nCRAFT: one single striking image, not a collage of floating heads; layered depth "+
        "(foreground element, subject, atmospheric background); bold negative space held clear at the top "+
        "where a title would sit — but render absolutely NO text, NO title, NO lettering, NO logos. "+
        "Dramatic camera angle (low, high or telephoto compression), never a flat eye-level frontal lineup "+
        "of people looking into the camera. Vertical theatrical framing.";
      // Paint dashboard posters with GPT Image 2 (server-side via the proxy) at
      // HIGH quality / 2K — key art is a hero surface, not a thumbnail. Fall
      // back to the default model only if that id isn't available (proxy off).
      const genOpts = { aspectRatio:"9:16", quality:"high", imageSize:"2K" };
      if((window.NB_MODELS||[]).some(m=>m.id==="gpt-image-2")) genOpts.model = "gpt-image-2";
      if(refs.length) genOpts.extraImages = refs;
      let url = await window.nbGenerate(prompt, genOpts);
      if(!url) throw new Error("The poster came back empty — try again.");
      // keep enough pixels for the full-screen viewer (1080-wide, ~2x the card)
      if(typeof window.downscaleRef==="function"){ try{ url = await window.downscaleRef(url, 1080, 0.85); }catch(e){} }
      if(typeof window.cloudSaveCover==="function") await window.cloudSaveCover(proj.id, url, keepPrev);
      setProjects(ps=>ps.map(p=>p.id===proj.id?{ ...p, cover:url, ...(keepPrev!==undefined?{coverPrev:keepPrev}:{}) }:p));
      return url;
    })();
    inflight[proj.id] = run;
    try{ return await run; }
    finally{ delete inflight[proj.id]; }
  };
  /* Home card "Restore": swap the film's poster with its one-deep history. */
  const restorePoster = async (proj)=>{
    if(!proj || !proj.id || !proj.coverPrev || typeof window.cloudSwapCover!=="function") return;
    const r = await window.cloudSwapCover(proj.id);
    if(r) setProjects(ps=>ps.map(p=>p.id===proj.id?{ ...p, cover:r.cover, coverPrev:r.coverPrev }:p));
    else if(typeof window.appToast==="function") window.appToast("Couldn't restore the previous poster.","error");
  };
  /* SERIES: turn the CURRENT project into episode 1 of a new show — its
     departments become the show's shared bible. (Sheets generated before the
     conversion stay readable via the asset layer's episode-scope fallback.) */
  const makeShow = async ()=>{
    if(!cloudMode || currentShowId) return;
    const ok = await window.appConfirm({ title:"Turn this into a show?",
      body:"“"+(project.title||"Untitled")+"” becomes Episode 1, and its cast, locations, props and lookbook become the show's shared BIBLE — every episode reads and writes the same world. Episodes keep their own scenes, script and shots.",
      confirmLabel:"Create the show" });
    if(!ok) return;
    const show = await cloudCreateProject((project.title||"Untitled")+" — Show",
      { isShow:true, bible:{ characters, locations, props, lookbook, lookbookNote } });
    if(!show) return;
    setProjects(ps=>[{ ...show, isShow:"true" }, ...ps]);
    setCurrentShowId(show.id);
    setCurrentEpisodeNo(1);
    if(typeof nbUseShared==="function") nbUseShared(show.id, bibleEntityIds({ characters, locations, props, lookbook }));
  };
  /* a new EPISODE of a show: an empty story that shares the show's bible */
  const createEpisode = async (showId)=>{
    if(!cloudMode || !showId) return;
    const sib = projects.filter(p=>p.showId===showId);
    const nextNo = sib.reduce((m,p)=>Math.max(m, Number(p.episodeNo)||0), currentShowId===showId?(Number(currentEpisodeNo)||1):0) + 1;
    const showRow = projects.find(p=>p.id===showId);
    const base = ((showRow&&showRow.title)||"Show").replace(/ — Show$/,"");
    const created = await cloudCreateProject(base+" — E"+String(nextNo).padStart(2,"0"),
      { ...emptyDoc(), showId, episodeNo:nextNo, project:{ ...emptyDoc().project, title:base+" E"+String(nextNo).padStart(2,"0"), format:(project&&project.format)||"series" } });
    if(!created) return;
    setProjects(ps=>[{ ...created, showId, episodeNo:String(nextNo) }, ...ps]);
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
      const openable = remaining.filter(p=>String(p.isShow)!=="true");
      if(openable[0]) await loadProjectIntoState(openable[0].id);
      else { const created = await cloudCreateProject("Untitled film", emptyDoc()); if(created){ setProjects([...remaining, created]); await loadProjectIntoState(created.id); } }
    }
  };
  const [agentLaunch, setAgentLaunch] = React.useState(null);   // {id, input} to auto-run an agent

  // persist navigation (room/view/artView) to the device-local key on every change
  React.useEffect(()=>{
    try{ localStorage.setItem(NAV_KEY, JSON.stringify({ room, view, artView })); }catch(e){}
  },[room, view, artView]);

  // MULTI-WINDOW CONFLICT: the save fence (cloud.jsx) refused to overwrite a
  // newer revision written by another window. Don't clobber — tell the user and
  // reload the latest doc into this window (their change here is lost, which is
  // the honest outcome; before the fence it silently destroyed the OTHER window's
  // work instead).
  const _conflictBusy = React.useRef(false);
  const _docConflictCheck = (r)=>{
    if(!r || !r.conflict || _conflictBusy.current) return;
    _conflictBusy.current = true;
    if(typeof window.appToast==="function")
      window.appToast("This film was changed in another window — loading the latest version. Keep the film open in ONE window while editing.","error");
    Promise.resolve(loadProjectIntoState(currentProjectId))
      .finally(()=>{ setTimeout(()=>{ _conflictBusy.current = false; }, 1500); });
  };
  // persist the editable story so a browser refresh / reopen keeps the user's work
  const saveTimer = React.useRef(null);
  const projectsRef = React.useRef(projects); projectsRef.current = projects;   // latest rows, for save-time meta
  React.useEffect(()=>{
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(()=>{
      if(hydratingRef.current) return;
      const doc = { scenes, characters, props, locations, lookbook, lookbookNote, lookbookApplied, shots, project, drafts, beatsMap, history, continuityMap, selId, room, view, artView, propsSeeded, locsSeeded, visualsSeeded, trash };
      // The full-doc overwrite would otherwise wipe the Home-wall metadata (the poster and
      // the user's manual order) that lives on the doc but NOT in story state — carry it over.
      const meta = (projectsRef.current||[]).find(p=>p.id===currentProjectId) || {};
      const keep = {};
      if(meta.cover) keep.cover = meta.cover;
      if(meta.ord!=null) keep.homeOrder = Number(meta.ord);
      if(cloudMode){
        if(typeof cloudSaveDoc==="function"){
          if(currentShowId){
            // series episode: shared departments live in the SHOW's bible; the
            // episode keeps its own story (scenes/beats/drafts/shots/…)
            const { characters:_bc, locations:_bl, props:_bp, lookbook:_blb, lookbookNote:_bln, ...epDoc } = doc;
            Promise.resolve(cloudSaveDoc(currentProjectId, { ...epDoc, showId:currentShowId, episodeNo:currentEpisodeNo, ...keep })).then(_docConflictCheck);
            Promise.resolve(cloudSaveDoc(currentShowId, { isShow:true,
              bible:{ characters, locations, props, lookbook, lookbookNote } })).then(_docConflictCheck);
          } else Promise.resolve(cloudSaveDoc(currentProjectId, { ...doc, ...keep })).then(_docConflictCheck);
        }
      }
      else { try{ localStorage.setItem(STORY_KEY, JSON.stringify(doc)); }catch(e){} }
    }, cloudMode ? 700 : 250);
    return ()=> clearTimeout(saveTimer.current);
  },[scenes, characters, props, locations, lookbook, lookbookNote, lookbookApplied, shots, project, drafts, beatsMap, history, continuityMap, selId, room, view, artView, propsSeeded, locsSeeded, visualsSeeded, trash, cloudMode, currentProjectId, currentShowId, currentEpisodeNo]);

  /* Write-through: the Presets (Colorist) "Visual references" field auto-fills from the
     Lookbook — the colorist brief goes INTO the editable field itself (no labels/markers),
     re-syncing on every lookbook change (research, card edits, statement edits, clear),
     for as long as the user hasn't taken the field over: styleBible.lookbookSynced remembers
     the last auto-fill, and once refs differs from it (the user edited), syncs stop and the
     user's text wins. WYSIWYG — whatever the field shows is exactly what the Colorist reads.
     Legacy docs (an in-field "[Lookbook references]" marker block, or the interim separate
     lookbookRefs field) are folded into this shape here. hydrationTick re-runs the pass
     once after a doc settles (migration). */
  React.useEffect(()=>{
    if(hydratingRef.current) return;
    if(typeof lookbookBriefFor!=="function") return;
    const brief = lookbookBriefFor("colorist", lookbook, lookbookNote).replace(/^Overall look: /,"");
    setProject(p=>{
      const sb = (p.styleBible)||{};
      const manual = (typeof mergeLookbookIntoRefs==="function") ? mergeLookbookIntoRefs(sb.refs||"", "") : (sb.refs||"");
      const owned = !!manual.trim() && manual !== (sb.lookbookSynced||"");
      const next = owned ? manual : brief;
      if((sb.refs||"")===next && (sb.lookbookSynced||"")===brief && sb.lookbookRefs===undefined) return p;
      const out = { ...sb, refs:next, lookbookSynced:brief };
      delete out.lookbookRefs;   // interim field from the previous sync design
      return { ...p, styleBible:out };
    });
  },[lookbook, lookbookNote, hydrationTick]);

  /* No story yet → the studio has nothing to work on: rooms beyond the Writers'
     Room stay locked, and story-dependent actions explain what to do instead. */
  const requireStory = async (what)=>{
    if(scenes.length) return true;
    const ok = await window.appConfirm({ title:"Create a story first",
      body:what+" works on your story — and there isn't one yet. Bring an idea and Cinema Machine builds the story with you, scene by scene.",
      confirmLabel:"+ New Story", cancelLabel:"Not now" });
    if(ok) startNewStory();
    return false;
  };
  // PLAN GATE — no free tier: a signed-in user needs an active plan (or purchased
  // credits) before creating a story or leaving the Writers' Room. Admin and local/
  // dev (balance not loaded yet) bypass; the server-side credit check is the real
  // enforcement, this is the friendly nudge to the plans modal.
  const planActive = ()=>{
    if(window.turnIsAdmin) return true;
    const b = window.turnCreditBalance;
    if(!b){
      // Ledger not loaded yet. A SIGNED-IN cloud user must NOT slip through the gate
      // (a fresh no-plan account showed the ledger a beat late and was let straight in
      // to generate) — kick a refresh and treat them as gated until it lands. Only a
      // truly anonymous / offline dev session gets the friendly bypass.
      if(session && session.user){ try{ refreshCreditBalance && refreshCreditBalance(); }catch(e){} return false; }
      return true;
    }
    return window.turnIsPaidPlan(b.plan) || (Number(b.credits)||0) > 0 || (Number(b.remaining)||0) > 0;
  };
  const requirePlan = (what)=>{
    // The plans modal itself carries the "choose a plan" message, so no toast —
    // the bottom popup was redundant noise on top of the modal.
    if(typeof window.turnOpenPlans==="function") window.turnOpenPlans();
  };
  const guardedSetRoom = (id)=>{
    if(id!=="writers" && !planActive()){ requirePlan("open "+(id==="art"?"the Art Room":id==="stage"?"the Stage":"this room")); return; }
    if(id!=="writers" && !scenes.length){ requireStory("The Art Room"); return; }
    setRoom(id);
  };

  const resetStory = ()=>{
    if(!isAdmin) return;   // the Matrix sample is admin-only — belt & braces behind the hidden menu item
    clearStory();
    setScenes(SCENES); setCharacters(CHARACTERS); setProps((window.PROPS_SEED||[])); setLocations([]); setShots([]); setProject(PROJECT); setDrafts(SCREENPLAY); setBeatsMap(BEATS);
    setHistory({}); setContinuityMap(CONTINUITY||{}); setSelId("s4"); setSelChar(null); setPropsSeeded(false); setLocsSeeded(false); setVisualsSeeded(false);
  };

  // "New Story" — NON-destructive and LAZY (2026-07-04). Clicking it only opens the
  // intake modal over whatever the user is doing; NO film is created until the story
  // actually LAUNCHES (logline → synopsis reviewed → build). It used to mint a blank
  // film eagerly on click, so every aborted/closed intake stranded an untitled film
  // on the wall — and every extra click stranded another. The blank film is now
  // created inside onLaunch, and only when the CURRENT film already holds a story
  // (an empty canvas is reused, never duplicated). Deleting a film remains the
  // project switcher's deliberate per-film Delete.
  const startNewStory = ()=>{ if(!planActive()){ requirePlan("start a story"); return; } setNewStoryOpen(true); };

  // ---- character handlers ----
  const updateCharacter = (id,patch)=>setCharacters(cs=>cs.map(c=>c.id===id?{...c,...patch}:c));
  // add a character BY HAND (not from the script) — gets a manual flag so its sheet
  // generation is spec-gated like hand-added props/locations.
  const addCharacter = ()=>{
    const id = "char-"+Date.now().toString(36);
    setCharacters(cs=>[...cs, { id, name:"New character", role:"",
      color:"linear-gradient(135deg,#6a6f7a,#262a30)", conscious:"", unconscious:"", arc:"", manual:true }]);
    return id;
  };
  // Writers' Room rail "+": add AND select, so the Character panel opens on the
  // new character ready to type (name, role and pronouns are edited right there).
  const addCharacterAndSelect = ()=>{
    const id = addCharacter();
    setSelChar(id); setInspOpen(true);
  };
  // SOFT DELETE: move the full character into the restore bin (its scenes are scene-side
  // and untouched, so restoring the same id re-links them). The generated sheet is KEPT
  // (no nbClearAsset) so a restore brings the art back too; it's purged only on "Delete
  // forever". A new trash entry stamps when it was deleted.
  const _trashStamp = (obj)=> ({ ...obj, _deletedAt:new Date().toISOString() });
  const deleteCharacter = (id)=>{
    const c = (characters||[]).find(x=>x.id===id); if(!c) return;
    setCharacters(cs=>cs.filter(x=>x.id!==id));
    setTrash(t=>({ ...t, characters:[ _trashStamp(c), ...(t.characters||[]).filter(x=>x.id!==id) ] }));
  };
  const restoreCharacter = (id)=>{
    const item = (trash.characters||[]).find(x=>x.id===id); if(!item) return;
    const { _deletedAt, ...clean } = item;
    setCharacters(cs=> cs.some(c=>c.id===id) ? cs : [...cs, clean]);
    setTrash(t=>({ ...t, characters:(t.characters||[]).filter(x=>x.id!==id) }));
  };
  const purgeCharacter = (id)=>{
    const item = (trash.characters||[]).find(x=>x.id===id);
    setTrash(t=>({ ...t, characters:(t.characters||[]).filter(x=>x.id!==id) }));
    try{ if(typeof nbClearAsset==="function"){ nbClearAsset(id); (item&&item.states||[]).forEach(st=>nbClearAsset(id+":"+st.id)); } }catch(e){}
  };
  const [charDrafting, setCharDrafting] = React.useState(null);
  const draftCharacter = async (ch)=>{
    if(charDrafting) return;
    setCharDrafting(ch.id);
    const driven = scenes.filter(s=>s.driver===ch.id);
    try{
      const res = (typeof aiDraftCharacter==="function") ? await aiDraftCharacter(ch, driven, project, { scenes, drafts }) : null;
      if(res) updateCharacter(ch.id, res);
    }catch(e){}
    setCharDrafting(null);
  };
  const selectScene = (id)=>{ setSelId(id); setSelChar(null); setFocusBeat(null);
    // surface the selected scene's details — expand a collapsed inspector.
    // Panel modes only: on mobile the inspector is a full overlay drawer, and
    // auto-opening it would hijack the canvas on every browsing tap.
    if(!inspDrawer) setInspOpen(true);
  };

  // Art Room: draft a character's visual layer (look/wardrobe/props) from the script
  // per-card character drafts run CONCURRENTLY (reuse the drafting-ids set the cards
  // already reflect), so several "Draft details" / "Draft & Generate" can run at once.
  const draftCharacterVisuals = async (ch)=>{
    if(draftingVisualIdsRef.current.indexOf(ch.id)>=0) return;   // this character already drafting
    setDraftingVisualIds(ids=> ids.indexOf(ch.id)>=0 ? ids : [...ids, ch.id]);
    const driven = scenes.filter(s=>s.driver===ch.id);
    try{
      const res = (typeof aiCharacterVisuals==="function") ? await aiCharacterVisuals(ch, driven, lbProject("characters"), { scenes, drafts }) : null;
      if(res){ updateCharacter(ch.id, res);
        // pull-on-draft consumed the CURRENT Lookbook — stamp it applied, exactly
        // like the batch path does, or the very first per-card draft raises a false
        // "Lookbook changed" banner the moment the dept gains content
        markApplied("characters"); }
    }catch(e){}
    setDraftingVisualIds(ids=> ids.filter(x=>x!==ch.id));
  };
  // Generate a character's MASTER sheet headlessly (used to guarantee a prop's owner has a
  // sheet BEFORE the prop is generated, so the prop matches the character — mirrors the
  // Casting Director's generateMaster: combined prompt + worn-prop refs + cameo + model).
  const _imgOf = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
    if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u||""; };
  const generateCharMaster = async (c)=>{
    if(!c || typeof window.nbGenerate!=="function" || typeof window.nbCommit!=="function") return "";
    let prompt = (typeof combinedImagePrompt==="function") ? combinedImagePrompt(c, project, props) : (c.name||"character reference sheet");
    const refs=[]; for(const p of (props||[]).filter(p=>p.ownerId===c.id && p.kind!=="carried")){ const u=await _imgOf(p.id); if(u) refs.push(u); }
    let cameo=[]; if(typeof nbGetCameoAngles==="function"){ try{ cameo=nbGetCameoAngles(c.id)||[]; }catch(e){} }
    if(!cameo.length && typeof nbLoadCameoAngles==="function"){ try{ cameo=await nbLoadCameoAngles(c.id)||[]; }catch(e){} }
    if(refs.length) prompt += " The additional prop reference image(s) show items this character wears/carries — match them EXACTLY.";
    if(cameo.length) prompt += " Keep the FACE, bone structure and skin tone identical to the locked-likeness reference; only wardrobe and condition change.";
    const extra=[...refs, ...cameo];
    const gpt2 = (window.NB_MODELS||[]).find(m=>/gpt-image/i.test(m.id));
    const m0 = (typeof nbGetMeta==="function")?nbGetMeta(c.id):null;
    const model = (m0&&m0.modelId) || (gpt2&&gpt2.id) || ((typeof nbGetModel==="function")?nbGetModel():undefined);
    const gopts = { aspectRatio:"16:9", ...(model?{model}:{}), ...(extra.length?{extraImages:extra}:{}) };
    let url; try{ url=await window.nbGenerate(prompt, gopts); }
    catch(e){ if(/no image/i.test(String((e&&e.message)||e))) url=await window.nbGenerate(prompt, gopts); else throw e; }
    const meta = { modelId:model, aspect:"16:9", iso:new Date().toISOString(), prompt, agent:"Prop owner pre-gen" };
    const kind = (typeof slotAssetKind==="function") ? slotAssetKind("charref-"+c.id) : "character";
    await window.nbCommit(c.id, url, meta, [], kind);
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:c.id, url } })); }catch(e){}
    return url;
  };
  // Guarantee a prop is "created with its character's sheet": if the owner has no generated
  // sheet yet, draft its spec (if needed) and generate its master FIRST, so the prop's own
  // generation can reference it. No-op for ownerless props or owners already sheeted.
  const ensureOwnerSheet = async (prop)=>{
    if(!prop || !prop.ownerId) return;
    const c = (characters||[]).find(x=>x.id===prop.ownerId);
    if(!c) return;
    if(await _imgOf(c.id)) return;                       // owner already has a sheet
    let cc = c;
    if(typeof window.charVisualsDrafted==="function" && !window.charVisualsDrafted(cc) && typeof aiCharacterVisuals==="function"){
      try{ const patch = await aiCharacterVisuals(cc, scenes.filter(s=>s.driver===cc.id), lbProject("characters"), { scenes, drafts });
        if(patch){ updateCharacter(cc.id, patch); cc = { ...cc, ...patch }; } }catch(e){}
    }
    try{ await generateCharMaster(cc); }
    catch(e){ if(typeof window.appToast==="function") window.appToast("Couldn't generate "+(c.name||"the owner")+"'s sheet first: "+((e&&e.message)||"error"),"error"); }
  };
  const [draftingAllVisuals, setDraftingAllVisuals] = React.useState(false);
  // "Draft all characters" — fills the spec ONLY for characters that haven't been
  // drafted yet (identity, wardrobe, props & accessories, look dev), then suggests
  // continuity states for them. NON-DESTRUCTIVE by design: already-drafted or
  // hand-edited characters are never overwritten, so this is safe to auto-run.
  const draftAllVisuals = async ()=>{
    if(draftingAllVisuals || !(typeof aiCastVisualBible==="function")) return false;
    const drafted = (typeof window.charVisualsDrafted==="function") ? window.charVisualsDrafted : (()=>true);
    const targets = characters.filter(c=> !drafted(c));
    if(!targets.length) return true;            // nothing to do — that's a success
    const targetIds = targets.map(c=>c.id);
    setDraftingVisualIds(targetIds);
    setDraftingAllVisuals(true);
    let landed = false;                          // did any spec actually land?
    try{
      const map = await aiCastVisualBible(targets, scenes, lbProject("characters"), { scenes, drafts });
      // merge ONLY the targeted (undrafted) characters — never touch the rest
      if(map){
        const allow = new Set(targetIds);
        landed = targetIds.some(id=>map[id]);
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
      if(targets.length) markApplied("characters");
    }catch(e){}
    setDraftingAllVisuals(false);
    return landed;
    setDraftingVisualIds([]);
  };

  // ---- Art Room: LOOKBOOK (References) ----
  const updateLookbookCard = (id,patch)=>setLookbook(ls=>ls.map(c=>c.id===id?{...c,...patch}:c));
  // create ONE owned prop card from a character-card item bullet that never got a
  // card derived (e.g. a character added after "Design all props" ran) — same shape
  // derivePropsFromCast builds, so the linked-prop row claims it by exact name.
  const createOwnedProp = (charId, itemText, sourceKind)=>{
    const ch = characters.find(x=>x.id===charId); if(!ch) return null;
    const item = String(itemText||"").trim(); if(!item) return null;
    const kind = ((typeof classifyPropKind==="function") && classifyPropKind(item)) || sourceKind || "carried";
    const slug = (typeof window.propSlug==="function") ? window.propSlug(item)
      : item.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40);
    const card = { id:"prop-"+(ch.id||"x")+"-"+kind+"-"+slug+"-"+Date.now().toString(36),
      name:item, kind, ownerId:ch.id, ownerName:ch.name||"", fromCast:true };
    setProps(ps=> ps.some(x=>x.id===card.id) ? ps : [...ps, card]);
    return card;
  };
  const addLookbookCard = ()=>{
    const id = "look-"+Date.now().toString(36);
    setLookbook(ls=>[...ls, { id, source:"New reference", category:"Palette", note:"", negativePrompt:"", manual:true }]);
  };
  const deleteLookbookCard = (id)=>{
    setLookbook(ls=>ls.filter(c=>c.id!==id));
    try{ if(typeof nbClearAsset==="function") nbClearAsset(id); }catch(e){}
  };
  // Remove the whole Lookbook (references + statement + their mood frames). Art Room state only —
  // never touches the story or any other tab; lookbookApplied is left intact so the tabs that
  // absorbed the lookbook correctly flag as out-of-date (re-draft to purge the influence).
  const clearLookbook = async ()=>{
    const n = (lookbook||[]).length;
    if(!n && !((lookbookNote||"").trim())) return;
    let ok = true;
    if(typeof window.appConfirm==="function"){
      ok = await window.appConfirm({ title:"Clear the whole Lookbook?",
        body:"This removes all references and the visual statement (and their mood frames). It doesn't touch your story or any other tab — but tabs you already drafted will show as out-of-date so you can re-draft to remove what they absorbed.",
        confirmLabel:"Clear lookbook", danger:true });
    }
    if(!ok) return;
    (lookbook||[]).forEach(c=>{ try{ if(typeof nbClearAsset==="function") nbClearAsset(c.id); }catch(e){} });
    setLookbook([]);
    setLookbookNote("");
  };

  // ---- Art Room: PROPS ----
  const updateProp = (id,patch)=>{
    // RENAME SYNC (prop card → character): renaming a prop in the Props tab also renames
    // the matching worn/carried bullet on its owner's character card, so the two never drift.
    if(patch && Object.prototype.hasOwnProperty.call(patch,"name")){
      const prev = (props||[]).find(p=>p.id===id);
      if(prev && prev.ownerId && String(prev.name||"").trim() !== String(patch.name||"").trim()){
        syncCharBulletRename(prev.ownerId, prev.name, patch.name);
      }
    }
    setProps(ps=>ps.map(p=>p.id===id?{...p,...patch}:p));
  };
  const [draftingPropId, setDraftingPropId] = React.useState(null);
  // per-card prop drafts run CONCURRENTLY (mirrors characters/locations)
  const [draftingPropIds, setDraftingPropIds] = React.useState([]);
  const draftingPropIdsRef = React.useRef([]); draftingPropIdsRef.current = draftingPropIds;
  const [draftingAllProps, setDraftingAllProps] = React.useState(false);
  const addProp = ()=>{
    const id = "prop-"+Date.now().toString(36);
    setProps(ps=>[...ps, { id, name:"New prop", kind:"carried", ownerId:"", ownerName:"",
      form:"", material:"", detail:"", renderStyle:"", negativePrompt:"", manual:true }]);
  };
  const deleteProp = (id)=>{
    const p = (props||[]).find(x=>x.id===id); if(!p) return;
    setProps(ps=>ps.filter(x=>x.id!==id));
    setTrash(t=>({ ...t, props:[ _trashStamp(p), ...(t.props||[]).filter(x=>x.id!==id) ] }));
  };
  const restoreProp = (id)=>{
    const item = (trash.props||[]).find(x=>x.id===id); if(!item) return;
    const { _deletedAt, ...clean } = item;
    setProps(ps=> ps.some(p=>p.id===id) ? ps : [...ps, clean]);
    setTrash(t=>({ ...t, props:(t.props||[]).filter(x=>x.id!==id) }));
  };
  const purgeProp = (id)=>{
    setTrash(t=>({ ...t, props:(t.props||[]).filter(x=>x.id!==id) }));
    try{ if(typeof nbClearAsset==="function") nbClearAsset(id); }catch(e){}
  };
  // merge a set of duplicate prop cards (same owner + same object) into ONE: keep the
  // richest card (most scenes, then one with a generated sheet, then longest name),
  // union the scene coverage, backfill any empty spec fields from the others, and
  // delete the rest. Non-destructive to the survivor's own image/spec.
  const mergeProps = (ids, survivorId)=>{
    const set = (props||[]).filter(p=> ids.indexOf(p.id)>=0);
    if(set.length<2) return;
    const hasImg = (id)=> (typeof nbGetImage==="function") ? !!nbGetImage(id) : false;
    const score = (p)=> ((p.scenes||[]).length*100) + (hasImg(p.id)?40:0) + Math.min((p.name||"").length,30);
    // the user can pick which card survives (its art + spec win); otherwise keep the richest.
    const survivor = (survivorId && set.find(p=>p.id===survivorId)) || set.slice().sort((a,b)=> score(b)-score(a))[0];
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
  const _normPropName = s=> String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
  // SELF-HEAL worn↔carried (user ruling 2026-07-14: users never fix this by hand):
  // any SAVED card carrying a misfiled carried object (a bag, a phone, documents
  // filed under worn accessories) is normalised automatically the moment the cast
  // is in state — the item moves to the carried list AND its linked prop card
  // flips kind to "carried", so nothing wrong ever reaches a render. Deterministic
  // and idempotent: after one pass nothing matches, so the effect goes quiet.
  React.useEffect(()=>{
    if(hydratingRef.current || !characters.length) return;
    if(typeof window.turnReclassifyWornCarried!=="function") return;
    const patches = [];
    characters.forEach(c=>{
      const r = window.turnReclassifyWornCarried(c.accessories, c.props);
      if(r.changed) patches.push({ id:c.id, acc:r.acc, props:r.props, moved:r.moved });
    });
    if(!patches.length) return;
    setCharacters(cs=>cs.map(c=>{ const p=patches.find(x=>x.id===c.id);
      return p ? { ...c, accessories:p.acc, props:p.props } : c; }));
    setProps(ps=>ps.map(pr=>{
      if(pr.kind!=="worn") return pr;
      const p = patches.find(x=>x.id===pr.ownerId); if(!p) return pr;
      const prn = _normPropName(pr.name);
      const hit = p.moved.some(m=>{ const mn=_normPropName(m);
        return mn===prn || mn.includes(prn) || prn.includes(mn); });
      return hit ? { ...pr, kind:"carried" } : pr;
    }));
    if(typeof window.appToast==="function")
      window.appToast(patches.length+" character card"+(patches.length>1?"s":"")+" tidied automatically — carried objects (bags, phones, documents) moved off the worn list; their prop cards are now carried-type.","info");
  },[characters, hydrationTick]);
  // RENAME SYNC (character bullet → prop card): editing a worn/carried item on a
  // character card renames the matching prop card (keeping its sheet), the mirror of
  // removeOwnedProp. Match on owner + normalised name, same as seeding/removal.
  const renameOwnedProp = (charId, oldText, newText)=>{
    const from = _normPropName(oldText), to = String(newText||"").trim();
    if(!charId || !from || !to) return;
    setProps(ps=>ps.map(p=> (p.ownerId===charId && _normPropName(p.name)===from && p.name!==to) ? {...p, name:to} : p));
  };
  // RENAME SYNC (prop card → character bullet): replace the matching worn/carried item
  // in the owner's accessories/props text, preserving every other item.
  const syncCharBulletRename = (charId, oldName, newName)=>{
    const from = _normPropName(oldName), to = String(newName||"").trim();
    if(!charId || !from || !to) return;
    const replaceIn = (text)=>{
      const items = (typeof splitListItems==="function") ? splitListItems(text) : String(text||"").split(/\s*,\s*/).filter(Boolean);
      let changed=false;
      const next = items.map(it=>{ if(_normPropName(it)===from && it.trim()!==to){ changed=true; return to; } return it; });
      return changed ? next.join(", ") : null;
    };
    setCharacters(cs=>cs.map(c=>{
      if(c.id!==charId) return c;
      const a = replaceIn(c.accessories), pr = replaceIn(c.props);
      if(a==null && pr==null) return c;
      return { ...c, ...(a!=null?{accessories:a}:{}), ...(pr!=null?{props:pr}:{}) };
    }));
  };
  /* a DRAFT never overwrites a deliberately PICKED render style: when a card has an
     explicit renderStyleKey (incl. a locked Surprise style), the drafted look-dev
     text is dropped from the patch — otherwise re-drafting a Pixar prop would quietly
     reset its style text to the drafter's photoreal-ish suggestion. */
  const keepPickedStyle = (entity, patch)=>{
    if(!patch || !entity || !entity.renderStyleKey) return patch;
    const rest = { ...patch }; delete rest.renderStyle; return rest;
  };
  const draftPropVisuals = async (pr)=>{
    if(!(typeof aiPropVisuals==="function")) return;
    if(draftingPropIdsRef.current.indexOf(pr.id)>=0) return;   // this prop already drafting
    setDraftingPropIds(ids=> ids.indexOf(pr.id)>=0 ? ids : [...ids, pr.id]);
    try{
      const res = await aiPropVisuals(pr, characters, lbProject("props"));
      if(res){ updateProp(pr.id, keepPickedStyle(pr, res)); markApplied("props"); }
    }catch(e){}
    setDraftingPropIds(ids=> ids.filter(x=>x!==pr.id));
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
        const derived = propsFromCast(characters, props, scenes, drafts);
        if(derived.length){ working = [...props, ...derived]; setProps(working); setPropsSeeded(true); }
      }
      // 2) draft specs
      if(typeof aiDesignPropBible==="function" && working.length){
        const map = await aiDesignPropBible(working, characters, lbProject("props"));
        if(map){ working = working.map(p=> map[p.id] ? {...p, ...keepPickedStyle(p, map[p.id])} : p);
          setProps(ps=>ps.map(p=> map[p.id] ? {...p, ...keepPickedStyle(p, map[p.id])} : p)); }
      }
      // 3) map scenes
      if(typeof aiPropScenes==="function" && working.length){
        const smap = await aiPropScenes(working, scenes, drafts, characters);
        if(smap) setProps(ps=>ps.map(p=> smap[p.id] ? {...p, scenes: smap[p.id]} : p));
      }
      if(working.length) markApplied("props");
    }catch(e){}
    setDraftingAllProps(false);
  };
  // Pull standalone prop cards out of the cast's existing "Props & accessories"
  // fields (worn -> kind "worn", carried -> kind "carried"). Dedups against
  // what's already in the tab, so it's safe to call repeatedly.
  const seedPropsFromCast = React.useCallback(()=>{
    if(typeof propsFromCast!=="function") return;
    const derived = propsFromCast(characters, props, scenes, drafts);
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
  const _autoDraftTried = React.useRef(false);   // once per SESSION guard (never loops)
  React.useEffect(()=>{
    if(visualsSeeded || hydratingRef.current) return;
    if(room!=="art") return;
    if(!characters.length) return;                 // wait for hydration
    if(_autoDraftTried.current) return;
    _autoDraftTried.current = true;
    const drafted = (typeof window.charVisualsDrafted==="function") ? window.charVisualsDrafted : (()=>true);
    if(!characters.some(c=>!drafted(c))){ setVisualsSeeded(true); return; }
    // latch the per-story flag ONLY when specs actually landed — a failed attempt
    // (model unreachable, cast mid-hydration after a rebuild) used to latch forever
    // and strand the user on a wall of manual draft buttons
    Promise.resolve(draftAllVisuals()).then((ok)=>{ if(ok) setVisualsSeeded(true); });
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
  // per-card location drafts run CONCURRENTLY — a set of ids currently drafting, so you
  // can fire "Draft & Generate" on several locations at once (not one-at-a-time).
  const [draftingLocIds, setDraftingLocIds] = React.useState([]);
  const draftingLocIdsRef = React.useRef([]); draftingLocIdsRef.current = draftingLocIds;
  const [draftingAllLocs, setDraftingAllLocs] = React.useState(false);
  const [assigningStyles, setAssigningStyles] = React.useState(false);
  const addLocation = ()=>{
    const id = "loc-"+Date.now().toString(36);
    setLocations(ls=>[...ls, { id, key:id, name:"New location", intExt:"INT", times:[], areas:[], scenes:[],
      architecture:"", materials:"", lighting:"", significance:"", renderStyle:"", negativePrompt:"", variants:[], manual:true }]);
  };
  const deleteLocation = (id)=>{
    const l = (locations||[]).find(x=>x.id===id); if(!l) return;
    setLocations(ls=>ls.filter(x=>x.id!==id));
    setTrash(t=>({ ...t, locations:[ _trashStamp(l), ...(t.locations||[]).filter(x=>x.id!==id) ] }));
  };
  const restoreLocation = (id)=>{
    const item = (trash.locations||[]).find(x=>x.id===id); if(!item) return;
    const { _deletedAt, ...clean } = item;
    setLocations(ls=> ls.some(l=>l.id===id) ? ls : [...ls, clean]);
    setTrash(t=>({ ...t, locations:(t.locations||[]).filter(x=>x.id!==id) }));
  };
  const purgeLocation = (id)=>{
    const item = (trash.locations||[]).find(x=>x.id===id);
    setTrash(t=>({ ...t, locations:(t.locations||[]).filter(x=>x.id!==id) }));
    try{ if(typeof nbClearAsset==="function"){ nbClearAsset(id); (item&&item.variants||[]).forEach(v=>nbClearAsset(id+"-"+v.id)); } }catch(e){}
  };
  const draftLocationVisuals = async (l)=>{
    if(!(typeof aiLocationVisuals==="function")) return;
    if(draftingLocIdsRef.current.indexOf(l.id)>=0) return;   // this location already drafting
    setDraftingLocIds(ids=> ids.indexOf(l.id)>=0 ? ids : [...ids, l.id]);
    try{
      const fields = await aiLocationVisuals(l, scenes, lbProject("locations"));
      if(fields){ setLocations(ls=>ls.map(x=>x.id===l.id?{...x, ...keepPickedStyle(x, fields)}:x)); markApplied("locations"); }
    }catch(e){}
    setDraftingLocIds(ids=> ids.filter(x=>x!==l.id));
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
        const derived = deriveLocations(scenes, locations, drafts);   // places not yet present (incl. mid-scene slugs)
        const fresh = deriveLocations(scenes, [], drafts);            // all, to refresh scene chips
        working = locations.map(l=>{ const m=fresh.find(f=>f.key===l.key);
          return m?{...l, scenes:m.scenes, times:[...new Set([...(l.times||[]),...m.times])], areas:[...new Set([...(l.areas||[]),...m.areas])]}:l; });
        if(derived.length) working = [...working, ...derived];
        setLocsSeeded(true);
        if(derived.length || working.length) setLocations(working);
      }
      if(!working.length){ setDraftingAllLocs(false); return; }
      // 2) draft specs
      const map = await aiDesignLocationBible(working, scenes, lbProject("locations"));
      const merged = working.map(l=> (map && map[l.id]) ? {...l, ...keepPickedStyle(l, map[l.id])} : l);
      if(map) setLocations(ls=>ls.map(l=> map[l.id] ? {...l, ...keepPickedStyle(l, map[l.id])} : l));
      // 3) depth-grid staging — only for places the film revisits (2+ scenes), where
      // cross-scene geometric continuity pays off; single-scene locations skip it and
      // render fine from prose (a card's "Draft staging" button stages one on demand).
      if(typeof aiDraftStaging==="function"){
        const stageTargets = merged.filter(l=>(l.scenes||[]).length>=2);
        const stages = await Promise.all(stageTargets.map(async l=>{
          try{ return { id:l.id, staging: await aiDraftStaging(l, scenes, project) }; }
          catch(e){ return { id:l.id, staging:null }; }
        }));
        const sMap = {}; stages.forEach(x=>{ if(x.staging) sMap[x.id]=x.staging; });
        if(Object.keys(sMap).length) setLocations(ls=>ls.map(l=> sMap[l.id] ? {...l, staging:sMap[l.id]} : l));
      }
      if(working.length) markApplied("locations");
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
    const derived = deriveLocations(scenes, locations, drafts);
    setLocsSeeded(true);
    if(derived.length) setLocations(ls=>[...ls, ...derived]);
    // also refresh the scene lists on existing locations as the script grows
    else if(locations.length){
      const fresh = deriveLocations(scenes, [], drafts);
      setLocations(ls=>ls.map(l=>{ const m=fresh.find(f=>f.key===l.key); return m?{...l, scenes:m.scenes, times:[...new Set([...(l.times||[]),...m.times])], areas:[...new Set([...(l.areas||[]),...m.areas])]}:l; }));
    }
  },[scenes, locations, drafts]);
  // auto-seed once per story: first time the Locations tab opens empty, derive them
  React.useEffect(()=>{
    if(locsSeeded || hydratingRef.current) return;
    if(room!=="art" || artView!=="locations") return;
    if(locations.length){ setLocsSeeded(true); return; }
    if(typeof scriptHasLocations==="function" && scriptHasLocations(scenes)) pullLocationsFromScript();
  },[room, artView, locsSeeded, locations.length, scenes, pullLocationsFromScript, hydrationTick]);
  // read the whole film, design a BESPOKE per-film palette and color-script it
  // along the value-charge spine (see aiAssignSceneStyles).
  // merge an aiAssignSceneStyles result into project.styleBible. Shared by the quick
  // "Assign from script" button AND the explainable Colorist agent (on approval).
  const applyStyleResult = (res, seed)=>{
    if(!res) return;
    setProject(p=>{
      const sb = (p.styleBible)||{};
      // A bespoke per-film palette REPLACES the generic starter set (deduped by id)
      // so each film looks unique; fall back to the existing/seed presets if none.
      const bespoke = (res.presets&&res.presets.length) ? res.presets : null;
      let presets, sceneStyles;
      if(bespoke){
        const byId = {}; bespoke.forEach(p=>{ byId[p.id]=p; });
        presets = Object.values(byId);
        // drop any prior assignment whose preset no longer exists, then overlay the color-script.
        const validIds = new Set(presets.map(p=>p.id));
        const kept = {}; Object.entries(sb.sceneStyles||{}).forEach(([sid,pid])=>{ if(validIds.has(pid)) kept[sid]=pid; });
        sceneStyles = {...kept, ...(res.sceneStyles||{})};
      } else {
        presets = (sb.presets&&sb.presets.length) ? sb.presets : (seed||sb.presets||[]);
        sceneStyles = {...(sb.sceneStyles||{}), ...(res.sceneStyles||{})};
      }
      // the model also picks the film stock; preserve other styleBible fields (refs etc.).
      const filmStock = res.filmStock || sb.filmStock || "none";
      return {...p, styleBible:{ ...sb, presets, sceneStyles, filmStock }};
    });
  };
  const assignSceneStyles = async ()=>{
    if(assigningStyles || !(typeof aiAssignSceneStyles==="function")) return;
    setAssigningStyles(true);
    try{
      const sb = (typeof styleBibleOf==="function") ? styleBibleOf(project) : {};
      const seed = (sb.presets&&sb.presets.length) ? sb.presets : (window.STYLE_PRESETS_DEFAULT||[]);
      // the Lookbook's colorist brief is auto-synced into styleBible.lookbookRefs (see the
      // write-through effect); aiAssignSceneStyles reads it alongside the manual refs.
      const res = await aiAssignSceneStyles(scenes, seed, drafts, project);
      applyStyleResult(res, seed);
      if(res) markApplied("colorist");
    }catch(e){}
    setAssigningStyles(false);
  };
  // the user's free-text visual references that steer bespoke palette design
  // project-wide WORLD SCALE — "" / "auto" derives each location's scale from its occupants;
  // "A"/"B"/"C" forces every location's plate to render at that scale (e.g. a bug's-world film).
  const setWorldScale = (cls)=> setProject(p=>({ ...p, worldScale: String(cls||"") }));
  const setStyleRefs = (refs)=> setProject(p=>({ ...p, styleBible:{ ...((p.styleBible)||{}), refs:String(refs||"") } }));
  // uploaded reference images (palette sampled client-side); capped to keep state light
  const addStyleRefImages = (imgs)=> setProject(p=>{ const sb=(p.styleBible)||{};
    return { ...p, styleBible:{ ...sb, refImages:[...(sb.refImages||[]), ...(imgs||[])].slice(0,8) } }; });
  const removeStyleRefImage = (id)=> setProject(p=>{ const sb=(p.styleBible)||{};
    return { ...p, styleBible:{ ...sb, refImages:(sb.refImages||[]).filter(r=>r.id!==id) } }; });
  // manual per-scene preset override (presetId null = unassign). Note: re-running
  // "Assign from script" re-color-scripts every scene and will overwrite these.
  const setScenePreset = (sceneId, presetId)=> setProject(p=>{
    const sb = (p.styleBible)||{};
    const sceneStyles = {...(sb.sceneStyles||{})};
    if(presetId) sceneStyles[sceneId] = presetId; else delete sceneStyles[sceneId];
    return {...p, styleBible:{ ...sb, sceneStyles }};
  });

  // ---- Art Room: SHOT LIST ----
  // A shot = one beat. "Draft all shots" derives the shot breakdown for every scene
  // that doesn't have one yet (non-destructive); per-scene re-draft replaces one scene.
  const updateShot = (id,patch)=> setShots(ss=>ss.map(s=>s.id===id?{...s,...patch}:s));
  const deleteShot = (id)=>{ setShots(ss=>ss.filter(s=>s.id!==id)); try{ if(typeof nbClearAsset==="function") nbClearAsset(id); }catch(e){} };

  // ── Phase 2: line audio = the cut clock ──────────────────────────────────────
  // Render a shot's dialogue through its speaker's LOCKED voice; the MEASURED
  // duration becomes the shot's `dur`, which re-clocks the Stage automatically
  // (shotDur prefers dur → sceneSequences / cut-rhythm / runtime all re-partition).
  const [voicingLines, setVoicingLines] = React.useState(null);   // {done,total} during the batch
  const voicingCancel = React.useRef(false);
  const cancelVoiceAll = ()=>{ voicingCancel.current = true; };
  const resolveLineSpeaker = (shot)=>{
    const scene = scenes.find(s=>s.id===shot.sceneId);
    /* the SCREENPLAY names the speaker (the character cue above the line) — trust it
       before any in-frame heuristic, so a two-hander never renders A's line in B's
       voice. Returned even without a voiceLock: the "lock a voice for X" error must
       name the character who actually speaks. */
    if(scene && typeof stageDialogueSpeaker==="function"){
      try{
        const charById = {}; characters.forEach(c=>{ charById[c.id]=c; });
        const sp = stageDialogueSpeaker(scene, drafts, beatsMap, shot, { characters, charById });
        if(sp && sp.id && charById[sp.id]) return charById[sp.id];
      }catch(e){}
    }
    const ids = (typeof inFrameCast==="function") ? inFrameCast(shot, scene, characters) : (shot.subjects||[]);
    const inFrame = (ids||[]).map(id=>characters.find(c=>c.id===id)).filter(Boolean);
    const hasVoice = (c)=> !!(c && c.voiceLock && c.voiceLock.voiceId);
    return inFrame.find(hasVoice)
        || (scene && characters.find(c=>c.id===scene.driver && hasVoice(c)))
        || inFrame[0] || (scene && characters.find(c=>c.id===scene.driver)) || null;
  };
  const voiceOneLine = async (shot)=>{
    const text = String(shot.dialogue||"").trim();
    if(!text) return { skipped:true };
    const spk = resolveLineSpeaker(shot);
    if(!spk || !spk.voiceLock || !spk.voiceLock.voiceId)
      throw new Error("No locked voice for "+((spk&&spk.name)||"the speaker")+" — lock one on their character card: The Art Room → Characters tab → the Voice button.");
    const r = await window.elGenerate(shot.id, text, { voiceId:spk.voiceLock.voiceId, settings:spk.voiceLock.defaults,
      modelId:(typeof window.vgDeliveryModelOf==="function") ? window.vgDeliveryModelOf(spk.voiceLock) : (spk.voiceLock.modelId||window.VG_TTS_MODEL) });
    const durSec = Math.max(0.6, Math.round(((r.durationMs||0)/1000 + 0.4)*10)/10);   // measured + lead/tail pad
    updateShot(shot.id, { dur:durSec, lineAudio:{ durationMs:r.durationMs||0, voiceId:spk.voiceLock.voiceId,
      speakerId:spk.id, speaker:spk.name, text,
      hash:(typeof window.vgHash==="function" ? window.vgHash(text, spk.voiceLock.voiceId, spk.voiceLock.defaults) : "") } });
    return { ok:true, durSec, cached:r.cached };
  };
  const voiceLine = async (shot)=>{
    try{ const r = await voiceOneLine(shot); if(r && r.ok && !r.cached && typeof window.appToast==="function") window.appToast("Voiced — "+r.durSec+"s","success"); }
    catch(e){ if(typeof window.appToast==="function") window.appToast(String((e&&e.message)||"Voice render failed."),"error"); }
  };
  const voiceAllLines = async ()=>{
    const lines = shots.filter(s=>String(s.dialogue||"").trim());
    if(!lines.length){ if(typeof window.appToast==="function") window.appToast("No dialogue lines to voice yet."); return; }
    voicingCancel.current=false; setVoicingLines({ done:0, total:lines.length });
    let failed=0;
    for(let i=0;i<lines.length;i++){
      if(voicingCancel.current) break;
      try{ await voiceOneLine(lines[i]); }catch(e){ failed++; }
      setVoicingLines({ done:i+1, total:lines.length });
    }
    setVoicingLines(null);
    if(failed && typeof window.appToast==="function") window.appToast(failed+" line"+(failed>1?"s":"")+" couldn't be voiced — check those characters have a locked voice.","error");
  };
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
      const raw = await aiDraftShots(scene, beatsMap, drafts, locations, props, characters, lbProject("shots"));
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
  const [theme, setThemeState] = React.useState(()=>{ try{ return localStorage.getItem("turn-theme")||"light"; }catch(e){ return "light"; } });
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
  const labelOf = (v)=> !v ? null : v.edited ? "Manual edit" : v.polished ? "MUSE polish" : (v.ai ? "MUSE draft" : (v.auto ? "Structural draft" : "Original draft"));
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

  // estimated screen time per scene (≈1 page/min) — drives the spine's pacing readout.
  // "hot" marks scenes that run long against the film's average (the heat signal).
  const runtimeMap = {}; let runtimeTotal = 0;
  if(typeof sceneRuntime==="function") scenes.forEach(s=>{
    const r = sceneRuntime(s, drafts[s.id], beatsMap[s.id]);
    runtimeMap[s.id] = r; runtimeTotal += r.sec;
  });
  const rtAvg = scenes.length ? runtimeTotal/scenes.length : 0;
  Object.values(runtimeMap).forEach(r=>{ r.hot = rtAvg>0 && r.sec > rtAvg*1.75; });

  // ---- editing handlers (scenes + beats) ----
  const [recastBusy, setRecastBusy] = React.useState(null);   // {no, name} while a driver recast runs
  /* DRIVER CHANGED → the labels sync instantly, but the scene's summary, desire
     and beat TEXTS still describe the old driver (prose can't follow a dropdown).
     Offer to RECAST the scene's subtext for the new driver; the screenplay is
     then rebuilt with "Redraft script from beats" so nothing rewrites unseen. */
  const _offerDriverRecast = async (sceneId, oldId, newId)=>{
    const scn = scenes.find(s=>s.id===sceneId); if(!scn) return;
    const b = beatsMap[sceneId];
    if(!b || !b.rows || !b.rows.length) return;
    if(typeof window.aiRecastDriver!=="function" || !(typeof aiAvailable==="function" && aiAvailable())) return;
    const nameOf = (cid)=>(((characters||[]).find(c=>c.id===cid)||{}).name || String(cid||"").toUpperCase());
    const OLD = nameOf(oldId), NEW = nameOf(newId);
    const ok = await window.appConfirm({ title:"Recast the scene for "+NEW+"?",
      body:"The driver changed ("+OLD+" \u2192 "+NEW+"), but Scene "+scn.no+"\u2019s summary, desire and beat texts still describe "+OLD+" doing the driving. Rewrite the subtext so "+NEW+" drives? You review the beats, then \u2018Redraft script from beats\u2019 rebuilds the screenplay.",
      confirmLabel:"Recast for "+NEW, cancelLabel:"Keep the text as is" });
    if(!ok) return;
    setRecastBusy({ no:scn.no, name:NEW });
    try{
      const res = await window.aiRecastDriver(scn, b, characters, newId, oldId);
      if(res){
        updateScene(sceneId, { ...(res.summary?{summary:res.summary}:{}), ...(res.objective?{objective:res.objective}:{}) });
        setBeatsMap(m=>{ const cur=m[sceneId]||b; return { ...m, [sceneId]:{ ...cur, driverLabel:NEW,
          desire:res.desire||cur.desire, obstacle:res.obstacle||cur.obstacle, rows:res.rows||cur.rows } }; });
        if(typeof window.appToast==="function")
          window.appToast("Scene "+scn.no+" recast for "+NEW+" \u2014 review the beats, then \u2018Redraft script from beats\u2019 to rebuild the screenplay.","ok");
      } else if(typeof window.appToast==="function")
        window.appToast("Couldn\u2019t recast the scene \u2014 the writing model may be unreachable.","error");
    }catch(e){ if(typeof window.appToast==="function") window.appToast("Couldn\u2019t recast: "+((e&&e.message)||"error"),"error"); }
    setRecastBusy(null);
  };
  const updateScene = (id,patch)=>{
    const before = patch.driver ? ((scenes.find(s=>s.id===id)||{}).driver) : null;
    setScenes(ss=>ss.map(s=>s.id===id?{...s,...patch}:s));
    // the Beats tab's DRIVER label is a stored string — changing the scene's
    // driver used to leave it (and the beat-card name columns) showing the old
    // character, which read as "my edit did nothing". Keep it in step.
    if(patch.driver){
      const nm = ((characters||[]).find(c=>c.id===patch.driver)||{}).name;
      if(nm) setBeatsMap(m=>{ const b=m[id]; return b ? { ...m, [id]:{ ...b, driverLabel:nm } } : m; });
      // and offer the content recast (fire-and-forget; confirm-gated, spends one text call)
      if(before && before!==patch.driver) _offerDriverRecast(id, before, patch.driver);
    }
  };
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
        if(model.project.title && project && model.project.title !== project.title){
          setProps([]); setPropsSeeded(false); setVisualsSeeded(false);
          // keep the cloud ROW title in step with the film's new title, so the
          // switcher doesn't keep saying "Untitled film" after a build
          if(cloudMode && currentProjectId){
            cloudRenameProject(currentProjectId, model.project.title);
            setProjects(ps=>ps.map(pr=>pr.id===currentProjectId?{...pr, title:model.project.title}:pr));
          }
        }
        setProject({...model.project});
      }
      setBeatsMap({...model.beats});
      setDrafts({...model.drafts});
      setContinuityMap(Object.fromEntries(Object.entries(model.continuity).map(([k,v])=>[k,{...v}])));
    };
    return { model, sync, input, emit, propose, cancelled,
      project, facts:FACTS,
      // read-only copies of the Art-Room bibles + gated patchers, for agents that
      // cross-check the script against props/locations (Consistency Check). Patches
      // apply immediately — call them only AFTER a propose() card is approved.
      bible:{
        props: props.map(p=>({...p})),
        locations: locations.map(l=>({...l})),
        shots: (shots||[]).map(s=>({...s})),
        patchProp:(id,patch)=> setProps(ps=>ps.map(p=>p.id===id?{...p,...patch}:p)),
        patchLocation:(id,patch)=> setLocations(ls=>ls.map(l=>l.id===id?{...l,...patch}:l)),
      },
      ai:{ available: (typeof aiAvailable==="function" && aiAvailable()),
        suggestTurn:(s,p)=>window.aiSuggestTurn(s,p),
        plantLine:(s,f,m)=>window.aiPlantLine(s,f,m),
        tableRead:(sc,dr)=>window.aiTableRead(sc,dr),
        voiceCheck:(sc,dr)=>window.aiVoiceCheck(sc,dr),
        buildSpine:(b)=>window.aiBuildSpine(b, (project&&project.format)||"film", (project&&project.framework)||"threeact"),
        buildStoryWorld:(b,sp)=>window.aiBuildStoryWorld(b,sp),
        authorScene:(s,p)=>window.aiAuthorScene(s,p,model.characters),
        draftScene:(s,b,p)=>window.aiDraftScene(s,b,p),
      } };
  };

  // ---- Storyboard Director (Art Room) — a SEPARATE ctx surface: storyboard pages +
  // two tools (writing-model director notes, GPT Image 2 sheet render). It never touches
  // ctx.model / sync(): image commits live in the asset store, not the scene/beats undo
  // snapshot (reversal is per-sheet via the Storyboard card menu). Mirrors StoryboardView's
  // page derivation so the slot ids ("sbsheet-"+pageId) match the live tab. ----
  // Scene Director — the visual ctx (docs/Scene Director Agent Plan.md §8): the
  // scene groups with their shots + resolution ctx, frame reads, the headless
  // generation primitive, and the vision QC. Scoped to one scene when launched
  // from a scene group's "Direct scene", or the whole film from the header.
  const sceneDirectorCtxFactory = ({ emit, propose, cancelled })=>{
    const ordered = scenes.slice().sort((a,b)=>(a.no||0)-(b.no||0));
    const charById = {}; characters.forEach(c=>{ charById[c.id]=c; });
    const propById = {}; props.forEach(p=>{ propById[p.id]=p; });
    const byScene = {}; (shots||[]).forEach(s=>{ (byScene[s.sceneId]=byScene[s.sceneId]||[]).push(s); });
    Object.values(byScene).forEach(a=>a.sort((x,y)=>(x.order||0)-(y.order||0) || (x.beatN||0)-(y.beatN||0)));
    const target = (sceneDirLaunch && sceneDirLaunch.sceneId)
      ? ordered.filter(s=>s.id===sceneDirLaunch.sceneId) : ordered;
    const groups = target.filter(s=>(byScene[s.id]||[]).length).map(scene=>({
      scene, shots:byScene[scene.id],
      ctx:{ scene, location:(typeof locationForScene==="function")?locationForScene(locations,scene.id):null,
        charById, propById, project } }));
    return { emit, propose, cancelled, sync:()=>{},
      ai:{ available: typeof aiAvailable==="function" && aiAvailable() },
      art:{
        scenes: groups,
        frameOf: async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
          if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; },
        shotFrame: (sh, sceneShots, sctx, o)=> window.generateShotFrame(sh, sceneShots, sctx, o),
        qc: (sh, frameUrl, anchorUrl)=> window.aiQcShotFrame(sh, frameUrl, anchorUrl),
      } };
  };

  const artAgentCtxFactory = ({ input, emit, propose, cancelled, agentName, force })=>{
    const ordered = scenes.slice().sort((a,b)=>(a.no||0)-(b.no||0));
    const charById = {}; characters.forEach(c=>{ charById[c.id]=c; });
    const propById = {}; props.forEach(p=>{ propById[p.id]=p; });
    const shotsByScene = {};
    (shots||[]).forEach(s=>{ (shotsByScene[s.sceneId]=shotsByScene[s.sceneId]||[]).push(s); });
    Object.values(shotsByScene).forEach(arr=>arr.sort((a,b)=>(a.order||0)-(b.order||0) || (a.beatN||0)-(b.beatN||0)));
    const ctxFor = (scene)=>({ scene,
      location:(typeof locationForScene==="function")?locationForScene(locations,scene.id):null,
      charById, propById, project });

    // Storyboards are fixed to 2×2 sheets, so the Director lands in the same slots
    // as the visible Storyboards tab.
    const SB = 4;
    const sbGrid = "2x2";
    const chunk = (arr,n)=>{ const o=[]; for(let i=0;i<(arr||[]).length;i+=n) o.push(arr.slice(i,i+n)); return o; };
    const pages = [];
    ordered.filter(s=>(shotsByScene[s.id]||[]).length).forEach(scene=>{
      const groups = chunk(shotsByScene[scene.id]||[], SB);
      groups.forEach((chunkShots,index)=> pages.push({
        scene, index, pageCount:groups.length, grid:sbGrid,
        pageId:"sbpage-"+scene.id+(sbGrid==="2x2"?"-2x2":"")+"-"+index, shots:chunkShots, ctxFor:ctxFor(scene) }));
    });

    const GPT2 = (window.NB_MODELS||[]).find(m=>/gpt-image/i.test(m.id));

    // own-scene reference set (location plate + N character sheets). When the previous
    // scene's sheet is chained in (cap=1) it already carries the cast, so we keep this
    // leaner; on the first scene (cap=3) it does all the identity-locking.
    const gatherSheetRefs = async (page, cap)=>{
      const grab = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
        if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; };
      const out=[], seen=new Set(); let nch=0; const c=page.ctxFor;
      if(c.location){ const u=await grab(c.location.id); if(u) out.push({url:u, note:(c.location.name||"location")+" plate"}); }
      for(const sh of (page.shots||[])){ if(nch>=cap) break;
        for(const id of (sh.subjects||[])){ if(nch>=cap||seen.has(id)) continue; seen.add(id);
          const ch=charById[id]; if(!ch) continue; const u=await grab(id); if(u){ out.push({url:u, note:ch.name+" sheet"}); nch++; } } }
      return out;
    };

    // ---- Shot Designer (Shot List agent) — coverage audit/design on a per-run WORKING
    // copy of shots (like Story Doctor's ctx.model); each approval also pushes to real state.
    let _workShots = (shots||[]).map(s=>({...s}));
    const _WIDE = new Set(["EWS","WS","FS","MWS"]);
    const _shotsOf = (sid)=> _workShots.filter(s=>s.sceneId===sid).slice().sort((a,b)=>(a.order||0)-(b.order||0)||(a.beatN||0)-(b.beatN||0));
    const coverage = {
      audit: ()=> (typeof auditCoverage==="function") ? auditCoverage(ordered, _workShots, beatsMap) : [],
      sceneById: (id)=> ordered.find(s=>s.id===id),
      shotsOf: _shotsOf,
      pickAnchor: (arr)=>{ const w=(arr||[]).find(s=>_WIDE.has(s.size)); return ((w||(arr||[])[0])||{}).id; },
      grammarList: (arr, anchorId, turnAt)=> (arr||[]).map((s,i)=> (i+1)+". "+((typeof shotGrammarLabel==="function")?shotGrammarLabel(s):s.size)
        + (i===0?"  ◆ chain head":"") + ((turnAt&&s.beatN===turnAt)?"  ← lands the turn":"")),
      turnAtOf: (sid)=> ((beatsMap||{})[sid]||{}).turnAt,
      draftCoverage: async (scene)=>{ if(typeof aiDraftShots!=="function" || typeof normalizeShot!=="function") return null;
        const raw = await aiDraftShots(scene, beatsMap, drafts, locations, props, characters, lbProject("shots"));
        return (raw && raw.length) ? raw.map((r,i)=>normalizeShot(r, scene, i, locations, props, characters, beatsMap)) : null; },
      applyCoverage: (sceneId, newShots, anchorId)=>{
        // chain model: the head is the FIRST shot in order, so coverage shots carry no
        // explicit .anchor (that flag now means a manual fresh-start / chain break).
        const fresh = (newShots||[]).map(s=>({...s, anchor:false}));
        _workShots = _workShots.filter(s=>s.sceneId!==sceneId).concat(fresh);
        setShots(ss=> ss.filter(s=>s.sceneId!==sceneId).concat(fresh.map(s=>({...s})))); },
      setAnchorOnly: (sceneId, anchorId)=>{
        _workShots = _workShots.map(s=> s.sceneId===sceneId ? {...s, anchor:s.id===anchorId} : s);
        setShots(ss=> ss.map(s=> s.sceneId===sceneId ? {...s, anchor:s.id===anchorId} : s)); },
    };

    // ---- Casting Director (Characters agent) — draft spec, suggest states, and headless
    // generation of master sheets + appearance-state variants. Mutates `characters` state via
    // updateCharacter; commits images to the asset store + dispatches nb-gen-done (nbCommit won't).
    const _grabImg = async (id)=>{ let u=(typeof nbGetImage==="function")?nbGetImage(id):"";
      if(!u && typeof nbLoadImage==="function"){ try{ u=await nbLoadImage(id); }catch(e){} } return u; };
    const _cameoOf = async (cid)=>{ let a=[]; if(typeof nbGetCameoAngles==="function"){ try{ a=nbGetCameoAngles(cid)||[]; }catch(e){} }
      if(!a.length && typeof nbLoadCameoAngles==="function"){ try{ a=await nbLoadCameoAngles(cid)||[]; }catch(e){} } return a||[]; };
    // Use the SAME image model the master sheet was made with (from its meta) so a variant matches
    // it; else prefer GPT Image 2 (best identity-lock + what the cast masters use, and it avoids the
    // Google models' "no image" safety refusals on injury/blood states); else the current model.
    const _gpt2m = (window.NB_MODELS||[]).find(m=>/gpt-image/i.test(m.id));
    const _modelFor = (c)=>{ const m=(typeof nbGetMeta==="function")?nbGetMeta(c.id):null;
      return (m&&m.modelId) || (_gpt2m&&_gpt2m.id) || ((typeof nbGetModel==="function")?nbGetModel():undefined); };
    const _genCharImage = async (slotId, prompt, opts)=>{
      const gopts = { aspectRatio:"16:9", ...(opts||{}) };
      let url;
      try{ url = await window.nbGenerate(prompt, gopts); }
      catch(e){ if(/no image/i.test(String((e&&e.message)||e))){ url = await window.nbGenerate(prompt, gopts); } else throw e; }
      const meta = { modelId: gopts.model || ((typeof nbGetModel==="function")?nbGetModel():undefined), aspect:"16:9",
        iso:new Date().toISOString(), prompt, agent:"Casting Director" };
      const kind = (typeof slotAssetKind==="function") ? slotAssetKind("charref-"+slotId) : "character";
      await window.nbCommit(slotId, url, meta, [], kind);
      try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:slotId, url } })); }catch(e){}
      return url;
    };
    const cast = {
      list: (characters||[]).slice(),
      isDrafted: (c)=> (typeof charVisualsDrafted==="function") ? charVisualsDrafted(c) : true,
      imageOf: async (id)=> _grabImg(id),
      draftSpec: async (c)=>{ if(typeof aiCharacterVisuals!=="function") return null;
        const patch = await aiCharacterVisuals(c, scenes.filter(s=>s.driver===c.id), lbProject("characters"), { scenes, drafts });
        if(patch){ updateCharacter(c.id, patch); markApplied("characters"); } return patch; },
      suggestStates: async (c)=>{ if(typeof aiSuggestStates!=="function") return null;
        const raw = await aiSuggestStates(c, scenes.filter(s=>s.driver===c.id), project);
        if(!raw || !raw.length) return null;
        const existing = c.states||[]; const have=new Set(existing.map(s=>(s.label||"").trim().toLowerCase()));
        const adds = raw.filter(s=>!have.has((s.label||"").trim().toLowerCase()))
          .map((s,i)=> s.id ? s : {...s, id:"st-"+Date.now().toString(36)+"-"+i});
        const merged = adds.length ? [...existing, ...adds] : existing;
        if(adds.length) updateCharacter(c.id, { states: merged });
        return merged; },
      generateMaster: async (c)=>{
        let prompt = (typeof combinedImagePrompt==="function") ? combinedImagePrompt(c, project, props) : "";
        const refs=[];
        for(const p of (props||[]).filter(p=>p.ownerId===c.id && p.kind!=="carried")){ const u=await _grabImg(p.id); if(u) refs.push(u); }
        const cameo = await _cameoOf(c.id);
        if(refs.length) prompt += " The additional prop reference image(s) show items this character wears/carries — match them EXACTLY.";
        if(cameo.length) prompt += " Keep the FACE, bone structure and skin tone identical to the locked-likeness reference; only wardrobe and condition change.";
        const extra=[...refs, ...cameo];
        return _genCharImage(c.id, prompt, { model:_modelFor(c), ...(extra.length?{ extraImages:extra }:{}) }); },
      generateState: async (c, st, baseUrl)=>{
        const base = (typeof combinedImagePrompt==="function") ? combinedImagePrompt(c, project, props) : "";
        const prompt = base + " APPEARANCE STATE — "+(st.label||"variant")+": "+(st.change||"")
          + ". Render the character in THIS changed state consistently across every panel, keeping the EXACT same face, hair, skin tone and body as the reference; only the described change differs.";
        const cameo = await _cameoOf(c.id);
        const opts = { model:_modelFor(c) };
        if(baseUrl) opts.referenceImage = baseUrl;
        if(cameo.length) opts.extraImages = cameo;
        return _genCharImage(c.id+":"+st.id, prompt, opts); },
      // worn props of this character that ALREADY have a generated sheet — the trigger for
      // the Coordinator's "wear props" pass (re-generate the master so it wears them exactly).
      wornPropsWithSheets: async (c)=>{
        const worn = (props||[]).filter(p=>p && p.ownerId===c.id && p.kind!=="carried");
        const out=[]; for(const p of worn){ const u=await _grabImg(p.id); if(u) out.push(p); }
        return out; },
    };

    // ---- Props Master surface (Props tab agent): derive → draft → dedup → generate ----
    // Works on a per-run copy of the props so each step sees the prior step's result
    // (React state is async); every step also persists via setProps so the live tab updates.
    let _propWork = (props||[]).slice();
    const _propDrafted = (p)=> (typeof propVisualsDrafted==="function") ? propVisualsDrafted(p)
      : !!((p.form||"").trim() && (p.material||"").trim());
    // merge a duplicate set on BOTH the working copy and the live state (mirrors app-level mergeProps)
    const _mergePropsWork = (ids)=>{
      const set = _propWork.filter(p=> ids.indexOf(p.id)>=0);
      if(set.length<2) return;
      const hasImg = (id)=> (typeof nbGetImage==="function") ? !!nbGetImage(id) : false;
      const score = (p)=> ((p.scenes||[]).length*100) + (hasImg(p.id)?40:0) + Math.min((p.name||"").length,30);
      const survivor = set.slice().sort((a,b)=> score(b)-score(a))[0];
      const others = set.filter(p=>p.id!==survivor.id);
      const anyScenes = set.some(p=>p.scenes!==undefined);
      const patch = {};
      if(anyScenes) patch.scenes = Array.from(new Set(set.flatMap(p=>p.scenes||[])));
      ["form","material","detail","renderStyle"].forEach(f=>{
        if(!String(survivor[f]||"").trim()){ const donor = others.find(o=>String(o[f]||"").trim()); if(donor) patch[f]=donor[f]; }
      });
      const apply = (ps)=> ps.map(p=> p.id===survivor.id ? {...p, ...patch} : p).filter(p=> p.id===survivor.id || ids.indexOf(p.id)<0);
      _propWork = apply(_propWork);
      setProps(apply);
      others.forEach(o=>{ try{ if(typeof nbClearAsset==="function") nbClearAsset(o.id); }catch(e){} });
    };
    const propmaster = {
      // pull the cast's own worn/carried items in (dedup handled by propsFromCast)
      deriveCast: ()=>{
        if(typeof propsFromCast!=="function") return 0;
        const add = propsFromCast(characters, _propWork, scenes, drafts);
        if(add.length){ _propWork = [..._propWork, ...add]; setProps(ps=>[...ps, ...add]); setPropsSeeded(true); }
        return add.length;
      },
      // derive set-dressing objects named in the action (no owner), deduped vs existing by object
      deriveSet: async ()=>{
        if(typeof aiDeriveSetDressing!=="function") return 0;
        const found = await aiDeriveSetDressing(scenes, drafts, project);
        if(!found || !found.length) return 0;
        const headOf = (n)=> (typeof propHeadNoun==="function" ? propHeadNoun(n) : "")
          || ("name:"+String(n||"").toLowerCase().replace(/[^a-z0-9]+/g,"-"));
        const seen = new Set(_propWork.map(p=>headOf(p.name)));   // skip an object the cast (or a prior card) already owns
        const slug = (n)=> (typeof propSlug==="function") ? propSlug(n) : String(n||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40);
        const cards = [];
        // fixture-of link: ownerless set dressing whose scenes ALL resolve to one location
        // belongs to that location (it renders into the location plate); an object whose
        // scenes span locations is mobile — likely hand-carried — so it is NOT pinned.
        const locIdOf = (sid)=>{ const L=(typeof locationForScene==="function")?locationForScene(locations, sid):null; return L?L.id:""; };
        found.forEach((e,i)=>{
          const h = headOf(e.name); if(seen.has(h)) return; seen.add(h);
          const locIds = Array.from(new Set((e.sceneIds||[]).map(locIdOf).filter(Boolean)));
          // these come from the ACTION with no owner: fixture nouns (and anything pinned
          // to one place) are SET DRESSING; only clearly handheld/mobile stays carried
          const kind = (typeof classifyPropKind==="function" && classifyPropKind(e.name, { ownerless:true }))
            || (locIds.length===1 ? "dressing" : "carried");
          cards.push({ id:"prop-set-"+slug(e.name)+"-"+i, name:e.name.replace(/^\w/, m=>m.toUpperCase()),
            kind, ownerId:"", ownerName:"", form:"", material:"", detail:"", renderStyle:"", negativePrompt:"",
            scenes:e.sceneIds||[], fromSet:true, locationId:(locIds.length===1?locIds[0]:"") });
        });
        if(cards.length){ _propWork = [..._propWork, ...cards]; setProps(ps=>[...ps, ...cards]); }
        return cards.length;
      },
      // draft form/material/detail/renderStyle for every undrafted prop
      draftSpecs: async (force)=>{
        if(typeof aiDesignPropBible!=="function") return 0;
        const todo = _propWork.filter(p=>force || !_propDrafted(p));
        if(!todo.length) return 0;
        const map = await aiDesignPropBible(todo, characters, lbProject("props"));
        if(!map) return 0;
        const patch = (ps)=> ps.map(p=> map[p.id] ? {...p, ...map[p.id]} : p);
        _propWork = patch(_propWork); setProps(patch);
        return Object.keys(map).length;
      },
      // merge near-duplicate cards (same owner + same object) into one; returns # removed
      dedup: ()=>{
        if(typeof findDuplicateProps!=="function") return 0;
        const groups = findDuplicateProps(_propWork);
        let merged = 0;
        Object.keys(groups).forEach(k=>{ const ids = groups[k]; if(ids && ids.length>1){ _mergePropsWork(ids); merged += ids.length-1; } });
        return merged;
      },
      // drafted props that still need a sheet
      toGenerate: async (force)=>{
        const out=[];
        for(const p of _propWork){ if(!_propDrafted(p)) continue; if(!force && await _grabImg(p.id)) continue; out.push(p); }
        return out;
      },
      generateSheet: async (p)=>{
        if(typeof window.generatePropSheet!=="function") throw new Error("prop generator unavailable");
        return window.generatePropSheet(p, project);
      },
    };

    // ---- Location Scout surface (Locations tab agent): pull → coverage → spec → staging → variants → generate ----
    let _locWork = (locations||[]).slice();
    const _locDrafted = (l)=> (typeof locVisualsDrafted==="function") ? locVisualsDrafted(l)
      : !!((l.architecture||"").trim() && (l.lighting||"").trim());
    const locscout = {
      // pull places from the sluglines (new cards), and refresh scene lists / times on existing
      pull: ()=>{
        if(typeof deriveLocations!=="function") return 0;
        const derived = deriveLocations(scenes, _locWork, drafts);          // new only
        const fresh = deriveLocations(scenes, [], drafts);                  // all, to refresh scene lists/times/areas
        let next = _locWork.map(l=>{ const m=fresh.find(f=>f.key===l.key);
          return m ? {...l, scenes:m.scenes, times:[...new Set([...(l.times||[]),...m.times])], areas:[...new Set([...(l.areas||[]),...m.areas])]} : l; });
        if(derived.length) next = [...next, ...derived];
        _locWork = next; setLocations(next); setLocsSeeded(true);
        return derived.length;
      },
      coverage: ()=> (typeof locationCoverage==="function") ? locationCoverage(scenes, _locWork) : [],
      draftSpecs: async (force)=>{
        if(typeof aiDesignLocationBible!=="function") return 0;
        const todo = _locWork.filter(l=>force || !_locDrafted(l));
        if(!todo.length) return 0;
        const map = await aiDesignLocationBible(todo, scenes, lbProject("locations"));
        if(!map) return 0;
        const patch = (ls)=> ls.map(l=> map[l.id] ? {...l, ...map[l.id]} : l);
        _locWork = patch(_locWork); setLocations(patch);
        return Object.keys(map).length;
      },
      draftStaging: async ()=>{
        if(typeof aiDraftStaging!=="function") return 0;
        // Depth grids earn their model call on locations the film REVISITS (2+ scenes),
        // where cross-scene geometric continuity matters. Single-scene places generate
        // fine from their prose spec; skip them here (the card's "Draft staging" button
        // still stages any one location on demand).
        const todo = _locWork.filter(l=>_locDrafted(l) && !l.staging && (l.scenes||[]).length>=2);
        if(!todo.length) return 0;
        const res = await Promise.all(todo.map(async l=>{ try{ return {id:l.id, staging: await aiDraftStaging(l, scenes, project)}; }catch(e){ return {id:l.id, staging:null}; } }));
        const sMap={}; res.forEach(x=>{ if(x.staging) sMap[x.id]=x.staging; });
        if(!Object.keys(sMap).length) return 0;
        const patch = (ls)=> ls.map(l=> sMap[l.id] ? {...l, staging:sMap[l.id]} : l);
        _locWork = patch(_locWork); setLocations(patch);
        return Object.keys(sMap).length;
      },
      // add a variant for each extra time-of-day a place appears at (times[0] is the base plate)
      addVariants: ()=>{
        let added=0;
        const stamp = Date.now().toString(36);
        const patch = (ls)=> ls.map(l=>{
          const times = (typeof deriveLocationTimes==="function") ? deriveLocationTimes(l, scenes) : (l.times||[]);
          if(times.length<2) return l;
          const have = new Set((l.variants||[]).map(v=>v.time));
          const need = times.slice(1).filter(t=>!have.has(t));
          if(!need.length) return l;
          const adds = need.map((t,i)=>({ id:"v"+stamp+"-"+(added+i)+"-"+t.toLowerCase().replace(/[^a-z0-9]/g,""), time:t }));
          added += adds.length;
          return {...l, variants:[...(l.variants||[]), ...adds]};
        });
        const next = patch(_locWork); _locWork = next; if(added) setLocations(next);
        return added;
      },
      toGeneratePlates: async (force)=>{
        const out=[];
        for(const l of _locWork){ if(!_locDrafted(l)) continue; if(!force && await _grabImg(l.id)) continue; out.push(l); }
        return out;
      },
      toGenerateVariants: async (force)=>{
        const out=[];
        for(const l of _locWork){ if(!_locDrafted(l)) continue;
          for(const v of (l.variants||[])){ if(!force && await _grabImg(l.id+"-"+v.id)) continue; out.push({l, v}); } }
        return out;
      },
      generatePlate: async (l)=>{ if(typeof window.generateLocationPlate!=="function") throw new Error("plate generator unavailable"); return window.generateLocationPlate(l, project); },
      generateVariant: async (l, v)=>{ if(typeof window.generateLocationVariant!=="function") throw new Error("variant generator unavailable"); return window.generateLocationVariant(l, v, project); },
    };

    // ---- Visual Researcher surface (Lookbook tab agent): research-only.
    // Frame rendering is the explicit "Generate all frames" button in the Lookbook.
    let _lbWork = (typeof dedupeLookbookCards==="function") ? dedupeLookbookCards(lookbook||[]) : (lookbook||[]).slice();
    const lookbookSurface = {
      // write the visual statement + reference touchstones, then write them through to the
      // Colorist's references (project.styleBible.refs) so the look propagates downstream.
      research: async ()=>{
        if(typeof window.aiResearchLookbook!=="function") return { statement:"", added:0 };
        // pass the existing cards so a re-run targets the GAPS (missing categories)
        // instead of re-proposing the same six photographic touchstones
        const r = await window.aiResearchLookbook(scenes, project, _lbWork);
        if(!r) return { statement:"", added:0 };
        // keep an existing statement — a gap-filling re-run shouldn't rewrite the north star
        if(r.statement && !(lookbookNote||"").trim()) setLookbookNote(r.statement);
        const slug = (s)=> String(s||"").toLowerCase().replace(/\([^)]*\)/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
        const keyOf = (e)=> (typeof lookbookSourceKey==="function") ? lookbookSourceKey(e) : slug(e&&e.source);
        const seen = new Set(_lbWork.map(c=>keyOf(c)));
        let cards = [];
        (r.refs||[]).forEach((e,i)=>{
          const key = keyOf(e);
          if(!e.source || !key || seen.has(key)) return;
          seen.add(key);
          cards.push({ id:"look-"+slug(e.source).slice(0,24)+"-"+i, source:e.source, category:e.category||"Palette", note:e.note||"", negativePrompt:"" });
        });
        // GROWTH GUARD — the brief is 8 touchstones covering the categories. A re-run
        // may only FILL GAPS (one card per still-missing category), never grow the
        // wall, whatever the model returns (bug 2026-07-16: re-runs stacked 48 cards).
        const _noted = _lbWork.filter(c=>(c.note||"").trim());
        if(_noted.length){
          const covered = new Set(_noted.map(c=>c.category));
          cards = cards.filter(c=>{ if(covered.has(c.category)) return false; covered.add(c.category); return true; });
        }
        if(cards.length){
          _lbWork = (typeof dedupeLookbookCards==="function") ? dedupeLookbookCards([..._lbWork, ...cards]) : [..._lbWork, ...cards];
          setLookbook(ls=> (typeof dedupeLookbookCards==="function") ? dedupeLookbookCards([...ls, ...cards]) : [...ls, ...cards]);
        } else if(typeof dedupeLookbookCards==="function" && _lbWork.length !== (lookbook||[]).length){
          setLookbook(_lbWork);
        }
        // No write-through: the Colorist reads the lookbook LIVE (see art.designStyles), so the
        // references propagate downstream without mutating the Styles tab's persisted data.
        return { statement:r.statement||"", added:cards.length, renderStyle:r.renderStyle||null };
      },
      // the current dominant style label (for the proposal card's "before" line)
      currentStyleLabel: ()=>{
        const tally = {};
        [...(characters||[]), ...(props||[]), ...(locations||[])].forEach(e=>{ const k=e&&e.renderStyleKey; if(k) tally[k]=(tally[k]||0)+1; });
        const keys = Object.keys(tally);
        if(!keys.length) return "defaults (photoreal)";
        const top = keys.sort((a,b)=>tally[b]-tally[a]);
        const lab = (k)=> String((window.RENDER_STYLE_LABELS||{})[k]||k).replace(/^[🔒🌐]\s*/,"");
        return top.length===1 ? lab(top[0]) : ("mixed — mostly "+lab(top[0]));
      },
      // APPROVED render-style proposal → set the style dropdown on EVERY character,
      // prop and location in one pass (the same write shapes the per-card pickers use);
      // per-card dropdowns remain the override afterwards.
      applyRenderStyle: (key)=>{
        const locText = (typeof window.renderStyleText==="function") ? window.renderStyleText("loc", key) : "";
        const propText = (typeof window.renderStyleText==="function") ? window.renderStyleText("prop", key) : "";
        setCharacters(cs=>cs.map(c=>({ ...c, renderStyleKey:key })));
        setProps(ps=>ps.map(p=>({ ...p, renderStyleKey:key, ...(propText?{renderStyle:propText}:{}) })));
        setLocations(ls=>ls.map(l=>({ ...l, renderStyleKey:key, ...(locText?{renderStyle:locText}:{}) })));
        return { characters:(characters||[]).length, props:(props||[]).length, locations:(locations||[]).length };
      },
      toGenerate: async ()=>{
        const out=[];
        const work = (typeof dedupeLookbookCards==="function") ? dedupeLookbookCards(_lbWork) : _lbWork;
        for(const c of work){ if(!lookbookCardDrafted(c)) continue; if(await _grabImg(c.id)) continue; out.push(c); }
        return out;
      },
      // repair plan for a lookbook that outgrew its brief (the pre-guard bug):
      // KEEP every hand-added card, every card with a rendered frame, and one noted
      // card per category; everything else (agent-added, unrendered, category already
      // covered) is excess. Applied ONLY behind the agent's approval card.
      trimPlan: async ()=>{
        const work = (typeof dedupeLookbookCards==="function") ? dedupeLookbookCards(_lbWork) : _lbWork.slice();
        const keepIds = new Set(), covered = new Set(), drop = [];
        for(const c of work){
          const rendered = !!(await _grabImg(c.id));
          if(c.manual || rendered){ keepIds.add(c.id); if((c.note||"").trim()) covered.add(c.category); }
        }
        work.forEach(c=>{
          if(keepIds.has(c.id)) return;
          if((c.note||"").trim() && !covered.has(c.category)){ covered.add(c.category); keepIds.add(c.id); return; }
          drop.push(c);
        });
        return { keep: work.filter(c=>keepIds.has(c.id)), drop };
      },
      applyTrim: (plan)=>{
        const dropIds = new Set(((plan&&plan.drop)||[]).map(c=>c.id));
        if(!dropIds.size) return 0;
        _lbWork = _lbWork.filter(c=>!dropIds.has(c.id));
        setLookbook(ls=> ls.filter(c=>!dropIds.has(c.id)));
        (plan.drop||[]).forEach(c=>{ try{ if(typeof nbClearAsset==="function") nbClearAsset(c.id); }catch(e){} });
        return dropIds.size;
      },
      generateFrame: async (c)=>{ if(typeof window.generateLookbookFrame!=="function") throw new Error("frame generator unavailable"); return window.generateLookbookFrame(c, project); },
    };

    const draftOnly = force==="draft";
    const forceImages = force===true;
    return { input, emit, propose, cancelled, project, force: forceImages,
      // "Re-draft only": re-draft every spec from the Lookbook but leave generated images alone
      draftOnly,
      ai:{ available: (typeof aiAvailable==="function" && aiAvailable()) },
      art:{
        pages,
        gpt2Available: !!GPT2,
        coverage,
        cast,
        propmaster,
        locscout,
        lookbook: lookbookSurface,
        markApplied: (dept)=> markApplied(dept),
        // ---- Cinematographer / Colorist tools (Style Bible agent) ----
        scenesLite: ordered.map(s=>({ id:s.id, no:s.no, title:s.title })),
        // the Colorist's references = the Presets refs field, which the write-through effect
        // keeps auto-filled from the Lookbook until the user takes it over — WYSIWYG: the
        // field is exactly what the Colorist reads.
        references: ()=>{ const sb=(typeof styleBibleOf==="function")?styleBibleOf(project):{};
          return { refs:(sb.refs||"").trim(), refImages:sb.refImages||[] }; },
        designStyles: async ()=>{ const sb=(typeof styleBibleOf==="function")?styleBibleOf(project):{};
          const seed=(sb.presets&&sb.presets.length)?sb.presets:(window.STYLE_PRESETS_DEFAULT||[]);
          return window.aiAssignSceneStyles(scenes, seed, drafts, project); },
        applyStyles: (res)=> applyStyleResult(res),
        // ---- Storyboard Director tools ----
        buildPrompt:(p)=> (typeof buildStoryboardPagePrompt==="function") ? buildStoryboardPagePrompt(p.scene, p.shots, {...(p.ctxFor||{}), _lookbookBrief:(typeof lookbookBriefFor==="function"?lookbookBriefFor("storyboard", lookbook, lookbookNote):"")}, beatsMap, { grid:p.grid }) : "",
        directorNotes:(p, priorMemo)=>{ const cf={...(p.ctxFor||{}), _lookbookBrief:(typeof lookbookBriefFor==="function"?lookbookBriefFor("storyboard", lookbook, lookbookNote):"")}; return window.aiDirectorNotes(p.scene, p.shots, beatsMap, ()=>cf, priorMemo); },
        // append the cross-scene continuity block to whatever prompt (LLM-optimized or deterministic)
        withContinuity:(prompt, memo, hasPrev)=>{
          let c = "";
          if(hasPrev) c += " CONTINUITY: the FIRST reference image is the PREVIOUS scene's storyboard sheet from this same film — keep the SAME characters (faces, hair, wardrobe), the same world and the same colour grade / rendering style so the whole storyboard reads as ONE continuous film.";
          if(memo) c += " ESTABLISHED SO FAR (keep consistent across scenes): "+memo;
          return prompt + c;
        },
        // render one sheet; prevSheetUrl (if any) leads the reference set as the continuity anchor
        renderSheet: async (p, prompt, prevSheetUrl)=>{
          const slotId = "sbsheet-"+p.pageId;
          // Keep the reference set MINIMAL — GPT Image 2 uses /images/edits when refs are
          // present, and each ref + "high" quality is what blows the ~150s proxy timeout.
          // When chained, the previous sheet already carries the cast, so 1 extra char
          // sheet is plenty. quality:"low" is the real timeout fix (size is fixed by aspect;
          // imageSize is ignored by the proxy for OpenAI). A board is a rough plan, not final art.
          const own = await gatherSheetRefs(p, prevSheetUrl ? 1 : 3);
          const refs = prevSheetUrl
            ? [{url:prevSheetUrl, note:"previous scene sheet"}, ...own]
            : own;
          const url = await window.nbGenerate(prompt, {
            model: GPT2?GPT2.id:undefined, aspectRatio:"16:9", quality:"low",
            extraImages: refs.map(r=>r.url) });
          const meta = { modelId: GPT2?GPT2.id:undefined, modelLabel: GPT2?GPT2.label:"", aspect:"16:9", quality:"low",
            iso:new Date().toISOString(), refCount:refs.length, prompt, agent:"Storyboard Director", chained:!!prevSheetUrl };
          const refsUsed = refs.map(r=>({ kind:"storyboard-ref", label:r.note, url:r.url }));
          const kind = (typeof slotAssetKind==="function") ? slotAssetKind(slotId) : "asset";
          await window.nbCommit(slotId, url, meta, refsUsed, kind);
          // nbCommit doesn't emit nb-gen-done (only useImageGen does) — fire it so the
          // open Storyboard tab updates its progress + thumbnail live.
          try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:slotId, url } })); }catch(e){}
          return url;
        },
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
      React.createElement("div",{className:"empty-canvas-sub"},"Your canvas is clean. Describe an idea and Cinema Machine builds the value-charge spine, scene by scene — then characters, props, script and shots all follow from it."),
      React.createElement("button",{className:"empty-canvas-btn",onClick:startNewStory},"+ New Story")));
  // ── Signed-out gate: show the commercial landing page instead of the app. The
  //    departments (spine, Writers' Room, Art Room, Agents) are never exposed until
  //    sign-in. Only when cloud auth is configured; local-only mode runs the app as before.
  const authGate = (typeof cloudConfigured==="function" && cloudConfigured());
  // While the initial session check is in flight, show a minimal splash — never flash the
  // landing at a user who turns out to be signed in.
  if(authGate && !authReady){
    return React.createElement("div",{className:"lp-splash"},
      React.createElement("span",{className:"lp-logo"},"Cinema Machine"),
      React.createElement("span",{className:"lp-splash-dot"}));
  }
  if(authGate && !session && typeof Landing!=="undefined"){
    return React.createElement(React.Fragment,null,
      window.ConfirmHost && React.createElement(window.ConfirmHost,null),
        React.createElement(Landing,{ onStart:startWithPlan, onSignIn:()=>openAuth("signin") }),
      authOpen && React.createElement(AuthModal,{ initialMode:authMode, plan:intendedPlan, light:true,
        onClose:()=>setAuthOpen(false), onAuthed:(s)=>{ if(s) setSession(s); } }),
      (typeof MuseDock!=="undefined") && React.createElement(MuseDock,{
        scenes:[], selScene:null, signedIn:false, aiOn:false, onSignIn:()=>openAuth("signup") }));
  }

  return React.createElement("div",{className:`app vp-${vp} ${densClass} ${premiumClass}`},
    window.ConfirmHost && React.createElement(window.ConfirmHost,null),
    // the post-checkout welcome card (/?welcome=1): live-updates as the webhook's
    // grant streams into the balance; its CTA goes straight to New Story
    welcomeOpen && session && window.WelcomePlanCard && React.createElement(window.WelcomePlanCard,{
      plan: creditBalance && creditBalance.plan,
      credits: creditBalance && creditBalance.remaining,
      activating: !(creditBalance && window.turnIsPaidPlan(creditBalance.plan)),
      onNewStory: ()=>{ setWelcomeOpen(false); startNewStory(); },
      onClose: ()=>setWelcomeOpen(false) }),
    // Home = the dashboard, and ONLY once the user has >=2 films. Below that,
    // opening Home routes straight into the Writers' Room (see onHome), so the
    // dashboard overlay never renders for a 0/1-film studio.
    homeOpen && cloudMode
      && (projects||[]).filter(p=>String(p.isShow)!=="true").length >= 2
      && typeof window.HomeDashboard!=="undefined"
      && React.createElement(window.HomeDashboard,{
          projects, currentId:currentProjectId, room,
          onOpen: async (id)=>{ setHomeOpen(false); await switchProject(id); },
          // LAZY like everywhere else: "New Project" opens the New Story intake —
          // the film is only minted when a story actually LAUNCHES. The old eager
          // createProject() stranded an Untitled film (and its auto-painted poster)
          // every time someone clicked in and changed their mind.
          onCreate: ()=>{ setHomeOpen(false); setRoom("writers"); setView("spine"); startNewStory(); },
          onGeneratePoster: generatePoster,
          onRegenPoster: (p)=>generatePoster(p, { keepPrev:true }),
          onRestorePoster: restorePoster,
          onGoRoom: async (rid)=>{ if(!currentProjectId){ await createProject(); } setHomeOpen(false); if(rid==="writers") setView("spine"); guardedSetRoom(rid); },
          onClose: ()=>setHomeOpen(false),
          accountSlot: React.createElement(AccountChip,{ session, cloudActive:cloudMode,
            onSignIn:()=>setAuthOpen(true), onSignOut:signOut }) }),
    t.grain && React.createElement("div",{style:{position:"fixed",inset:0,pointerEvents:"none",zIndex:50,
      opacity:.025,mixBlendMode:"overlay",
      backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"}}),

    // "Reset to sample story" is an ADMIN-ONLY tool (demo upkeep): only the admin
    // account ever sees it — every other user (and signed-out local mode) gets no reset.
    // The Stage gets the same shared TopBar as every other room (brand, project switcher,
    // room switcher, theme toggle, etc.) — only its own sub-view tabs (ViewNav) are skipped,
    // since the Stage is a single full-width assembly view.
    React.createElement(TopBar,{view,setView,room,setRoom:guardedSetRoom,artView,setArtView,project,scenes,drafts,
      onReset: isAdmin ? resetStory : null,
      onToggleAI:toggleAI,
      onNewStory:startNewStory,
      // Brief modal's "Rebuild as a new film" — the brief is the story's true
      // source, so recovery-by-regeneration runs the SAME Adaptation build into a
      // brand-new film (a fresh telling; the current film is never overwritten).
      onRebuildFromBrief: async ()=>{
        const brief = String(project.sourceBrief||"").trim();
        if(!brief){ if(window.appToast) window.appToast("This story has no saved brief to rebuild from.","info"); return; }
        if(!planActive()){ requirePlan("rebuild a story"); return; }
        const ok = await window.appConfirm({ title:"Rebuild as a new film?",
          body:"Runs the full story build again from this brief into a BRAND-NEW film \u2014 spine, cast and script freshly generated (a new telling, not a copy; results differ run to run). \u201c"+(project.title||"Untitled")+"\u201d and all its art stay exactly as they are. This spends build credits.",
          confirmLabel:"Build the new film" });
        if(!ok) return;
        const keep = { format:project.format, framework:project.framework, logline:(project.logline||"").trim() };
        if(cloudMode && typeof createProject==="function"){ await createProject(); }
        else { applyDoc(emptyDoc()); setArtView("lookbook"); }
        setRoom("writers"); setView("spine");
        setProject(p=>({ ...p, ...(keep.format?{format:keep.format}:{}), ...(keep.framework?{framework:keep.framework}:{}),
          logline:keep.logline || p.logline, sourceBrief:brief, sourceBriefAt:new Date().toISOString() }));
        setAgentLaunch({id:"adapt", input:brief}); setAgentsOpen(true);
      },
      onHome: cloudMode ? (()=>{
        // Home only opens the dashboard for an established studio (>=2 films).
        // A 0/1-film studio skips Home entirely and lands in the Writers' Room.
        const nFilms = (projects||[]).filter(p=>String(p.isShow)!=="true").length;
        if(nFilms >= 2){ setHomeOpen(true); return; }
        (async()=>{ if(!currentProjectId){ await createProject(); } setHomeOpen(false); setView("spine"); guardedSetRoom("writers"); })();
      }) : null,
      // ADMIN ONLY: inspect the whole continuity JSON (the Film Bible) the studio reads from
      onViewBible: isAdmin ? (()=> buildFilmBible({ project, scenes, characters, props, locations, shots, drafts, beatsMap, lookbook, lookbookNote })) : null,
      onManageStyles: (userEmail || null),   // every signed-in user manages their own styles (admin also gets the global tier inside)
      // a film "has a render style" once the look is established — a colorist style bible,
      // or any character/prop/location carrying a picked renderStyleKey. Gates the Styles
      // button in the Writers' Room (nothing to manage before a style exists).
      hasFilmStyle: !!(
        (project && project.styleBible && project.styleBible.sceneStyles && Object.keys(project.styleBible.sceneStyles).length) ||
        (characters||[]).some(c=>c && c.renderStyleKey) ||
        (props||[]).some(p=>p && p.renderStyleKey) ||
        (locations||[]).some(l=>l && l.renderStyleKey)
      ),
      theme,onTheme:setTheme,
      authSlot: React.createElement(AccountChip,{ session, cloudActive: cloudMode,
        onSignIn:()=>setAuthOpen(true), onSignOut:signOut }),
      projectSlot: cloudMode ? React.createElement(ProjectSwitcher,{ projects, currentId:currentProjectId,
        formatLabel:(typeof formatOf==="function") ? formatOf(project).label : null,
        // framework badge only when it differs from the default — three-act is the baseline
        frameworkLabel:(typeof frameworkOf==="function" && frameworkOf(project).id!=="threeact") ? frameworkOf(project).badge : null,
        onSwitch:switchProject, onCreate:createProject, onRename:renameProject, onDelete:deleteProject,
        onNewEpisode:createEpisode, onMakeShow:makeShow,
        canMakeShow: !currentShowId && scenes.length>0 }) : null,
      railOpen,inspOpen,
      onToggleRail:toggleRail,
      onToggleInsp:toggleInsp}),

    // the room's view tabs, moved out of the top bar to a full-width bar beneath it
    room!=="stage" && React.createElement(ViewNav,{room,view,setView,artView,setArtView,staleTabs,
      hiddenTabs:(typeof tabHidden==="function") ? Object.fromEntries((window.ART_TABS||[]).map(t=>[t.id, tabHidden(project, t.id)])) : null,
      railOpen,inspOpen,onToggleRail:toggleRail,onToggleInsp:toggleInsp,
      onCoordinate:async ()=>{ if(await requireStory("Art Department Coordinator")) setCoordConfirm(true); },
      onAgents:async ()=>{ if(await requireStory("Story Editors")) setAgentsOpen(true); }}),

    authOpen && React.createElement(AuthModal,{ initialMode:authMode, plan:intendedPlan,
      onClose:()=>setAuthOpen(false),
      onAuthed:(s)=>{ if(s) setSession(s); }}),

    React.createElement("div",{className:"body"},
      room==="stage"
        ? (scenes.length===0
          ? React.createElement("div",{className:"canvas"}, emptyCanvas())
            : React.createElement(window.StageView,{key:(cloudMode?currentProjectId:"local"),
                project,scenes,shots,characters,locations,props,beatsMap,drafts,
                creditBalance,
                onVoiceAll:voiceAllLines,voicingLines,onCancelVoiceAll:cancelVoiceAll,
                onVoiceLine:voiceLine,
                onUpdateShot:updateShot,
                onStageNav:(tab)=>{
                  if(tab==="timeline"){ setRoom("writers"); setView("script"); return; }
                  if(tab==="shots"){ setRoom("art"); setArtView("shots"); return; }
                  if(tab==="assets"){ setRoom("art"); setArtView("lookbook"); return; }
                  if(tab==="audio"){ setRoom("stage"); return; }
                  if(tab==="versions"){ setRoom("stage"); return; }
                  setRoom("stage");
                }}))
      : room==="art"
        ? (scenes.length===0
          // hard gate: the Art Room is downstream of the story, so with no scenes
          // show the onboarding instead of empty (and partly broken) tabs.
          ? React.createElement("div",{className:"canvas"}, emptyCanvas())
          : React.createElement(ArtRoom,{key:(cloudMode?currentProjectId:"local"),artView,setArtView,project,characters,scenes,props,drafts,trash,
            onRestoreChar:restoreCharacter,onPurgeChar:purgeCharacter,onRestoreProp:restoreProp,onPurgeProp:purgeProp,
            onRestoreLoc:restoreLocation,onPurgeLoc:purgeLocation,onEnsureOwner:ensureOwnerSheet,
            onDirectStoryboard:()=>setDirectorOpen(true),
            onDirectScene:(sceneId)=>setSceneDirLaunch({ sceneId: sceneId||null }),
            onColorist:()=>setColoristOpen(true),
            onShoot:()=>setShotDesignerOpen(true),
            onCast:()=>setCastingOpen(true),
            onPropsMaster:()=>setPropsMasterOpen(true),
            onScout:()=>setLocScoutOpen(true),
            onResearch:()=>setResearchOpen(true),
            lookbook,lookbookNote,onUpdateLookbook:updateLookbookCard,onAddLookbook:addLookbookCard,
            onDeleteLookbook:deleteLookbookCard,onSetLookbookNote:setLookbookNote,onClearLookbook:clearLookbook,
            staleTabs,onApplyLookbook:applyLookbook,
            onUpdateChar:updateCharacter,onDraftVisuals:draftCharacterVisuals,onDraftAllVisuals:draftAllVisuals,
            draftingVisualId,draftingAllVisuals,draftingVisualIds,onAddCharacter:addCharacter,onDeleteCharacter:deleteCharacter,
            onSuggestStates:suggestCharacterStates,suggestingStatesId,onRemoveOwnedItem:removeOwnedProp,onRenameOwnedItem:renameOwnedProp,
            onUpdateProp:updateProp,onDraftProp:draftPropVisuals,onDraftAllProps:draftAllProps,onCreateOwnedProp:createOwnedProp,
            onAddProp:addProp,onDeleteProp:deleteProp,draftingPropId,draftingPropIds,draftingAllProps,onMergeProps:mergeProps,
            onSeedFromCast:seedPropsFromCast,castHasProps:(typeof castHasProps==="function" && castHasProps(characters)),
            scenes,onTagScenes:tagPropScenes,taggingScenes,onTagOne:tagOnePropScenes,taggingSceneId,
            locations,onUpdateLocation:updateLocation,onDraftLocation:draftLocationVisuals,onDraftAllLocs:draftAllLocations,
            onAddLocation:addLocation,onDeleteLocation:deleteLocation,draftingLocIds,draftingAllLocs,
            onPullFromScript:pullLocationsFromScript,scriptHasLocs:(typeof scriptHasLocations==="function" && scriptHasLocations(scenes)),
            onAssignStyles:assignSceneStyles,assigningStyles,onSetStyleRefs:setStyleRefs,onSetScenePreset:setScenePreset,
            onSetWorldScale:setWorldScale,
            onAddStyleRefImages:addStyleRefImages,onRemoveStyleRefImage:removeStyleRefImage,
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
            onAddCharacter:addCharacterAndSelect,
            showFramework:t.framework,onCollapse:()=>setRailOpen(false),
            onAddScene:addScene,onReorder:reorderScenes,compact:!wide}))
        : (railOpen
          ? React.createElement(LeftRail,{project,characters,scenes,selId,selChar,
              onSelect:selectScene,
              onSelectChar:(id)=>{ setSelChar(id); setInspOpen(true); },
              onAddCharacter:addCharacterAndSelect,
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
              view==="beats"?(((typeof fwAuditOf==="function")&&fwAuditOf().subline)||"If a scene doesn't turn, cut it"):
              view==="script"?"Subtext (beats) becomes text (screenplay)":"16 scenes across 3 acts")),
          view==="spine" && React.createElement("div",{className:"legend"},
            runtimeTotal>0 && React.createElement("div",{className:"legend-item",
              title:"Estimated total runtime, ≈1 page/min (drafted scenes from their script; undrafted roughly from beats)"},
              React.createElement(Icon.clock,{s:11}),
              "≈ "+Math.round(runtimeTotal/60)+" min"),
            React.createElement("div",{className:"legend-item"},
              React.createElement("span",{className:"legend-swatch",style:{background:"var(--pos)"}}),"Positive"),
            React.createElement("div",{className:"legend-item"},
              React.createElement("span",{className:"legend-swatch",style:{background:"var(--neg)"}}),"Negative"),
            React.createElement("div",{className:"legend-item"},
              React.createElement("span",{className:"legend-swatch",style:{background:"var(--alert)"}}),"No turn"))),

        view==="spine" && scenes.length>0 && characters.length>0 && React.createElement(FollowStrip,{
          characters,scenes,beatsMap,followId:followChar,onFollow:setFollowChar}),
        view==="spine" && scenes.length>0 && React.createElement(DragScroll,{className:"canvas-scroll spine-pan"},
          React.createElement(SpineCanvas,{scenes,selId,onSelect:selectScene,showFramework:t.framework,
            onReorder:reorderScenes,onAddScene:addScene,runtimes:runtimeMap,
            follow:(()=>{ if(!followChar) return null;
              const c = characters.find(x=>x.id===followChar); if(!c) return null;
              const tl = characterThroughline(c, scenes, beatsMap);
              return { char:c, color:charSolidColor(c), drivenIds:new Set(tl.driven.map(s=>s.id)),
                involvedIds:tl.involvedIds, turnIds:tl.turnIds }; })()})),
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
          labelOf, onRevert:revertVersion, onRedo:redoVersion, onEditScene:commitVersion, continuityMap, project,
          // click a beat in the Script gutter → reveal it in the Inspector's Beats tab
          onBeatFocus:(n)=>{ setSelChar(null); setInspTab("beats"); setFocusBeat(n);
            if(!inspDrawer) setInspOpen(true); }}),

        // Floating Writers' Room (Agents) launcher — the agents refine an existing
        // story, so it only appears once a story exists (scenes > 0).
        ),

      scenes.length>0 && (()=>{
        const charObj = selChar ? characters.find(c=>c.id===selChar) : null;
        const inspectorEl = charObj
          ? React.createElement(CharacterPanel,{character:charObj, scenes,
              onUpdate:updateCharacter, onDraft:draftCharacter, drafting:charDrafting===charObj.id,
              onJumpScene:(id)=>selectScene(id), onClose:()=>setSelChar(null),
              onCollapse:()=>setInspOpen(false),
              onFollow:(id)=>{ setFollowChar(id); setView("spine");
                if(inspDrawer) setInspOpen(false); }})
          : React.createElement(Inspector,{scene:sel,beats,draft:(sel?drafts[sel.id]:null),onCharge,onUpdate:updateScene,characters,scenes,
              onAddScene:addScene,onDeleteScene:deleteScene,onMove:moveScene,onBeats:setBeatsFor,
              // "Redraft script from beats" (Beats tab): the reverse of Rebuild-from-script.
              // polishScene re-derives the prose from the CURRENT beat cards and commits a
              // VERSION, so Undo restores the previous draft.
              onRedraftScript: async (scn, b)=>{
                const ok = await window.appConfirm({ title:"Redraft the script from beats?",
                  body:"Scene "+scn.no+"\u2019s screenplay is rewritten from the CURRENT beat cards \u2014 reshape the beats first, then rebuild. The current draft stays in version history (Undo restores it).",
                  confirmLabel:"Redraft from beats" });
                if(!ok) return false;
                const done = await polishScene(scn, b);
                if(typeof window.appToast==="function"){
                  if(done) window.appToast("Scene "+scn.no+" redrafted from its beats \u2014 Undo restores the previous draft.","ok");
                  else window.appToast("Couldn\u2019t redraft \u2014 the writing model may be unreachable.","error");
                }
                return done;
              },
              sceneIndex:scenes.findIndex(s=>s.id===selId),sceneCount:scenes.length,
              onCollapse:()=>setInspOpen(false),project,
              tab:inspTab,onTab:setInspTab,focusBeat});
        return inspDrawer
          ? (inspOpen && inspectorEl)
          : (inspOpen
            ? inspectorEl
            : React.createElement(CollapsedStrip,{side:"right",label:"Inspector",icon:Icon.panelRight,
                onExpand:()=>setInspOpen(true)}));
      })())),

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

    // Storyboard Director — same modal/runner, scoped straight to the autonomous
    // "director" agent with the Art-Room ctx factory (kind:"build" keeps it out of the
    // Writers' picker, so opening here goes straight into its runner).
    directorOpen && React.createElement(AgentsPanel,{
      initialAgentId:"director", autoStart:true, single:true, viewLabel:"View Storyboards",
      ctxFactory:artAgentCtxFactory,
      onClose:()=>setDirectorOpen(false),
      onView:()=>{ setArtView("storyboard"); setDirectorOpen(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // Scene Director — gated per scene (plan card before each scene's spend); takes a
    // shot list to a consistent frame set: anchor → derive → vision QC → bounded repair.
    sceneDirLaunch && React.createElement(AgentsPanel,{
      initialAgentId:"scenedirector", autoStart:true, single:true, viewLabel:"View Shot List",
      ctxFactory:sceneDirectorCtxFactory,
      onClose:()=>setSceneDirLaunch(null),
      onView:()=>{ setArtView("shots"); setSceneDirLaunch(null); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // Cinematographer / Colorist — gated agent (proposes the colour system for approval);
    // its idle screen shows the current visual references so you can add taste before it runs.
    coloristOpen && React.createElement(AgentsPanel,{
      initialAgentId:"colorist", single:true, viewLabel:"View Styles",
      ctxFactory:artAgentCtxFactory,
      onClose:()=>setColoristOpen(false),
      onView:()=>{ setArtView("stylebible"); setColoristOpen(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable()),
      introExtra: (()=>{ const sb=(typeof styleBibleOf==="function")?styleBibleOf(project):{};
        const refs=(sb.refs||"").trim(); const imgs=sb.refImages||[];
        if(!refs && !imgs.length) return React.createElement("div",{className:"ag-coloref empty"},
          React.createElement(Icon.image,{s:13}), "No visual references yet — research the look in the Lookbook tab, or add films, photographers or reference images here, to steer the palette.");
        return React.createElement("div",{className:"ag-coloref"},
          React.createElement("div",{className:"ag-coloref-lab"}, React.createElement(Icon.sparkles,{s:12}), "Designing from your references"),
          refs && React.createElement("div",{className:"ag-coloref-txt"}, refs),
          imgs.length>0 && React.createElement("div",{className:"ag-coloref-imgs"},
            imgs.map(ri=> React.createElement("div",{key:ri.id,className:"ag-coloref-img"},
              React.createElement("img",{src:ri.thumb,alt:""}),
              React.createElement("div",{className:"ag-coloref-sw"}, (ri.colors||[]).slice(0,5).map((c,i)=>React.createElement("span",{key:i,style:{background:c}}))))))); })()}),

    // Shot Designer — gated coverage agent (proposes per-scene coverage for approval),
    // launched from the Shot List header; hands off rendering to "Generate all shots".
    shotDesignerOpen && React.createElement(AgentsPanel,{
      initialAgentId:"shotdesigner", autoStart:true, single:true, viewLabel:"View Shots",
      ctxFactory:artAgentCtxFactory,
      onClose:()=>setShotDesignerOpen(false),
      onView:()=>{ setArtView("shots"); setShotDesignerOpen(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // Casting Director — autonomous cast-design agent, launched from the Characters header.
    castingOpen && React.createElement(AgentsPanel,{
      initialAgentId:"casting", autoStart:true, single:true, viewLabel:"View Characters", force:castingForce,
      ctxFactory:artAgentCtxFactory,
      onClose:()=>{ setCastingOpen(false); setCastingForce(false); },
      onView:()=>{ setArtView("characters"); setCastingOpen(false); setCastingForce(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),


    // Props Master — autonomous props agent (derive → draft → dedup → generate),
    // launched from the Props header; runs before the cast so the references exist.
    propsMasterOpen && React.createElement(AgentsPanel,{
      initialAgentId:"propsmaster", autoStart:true, single:true, viewLabel:"View Props", force:propsMasterForce,
      ctxFactory:artAgentCtxFactory,
      onClose:()=>{ setPropsMasterOpen(false); setPropsMasterForce(false); },
      onView:()=>{ setArtView("props"); setPropsMasterOpen(false); setPropsMasterForce(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // Production Designer / Location Scout — autonomous locations agent (pull → spec → staging
    // → variants → generate, + coverage check), launched from the Locations header.
    locScoutOpen && React.createElement(AgentsPanel,{
      initialAgentId:"locscout", autoStart:true, single:true, viewLabel:"View Locations", force:locScoutForce,
      ctxFactory:artAgentCtxFactory,
      onClose:()=>{ setLocScoutOpen(false); setLocScoutForce(false); },
      onView:()=>{ setArtView("locations"); setLocScoutOpen(false); setLocScoutForce(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // Visual Researcher — autonomous lookbook agent (research the look + render mood frames),
    // launched from the Lookbook header. Writes references through to the Colorist (Presets).
    researchOpen && React.createElement(AgentsPanel,{
      initialAgentId:"researcher", autoStart:true, single:true, viewLabel:"View Lookbook",
      ctxFactory:artAgentCtxFactory,
      onClose:()=>setResearchOpen(false),
      onView:()=>{ setArtView("lookbook"); setResearchOpen(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),

    // Art Department Coordinator — the meta-agent that runs the whole pre-production
    // pipeline in dependency order (props → cast → locations → colour → shots → storyboard),
    // launched from the Art Room's "Run pre-production" button in the view bar.
    // #2 — cost/scope preview before the Coordinator spends: confirm, then launch
    coordConfirm && window.CoordConfirm && React.createElement(window.CoordConfirm,{
      project, characters, props, locations, shots, scenes,
      onCancel:()=>setCoordConfirm(false),
      onConfirm:()=>{ setCoordConfirm(false); setCoordOpen(true); }}),
    coordOpen && React.createElement(AgentsPanel,{
      initialAgentId:"coordinator", autoStart:true, single:true, viewLabel:"View Storyboards",
      ctxFactory:artAgentCtxFactory,
      onClose:()=>setCoordOpen(false),
      onView:()=>{ setArtView("storyboard"); setCoordOpen(false); },
      issues:{}, undoCount:0,
      aiOn: (typeof aiAvailable==="function" && aiAvailable())}),


    // New Story intake — many seed types in, one logline out, then launch Adaptation
    newStoryOpen && React.createElement(NewStoryIntake,{
      onClose:()=>setNewStoryOpen(false),
      aiOn: (typeof aiAvailable==="function" && aiAvailable()),
      onLaunch:async (logline, synopsis, formatId, frameworkId)=>{
        // HARD GATE: building a story runs the paid engine. Every intake path funnels
        // through onLaunch, so this is the real enforcement point — a no-plan account is
        // stopped here and sent to the plans modal, instead of consuming a build and
        // hitting a cryptic provider-funds error (CM-11) part-way through.
        if(!planActive()){ setNewStoryOpen(false); requirePlan("build a story"); return; }
        setNewStoryOpen(false);
        // LAZY film creation: the blank film is minted only NOW that a story is really
        // being built — and only when the current film already holds one (an empty
        // canvas is reused instead of duplicated). Aborted intakes create nothing.
        if(scenes.length){
          if(cloudMode && typeof createProject==="function"){ await createProject(); }
          else { applyDoc(emptyDoc()); setArtView("lookbook"); }
        }
        // A new story always starts in the Writers' Room on the spine — the story is
        // built first; pre-production (the Art Room) comes after. Without this, launching
        // New Story from the Art Room would leave the user staring at empty art tabs.
        setRoom("writers"); setView("spine");
        // Step 0 (pipeline): the chosen FORMAT and FRAMEWORK land on the project;
        // the spine builder, rooms and audit read them via formatOf/frameworkOf
        const brief = (typeof composeStoryBrief==="function") ? composeStoryBrief(logline, synopsis) : logline;
        // persist the logline + the composed brief (synopsis + research) so the user can
        // review later EXACTLY what the spine, beats and cast were built from — and see
        // where anything deviated. Saved at build time; never overwritten by later edits.
        setProject(p=>({ ...p,
          ...(formatId?{format:formatId}:{}), ...(frameworkId?{framework:frameworkId}:{}),
          logline: (logline||"").trim() || p.logline,
          sourceBrief: brief, sourceBriefAt: new Date().toISOString() }));
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
    // centered progress while a driver recast runs (same chrome as the redraft overlay)
    recastBusy && React.createElement("div",{className:"redraft-overlay"},
      React.createElement("div",{className:"redraft-card"},
        React.createElement("span",{className:"orb"}),
        React.createElement("div",{className:"redraft-t"},"Recasting Scene "+recastBusy.no+" for "+recastBusy.name),
        React.createElement("div",{className:"redraft-d"},
          "MUSE is rewriting the scene\u2019s summary, desire and beats so "+recastBusy.name+" drives \u2014 about half a minute."))),
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

/* chrome.jsx — TopBar + LeftRail */

function BrandMark(){
  return React.createElement("div",{className:"brand-mark"},
    React.createElement("svg",{width:15,height:15,viewBox:"0 0 24 24",fill:"none",
      stroke:"#fff",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"},
      React.createElement("path",{d:"M4 16l5-9 6 11 5-7"})));
}

function ExportMenu({ project, scenes, drafts, onReset }){
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    if(!open) return;
    const close=(e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return ()=>document.removeEventListener("mousedown", close);
  },[open]);
  const drafted = scenes.filter(s=>drafts[s.id]).length;
  const run=(kind)=>{ setOpen(false); try{ window.TURNExport[kind](project, scenes, drafts); }catch(e){ console.error(e); } };
  const items=[
    ["pdf", Icon.film, "Screenplay (PDF)", "Preview, then print / save as PDF"],
    ["fountain", Icon.script, "Screenplay (.fountain)", "Opens in Final Draft, Highland\u2026"],
    ["outline", Icon.layers, "Story outline (.txt)", "Premise, idea & spine"],
    ["csv", Icon.grid, "Spine data (.csv)", "Scenes, charges, turns"],
  ];
  return React.createElement("div",{className:"export-wrap",ref:ref},
    React.createElement("button",{className:`tb-btn ${open?"on":""}`,onClick:()=>setOpen(o=>!o),title:"Export the screenplay / story"},
      React.createElement(Icon.download,{s:14}),"Export"),
    open && React.createElement("div",{className:"export-menu"},
      React.createElement("div",{className:"export-head"},
        "Export \u00b7 ",React.createElement("span",{style:{color:"var(--txt-2)"}}, drafted+" of "+scenes.length+" scenes drafted")),
      items.map(([kind,Ic,title,sub])=>
        React.createElement("button",{key:kind,className:"export-item",onClick:()=>run(kind)},
          React.createElement("span",{className:"export-item-ic"},React.createElement(Ic,{s:15})),
          React.createElement("span",{className:"export-item-t"},
            React.createElement("span",{className:"t"},title),
            React.createElement("span",{className:"s"},sub)))),
      // admin-only (app.jsx passes onReset only for the admin account)
      onReset && React.createElement("div",{className:"export-foot"},
        React.createElement("button",{className:"export-item reset",
          onClick:async ()=>{ setOpen(false); const ok=await window.appConfirm({title:"Reset to the sample story?",body:"This permanently discards your edits, drafts and version history.",confirmLabel:"Reset",danger:true}); if(ok) onReset(); }},
          React.createElement("span",{className:"export-item-ic"},React.createElement(Icon.undo,{s:15})),
          React.createElement("span",{className:"export-item-t"},
            React.createElement("span",{className:"t"},"Reset to sample story"),
            React.createElement("span",{className:"s"},"Discard edits, restore The Matrix demo")))) ));
}

/* OverflowMenu — mobile-only kebab that holds the actions whose labels don't
   fit the narrow bar (New Story; the export targets in the Writers' Room only;
   the admin-only Reset). Keeps every action reachable on a phone. */
function OverflowMenu({ onNewStory, project, scenes, drafts, onReset, room }){
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    if(!open) return;
    const close=(e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return ()=>document.removeEventListener("mousedown", close);
  },[open]);
  const run=(kind)=>{ setOpen(false); try{ window.TURNExport[kind](project, scenes, drafts); }catch(e){ console.error(e); } };
  const exp=[
    ["pdf", Icon.film, "Screenplay (PDF)"],
    ["fountain", Icon.script, "Screenplay (.fountain)"],
    ["outline", Icon.layers, "Story outline (.txt)"],
    ["csv", Icon.grid, "Spine data (.csv)"],
  ];
  const inWriters = room!=="art" && (scenes||[]).length>0;   // export: Writers'/Stage action, only once a story exists
  return React.createElement("div",{className:"overflow-wrap",ref:ref},
    React.createElement("button",{className:`tb-icon ${open?"on":""}`,onClick:()=>setOpen(o=>!o),"aria-label":"More actions",title:"More"},
      React.createElement(Icon.moreV,{s:18})),
    open && React.createElement("div",{className:"export-menu",style:{maxWidth:"min(300px, calc(100vw - 24px))"}},
      React.createElement("button",{className:"export-item",onClick:()=>{ setOpen(false); onNewStory&&onNewStory(); }},
        React.createElement("span",{className:"export-item-ic"},React.createElement(Icon.plus,{s:15})),
        React.createElement("span",{className:"export-item-t"},
          React.createElement("span",{className:"t"},"New Story"),
          React.createElement("span",{className:"s"},"Start from an idea"))),
      inWriters && React.createElement("div",{className:"export-subhead"},"Export"),
      inWriters && exp.map(([kind,Ic,title])=>
        React.createElement("button",{key:kind,className:"export-item",onClick:()=>run(kind)},
          React.createElement("span",{className:"export-item-ic"},React.createElement(Ic,{s:15})),
          React.createElement("span",{className:"export-item-t"},
            React.createElement("span",{className:"t"},title)))),
      // Art Room: the Shots tab registers window.turnExportShotList while mounted —
      // "Export shot list" lives HERE, not on the Art Room screen (user ruling 2026-07-19)
      room==="art" && typeof window.turnExportShotList==="function" && React.createElement(React.Fragment,null,
        React.createElement("div",{className:"export-subhead"},"Export"),
        React.createElement("button",{className:"export-item",onClick:()=>{ setOpen(false); window.turnExportShotList(); }},
          React.createElement("span",{className:"export-item-ic"},React.createElement(Icon.download,{s:15})),
          React.createElement("span",{className:"export-item-t"},
            React.createElement("span",{className:"t"},"Export shot list"),
            React.createElement("span",{className:"s"},"Printable AD-style table")))),
      // admin-only (app.jsx passes onReset only for the admin account)
      onReset && React.createElement("div",{className:"export-foot"},
        React.createElement("button",{className:"export-item reset",
          onClick:async ()=>{ setOpen(false); const ok=await window.appConfirm({title:"Reset to the sample story?",body:"This permanently discards your edits, drafts and version history.",confirmLabel:"Reset",danger:true}); if(ok) onReset(); }},
          React.createElement("span",{className:"export-item-ic"},React.createElement(Icon.undo,{s:15})),
          React.createElement("span",{className:"export-item-t"},
            React.createElement("span",{className:"t"},"Reset to sample story"))))));
}
window.OverflowMenu = OverflowMenu;

/* ViewNav — the room's view tabs (Writers' Spine/Audit/Board/Script, or the Art
   Room tabs) as a full-width bar directly beneath the top bar, at every screen
   size. Moved out of the top bar to free its space; the panel toggles ride along
   at the edges (Writers' Room only). Replaces the old mobile-only bottom bar. */
function ViewNav({ room, view, setView, artView, setArtView, railOpen, inspOpen, onToggleRail, onToggleInsp, onCoordinate, onAgents, staleTabs, hiddenTabs }){
  // The Stage is a single full-width assembly view — no sub-view tabs (don't fall through
  // to the Writers' Room tabs); its own header carries the context.
  if(room==="stage") return null;
  const writersNav = [["spine","Spine",Icon.graph],["beats","Audit",Icon.grid],["board","Board",Icon.board],["script","Script",Icon.script]];
  // a format may hide tabs entirely (registry `tabs` map — used sparingly)
  const artNav = (window.ART_TABS||[]).filter(t=>!(hiddenTabs&&hiddenTabs[t.id])).map(t=>[t.id,t.label,Icon[t.icon]||Icon.user]);
  const inArt = room==="art";
  const nav = inArt ? artNav : writersNav;
  const cur = inArt ? artView : view;
  const setCur = inArt ? setArtView : setView;
  // each room's primary agent action, pinned to the right of the centered tab strip:
  // Art Room → the meta-agent (Run pre-production); Writers' Room → the Agents panel.
  const cta = inArt
    ? (onCoordinate && React.createElement("button",{className:"tb-btn accent vn-cta",onClick:onCoordinate,
        title:"Art Department Coordinator — runs your whole pre-production in dependency order: props → cast → locations → colour → shots → storyboard, in one click"},
        React.createElement(Icon.robot,{s:14}),React.createElement("span",{className:"vn-cta-lab"},"Run pre-production")))
    : (onAgents && React.createElement("button",{className:"tb-btn accent vn-cta",onClick:onAgents,
        title:"Story Editors — AI agents that refine your story: Story Doctor, Continuity Repair, Table-Read"},
        React.createElement(Icon.robot,{s:14}),React.createElement("span",{className:"vn-cta-lab"},"Story Editors")));
  return React.createElement("div",{className:"viewnav","aria-label":"Views"},
    // LEFT zone — story-panel toggle. DRAWER MODES ONLY (hidden ≥1100px via CSS):
    // on desktop the panels collapse/expand from inside (panel-collapse / CollapsedStrip).
    React.createElement("div",{className:"vn-side vn-left"},
      !inArt && React.createElement("button",{className:`tb-icon vn-paneltoggle ${railOpen?"on":""}`,onClick:onToggleRail,title:"Toggle story panel"},
        React.createElement(Icon.panelLeft,{s:16}))),
    // CENTER — the room's view tabs WITH the room's agent CTA, centered as one unit
    React.createElement("div",{className:"vn-center"},
      React.createElement("div",{className:"segmented"},
        nav.map(([id,lab,Ic])=>
          React.createElement("button",{key:id,className:`seg ${cur===id?"on":""}`,onClick:()=>setCur(id),
            title:(inArt && staleTabs && staleTabs[id]) ? (lab+" — the Lookbook changed since this was drafted") : lab},
            React.createElement(Ic,{s:14}),React.createElement("span",{className:"seg-lab"},lab),
            (inArt && staleTabs && staleTabs[id]) && React.createElement("span",{className:"seg-stale-dot"})))),
      cta),
    // RIGHT zone — the inspector toggle, drawer modes only (balances the left zone)
    React.createElement("div",{className:"vn-side vn-right"},
      !inArt && React.createElement("button",{className:`tb-icon vn-paneltoggle ${inspOpen?"on":""}`,onClick:onToggleInsp,title:"Toggle inspector"},
        React.createElement(Icon.panelRight,{s:16}))));
}
window.ViewNav = ViewNav;

const ROOMS = [
  { id:"writers", label:"Writers\u2019 Room", phase:"Development", icon:"script", live:true },
  { id:"art", label:"The Art Room", phase:"Pre-production", icon:"palette", live:true },
  { id:"stage", label:"The Stage", phase:"Production", icon:"clapper", live:true },
  { id:"cutting", label:"The Cutting Room", phase:"Post", icon:"scissorsCut", live:false },
];
window.ROOMS = ROOMS;

function RoomSwitcher({ room, setRoom, hasStory }){
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    const h=(e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const cur = ROOMS.find(r=>r.id===room) || ROOMS[0];
  // until a story exists, every room downstream of the Writers' Room is locked
  const locked = (r)=> r.live && r.id!=="writers" && !hasStory;
  return React.createElement("div",{className:"room-switch",ref},
    React.createElement("button",{className:"room-btn",onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"room-btn-ic"},React.createElement(Icon[cur.icon]||Icon.script,{s:14})),
      React.createElement("span",{className:"room-btn-t"},
        React.createElement("span",{className:"room-btn-name"},cur.label),
        React.createElement("span",{className:"room-btn-phase"},cur.phase)),
      React.createElement(Icon.chevD,{s:13})),
    open && React.createElement("div",{className:"room-menu"},
      React.createElement("div",{className:"room-menu-h"},"Production pipeline"),
      ROOMS.map((r,i)=>
        React.createElement("button",{key:r.id,
          className:`room-item ${room===r.id?"on":""} ${(r.live&&!locked(r))?"":"soon"}`,
          title: locked(r) ? "Create a story first — this room works on your story" : undefined,
          onClick:()=>{ if(r.live){ setRoom(r.id); setOpen(false); } }},
          React.createElement("span",{className:"room-item-no"},i+1),
          React.createElement("span",{className:"room-item-ic"},React.createElement(Icon[r.icon]||Icon.script,{s:15})),
          React.createElement("span",{className:"room-item-t"},
            React.createElement("span",{className:"room-item-name"},r.label),
            React.createElement("span",{className:"room-item-phase"},r.phase)),
          !r.live
            ? React.createElement("span",{className:"room-item-soon"},"Soon")
            : locked(r)
              ? React.createElement("span",{className:"room-item-soon"},"Needs a story")
              : (room===r.id && React.createElement("span",{className:"room-item-dot"}))))));
}

function ThemeToggle({ theme, onTheme }){
  /* one icon; click cycles light → dark → system → light. Shows current mode,
     tooltip says what the next tap will do — far lighter on the bar (esp. mobile). */
  const order = ["light","dark","system"];
  const meta = { light:[Icon.sun,"Light"], dark:[Icon.moon,"Dark"], system:[Icon.monitor,"System"] };
  const cur = order.indexOf(theme)>=0 ? theme : "system";
  const next = order[(order.indexOf(cur)+1) % order.length];
  const [Ic, lbl] = meta[cur];
  return React.createElement("button",{className:"tb-icon theme-cycle",onClick:()=>onTheme(next),
    title:`${lbl} mode \u00b7 tap for ${meta[next][1]}`,"aria-label":`Appearance: ${lbl}. Switch to ${meta[next][1]}`},
    React.createElement(Ic,{s:16}));
}
window.ThemeToggle = ThemeToggle;

/* User API keys — stored locally on this device. The server proxy will use these
   per-request when present, falling back to its environment secrets otherwise. */
const TURN_API_KEY_STORE = "turn.providerApiKeys.v1";
const TURN_API_PROVIDERS = [
  { id:"anthropic", label:"Anthropic", hint:"Writing, agents and MUSE when that text provider is selected", placeholder:"sk-ant-..." },
  { id:"openai", label:"OpenAI", hint:"GPT Image and OpenAI text models through the server proxy", placeholder:"sk-..." },
  { id:"google", label:"Google AI Studio", hint:"Nano Banana / Gemini image models and Google text models", placeholder:"AIza..." },
  { id:"elevenlabs", label:"ElevenLabs", hint:"Voice design, text-to-speech and speech-to-text through the server proxy", placeholder:"sk_..." },
  { id:"fal", label:"fal.ai", hint:"Stage video generation through the server proxy", placeholder:"fal..." },
];
function turnSanitizeApiKey(k){
  return String(k||"")
    .replace(/[\s\u00a0\u200b-\u200d\ufeff]/g, "")
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, "")
    .trim();
}
function turnReadApiKeys(){
  try{ const j=JSON.parse(localStorage.getItem(TURN_API_KEY_STORE)||"{}"); return (j&&typeof j==="object")?j:{}; }catch(e){ return {}; }
}
function turnWriteApiKeys(keys){
  try{
    const clean={};
    Object.entries(keys||{}).forEach(([id,k])=>{ k=turnSanitizeApiKey(k); if(k) clean[id]=k; });
    Object.keys(clean).length ? localStorage.setItem(TURN_API_KEY_STORE, JSON.stringify(clean)) : localStorage.removeItem(TURN_API_KEY_STORE);
    window.dispatchEvent(new CustomEvent("turn-api-keys-changed"));
  }catch(e){}
}
function turnGetApiKey(id){ return turnSanitizeApiKey(turnReadApiKeys()[id]||""); }
function turnSetApiKey(id, key){ const keys=turnReadApiKeys(); key=turnSanitizeApiKey(key); if(key) keys[id]=key; else delete keys[id]; turnWriteApiKeys(keys); }
function turnHasApiKey(id){ return !!turnGetApiKey(id); }
function turnApiKeysForProxy(ids){
  const keys = turnReadApiKeys(), out = {};
  (ids||[]).forEach(id=>{ const k=turnSanitizeApiKey(keys[id]||""); if(k) out[id]=k; });
  return Object.keys(out).length ? out : undefined;
}
window.turnApiProviders = TURN_API_PROVIDERS;
window.turnSanitizeApiKey = window.turnSanitizeApiKey || turnSanitizeApiKey;
window.turnReadApiKeys = turnReadApiKeys;
window.turnGetApiKey = turnGetApiKey;
window.turnSetApiKey = turnSetApiKey;
window.turnHasApiKey = turnHasApiKey;
window.turnApiKeysForProxy = turnApiKeysForProxy;

function ApiKeysModal({ onClose }){
  const [draft, setDraft] = React.useState({});
  const [tick, setTick] = React.useState(0);
  const saved = turnReadApiKeys();
  React.useEffect(()=>{ const h=(e)=>{ if(e.key==="Escape") onClose(); }; document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h); },[]);
  const setVal = (id,v)=>setDraft(d=>({ ...d, [id]:v }));
  const save = (p)=>{ turnSetApiKey(p.id, draft[p.id]||""); setDraft(d=>({ ...d, [p.id]:"" })); setTick(t=>t+1); if(window.appToast) window.appToast(p.label+" API key saved locally.","success"); };
  const remove = async (p)=>{
    const ok = !window.appConfirm || await window.appConfirm({ title:"Remove API key?", body:"Removes the "+p.label+" key from this browser. Server-side keys, if configured, will still work." });
    if(!ok) return;
    turnSetApiKey(p.id,""); setDraft(d=>({ ...d, [p.id]:"" })); setTick(t=>t+1);
  };
  return React.createElement("div",{className:"bible-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"bible-modal api-keys-mgr",key:tick},
      React.createElement("div",{className:"bible-head"},
        React.createElement("div",{className:"bible-title"},
          React.createElement((Icon.key||Icon.lock||Icon.layers),{s:15}),"API keys",
          React.createElement("span",{className:"bible-sub"},"stored locally on this device")),
        React.createElement("button",{className:"bible-x",onClick:onClose,title:"Close"},React.createElement(Icon.x,{s:16}))),
      React.createElement("div",{className:"api-keys-body"},
        React.createElement("div",{className:"api-keys-note"},
          "Keys are saved in this browser only. When a generation uses your server proxy, Cinema Machine sends the relevant key with that request; if no user key is saved, the proxy falls back to its server secret. They are not synced across devices."),
        TURN_API_PROVIDERS.map(p=>{
          const has = !!saved[p.id];
          const val = draft[p.id] || "";
          return React.createElement("div",{className:"api-key-row",key:p.id},
            React.createElement("div",{className:"api-key-meta"},
              React.createElement("div",{className:"api-key-title"},p.label,
                React.createElement("span",{className:"api-key-status "+(has?"on":"")},has?"saved":"not set")),
              React.createElement("div",{className:"api-key-hint"},p.hint)),
            React.createElement("div",{className:"api-key-edit"},
              React.createElement("input",{className:"api-key-input",type:"password",autoComplete:"off",spellCheck:false,
                value:val,onChange:e=>setVal(p.id,e.target.value),
                placeholder:has?"Paste a new key to replace the saved one":p.placeholder}),
              React.createElement("button",{className:"styles-mini",disabled:!turnSanitizeApiKey(val),onClick:()=>save(p)},"Save"),
              React.createElement("button",{className:"styles-mini danger",disabled:!has,onClick:()=>remove(p),title:"Remove saved key"},
                React.createElement(Icon.trash||Icon.x,{s:13}))));
        }))));
}
window.ApiKeysModal = ApiKeysModal;

/* ADMIN: the Film Bible viewer — the whole continuity JSON the studio reads from,
   shown read-only with a Copy button. getBible() builds it fresh on open. */
function FilmBibleModal({ getBible, onClose }){
  const [copied, setCopied] = React.useState(false);
  const json = React.useMemo(()=>{ try{ return JSON.stringify(getBible()||{}, null, 2); }catch(e){ return "// couldn't build the bible: "+(e&&e.message||e); } },[]);
  const copy = ()=>{ try{ navigator.clipboard.writeText(json); setCopied(true); setTimeout(()=>setCopied(false), 1600); }catch(e){} };
  React.useEffect(()=>{ const h=(e)=>{ if(e.key==="Escape") onClose(); }; document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h); },[]);
  return React.createElement("div",{className:"bible-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"bible-modal"},
      React.createElement("div",{className:"bible-head"},
        React.createElement("div",{className:"bible-title"},
          React.createElement(Icon.layers,{s:15}),"Film Bible — continuity JSON",
          React.createElement("span",{className:"bible-sub"},"deterministic projection of the live story · admin only")),
        React.createElement("div",{className:"bible-head-acts"},
          React.createElement("button",{className:"bible-btn"+(copied?" on":""),onClick:copy},
            React.createElement((Icon[copied?"check":"copy"]||Icon.check),{s:13}), copied?"Copied":"Copy JSON"),
          React.createElement("button",{className:"bible-x",onClick:onClose,title:"Close"},React.createElement(Icon.x,{s:16})))),
      React.createElement("pre",{className:"bible-pre"}, json)));
}
window.FilmBibleModal = FilmBibleModal;

/* Manage render styles. Every signed-in user manages their OWN personal locked styles
   (private, capped at 10 — delete to make room). ADMIN additionally sees and manages the
   GLOBAL platform list everyone sees: bundled presets and admin-published styles in one
   curated order. Admin can publish, remove/hide, restore and reorder. The combined global
   pool is capped at 40. Two tiers — see app/artroom.jsx engine + supabase/styles.sql. */
function RenderStylesModal({ onClose }){
  if(typeof window.useRenderStyleVersion==="function") window.useRenderStyleVersion();   // re-render on change
  const isAdmin = !!(window.turnIsStyleAdmin && window.turnIsStyleAdmin());
  const personalCap = window.turnPersonalStyleCap || 10;
  const globalCap = window.turnGlobalStyleCap || 40;
  const [busy, setBusy] = React.useState("");
  const lists = (typeof window.turnListStyles==="function") ? window.turnListStyles() : { user:[], global:[] };
  const userCount = (lists.user||[]).length, atCap = userCount >= personalCap;
  const allGlobalCount = (typeof window.turnAllGlobalStyleCount==="function") ? window.turnAllGlobalStyleCount() : (lists.global||[]).length;
  const globalFull = allGlobalCount >= globalCap;
  const globalList = (lists.globalVisible || []).filter(Boolean);
  const hiddenGlobalList = (lists.globalHidden || []).filter(Boolean);
  const globalRenders = new Set((globalList||[]).map(g=>g.render?JSON.stringify(g.render):"").filter(Boolean));
  React.useEffect(()=>{ const h=(e)=>{ if(e.key==="Escape") onClose(); }; document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h); },[]);
  const publish = async (s)=>{ setBusy("p:"+s.key);
    try{ const k = await window.turnPublishGlobalStyle(s.label, s.render);
      if(!k && window.appToast) window.appToast("Couldn't publish — admin only, or the global render-style cap ("+globalCap+") has been reached."); }
    finally{ setBusy(""); } };
  const delGlobal = async (s)=>{
    if(window.appConfirm && !(await window.appConfirm({ title:"Delete global style?", body:"Every signed-in user loses \""+s.label+"\"." }))) return;
    setBusy("g:"+s.key); try{ await window.turnDeleteGlobalStyle(s.key); } finally{ setBusy(""); } };
  const delUser = async (s)=>{
    if(window.appConfirm && !(await window.appConfirm({ title:"Delete your saved style?", body:"Removes \""+s.label+"\" from your saved styles." }))) return;
    setBusy("u:"+s.key); try{ await window.turnUnlockRenderStyle(s.key); } finally{ setBusy(""); } };
  const moveGlobal = async (s,dir)=>{ setBusy("m:"+s.key);
    try{ if(window.turnMoveGlobalStyle) await window.turnMoveGlobalStyle(s.key, dir); }
    finally{ setBusy(""); } };
  const restoreGlobal = async (s)=>{ setBusy("r:"+s.key);
    try{ if(window.turnRestoreGlobalStyle) await window.turnRestoreGlobalStyle(s.key); }
    finally{ setBusy(""); } };
  // unified platform row — built-in presets and admin-published globals are curated together
  const globalRow = (s,idx)=> React.createElement("div",{className:"styles-row"+(s.builtIn?" styles-row-builtin":""),key:s.key},
    React.createElement("span",{className:"styles-row-name"},s.label),
    React.createElement("span",{className:"styles-row-badge"+(!s.builtIn?" styles-row-badge-curated":"")},s.builtIn?"preset":"global"),
    React.createElement("div",{className:"styles-row-acts"},
      React.createElement("button",{className:"styles-mini styles-mini-square",disabled:!!busy||idx<=0,title:"Move up",
        onClick:()=>moveGlobal(s,-1)},"↑"),
      React.createElement("button",{className:"styles-mini styles-mini-square",disabled:!!busy||idx>=globalList.length-1,title:"Move down",
        onClick:()=>moveGlobal(s,1)},"↓"),
      React.createElement("button",{className:"styles-mini danger",disabled:!!busy,title:s.builtIn?"Hide this preset for all signed-in users":"Delete this global style for all signed-in users",
        onClick:()=>delGlobal(s)}, React.createElement(Icon.trash||Icon.x,{s:13}))));
  const hiddenRow = (s)=> React.createElement("div",{className:"styles-row styles-row-hidden",key:s.key},
    React.createElement("span",{className:"styles-row-name"},s.label),
    React.createElement("span",{className:"styles-row-badge"},"hidden preset"),
    React.createElement("div",{className:"styles-row-acts"},
      React.createElement("button",{className:"styles-mini",disabled:!!busy||globalFull,title:globalFull?"Global cap reached — remove another style before restoring":"Restore this preset for all users",
        onClick:()=>restoreGlobal(s)},"Restore")));
  // personal style row — every signed-in user; admin additionally gets “Publish to global” button
  const userRow = (s)=> React.createElement("div",{className:"styles-row",key:s.key},
    React.createElement("span",{className:"styles-row-name"},s.label),
    React.createElement("div",{className:"styles-row-acts"},
      isAdmin && React.createElement("button",{className:"styles-mini",disabled:!!busy||globalRenders.has(JSON.stringify(s.render))||globalFull,
        title:globalRenders.has(JSON.stringify(s.render))?"Already a global style":(globalFull?("Global render-style cap ("+globalCap+") reached — delete a global style first"):"Make this style a global preset everyone sees"),
        onClick:()=>publish(s)}, globalRenders.has(JSON.stringify(s.render))?"Global ✓":"→ Make global"),
      React.createElement("button",{className:"styles-mini danger",disabled:!!busy,title:"Delete this saved style",
        onClick:()=>delUser(s)}, React.createElement(Icon.trash||Icon.x,{s:13}))));
  return React.createElement("div",{className:"bible-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"bible-modal styles-mgr"},
      React.createElement("div",{className:"bible-head"},
        React.createElement("div",{className:"bible-title"},
          React.createElement((Icon.sparkles||Icon.layers),{s:15}), "Render styles",
          React.createElement("span",{className:"bible-sub"}, isAdmin?"global + your personal styles":"your personal saved styles")),
        React.createElement("button",{className:"bible-x",onClick:onClose,title:"Close"},React.createElement(Icon.x,{s:16}))),
      React.createElement("div",{className:"styles-body"},
        // GLOBAL tier — visible to admin only; shows built-ins + curated as one unified pool
        isAdmin && React.createElement("div",{className:"styles-sec-h"},"Global render styles — everyone sees these",
          React.createElement("span",{className:"styles-sec-sub"+(globalFull?" warn":"")},
            allGlobalCount+" / "+globalCap+(globalFull?" · cap reached — delete a global style to add another":" · shared platform presets"))),
        isAdmin && React.createElement("div",{className:"styles-global-list"},
          (globalList||[]).map(globalRow),
          !(globalList||[]).length && React.createElement("div",{className:"styles-empty styles-empty-sm"},
            "No global render styles yet — promote one from your personal styles below or restore a hidden preset.")),
        isAdmin && !!(hiddenGlobalList||[]).length && React.createElement("div",{className:"styles-sec-h styles-sec-h-sub"},"Hidden presets",
          React.createElement("span",{className:"styles-sec-sub"},"restore any removed built-in")),
        isAdmin && !!(hiddenGlobalList||[]).length && React.createElement("div",{className:"styles-global-list"},
          (hiddenGlobalList||[]).map(hiddenRow)),
        // PERSONAL tier — everyone signed in; capped at 10
        React.createElement("div",{className:"styles-sec-h"},isAdmin?"Your personal styles":"Your saved styles",
          React.createElement("span",{className:"styles-sec-sub"+(atCap?" warn":"")}, userCount+" / "+personalCap+(atCap?" · full — delete one to save more":" · private to you, reusable everywhere"))),
        (lists.user||[]).length
          ? (lists.user||[]).map(userRow)
          : React.createElement("div",{className:"styles-empty"},"None yet — pick Surprise me ✨ on any card and click 🔒 Lock this style to save it here."))));
}
window.RenderStylesModal = RenderStylesModal;

/* StoryBriefModal — shows the logline + synopsis (the composed brief) the story's spine,
   beats and cast were built from, so the user can review exactly what was generated and
   spot where anything deviated. Saved at build time on project.sourceBrief. */
function StoryBriefModal({ project, onClose, onRebuild }){
  // the rebuild runs the full story build, so the WRITING MODEL is chosen here
  // first — the same picker (and persisted choice) as the New Story window
  const [mid, setMid] = React.useState(()=> (typeof window.getWritingModelId==="function") ? window.getWritingModelId("story") : "");
  const pickModel = (id)=>{ setMid(id); if(typeof window.setWritingModelId==="function") window.setWritingModelId(id); };
  const _rec = (window.recommendedWritingModelId && window.recommendedWritingModelId("story")) || "";
  const p = project || {};
  const brief = (p.sourceBrief||"").trim();
  const logline = (p.logline||p.premise||"").trim();
  React.useEffect(()=>{ const h=(e)=>{ if(e.key==="Escape") onClose(); }; document.addEventListener("keydown",h); return ()=>document.removeEventListener("keydown",h); },[]);
  const when = p.sourceBriefAt ? new Date(p.sourceBriefAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "";
  return React.createElement("div",{className:"bible-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"bible-modal brief-modal"},
      React.createElement("div",{className:"bible-head"},
        React.createElement("div",{className:"bible-title"},
          React.createElement((Icon.book||Icon.file||Icon.layers),{s:15}),"Story brief — what the spine was built from",
          when && React.createElement("span",{className:"bible-sub"},"generated "+when)),
        React.createElement("button",{className:"bible-x",onClick:onClose,title:"Close"},React.createElement(Icon.x,{s:16}))),
      // RECOVERY / RE-ROLL: the brief is the story's true source — rebuild runs the
      // full Adaptation build again from it into a BRAND-NEW film (a fresh telling,
      // never an in-place overwrite: the current film and all its art stay intact).
      brief && onRebuild && React.createElement("div",{className:"brief-rebuild-row"},
        React.createElement("button",{className:"flag-btn primary",onClick:()=>{ onClose(); onRebuild(); },
          title:"Run the full story build again from this brief into a NEW film — spine, cast and script freshly generated. This film is untouched."},
          React.createElement(Icon.sparkles,{s:13}),"Rebuild as a new film"),
        React.createElement("label",{className:"brief-model-pick",title:"The engine the rebuild runs on — same picker as the New Story window; your choice persists"},
          React.createElement("span",{className:"obj-lab",style:{marginBottom:0}},"Writing model"),
          React.createElement("select",{className:"ns-model-sel",value:mid,onChange:(e)=>pickModel(e.target.value)},
            (window.WRITING_MODELS||[]).map(m=>React.createElement("option",{key:m.id,value:m.id,title:m.note||""},m.label + (m.id===_rec ? "  · recommended" : ""))))),
        React.createElement("span",{className:"brief-rebuild-note"},"builds a fresh telling from this brief \u2014 this film stays untouched")),
      brief
        ? React.createElement("pre",{className:"bible-pre brief-pre"}, brief)
        : React.createElement("div",{className:"brief-empty"},
            logline
              ? React.createElement(React.Fragment,null,
                  React.createElement("div",{className:"brief-empty-lab"},"Logline"),
                  React.createElement("p",{className:"brief-empty-log"},logline),
                  React.createElement("p",{className:"brief-empty-note"},"No saved synopsis — this story was built before briefs were saved. New stories save their full logline + synopsis here."))
              : React.createElement("p",{className:"brief-empty-note"},"No saved brief yet. Start a story with New Story and its logline + synopsis are saved here for review."))));
}
window.StoryBriefModal = StoryBriefModal;

function TopBar({ room, setRoom, project, scenes, drafts, onReset, onNewStory, onToggleAI, onAgents, onViewBible, onManageStyles, onRebuildFromBrief, hasFilmStyle, theme, onTheme, authSlot, projectSlot, onHome }){
  const [bibleOpen, setBibleOpen] = React.useState(false);
  const [briefOpen, setBriefOpen] = React.useState(false);
  const [stylesOpen, setStylesOpen] = React.useState(false);
  const [apiKeysOpen, setApiKeysOpen] = React.useState(false);
  React.useEffect(()=>{ const h=()=>setApiKeysOpen(true); window.addEventListener("turn-open-api-keys",h); return ()=>window.removeEventListener("turn-open-api-keys",h); },[]);
  return React.createElement("div",{className:"topbar"},
    bibleOpen && onViewBible && React.createElement(FilmBibleModal,{ getBible:onViewBible, onClose:()=>setBibleOpen(false) }),
    briefOpen && React.createElement(StoryBriefModal,{ project, onClose:()=>setBriefOpen(false), onRebuild:onRebuildFromBrief }),
    stylesOpen && onManageStyles && React.createElement(RenderStylesModal,{ onClose:()=>setStylesOpen(false) }),
    apiKeysOpen && React.createElement(ApiKeysModal,{ onClose:()=>setApiKeysOpen(false) }),
    React.createElement("div",{className:"tb-left"},
      onHome
        ? React.createElement("button",{className:"brand brand-btn",onClick:onHome,title:"Home — all your films"},
            React.createElement(BrandMark,null),
            React.createElement("span",{className:"brand-name"},"Cinema ",React.createElement("b",null,"Machine")))
        : React.createElement("div",{className:"brand"},
            React.createElement(BrandMark,null),
            React.createElement("span",{className:"brand-name"},"Cinema ",React.createElement("b",null,"Machine"))),
      React.createElement("div",{className:"topbar-divider"}),
      // the project title first, then the department (room) switcher to its right
      React.createElement("div",{className:"context-group"},
        projectSlot || null,
        React.createElement(RoomSwitcher,{room,setRoom,hasStory:(scenes||[]).length>0}))),

    React.createElement("div",{className:"tb-right"},
      React.createElement(ThemeToggle,{theme,onTheme}),
      // Writers' Room: review the logline + synopsis the story was built from
      room==="writers" && project && (project.sourceBrief||project.logline||project.premise) && React.createElement("button",{className:"tb-btn",onClick:()=>setBriefOpen(true),
        title:"Story brief — the logline & synopsis this story was built from"},
        React.createElement((Icon.book||Icon.file||Icon.layers),{s:14}),"Brief"),
      // ADMIN ONLY: the whole continuity JSON, one click
      onViewBible && React.createElement("button",{className:"tb-btn",onClick:()=>setBibleOpen(true),
        title:"Film Bible — view the whole continuity JSON the studio reads from"},
        React.createElement(Icon.layers,{s:14}),"JSON"),
      // Styles manager: ADMIN ONLY. Its real job is curating the GLOBAL style tier
      // (publish/hide/reorder what every user sees). Regular users manage their own
      // locked styles where they live — on the Art Room cards (lock 🔒 / unlock chip)
      // — so for them this button was an empty modal and top-bar clutter.
      window.turnIsAdmin && onManageStyles && React.createElement("button",{className:"tb-btn",onClick:()=>setStylesOpen(true),
        title:"Render styles — curate the global style list (admin) and your locked styles"},
        React.createElement((Icon.sparkles||Icon.layers),{s:14}),"Styles"),
      // API keys: ADMIN ONLY. Subscribers never enter provider keys — all generation
      // runs on the platform's server-side keys through the proxy (no key in the browser).
      window.turnIsAdmin && React.createElement("button",{className:"tb-btn",onClick:()=>setApiKeysOpen(true),
        title:"API keys — platform provider keys (admin only)"},
        React.createElement((Icon.key||Icon.lock||Icon.layers),{s:14}),"API Keys"),
      React.createElement("button",{className:"tb-btn newstory",onClick:onNewStory,title:"Start a new story from an idea"},
        React.createElement(Icon.plus,{s:14}),"New Story"),
      // Export is a Writers' Room action (screenplay / story formats) — only there,
      // and only once a story exists (nothing to export from an empty canvas).
      room==="writers" && (scenes||[]).length>0 && React.createElement(ExportMenu,{project,scenes,drafts,onReset}),
      // ⋯ overflow: ADMIN ONLY (user ruling 2026-07-14 — non-admins see exactly:
      // theme · Brief · New Story · Export · account). Its only unique item is the
      // admin Reset; New Story and the export formats already live in the visible
      // whitelisted controls, so users lose nothing.
      // EXCEPTION (user ruling 2026-07-19): in the ART ROOM the ⋮ shows for everyone —
      // it carries "Export shot list" (moved off the Shots screen); admin extras stay gated.
      (window.turnIsAdmin || room==="art") && React.createElement(OverflowMenu,{onNewStory,project,scenes,drafts,onReset,room}),
      // 'Agents' moved to the ViewNav's right zone (Writers' Room), mirroring the Art Room's
      // 'Run pre-production' — both sit to the right of their centered tab strip.
      authSlot || React.createElement("div",{className:"avatar"},"MV")),
  );
}
window.TopBar = TopBar;

/* collapsed vertical strip — left or right */
function CollapsedStrip({ side, label, icon:Ic, onExpand, flagCount, buttonless }){
  // buttonless (the inspector, right): drop the strip's own expand button — it would sit
  // right under the top-bar's inspector toggle and read as a duplicate. The whole strip is
  // clickable to reopen instead, and the top-bar toggle still works.
  return React.createElement("div",{className:`strip ${side}${buttonless?" strip-clickable":""}`,
      ...(buttonless ? { onClick:onExpand, title:`Expand ${label}`, role:"button", tabIndex:0 } : {})},
    buttonless ? null : React.createElement("button",{className:"strip-btn",onClick:onExpand,title:`Expand ${label}`},
      React.createElement(Ic,{s:16})),
    React.createElement("div",{className:"strip-label"},label),
    flagCount ? React.createElement("div",{className:"strip-flag",title:`${flagCount} scenes don't turn`},
      React.createElement("div",{className:"dot"},React.createElement(Icon.alert,{s:12})),flagCount) : null);
}
window.CollapsedStrip = CollapsedStrip;

function RailSection({ label, icon:Ic, onAdd, defaultOpen=true, children }){
  const [open, setOpen] = React.useState(defaultOpen);
  const prevDef = React.useRef(defaultOpen);
  React.useEffect(()=>{ if(prevDef.current!==defaultOpen){ setOpen(defaultOpen); prevDef.current=defaultOpen; } },[defaultOpen]);
  return React.createElement("div",{className:`rail-sec ${open?"":"folded"}`},
    React.createElement("div",{className:"rail-sec-head clickable",onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"eyebrow"},
        React.createElement("span",{className:"rail-fold-ic"},React.createElement(open?Icon.chevD:Icon.chevR,{s:11})),
        Ic&&React.createElement(Ic,{s:12}),label),
      onAdd&&React.createElement("button",{className:"rail-add",onClick:(e)=>{e.stopPropagation();onAdd();}},
        React.createElement(Icon.plus,{s:13}))),
    open && children);
}

function LeftRail({ project, characters, scenes, selId, selChar, onSelect, onSelectChar, onAddCharacter, showFramework, onCollapse, onAddScene, onReorder, compact }){
  const ci = project.controllingIdea;
  const secOpen = !compact;
  // group scenes by act
  const acts = [1,2,3].map(a => ({ act:a, scenes: scenes.filter(s=>s.act===a) }));
  const [open, setOpen] = React.useState({1:true,2:true,3:true});
  const [dragId, setDragId] = React.useState(null);
  const [overId, setOverId] = React.useState(null);
  const actTitles = { 1:"Setup", 2:"Complication", 3:"Resolution" };
  const idxOf = (id)=>scenes.findIndex(s=>s.id===id);

  return React.createElement("div",{className:"rail"},
    React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",
      padding:"10px 12px 2px"}},
      React.createElement("span",{className:"eyebrow"},React.createElement(Icon.film,{s:12}),
        React.createElement("span",{style:{marginLeft:7}},"Story")),
      React.createElement("button",{className:"panel-collapse",onClick:onCollapse,title:"Collapse story panel"},
        React.createElement(Icon.chevL,{s:14}))),
    React.createElement("div",{className:"rail-scroll"},

      // PREMISE + CONTROLLING IDEA
      React.createElement(RailSection,{label:"Premise",icon:Icon.target,defaultOpen:secOpen},
        React.createElement("div",{className:"idea-card"},
          React.createElement("div",{className:"premise"},`"${project.premise}"`),
          showFramework && React.createElement("div",{className:"ctrl-idea"},
            React.createElement("div",{className:"eyebrow",style:{marginBottom:6}},"Controlling Idea"),
            React.createElement("span",{className:"val"},ci.value)," ",
            React.createElement("span",{className:"cause"},ci.cause),
            React.createElement("span",{className:"tag-ironic"},`${ci.polarity} ending`)))),

      // SETTING
      showFramework && React.createElement(RailSection,{label:"Setting",icon:Icon.globe,defaultOpen:secOpen},
        React.createElement("div",{style:{padding:"0 4px",display:"flex",flexDirection:"column",gap:9}},
          [["Period",project.setting.period],["Duration",project.setting.duration],
           ["Location",project.setting.location],["Conflict",project.setting.conflict]].map(([k,v])=>
            React.createElement("div",{key:k},
              React.createElement("div",{className:"obj-lab",style:{marginBottom:2}},k),
              React.createElement("div",{style:{fontSize:12,color:"var(--txt-1)",lineHeight:1.4}},v))))),

      // CHARACTERS
      React.createElement(RailSection,{label:"Cast",icon:Icon.user,onAdd:onAddCharacter,defaultOpen:true},
        characters.map(c=>{
          const driven = scenes.filter(s=>s.driver===c.id).length;
          return React.createElement("div",{key:c.id,
            className:"char-row"+(selChar===c.id?" sel":""),
            onClick:()=>onSelectChar&&onSelectChar(c.id)},
            React.createElement("div",{className:"char-av",style:{background:c.color}},
              (c.name||"?").split(" ").map(w=>w[0]||"").slice(0,2).join("")),
            React.createElement("div",{className:"char-info"},
              React.createElement("div",{className:"char-name"},c.name||"Unnamed"),
              React.createElement("div",{className:"char-role"},c.role||"")),
            React.createElement("span",{className:"char-drives",title:driven+" scene"+(driven!==1?"s":"")+" driven"},driven));
        })),

      // STORY TREE
      React.createElement(RailSection,{label:"Story Spine",icon:Icon.layers,defaultOpen:true,
        onAdd:()=>onAddScene&&onAddScene(scenes.length?scenes[scenes.length-1].id:null)},
        acts.map(a=>
          React.createElement("div",{key:a.act,className:"tree-act"},
            React.createElement("div",{className:"tree-act-head",onClick:()=>setOpen(o=>({...o,[a.act]:!o[a.act]}))},
              React.createElement("span",{style:{color:"var(--txt-2)",display:"flex"}},
                React.createElement(open[a.act]?Icon.chevD:Icon.chevR,{s:13})),
              React.createElement("span",{className:"tree-act-no"},["I","II","III"][a.act-1]),
              React.createElement("span",{className:"tree-act-title"},actTitles[a.act]),
              React.createElement("span",{className:"tree-act-count"},a.scenes.length)),
            open[a.act] && React.createElement("div",{className:"tree-scenes"},
              a.scenes.map(s=>{
                const { flagged } = turnInfo(s);
                const dotcol = s.closeCharge>0?"var(--pos)":s.closeCharge<0?"var(--neg)":"var(--txt-3)";
                return React.createElement("div",{key:s.id,draggable:true,
                  onDragStart:(e)=>{ setDragId(s.id); e.dataTransfer.effectAllowed="move"; },
                  onDragOver:(e)=>{ e.preventDefault(); if(overId!==s.id) setOverId(s.id); },
                  onDragEnd:()=>{ setDragId(null); setOverId(null); },
                  onDrop:(e)=>{ e.preventDefault(); if(dragId&&dragId!==s.id&&onReorder) onReorder(idxOf(dragId), idxOf(s.id)); setDragId(null); setOverId(null); },
                  className:`tree-scene ${s.id===selId?"sel":""} ${overId===s.id&&dragId&&dragId!==s.id?"dragover":""}`,
                  onClick:()=>onSelect(s.id)},
                  React.createElement("span",{className:"tree-scene-no"},String(s.no).padStart(2,"0")),
                  React.createElement("span",{className:"tree-scene-dot",style:{background:dotcol}}),
                  React.createElement("span",{className:"tree-scene-title"},s.title),
                  flagged && React.createElement("span",{className:"tree-flag",title:"Doesn't turn"},
                    React.createElement(Icon.alert,{s:12})));
              }),
              onAddScene && React.createElement("div",{className:"tree-scene",style:{color:"var(--txt-3)",fontStyle:"italic"},
                onClick:()=>onAddScene(a.scenes.length?a.scenes[a.scenes.length-1].id:(scenes.length?scenes[scenes.length-1].id:null))},
                React.createElement("span",{className:"tree-scene-no"}),
                React.createElement("span",{style:{display:"flex",color:"var(--txt-3)"}},React.createElement(Icon.plus,{s:12})),
                React.createElement("span",{className:"tree-scene-title",style:{color:"var(--txt-3)"}},"Add scene"))))),
      ),
    ));
}
window.LeftRail = LeftRail;

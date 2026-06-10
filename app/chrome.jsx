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
  const inWriters = room!=="art";   // export is a Writers' Room (screenplay/story) action
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
function ViewNav({ room, view, setView, artView, setArtView, railOpen, inspOpen, onToggleRail, onToggleInsp, onCoordinate, onAgents, staleTabs }){
  const writersNav = [["spine","Spine",Icon.graph],["beats","Audit",Icon.grid],["board","Board",Icon.board],["script","Script",Icon.script]];
  const artNav = (window.ART_TABS||[]).map(t=>[t.id,t.label,Icon[t.icon]||Icon.user]);
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
    // LEFT zone — story-panel toggle (Writers' Room); empty in the Art Room. Balances the
    // right zone so the tab strip stays horizontally centered in both rooms.
    React.createElement("div",{className:"vn-side vn-left"},
      !inArt && React.createElement("button",{className:`tb-icon ${railOpen?"on":""}`,onClick:onToggleRail,title:"Toggle story panel"},
        React.createElement(Icon.panelLeft,{s:16}))),
    // CENTER — the room's view tabs, always centered
    React.createElement("div",{className:"segmented"},
      nav.map(([id,lab,Ic])=>
        React.createElement("button",{key:id,className:`seg ${cur===id?"on":""}`,onClick:()=>setCur(id),
          title:(inArt && staleTabs && staleTabs[id]) ? (lab+" — the Lookbook changed since this was drafted") : lab},
          React.createElement(Ic,{s:14}),React.createElement("span",{className:"seg-lab"},lab),
          (inArt && staleTabs && staleTabs[id]) && React.createElement("span",{className:"seg-stale-dot"})))),
    // RIGHT zone — the room's agent CTA, plus the inspector toggle (Writers' Room)
    React.createElement("div",{className:"vn-side vn-right"},
      cta,
      !inArt && React.createElement("button",{className:`tb-icon ${inspOpen?"on":""}`,onClick:onToggleInsp,title:"Toggle inspector"},
        React.createElement(Icon.panelRight,{s:16}))));
}
window.ViewNav = ViewNav;

const ROOMS = [
  { id:"writers", label:"Writers\u2019 Room", phase:"Development", icon:"script", live:true },
  { id:"art", label:"The Art Room", phase:"Pre-production", icon:"palette", live:true },
  { id:"stage", label:"The Stage", phase:"Production", icon:"clapper", live:false },
  { id:"cutting", label:"The Cutting Room", phase:"Post", icon:"scissorsCut", live:false },
];
window.ROOMS = ROOMS;

function RoomSwitcher({ room, setRoom }){
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    const h=(e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",h); return ()=>document.removeEventListener("mousedown",h);
  },[]);
  const cur = ROOMS.find(r=>r.id===room) || ROOMS[0];
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
          className:`room-item ${room===r.id?"on":""} ${r.live?"":"soon"}`,
          onClick:()=>{ if(r.live){ setRoom(r.id); setOpen(false); } }},
          React.createElement("span",{className:"room-item-no"},i+1),
          React.createElement("span",{className:"room-item-ic"},React.createElement(Icon[r.icon]||Icon.script,{s:15})),
          React.createElement("span",{className:"room-item-t"},
            React.createElement("span",{className:"room-item-name"},r.label),
            React.createElement("span",{className:"room-item-phase"},r.phase)),
          r.live
            ? (room===r.id && React.createElement("span",{className:"room-item-dot"}))
            : React.createElement("span",{className:"room-item-soon"},"Soon")))));
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

function TopBar({ room, setRoom, project, scenes, drafts, onReset, onNewStory, onToggleAI, onAgents, theme, onTheme, authSlot, projectSlot }){
  return React.createElement("div",{className:"topbar"},
    React.createElement("div",{className:"tb-left"},
      React.createElement("div",{className:"brand"},
        React.createElement(BrandMark,null),
        React.createElement("span",{className:"brand-name"},"T",React.createElement("b",null,"U"),"RN")),
      React.createElement("div",{className:"topbar-divider"}),
      // project title first, then the department (room) switcher
      React.createElement("div",{className:"context-group"},
        projectSlot || null,
        React.createElement(RoomSwitcher,{room,setRoom}))),

    React.createElement("div",{className:"tb-right"},
      React.createElement(ThemeToggle,{theme,onTheme}),
      React.createElement("button",{className:"tb-btn newstory",onClick:onNewStory,title:"Start a new story from an idea"},
        React.createElement(Icon.plus,{s:14}),"New Story"),
      // Export is a Writers' Room action (screenplay / story formats) — hidden in the Art Room
      room!=="art" && React.createElement(ExportMenu,{project,scenes,drafts,onReset}),
      React.createElement(OverflowMenu,{onNewStory,project,scenes,drafts,onReset,room}),
      // 'Agents' moved to the ViewNav's right zone (Writers' Room), mirroring the Art Room's
      // 'Run pre-production' — both sit to the right of their centered tab strip.
      authSlot || React.createElement("div",{className:"avatar"},"MV")),
  );
}
window.TopBar = TopBar;

/* collapsed vertical strip — left or right */
function CollapsedStrip({ side, label, icon:Ic, onExpand, flagCount }){
  return React.createElement("div",{className:`strip ${side}`},
    React.createElement("button",{className:"strip-btn",onClick:onExpand,title:`Expand ${label}`},
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

function LeftRail({ project, characters, scenes, selId, selChar, onSelect, onSelectChar, showFramework, onCollapse, onAddScene, onReorder, compact }){
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
      React.createElement(RailSection,{label:"Cast",icon:Icon.user,onAdd:()=>{},defaultOpen:true},
        characters.map(c=>{
          const driven = scenes.filter(s=>s.driver===c.id).length;
          return React.createElement("div",{key:c.id,
            className:"char-row"+(selChar===c.id?" sel":""),
            onClick:()=>onSelectChar&&onSelectChar(c.id)},
            React.createElement("div",{className:"char-av",style:{background:c.color}},
              c.name.split(" ").map(w=>w[0]).slice(0,2).join("")),
            React.createElement("div",{className:"char-info"},
              React.createElement("div",{className:"char-name"},c.name),
              React.createElement("div",{className:"char-role"},c.role)),
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

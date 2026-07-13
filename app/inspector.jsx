/* inspector.jsx — right panel: EDITABLE scene detail, charge editor, turn verdict, beats, analysis */

const KIND_OPTS_3ACT = [["normal","Scene"],["incite","Inciting Incident"],["act-climax","Act Climax"],
  ["midpoint","Mid-Act Climax"],["crisis","Crisis"],["story-climax","Story Climax"],["resolution","Resolution"]];
/* the kind dropdown lists the FRAMEWORK's milestones (frameworks.jsx kindOpts);
   a scene whose stored kind isn't in the list keeps it via an extra option. */
function kindOptsNow(){
  return (typeof fwKindOpts==="function" && fwKindOpts()) || KIND_OPTS_3ACT;
}

/* inline editable text — local state so the cursor never jumps */
function EditText({ value, onCommit, className, placeholder, multiline, autoFocus }){
  const [v,setV] = React.useState(value==null?"":value);
  React.useEffect(()=>{ setV(value==null?"":value); },[value]);
  const commit = ()=>{ if(v!==(value==null?"":value)) onCommit(v); };
  const Tag = multiline ? "textarea" : "input";
  // auto-grow a textarea to fit its content so the full text is always visible
  const ref = React.useRef(null);
  const fit = React.useCallback(()=>{
    const el = ref.current; if(!el || !multiline) return;
    el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
  },[multiline]);
  React.useLayoutEffect(()=>{ fit(); },[v, multiline, fit]);
  return React.createElement(Tag,{ ref, className:"edit-in "+(className||""), value:v, placeholder, autoFocus,
    onChange:e=>{ setV(e.target.value); if(multiline) fit(); }, onBlur:commit,
    onKeyDown:e=>{ if(!multiline && e.key==="Enter") e.target.blur(); },
    rows: multiline?2:undefined });
}

/* split a comma/semicolon/middot/newline list into trimmed items, but never
   inside a parenthetical clause (so "key (unknown purpose, possessive)" stays one
   item instead of splitting on the inner comma into a "possessive)" fragment) */
function splitListItems(value){
  let s = String(value==null?"":value);
  const stash = [];
  s = s.replace(/\([^()]*\)/g, m=>{ stash.push(m); return "\u0000"+(stash.length-1)+"\u0000"; });
  return s
    .split(/\s*(?:,|;|\u00b7|\u2022|\n)\s*/)
    .map(p=> p.replace(/\u0000(\d+)\u0000/g, (_,i)=> stash[+i]||"") )
    .map(p=>p.replace(/^(?:and|then|&)\s+/i,""))
    .map(p=>p.replace(/\.+$/,"").trim())
    .filter(Boolean)
    .reduce((acc,x)=> (typeof _mergeDanglingFragment==="function") ? _mergeDanglingFragment(acc,x) : (acc.push(x),acc), []);
}

/* The character `role` string packs up to three things the model emits together:
   FUNCTION [ \u00b7 ARCHETYPE ] [ \u2014 IDENTITY ]  (e.g. "Antagonist \u00b7 ideology \u2014 a far-right
   podcaster"). parseRole splits them; composeRole puts them back so `role` stays a
   single backing string everything else (prompts, left rail, MUSE) keeps using. */
function parseRole(roleStr){
  roleStr = String(roleStr||"").trim();
  const dashIdx = roleStr.search(/[\u2014\u2013]|--/);          // em / en dash, or "--"
  let head = roleStr, identity = "";
  if(dashIdx>=0){ head = roleStr.slice(0,dashIdx).trim(); identity = roleStr.slice(dashIdx).replace(/^[\u2014\u2013\-\s]+/,"").trim(); }
  let role = head, archetype = "";
  const dotIdx = head.indexOf("\u00b7");                        // middle dot separates fn \u00b7 archetype
  if(dotIdx>=0){ role = head.slice(0,dotIdx).trim(); archetype = head.slice(dotIdx+1).trim(); }
  return { role, archetype, identity };
}
function composeRole(parts){
  parts = parts || {};
  let s = String(parts.role||"").trim();
  const a = String(parts.archetype||"").trim();
  const i = String(parts.identity||"").trim();
  if(a) s += " \u00b7 " + a;
  if(i) s += " \u2014 " + i;
  return s;
}
/* capitalise just the first letter, leaving the rest untouched ("a Somali-British
   nurse" -> "A Somali-British nurse"). Used for display of the identity line. */
function capFirst(s){ s = String(s||""); return s ? s.charAt(0).toUpperCase()+s.slice(1) : s; }

/* EditableItemList — renders a list value (comma-separated under the hood) as a
   column of INDIVIDUALLY editable bullet rows. Each row is its own auto-growing
   field (edit in place, commit on blur) with a remove button; an "Add item" row
   appends a new bullet. The value stays a comma-joined string so prop-seeding and
   scene-mapping keep working unchanged. */
function EditableItemList({ value, placeholder, onCommit, onItemRemoved, onItemRenamed, ownerName }){
  const [items,setItems] = React.useState(()=>splitListItems(value));
  // only re-sync from the outside when the external value actually changed
  // (e.g. an AI re-draft) — never clobber mid-edit from our own commits
  const lastStr = React.useRef(splitListItems(value).join(", "));
  React.useEffect(()=>{
    const ext = String(value==null?"":value);
    if(ext !== lastStr.current){ const next=splitListItems(ext); setItems(next); lastStr.current = next.join(", "); }
  },[value]);
  const commit = (next)=>{
    const joined = next.map(s=>s.trim()).filter(Boolean).join(", ");
    lastStr.current = joined;
    onCommit(joined);
  };
  const setAt = (i,val)=>{
    const old = (items[i]||"").trim(); const nu = String(val||"").trim();
    const next=items.slice(); next[i]=val; setItems(next); commit(next);
    // editing an existing item = a RENAME → keep the matching prop card in sync
    // (skip the add case where there was no previous text)
    if(onItemRenamed && old && nu && old!==nu) onItemRenamed(old, nu);
  };
  const removeAt = async (i)=>{
    const itemText = (items[i]||"").trim();
    // When this list is wired to the Props tab, deleting a bullet also deletes the
    // matching prop card + its sheet — so confirm first (only for real, typed items).
    if(onItemRemoved && itemText){
      const ok = await window.appConfirm({
        title: "Remove \u201c"+itemText+"\u201d"+(ownerName?(" from "+ownerName):"")+"?",
        body: "This also deletes its prop card and any generated reference sheet from the Props tab.",
        note: "This can't be undone.",
        confirmLabel: "Remove", danger: true,
      });
      if(!ok) return;
    }
    const next=items.slice(); next.splice(i,1); setItems(next); commit(next);
    if(onItemRemoved && itemText) onItemRemoved(itemText);
  };
  const add = ()=>{ setItems(its=>[...its, ""]); };   // local-only until typed; empty is filtered on commit

  return React.createElement("div",{className:"eil"},
    items.length>0 && React.createElement("ul",{className:"eil-list"},
      items.map((it,i)=>React.createElement("li",{className:"eil-row",key:i},
        React.createElement("span",{className:"eil-dot"}),
        React.createElement(EditText,{value:it,placeholder:"Item\u2026",multiline:true,onCommit:val=>setAt(i,val)}),
        React.createElement("button",{className:"eil-del",title:"Remove item",onClick:()=>removeAt(i),tabIndex:-1},
          React.createElement(Icon.x,{s:12}))))),
    React.createElement("button",{className:"eil-add",onClick:add},
      React.createElement(Icon.plus,{s:12}), items.length?"Add item":(placeholder||"Add item")));
}

function Stepper({ value, onChange }){
  return React.createElement("div",{className:"stepper"},
    React.createElement("button",{className:"step-btn",onClick:()=>onChange(Math.max(-3,value-1))},
      React.createElement(Icon.minus,{s:14})),
    React.createElement("div",{className:`step-val ${chargeClass(value)}`},chargeStr(value)),
    React.createElement("button",{className:"step-btn",onClick:()=>onChange(Math.min(3,value+1))},
      React.createElement(Icon.plus,{s:14})));
}

function ChargeEditor({ scene, onCharge, onUpdate }){
  return React.createElement("div",{className:"charge-grid"},
    React.createElement("div",{className:"charge-cell"},
      React.createElement("div",{className:"lab"},"Opening value"),
      React.createElement(EditText,{value:scene.openValue,className:"charge-name",
        onCommit:v=>onUpdate(scene.id,{openValue:v})}),
      React.createElement(Stepper,{value:scene.openCharge,onChange:v=>onCharge("openCharge",v)})),
    React.createElement("div",{className:"charge-arrow"},React.createElement(Icon.arrowR,{s:16})),
    React.createElement("div",{className:"charge-cell"},
      React.createElement("div",{className:"lab"},"Closing value"),
      React.createElement(EditText,{value:scene.closeValue,className:"charge-name",
        onCommit:v=>onUpdate(scene.id,{closeValue:v})}),
      React.createElement(Stepper,{value:scene.closeCharge,onChange:v=>onCharge("closeCharge",v)})));
}

function Verdict({ scene }){
  const { flagged } = turnInfo(scene);
  // titles + flag icon come from the project's narrative framework (frameworks.jsx);
  // three-act reads exactly as before. The detail lines stay charge-factual.
  const aud = (typeof fwAuditOf==="function") ? fwAuditOf() : null;
  if(flagged) return React.createElement("div",{className:"verdict no"},
    React.createElement("span",{className:"verdict-icn"},React.createElement(Icon[(aud&&aud.flagIcon)||"scissors"]||Icon.scissors,{s:18})),
    React.createElement("div",null,
      React.createElement("div",{className:"verdict-t"},(aud&&aud.flagTitle)||"This scene doesn't turn"),
      React.createElement("div",{className:"verdict-d"},
        `Opens and closes on the same charge (${chargeStr(scene.openCharge)} \u2192 ${chargeStr(scene.closeCharge)}). `,
        (aud&&aud.flagDetail) || "If a scene doesn't turn a value, it's exposition \u2014 recharge it or cut it.")));
  return React.createElement("div",{className:"verdict ok"},
    React.createElement("span",{className:"verdict-icn"},React.createElement(Icon.check,{s:18})),
    React.createElement("div",null,
      React.createElement("div",{className:"verdict-t"},(aud&&aud.okTitle)||"This scene turns"),
      React.createElement("div",{className:"verdict-d"},
        `${scene.openValue} (${chargeStr(scene.openCharge)}) \u2192 ${scene.closeValue} (${chargeStr(scene.closeCharge)}). `,
        "A value-charged condition reverses \u2014 the scene earns its place.")));
}

/* ---------- editable beat map ---------- */
function BeatEditor({ scene, beats, onBeats, focusBeat, draft, characters }){
  const [deriving, setDeriving] = React.useState(false);
  const hasScript = !!(draft && ((draft.blocks && draft.blocks.length) || (Array.isArray(draft) && draft.length)));
  const deriveFromScript = async ()=>{
    if(!(hasScript && typeof window.aiBeatsFromScript==="function" && typeof aiAvailable==="function" && aiAvailable())) return null;
    try{ return await window.aiBeatsFromScript(scene, draft, characters); }catch(e){ return null; }
  };
  // empty-state button: derive from the script if it exists, else drop a blank skeleton.
  const createMap = async ()=>{
    if(deriving) return;
    if(hasScript){ setDeriving(true); const m = await deriveFromScript(); setDeriving(false);
      if(m && m.rows && m.rows.length){ onBeats(scene.id, m); return; } }
    onBeats(scene.id, { driverLabel:"DRIVER", reactorLabel:"REACTOR", desire:"", obstacle:"", turnAt:0,
      rows:[{n:1,drive:{a:"Action",d:""},react:{a:"Reaction",d:""}}] });
  };
  // in-editor button: (re)build the beats from the script WITHOUT clobbering on failure;
  // confirms first if the current map already has the user's content.
  const rebuildFromScript = async (blank)=>{
    if(deriving) return;
    if(!blank && typeof window.appConfirm==="function"){
      const ok = await window.appConfirm({ title:"Rebuild the beat map from the script?",
        body:"This replaces the current beats with ones derived from this scene's screenplay.",
        confirmLabel:"Rebuild", cancelLabel:"Cancel", danger:true });
      if(!ok) return;
    }
    setDeriving(true); const m = await deriveFromScript(); setDeriving(false);
    if(m && m.rows && m.rows.length) onBeats(scene.id, m);
  };
  const id = scene.id;
  // UNDO for beat deletion — the deleted row (with its position and the turn marker)
  // is held until the user restores it, deletes another, or switches scenes. Before
  // this, a mis-click destroyed the beat with no way back (auto-save had already
  // written the deletion to the cloud within a second).
  const [lastDeleted, setLastDeleted] = React.useState(null);   // {row, index, turnAt}
  React.useEffect(()=>{ setLastDeleted(null); },[id]);
  // reveal the beat the user clicked in the Script gutter — scroll it into view + flag it
  const rowRefs = React.useRef({});
  React.useEffect(()=>{
    if(focusBeat==null) return;
    const el = rowRefs.current[focusBeat];
    if(el && el.scrollIntoView) el.scrollIntoView({ block:"nearest", behavior:"smooth" });
  },[focusBeat, id]);
  if(!beats) return React.createElement("div",{className:"empty",style:{minHeight:150}},
    React.createElement(Icon.grid,{s:30}),
    React.createElement("div",{className:"empty-t"},"No beat map yet"),
    React.createElement("div",{className:"empty-d"}, hasScript
      ? "This scene is already written \u2014 build its beat map FROM the script (the action / reaction subtext of each beat)."
      : "Break this scene into beats \u2014 the action / reaction exchanges that carry its subtext."),
    React.createElement("button",{className:"flag-btn primary",style:{marginTop:4},disabled:deriving,onClick:createMap},
      deriving ? "Reading the script\u2026" : (hasScript ? "Create beat map from script" : "Create beat map")));

  const commit = (next)=>onBeats(id,next);
  const renumber = (rows)=>rows.map((r,k)=>({...r,n:k+1}));
  const setField = (patch)=>commit({...beats,...patch});
  const setCell = (i,side,field,val)=>commit({...beats, rows:beats.rows.map((r,j)=>
    j===i ? {...r,[side]:{...r[side],[field]:val}} : r)});
  const addBeat = ()=>commit({...beats, rows:[...beats.rows,
    {n:beats.rows.length+1, drive:{a:"Action",d:""}, react:{a:"Reaction",d:""}}]});
  const delBeat = (i)=>{
    setLastDeleted({ row: beats.rows[i], index: i, turnAt: beats.turnAt });
    const rows=renumber(beats.rows.filter((_,j)=>j!==i));
    commit({...beats, rows, turnAt: beats.turnAt>rows.length?0:beats.turnAt}); };
  const undoDelete = ()=>{ if(!lastDeleted) return;
    const rows = beats.rows.slice();
    rows.splice(Math.min(lastDeleted.index, rows.length), 0, lastDeleted.row);
    commit({...beats, rows:renumber(rows), turnAt:lastDeleted.turnAt});
    setLastDeleted(null); };
  const moveBeat = (i,dir)=>{ const j=i+dir; if(j<0||j>=beats.rows.length) return;
    const rows=beats.rows.slice(); const [m]=rows.splice(i,1); rows.splice(j,0,m);
    commit({...beats, rows:renumber(rows)}); };
  const toggleTurn = (n)=>commit({...beats, turnAt: beats.turnAt===n?0:n});

  // a beat map can be a bare skeleton (one empty row, no desire/obstacle) — detect it so
  // the "Build from script" button reads right and skips the overwrite confirm.
  const blankMap = (beats.rows||[]).length<=1
    && !(beats.rows||[]).some(r=>((r.drive&&r.drive.d)||"").trim() || ((r.react&&r.react.d)||"").trim())
    && !((beats.desire||"").trim()) && !((beats.obstacle||"").trim());
  return React.createElement("div",null,
    // restore chip — appears right after a delete, until restored / next delete / scene switch
    lastDeleted && React.createElement("button",{className:"beat-build-btn beat-undo-btn",
      onClick:undoDelete,
      title:"Put the beat you just deleted back in its place — with the scene's turn marker as it was"},
      React.createElement(Icon.undo,{s:12}),
      "Undo — restore deleted beat "+(lastDeleted.index+1)),
    hasScript && React.createElement("button",{className:"beat-build-btn primary",disabled:deriving,
      onClick:()=>rebuildFromScript(blankMap),
      title:"Read this scene's screenplay and build the beat / subtext map from it"},
      React.createElement(Icon.sparkles,{s:12}),
      deriving ? "Reading the script…" : (blankMap ? "Build from script" : "Rebuild from script")),
    // ("Redraft script from beats" lives in the SCRIPT view's toolbar only —
    // the duplicate button here was removed by product decision 2026-07-13.)
    React.createElement("div",{className:"beat-labels"},
      React.createElement("div",{className:"cell"},
        React.createElement("div",{className:"obj-lab",style:{marginBottom:3}},"Driver"),
        React.createElement(EditText,{value:beats.driverLabel,onCommit:v=>setField({driverLabel:v})})),
      React.createElement("div",{className:"cell"},
        React.createElement("div",{className:"obj-lab",style:{marginBottom:3}},"Reactor"),
        React.createElement(EditText,{value:beats.reactorLabel,onCommit:v=>setField({reactorLabel:v})}))),
    React.createElement("div",{style:{marginBottom:10}},
      React.createElement("div",{className:"obj-lab",style:{marginBottom:3}},"Desire"),
      React.createElement(EditText,{value:beats.desire,multiline:true,placeholder:"What the driver wants\u2026",onCommit:v=>setField({desire:v})}),
      React.createElement("div",{className:"obj-lab",style:{margin:"8px 0 3px"}},"Antagonism"),
      React.createElement(EditText,{value:beats.obstacle,multiline:true,placeholder:"What blocks it\u2026",onCommit:v=>setField({obstacle:v})})),

    beats.rows.map((r,i)=>
      React.createElement("div",{key:i, ref:(el)=>{ rowRefs.current[r.n]=el; },
        className:`beat-edit ${r.n===beats.turnAt?"turn":""} ${r.n===focusBeat?"focus":""}`},
        React.createElement("div",{className:"beat-edit-head"},
          React.createElement("span",{className:"bn"},r.n),
          React.createElement("button",{className:"beat-turn-btn",onClick:()=>toggleTurn(r.n)},
            React.createElement(Icon.bolt,{s:10}), r.n===beats.turnAt?"Turning point":"Mark turn"),
          React.createElement("div",{className:"beat-edit-tools"},
            React.createElement("button",{className:"bx",disabled:i===0,onClick:()=>moveBeat(i,-1)},React.createElement(Icon.chevU,{s:14})),
            React.createElement("button",{className:"bx",disabled:i===beats.rows.length-1,onClick:()=>moveBeat(i,1)},React.createElement(Icon.chevD,{s:14})),
            React.createElement("button",{className:"bx",onClick:()=>delBeat(i)},React.createElement(Icon.x,{s:13})))),
        React.createElement("div",{className:"beat-edit-cols"},
          React.createElement("div",{className:"beat-edit-col"},
            React.createElement("div",{className:"clab"},beats.driverLabel||"Action"),
            React.createElement(EditText,{value:r.drive.a,className:"bt-act",placeholder:"action",onCommit:v=>setCell(i,"drive","a",v)}),
            React.createElement(EditText,{value:r.drive.d,className:"bt-beh",multiline:true,placeholder:"behaviour\u2026",onCommit:v=>setCell(i,"drive","d",v)})),
          React.createElement("div",{className:"beat-edit-col"},
            React.createElement("div",{className:"clab"},beats.reactorLabel||"Reaction"),
            React.createElement(EditText,{value:r.react.a,className:"bt-act",placeholder:"reaction",onCommit:v=>setCell(i,"react","a",v)}),
            React.createElement(EditText,{value:r.react.d,className:"bt-beh",multiline:true,placeholder:"behaviour\u2026",onCommit:v=>setCell(i,"react","d",v)})))) ),

    React.createElement("button",{className:"add-beat",onClick:addBeat},
      React.createElement(Icon.plus,{s:14}),"Add beat"));
}

const ANALYSIS = (scene, beats) => [
  { lab:"Conflict", txt: React.createElement(React.Fragment,null,
      "Driver wants ", React.createElement("em",null,(scene.objective||"\u2014").replace(/^To /,"to ")),
      beats&&beats.obstacle ? React.createElement(React.Fragment,null,". Blocked by ",React.createElement("em",null,beats.obstacle.replace(/\.$/,""))) : ".") },
  { lab:"Opening Value", txt: React.createElement(React.Fragment,null,
      React.createElement("em",null,`${scene.openValue} (${chargeStr(scene.openCharge)})`)," \u2014 the charge at the door.") },
  { lab:"Beats", txt: beats
      ? `${beats.rows.length} action/reaction beats map the subtext beneath the dialogue.`
      : "Not yet broken into beats." },
  { lab:"Closing Value", txt: React.createElement(React.Fragment,null,
      React.createElement("em",null,`${scene.closeValue} (${chargeStr(scene.closeCharge)})`),
      turnInfo(scene).turned
        ? ((typeof fwAuditOf==="function" && fwAuditOf().analysisTurned)||" \u2014 the value has reversed. The scene turns.")
        : ((typeof fwAuditOf==="function" && fwAuditOf().analysisFlat)||" \u2014 unchanged. Flat exposition.")) },
  { lab:"Turning Point", txt: scene.turningPoint || "Locate the beat where the gap opens." },
];

function Inspector({ scene, beats, draft, onCharge, onUpdate, characters, scenes, onAddScene, onDeleteScene, onMove, onBeats, onRedraftScript,
                     sceneIndex, sceneCount, onCollapse, project, tab:tabProp, onTab, focusBeat }){
  // tab is controllable by the parent (e.g. the Script gutter opens the Beats tab);
  // falls back to local state when no controller is wired.
  const [tabState, setTabState] = React.useState("scene");
  const tab = tabProp || tabState;
  const setTab = onTab || setTabState;
  // driver options derive from the actual cast (plus the current value if it's an orphan)
  const driverOpts = (()=>{
    const list = (characters||[]).map(c=>[c.id, c.name]);
    if(scene && scene.driver && !list.some(o=>o[0]===scene.driver))
      list.push([scene.driver, scene.driver.charAt(0).toUpperCase()+scene.driver.slice(1)]);
    // no fallback to sample names — an empty cast means no driver options yet (add
    // cast first), never the Matrix sample's characters.
    return list;
  })();
  if(!scene) return React.createElement("div",{className:"inspector"},
    React.createElement("div",{style:{display:"flex",justifyContent:"flex-end",padding:"10px 12px 0"}},
      React.createElement("button",{className:"panel-collapse",onClick:onCollapse,title:"Collapse inspector"},
        React.createElement(Icon.chevR,{s:14}))),
    React.createElement("div",{className:"empty"},
      React.createElement(Icon.film,{s:34}),
      React.createElement("div",{className:"empty-t"},"No scene"),
      React.createElement("div",{className:"empty-d"},"Select a scene, or add one from the spine.")));

  const tabsBar = React.createElement("div",{className:"insp-tabs"},
    [["scene","Scene"],["beats","Beats"],["analysis","Analysis"]].map(([id,lab])=>
      React.createElement("button",{key:id,className:`insp-tab ${tab===id?"on":""}`,onClick:()=>setTab(id)},lab)),
    React.createElement("button",{className:"panel-collapse",onClick:onCollapse,title:"Collapse inspector",
      style:{marginLeft:"auto",alignSelf:"center",marginBottom:6}},React.createElement(Icon.chevR,{s:14})));

  return React.createElement("div",{className:"inspector"},
    tabsBar,
    React.createElement("div",{className:"insp-scroll"},
      tab==="scene" && React.createElement(React.Fragment,null,
        React.createElement("div",{className:"insp-eyebrow"},
          React.createElement("span",{className:"insp-scene-no"},String(scene.no).padStart(2,"0")),
          React.createElement("select",{className:"insp-select",value:scene.kind,
            onChange:e=>onUpdate(scene.id,{kind:e.target.value})},
            (()=>{ const opts=kindOptsNow();
              const extra = opts.some(([v])=>v===scene.kind) ? [] : [[scene.kind, (typeof fwKindLabel==="function"&&fwKindLabel(scene.kind))||scene.kind]];
              return opts.concat(extra).map(([v,l])=>React.createElement("option",{key:v,value:v},l)); })())),
        React.createElement(EditText,{value:scene.title,className:"insp-title",onCommit:v=>onUpdate(scene.id,{title:v})}),
        React.createElement(EditText,{value:scene.loc,className:"loc",onCommit:v=>onUpdate(scene.id,{loc:v})}),
        React.createElement("div",{style:{height:8}}),
        React.createElement(EditText,{value:scene.summary,className:"summary",multiline:true,onCommit:v=>onUpdate(scene.id,{summary:v})}),

        React.createElement("div",{className:"insp-block",style:{marginTop:16}},
          React.createElement("div",{className:"insp-block-head"},
            React.createElement("span",{className:"eyebrow"},React.createElement(Icon.graph,{s:12}),"Value Charge")),
          React.createElement(ChargeEditor,{scene,onCharge,onUpdate}),
          React.createElement("div",{style:{height:12}}),
          React.createElement(Verdict,{scene})),

        // which side of the controlling idea this scene argues — auto-derived from the
        // closing charge (positive asserts the idea), overridable per scene
        (()=>{
          const cur = (typeof themeArgues==="function") ? themeArgues(scene)
            : {side: Math.sign(scene.closeCharge)>0?"idea":Math.sign(scene.closeCharge)<0?"counter":"neither", explicit:!!scene.argues};
          const ci = project && project.controllingIdea;
          const ideaT = (ci && ci.value) ? ci.value : "the story's idea";
          return React.createElement("div",{className:"insp-block"},
            React.createElement("div",{className:"insp-block-head"},
              React.createElement("span",{className:"eyebrow"},React.createElement(Icon.mask,{s:12}),"Argues · controlling idea"),
              !cur.explicit && React.createElement("span",{className:"argues-auto"},"auto")),
            React.createElement("div",{className:"argues-seg"},
              [["idea","Idea"],["counter","Counter-idea"],["neither","Neither"]].map(([v,l])=>
                React.createElement("button",{key:v,
                  className:"argues-btn"+(cur.side===v?" on":""),
                  title: v==="idea" ? ("This scene asserts: "+ideaT)
                       : v==="counter" ? "This scene asserts the opposite — the counter-idea wins the moment"
                       : "This scene sits outside the argument",
                  // clicking the active explicit choice returns the scene to auto
                  onClick:()=>onUpdate(scene.id,{argues:(cur.side===v && cur.explicit) ? "" : v})},
                  l))),
            React.createElement("div",{className:"argues-hint"},
              cur.explicit
                ? "Set by you — click it again to go back to auto."
                : "Derived from the closing charge — a positive close asserts the idea. Click to override."));
        })(),

        React.createElement("div",{className:"insp-block"},
          React.createElement("div",{className:"insp-block-head"},
            React.createElement("span",{className:"eyebrow"},React.createElement(Icon.target,{s:12}),"Drive")),
          React.createElement("div",{className:"obj-row"},
            React.createElement("span",{className:"obj-icn"},React.createElement(Icon.user,{s:14})),
            React.createElement("div",{style:{flex:1}},
              React.createElement("div",{className:"obj-lab",style:{marginBottom:4}},"Driver"),
              React.createElement("select",{className:"insp-select",value:scene.driver,
                onChange:e=>onUpdate(scene.id,{driver:e.target.value})},
                driverOpts.map(([v,l])=>React.createElement("option",{key:v,value:v},l))),
              React.createElement("div",{style:{height:8}}),
              React.createElement(EditText,{value:scene.objective,multiline:true,
                placeholder:"What the driver pursues in this scene\u2026",
                onCommit:v=>onUpdate(scene.id,{objective:v})}))),
          React.createElement("div",{className:"obj-row"},
            React.createElement("span",{className:"obj-icn"},React.createElement(Icon.layers,{s:14})),
            React.createElement("div",null,
              React.createElement("div",{className:"obj-lab",style:{marginBottom:5}},
                "Conflict level \u00b7 ",["Inner","Personal","Extra-personal"][scene.conf-1]),
              React.createElement("div",{className:"conf-edit"},
                [1,2,3].map(i=>React.createElement("div",{key:i,className:`pip ${i<=scene.conf?"on":""}`,
                  title:["Inner","Personal","Extra-personal"][i-1],
                  onClick:()=>onUpdate(scene.id,{conf:i})})))))),

        (typeof SceneContinuity==="function") && React.createElement(SceneContinuity,{scene,scenes,characters}),

        React.createElement("div",{className:"insp-actions"},
          React.createElement("button",{className:"ia-btn",disabled:sceneIndex<=0,onClick:()=>onMove(scene.id,-1)},
            React.createElement(Icon.chevU,{s:14}),"Up"),
          React.createElement("button",{className:"ia-btn",disabled:sceneIndex>=sceneCount-1,onClick:()=>onMove(scene.id,1)},
            React.createElement(Icon.chevD,{s:14}),"Down"),
          React.createElement("button",{className:"ia-btn",onClick:()=>onAddScene(scene.id)},
            React.createElement(Icon.plus,{s:14}),"Add after"),
          React.createElement("button",{className:"ia-btn danger",onClick:()=>onDeleteScene(scene.id)},
            React.createElement(Icon.x,{s:13}),"Delete"))),

      tab==="beats" && React.createElement("div",{style:{paddingTop:2}},
        React.createElement("div",{className:"insp-eyebrow",style:{marginBottom:10}},
          React.createElement("span",{className:"insp-scene-no"},String(scene.no).padStart(2,"0")),
          React.createElement("span",{className:"eyebrow"},"Beat / Subtext map \u2014 editable")),
        React.createElement(BeatEditor,{scene,beats,onBeats,focusBeat,draft,characters})),

      tab==="analysis" && React.createElement("div",{style:{paddingTop:2}},
        React.createElement("div",{className:"divider"},
          React.createElement("span",{className:"eyebrow"},"5-Step Scene Analysis"),
          React.createElement("span",{className:"ln"})),
        React.createElement("div",{className:"steps"},
          ANALYSIS(scene,beats).map((s,i)=>
            React.createElement("div",{key:i,className:"step-item"},
              React.createElement("div",{className:"step-num"},i+1),
              React.createElement("div",{className:"step-body"},
                React.createElement("div",{className:"step-lab"},s.lab),
                React.createElement("div",{className:"step-txt"},s.txt))))))),
  );
}
window.Inspector = Inspector;

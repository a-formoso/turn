/* locations-ui.jsx — The Art Room ▸ Locations tab (React).
   Mirrors PropSheets: derive-from-script → draft fields → generate a multi-angle
   coverage plate → per-scene batch. Adds time-of-day / weather VARIANT plates and
   reads the Style Bible preset assigned to each location's scenes. */

function locSwatch(intExt){
  return /EXT/.test(intExt||"")
    ? "linear-gradient(135deg,#3f7a52,#1d3326)"      // exterior — green
    : "linear-gradient(135deg,#4a5a78,#222c3e)";     // interior — slate
}

function LocationSheet({ l, project, scenes, onUpdate, onDelete, onDraft, drafting, onView, batchActiveId, onBatchDone, onChipClick, onDraftStaging, draftingStage }){
  const d = locVisualDefaults(l);
  const scenePresets = (typeof locScenePresets==="function") ? locScenePresets(l, project) : [];
  const finalPrompt = combinedLocationPrompt(l, project, {});
  const drafted = locVisualsDrafted(l);
  const initials = (l.name||"?").replace(/^the\s+/i,"").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();

  // time-of-day is script-derived (no manual control): keep it in sync with the
  // current derivation. Reads ONLY the scenes' slugline time tags (not prose
  // summaries), keeps every distinct real time, and CLEARS values when the script
  // states no real time (Continuous / Loading Program → "time unset").
  React.useEffect(()=>{
    if(typeof deriveLocationTimes!=="function") return;
    const next = deriveLocationTimes(l, scenes);
    const cur = l.times || [];
    const same = next.length===cur.length && next.every((t,i)=>t===cur[i]);
    if(!same) onUpdate(l.id, { times: next });
  },[l.id, scenes]);

  const gen = useImageGen({
    id: l.id, slotId: "locref-"+l.id,
    /* Clear cascades to this location's time-of-day variant plates so they aren't
       orphaned in storage. */
    relatedClearIds: ()=> (l.variants||[]).map(v=> l.id+"-"+v.id),
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildLocationFromPhotoPrompt(l, project),
    buildSimple: ()=> buildSimpleLocationPrompt(l),
    buildEdit: (instr)=>
      "Edit this location reference plate for "+(l.name||"the place")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else \u2014 the SAME architecture, proportions, materials and light "
      +"across all panels. Keep the same multi-angle grid of the same empty space. "
      +"Do not redesign or re-imagine the location.",
  });

  // batch generation: parent activates this card by id; generate then report done
  const batchStarted = React.useRef(false);
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===l.id;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){ batchStarted.current=true; wasGening.current=false; gen.generate(); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(l.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, l.id]);

  const sceneById = React.useMemo(()=>{ const m={}; (scenes||[]).forEach(s=>{ m[s.id]=s; }); return m; },[scenes]);
  const locScenes = (l.scenes||[]).map(id=>sceneById[id]).filter(Boolean).sort((a,b)=>(a.no||0)-(b.no||0));

  // time-of-day / weather variants
  const addVariant = ()=>{
    const used = (l.variants||[]).map(v=>v.time);
    const suggest = (l.times||[]).find(t=>used.indexOf(t)<0) || "Night";
    onUpdate(l.id,{ variants:[...(l.variants||[]), { id:"v"+Date.now().toString(36), time:suggest }] });
  };
  const updateVariant = (vid,patch)=> onUpdate(l.id,{ variants:(l.variants||[]).map(v=>v.id===vid?{...v,...patch}:v) });
  const removeVariant = (vid)=> onUpdate(l.id,{ variants:(l.variants||[]).filter(v=>v.id!==vid) });

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===l.id?" batch-on":"")},
    React.createElement(SheetFrame,{ gen, slotId:"locref-"+l.id, name:l.name, avatarColor:locSwatch(l.intExt),
      initials, drafted, drafting, onDraft:()=>onDraft(l), entity:l, onView,
      slotPlaceholder:"Drop a photo of the place", noun:"location plate",
      specGate:{ ready:(drafted || !l.manual), hint:"Draft the design spec first \u2014 architecture, materials & light are what the plate is built from." },
      onDelete:()=>onDelete(l.id), deleteLabel:"Delete location" }),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"sheet-name loc-name-row"},
            React.createElement("span",{className:"loc-intext-badge "+(/EXT/.test(l.intExt||"")?"ext":"int")},l.intExt||"INT"),
            React.createElement(EditText,{value:l.name,placeholder:"Location name\u2026",onCommit:val=>onUpdate(l.id,{name:val})})),
          React.createElement("div",{className:"sheet-role"},
            scenePresets.length ? React.createElement("span",{className:"loc-style-chip lead",
              title:"Style Bible presets the scenes here use \u2014 the grade is applied per shot, not baked into this reference plate"},
              ...scenePresets.map(p=>React.createElement("span",{key:p.id,className:"loc-style-dot",style:{background:(p.palette&&p.palette[0])||"#888"}})),
              scenePresets.map(p=>p.name).join(", ")) : null),
          React.createElement("div",{className:"prop-scenes"},
            locScenes.length
              ? [ React.createElement("span",{key:"lab",className:"prop-scenes-lab"},"Scenes"),
                  ...locScenes.map(s=>React.createElement("button",{key:s.id,className:"prop-scene-chip",
                    title:s.title||("Scene "+s.no),onClick:()=>onChipClick&&onChipClick(s.id)},
                    String(s.no).padStart(2,"0"))) ]
              : React.createElement("span",{className:"prop-scenes-none"},"No scenes reference this place"))),
        React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(l)},
          React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details")),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"Details not drafted yet \u2014 click ",
          React.createElement("b",null,"Draft details")," to design the space's architecture & light.")),

      React.createElement(CardFold,{label:"The space",defaultOpen:(!drafted && !!l.manual)},
        React.createElement("div",{className:"sheet-field"},
          React.createElement("div",{className:"obj-lab"},"INT / EXT"),
          React.createElement("select",{className:"prop-select",value:l.intExt||"INT",
            onChange:e=>onUpdate(l.id,{intExt:e.target.value})},
            ["INT","EXT","INT/EXT"].map(o=>React.createElement("option",{key:o,value:o},o)))),
        React.createElement(SheetField,{label:"Architecture & layout",value:l.architecture,multiline:true,
          placeholder:"The space's layout, scale, structure and defining built features\u2026",onCommit:val=>onUpdate(l.id,{architecture:val})}),
        React.createElement(SheetField,{label:"Materials & palette",value:l.materials,multiline:true,
          placeholder:"Surfaces, colours, textures, wear, set dressing\u2026",onCommit:val=>onUpdate(l.id,{materials:val})}),
        React.createElement(SheetField,{label:"Lighting & atmosphere",value:l.lighting,multiline:true,
          placeholder:"Light sources, quality, colour, mood \u2014 and how it shifts by time of day\u2026",onCommit:val=>onUpdate(l.id,{lighting:val})})),

      React.createElement(CardFold,{label:"Significance",defaultOpen:false},
        React.createElement(SheetField,{label:"What this place means in the story",value:l.significance,multiline:true,
          placeholder:"Its dramatic role \u2014 what happens here, what it represents\u2026",onCommit:val=>onUpdate(l.id,{significance:val})})),

      React.createElement(CardFold,{label:"Staging \u2014 Depth Grid",defaultOpen:false},
        React.createElement(StagingGrid,{l,onUpdate,onDraftStaging,draftingStage})),

      React.createElement(CardFold,{label:"Time-of-day variants",defaultOpen:false},
        React.createElement("div",{className:"loc-variants"},
          (l.variants||[]).length
            ? (l.variants||[]).map(v=>React.createElement(LocationVariant,{key:v.id, l, v, project,
                onTime:(t)=>updateVariant(v.id,{time:t}), onRemove:()=>removeVariant(v.id), onView}))
            : React.createElement("div",{className:"loc-variants-empty"},"No variants yet \u2014 add a Night / Day / weather version of this plate."),
          React.createElement("button",{className:"art-draftall ghost loc-variant-add",onClick:addVariant},
            React.createElement(Icon.plus,{s:13}),"Add variant"))),

      React.createElement(CardFold,{label:"Look dev",defaultOpen:false},
        scenePresets.length ? React.createElement("div",{className:"loc-style-note"},
          React.createElement(Icon.layers,{s:12}),
          React.createElement("span",null,"Scenes here use ",
            React.createElement("b",null,scenePresets.map(p=>p.name).join(", ")),
            " in the Style Bible. This reference plate is rendered grade-neutral on purpose \u2014 that scene grade is applied per shot, not baked into the plate.")) : null,
        React.createElement(SheetField,{label:"Render style \u2014 the neutral look this reference plate is rendered in",value:l.renderStyle||d.renderStyle,multiline:true,
          placeholder:"photoreal architectural cinematography, wide lens, natural light\u2026",onCommit:val=>onUpdate(l.id,{renderStyle:val})})),

      React.createElement(CardFold,{label:"Master reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"6-panel coverage plate \u2014 feed to your image tool",text:buildLocationRefPrompt(l,project,{})}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:l.negativePrompt||d.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(l.id,{negativePrompt:val})}),
        React.createElement(CopyBox,{label:"Final prompt \u2014 master + negative (sent to Nano Banana)",text:finalPrompt}))));
}

/* the 3×3 depth-grid staging editor — a top-down map of the space. Each cell is
   an EditText (empty = open space). Rows: Background / Midground / Foreground;
   cols: Left / Center / Right. Plus Floor, Scale Class and Camera/Lens. */
function StageCell({ label, sub, role, value, placeholder, onCommit, accent, wide }){
  const filled = !!(value||"").trim();
  return React.createElement("div",{className:"stage-cell"+(filled?" filled":"")+(accent?" "+accent:"")+(wide?" wide":"")},
    React.createElement("div",{className:"stage-cell-lab"},
      React.createElement("span",{className:"stage-cell-zone"},label,
        sub && React.createElement("span",{className:"stage-cell-sub"},sub)),
      role && React.createElement("span",{className:"stage-cell-role"},role)),
    React.createElement(EditText,{value:value||"",multiline:true,placeholder:placeholder||"open space\u2026",onCommit}));
}
function StagingGrid({ l, onUpdate, onDraftStaging, draftingStage }){
  const s = (typeof stagingOf==="function") ? stagingOf(l) : (l.staging||{bg:{},mid:{},fg:{}});
  const set = (patch)=>{
    const next = { scaleClass:s.scaleClass, lens:s.lens, floor:s.floor,
      bg:{...s.bg}, mid:{...s.mid}, fg:{...s.fg} };
    // patch is a path like {plane:'bg',col:'left',val:'...'} or {key:'scaleClass',val}
    if(patch.key){ next[patch.key] = patch.val; }
    else { next[patch.plane][patch.col] = patch.val; }
    onUpdate(l.id,{ staging: next });
  };
  return React.createElement("div",{className:"stage-wrap"},
    React.createElement("div",{className:"stage-toolbar"},
      React.createElement("div",{className:"stage-meta-fields"},
        React.createElement("label",{className:"stage-meta-field"},
          React.createElement("span",{className:"stage-meta-lab"},"Scale class"),
          React.createElement(EditText,{value:s.scaleClass||"",placeholder:"Human scale / Gigantism\u2026",onCommit:val=>set({key:"scaleClass",val})})),
        React.createElement("label",{className:"stage-meta-field"},
          React.createElement("span",{className:"stage-meta-lab"},"Camera / lens"),
          React.createElement(EditText,{value:s.lens||"",placeholder:"35mm wide / 100mm macro\u2026",onCommit:val=>set({key:"lens",val})}))),
      onDraftStaging && React.createElement("button",{className:"art-draftall",disabled:draftingStage,onClick:()=>onDraftStaging(l),
        title:"Let AI stage this location's depth grid from the script"},
        React.createElement(Icon.sparkles,{s:13}), draftingStage?"Staging\u2026":"Draft staging")),
    React.createElement("div",{className:"stage-legend"},
      React.createElement(Icon.layers?Icon.layers:Icon.eye,{s:12}),
      React.createElement("span",null,"Top-down view of the frame \u2014 rows are depth (background \u2192 foreground), columns are screen position (left \u2192 right). Leave a cell blank for open space.")),
    React.createElement("div",{className:"stage-grid"},
      // BACKGROUND row (farthest from camera)
      React.createElement(StageCell,{label:"Background left",sub:"L3",value:s.bg.left,onCommit:val=>set({plane:"bg",col:"left",val})}),
      React.createElement(StageCell,{label:"Background center",role:"Wall A",accent:"wallA",value:s.bg.center,
        placeholder:"primary landmark\u2026",onCommit:val=>set({plane:"bg",col:"center",val})}),
      React.createElement(StageCell,{label:"Background right",sub:"R3",value:s.bg.right,onCommit:val=>set({plane:"bg",col:"right",val})}),
      // MIDGROUND row (subject plane)
      React.createElement(StageCell,{label:"Midground left",role:"Wall B",accent:"wallB",value:s.mid.left,
        placeholder:"primary framing element\u2026",onCommit:val=>set({plane:"mid",col:"left",val})}),
      React.createElement(StageCell,{label:"Midground center",role:"Subject",accent:"subject",value:s.mid.center,
        placeholder:"where the character stands \u2014 usually left empty",onCommit:val=>set({plane:"mid",col:"center",val})}),
      React.createElement(StageCell,{label:"Midground right",role:"Wall C",accent:"wallC",value:s.mid.right,
        placeholder:"secondary framing element\u2026",onCommit:val=>set({plane:"mid",col:"right",val})}),
      // FOREGROUND row (closest to camera)
      React.createElement(StageCell,{label:"Foreground left",sub:"L1",value:s.fg.left,placeholder:"foreground veil\u2026",onCommit:val=>set({plane:"fg",col:"left",val})}),
      React.createElement("div",{className:"stage-cell camera"},
        React.createElement("div",{className:"stage-cell-lab"},
          React.createElement("span",{className:"stage-cell-zone"},"Foreground center"),
          React.createElement("span",{className:"stage-cell-role"},"camera")),
        React.createElement("div",{className:"stage-camera-mark"},React.createElement(Icon.camera?Icon.camera:Icon.eye,{s:18}),
          React.createElement("span",null,s.lens||"viewer / lens"))),
      React.createElement(StageCell,{label:"Foreground right",sub:"R1",value:s.fg.right,placeholder:"foreground veil\u2026",onCommit:val=>set({plane:"fg",col:"right",val})})),
    // FLOOR strip
    React.createElement(StageCell,{label:"Floor \u2014 ground plane",value:s.floor,wide:true,
      placeholder:"surface texture underfoot\u2026",onCommit:val=>set({key:"floor",val})}));
}

/* one time-of-day variant: its own image slot + a small establishing-frame generator */
function LocationVariant({ l, v, project, onTime, onRemove, onView }){
  const gen = useImageGen({
    id: l.id+"-"+v.id, slotId: "locvar-"+l.id+"-"+v.id,
    buildFinal: ()=> buildLocationVariantPrompt(l, project, { time:v.time }),
    buildSimple: ()=> buildSimpleLocationPrompt(l),
    buildEdit: (instr)=> "Edit this establishing frame of "+(l.name||"the place")+" ("+v.time+"). Apply ONLY: "+instr+". Keep the same space and architecture.",
  });
  return React.createElement("div",{className:"loc-variant"},
    React.createElement("div",{className:"loc-variant-head"},
      React.createElement(EditText,{value:v.time,placeholder:"Night / Day / Rain\u2026",onCommit:onTime}),
      React.createElement("button",{className:"loc-variant-x",title:"Remove variant",onClick:onRemove},React.createElement(Icon.x,{s:12}))),
    React.createElement(SheetFrame,{ gen, slotId:"locvar-"+l.id+"-"+v.id, name:(l.name||"")+" \u00b7 "+v.time,
      avatarColor:locSwatch(l.intExt), initials:(v.time||"?").slice(0,2).toUpperCase(), drafted:true, drafting:false,
      entity:l, onView, slotPlaceholder:"Drop a photo", noun:"variant", compact:true }));
}

function LocationSheets({ project, locations, scenes, onUpdate, onDraft, onDraftAll, onAdd, onDelete, draftingId, draftingAll, onPullFromScript, scriptHasLocs, onDraftStaging, draftingStageId }){
  const [view, setView] = React.useState(null);
  const [sceneFilter, setSceneFilter] = React.useState("");
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = locations || [];
  const sceneList = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const inScene = (l, sid)=> Array.isArray(l.scenes) && l.scenes.indexOf(sid)>=0;
  const shown = sceneFilter ? list.filter(l=>inScene(l, sceneFilter)) : list;
  const sceneNoOf = (sid)=>{ const s=(scenes||[]).find(x=>x.id===sid); return s?s.no:sid; };

  // ---- batch generation ---- (eligible = drafted locations only; the spec is what
  // the plate is built from, so an undrafted/hand-added card never makes a generic plate)
  const draftedIds = (subset)=> subset.filter(l=> (typeof locVisualsDrafted==="function") ? locVisualsDrafted(l) : true).map(l=>l.id);
  const startSceneBatch = ()=>{
    if(!sceneFilter || batchActiveId) return;
    const eligible = draftedIds(shown);
    if(!eligible.length){ batch.setMsg("Draft these locations first \u2014 nothing in this scene is ready to generate."); return; }
    batch.begin(eligible, shown.length - eligible.length);
  };
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Draft the locations first \u2014 nothing is ready to generate yet."); return; }
    if(sceneFilter) setSceneFilter("");
    batch.begin(eligible, list.length - eligible.length);
  };
  const eligibleAll = list.filter(l=> (typeof locVisualsDrafted==="function") ? locVisualsDrafted(l) : true).length;

  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t"},"Locations"),
          React.createElement("div",{className:"art-intro-d"},
            "Every place the film visits, pulled straight from the script's sluglines. Each gets a multi-angle coverage plate \u2014 the same space from several views \u2014 so any shot set there matches its geometry, materials and light. ",
            "Generate locations here, then reference them when you build shots.")),
        React.createElement("div",{className:"art-intro-actions"},
          React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
            React.createElement(Icon.plus,{s:14}),"Add location"),
          React.createElement("button",{className:"art-draftall",disabled:draftingAll||(!list.length&&!scriptHasLocs),onClick:onDraftAll,
            title:"Build every location from the story in one pass \u2014 pull any missing places from the script's sluglines, draft each spec (the space, significance, look dev), and stage its depth grid"},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Draft all locations"),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the coverage plate for every drafted location \u2014 you choose whether to redo ones that already have a plate"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all locations"))),),
    BatchBar && React.createElement(BatchBar,{batch,noun:"location"}),
    sceneList.length>0 && list.length>0 && React.createElement("div",{className:"prop-scenebar"},
      React.createElement("span",{className:"prop-scenebar-lab"},React.createElement(Icon.layers,{s:13}),"Focus a scene"),
      React.createElement("select",{className:"prop-select prop-scenebar-select",value:sceneFilter,
        onChange:e=>setSceneFilter(e.target.value)},
        React.createElement("option",{value:""},"All scenes \u2014 show every location"),
        sceneList.map(s=>{
          const n = list.filter(l=>inScene(l,s.id)).length;
          return React.createElement("option",{key:s.id,value:s.id},
            "Scene "+String(s.no).padStart(2,"0")+" \u00b7 "+(s.title||"")+"  ("+n+" location"+(n!==1?"s":"")+")");
        })),
      sceneFilter && React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId,onClick:startSceneBatch,
        title:"Generate coverage plates for the locations in this scene"},
        React.createElement(Icon.sparkles,{s:14}),
        batchActiveId?"Generating\u2026":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")))),
    list.length
      ? (shown.length
          ? React.createElement("div",{className:"sheet-grid"},
              shown.map(l=>React.createElement(LocationSheet,{key:l.id,l,project,scenes,onUpdate,onDelete,onDraft,
                drafting:draftingId===l.id||draftingAll,onView:(url,pr)=>setView({url,character:pr}),
                batchActiveId,onBatchDone:batch.advance,onChipClick:(sid)=>setSceneFilter(sid),
                onDraftStaging,draftingStage:draftingStageId===l.id})))
          : React.createElement("div",{className:"prop-empty"},
              React.createElement("div",{className:"art-soon-t"},"No locations in this scene"),
              React.createElement("button",{className:"art-draftall",style:{marginTop:16},onClick:()=>setSceneFilter("")},"Show all locations")))
      : React.createElement("div",{className:"prop-empty"},
          React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon.layers,{s:30})),
          React.createElement("div",{className:"art-soon-t"},"No locations yet"),
          React.createElement("div",{className:"art-soon-d"}, scriptHasLocs
            ? "Your script's scene sluglines name the places this story visits \u2014 \u201cDraft all locations\u201d pulls them in, drafts each spec, and stages its depth grid in one pass. Or add one by hand."
            : "Add a location to start building its reference plate \u2014 a room, a street, a world."),
          React.createElement("div",{style:{display:"flex",gap:8,marginTop:16}},
            scriptHasLocs && React.createElement("button",{className:"art-draftall",disabled:draftingAll,onClick:onDraftAll},
              React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Draft all locations"),
            React.createElement("button",{className:scriptHasLocs?"art-draftall ghost":"art-draftall",onClick:onAdd},
              React.createElement(Icon.plus,{s:14}),scriptHasLocs?"Add by hand":"Add your first location"))));
}
window.LocationSheets = LocationSheets;

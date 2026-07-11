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

  // render style — same dropdown + "Surprise me" behaviour as the character cards
  const [styling, setStyling] = React.useState(false);
  // transient "saved · unlock" chip — visible ~4s after landing on the user's own locked style
  const [unlockVisible, setUnlockVisible] = React.useState(false);
  React.useEffect(()=>{
    if(window.turnIsUserStyle && window.turnIsUserStyle(l.renderStyleKey)){
      setUnlockVisible(true); const t=setTimeout(()=>setUnlockVisible(false),4000); return ()=>clearTimeout(t);
    }
    setUnlockVisible(false);
  },[l.renderStyleKey]);
  const locBible = ()=> [l.name&&("Name: "+l.name), l.architecture&&("Architecture: "+l.architecture),
    l.materials&&("Materials: "+l.materials), l.lighting&&("Lighting: "+l.lighting), l.significance&&("Significance: "+l.significance),
    (project&&project.genre)&&("Genre: "+project.genre)].filter(Boolean).join("\n");
  const LOC_TEXT = window.LOC_RENDER_TEXT || {};
  const rollSurprise = async ()=>{
    if(!(typeof aiSurpriseStyleText==="function" && typeof aiAvailable==="function" && aiAvailable())) return;
    setStyling(true);
    try{ const r = await aiSurpriseStyleText({ name:l.name, kind:"location", bible:locBible() }, project);
      if(r) onUpdate(l.id, { surpriseRender:r, renderStyle:r.style }); }catch(e){}
    setStyling(false);
  };
  const pickLocStyle = async (key)=>{
    if(key!=="surprise"){ onUpdate(l.id, { renderStyleKey:key, renderStyle:(typeof window.renderStyleText==="function" ? window.renderStyleText("loc", key) : (LOC_TEXT[key]||LOC_TEXT.photoreal)) }); return; }
    onUpdate(l.id, { renderStyleKey:"surprise" });
    if(l.surpriseRender && l.surpriseRender.style){ onUpdate(l.id, { renderStyle:l.surpriseRender.style }); return; }
    await rollSurprise();
  };
  // LOCK a surprise style → a reusable named style. Location surprise is a STRING, wrapped into
  // a minimal render block the shared registry resolves on every tab.
  const lockSurprise = async ()=>{
    if(!(l.surpriseRender && l.surpriseRender.style) || typeof window.turnLockRenderStyle!=="function") return;
    const block = { rendering:String(l.surpriseRender.style), rules:["no text, labels, watermarks, annotations, typography or captions"] };
    const key = await window.turnLockRenderStyle(l.surpriseRender.label, block);
    if(key){ onUpdate(l.id, { renderStyleKey:key, renderStyle:(typeof window.renderStyleText==="function"?window.renderStyleText("loc",key):l.surpriseRender.style) });
      if(typeof window.appToast==="function") window.appToast("Style locked — now reusable across Characters, Props & Locations"); }
  };
  const unlockCurrent = async ()=>{
    if(!(window.turnIsUserStyle && window.turnIsUserStyle(l.renderStyleKey))) return;
    const ok = window.appConfirm ? await window.appConfirm({ title:"Unlock this saved style?",
      body:"It's removed from your saved styles. Cards still using it fall back to Photoreal." }) : true;
    if(!ok) return; const k=l.renderStyleKey; window.turnUnlockRenderStyle(k);
    onUpdate(l.id,{ renderStyleKey:"photoreal", renderStyle:(typeof window.renderStyleText==="function"?window.renderStyleText("loc","photoreal"):"") });
  };

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
    entity: l,
    /* Clear cascades to this location's time-of-day variant plates so they aren't
       orphaned in storage. */
    relatedClearIds: ()=> (l.variants||[]).map(v=> l.id+"-"+v.id),
    buildFinal: ()=> finalPrompt,
    buildFromPhoto: ()=> buildLocationFromPhotoPrompt(l, project),
    buildSimple: ()=> buildSimpleLocationPrompt(l),
    /* NO set-dressing refs at generation — the clean plate anchors the look;
       fixtures are painted in afterwards via the Edit panel's Set-dressing buttons */
    buildEdit: (instr)=>
      "Edit this location reference plate for "+(l.name||"the place")+". "
      +"Apply ONLY this change: "+instr+". "
      +"Preserve everything else \u2014 the SAME architecture, proportions, materials and light "
      +"across all panels. Keep the same multi-angle grid of the same empty space. "
      +"Do not redesign or re-imagine the location.",
  });

  // this location's set-dressing props — offered as one-click edit instructions in
  // the plate's Edit panel. The SHELL prop (the object this location is the interior
  // of) is excluded from the add-fixture chips — you can't place a thing inside its
  // own inside — and gets its own "Match shell" chip instead.
  const shellProp = (typeof locShellProp==="function") ? locShellProp(l) : null;
  const dressProps = ((typeof locDressingProps==="function") ? locDressingProps(l) : [])
    .filter(p=> !shellProp || p.id!==shellProp.id);
  const sheetRefOf = (p)=> async ()=>{ let u = (typeof nbGetImage==="function") ? nbGetImage(p.id) : "";
    if(!u && typeof nbLoadImage==="function"){ try{ u = await nbLoadImage(p.id); }catch(e){} }
    return u||""; };
  // every set-dressing object — candidates for the "Interior of" shell link
  const dressAll = (((window.turnContinuity||{}).props)||[]).filter(p=>p && p.kind==="dressing");

  // batch generation: parent activates this card by id; generate then report done.
  // REMOUNT-SAFE (see CharacterSheet): seed batchStarted from the in-flight registry so
  // a card remounting mid-generation doesn't fire a second generate on completion.
  const _lslot = "locref-"+l.id;
  const batchStarted = React.useRef(!!(window.__nbGenInflight && window.__nbGenInflight[_lslot]));
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===l.id;
    const inflight = !!(window.__nbGenInflight && window.__nbGenInflight[_lslot]);
    if(!mine){ batchStarted.current=inflight; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening && !inflight){ batchStarted.current=true; wasGening.current=false; gen.generate(); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(l.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, l.id]);

  // ---- per-PANEL edit (like the Storyboard's "Edit a panel") -----------------
  // A plate is a 2×2 grid of views of ONE space. Edit ONE quadrant via a position-
  // scoped instruction on the whole image (image-edit off the current plate, so it
  // works for generated AND uploaded plates alike). Position-scoped, so it's robust
  // even for legacy 6-panel plates.
  const LOC_PANELS = [
    { grid:"TOP-LEFT",     label:"Top-left",     hint:"wide establishing" },
    { grid:"TOP-RIGHT",    label:"Top-right",    hint:"high overview" },
    { grid:"BOTTOM-LEFT",  label:"Bottom-left",  hint:"close-up" },
    { grid:"BOTTOM-RIGHT", label:"Bottom-right", hint:"close-up" },
  ];
  const [panelEdit, setPanelEdit] = React.useState(null);   // { idx:int|null, text:string } | null
  const applyPanelEdit = ()=>{
    if(!panelEdit || panelEdit.idx==null || !panelEdit.text.trim() || gen.gening) return;
    const p = LOC_PANELS[panelEdit.idx];
    const instr = "In the "+p.grid+" panel of the multi-view grid ONLY (the "+p.hint+" view), "
      + panelEdit.text.trim() + ". Leave the OTHER panels of the grid EXACTLY as they are — same framing and content.";
    gen.generate({ editInstruction: instr });
    setPanelEdit(null);
  };

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
      // The empty plate is also the finished-image importer, so the separate
      // "Upload a finished location plate" button is intentionally omitted.
      dropToImport:true,
      // one-click edit instructions: place each set-dressing fixture INTO the plate.
      // Chip label = prompt-only (built from the prop's spec); the clip button ALSO
      // attaches the fixture's generated sheet (if any) as an edit reference image.
      // The shell prop leads with a "Match shell" correction chip instead.
      editSuggestions: [
        ...(shellProp ? [{ raw:true, label:"Match shell · "+(shellProp.name||"object"),
          text:(typeof locShellMatchEditText==="function") ? locShellMatchEditText(shellProp) : "",
          title:"This location is the hollow INTERIOR of "+(shellProp.name||"the object")+" — insert a correction instruction so the plate reads as the inside of that exact shell (materials, bore, openings). Use the clip beside it to also attach the shell's exterior sheet as a reference.",
          getRef: sheetRefOf(shellProp) }] : []),
        ...dressProps.map(p=>({ label:p.name||"fixture",
          text:(typeof locDressingEditText==="function") ? locDressingEditText(p) : ("Add "+(p.name||"the fixture")+" into the space."),
          title:"Insert the ready edit instruction for this fixture — built from its prop card's spec (form, material, size). Apply edit paints it into the plate, matching the plate's look. Use the clip button beside it to also attach the fixture's sheet as a reference.",
          getRef: sheetRefOf(p) })),
      ],
      specGate:{ ready:(drafted || !l.manual), hint:"Draft the design spec first \u2014 architecture, materials & light are what the plate is built from." },
      // edit ONE view of the plate (works on generated or uploaded plates)
      menuExtra: gen.genUrl ? [{ label: panelEdit?"Close panel edit":"Edit a panel\u2026",
        title:"Change just ONE view of the multi-angle plate, leaving the others untouched",
        onClick:()=> setPanelEdit(pe=> pe ? null : { idx:null, text:"" }) }] : null,
      onDelete:()=>onDelete(l.id), deleteLabel:"Delete location" }),
    panelEdit && gen.genUrl && React.createElement("div",{className:"sheet-edit-panel loc-panel-edit"},
      React.createElement("div",{className:"loc-panel-pick"},
        LOC_PANELS.map((p,i)=>React.createElement("button",{key:i,
          className:"loc-panel-btn"+(panelEdit.idx===i?" on":""),title:p.label+" \u2014 "+p.hint,
          onClick:()=>setPanelEdit(pe=>({ ...pe, idx:i }))},
          React.createElement("span",{className:"loc-panel-btn-pos"},p.label),
          React.createElement("span",{className:"loc-panel-btn-hint"},p.hint)))),
      React.createElement("input",{className:"sheet-edit-input",type:"text",autoFocus:true,
        placeholder: panelEdit.idx==null ? "Pick a panel above, then describe the change\u2026"
          : ("Change the "+LOC_PANELS[panelEdit.idx].label.toLowerCase()+" view only\u2026"),
        value:panelEdit.text, onChange:e=>setPanelEdit(pe=>({ ...pe, text:e.target.value })),
        onKeyDown:e=>{ if(e.key==="Enter") applyPanelEdit(); if(e.key==="Escape") setPanelEdit(null); }}),
      React.createElement("div",{className:"sheet-edit-acts"},
        React.createElement("button",{className:"sheet-edit-apply",
          disabled:panelEdit.idx==null||!panelEdit.text.trim()||gen.gening,onClick:applyPanelEdit},
          gen.gening?"Editing\u2026":"Apply panel edit"),
        React.createElement("button",{className:"sheet-edit-cancel",onClick:()=>setPanelEdit(null)},"Cancel"))),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"sheet-name loc-name-row",title:l.name||""},
            React.createElement("span",{className:"loc-intext-badge "+(/EXT/.test(l.intExt||"")?"ext":"int")},l.intExt||"INT"),
            React.createElement(EditText,{value:l.name,placeholder:"Location name\u2026",onCommit:val=>onUpdate(l.id,{name:val})})),
          React.createElement("div",{className:"prop-scenes"},
            React.createElement("span",{className:"prop-scenes-lab"},"Scenes"),
            React.createElement(SceneChipPager,{ none:"No scenes reference this place",
              items: locScenes.map(s=>({ key:s.id, label:String(s.no).padStart(2,"0"), className:"prop-scene-chip",
                title:s.title||("Scene "+s.no), onClick:()=>onChipClick&&onChipClick(s.id) })) })),
          // SHELL LINK — this location is the hollow INSIDE of a designed object
          // (hollow log, hive, seed pod: the building/apartment relationship)
          dressAll.length>0 && React.createElement("div",{className:"loc-shell-row"},
            React.createElement("span",{className:"prop-scenes-lab",
              title:"Is this location the hollow INSIDE of one of your set-dressing objects? Linking it makes the shell's materials binding in the plate prompt, adds a 'Match shell' chip to the plate's Edit panel, and keeps the shell's exterior sheet out of shots filmed inside it."},
              "Interior of"),
            React.createElement("select",{className:"prop-select loc-shell-select",value:l.interiorOfPropId||"",
              onChange:e=>onUpdate(l.id,{ interiorOfPropId: e.target.value||undefined })},
              React.createElement("option",{value:""},"— not inside an object"),
              dressAll.map(p=>React.createElement("option",{key:p.id,value:p.id},p.name||"Prop"))))),
        // one flex row (like Props' head actions) \u2014 otherwise .sheet-head's column
        // layout stacks each button on its own full-width line
        React.createElement("div",{className:"sheet-head-actions"},
          React.createElement("button",{className:"char-draft-btn"+(drafting?" busy":""),disabled:drafting,onClick:()=>onDraft(l)},
            React.createElement(Icon.sparkles,{s:12}), drafting?"Drafting\u2026":"Draft details"),
          window.QaCheckButton && React.createElement(window.QaCheckButton,{ gen, name:l.name, noun:"location plate" }))),

      React.createElement("div",{className:"char-style-row"},
        React.createElement("span",{className:"char-style-lab"},"Render style"),
        React.createElement("div",{className:"char-style-pick"},
          React.createElement(window.RenderStylePicker,{value:l.renderStyleKey||(window.turnDefaultRenderStyleKey?window.turnDefaultRenderStyleKey():"photoreal"),disabled:styling,onPick:pickLocStyle}),
          (window.turnCanLockStyles && window.turnCanLockStyles()) && React.createElement("span",{className:"char-style-count"+(((window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)>=(window.turnGlobalStyleCap||40))?" full":""),title:"Global render styles ("+(window.turnGlobalStyleCap||40)+" max, admin-managed). You can save up to "+(window.turnPersonalStyleCap||10)+" personal render styles. Manage via Styles in the top bar."}, (window.turnAllGlobalStyleCount?window.turnAllGlobalStyleCount():0)+"/"+(window.turnGlobalStyleCap||40))),
        styling && React.createElement("span",{className:"char-style-busy"},React.createElement("span",{className:"ns-spin"}),"Inventing\u2026"),
        (!styling && l.renderStyleKey==="surprise" && l.surpriseRender && l.surpriseRender.label) &&
          React.createElement("span",{className:"char-style-name",title:"Re-roll a new surprise style",onClick:rollSurprise},
            l.surpriseRender.label," \u21bb"),
        (!styling && l.renderStyleKey==="surprise" && l.surpriseRender && l.surpriseRender.style && window.turnCanLockStyles && window.turnCanLockStyles()) &&
          React.createElement("button",{className:"char-style-lock",title:"Lock this style \u2014 keep it and reuse it across Characters, Props & Locations",onClick:lockSurprise},"\ud83d\udd12 Lock this style"),
        (!styling && unlockVisible && window.turnIsUserStyle && window.turnIsUserStyle(l.renderStyleKey)) &&
          React.createElement("span",{className:"char-style-name char-style-locked",title:"Your saved style \u2014 reusable everywhere. Click to unlock.",onClick:unlockCurrent},"\ud83d\udd12 saved \u00b7 unlock")),

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
            " in the Styles tab. This reference plate is rendered grade-neutral on purpose \u2014 that scene grade is applied per shot, not baked into the plate.")) : null,
        React.createElement(SheetField,{label:"Render style \u2014 edit freely",value:l.renderStyle||d.renderStyle,multiline:true,
          placeholder:"photoreal architectural cinematography, wide lens, natural light\u2026",onCommit:val=>onUpdate(l.id,{renderStyle:val})})),

      React.createElement(CardFold,{label:"Final prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"Final prompt \u2014 sent to the image model",text:finalPrompt}),
        React.createElement(SheetField,{label:"Negative prompt \u2014 exclude",value:l.negativePrompt||d.negativePrompt,multiline:true,
          onCommit:val=>onUpdate(l.id,{negativePrompt:val})}))));
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
    entity: l,
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

function LocationSheets({ project, locations, scenes, onUpdate, onDraft, onDraftAll, onAdd, onDelete, draftingId, draftingAll, onPullFromScript, scriptHasLocs, onDraftStaging, draftingStageId, onScout, trashItems, onRestore, onPurge, lookbookStale, onApplyLookbook, onApplyLookbookDraftOnly, onSetWorldScale }){
  const [view, setView] = React.useState(null);
  if(window.useRenderStyleVersion) window.useRenderStyleVersion();   // re-render dropdowns when a style is locked/unlocked
  const [sceneFilter, setSceneFilter] = React.useState("");
  const [query, setQuery] = React.useState("");               // free-text name search
  const [searchOpen, setSearchOpen] = React.useState(false);  // collapsible search: icon-only until clicked
  const searchRef = React.useRef(null);
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = locations || [];
  // STYLE · ALL LOCATIONS — apply one render style to every location at once (mirrors the
  // cast's 'Style · all cast'); each location can still be overridden on its own card.
  const [allStyling, setAllStyling] = React.useState(null);   // null | {i,total} (surprise progress)
  const LOC_TEXT = window.LOC_RENDER_TEXT || {};
  const defaultStyleKey = window.turnDefaultRenderStyleKey ? window.turnDefaultRenderStyleKey() : "photoreal";
  const allStyleKey = (list.length && list.every(l=>(l.renderStyleKey||defaultStyleKey)===(list[0].renderStyleKey||defaultStyleKey)))
    ? (list[0].renderStyleKey||defaultStyleKey) : "";
  const locBibleOf = (l)=> [l.name&&("Name: "+l.name), l.architecture&&("Architecture: "+l.architecture),
    l.materials&&("Materials: "+l.materials), l.lighting&&("Lighting: "+l.lighting), l.significance&&("Significance: "+l.significance),
    (project&&project.genre)&&("Genre: "+project.genre)].filter(Boolean).join("\n");
  const applyStyleAll = async (key)=>{
    if(!key || allStyling) return;
    if(key!=="surprise"){ const t=(typeof window.renderStyleText==="function" ? window.renderStyleText("loc", key) : (LOC_TEXT[key]||LOC_TEXT.photoreal)); list.forEach(l=> onUpdate(l.id, { renderStyleKey:key, renderStyle:t })); return; }
    list.forEach(l=> onUpdate(l.id, { renderStyleKey:"surprise" }));
    if(!(typeof aiSurpriseStyleText==="function" && typeof aiAvailable==="function" && aiAvailable())) return;
    const need = list.filter(l=>!(l.surpriseRender && l.surpriseRender.style));
    if(!need.length) return;
    let ok = true;
    if(typeof window.appConfirm==="function") ok = await window.appConfirm({
      title:"Invent a surprise style for "+need.length+" location"+(need.length!==1?"s":"")+"?",
      body:"Each location gets its OWN bespoke fused style invented from its bible — that's "+need.length+" AI call"+(need.length!==1?"s":"")+".",
      confirmLabel:"Invent styles" });
    if(!ok) return;
    setAllStyling({ i:0, total:need.length });
    for(let i=0;i<need.length;i++){ setAllStyling({ i:i+1, total:need.length });
      try{ const r = await aiSurpriseStyleText({ name:need[i].name, kind:"location", bible:locBibleOf(need[i]) }, project);
        if(r) onUpdate(need[i].id, { surpriseRender:r, renderStyle:r.style }); }catch(e){} }
    setAllStyling(null);
  };
  const sceneList = (scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const inScene = (l, sid)=> Array.isArray(l.scenes) && l.scenes.indexOf(sid)>=0;
  const q = query.trim().toLowerCase();
  const matchesQuery = (l)=> (typeof searchWordMatch==="function") ? searchWordMatch((l.name||"")+" "+(l.intExt||""), q) : (!q || (l.name||"").toLowerCase().indexOf(q)>=0);
  const shown = (sceneFilter ? list.filter(l=>inScene(l, sceneFilter)) : list).filter(matchesQuery);
  // 9-up pagination; suspended while a batch runs so the queue can reach every card
  const pager = usePager(shown.length, !!batchActiveId);
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
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Production Designer (Location Scout)",
            React.createElement(window.InfoTip,{label:"About Locations",
              text:"Every place the film visits, pulled straight from the script's sluglines. Each gets a multi-angle coverage plate \u2014 the same space from several views \u2014 so any shot set there matches its geometry, materials and light. 'Design all locations' builds every place in one pass \u2014 pulls them from the sluglines, drafts each spec, and stages its depth grid; 'Generate all locations' then renders the plates."}))),
        React.createElement("div",{className:"art-intro-actions"},
          React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
            React.createElement(Icon.plus,{s:14}),"Add location"),
          React.createElement("button",{className:"art-draftall",disabled:draftingAll||(!list.length&&!scriptHasLocs),onClick:onDraftAll,
            title:"Build every location from the story in one pass \u2014 pull any missing places from the script's sluglines, draft each spec (the space, significance, look dev), and stage its depth grid"},
            React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Design all locations"),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Generate (or regenerate) the coverage plate for every drafted location \u2014 you choose whether to redo ones that already have a plate"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Generating\u2026":"Generate all locations", typeof window.nbCostChip==="function" && window.nbCostChip(1)))),),
    window.LookbookStaleNotice && React.createElement(window.LookbookStaleNotice,{stale:lookbookStale,onApply:onApplyLookbook,onDraftOnly:onApplyLookbookDraftOnly,label:"these locations",dept:"locations"}),
    BatchBar && React.createElement(BatchBar,{batch,noun:"location"}),
    window.RecentlyDeleted && React.createElement(window.RecentlyDeleted,{items:trashItems,kind:"location",onRestore,onPurge}),
    list.length>0 && React.createElement("div",{className:"prop-toolbar"},
      React.createElement("div",{className:"prop-searchbar collapsible"+((searchOpen||q)?" open":""),
        title:(searchOpen||q)?"":"Search locations",
        onClick:()=>{ if(!searchOpen && !q){ setSearchOpen(true); setTimeout(()=>{ if(searchRef.current) searchRef.current.focus(); },0); } }},
        React.createElement(Icon.search,{s:14}),
        React.createElement("input",{className:"prop-search-input",type:"text",value:query,ref:searchRef,
          placeholder:"Search locations by name…",tabIndex:(searchOpen||q)?0:-1,
          onChange:e=>setQuery(e.target.value),
          onBlur:()=>{ if(!query) setSearchOpen(false); },
          onKeyDown:e=>{ if(e.key==="Escape"){ setQuery(""); setSearchOpen(false); if(searchRef.current) searchRef.current.blur(); } }}),
        q && React.createElement("span",{className:"prop-search-count"}, shown.length+" of "+list.length),
        q && React.createElement("button",{className:"prop-search-clear",title:"Clear search",onClick:(e)=>{ e.stopPropagation(); setQuery(""); setSearchOpen(false); }},React.createElement(Icon.x,{s:13}))),
      // render-style + world-scale controls live beside the search bar (moved out of the header)
      React.createElement("div",{className:"char-style-all",
        title:"Apply one render style to ALL locations at once. Each location can still be overridden on its own card."},
        React.createElement("span",{className:"char-style-all-lab"},
          allStyling ? ("Inventing… "+allStyling.i+"/"+allStyling.total) : "Style · all locations"),
        React.createElement(window.RenderStylePicker,{value:allStyleKey,disabled:!!allStyling,
          placeholderLabel:"Mixed — per location",onPick:applyStyleAll})),
      onSetWorldScale && React.createElement("label",{className:"char-style-all",
        title:"Render every location's plate at this scale. 'Auto' derives each place's scale from the characters who drive its scenes — so critter or microscopic casts make the world render at their scale automatically."},
        React.createElement("span",{className:"char-style-all-lab"},"World scale"),
        React.createElement("select",{className:"char-style-select",value:(project&&project.worldScale)||"",
          onChange:e=>onSetWorldScale(e.target.value)},
          React.createElement("option",{value:""},"Auto (by occupant)"),
          React.createElement("option",{value:"A"},"Human scale (Class A)"),
          React.createElement("option",{value:"B"},"Critter scale (Class B)"),
          React.createElement("option",{value:"C"},"Giant scale (Class C)"),
          React.createElement("option",{value:"D"},"Microscopic scale (Class D)"))),
      sceneList.length>0 && React.createElement("div",{className:"prop-scenebar"},
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
          batchActiveId?"Generating\u2026":("Generate all in Scene "+String(sceneNoOf(sceneFilter)).padStart(2,"0")), typeof window.nbCostChip==="function" && window.nbCostChip(1)))),
    list.length
      ? (shown.length
          ? React.createElement(React.Fragment,null,
              React.createElement("div",{className:"sheet-grid"},
                pager.slice(shown).map(l=>React.createElement(LocationSheet,{key:l.id,l,project,scenes,onUpdate,onDelete,onDraft,
                  drafting:draftingId===l.id||draftingAll,onView:(url,pr)=>setView({url,character:pr}),
                  batchActiveId,onBatchDone:batch.advance,onChipClick:(sid)=>setSceneFilter(sid),
                  onDraftStaging,draftingStage:draftingStageId===l.id}))),
              React.createElement(PagerBar,{pager,noun:"location"}))
          : React.createElement("div",{className:"prop-empty"},
              React.createElement("div",{className:"art-soon-t"},"No locations in this scene"),
              React.createElement("button",{className:"art-draftall",style:{marginTop:16},onClick:()=>setSceneFilter("")},"Show all locations")))
      : React.createElement("div",{className:"prop-empty"},
          React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon.layers,{s:30})),
          React.createElement("div",{className:"art-soon-t"},"No locations yet"),
          React.createElement("div",{className:"art-soon-d"}, scriptHasLocs
            ? "Your script's scene sluglines name the places this story visits \u2014 \u201cDesign all locations\u201d pulls them in, drafts each spec, and stages its depth grid in one pass. Or add one by hand."
            : "Add a location to start building its reference plate \u2014 a room, a street, a world."),
          React.createElement("div",{style:{display:"flex",gap:8,marginTop:16}},
            scriptHasLocs && React.createElement("button",{className:"art-draftall",disabled:draftingAll,onClick:onDraftAll},
              React.createElement(Icon.sparkles,{s:14}), draftingAll?"Designing\u2026":"Design all locations"),
            React.createElement("button",{className:scriptHasLocs?"art-draftall ghost":"art-draftall",onClick:onAdd},
              React.createElement(Icon.plus,{s:14}),scriptHasLocs?"Add by hand":"Add your first location"))));
}
window.LocationSheets = LocationSheets;

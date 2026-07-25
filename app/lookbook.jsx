/* lookbook.jsx — The Art Room ▸ Lookbook (References).
   The front-of-pipeline visual brief: a north-star "visual statement" plus a grid of
   reference cards (palette / lighting / lens / texture touchstones), each with an
   AI-rendered mood frame. The Visual Researcher agent fills it from the story and writes
   its references through to the Colorist (Presets) so the look propagates downstream.
   Mirrors props.jsx / locations.jsx; reuses SheetFrame / SheetField / CardFold / useImageGen. */

const LOOKBOOK_CATEGORIES = ["Palette","Lighting","Lens & format","Texture & grain","Composition","Production design","Wardrobe","Atmosphere"];
window.LOOKBOOK_CATEGORIES = LOOKBOOK_CATEGORIES;

function lookbookSourceKey(c){
  return String((c&&c.source)||"")
    .toLowerCase()
    .replace(/\([^)]*\)/g,"")
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}
window.lookbookSourceKey = lookbookSourceKey;

function dedupeLookbookCards(cards){
  const out=[], pos=new Map();
  const hasImg = (c)=>{ try{ return !!(c && typeof nbGetImage==="function" && nbGetImage(c.id)); }catch(e){ return false; } };
  (cards||[]).forEach(c=>{
    const key = lookbookSourceKey(c) || String(c&&c.id||"");
    if(!key) return;
    if(pos.has(key)){
      const idx = pos.get(key), old = out[idx] || {};
      if((hasImg(c) && !hasImg(old)) || (!(old.note||"").trim() && (c.note||"").trim())) out[idx] = c;
      return;
    }
    pos.set(key, out.length);
    out.push(c);
  });
  return out;
}
window.dedupeLookbookCards = dedupeLookbookCards;

/* a reference is generatable once it has a "what to borrow" note — the note (the abstract
   visual quality) is what the mood frame is built from, never the named source IP. */
function lookbookCardDrafted(c){ return !!((c && (c.note||"")).trim()); }
window.lookbookCardDrafted = lookbookCardDrafted;

/* Mood-frame prompt: an ORIGINAL frame that captures the reference's visual LANGUAGE only
   (palette / lighting / lens / texture) — deliberately NOT a depiction of any named film,
   scene, character or logo, so it stays copyright-clean (same principle as the Colorist). */
function buildLookbookPrompt(c, project){
  const P = project || (window.TURN_DATA||{}).PROJECT || {};
  const note = (c.note||"").replace(/\.$/,"").trim();
  const cat = (c.category||"Palette");
  const period = P.setting && P.setting.period ? P.setting.period.split(/[—,]/)[0].trim() : "";
  const tone = [P.genre, period].filter(Boolean).join(", ");
  let s = "Cinematic visual-reference frame — a "+cat.toLowerCase()+" study. ";
  s += note ? (note+". ") : "";
  if(tone) s += tone+" tone. ";
  s += "An ORIGINAL frame that captures this visual LANGUAGE only — palette, lighting, lens, texture, atmosphere. ";
  s += "Do NOT depict any specific recognizable film, scene, character, real person, logo or on-screen text; no words in the image. ";
  s += "Photoreal, evocative, filmic, shallow depth of field. --ar 16:9";
  return s;
}
window.buildLookbookPrompt = buildLookbookPrompt;

function combinedLookbookPrompt(c, project){
  const master = buildLookbookPrompt(c, project);
  const neg = (c.negativePrompt || "text, words, captions, logo, watermark, recognizable real film still, celebrity likeness, distorted faces").trim();
  return master + " AVOID: " + neg.replace(/\.$/,"") + ".";
}
window.combinedLookbookPrompt = combinedLookbookPrompt;

function buildSimpleLookbookPrompt(c){
  const note = (c.note||"").replace(/\.$/,"").trim();
  return ["Cinematic reference frame", (c.category||"").toLowerCase(), note||"",
    "original, no text, no recognizable film, photoreal, atmospheric"].filter(Boolean).join(". ")+".";
}
window.buildSimpleLookbookPrompt = buildSimpleLookbookPrompt;

/* compose the lookbook into the free-text references the Colorist reads (styleBible.refs) */
function composeLookbookRefs(statement, cards){
  return [statement, ...dedupeLookbookCards(cards).filter(c=>(c.note||"").trim())
    .map(c=> (c.source?c.source+" — ":"")+c.note)].filter(Boolean).join("\n");
}
window.composeLookbookRefs = composeLookbookRefs;

/* Write-through (legacy migration): the Lookbook's colorist brief now auto-fills the
   Presets references field DIRECTLY (plain text, no markers — see the write-through effect
   in app.jsx, ownership tracked via styleBible.lookbookSynced). An earlier version spliced
   it into styleBible.refs inside this delimited block; docs saved then still carry it, so
   mergeLookbookIntoRefs(refs, "") is kept as the strip the effect uses to lift the block
   back out of the manual refs. */
const LB_REFS_START = "[Lookbook references]";
const LB_REFS_END   = "[/Lookbook references]";
window.LB_REFS_START = LB_REFS_START;
window.LB_REFS_END = LB_REFS_END;
function mergeLookbookIntoRefs(existingRefs, lbText){
  const esc = (s)=> s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const base = String(existingRefs||"")
    .replace(new RegExp("\\n*"+esc(LB_REFS_START)+"[\\s\\S]*?"+esc(LB_REFS_END)+"\\n*", "g"), "\n")
    .trim();
  const lb = String(lbText||"").trim();
  if(!lb) return base;                                  // lookbook empty → only the manual refs
  const block = LB_REFS_START+"\n"+lb+"\n"+LB_REFS_END;
  return base ? base+"\n\n"+block : block;
}
window.mergeLookbookIntoRefs = mergeLookbookIntoRefs;

/* which reference categories feed which downstream department. A category may feed more than
   one. Each Art Room drafter pulls only its department's categories as a focused brief, so the
   one visual lookbook propagates to every department (not just colour). */
const LOOKBOOK_ROUTING = {
  colorist:   ["Palette", "Lighting", "Texture & grain", "Atmosphere"],
  characters: ["Wardrobe"],
  locations:  ["Production design", "Atmosphere"],
  props:      ["Production design"],
  shots:      ["Lens & format", "Composition", "Lighting"],
  storyboard: ["Composition", "Atmosphere"],
};
window.LOOKBOOK_ROUTING = LOOKBOOK_ROUTING;

/* the lookbook brief for one department: the film's visual statement (north star) + the
   reference notes whose category routes to that department. Returns "" when there's nothing. */
function lookbookBriefFor(dept, lookbook, statement){
  const cats = LOOKBOOK_ROUTING[dept] || [];
  const lines = dedupeLookbookCards(lookbook)
    .filter(c=> cats.indexOf(c.category)>=0 && (c.note||"").trim())
    .map(c=> (c.source?c.source+" — ":"")+c.note.trim());
  const st = (statement||"").trim();
  if(!lines.length && !st) return "";
  return [st ? ("Overall look: "+st) : "", ...lines].filter(Boolean).join("\n");
}
window.lookbookBriefFor = lookbookBriefFor;

/* which departments are now out of date relative to the Lookbook: a dept is stale when it HAS
   drafted content (contentFlags[dept]) AND the current brief differs from the one last applied
   (applied[dept]). Scoped per-category by lookbookBriefFor, so editing a Palette card flags only
   the colorist, editing the statement flags everything. Returns { dept:true }. */
function lookbookStaleDepts(lookbook, statement, applied, contentFlags){
  const out = {};
  Object.keys(LOOKBOOK_ROUTING).forEach(dept=>{
    if(!(contentFlags && contentFlags[dept])) return;        // nothing drafted → nothing to be stale about
    const cur = lookbookBriefFor(dept, lookbook, statement);
    const was = (applied && applied[dept]) || "";
    if(cur !== was) out[dept] = true;
  });
  return out;
}
window.lookbookStaleDepts = lookbookStaleDepts;

/* how the Lookbook drives each tab — which of its categories feed this department and what they
   shape — so the banner can tell the user exactly what re-drafting will pull in (mirrors
   LOOKBOOK_ROUTING). */
const LOOKBOOK_DEPT_AFFECT = {
  characters: "Its Wardrobe references shape each character's costume, silhouette and styling.",
  props:      "Its Production design references shape each prop's materials, finish and period.",
  locations:  "Its Production design and Atmosphere references shape each location's architecture, materials, light and mood.",
  colorist:   "Its Palette, Lighting, Texture & grain and Atmosphere references shape the colour grade and film stock.",
};
window.LOOKBOOK_DEPT_AFFECT = LOOKBOOK_DEPT_AFFECT;

/* the in-tab banner: "the Lookbook changed since this was drafted" + how it drives THIS tab
   + [Re-draft only] [Re-draft & regenerate]. onDraftOnly (optional) re-drafts the specs from
   the updated Lookbook but leaves the generated images alone — for when you want the words
   updated now and the renders later. */
function LookbookStaleNotice({ stale, onApply, onDraftOnly, label, dept }){
  if(!stale) return null;
  const affect = LOOKBOOK_DEPT_AFFECT[dept] || "";
  return React.createElement("div",{className:"lb-stale-notice"},
    React.createElement(Icon.alert,{s:14}),
    React.createElement("span",null,
      "The ",React.createElement("b",null,"Lookbook")," changed — re-draft "+(label||"this tab")+" to apply its references.",
      affect && React.createElement("span",{className:"lb-stale-affect"}, affect)),
    onDraftOnly && React.createElement("button",{className:"lb-stale-btn ghost",onClick:onDraftOnly,
      title:"Re-draft this tab's specs from the updated Lookbook — images stay as they are; regenerate them when you're ready"},
      React.createElement(Icon.sparkles,{s:12}),"Re-draft only"),
    React.createElement("button",{className:"lb-stale-btn",onClick:onApply,title:"Re-draft this tab's specs from the updated Lookbook and regenerate its sheets"},
      React.createElement(Icon.sparkles,{s:12}),"Re-draft & regenerate"));
}
window.LookbookStaleNotice = LookbookStaleNotice;

/* headless mood-frame generation for the Visual Researcher agent (mirrors generatePropSheet) */
async function generateLookbookFrame(c, project){
  const _ep = (typeof nbEpoch==="function") ? nbEpoch() : null;   // asset scope at generation start
  if(typeof nbGenerate!=="function" || typeof nbCommit!=="function") return false;
  const prompt = (typeof combinedLookbookPrompt==="function") ? combinedLookbookPrompt(c, project) : (c.source||"reference frame");
  if(!window.__nbGenInflight) window.__nbGenInflight = {};
  window.__nbGenInflight[c.id] = true;
  try{
    let url;
    try{ url = await nbGenerate(prompt, {}); }
    catch(e){ if(/no image/i.test((e&&e.message)||"") && typeof buildSimpleLookbookPrompt==="function"){ url = await nbGenerate(buildSimpleLookbookPrompt(c), {}); } else throw e; }
    const model = (typeof nbGetModel==="function") ? nbGetModel() : "";
    const now = new Date();
    const mEntry = (window.NB_MODELS||[]).find(m=>m.id===model) || {};
    const meta = { modelLabel:mEntry.label||"Nano Banana", modelId:model,
      aspect:(typeof nbGetAspect==="function"?nbGetAspect():"16:9"), size:(typeof nbGetRes==="function"?nbGetRes():"2K"),
      date: now.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}),
      time: now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}),
      iso:now.toISOString(), prompt, mode:"final", version:1 };
    await nbCommit(c.id, url, meta, [], "asset", _ep);
    try{ window.dispatchEvent(new CustomEvent("nb-gen-done",{ detail:{ id:c.id, url } })); }catch(e){}
    return true;
  } finally { window.__nbGenInflight[c.id] = false; }
}
window.generateLookbookFrame = generateLookbookFrame;

/* ---- one reference card ---- */
function LookbookCard({ c, project, onUpdate, onDelete, onView, batchActiveId, onBatchDone }){
  const finalPrompt = combinedLookbookPrompt(c, project);
  const drafted = lookbookCardDrafted(c);
  const initials = (c.source||"Ref").replace(/^the\s+/i,"").split(/\s+/).map(w=>w[0]).slice(0,2).join("").toUpperCase();
  const gen = useImageGen({
    id: c.id, slotId: "lookref-"+c.id,
    buildFinal: ()=> finalPrompt,
    buildSimple: ()=> buildSimpleLookbookPrompt(c),
    buildEdit: (instr)=>
      "Edit this reference frame. Apply ONLY this change: "+instr+". "
      +"Keep the same visual language — palette, lighting, lens, texture — in the same single 16:9 frame. "
      +"No text, no recognizable film or person.",
  });

  const batchStarted = React.useRef(false);
  const wasGening = React.useRef(false);
  React.useEffect(()=>{
    const mine = batchActiveId===c.id;
    if(!mine){ batchStarted.current=false; wasGening.current=gen.gening; return; }
    if(!batchStarted.current && !gen.gening){ batchStarted.current=true; wasGening.current=false; gen.generate(); return; }
    if(batchStarted.current && wasGening.current && !gen.gening){ batchStarted.current=false; onBatchDone && onBatchDone(c.id); }
    wasGening.current = gen.gening;
  },[batchActiveId, gen.gening, c.id]);

  return React.createElement("div",{className:"sheet-card"+(batchActiveId===c.id?" batch-on":""),"data-look-card":c.id},
    React.createElement(SheetFrame,{ gen, slotId:"lookref-"+c.id, name:c.source||"Reference", avatarColor:"#6b7280",
      initials, drafted, drafting:false, onDraft:()=>{}, entity:c, onView,
      slotPlaceholder:"Drop a reference image", noun:"reference frame",
      hideUploadButton:true,
      specGate:{ ready:drafted, hint:"Add a ‘what to borrow’ note first — it's what the frame is built from." },
      onDelete:()=>onDelete(c.id), deleteLabel:"Delete reference" }),
    React.createElement("div",{className:"sheet-body"},
      React.createElement("div",{className:"sheet-head"},
        React.createElement("div",{style:{flex:1,minWidth:0}},
          React.createElement("div",{className:"sheet-name"},
            React.createElement(EditText,{value:c.source,placeholder:"Reference — film, cinematographer, palette…",onCommit:val=>onUpdate(c.id,{source:val})})),
          React.createElement("div",{className:"sheet-role"}, c.category||"Palette"))),

      // always rendered (showWhenEmpty): the lookbook grid mixes rendered and unrendered
      // cards side by side, so a vanishing QA button read as inconsistent — frameless
      // cards now show it disabled with the unlock reason instead
      window.QaCheckButton && React.createElement("div",{className:"card-qa-row"},
        React.createElement(window.QaCheckButton,{ gen, name:c.source||"Reference", noun:"mood frame", showWhenEmpty:true,
          specFields:()=>({ category:(c.category||""), note:(c.note||"") }),
          onApplySpec:(patch)=>onUpdate(c.id, patch) })),

      !drafted && !gen.genUrl && React.createElement("div",{className:"sheet-undrafted"},
        React.createElement(Icon.alert,{s:13}),
        React.createElement("span",null,"No ‘what to borrow’ note yet — add one below, then generate its mood frame.")),

      React.createElement(CardFold,{label:"Reference",defaultOpen:true},
        React.createElement("div",{className:"sheet-field"},
          React.createElement("div",{className:"obj-lab"},"Category"),
          React.createElement("select",{className:"prop-select",value:c.category||"Palette",
            onChange:e=>onUpdate(c.id,{category:e.target.value})},
            (window.LOOKBOOK_CATEGORIES||[]).map(cat=>React.createElement("option",{key:cat,value:cat},cat)))),
        React.createElement(SheetField,{label:"What to borrow — the visual quality",value:c.note,multiline:true,
          placeholder:"The palette / lighting / lens / texture to draw from — abstract qualities, not the source's scenes…",
          onCommit:val=>onUpdate(c.id,{note:val})})),

      React.createElement(CardFold,{label:"Reference prompt",defaultOpen:false},
        React.createElement(CopyBox,{label:"Mood frame — feed to your image tool",text:finalPrompt}),
        React.createElement(SheetField,{label:"Negative prompt — exclude",value:c.negativePrompt||"",
          onCommit:val=>onUpdate(c.id,{negativePrompt:val})}))));
}

/* ---- the Lookbook tab ---- */
function LookbookView({ project, lookbook, note, onUpdate, onAdd, onDelete, onSetNote, onResearch, onClear }){
  const [view, setView] = React.useState(null);
  const batch = useBatchGen();
  const batchActiveId = batch.activeId;
  const list = dedupeLookbookCards(lookbook || []);
  const draftedIds = (subset)=> subset.filter(c=>lookbookCardDrafted(c)).map(c=>c.id);
  const eligibleAll = list.filter(c=>lookbookCardDrafted(c)).length;
  const startAllBatch = ()=>{
    if(batchActiveId) return;
    const eligible = draftedIds(list);
    if(!eligible.length){ batch.setMsg("Add a ‘what to borrow’ note to a reference first — nothing is ready to render yet."); return; }
    batch.begin(eligible, list.length - eligible.length);
  };

  return React.createElement("div",{className:"art-scroll"},
    view && React.createElement(ImageLightbox,{url:view.url,character:view.character,onClose:()=>setView(null)}),
    React.createElement(NbKeyBar,null),
    React.createElement(NbControls,null),
    React.createElement("div",{className:"art-intro"},
      React.createElement("div",{className:"art-intro-row"},
        React.createElement("div",{style:{flex:1}},
          React.createElement("div",{className:"art-intro-t",style:{display:"flex",alignItems:"center",gap:9}},"Visual Researcher",
            React.createElement(window.InfoTip,{label:"About the Lookbook",
              text:"The film's visual north star, built first so it can steer everything downstream. A short visual statement plus reference touchstones — palette, lighting, lens, texture — each can have a mood frame in that visual language (original frames, never copies of the named films). 'Research the look' writes the statement and gathers/dedupes the references. 'Generate all frames' renders the mood frames afterwards."}))),
        React.createElement("div",{className:"art-intro-actions"},
          React.createElement("button",{className:"art-draftall ghost",onClick:onAdd,title:"Add a reference by hand"},
            React.createElement(Icon.plus,{s:14})),
          onResearch && React.createElement("button",{className:"art-draftall ghost",onClick:onResearch,
            title:"Visual Researcher — writes the look statement and gathers reference touchstones. Use Generate all frames when you want to render the mood frames."},
            React.createElement(Icon.robot,{s:14}),"Research the look"),
          React.createElement("button",{className:"art-draftall",disabled:!!batchActiveId||!eligibleAll,onClick:startAllBatch,
            title:"Render (or re-render) the mood frame for every reference that has a note"},
            React.createElement(Icon.sparkles,{s:14}), batchActiveId?"Rendering…":"Generate all frames", typeof window.nbCostChip==="function" && window.nbCostChip(1)),
          // (Clear-all removed — user ruling 2026-07-19; delete references per card)
          null))),

    // the north-star visual statement
    React.createElement("div",{className:"lb-statement"},
      React.createElement(SheetField,{label:"Visual statement — the film's north star",value:note||"",multiline:true,
        placeholder:"How the whole film should LOOK and FEEL — palette, light, texture — in two or three sentences. Run ‘Research the look’ to draft it.",
        onCommit:val=>onSetNote&&onSetNote(val)})),

    BatchBar && React.createElement(BatchBar,{batch,noun:"frame"}),

    list.length
      ? React.createElement("div",{className:"sheet-grid"},
          list.map(c=>React.createElement(LookbookCard,{key:c.id,c,project,onUpdate,onDelete,
            onView:(url,ent)=>setView({url,character:ent}),batchActiveId,onBatchDone:batch.advance})))
      : React.createElement("div",{className:"prop-empty"},
          React.createElement("div",{className:"art-soon-ic"},React.createElement(Icon.image,{s:30})),
          React.createElement("div",{className:"art-soon-t"},"No references yet"),
          React.createElement("div",{className:"art-soon-d"},"Build the film's visual brief first — ‘Research the look’ writes the statement and gathers reference touchstones (palette, lighting, lens, texture). Then use ‘Generate all frames’ when you want mood frames. Or add one by hand."),
          React.createElement("div",{style:{display:"flex",gap:8,marginTop:16}},
            onResearch && React.createElement("button",{className:"art-draftall",onClick:onResearch},
              React.createElement(Icon.robot,{s:14}),"Research the look"),
            React.createElement("button",{className:"art-draftall ghost",onClick:onAdd},
              React.createElement(Icon.plus,{s:14}),"Add by hand"))));
}
window.LookbookView = LookbookView;

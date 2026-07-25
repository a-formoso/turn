/* aiwriter.jsx — shared AI-writer bits still in use:
   - AiOrb: the animated MUSE orb glyph (window.AiOrb)
   - WritingModelPicker: text-model picker for MUSE/spec drafting/agents (window.WritingModelPicker)
   The old in-panel MUSE chat component lived here too but is dead code — the live
   help assistant is MuseDock (app/muse.jsx), so it was removed. */

function AiOrb({ s=24 }){ return React.createElement("div",{className:"ai-orb",style:{width:s,height:s}}); }

/* Writing-model picker — chooses the text model behind MUSE, spec drafting and the
   agents (persisted globally; re-reads on the change event). */
function WritingModelPicker(){
  const models = window.WRITING_MODELS || [];
  const [mid, setMid] = React.useState(()=> (typeof window.getWritingModelId==="function") ? window.getWritingModelId() : (models[0]&&models[0].id));
  React.useEffect(()=>{
    const h = ()=> setMid((typeof window.getWritingModelId==="function") ? window.getWritingModelId() : mid);
    window.addEventListener("turn-writing-model-changed", h);
    return ()=>window.removeEventListener("turn-writing-model-changed", h);
  },[]);
  if(models.length < 2) return null;
  return React.createElement("select",{className:"muse-model-sel", value:mid,
    title:"Writing model — powers MUSE, spec drafting and the Agents",
    onChange:e=>{ if(typeof window.setWritingModelId==="function") window.setWritingModelId(e.target.value); setMid(e.target.value); }},
    models.map(m=>React.createElement("option",{key:m.id, value:m.id}, m.label)));
}
window.WritingModelPicker = WritingModelPicker;

/* WritingDock — the floating WRITING-engine control, mirroring the image dock
   (NbDock) on the right edge: a collapsed pill showing the current engine, and an
   expanded panel listing every writing model plus AUTO (the per-task
   recommendation — story prose vs Art-Room specs). A pick here is SESSION-scoped,
   exactly like the in-panel pickers: every fresh session starts back on Auto. */
function WritingDock({ task }){
  const [open, setOpen] = React.useState(false);
  const [, force] = React.useState(0);
  const ref = React.useRef(null);
  React.useEffect(()=>{
    const h = ()=> force(x=>x+1);
    window.addEventListener("turn-writing-model-changed", h);
    return ()=>window.removeEventListener("turn-writing-model-changed", h);
  },[]);
  React.useEffect(()=>{
    if(!open) return;
    const h = e=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = e=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", k);
    return ()=>{ document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  },[open]);
  const models = window.WRITING_MODELS || [];
  const pick = (typeof window.getWritingPick==="function") ? window.getWritingPick() : null;
  const recStory = (typeof window.recommendedWritingModelId==="function") ? window.recommendedWritingModelId("story") : "";
  const recSpecs = (typeof window.recommendedWritingModelId==="function") ? window.recommendedWritingModelId("specs") : "";
  const SHORT = { "claude-opus-5":"OPUS5", "claude-fable-5":"FABLE", "gemini-3.5-flash":"FLASH", "gpt-5.5-2026-04-23":"GPT5", "kimi-k3":"K3", "kimi-k2.7-code":"K2.7" };
  // resolve the engine for THIS room's task (Art Room → specs, Writers' Room → story) so
  // the collapsed pill NAMES the model at a glance — whether Auto-resolved or a manual pick
  // (this is why there's no separate text chip on the Art Room's image dock any more).
  const resolvedId = (typeof window.getWritingModelId==="function") ? window.getWritingModelId(task) : (pick||recStory);
  const short = SHORT[resolvedId] || String((models.find(m=>m.id===resolvedId)||{}).label||resolvedId||"AUTO").replace(/^(Claude|Gemini|GPT|Kimi)\s+/,"").slice(0,6).toUpperCase();
  // second chip flags whether that model came from AUTO (the recommendation) or your pick
  const mode = pick ? "SET" : "AUTO";
  const choose = (id)=>{ if(typeof window.setWritingModelId==="function") window.setWritingModelId(id||""); force(x=>x+1); };
  const labelOf = (id)=> ((models.find(m=>m.id===id)||{}).label)||id;
  return React.createElement("div",{className:"write-dock nb-dock"+(open?" open":""),ref,"aria-label":"Writing engine"},
    React.createElement("button",{className:"nb-dock-toggle","aria-expanded":open?"true":"false",
      title:"Writing engine ("+((models.find(m=>m.id===resolvedId)||{}).label||resolvedId)+") — the text model behind drafting, agents and story builds"+(pick?" (your pick this session)":" (AUTO — the per-task recommendation)")+". Click to change.",
      onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"nb-dock-chip model"},short),
      React.createElement("span",{className:"nb-dock-chip"},mode)),
    open && React.createElement("div",{className:"nb-dock-panel write-dock-panel"},
      React.createElement("div",{className:"write-dock-title"},"Writing engine"),
      // MODE — Auto mirrors the image dock's labelled-control style
      React.createElement("div",{className:"nb-ctl"},
        React.createElement("span",{className:"nb-ctl-lab"},"Mode"),
        React.createElement("div",{className:"nb-seg"},
          React.createElement("button",{className:"nb-seg-btn "+(pick?"":"on"),
            title:"Follow the per-task recommendation — story prose runs on "+labelOf(recStory)+", Art-Room specs on "+labelOf(recSpecs),
            onClick:()=>choose("")},"Auto · per task")),
        !pick && React.createElement("div",{className:"write-dock-note"},"story → "+labelOf(recStory)+" · specs → "+labelOf(recSpecs))),
      // MODELS — grouped by provider, compact segmented buttons like the image models
      (()=>{
        const PROV = { anthropic:"Anthropic", google:"Google", openai:"OpenAI", moonshot:"Moonshot" };
        const groups=[]; models.forEach(m=>{ let g=groups.find(x=>x.p===m.provider);
          if(!g){ g={p:m.provider, items:[]}; groups.push(g); } g.items.push(m); });
        return groups.map(g=>React.createElement("div",{key:g.p,className:"nb-ctl"},
          React.createElement("span",{className:"nb-ctl-lab"},PROV[g.p]||g.p),
          React.createElement("div",{className:"nb-seg"},
            g.items.map(m=>React.createElement("button",{key:m.id,
              className:"nb-seg-btn "+(pick===m.id?"on":""),
              title:(m.note||"")+((m.id===recStory)?" · recommended for story":"")+((m.id===recSpecs)?" · recommended for specs":""),
              onClick:()=>choose(m.id)},
              m.label,
              (m.id===recStory||m.id===recSpecs) && React.createElement("span",{className:"write-seg-rec",
                title:(m.id===recStory?"story":"specs")+" recommendation"},"★"))))));
      })(),
      // the ACTIVE engine's note, so the pick is informed without hovering
      pick && React.createElement("div",{className:"write-dock-note sel"},
        labelOf(pick)+" — "+(((models.find(m=>m.id===pick)||{}).note)||"")),
      React.createElement("div",{className:"write-dock-foot"},"A pick applies for THIS session; every new session starts on Auto.")));
}
window.WritingDock = WritingDock;

window.AiOrb = AiOrb;

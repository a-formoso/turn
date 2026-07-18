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
function WritingDock(){
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
  const SHORT = { "claude-opus-4-8":"4.8", "claude-fable-5":"FABLE", "gemini-3.5-flash":"FLASH", "gpt-5.5-2026-04-23":"GPT5", "kimi-k3":"K3" };
  const short = pick ? (SHORT[pick]||pick.slice(0,5).toUpperCase()) : "AUTO";
  const choose = (id)=>{ if(typeof window.setWritingModelId==="function") window.setWritingModelId(id||""); force(x=>x+1); };
  const labelOf = (id)=> ((models.find(m=>m.id===id)||{}).label)||id;
  return React.createElement("div",{className:"write-dock nb-dock"+(open?" open":""),ref,"aria-label":"Writing engine"},
    React.createElement("button",{className:"nb-dock-toggle","aria-expanded":open?"true":"false",
      title:"Writing engine — the text model behind drafting, agents and story builds. AUTO follows the per-task recommendation; a pick here applies for this session.",
      onClick:()=>setOpen(o=>!o)},
      React.createElement("span",{className:"nb-dock-chip model"},short),
      React.createElement("span",{className:"nb-dock-chip"},"TEXT")),
    open && React.createElement("div",{className:"nb-dock-panel write-dock-panel"},
      React.createElement("div",{className:"write-dock-title"},"Writing engine"),
      React.createElement("button",{className:"write-dock-row"+(pick?"":" on"),onClick:()=>choose("")},
        React.createElement("span",{className:"write-dock-name"},"Auto — recommended per task"),
        React.createElement("span",{className:"write-dock-note"},"story \u2192 "+labelOf(recStory)+" \u00b7 specs \u2192 "+labelOf(recSpecs))),
      models.map(m=>React.createElement("button",{key:m.id,className:"write-dock-row"+(pick===m.id?" on":""),
        title:m.note||"",onClick:()=>choose(m.id)},
        React.createElement("span",{className:"write-dock-name"},m.label,
          m.id===recStory && React.createElement("i",{className:"write-dock-rec"},"story rec"),
          m.id===recSpecs && React.createElement("i",{className:"write-dock-rec"},"specs rec")),
        React.createElement("span",{className:"write-dock-note"},m.note||""))),
      React.createElement("div",{className:"write-dock-foot"},"A pick applies for THIS session; every new session starts on Auto.")));
}
window.WritingDock = WritingDock;

window.AiOrb = AiOrb;

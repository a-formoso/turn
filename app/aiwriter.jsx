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

window.AiOrb = AiOrb;

/* newstory.jsx — the New Story intake. Many doors in (seed types), one logline out,
   then hands off to the Adaptation agent. Meets a filmmaker where their idea lives. */

const SEED_TYPES = [
  { id:"logline",   label:"Logline",     icon:"target",  hint:"You have a one-line pitch.",
    inputLabel:"Your logline", placeholder:"A grieving deep-sea welder hears her dead daughter\u2019s voice in the drowned city she was hired to repair." },
  { id:"whatif",    label:"\u201cWhat if\u2026\u201d", icon:"sparkles", hint:"A premise as a question.",
    inputLabel:"Your \u201cwhat if\u2026\u201d", placeholder:"What if a town could sell its memories \u2014 and one family sold too much?" },
  { id:"character", label:"Character",   icon:"user",    hint:"A person you can\u2019t stop thinking about.",
    inputLabel:"Describe the character", placeholder:"A retired con artist who can\u2019t stop lying \u2014 even to the granddaughter who just found her." },
  { id:"image",     label:"Image / vibe",icon:"palette", hint:"A single striking image.",
    inputLabel:"The image or vibe", placeholder:"A lighthouse keeper watching fog roll in and quietly erase the town, house by house." },
  { id:"surprise",  label:"Surprise me", icon:"film",    hint:"Start from nothing.",
    inputLabel:"", placeholder:"" },
];

function NewStoryIntake({ onClose, onLaunch, aiOn }){
  const [format, setFormat] = React.useState("film");   // Step 0 — what are we making?
  const [seed, setSeed] = React.useState("logline");
  const [text, setText] = React.useState("");
  const [step, setStep] = React.useState("format");  // format | seed | loglines | synopsis
  const [loading, setLoading] = React.useState(false);
  const [candidates, setCandidates] = React.useState([]);
  const [chosen, setChosen] = React.useState("");
  const [err, setErr] = React.useState("");
  // synopsis stage
  const [syn, setSyn] = React.useState(null);        // full research+synopsis object
  const [synLoading, setSynLoading] = React.useState(false);
  const [setup, setSetup] = React.useState("");
  const [conf, setConf] = React.useState("");
  const [reso, setReso] = React.useState("");
  const [showResearch, setShowResearch] = React.useState(true);
  const cfg = SEED_TYPES.find(s=>s.id===seed) || SEED_TYPES[0];
  const needsText = seed !== "surprise";

  const develop = async ()=>{
    if(loading) return;
    if(needsText && !text.trim()){ setErr("Add a little more to work from."); return; }
    setErr(""); setLoading(true);
    try{
      const outs = (typeof aiSeedToLoglines==="function") ? await aiSeedToLoglines(seed, text) : null;
      if(outs && outs.length){ setCandidates(outs); setChosen(outs[0]); setStep("loglines"); }
      else setErr("Couldn\u2019t shape that into a logline \u2014 try adding a detail or two.");
    }catch(e){ setErr("Something went wrong. Try again."); }
    setLoading(false);
  };

  const researchSynopsis = async ()=>{
    if(synLoading) return;
    const l=(chosen||"").trim();
    if(!l){ setErr("Choose a logline first."); return; }
    setErr(""); setSynLoading(true);
    try{
      const s = (typeof aiResearchSynopsis==="function") ? await aiResearchSynopsis(l) : null;
      if(s && s.synopsis){
        setSyn(s); setSetup(s.synopsis.setup||""); setConf(s.synopsis.confrontation||""); setReso(s.synopsis.resolution||"");
        setShowResearch(true); setStep("synopsis");
      } else setErr("Couldn\u2019t research that into a synopsis \u2014 try again, or skip to build from the logline.");
    }catch(e){ setErr("Something went wrong. Try again."); }
    setSynLoading(false);
  };

  const buildWith = (withSyn)=>{
    const l=(chosen||"").trim(); if(!l) return;
    let synOut = null;
    if(withSyn && syn){
      synOut = { ...syn, synopsis:{ setup:setup.trim(), confrontation:conf.trim(), resolution:reso.trim() } };
    }
    onLaunch(l, synOut, format);
  };

  const pillar = (label, body)=> body ? React.createElement("div",{className:"syn-pillar"},
    React.createElement("div",{className:"syn-pillar-lab"},label),
    React.createElement("div",{className:"syn-pillar-tx"},body)) : null;

  const fact = (syn && syn.research && syn.research.fact) || {};
  const lenses = [["What happens",fact.whatHappens],["How it feels",fact.howItFeels],
    ["Frustrating",fact.frustrating],["Lovely",fact.lovely]].filter(x=>x[1]);

  return React.createElement("div",{className:"ns-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"ns-panel"},
      React.createElement("div",{className:"ns-head"},
        React.createElement("div",{className:"ns-head-t"},
          React.createElement("span",{className:"ns-orb"}),
          React.createElement("div",null,
            React.createElement("div",{className:"ns-title"},"New Story"),
            React.createElement("div",{className:"ns-sub"},
              step==="format"?"What are we making?"
              :step==="seed"?"Bring your idea in whatever shape it\u2019s in"
              :step==="loglines"?"Pick the logline to build from"
              :"Research \u2192 synopsis \u00b7 review before the spine builds"))),
        (typeof window.WritingModelPicker==="function") && React.createElement(window.WritingModelPicker,null),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),

      !aiOn && React.createElement("div",{className:"ag-warn"},
        React.createElement(Icon.alert,{s:13}),"The model isn\u2019t available right now \u2014 idea development needs it."),

      step==="format"
        ? React.createElement("div",{className:"ns-body"},
            React.createElement("div",{className:"ns-seclab"},"Pick a format — it sets the size, not the method"),
            React.createElement("div",{className:"ns-formats"},
              (window.FORMATS||[]).map(f=>
                React.createElement("button",{key:f.id,className:"ns-format "+(format===f.id?"on":""),
                  onClick:()=>setFormat(f.id)},
                  React.createElement(Icon[f.icon]||Icon.film,{s:16}),
                  React.createElement("span",{className:"ns-format-name"},f.label),
                  React.createElement("span",{className:"ns-format-blurb"},f.blurb)))),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:onClose},"Cancel"),
              React.createElement("button",{className:"ns-btn primary",onClick:()=>setStep("seed")},
                "Continue →")))

        : step==="seed"
        ? React.createElement("div",{className:"ns-body"},
            React.createElement("div",{className:"ns-seclab"},"How did your idea arrive?"),
            React.createElement("div",{className:"ns-chips"},
              SEED_TYPES.map(s=>
                React.createElement("button",{key:s.id,className:"ns-chip "+(seed===s.id?"on":""),
                  onClick:()=>{ setSeed(s.id); setErr(""); }},
                  React.createElement(Icon[s.icon]||Icon.target,{s:14}), s.label))),
            React.createElement("div",{className:"ns-hint"},cfg.hint),
            needsText && React.createElement("div",{className:"ns-field"},
              React.createElement("div",{className:"ns-input-lab"},cfg.inputLabel),
              React.createElement("textarea",{className:"ns-input",value:text,placeholder:cfg.placeholder,
                onChange:e=>setText(e.target.value),rows:4,autoFocus:true})),
            !needsText && React.createElement("div",{className:"ns-surprise"},
              React.createElement(Icon.sparkles,{s:15}),"MUSE will invent a few original loglines for you to choose from."),
            err && React.createElement("div",{className:"ns-err"},err),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:()=>setStep("format")},"← Back"),
              React.createElement("button",{className:"ns-btn primary",onClick:develop,disabled:loading||!aiOn},
                loading?React.createElement(React.Fragment,null,
                  React.createElement("span",{className:"ns-spin"}),"Developing\u2026")
                  :React.createElement(React.Fragment,null,
                  React.createElement(Icon.sparkles,{s:15}),"Develop into a logline"))))

        : step==="loglines"
        ? React.createElement("div",{className:"ns-body"},
            React.createElement("div",{className:"ns-seclab"},"Choose a logline \u2014 edit it freely"),
            React.createElement("div",{className:"ns-cands"},
              candidates.map((c,i)=>
                React.createElement("button",{key:i,className:"ns-cand "+(chosen===c?"on":""),
                  onClick:()=>setChosen(c)},
                  React.createElement("span",{className:"ns-cand-dot"}),
                  React.createElement("span",{className:"ns-cand-tx"},c)))),
            React.createElement("div",{className:"ns-field"},
              React.createElement("div",{className:"ns-input-lab"},"Final logline"),
              React.createElement("textarea",{className:"ns-input",value:chosen,
                onChange:e=>setChosen(e.target.value),rows:3})),
            err && React.createElement("div",{className:"ns-err"},err),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:()=>setStep("seed")},"\u2190 Back"),
              React.createElement("button",{className:"ns-btn link",onClick:develop,disabled:loading||synLoading},
                loading?"Re-developing\u2026":"Regenerate"),
              React.createElement("button",{className:"ns-btn primary",onClick:researchSynopsis,disabled:synLoading||loading||!chosen.trim()||!aiOn},
                synLoading?React.createElement(React.Fragment,null,
                  React.createElement("span",{className:"ns-spin"}),"Researching\u2026")
                  :React.createElement(React.Fragment,null,
                  React.createElement(Icon.search||Icon.sparkles,{s:15}),"Research \u2192 synopsis"))))

        : React.createElement("div",{className:"ns-body"},
            React.createElement("div",{className:"syn-titlerow"},
              React.createElement("div",{className:"syn-worktitle"},syn&&syn.title),
              React.createElement("button",{className:"syn-research-toggle",onClick:()=>setShowResearch(v=>!v)},
                React.createElement(Icon.layers,{s:12}), showResearch?"Hide research":"Show research")),

            showResearch && React.createElement("div",{className:"syn-research"},
              React.createElement("div",{className:"syn-research-head"},"Three Pillars of Research"),
              pillar("Memory", syn&&syn.research&&syn.research.memory),
              pillar("Imagination", syn&&syn.research&&syn.research.imagination),
              (fact.world||fact.role||lenses.length) && React.createElement("div",{className:"syn-pillar"},
                React.createElement("div",{className:"syn-pillar-lab"},"Fact"),
                fact.world && React.createElement("div",{className:"syn-fact-line"},
                  React.createElement("span",{className:"syn-fact-k"},"World"), fact.world),
                fact.role && React.createElement("div",{className:"syn-fact-line"},
                  React.createElement("span",{className:"syn-fact-k"},"Role"), fact.role),
                lenses.length>0 && React.createElement("div",{className:"syn-lens-grid"},
                  lenses.map(([k,v],i)=>React.createElement("div",{key:i,className:"syn-lens"},
                    React.createElement("div",{className:"syn-lens-k"},k),
                    React.createElement("div",{className:"syn-lens-v"},v)))))),

            React.createElement("div",{className:"syn-seclab"},"Synopsis \u2014 edit any paragraph before building"),
            React.createElement("div",{className:"syn-para"},
              React.createElement("div",{className:"syn-para-lab"},"The Setup"),
              React.createElement("textarea",{className:"ns-input syn-input",value:setup,rows:3,onChange:e=>setSetup(e.target.value)})),
            React.createElement("div",{className:"syn-para"},
              React.createElement("div",{className:"syn-para-lab"},"The Confrontation / Complication"),
              React.createElement("textarea",{className:"ns-input syn-input",value:conf,rows:3,onChange:e=>setConf(e.target.value)})),
            React.createElement("div",{className:"syn-para"},
              React.createElement("div",{className:"syn-para-lab"},"The Resolution"),
              React.createElement("textarea",{className:"ns-input syn-input",value:reso,rows:3,onChange:e=>setReso(e.target.value)})),
            err && React.createElement("div",{className:"ns-err"},err),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:()=>setStep("loglines")},"\u2190 Back"),
              React.createElement("button",{className:"ns-btn link",onClick:researchSynopsis,disabled:synLoading},
                synLoading?"Re-researching\u2026":"Regenerate"),
              React.createElement("button",{className:"ns-btn primary",onClick:()=>buildWith(true),disabled:synLoading||!chosen.trim()},
                React.createElement(Icon.film,{s:15}),"Build this story")))));
}
window.NewStoryIntake = NewStoryIntake;

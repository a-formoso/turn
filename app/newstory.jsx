/* newstory.jsx — the New Story intake. Many doors in (seed types), one logline out,
   then hands off to the Adaptation agent. Meets a filmmaker where their idea lives. */

const SEED_TYPES = [
  { id:"logline",   label:"Logline",     icon:"target",  hint:"You have a one-line pitch.",
    inputLabel:"Your logline", placeholder:"A grieving deep-sea welder hears her dead daughter\u2019s voice in the drowned city she was hired to repair." },
  { id:"whatif",    label:"\u201cWhat if\u2026\u201d", icon:"sparkles", hint:"A premise as a question.",
    inputLabel:"Your \u201cwhat if\u2026\u201d", placeholder:"What if a town could sell its memories \u2014 and one family sold too much?" },
  { id:"talk",      label:"Talk it through", icon:"mic", hint:"Not sure yet? Talk it out loud \u2014 I\u2019ll ask a few questions and listen.",
    inputLabel:"", placeholder:"" },
];

// the four intake screens, in order — drives the header progress stepper
/* Step order (reordered 2026-07-11, owner-approved): the SEED comes first — a
   creator arrives with an idea, not a container. Developing the seed recommends
   the format + framework, and the SHAPE step then shows that recommendation
   pre-selected (an explicit pick there still always wins). */
const NS_STEPS = [
  { id:"seed",     label:"Seed" },
  { id:"format",   label:"Shape" },
  { id:"loglines", label:"Logline" },
  { id:"synopsis", label:"Synopsis" },
];

// ⌘/Ctrl+Enter (and plain Enter on single-line inputs) advances the flow
const onCmdEnter = (fn, plainToo)=> (e)=>{
  if(e.key==="Enter" && (e.metaKey || e.ctrlKey || (plainToo && !e.shiftKey))){
    e.preventDefault(); fn();
  }
};

/* ---- Voice adapter — the swappable speak()/listen() layer for "Talk it through".
   PREFERS ElevenLabs (TTS via window.elSpeak, STT via MediaRecorder → window.elTranscribe,
   both through the signed-in proxy) and FALLS BACK to the browser's free Web Speech API when
   the proxy isn't available. The interview/logline logic above is untouched: it still just
   calls speak()/listen(). ElevenLabs STT has no live interim transcript and is tap-to-stop
   (record until the user clicks the mic again), unlike Web Speech's auto-stop on a pause. ---- */
const Voice = (()=>{
  const SR = (typeof window!=="undefined") && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const synth = (typeof window!=="undefined") && window.speechSynthesis;
  const mediaOk = (typeof navigator!=="undefined") && navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    && (typeof window!=="undefined") && window.MediaRecorder;
  const elReady = ()=> (typeof window!=="undefined") && typeof window.voiceProxyReady==="function" && window.voiceProxyReady()
    && typeof window.elSpeak==="function" && typeof window.elTranscribe==="function";
  let rec = null, mr = null, mrStream = null, currentAudio = null, speakSeq = 0;
  const pickRecMime = ()=>{
    const want = ["audio/webm;codecs=opus","audio/webm","audio/mp4","audio/ogg;codecs=opus","audio/ogg"];
    for(const m of want){ try{ if(window.MediaRecorder.isTypeSupported(m)) return m; }catch(e){} }
    return "";
  };
  const blobToB64 = (blob)=> new Promise((res,rej)=>{ const fr=new FileReader();
    fr.onload=()=>{ const s=String(fr.result||""); res(s.slice(s.indexOf(",")+1)); }; fr.onerror=()=>rej(fr.error); fr.readAsDataURL(blob); });
  const synthSpeak = (text, onend)=>{
    if(!synth){ onend&&onend(); return; }
    try{ synth.cancel(); const u=new SpeechSynthesisUtterance(String(text||"")); u.rate=1.03; u.pitch=1;
      u.onend=()=>onend&&onend(); u.onerror=()=>onend&&onend(); synth.speak(u); }catch(e){ onend&&onend(); }
  };
  return {
    // capability is dynamic: ElevenLabs (proxy + mic) OR the browser fallback
    get sttSupported(){ return (elReady() && !!mediaOk) || !!SR; },
    get ttsSupported(){ return elReady() || !!synth; },
    async speak(text, onend){
      this.stopSpeaking();   // cancel anything playing (bumps speakSeq)
      const seq = speakSeq;  // this call now owns the latest generation
      if(elReady()){
        let url=""; try{ url = await window.elSpeak(text); }catch(e){}
        if(seq!==speakSeq) return;                 // superseded or stopped while fetching
        if(url){
          try{
            const a = new Audio(url); currentAudio = a;
            a.onended = a.onerror = ()=>{ if(currentAudio===a) currentAudio=null; onend&&onend(); };
            await a.play();
            return;
          }catch(e){ if(seq!==speakSeq) return; /* autoplay/format blocked → fall back */ }
        }
      }
      if(seq!==speakSeq) return;
      synthSpeak(text, onend);
    },
    stopSpeaking(){ speakSeq++; try{ if(currentAudio){ currentAudio.pause(); currentAudio=null; } }catch(e){} try{ synth && synth.cancel(); }catch(e){} },
    // begin a single listening turn; callbacks deliver partial (Web Speech only) + final transcripts
    listen({ onInterim, onFinal, onError }){
      if(elReady() && mediaOk){
        navigator.mediaDevices.getUserMedia({ audio:true }).then(stream=>{
          mrStream = stream;
          try{
            const mime = pickRecMime();
            const chunks = [];
            mr = new MediaRecorder(stream, mime?{ mimeType:mime }:undefined);
            mr.ondataavailable = (e)=>{ if(e.data && e.data.size) chunks.push(e.data); };
            mr.onstop = async ()=>{
              try{ mrStream && mrStream.getTracks().forEach(t=>t.stop()); }catch(e){} mrStream=null;
              const type = (mr && mr.mimeType) || mime || "audio/webm";
              const blob = new Blob(chunks, { type });
              if(!blob.size){ onFinal && onFinal(""); return; }
              try{
                const b64 = await blobToB64(blob);
                const text = await window.elTranscribe(b64, type.split(";")[0]);
                onFinal && onFinal(text||"");
              }catch(e){ onError && onError("stt-failed"); }
            };
            mr.start();
          }catch(e){ try{ stream.getTracks().forEach(t=>t.stop()); }catch(_){} onError && onError(String(e)); }
        }).catch(err=>{ onError && onError(err && (err.name==="NotAllowedError"||err.name==="SecurityError") ? "not-allowed" : "error"); });
        return;
      }
      // Web Speech fallback
      if(!SR){ onError&&onError("unsupported"); return; }
      try{
        rec = new SR();
        rec.lang = "en-US"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
        let finalText = "";
        rec.onresult = (e)=>{
          let interim = "";
          for(let i=e.resultIndex; i<e.results.length; i++){
            const r = e.results[i];
            if(r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
          }
          onInterim && onInterim((finalText+" "+interim).trim());
        };
        rec.onerror = (e)=>onError&&onError((e&&e.error)||"error");
        rec.onend = ()=>{ onFinal && onFinal(finalText.trim()); };
        rec.start();
      }catch(e){ onError&&onError(String(e)); }
    },
    stopListening(){
      try{ if(mr && mr.state!=="inactive"){ mr.stop(); mr=null; return; } }catch(e){}
      try{ if(mrStream){ mrStream.getTracks().forEach(t=>t.stop()); mrStream=null; } }catch(e){}
      try{ rec && rec.stop(); }catch(e){}
    },
  };
})();

/* The spoken interview. Renders the conversation + mic; calls aiSeedInterview to
   drive it, and hands the discovered loglines up to Step 3 via onComplete. */
function NSInterview({ formatLabel, onComplete, onBack }){
  const [chat, setChat] = React.useState([]);     // [{role:'assistant'|'user', content}]
  const [thinking, setThinking] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [voiceOn, setVoiceOn] = React.useState(true);
  const [err, setErr] = React.useState("");
  const voiceOnRef = React.useRef(voiceOn); voiceOnRef.current = voiceOn;
  const scrollRef = React.useRef(null);
  const hErr = (e)=>String((e&&e.message)||"Something went wrong — try again.");
  const say = (t)=>{ if(voiceOnRef.current) Voice.speak(t); };

  // greet + first question on mount
  React.useEffect(()=>{ let alive=true;
    (async()=>{
      setThinking(true);
      try{
        const r = await aiSeedInterview([], formatLabel);
        if(alive && r){ setChat([{role:"assistant",content:r.say}]); say(r.say); }
      }catch(e){ if(alive) setErr(hErr(e)); }
      if(alive) setThinking(false);
    })();
    return ()=>{ alive=false; Voice.stopSpeaking(); Voice.stopListening(); };
  // eslint-disable-next-line
  },[]);

  React.useEffect(()=>{ const el=scrollRef.current; if(el) el.scrollTop=el.scrollHeight; },[chat,interim,thinking]);

  const send = async (raw)=>{
    const t = String(raw||"").trim();
    if(!t || thinking) return;
    Voice.stopSpeaking();
    const next = [...chat, {role:"user", content:t}];
    setChat(next); setTyped(""); setInterim(""); setErr(""); setThinking(true);
    try{
      const r = await aiSeedInterview(next, formatLabel);
      if(!r){ setErr("I didn’t catch that — try again."); setThinking(false); return; }
      setChat(c=>[...c, {role:"assistant", content:r.say}]);
      say(r.say);
      if(r.done && r.loglines && r.loglines.length){
        setThinking(false);
        onComplete(r.loglines);   // hand off to Step 3 (loglines)
        return;
      }
    }catch(e){ setErr(hErr(e)); }
    setThinking(false);
  };

  const toggleMic = ()=>{
    if(listening){ Voice.stopListening(); setListening(false); return; }
    if(!Voice.sttSupported){ setErr("Voice input isn’t supported in this browser — type your answer instead."); return; }
    Voice.stopSpeaking();
    setErr(""); setInterim(""); setListening(true);
    Voice.listen({
      onInterim:(tx)=>setInterim(tx),
      onFinal:(tx)=>{ setListening(false); if(tx) send(tx); else setInterim(""); },
      onError:(er)=>{ setListening(false);
        setErr(er==="not-allowed"||er==="service-not-allowed" ? "Mic access was blocked — type your answer instead."
          : er==="unsupported" ? "Voice input isn’t supported here — type your answer instead."
          : "Didn’t catch that — try again, or type it."); },
    });
  };

  return React.createElement("div",{className:"ns-body ns-talk"},
    React.createElement("div",{className:"ns-talk-head"},
      React.createElement("div",{className:"ns-talk-status"},
        React.createElement("span",{className:"ns-talk-orb"+(thinking?" think":listening?" live":"")}),
        thinking ? "Thinking…" : listening ? "Listening…" : "Let’s find your story"),
      Voice.ttsSupported && React.createElement("button",{className:"ns-talk-mute",onClick:()=>{ if(voiceOn) Voice.stopSpeaking(); setVoiceOn(v=>!v); },
        title:voiceOn?"Mute voice":"Unmute voice"},
        React.createElement(Icon[voiceOn?"sparkles":"x"]||Icon.sparkles,{s:12}), voiceOn?"Voice on":"Voice off")),

    // tell the user plainly when their browser can't do spoken answers
    !Voice.sttSupported && React.createElement("div",{className:"ns-talk-note"},
      React.createElement(Icon.alert,{s:13}),
      React.createElement("span",null,
        React.createElement("b",null,"Voice answers need Chrome or Edge."),
        " In this browser, just type your replies below — it's the same conversation. Open Cinema Machine in Chrome to talk it through out loud.")),

    React.createElement("div",{className:"ns-talk-thread",ref:scrollRef},
      chat.map((m,i)=>React.createElement("div",{key:i,className:"ns-talk-msg "+m.role},
        React.createElement("div",{className:"ns-talk-bubble"},m.content))),
      (listening && interim) && React.createElement("div",{className:"ns-talk-msg user pending"},
        React.createElement("div",{className:"ns-talk-bubble"},interim)),
      thinking && React.createElement("div",{className:"ns-talk-msg assistant"},
        React.createElement("div",{className:"ns-talk-bubble"},
          React.createElement("span",{className:"ns-talk-dots"},
            React.createElement("i"),React.createElement("i"),React.createElement("i"))))),

    err && React.createElement("div",{className:"ns-err"},err),

    React.createElement("div",{className:"ns-talk-input"},
      Voice.sttSupported && React.createElement("button",{className:"ns-mic"+(listening?" on":""),onClick:toggleMic,disabled:thinking,
        title:listening?"Stop":"Speak your answer"},
        React.createElement(Icon.mic,{s:18})),
      React.createElement("input",{className:"ns-input ns-talk-type",value:typed,
        placeholder:Voice.sttSupported?"…or type your answer":"Type your answer",
        onChange:e=>setTyped(e.target.value),onKeyDown:onCmdEnter(()=>send(typed),true),disabled:thinking,autoFocus:!Voice.sttSupported}),
      React.createElement("button",{className:"ns-btn primary",onClick:()=>send(typed),disabled:thinking||!typed.trim()},"Send")),

    React.createElement("div",{className:"ns-foot"},
      React.createElement("button",{className:"ns-btn ghost",onClick:()=>{ Voice.stopSpeaking(); Voice.stopListening(); onBack(); }},"← Back")));
}

function NewStoryIntake({ onClose, onLaunch, aiOn }){
  // the writing model developing THIS story — synced with the global drafting picker,
  // so loglines, research, synopsis and the spine build all run on the picked engine
  const [mid, setMid] = React.useState(()=> (typeof window.getWritingModelId==="function") ? window.getWritingModelId() : "");
  const pickModel = (id)=>{ setMid(id); if(typeof window.setWritingModelId==="function") window.setWritingModelId(id); };
  const [format, setFormat] = React.useState("film");   // Step 0 — what are we making?
  const [framework, setFramework] = React.useState("threeact");   // Step 0 — how is it told?
  // did the writer ACTIVELY pick these, or sail past the defaults? An explicit pick is
  // never overridden; untouched knobs get the AI's recommended shape at develop time.
  const [formatTouched, setFormatTouched] = React.useState(false);
  const [frameworkTouched, setFrameworkTouched] = React.useState(false);
  const [autoShape, setAutoShape] = React.useState(null);   // {formatLabel?, frameworkLabel?, why} — shown on the logline step
  const [seed, setSeed] = React.useState("logline");
  const [text, setText] = React.useState("");
  const [step, setStep] = React.useState("seed");  // seed | interview | format(=shape) | loglines | synopsis
  const [loading, setLoading] = React.useState(false);
  const [candidates, setCandidates] = React.useState([]);
  const [chosen, setChosen] = React.useState("");
  const [err, setErr] = React.useState("");
  // synopsis stage
  const [syn, setSyn] = React.useState(null);        // full research+synopsis object
  const [title, setTitle] = React.useState("");      // editable work-title (seeds from research)
  const [synLoading, setSynLoading] = React.useState(false);
  // the synopsis paragraphs take the FRAMEWORK's shape (3 for three-act/journey,
  // 4 for kishōtenketsu/circle) — editable [{key,label,text}]
  const [paras, setParas] = React.useState([]);
  const [showResearch, setShowResearch] = React.useState(true);
  const cfg = SEED_TYPES.find(s=>s.id===seed) || SEED_TYPES[0];
  const needsText = seed !== "talk";
  const formatLabel = (((window.FORMATS||[]).find(f=>f.id===format)||{}).label || "film").toLowerCase();

  const develop = async (dest)=>{
    if(loading) return;
    if(needsText && !text.trim()){ setErr("Add a little more to work from."); return; }
    setErr(""); setLoading(true);
    try{
      const outs = (typeof aiSeedToLoglines==="function") ? await aiSeedToLoglines(seed, text) : null;
      if(outs && outs.length){
        // the writer's own LOGLINE seed is candidate #1, verbatim and pre-selected \u2014
        // the sharpened variants are optional, never the default (their words win)
        const mine = seed==="logline" ? text.trim() : "";
        const norm = (s)=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
        const cands = mine ? [mine, ...outs.filter(o=>norm(o)!==norm(mine))] : outs.slice();
        setCandidates(cands); setChosen(cands[0]);
        // AUTO-SHAPE: apply the recommended format/framework to any knob the writer
        // didn't actively pick \u2014 an explicit Step-1 choice always wins
        const sh = outs.shape;
        if(sh){
          const applied = {};
          if(sh.format && !formatTouched && sh.format!==format){ setFormat(sh.format);
            applied.formatLabel = (((window.FORMATS||[]).find(f=>f.id===sh.format))||{}).label || sh.format; }
          if(sh.framework && !frameworkTouched && sh.framework!==framework){ setFramework(sh.framework);
            applied.frameworkLabel = (((window.FRAMEWORKS||[]).find(f=>f.id===sh.framework))||{}).label || sh.framework; }
          setAutoShape((applied.formatLabel || applied.frameworkLabel) ? { ...applied, why: sh.why||"" } : null);
        } else setAutoShape(null);
        setStep(dest==="loglines" ? "loglines" : "format");   // first pass confirms the SHAPE; regenerate stays put
      }
      else setErr("Couldn\u2019t shape that into a logline \u2014 try adding a detail or two.");
    }catch(e){ setErr(String((e&&e.message)||"Something went wrong. Try again.")); }
    setLoading(false);
  };

  const researchSynopsis = async ()=>{
    if(synLoading) return;
    const l=(chosen||"").trim();
    if(!l){ setErr("Choose a logline first."); return; }
    setErr(""); setSynLoading(true);
    try{
      const s = (typeof aiResearchSynopsis==="function") ? await aiResearchSynopsis(l, text, framework, format) : null;
      if(s && s.synopsis){
        setSyn(s);
        setTitle(s.title||"");
        setParas(Array.isArray(s.synopsis.paras) && s.synopsis.paras.length
          ? s.synopsis.paras.map(pg=>({ ...pg, text: pg.text||"" }))
          : [{key:"setup",label:"The Setup",text:s.synopsis.setup||""},
             {key:"confrontation",label:"The Confrontation / Complication",text:s.synopsis.confrontation||""},
             {key:"resolution",label:"The Resolution",text:s.synopsis.resolution||""}]);
        setShowResearch(true); setStep("synopsis");
      } else setErr("Couldn\u2019t research that into a synopsis \u2014 try again, or tweak the logline and regenerate.");
    }catch(e){ setErr(String((e&&e.message)||"Something went wrong. Try again.")); }
    setSynLoading(false);
  };

  // Research → Synopsis is mandatory (it's what makes the build specific), so the
  // spine always builds FROM the reviewed synopsis — there is no logline-only path.
  const build = ()=>{
    const l=(chosen||"").trim(); if(!l || !syn) return;
    const edited = paras.map(pg=>({ ...pg, text:(pg.text||"").trim() }));
    const synopsis = { paras: edited };
    edited.forEach(pg=>{ synopsis[pg.key] = pg.text; });
    const synOut = { ...syn, title:(title||"").trim()||syn.title, synopsis };
    onLaunch(l, synOut, format, framework);
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
              step==="format"?"Confirm the shape \u2014 format & structure"
              :step==="seed"?"Bring your idea in whatever shape it\u2019s in"
              :step==="interview"?"Talk it through \u00b7 I\u2019ll listen and shape loglines"
              :step==="loglines"?"Pick the logline to build from"
              :"Research \u2192 synopsis \u00b7 review before the spine builds"))),
        React.createElement("label",{className:"ns-model-badge",title:"The model that develops this story — loglines, research, synopsis and the spine build"},
          React.createElement(Icon.sparkles,{s:11}),
          React.createElement("select",{className:"ns-model-sel",value:mid,disabled:loading,
            onChange:(e)=>pickModel(e.target.value)},
            (window.WRITING_MODELS||[]).map(m=>React.createElement("option",{key:m.id,value:m.id,title:m.note||""},m.label)))),
        React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),

      // progress stepper — which of the four intake screens we're on
      // (the voice interview is a sub-mode of Seed, so it keeps Seed lit)
      (()=>{ const cur = NS_STEPS.findIndex(s=>s.id===(step==="interview"?"seed":step));
        return React.createElement("div",{className:"ns-steps"},
          NS_STEPS.map((s,i)=>React.createElement("div",{key:s.id,
            className:"ns-step "+(i<cur?"done":i===cur?"on":"todo")},
            React.createElement("span",{className:"ns-step-dot"}, i<cur?React.createElement(Icon.check,{s:11}):String(i+1)),
            React.createElement("span",{className:"ns-step-lab"},s.label)))); })(),

      !aiOn && React.createElement("div",{className:"ag-warn"},
        React.createElement(Icon.alert,{s:13}),"The model isn\u2019t available right now \u2014 idea development needs it."),

      step==="format"
        ? React.createElement("div",{className:"ns-body"},
            // the seed's recommendation, pre-applied to any knob the writer hasn't
            // touched — this screen CONFIRMS the shape rather than cold-asking for it
            autoShape && React.createElement("div",{className:"ns-autoshape"},
              React.createElement(Icon.sparkles,{s:12}),
              React.createElement("span",null,
                "Recommended for this story: ",
                React.createElement("b",null,[autoShape.formatLabel, autoShape.frameworkLabel].filter(Boolean).join(" · ")),
                autoShape.why ? (" — "+autoShape.why) : "",
                " Pick anything below to override — your choice always wins.")),
            React.createElement("div",{className:"ns-seclab"},"Pick a format — it sets the size, not the method"),
            React.createElement("div",{className:"ns-formats"},
              (window.FORMATS||[]).map(f=>
                React.createElement("button",{key:f.id,className:"ns-format "+(format===f.id?"on":""),
                  onClick:()=>{ setFormat(f.id); setFormatTouched(true); }},
                  React.createElement(Icon[f.icon]||Icon.film,{s:16}),
                  React.createElement("span",{className:"ns-format-name"},f.label),
                  React.createElement("span",{className:"ns-format-blurb"},f.blurb)))),
            React.createElement("div",{className:"ns-seclab",style:{marginTop:18}},"How should it be told?"),
            React.createElement("div",{className:"ns-formats fw"},
              (window.FRAMEWORKS||[]).map(f=>
                React.createElement("button",{key:f.id,className:"ns-format "+(framework===f.id?"on":""),
                  onClick:()=>{ setFramework(f.id); setFrameworkTouched(true); }},
                  React.createElement(Icon[f.icon]||Icon.graph,{s:16}),
                  React.createElement("span",{className:"ns-format-name"},f.label),
                  React.createElement("span",{className:"ns-format-blurb"},f.blurb)))),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:()=>setStep("seed")},"← Back"),
              React.createElement("button",{className:"ns-btn primary",onClick:()=>setStep(candidates.length?"loglines":"seed")},
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
                onChange:e=>setText(e.target.value),onKeyDown:onCmdEnter(develop),rows:4,autoFocus:true})),
            seed==="talk" && React.createElement("div",{className:"ns-surprise"},
              React.createElement(Icon.mic,{s:15}),
              Voice.sttSupported
                ? "Press the mic and just talk — I’ll ask a few friendly questions, then shape loglines from your answers. Prefer typing? You can do that too."
                : "I’ll ask a few friendly questions and shape loglines from your answers. (Voice input isn’t available in this browser, so you’ll type your answers — same conversation.)"),
            err && React.createElement("div",{className:"ns-err"},err),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:onClose},"Cancel"),
              seed==="talk"
                ? React.createElement("button",{className:"ns-btn primary",onClick:()=>{ setErr(""); setStep("interview"); },disabled:!aiOn},
                    React.createElement(Icon.mic,{s:15}),"Start the conversation")
                : React.createElement("button",{className:"ns-btn primary",onClick:develop,disabled:loading||!aiOn},
                    loading?React.createElement(React.Fragment,null,
                      React.createElement("span",{className:"ns-spin"}),"Developing\u2026")
                      :React.createElement(React.Fragment,null,
                      React.createElement(Icon.sparkles,{s:15}),"Develop into a logline"))))

        : step==="interview"
        ? React.createElement(NSInterview,{ formatLabel,
            onComplete:(lls)=>{ setCandidates(lls); setChosen(lls[0]||""); setErr(""); setStep("format"); },
            onBack:()=>setStep("seed") })

        : step==="loglines"
        ? React.createElement("div",{className:"ns-body"},
            // the AI picked the story's SHAPE for any knob the writer left on defaults \u2014
            // say so, say why, and offer the way back to change it
            autoShape && React.createElement("div",{className:"ns-autoshape"},
              React.createElement(Icon.sparkles,{s:12}),
              React.createElement("span",null,
                "Shaped for this story: ",
                React.createElement("b",null,[autoShape.formatLabel, autoShape.frameworkLabel].filter(Boolean).join(" \u00b7 ")),
                autoShape.why ? (" \u2014 "+autoShape.why) : ""),
              React.createElement("button",{className:"ns-btn link",onClick:()=>setStep("format"),
                title:"Back to the Shape step \u2014 an explicit pick there always wins"},"Change")),
            React.createElement("div",{className:"ns-seclab"},"Choose a logline \u2014 edit it freely"),
            React.createElement("div",{className:"ns-cands"},
              candidates.map((c,i)=>
                React.createElement("button",{key:i,className:"ns-cand "+(chosen===c?"on":""),
                  onClick:()=>setChosen(c)},
                  React.createElement("span",{className:"ns-cand-dot"}),
                  React.createElement("span",{className:"ns-cand-tx"},c),
                  (i===0 && seed==="logline" && c===text.trim()) &&
                    React.createElement("span",{className:"ns-cand-mine"},"yours \u2014 untouched")))),
            React.createElement("div",{className:"ns-field"},
              React.createElement("div",{className:"ns-input-lab"},"Final logline"),
              React.createElement("textarea",{className:"ns-input",value:chosen,
                onChange:e=>setChosen(e.target.value),onKeyDown:onCmdEnter(researchSynopsis),rows:3})),
            err && React.createElement("div",{className:"ns-err"},err),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:()=>setStep("format")},"\u2190 Back"),
              React.createElement("button",{className:"ns-btn link",onClick:()=>develop("loglines"),disabled:loading||synLoading},
                loading?"Re-developing\u2026":"Regenerate"),
              React.createElement("button",{className:"ns-btn primary",onClick:researchSynopsis,disabled:synLoading||loading||!chosen.trim()||!aiOn},
                synLoading?React.createElement(React.Fragment,null,
                  React.createElement("span",{className:"ns-spin"}),"Researching\u2026")
                  :React.createElement(React.Fragment,null,
                  React.createElement(Icon.search||Icon.sparkles,{s:15}),"Research \u2192 synopsis"))))

        : React.createElement("div",{className:"ns-body"},
            React.createElement("div",{className:"syn-titlerow"},
              React.createElement("input",{className:"syn-worktitle syn-title-input",value:title,
                placeholder:(syn&&syn.title)||"Working title",
                onChange:e=>setTitle(e.target.value),
                onKeyDown:onCmdEnter(()=>build(),true),
                title:"Working title — edit before building; the whole story inherits it"}),
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
            paras.map((pg,i)=>React.createElement("div",{key:pg.key,className:"syn-para"},
              React.createElement("div",{className:"syn-para-lab"},pg.label||pg.key),
              React.createElement("textarea",{className:"ns-input syn-input",value:pg.text,rows:3,
                onChange:e=>{ const v=e.target.value; setParas(ps=>ps.map((x,j)=>j===i?{...x,text:v}:x)); }}))),
            err && React.createElement("div",{className:"ns-err"},err),
            React.createElement("div",{className:"ns-foot"},
              React.createElement("button",{className:"ns-btn ghost",onClick:()=>setStep("loglines")},"\u2190 Back"),
              React.createElement("button",{className:"ns-btn link",onClick:researchSynopsis,disabled:synLoading},
                synLoading?"Re-researching\u2026":"Regenerate"),
              React.createElement("button",{className:"ns-btn primary",onClick:()=>build(),disabled:synLoading||!chosen.trim()},
                React.createElement(Icon.film,{s:15}),"Build this story")))));
}
window.NewStoryIntake = NewStoryIntake;

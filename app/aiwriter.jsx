/* aiwriter.jsx — AI co-writer panel (TURN's structural co-writer, "MUSE") */

function AiOrb({ s=24 }){ return React.createElement("div",{className:"ai-orb",style:{width:s,height:s}}); }

function pad2(n){ return String(n).padStart(2,"0"); }

function FlagCard({ scene, onGo, onFix }){
  return React.createElement("div",{className:"flag-card"},
    React.createElement("div",{className:"flag-card-top"},
      React.createElement(Icon.scissors,{s:13}),
      React.createElement("span",{className:"flag-card-t"},"Scene "+pad2(scene.no)+" doesn't turn"),
      React.createElement("span",{className:"sc",style:{marginLeft:"auto"}},
        chargeStr(scene.openCharge)+" \u2192 "+chargeStr(scene.closeCharge))),
    React.createElement("div",{className:"flag-card-d"},
      '"'+scene.title+'" opens and closes on the same charge. It reads as exposition. ',
      "Either push the closing value to reverse, or fold it into an adjacent scene."),
    React.createElement("div",{className:"flag-act"},
      React.createElement("button",{className:"flag-btn primary",onClick:()=>onGo(scene.id)},"Open scene"),
      React.createElement("button",{className:"flag-btn",onClick:()=>onFix(scene)},"Suggest a turn")));
}

function introNode(){
  return React.createElement(React.Fragment,null,
    React.createElement("strong",null,"I read the whole spine."), " ",
    "Sixteen scenes, three acts, an ",
    React.createElement("span",{className:"hi-pos"},"idealistic"),
    " controlling idea. The arc escalates cleanly toward the ",
    React.createElement("span",{className:"hi-pos"},"Story Climax"),
    " at scene 15 \u2014 death and rebirth. One structural note below.");
}

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

function MUSE({ scenes, selScene, onClose, onSelect, onFixScene }){
  const flagged = scenes.filter(s=>turnInfo(s).flagged);
  const [msgs, setMsgs] = React.useState(()=>[
    { who:"ai", kind:"intro" },
    flagged.length ? { who:"ai", kind:"flags" } : { who:"ai", kind:"clean" },
  ]);
  const [input, setInput] = React.useState("");
  const [chips, setChips] = React.useState(["Which scenes don't turn?","Pressure-test the climax","Is the arc working?","Draft shot prompts for this scene"]);
  const [chipsLoading, setChipsLoading] = React.useState(false);
  const bodyRef = React.useRef(null);

  React.useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; },[msgs,chips]);

  const push = (m)=>setMsgs(x=>[...x,m]);

  // contextual fallback follow-ups when the model isn't available
  const cannedFollowups = (q)=>{
    const l = q.toLowerCase();
    if(l.includes("turn")||l.includes("cut")) return ["How do I make Scene 6 turn?","Which scene is weakest?","Show me the act-two rhythm"];
    if(l.includes("climax")||l.includes("end")) return ["Does the low point land hard enough?","Is the resolution earned?","Pressure-test Neo's arc"];
    if(l.includes("character")||l.includes("neo")||l.includes("arc")) return ["Where does the arc nearly break?","Is Trinity's role earned?","How does the Oracle plant doubt?"];
    if(l.includes("shot")||l.includes("prompt")) return ["Write the model prompts","Draft beats for this scene","What's the key image here?"];
    return ["Which scenes don't turn?","Pressure-test the climax","Is the arc working?"];
  };

  const refreshChips = (q, answerText)=>{
    const live = typeof aiAvailable==="function" && aiAvailable();
    if(live && typeof aiMuseFollowups==="function"){
      setChipsLoading(true);
      aiMuseFollowups(q, answerText||"", scenes, selScene).then(fu=>{
        setChips(fu && fu.length ? fu : cannedFollowups(q)); setChipsLoading(false);
      }).catch(()=>{ setChips(cannedFollowups(q)); setChipsLoading(false); });
    } else {
      setChips(cannedFollowups(q));
    }
  };

  const cannedNode = (q)=>{
    const lower = q.toLowerCase();
    let node;
    if(lower.includes("turn")||lower.includes("cut")){
      if(flagged.length){
        node = React.createElement(React.Fragment,null,
          "Right now "+flagged.length+" scene"+(flagged.length>1?"s":"")+" ",
          React.createElement("span",{className:"hi-neg"},"don't turn"),
          ": "+flagged.map(s=>"Sc."+s.no).join(", ")+". ",
          "Scene 6 leans on pure exposition \u2014 Morpheus downloading the world. Either fold the lore into action or tighten it hard.");
      } else {
        node = "Every scene currently turns a value. The spine is structurally sound.";
      }
    } else if(lower.includes("climax")||lower.includes("end")){
      node = React.createElement(React.Fragment,null,
        '"Movies are about their last twenty minutes." Your climax (Sc.15, ',
        React.createElement("span",{className:"hi-pos"},"+3"),
        ") lands the idealistic charge \u2014 Neo dies in the Matrix and is reborn as The One. The act-two trough bottoms at ",
        React.createElement("span",{className:"hi-neg"},"\u22123"),
        " (Morpheus captured), so the final lift reads. Good alternation.");
    } else if(lower.includes("character")||lower.includes("neo")||lower.includes("arc")){
      node = React.createElement(React.Fragment,null,
        "Neo's ",React.createElement("strong",null,"conscious desire"),
        " (find the truth, free Morpheus) fights his ",React.createElement("strong",null,"unconscious desire"),
        " (to believe he's The One). The contradiction cracks open at the Oracle (Sc.8) and pays off at the resurrection (Sc.15).");
    } else if(lower.includes("midpoint")||lower.includes("act 2")||lower.includes("second act")){
      node = React.createElement(React.Fragment,null,
        "Your long second act pivots on the ",React.createElement("span",{className:"hi-neg"},"Oracle"),
        " at Sc.8 \u2014 she denies the prophecy and plants Neo's deepest doubt. That keeps the middle from sagging into a training montage.");
    } else if(lower.includes("shot")||lower.includes("prompt")){
      const sc = selScene || scenes[0];
      node = React.createElement(React.Fragment,null,
        "For ",React.createElement("strong",null,"Sc."+pad2(sc.no)+" "+sc.title),
        ", I'd cut 3 shots: a slow push on Neo's face as the world glitches; a low, wide hero shot as he stands to fight; a tight close-up on his eyes the instant belief lands. Want me to write the model prompts?");
    } else {
      node = "I can pressure-test any scene, draft beats, rebalance the charge graph, or turn a scene into shot-ready prompts. What do you want to push on?";
    }
    return node;
  };

  const send = (text)=>{
    const q = (text||input).trim(); if(!q) return;
    push({who:"me",kind:"text",text:q}); setInput("");
    const live = typeof aiAvailable==="function" && aiAvailable();
    if(live && typeof aiMuseReply==="function"){
      push({who:"ai",kind:"thinking"});
      aiMuseReply(q, scenes, selScene).then(txt=>{
        const answer = txt || "";
        setMsgs(x=>{ const y=x.filter(m=>m.kind!=="thinking");
          return [...y,{who:"ai",kind:"node",node: txt || cannedNode(q)}]; });
        refreshChips(q, answer);
      }).catch(()=>{
        setMsgs(x=>{ const y=x.filter(m=>m.kind!=="thinking");
          return [...y,{who:"ai",kind:"node",node:cannedNode(q)}]; });
        refreshChips(q, "");
      });
    } else {
      setTimeout(()=>push({who:"ai",kind:"node",node:cannedNode(q)}),320);
      refreshChips(q, "");
    }
  };

  const renderMsg = (m,i)=>{
    if(m.who==="me") return React.createElement("div",{key:i,className:"ai-msg me"},
      React.createElement("div",{className:"ai-msg-orb"}),
      React.createElement("div",{className:"ai-bubble"},m.text));
    if(m.kind==="thinking") return React.createElement("div",{key:i,className:"ai-msg"},
      React.createElement(AiOrb,{s:24}),
      React.createElement("div",{className:"ai-bubble"},
        React.createElement("span",{className:"ai-typing"},
          React.createElement("i",null),React.createElement("i",null),React.createElement("i",null))));
    let inner;
    if(m.kind==="intro") inner = introNode();
    else if(m.kind==="flags") inner = React.createElement(React.Fragment,null,
      React.createElement("div",{style:{marginBottom:4}},
        flagged.length===1 ? "One scene isn't pulling its weight:" : flagged.length+" scenes aren't pulling their weight:"),
      flagged.map(s=>React.createElement(FlagCard,{key:s.id,scene:s,onGo:onSelect,onFix:onFixScene})));
    else if(m.kind==="clean") inner = React.createElement(React.Fragment,null,
      React.createElement("span",{className:"hi-pos"},"Every scene turns."),
      " The spine is clean \u2014 nice work. Ask me to pressure-test the climax or the character arc.");
    else inner = m.node;
    return React.createElement("div",{key:i,className:"ai-msg"},
      React.createElement(AiOrb,{s:24}),
      React.createElement("div",{className:"ai-bubble"},inner));
  };

  const liveNow = typeof aiAvailable==="function" && aiAvailable();
  const headSub = liveNow
    ? (selScene ? ("live \u00b7 reading Sc."+pad2(selScene.no)) : "live \u00b7 reading the full spine")
    : (selScene ? ("reading \u00b7 Sc."+pad2(selScene.no)+" "+selScene.title) : "reading the full spine");

  return React.createElement("div",{className:"ai-panel"},
    React.createElement("div",{className:"ai-head"},
      React.createElement(AiOrb,{s:26}),
      React.createElement("div",{className:"ai-head-t"},
        React.createElement("div",{className:"ai-head-name"},"MUSE",
          React.createElement("span",{style:{fontFamily:"var(--f-mono)",fontSize:9,color:"var(--txt-3)",fontWeight:400,letterSpacing:".04em"}},"structural co-writer")),
        React.createElement("div",{className:"ai-head-sub"},headSub)),
      React.createElement(WritingModelPicker,null),
      React.createElement("button",{className:"ai-x",onClick:onClose},React.createElement(Icon.x,{s:15}))),

    React.createElement("div",{className:"ai-body",ref:bodyRef}, msgs.map(renderMsg)),

    React.createElement("div",{className:"ai-chips-wrap"},
      React.createElement("div",{className:"ai-chips-label"},
        chipsLoading ? "MUSE is thinking of next steps\u2026" : "Ask next"),
      React.createElement("div",{className:"ai-chips"},
        chipsLoading
          ? [0,1,2].map(i=>React.createElement("span",{key:i,className:"ai-chip skel"}))
          : chips.map((c,i)=>
              React.createElement("button",{key:i,className:"ai-chip",onClick:()=>send(c)},
                React.createElement("span",{className:"ai-chip-q"},"\u203a"),c)))),

    React.createElement("div",{className:"ai-input"},
      React.createElement("input",{value:input,placeholder:"Ask MUSE about your story\u2026",
        onChange:e=>setInput(e.target.value),onKeyDown:e=>{if(e.key==="Enter")send();}}),
      React.createElement("button",{className:"ai-send",onClick:()=>send()},React.createElement(Icon.send,{s:16}))),
  );
}
window.MUSE = MUSE;
window.AiOrb = AiOrb;

/* agents-ui.jsx — the Agents panel (a modal "Writers' Room").
   Drives a chosen agent's bounded loop, renders the live reasoning trace,
   and gates every change behind an Approve / Reject proposal card. */

function AgentIcon({ name, s=18 }){
  const map = { stethoscope:Icon.target, link:Icon.layers, flask:Icon.flask, film:Icon.film, board:Icon.board, palette:Icon.palette, userScan:Icon.userScan, box:Icon.box, globe:Icon.globe, robot:Icon.robot, image:Icon.image, clapper:Icon.clapper, clipboard:Icon.eye, check:Icon.check };
  const Ic = map[name] || Icon.sparkles;
  return React.createElement(Ic,{s});
}

const STEP_ICON = { plan:Icon.target, act:Icon.sparkles, observe:Icon.eye, ok:Icon.check,
  flag:Icon.alert, done:Icon.check, report:Icon.film };

function TraceStep({ step }){
  const Ic = STEP_ICON[step.k] || Icon.sparkles;
  return React.createElement("div",{className:"ag-step k-"+step.k},
    React.createElement("span",{className:"ag-step-ic"},React.createElement(Ic,{s:13})),
    React.createElement("div",{className:"ag-step-t"}, step.t,
      step.report && React.createElement(TableReadReport,{rep:step.report}),
      step.voiceReport && React.createElement(VoiceCheckReport,{rep:step.voiceReport})));
}

/* per-character voice distinctiveness: fingerprints + the swappable lines */
function VoiceCheckReport({ rep }){
  const fps = rep.fingerprints||[], swaps = rep.swappable||[];
  return React.createElement("div",{className:"tr-report"},
    rep.verdict && React.createElement("div",{className:"tr-block"},
      React.createElement("div",{className:"tr-lab"},"Voice separation"),
      React.createElement("div",{className:"tr-txt"},rep.verdict)),
    fps.length>0 && React.createElement("div",{className:"tr-block"},
      React.createElement("div",{className:"tr-lab"},"Voice fingerprints"),
      fps.map((f,i)=>React.createElement("div",{key:i,className:"vc-fp"},
        React.createElement("span",{className:"vc-fp-name"},f.name),
        React.createElement("span",{className:"vc-fp-voice"},f.voice)))),
    React.createElement("div",{className:"tr-notes"},
      React.createElement("div",{className:"tr-lab"},"Swappable lines"+(swaps.length?(" · "+swaps.length):"")),
      swaps.length===0
        ? React.createElement("div",{className:"tr-txt"},"None — every line could only belong to its speaker.")
        : swaps.map((x,i)=>React.createElement("div",{key:i,className:"tr-note",
            onClick:()=> x.scene && window.__turnJump && window.__turnJump(x.scene)},
            x.scene!=null && React.createElement("span",{className:"tr-note-sc"},"Sc "+x.scene),
            React.createElement("span",{className:"tr-note-tx"},
              React.createElement("b",null,(x.speaker||"?")+": "),"“"+x.line+"”",
              x.couldBe && React.createElement("em",{className:"vc-could"}," — could be "+x.couldBe+"."),
              x.why ? " "+x.why : "")))));
}

function TableReadReport({ rep, onJump }){
  return React.createElement("div",{className:"tr-report"},
    [["Pacing",rep.pacing],["Tone",rep.tone],["Voice",rep.voice]].map(([k,v])=> v &&
      React.createElement("div",{key:k,className:"tr-block"},
        React.createElement("div",{className:"tr-lab"},k),
        React.createElement("div",{className:"tr-txt"},v))),
    rep.notes && rep.notes.length>0 && React.createElement("div",{className:"tr-notes"},
      React.createElement("div",{className:"tr-lab"},"Notes"),
      rep.notes.map((n,i)=>
        React.createElement("div",{key:i,className:"tr-note",
          onClick:()=> n.scene && window.__turnJump && window.__turnJump(n.scene)},
          n.scene!=null && React.createElement("span",{className:"tr-note-sc"},"Sc "+n.scene),
          React.createElement("span",{className:"tr-note-tx"},n.issue)))));
}

/* rich proposal body for the Colorist agent: palette swatch bars + film stock + a
   per-scene colour strip with the per-scene rationale. */
function ColoristProposal({ proposal }){
  const p = proposal||{};
  const presets = p.presets||[];
  const byId = {}; presets.forEach(pr=>{ byId[pr.id]=pr; });
  const scenes = (p.scenes||[]).slice().sort((a,b)=>(a.no||0)-(b.no||0));
  const ss = p.sceneStyles||{};
  const why = (p.rationale && p.rationale.scenes) || {};
  const stock = (window.FILM_STOCKS||[]).find(f=>f.id===p.filmStock);
  const pad = (n)=>String(n).padStart(2,"0");
  const grad = (pr)=>{ const pal=(pr&&pr.palette)||[]; return pal.length>=3
    ? ("linear-gradient(135deg,"+pal[0]+" 0%,"+pal[1]+" 55%,"+pal[2]+" 100%)") : (pal[0]||"#555"); };
  return React.createElement("div",{className:"ag-color"},
    React.createElement("div",{className:"ag-color-presets"},
      presets.map(pr=> React.createElement("div",{className:"ag-color-preset",key:pr.id},
        React.createElement("div",{className:"ag-color-pname"}, pr.name),
        React.createElement("div",{className:"ag-color-bar"},
          (pr.palette||[]).slice(0,3).map((c,i)=>React.createElement("span",{key:i,style:{flex:[60,30,10][i]||10,background:c},title:c}))),
        pr.grade && React.createElement("div",{className:"ag-color-grade"}, pr.grade)))),
    stock && stock.id!=="none" && React.createElement("div",{className:"ag-color-stock"},
      React.createElement("b",null,"Film stock — "), stock.name),
    scenes.length>0 && React.createElement("div",{className:"ag-color-strip"},
      scenes.map(s=>{ const pr=byId[ss[s.id]];
        return React.createElement("span",{key:s.id,className:"ag-color-cell"+(pr?"":" none"),style:pr?{background:grad(pr)}:undefined,
          title:"Sc "+pad(s.no)+" · "+(s.title||"")+(pr?(" — "+pr.name):" — unassigned")+(why[s.id]?("\n"+why[s.id]):"")}, pad(s.no)); })),
    Object.keys(why).length>0 && React.createElement("div",{className:"ag-color-whys"},
      scenes.filter(s=>why[s.id]).map(s=>{ const pr=byId[ss[s.id]];
        return React.createElement("div",{key:s.id,className:"ag-color-why"},
          React.createElement("span",{className:"ag-color-why-sw",style:{background:grad(pr)}}),
          React.createElement("span",{className:"ag-color-why-no"}, pad(s.no)),
          React.createElement("span",{className:"ag-color-why-tx"}, why[s.id])); })));
}

function ProposalCard({ card, onApprove, onReject }){
  return React.createElement("div",{className:"ag-prop"+(card.danger?" danger":"")},
    React.createElement("div",{className:"ag-prop-h"},
      React.createElement(Icon.sparkles,{s:13}),
      React.createElement("span",{className:"ag-prop-title"},card.title),
      React.createElement("span",{className:"ag-prop-tag"},"Needs approval")),
    card.reason && React.createElement("div",{className:"ag-prop-reason"},card.reason),
    card.colorProposal && React.createElement(ColoristProposal,{proposal:card.colorProposal}),
    (card.before||card.after) && React.createElement("div",{className:"ag-diff"},
      React.createElement("div",{className:"ag-diff-row before"},
        React.createElement("span",{className:"ag-diff-lab"},"Now"),
        React.createElement("span",{className:"ag-diff-v"},card.before)),
      React.createElement("div",{className:"ag-diff-row after"},
        React.createElement("span",{className:"ag-diff-lab"},"Proposed"),
        React.createElement("span",{className:"ag-diff-v"},card.after))),
    card.list && React.createElement("div",{className:"ag-prop-list"},
      card.list.map((x,i)=>React.createElement("div",{key:i,className:"ag-prop-li"},x))),
    card.rationale && React.createElement("div",{className:"ag-prop-rat"},
      React.createElement(Icon.sparkles,{s:11}),card.rationale),
    React.createElement("div",{className:"ag-prop-act"},
      React.createElement("button",{className:"ag-btn ghost",onClick:onReject},"Reject"),
      React.createElement("button",{className:"ag-btn primary",onClick:onApprove},
        card.danger?"Replace project":"Approve & apply")));
}

const LOGLINE_EXAMPLES = [
  "A lighthouse keeper discovers the fog is erasing the town's memories \u2014 including her own.",
  "A grave-shift vending-machine restocker realizes one machine is dispensing objects from people's futures.",
  "Two estranged sisters must spend one last night in their flooding childhood home before it's demolished.",
  "A retired stunt double is hired to impersonate a dictator who may already be dead.",
  "A child's imaginary friend keeps showing up at her father's crime scenes.",
];

function IdeaHelper({ onPick }){
  const [open, setOpen] = React.useState(false);
  const [sparking, setSparking] = React.useState(false);
  const live = typeof aiAvailable==="function" && aiAvailable();
  const spark = async ()=>{
    if(sparking) return; setSparking(true);
    try{ const l = (typeof aiSparkLogline==="function") ? await aiSparkLogline() : null;
      if(l) onPick(l);
      else onPick(LOGLINE_EXAMPLES[Math.floor(Math.random()*LOGLINE_EXAMPLES.length)]);
    }catch(e){ onPick(LOGLINE_EXAMPLES[Math.floor(Math.random()*LOGLINE_EXAMPLES.length)]); }
    setSparking(false);
  };
  return React.createElement("div",{className:"idea-helper"},
    React.createElement("div",{className:"idea-bar"},
      React.createElement("span",{className:"idea-hint"},"Not sure where to start?"),
      live && React.createElement("button",{className:"idea-spark",onClick:spark,disabled:sparking},
        React.createElement(Icon.sparkles,{s:12}), sparking?"Sparking\u2026":"Spark an idea"),
      React.createElement("button",{className:"idea-toggle",onClick:()=>setOpen(o=>!o)},
        open?"Hide examples":"Show examples")),
    open && React.createElement("div",{className:"idea-list"},
      LOGLINE_EXAMPLES.map((ex,i)=>
        React.createElement("button",{key:i,className:"idea-ex",onClick:()=>onPick(ex)},
          React.createElement("span",{className:"idea-ex-q"},"\u201c"),ex))),
    React.createElement("div",{className:"idea-tip"},
      React.createElement(Icon.sparkles,{s:11}),
      "A good logline names ",React.createElement("b",null,"who"),", what they ",React.createElement("b",null,"want"),
      ", and what ",React.createElement("b",null,"stands in the way"),"."));
}

function AgentRunner({ agent, ctxFactory, onClose, onView, onBack, initialInput, autoStart, single, viewLabel, introExtra, force }){
  const [trace, setTrace] = React.useState([]);
  const [pending, setPending] = React.useState(null);   // proposal card awaiting decision
  const [status, setStatus] = React.useState("idle");   // idle|running|waiting|done
  const [input, setInput] = React.useState(initialInput||"");
  const resolver = React.useRef(null);
  const cancelled = React.useRef(false);
  const bodyRef = React.useRef(null);
  const inputRef = React.useRef(initialInput||"");
  React.useEffect(()=>{ inputRef.current = input; },[input]);

  React.useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; },[trace,pending]);
  React.useEffect(()=>()=>{ cancelled.current = true; if(resolver.current) resolver.current(false); },[]);
  // auto-run once when launched ready: New Story passes a logline; an input-less agent
  // (e.g. the Storyboard Director) auto-starts straight away.
  React.useEffect(()=>{ if(autoStart && (!agent.needsInput || (initialInput||"").trim())){ const t=setTimeout(()=>start(),60); return ()=>clearTimeout(t); } },[]);

  // ALL Writers' Room agents run on Claude; ART agents (Visual Researcher, Casting
  // Director…) get a live model PICKER in the header — synced with the drafting picker.
  const isArt = agent.room === "art";
  const _MODELS = window.WRITING_MODELS || [];
  const [artMid, setArtMid] = React.useState(()=> (typeof window.getWritingModelId==="function") ? window.getWritingModelId() : "");
  const pickArtModel = (id)=>{ setArtMid(id); if(typeof window.setWritingModelId==="function") window.setWritingModelId(id); };
  // Writers' Room agents run on the user's SELECTED writing model (not a hardcoded
  // one) — so picking Fable 5 in New Story actually runs Fable 5, not Opus 4.8.
  const _mid = isArt ? artMid : ((window.getWritingModelId && window.getWritingModelId()) || "claude-fable-5");
  const modelLabel = (_MODELS.find(m=>m.id===_mid)||{}).label || _mid || "model";
  const start = async ()=>{
    cancelled.current = false;
    setTrace([]); setPending(null); setStatus("running");
    const prevForce = window.__forceWritingModel;
    if(!isArt) window.__forceWritingModel = _mid;   // pin the run to the user's chosen writing model
    const ctx = ctxFactory({
      input: inputRef.current,
      agentName: agent.name,
      force: force,   // false | true | "draft" (re-draft specs but skip image generation)
      emit:(step)=> setTrace(tr=>[...tr, step]),
      propose:(card)=> new Promise(res=>{ setPending(card); setStatus("waiting");
        resolver.current = (val)=>{ resolver.current=null; setPending(null); setStatus("running"); res(val); }; }),
      cancelled:()=>cancelled.current,
    });
    // meter snapshot — the delta shows what THIS run cost in writing-model use
    const spend0 = (typeof window.turnTextSpend==="function") ? window.turnTextSpend() : null;
    try{ await agent.run(ctx); }
    catch(e){ setTrace(tr=>[...tr,{k:"flag",t:"The agent hit an error and stopped: "+(e.message||e)}]); }
    finally{ window.__forceWritingModel = prevForce; }
    if(spend0 && typeof window.turnTextSpend==="function"){
      const s1 = window.turnTextSpend();
      const calls = s1.calls - spend0.calls;
      if(calls>0){ const cr = Math.round((s1.credits - spend0.credits)*100)/100;
        setTrace(tr=>[...tr,{k:"observe",t:"This run used "+calls+" writing-model call"+(calls===1?"":"s")+" · ≈"+cr+" credit"+(cr===1?"":"s")+" (estimate — see your account menu for the running total)."}]); }
      else setTrace(tr=>[...tr,{k:"observe",t:"This run made no writing-model calls — it cost nothing."}]);
    }
    if(!cancelled.current) setStatus("done");
  };

  const decide = (val)=>{ if(resolver.current) resolver.current(val); };

  const running = status==="running" || status==="waiting";

  return React.createElement("div",{className:"ag-runner"},
    React.createElement("div",{className:"ag-runner-head"},
      React.createElement("button",{className:"ag-x",onClick:onBack,title:"All agents"},React.createElement(Icon.chevL,{s:16})),
      React.createElement("span",{className:"ag-runner-ic"},React.createElement(AgentIcon,{name:agent.icon,s:16})),
      React.createElement("div",{className:"ag-runner-t"},
        React.createElement("div",{className:"ag-runner-name"},agent.name,
          isArt
            ? React.createElement("select",{className:"ag-runner-model ag-runner-model-sel",disabled:running,
                title:running?"Finishes this run on the current model — switch between runs":"Model running this agent — pick before you start",
                value:_mid,onChange:(e)=>pickArtModel(e.target.value)},
                _MODELS.map(m=>React.createElement("option",{key:m.id,value:m.id,title:m.note||""},m.label)))
            : React.createElement("span",{className:"ag-runner-model",title:"Model running this agent"}, modelLabel)),
        React.createElement("div",{className:"ag-runner-sub"},
          status==="idle"?"Ready":status==="done"?"Finished":status==="waiting"?"Awaiting your approval":"Working\u2026")),
      React.createElement("button",{className:"ag-x",onClick:onClose,title:"Close"},React.createElement(Icon.x,{s:16}))),

    agent.needsInput && status==="idle" && React.createElement("div",{className:"ag-input-wrap"},
      React.createElement("div",{className:"ag-input-lab"},agent.inputLabel),
      React.createElement("textarea",{className:"ag-input",placeholder:agent.inputPlaceholder,value:input,
        onChange:e=>setInput(e.target.value),rows:3}),
      agent.ideaStarters && React.createElement(IdeaHelper,{onPick:setInput})),

    React.createElement("div",{className:"ag-body",ref:bodyRef},
      status==="idle" && React.createElement("div",{className:"ag-intro"},
        React.createElement("p",null,agent.blurb),
        introExtra,
        React.createElement("div",{className:"ag-intro-note"},
          React.createElement(Icon.eye,{s:13}),
          agent.autonomous?"Runs on its own \u2014 it boards every scene and you'll see each step. Press Stop anytime.":
          agent.kind==="report"?"Read-only \u2014 it reports, it won't change anything.":
          "Every change is shown for your approval before it's applied. Nothing happens without your OK.")),
      trace.map((s,i)=>React.createElement(TraceStep,{key:i,step:s})),
      running && !pending && React.createElement("div",{className:"ag-thinking"},
        React.createElement("span",{className:"ai-typing"},React.createElement("i",null),React.createElement("i",null),React.createElement("i",null))),
      pending && React.createElement(ProposalCard,{card:pending,
        onApprove:()=>decide(true),onReject:()=>decide(false)})),

    React.createElement("div",{className:"ag-runner-foot"},
      status==="idle" && React.createElement("button",{className:"ag-run",onClick:start},
        React.createElement(Icon.sparkles,{s:15}),"Run "+agent.name),
      running && React.createElement("button",{className:"ag-run stop",
        onClick:()=>{ cancelled.current=true; if(resolver.current) resolver.current(false); setStatus("done");
          setTrace(tr=>[...tr,{k:"flag",t:"Stopped by you."}]); }},
        React.createElement(Icon.x,{s:15}),"Stop"),
      status==="done" && React.createElement(React.Fragment,null,
        React.createElement("button",{className:"ag-run ghost",onClick: single?onClose:onBack}, single?"Close":"\u2190 All agents"),
        React.createElement("button",{className:"ag-run ghost",onClick:start},
          React.createElement(Icon.sparkles,{s:15}),"Run again"),
        onView && React.createElement("button",{className:"ag-run",onClick:()=>onView("spine")},
          viewLabel||"View story",React.createElement(Icon.chevR,{s:15})))));
}

function AgentsPanel({ onClose, onView, ctxFactory, aiOn, undoCount, undoLabel, onUndo, issues, initialAgentId, initialInput, autoStart, single, viewLabel, introExtra, force }){
  const agents = window.AGENTS || [];
  const [active, setActive] = React.useState(()=> initialAgentId ? (agents.find(a=>a.id===initialAgentId)||null) : null);
  const [auto, setAuto] = React.useState(!!autoStart);
  const iss = issues || {};
  const turnN = iss.doctor||0, contN = iss.continuity||0, totalN = turnN+contN;
  const issueParts = [];
  if(turnN) issueParts.push(turnN+(turnN>1?" scenes that don\u2019t turn":" scene that doesn\u2019t turn"));
  if(contN) issueParts.push(contN+(contN>1?" continuity gaps":" continuity gap"));
  return React.createElement("div",{className:"ag-overlay",onMouseDown:(e)=>{ if(e.target===e.currentTarget) onClose(); }},
    React.createElement("div",{className:"ag-panel"},
      active
        ? React.createElement(AgentRunner,{agent:active,ctxFactory,onClose,onView,single,viewLabel,introExtra,
            force: active.id===initialAgentId ? force : false,
            onBack: single ? onClose : ()=>{ setAuto(false); setActive(null); },
            initialInput: active.id===initialAgentId ? initialInput : "",
            autoStart: auto && active.id===initialAgentId})
        : React.createElement(React.Fragment,null,
            React.createElement("div",{className:"ag-head"},
              React.createElement("div",{className:"ag-head-t"},
                React.createElement("span",{className:"ag-orb"}),
                React.createElement("div",null,
                  React.createElement("div",{className:"ag-title"},"Agents"),
                  React.createElement("div",{className:"ag-sub"},"AI agents that refine your whole story"))),
              React.createElement("button",{className:"ag-x",onClick:onClose},React.createElement(Icon.x,{s:17}))),
            totalN>0
              ? React.createElement("div",{className:"ag-issues-row"},
                  React.createElement("span",{className:"ag-issues-badge"},totalN),
                  React.createElement("span",{className:"ag-issues-tx"},
                    React.createElement("b",null,"That \u201c"+totalN+"\u201d is your story health \u2014 "),
                    issueParts.join(" \u00b7 "),". ",
                    "Open ",(turnN?"Story Doctor":"Continuity Repair")," below to fix ",(totalN>1?"them":"it"),"."))
              : React.createElement("div",{className:"ag-issues-row clean"},
                  React.createElement("span",{className:"ag-issues-badge ok"},React.createElement(Icon.check,{s:12})),
                  React.createElement("span",{className:"ag-issues-tx"},"No open structural or continuity issues \u2014 your spine is sound.")),
            undoCount>0 && React.createElement("div",{className:"ag-undo-row"},
              React.createElement(Icon.undo,{s:14}),
              React.createElement("span",{className:"ag-undo-tx"},
                undoCount>1 ? (undoCount+" agent runs can be undone \u2014 last was "+undoLabel) : (undoLabel+" made changes you can undo")),
              React.createElement("button",{className:"ag-undo-btn",onClick:onUndo},"Undo last")),
            !aiOn && React.createElement("div",{className:"ag-warn"},
              React.createElement(Icon.alert,{s:13}),"The model isn't available right now \u2014 agents will use deterministic fallbacks where they can, but generative steps are limited."),
            React.createElement("div",{className:"ag-grid"},
              // creation lives in "New Story" now — hide the build agent (Adaptation)
              // from the picker, but keep it in the registry so New Story can drive it.
              agents.filter(a=>a.kind!=="build").map(a=>{
                const n = iss[a.id]||0;
                return React.createElement("button",{key:a.id,className:"ag-card",onClick:()=>setActive(a)},
                  React.createElement("div",{className:"ag-card-top"},
                    React.createElement("span",{className:"ag-card-ic"},React.createElement(AgentIcon,{name:a.icon,s:18})),
                    React.createElement("div",{className:"ag-card-tags"},
                      n>0 && React.createElement("span",{className:"ag-card-count"},n+(n>1?" issues":" issue")),
                      React.createElement("span",{className:"ag-card-kind k-"+a.kind},
                        a.kind==="fix"?"Fixes":a.kind==="build"?"Builds":"Reports"))),
                  React.createElement("div",{className:"ag-card-name"},a.name),
                  React.createElement("div",{className:"ag-card-blurb"},a.blurb),
                  React.createElement("div",{className:"ag-card-go"},"Open ",React.createElement(Icon.arrowR,{s:13})));
              })))));
}
window.AgentsPanel = AgentsPanel;

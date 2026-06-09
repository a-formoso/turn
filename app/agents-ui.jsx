/* agents-ui.jsx — the Agents panel (a modal "Writers' Room").
   Drives a chosen agent's bounded loop, renders the live reasoning trace,
   and gates every change behind an Approve / Reject proposal card. */

function AgentIcon({ name, s=18 }){
  const map = { stethoscope:Icon.target, link:Icon.layers, flask:Icon.flask, film:Icon.film, board:Icon.board };
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
      step.report && React.createElement(TableReadReport,{rep:step.report})));
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

function ProposalCard({ card, onApprove, onReject }){
  return React.createElement("div",{className:"ag-prop"+(card.danger?" danger":"")},
    React.createElement("div",{className:"ag-prop-h"},
      React.createElement(Icon.sparkles,{s:13}),
      React.createElement("span",{className:"ag-prop-title"},card.title),
      React.createElement("span",{className:"ag-prop-tag"},"Needs approval")),
    card.reason && React.createElement("div",{className:"ag-prop-reason"},card.reason),
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

function AgentRunner({ agent, ctxFactory, onClose, onView, onBack, initialInput, autoStart, single, viewLabel }){
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

  const start = async ()=>{
    cancelled.current = false;
    setTrace([]); setPending(null); setStatus("running");
    const ctx = ctxFactory({
      input: inputRef.current,
      agentName: agent.name,
      emit:(step)=> setTrace(tr=>[...tr, step]),
      propose:(card)=> new Promise(res=>{ setPending(card); setStatus("waiting");
        resolver.current = (val)=>{ resolver.current=null; setPending(null); setStatus("running"); res(val); }; }),
      cancelled:()=>cancelled.current,
    });
    try{ await agent.run(ctx); }
    catch(e){ setTrace(tr=>[...tr,{k:"flag",t:"The agent hit an error and stopped: "+(e.message||e)}]); }
    if(!cancelled.current) setStatus("done");
  };

  const decide = (val)=>{ if(resolver.current) resolver.current(val); };

  const running = status==="running" || status==="waiting";

  return React.createElement("div",{className:"ag-runner"},
    React.createElement("div",{className:"ag-runner-head"},
      React.createElement("button",{className:"ag-x",onClick:onBack,title:"All agents"},React.createElement(Icon.chevL,{s:16})),
      React.createElement("span",{className:"ag-runner-ic"},React.createElement(AgentIcon,{name:agent.icon,s:16})),
      React.createElement("div",{className:"ag-runner-t"},
        React.createElement("div",{className:"ag-runner-name"},agent.name),
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

function AgentsPanel({ onClose, onView, ctxFactory, aiOn, undoCount, undoLabel, onUndo, issues, initialAgentId, initialInput, autoStart, single, viewLabel }){
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
        ? React.createElement(AgentRunner,{agent:active,ctxFactory,onClose,onView,single,viewLabel,
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

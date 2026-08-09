/* muse.jsx — MUSE, the in-app help assistant, as a text CHATBOX (bottom-right, every room).
   Two modes:
   • SIGNED IN  — full, concise Claude-powered chat over your story (aiMuseChat), governed
     by the MUSE Protocol (docs/MUSE Protocol.md + museSystemPrompt() in ai.jsx).
   • SIGNED OUT — a curated TEASER: a few hand-written tastes of what Cinema Machine is + the Infinite
     Studio method, capped, always nudging sign-up. No model call, no story access, so
     visitors get a feel without the platform being fully open for free.
   MUSE only talks; the Agents change the story. It's brand-silent about what powers it. */

const MUSE_CHIPS = [
  "How do I start a new story?",
  "What is the Writers’ Room for?",
  "Which scenes don’t turn?",
  "How do the Agents work?",
];

/* ---------- signed-out teaser (curated, no AI) ---------- */
const VISITOR_CHIPS = [
  "What is Cinema Machine?",
  "What’s the Infinite Studio method?",
  "What can I build here?",
  "Is it free to sign up?",
];
const TEASER_LIMIT = 3;   // free messages before the sign-up gate
const TEASER_QA = [
  { k:["cinema machine","what is turn","whats turn","what's turn","what is this","what's this","whats this","about turn","what do you do","what does turn","tell me about"],
    a:"Cinema Machine is a story-architecture studio for AI filmmakers. You build your film as a value-charge spine — every scene plotted by its emotional charge, so you can see at a glance which scenes truly turn and which fall flat — then design its cast and world, and shoot it, all in one place. Sign up and I’ll architect yours with you." },
  { k:["infinite studio method","method","the craft","how does it work","philosophy","approach","theory","what makes"],
    a:"The Infinite Studio method is the craft Cinema Machine runs on: every scene should turn a value — swinging from positive to negative or back — driven by what your characters want against what stands in their way. Get that right and the whole film holds together. Sign up and I’ll pressure-test your scenes against it." },
  { k:["what can i make","what can i build","what can i do","make here","build here","capabilities","features","what's included","whats included","get out of"],
    a:"A complete film: the value-charge spine, scene beats, a generated screenplay, a full Art Room for characters, props, locations, style and shots — and the Stage, where it all becomes footage. Sign up to start your first story." },
  { k:["why sign up","is it free","it free","for free","sign up","signup","create account","cost","costs","price","prices","pricing","how much","plans","subscription","worth it","why should i"],
    a:"I can help with the story and explain how the studio works, but pricing and credits are handled outside MUSE. Open the account or plans window for the current options, then bring me back to the film you want to make." },
  { k:["who are you","what are you","your name","are you muse","hello","hi","hey"],
    a:"I’m MUSE, your story guide inside Cinema Machine. Once you’re signed in I read your spine and help you shape scenes, fix the ones that don’t turn, and answer anything about your film. Sign up and put me to work." },
];
const TEASER_GATE = "That’s part of the full studio — sign up and I’ll walk you through it with your own story open.";
function teaserAnswer(q){
  // Normalize curly apostrophes, then match each key on WORD BOUNDARIES — plain
  // substring matching false-fired (e.g. the greeting key "hi" inside "macHIne",
  // which made "What is Cinema Machine?" answer with MUSE's self-intro).
  const l = q.toLowerCase().replace(/[‘’]/g,"'");
  for(const item of TEASER_QA){
    if(item.k.some(k=>{
      const rx = new RegExp("\\b"+k.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b");
      return rx.test(l);
    })) return item.a;
  }
  return null;   // unknown / too deep → gentle gate
}

function MuseDock({ scenes, selScene, project, aiOn, signedIn, onSignIn }){
  const [open, setOpen] = React.useState(false);
  const [thread, setThread] = React.useState([]);   // [{q, a, err, errMsg, gate}]
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [visitorCount, setVisitorCount] = React.useState(0);

  // Robustness: the host (app.jsx) passes a boolean `signedIn`. If it's missing (e.g. a
  // stale cached app.jsx), detect auth ourselves so a signed-in user is never shown the
  // visitor teaser by mistake.
  const [detectedAuth, setDetectedAuth] = React.useState(null);
  React.useEffect(()=>{
    if(typeof signedIn === "boolean"){ setDetectedAuth(null); return; }
    let alive=true;
    (async()=>{ try{ const sb=(typeof window.sbClient==="function")?window.sbClient():null;
      const { data } = sb && sb.auth ? await sb.auth.getUser() : {data:null};
      if(alive) setDetectedAuth(!!(data && data.user)); }catch(e){ if(alive) setDetectedAuth(false); } })();
    return ()=>{ alive=false; };
  },[signedIn]);
  const authed = (typeof signedIn === "boolean") ? signedIn : (detectedAuth===true);

  const bodyRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const threadRef = React.useRef(thread); threadRef.current = thread;
  const scenesRef = React.useRef(scenes); scenesRef.current = scenes;
  const selRef = React.useRef(selScene); selRef.current = selScene;
  const busyRef = React.useRef(false);

  React.useEffect(()=>{ if(bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; },[thread,busy,open]);
  React.useEffect(()=>{ if(open && inputRef.current) inputRef.current.focus(); },[open]);
  React.useEffect(()=>{ setThread([]); setVisitorCount(0); setInput(""); },[authed]);   // reset on auth flip
  React.useEffect(()=>{
    if(!open) return;
    const h=(e)=>{ if(e.key==="Escape") setOpen(false); };
    window.addEventListener("keydown",h); return ()=>window.removeEventListener("keydown",h);
  },[open]);

  const capped = !authed && visitorCount >= TEASER_LIMIT;

  // signed-in: real Claude chat with multi-turn memory + the real error surfaced
  const askSignedIn = async (text)=>{
    const q = (text!=null?text:input).trim();
    if(!q || busyRef.current) return;
    setInput(""); setBusy(true); busyRef.current = true;
    const prior = (threadRef.current||[]).flatMap(m=> (m.a && !m.err) ? [{role:"user",text:m.q},{role:"ai",text:m.a}] : []);
    const turns = [...prior, {role:"user", text:q}];
    setThread(t=>[...t,{q,a:null}]);
    let a=null, errMsg=null;
    try{
      a = (typeof aiMuseChat==="function") ? await aiMuseChat(turns, scenesRef.current||[], selRef.current, project)
        : (typeof aiMuseReply==="function" ? await aiMuseReply(q, scenesRef.current||[], selRef.current, project) : null);
    }catch(e){ errMsg = (e && e.message) ? String(e.message) : "I can’t reach you right now — try again in a moment."; }
    if(!a && !errMsg) errMsg = "I didn’t catch a reply — try again.";
    setThread(t=>t.map((m,i)=> i===t.length-1 ? {q,a,err:!!errMsg,errMsg} : m));
    setBusy(false); busyRef.current = false;
  };

  // signed-out: curated teaser, no model call
  const askVisitor = (text)=>{
    const q = (text!=null?text:input).trim();
    if(!q || busyRef.current || visitorCount >= TEASER_LIMIT) return;
    setInput(""); setBusy(true); busyRef.current = true;
    setThread(t=>[...t,{q,a:null}]);
    const t = teaserAnswer(q);
    const a = t || TEASER_GATE;
    window.setTimeout(()=>{
      setThread(th=>th.map((m,i)=> i===th.length-1 ? {q,a,gate:!t} : m));
      setVisitorCount(c=>c+1);
      setBusy(false); busyRef.current = false;
    }, 440);
  };

  const ask = authed ? askSignedIn : askVisitor;

  const bubble = React.createElement("button",{className:"muse-bubble"+(open?" open":""),
    onClick:()=>setOpen(o=>!o), title: open?"Close MUSE":"Ask MUSE", "aria-label":"MUSE help assistant"},
    open ? React.createElement(Icon.x,{s:20}) : React.createElement("span",{className:"ai-orb"}));

  const greet = authed
    ? React.createElement("div",{className:"muse-greet"},
        React.createElement("div",{className:"muse-greet-t"},"Hi, I’m MUSE."),
        React.createElement("div",{className:"muse-greet-d"},
          "Your guide to Cinema Machine. Ask me about your story, any department, or how to get something done."))
    : React.createElement("div",{className:"muse-greet"},
        React.createElement("div",{className:"muse-greet-t"},"Hi, I’m MUSE."),
        React.createElement("div",{className:"muse-greet-d"},
          "Your story guide inside Cinema Machine. Ask me what this is about — then sign up free and I’ll build your film with you."));

  // suggestion chips: show the questions NOT yet asked, after every answer, so a visitor
  // (or anyone) can keep tapping their next query instead of typing. Hidden once capped.
  const allChips = authed ? MUSE_CHIPS : VISITOR_CHIPS;
  const asked = thread.reduce((s,m)=>{ s[m.q]=1; return s; }, {});
  const remainingChips = allChips.filter(c=>!asked[c]);
  const chipsRow = (remainingChips.length>0 && !busy && !capped) &&
    React.createElement("div",{className:"muse-chips"+(thread.length?" followup":"")},
      thread.length>0 && React.createElement("div",{className:"muse-chips-lab"}, authed?"Ask next":"Try another"),
      remainingChips.map((c)=>React.createElement("button",{key:c,className:"muse-chip",disabled:busy,onClick:()=>ask(c)},c)));

  const askBar = React.createElement("div",{className:"muse-ask-bar"},
    React.createElement("input",{className:"muse-ask-in",placeholder:"Ask MUSE anything…",ref:inputRef,
      value:input, disabled:busy,
      onChange:e=>setInput(e.target.value),
      onKeyDown:e=>{ if(e.key==="Enter") ask(); }}),
    React.createElement("button",{className:"muse-ask-send",disabled:busy||!input.trim(),onClick:()=>ask()},
      React.createElement(Icon.sparkles,{s:14}), busy?"…":"Ask"));

  const footer = authed
    ? askBar
    : capped
      ? React.createElement("div",{className:"muse-visitor-foot"},
          React.createElement("div",{className:"muse-cap-note"},"That’s your free taste. Sign up to ask me anything about your film."),
          React.createElement("button",{className:"muse-signup big",onClick:onSignIn},
            React.createElement(Icon.sparkles,{s:14}),"Sign up free"))
      : React.createElement("div",{className:"muse-visitor-foot"},
          askBar,
          React.createElement("button",{className:"muse-signup",onClick:onSignIn},"Sign up free — unlock the full studio"));

  const panel = open && React.createElement("div",{className:"muse-dock"},
    React.createElement("div",{className:"muse-dock-head"},
      React.createElement("span",{className:"ai-orb"}),
      React.createElement("div",{className:"muse-dock-ht"},
        React.createElement("div",{className:"muse-dock-t"},"MUSE"),
        React.createElement("div",{className:"muse-dock-status"},
          React.createElement("span",{className:"muse-dot"+((authed&&aiOn)?" on":"")}),
          authed ? (aiOn?"Here to help":"Offline") : "Free preview")),
      React.createElement("button",{className:"muse-dock-x",onClick:()=>setOpen(false),title:"Close"},
        React.createElement(Icon.x,{s:16}))),

    React.createElement("div",{className:"muse-dock-body",ref:bodyRef},
      thread.length===0 && greet,
      thread.map((m,i)=>React.createElement(React.Fragment,{key:i},
        React.createElement("div",{className:"muse-q"},m.q),
        m.a==null && !m.err
          ? React.createElement("div",{className:"muse-a typing"},
              React.createElement("span",{className:"ai-typing"},React.createElement("i",null),React.createElement("i",null),React.createElement("i",null)))
          : m.err
            ? React.createElement("div",{className:"muse-a err"}, m.errMsg || "I can’t reach you right now — try again in a moment.")
            : React.createElement("div",{className:"muse-a"+(m.gate?" gate":"")},
                m.a,
                m.gate && !authed && React.createElement("button",{className:"muse-inline-signup",onClick:onSignIn},"Sign up free →")))),
      chipsRow),

    footer,

    authed && !aiOn && React.createElement("div",{className:"muse-ask-off"},
      React.createElement(Icon.alert,{s:12}),"MUSE needs to be online to answer — check your connection."));

  return React.createElement("div",{className:"muse-dock-wrap"}, panel, bubble);
}
window.MuseDock = MuseDock;

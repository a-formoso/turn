/* landing.jsx — the commercial landing page shown to signed-out visitors INSTEAD of the
   app. Sells what Cinema Machine is (the departments / the Infinite Studio method) and drives sign-up.
   The actual app (spine, Writers' Room, Art Room, Agents) is never exposed until sign-in.
   The floating MUSE teaser still rides on top (mounted by app.jsx) for a live taste.
   DESIGN: light editorial look — white page, near-black ink, hairline-framed content
   column, pill buttons (black primary) — independent of the app's dark theme. */

/* hero media — the Value-Charge Spine, the product's visual signature, drawn as
   an animated SVG inside the film frame (corner brackets kept). A deliberate
   ABSTRACTION, not a screenshot: it sells the one idea — scenes plotted by
   emotional charge, turning end to end. The line wears a charge gradient
   (green above the midline, red below) with a soft glow, scenes land as
   halo'd nodes, and after the draw a playhead of light travels the spine on
   a slow loop — the story being read. The 13-scene arc is invented. */
function HeroSpine(){
  const W=1260, H=540, MID=H/2, AMP=72, X0=76, X1=W-52;
  const SCENES=[
    {c:-1.0},{c:1.6,m:"Inciting Incident",up:true},{c:-0.6},{c:-2.2,m:"Act Climax"},
    {c:1.2},{c:2.4,m:"Rising Action",up:true},{c:-0.8},{c:-2.6,m:"Mid-Act Climax"},
    {c:1.8,m:"Reversal",up:true},{c:-1.2},{c:-2.9,m:"Low Point"},{c:0.8},
    {c:2.3,m:"Climax",up:true},
  ];
  const pts=SCENES.map((s,i)=>({ ...s, x:X0+(X1-X0)*i/(SCENES.length-1), y:MID-s.c*AMP }));
  let d="M"+pts[0].x.toFixed(1)+" "+pts[0].y.toFixed(1);
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
    d+=" C"+[p1.x+(p2.x-p0.x)/6, p1.y+(p2.y-p0.y)/6,
             p2.x-(p3.x-p1.x)/6, p2.y-(p3.y-p1.y)/6, p2.x, p2.y]
             .map(n=>n.toFixed(1)).join(" ");
  }
  const area = d+" L"+X1+" "+MID+" L"+X0+" "+MID+" Z";
  const actX=[(pts[3].x+pts[4].x)/2, (pts[10].x+pts[11].x)/2];
  const mono={fontFamily:"var(--f-mono)",letterSpacing:".14em"};
  const runStyle={offsetPath:'path("'+d+'")'};
  return React.createElement("div",{className:"lp-video","aria-label":"The value-charge spine — every scene plotted by its emotional charge"},
    React.createElement("div",{className:"lp-video-corners","aria-hidden":"true"}),
    React.createElement("div",{className:"lp-video-corners b","aria-hidden":"true"}),
    React.createElement("svg",{className:"lp-spine",viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"xMidYMid meet","aria-hidden":"true"},
      React.createElement("defs",null,
        React.createElement("linearGradient",{id:"lpgLine",gradientUnits:"userSpaceOnUse",x1:0,y1:MID-3*AMP,x2:0,y2:MID+3*AMP},
          React.createElement("stop",{offset:"0",stopColor:"var(--pos-bright)"}),
          React.createElement("stop",{offset:".5",stopColor:"rgba(255,255,255,.95)"}),
          React.createElement("stop",{offset:"1",stopColor:"var(--neg-bright)"})),
        React.createElement("linearGradient",{id:"lpgFill",gradientUnits:"userSpaceOnUse",x1:0,y1:MID-3*AMP,x2:0,y2:MID+3*AMP},
          React.createElement("stop",{offset:"0",stopColor:"rgba(90,211,152,.22)"}),
          React.createElement("stop",{offset:".5",stopColor:"rgba(255,255,255,0)"}),
          React.createElement("stop",{offset:"1",stopColor:"rgba(226,104,92,.22)"})),
        React.createElement("filter",{id:"lpgBlur",x:"-40%",y:"-40%",width:"180%",height:"180%"},
          React.createElement("feGaussianBlur",{stdDeviation:6}))),
      // charge gridlines + the neutral midline
      [-2,-1,1,2].map(c=>React.createElement("line",{key:"g"+c,x1:X0-26,y1:MID-c*AMP,x2:X1+26,y2:MID-c*AMP,
        stroke:"rgba(255,255,255,.05)",strokeWidth:1})),
      React.createElement("line",{x1:X0-26,y1:MID,x2:X1+26,y2:MID,stroke:"rgba(255,255,255,.18)",strokeWidth:1}),
      React.createElement("text",{x:X0-26,y:84,fill:"rgba(255,255,255,.38)",fontSize:12,style:mono},"POSITIVE +"),
      React.createElement("text",{x:X0-26,y:H-64,fill:"rgba(255,255,255,.38)",fontSize:12,style:mono},"NEGATIVE −"),
      // act bands
      actX.map((x,i)=>React.createElement("line",{key:"ax"+i,x1:x,y1:64,x2:x,y2:H-48,
        stroke:"rgba(255,255,255,.12)",strokeWidth:1,strokeDasharray:"3 6"})),
      React.createElement("text",{x:X0+150,y:46,fill:"rgba(255,255,255,.34)",fontSize:11,textAnchor:"middle",style:mono},"ACT I · SETUP"),
      React.createElement("text",{x:(actX[0]+actX[1])/2,y:46,fill:"rgba(255,255,255,.34)",fontSize:11,textAnchor:"middle",style:mono},"ACT II · COMPLICATION"),
      React.createElement("text",{x:X1+26,y:46,fill:"rgba(255,255,255,.34)",fontSize:11,textAnchor:"end",style:mono},"ACT III · RESOLUTION"),
      // charge-tinted area under the wave, then the glow pass, then the line
      React.createElement("path",{className:"lp-spine-area",d:area,fill:"url(#lpgFill)"}),
      React.createElement("path",{className:"lp-spine-path glow",d,pathLength:1,stroke:"url(#lpgLine)",
        strokeWidth:7,opacity:.3,filter:"url(#lpgBlur)"}),
      React.createElement("path",{className:"lp-spine-path",d,pathLength:1,stroke:"url(#lpgLine)",strokeWidth:2.5}),
      // scene nodes: soft halo + core, colored by where the scene CLOSES
      pts.map((p,i)=>React.createElement("circle",{key:"h"+i,className:"lp-spine-halo",cx:p.x,cy:p.y,r:12,
        fill:p.c>=0?"var(--pos-bright)":"var(--neg-bright)",opacity:.14,
        style:{animationDelay:(0.35+i*0.16)+"s"}})),
      pts.map((p,i)=>React.createElement("circle",{key:"n"+i,className:"lp-spine-node",cx:p.x,cy:p.y,r:5.5,
        fill:p.c>=0?"var(--pos-bright)":"var(--neg-bright)",stroke:"var(--lpw-black)",strokeWidth:2.5,
        style:{animationDelay:(0.35+i*0.16)+"s"}})),
      // milestone captions
      pts.filter(p=>p.m).map((p,i)=>React.createElement("text",{key:"m"+i,className:"lp-spine-lab",
        x:p.x,y:p.up?p.y-24:p.y+34,textAnchor:"middle",fill:"rgba(255,255,255,.5)",fontSize:11,
        style:{...mono,animationDelay:(1.4+i*0.12)+"s"}},p.m.toUpperCase())),
      // the playhead — a dot of light reading the story on a loop
      React.createElement("circle",{className:"lp-spine-run halo",r:10,fill:"rgba(255,255,255,.35)",
        filter:"url(#lpgBlur)",style:runStyle}),
      React.createElement("circle",{className:"lp-spine-run",r:3.5,fill:"#fff",style:runStyle})));
}

const LP_FEATURES = [
  { no:"01", icon:"script", title:"Development",
    body:"Bring an idea. Develop it into a story, then a finished screenplay — scene by scene, draft by draft, until it reads right." },
  { no:"02", icon:"palette", title:"Pre-Production",
    body:"Design the film before you shoot it. Your cast, your places, your look — planned down to every single shot." },
  { no:"03", icon:"clapper", title:"Production",
    body:"Turn the plans into pictures. Storyboard the whole film from everything you’ve built — ready for the screen." },
];

/* the hero's rotating phrase — the FOUR narrative structures a film can be told
   in (the launch differentiation: one idea, four ways). Remounts on each tick
   (key change) so the entrance animation replays; ~2.2s per phrase. */
const LP_WORDS = ["a three-act drama","a hero’s journey","a story circle","a kishōtenketsu"];
function RotatingWord(){
  const [i, setI] = React.useState(0);
  React.useEffect(()=>{
    const t = setInterval(()=> setI(x=>(x+1)%LP_WORDS.length), 2200);
    return ()=> clearInterval(t);
  },[]);
  return React.createElement("span",{className:"lp-rotate",key:LP_WORDS[i]}, LP_WORDS[i]);
}

const LP_STEPS = [
  { n:"1", t:"Bring an idea", d:"A logline, a “what if” — or just talk it through out loud." },
  { n:"2", t:"Choose how it’s told", d:"Three-act, hero’s journey, story circle or kishōtenketsu — your idea, your structure." },
  { n:"3", t:"Build the film", d:"Story, script, cast, places, shots — it all grows in one place." },
];

/* Pricing — derived from the SINGLE source of truth (plans.jsx CINEMA_PLANS), so
   the homepage and the in-app checkout can never drift. Update tiers in one place. */
function lpTiers(){
  return (window.CINEMA_PLANS || []).map(p=>({
    id:p.tier, name:p.name, price:p.price, per:"/ month", blurb:p.blurb,
    feats:p.features, featured:!!p.popular, tag:p.popular?"Most popular":null,
    cta:"Choose "+p.name,
  }));
}

function Landing({ onStart, onSignIn }){
  const Icn = (name, s)=> React.createElement(Icon[name] || Icon.sparkles, {s:s||18});
  const [menuOpen, setMenuOpen] = React.useState(false);   // mobile hamburger menu
  return React.createElement("div",{className:"landing"},
    React.createElement("div",{className:"lp-page"},

    // full-height vertical rails at the column edges — they run through the hero,
    // sections, and footer, crossing every horizontal rule in a "+" intersection
    React.createElement("div",{className:"lp-rails","aria-hidden":"true"}),

    // nav content is constrained to the SAME centered column as the page content,
    // so the logo and buttons align with the headline / frame edges below
    React.createElement("header",{className:"lp-nav"},
      React.createElement("div",{className:"lp-nav-in"},
        React.createElement("div",{className:"lp-brand"},
          React.createElement("span",{className:"lp-logo"},"Cinema Machine")),
        React.createElement("div",{className:"lp-nav-cta"},
          React.createElement("button",{className:"lp-btn ghost",onClick:onSignIn},"Sign in"),
          React.createElement("button",{className:"lp-btn primary",onClick:()=>onStart("free")},"Get started")),
        // mobile-only hamburger (the inline buttons hide below 560px)
        React.createElement("button",{className:"lp-burger"+(menuOpen?" open":""),"aria-label":"Menu",
          "aria-expanded":menuOpen?"true":"false",onClick:()=>setMenuOpen(o=>!o)},
          React.createElement("span",null),React.createElement("span",null),React.createElement("span",null))),
      menuOpen && React.createElement("div",{className:"lp-menu"},
        React.createElement("button",{className:"lp-menu-item",onClick:()=>{ setMenuOpen(false); onSignIn(); }},"Sign in"),
        React.createElement("button",{className:"lp-menu-item primary",onClick:()=>{ setMenuOpen(false); onStart("free"); }},"Get started"))),

    // hero — UNFRAMED (no hairlines), headline + CTAs left, supporting copy right
    React.createElement("section",{className:"lp-hero"},
      React.createElement("div",{className:"lp-hero-copy"},
        React.createElement("h1",{className:"lp-h1"},"Your film, told",React.createElement("br",null),
          "as ",React.createElement(RotatingWord,null),"."),
        React.createElement("div",{className:"lp-hero-cta"},
          React.createElement("button",{className:"lp-btn primary big",onClick:()=>onStart("free")},"Start creating"),
          React.createElement("button",{className:"lp-btn ghost big",onClick:onSignIn},"Sign in"))),
      React.createElement("div",{className:"lp-hero-aside"},
        React.createElement("p",{className:"lp-lede"},
          "Cinema Machine is your AI film studio: bring an idea, choose one of four classic story structures, and watch it grow — a story spine built to hold an audience, a finished screenplay, a designed cast and world, and a storyboarded film."))),

    // hero media — the 21:9 short-film placeholder, still outside the frame
    React.createElement("section",{className:"lp-hero-media"},
      React.createElement(HeroSpine,null)),

    // the hairline-framed column starts BELOW the hero (features onward)
    React.createElement("div",{className:"lp-frame"},

      React.createElement("section",{className:"lp-section"},
        React.createElement("div",{className:"lp-sec-head"},
          React.createElement("div",{className:"lp-act"},"Act I · The studio"),
          React.createElement("h2",{className:"lp-h2"},"One studio, every department")),
        React.createElement("div",{className:"lp-grid"},
          LP_FEATURES.map((f,i)=>React.createElement("div",{key:i,className:"lp-card"},
            React.createElement("div",{className:"lp-card-top"},
              React.createElement("div",{className:"lp-card-ic"}, Icn(f.icon,20)),
              React.createElement("span",{className:"lp-card-no"}, f.no)),
            React.createElement("div",{className:"lp-card-t"}, f.title),
            React.createElement("div",{className:"lp-card-b"}, f.body))))),

      React.createElement("section",{className:"lp-section steps"},
        React.createElement("div",{className:"lp-sec-head"},
          React.createElement("div",{className:"lp-act"},"Act II · The process"),
          React.createElement("h2",{className:"lp-h2"},"How it works")),
        React.createElement("div",{className:"lp-steps"},
          LP_STEPS.map((s,i)=>React.createElement("div",{key:i,className:"lp-step"},
            React.createElement("div",{className:"lp-step-n"}, s.n),
            React.createElement("div",{className:"lp-step-t"}, s.t),
            React.createElement("div",{className:"lp-step-d"}, s.d))))),

      React.createElement("section",{className:"lp-section pricing"},
        React.createElement("div",{className:"lp-sec-head"},
          React.createElement("div",{className:"lp-act"},"Act III · The price"),
          React.createElement("h2",{className:"lp-h2"},"Simple pricing")),
        React.createElement("div",{className:"lp-tiers"},
          lpTiers().map((t,i)=>React.createElement("div",{key:i,className:"lp-tier"+(t.featured?" featured":"")},
            t.tag && React.createElement("div",{className:"lp-tier-tag"}, t.tag),
            React.createElement("div",{className:"lp-tier-name"}, t.name),
            React.createElement("div",{className:"lp-tier-price"},
              React.createElement("span",{className:"lp-tier-amt"}, t.price),
              React.createElement("span",{className:"lp-tier-per"}, t.per)),
            React.createElement("div",{className:"lp-tier-blurb"}, t.blurb),
            React.createElement("ul",{className:"lp-tier-feats"},
              t.feats.map((f,j)=>React.createElement("li",{key:j},
                React.createElement(Icon.check,{s:13}), React.createElement("span",null,f)))),
            React.createElement("button",{className:"lp-btn "+(t.featured?"primary":"ghost")+" full",onClick:()=>onStart(t.id)}, t.cta))))),

      // closing band — heading left, actions right (like a product-platform strip)
      React.createElement("section",{className:"lp-final"},
        React.createElement("div",{className:"lp-final-copy"},
          React.createElement("div",{className:"lp-act"},"Epilogue"),
          React.createElement("h2",{className:"lp-h2"},"Start building your film.")),
        React.createElement("div",{className:"lp-final-cta"},
          React.createElement("button",{className:"lp-btn ghost big",onClick:onSignIn},"Sign in"),
          React.createElement("button",{className:"lp-btn primary big",onClick:()=>onStart("free")},"Start creating")))),

    React.createElement("footer",{className:"lp-foot"},
      React.createElement("div",{className:"lp-foot-in"},
        React.createElement("span",{className:"lp-logo sm"},"Cinema Machine"),
        React.createElement("nav",{className:"lp-foot-links","aria-label":"Legal"},
          React.createElement("a",{className:"lp-foot-link",href:"#privacy"},"Privacy"),
          React.createElement("a",{className:"lp-foot-link",href:"#terms"},"Terms"),
          React.createElement("a",{className:"lp-foot-link",href:"#contact"},"Contact"))))));
}
window.Landing = Landing;

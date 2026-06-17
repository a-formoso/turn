/* landing.jsx — the commercial landing page shown to signed-out visitors INSTEAD of the
   app. Sells what TURN is (the departments / the Infinite Studio method) and drives sign-up.
   The actual app (spine, Writers' Room, Art Room, Agents) is never exposed until sign-in.
   The floating MUSE teaser still rides on top (mounted by app.jsx) for a live taste.
   DESIGN: light editorial look — white page, near-black ink, hairline-framed content
   column, pill buttons (black primary) — independent of the app's dark theme. */

/* a live 24fps timecode for the film frame — quiet motion that says "camera" */
function FilmTimecode(){
  const [f, setF] = React.useState(0);
  React.useEffect(()=>{
    const t = setInterval(()=> setF(x=>x+1), 1000/24);
    return ()=> clearInterval(t);
  },[]);
  const p = n => String(n).padStart(2,"0");
  const fr = f%24, s = Math.floor(f/24)%60, m = Math.floor(f/1440)%60;
  return React.createElement("span",{className:"lp-video-tc","aria-hidden":"true"},
    "TC 00:"+p(m)+":"+p(s)+":"+p(fr));
}

/* hero media — a 21:9 video placeholder for the AI short film, dressed as a
   viewfinder (corner brackets, running timecode, ratio badge). Swap the inner
   placeholder for a <video> (same 21:9 frame) when the film is ready. */
function HeroFilm(){
  return React.createElement("div",{className:"lp-video","aria-label":"AI short film — coming soon"},
    React.createElement("div",{className:"lp-video-corners","aria-hidden":"true"}),
    React.createElement("div",{className:"lp-video-corners b","aria-hidden":"true"}),
    React.createElement(FilmTimecode,null),
    React.createElement("button",{className:"lp-video-play","aria-label":"Play the short film"},
      React.createElement("svg",{width:22,height:22,viewBox:"0 0 24 24",fill:"currentColor","aria-hidden":"true"},
        React.createElement("path",{d:"M8 5.5v13l11-6.5z"}))),
    React.createElement("span",{className:"lp-video-badge"},"21:9"));
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

/* Pricing — PLACEHOLDER amounts; set your real prices/limits here. */
const LP_TIERS = [
  { id:"free", name:"Free", price:"$0", per:"forever", blurb:"Plant the seed.",
    feats:["1 film","Story & screenplay tools","MUSE — a taste"],
    cta:"Start free" },
  { id:"pro", name:"Pro", price:"$19", per:"/ month", blurb:"Finish your film.", featured:true, tag:"Most popular",
    feats:["Unlimited films","The full studio — every department","All AI Agents","MUSE, unlimited","High-resolution generations"],
    cta:"Choose Pro" },
  { id:"studio", name:"Studio", price:"$49", per:"/ month", blurb:"For working filmmakers.",
    feats:["Everything in Pro","Highest generation limits","Priority rendering","Early access to new features"],
    cta:"Choose Studio" },
];

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
          React.createElement("span",{className:"lp-logo"},"TURN")),
        React.createElement("div",{className:"lp-nav-cta"},
          React.createElement("button",{className:"lp-btn ghost",onClick:onSignIn},"Sign in"),
          React.createElement("button",{className:"lp-btn primary",onClick:()=>onStart("free")},"Start creating for free")),
        // mobile-only hamburger (the inline buttons hide below 560px)
        React.createElement("button",{className:"lp-burger"+(menuOpen?" open":""),"aria-label":"Menu",
          "aria-expanded":menuOpen?"true":"false",onClick:()=>setMenuOpen(o=>!o)},
          React.createElement("span",null),React.createElement("span",null),React.createElement("span",null))),
      menuOpen && React.createElement("div",{className:"lp-menu"},
        React.createElement("button",{className:"lp-menu-item",onClick:()=>{ setMenuOpen(false); onSignIn(); }},"Sign in"),
        React.createElement("button",{className:"lp-menu-item primary",onClick:()=>{ setMenuOpen(false); onStart("free"); }},"Start creating for free"))),

    // hero — UNFRAMED (no hairlines), headline + CTAs left, supporting copy right
    React.createElement("section",{className:"lp-hero"},
      React.createElement("div",{className:"lp-hero-copy"},
        React.createElement("h1",{className:"lp-h1"},"Your film, told",React.createElement("br",null),
          "as ",React.createElement(RotatingWord,null),"."),
        React.createElement("div",{className:"lp-hero-cta"},
          React.createElement("button",{className:"lp-btn primary big",onClick:()=>onStart("free")},"Start creating for free"),
          React.createElement("button",{className:"lp-btn ghost big",onClick:onSignIn},"Sign in"))),
      React.createElement("div",{className:"lp-hero-aside"},
        React.createElement("p",{className:"lp-lede"},
          "TURN is your AI film studio: bring an idea, choose one of four classic story structures, and watch it grow — a story spine built to hold an audience, a finished screenplay, a designed cast and world, and a storyboarded film."))),

    // hero media — the 21:9 short-film placeholder, still outside the frame
    React.createElement("section",{className:"lp-hero-media"},
      React.createElement(HeroFilm,null)),

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
          LP_TIERS.map((t,i)=>React.createElement("div",{key:i,className:"lp-tier"+(t.featured?" featured":"")},
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
          React.createElement("button",{className:"lp-btn primary big",onClick:()=>onStart("free")},"Start creating for free")))),

    React.createElement("footer",{className:"lp-foot"},
      React.createElement("div",{className:"lp-foot-in"},
        React.createElement("span",{className:"lp-logo sm"},"TURN"),
        React.createElement("nav",{className:"lp-foot-links","aria-label":"Legal"},
          React.createElement("a",{className:"lp-foot-link",href:"#privacy"},"Privacy"),
          React.createElement("a",{className:"lp-foot-link",href:"#terms"},"Terms"),
          React.createElement("a",{className:"lp-foot-link",href:"#contact"},"Contact"))))));
}
window.Landing = Landing;

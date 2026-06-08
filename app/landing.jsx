/* landing.jsx — the commercial landing page shown to signed-out visitors INSTEAD of the
   app. Sells what TURN is (the departments / the Infinite Studio method) and drives sign-up.
   The actual app (spine, Writers' Room, Art Room, Agents) is never exposed until sign-in.
   The floating MUSE teaser still rides on top (mounted by app.jsx) for a live taste. */

/* a small decorative value-charge spine for the hero (pure SVG, not real data) */
function HeroSpine(){
  const pts = [12,30,22,58,40,74,55,46,70,88,86,52];   // y%, alternating turns
  const n = pts.length, W = 520, H = 230, pad = 14;
  const xs = i => pad + (i*(W-2*pad))/(n-1);
  const ys = v => pad + ((100-v)/100)*(H-2*pad);
  const line = pts.map((v,i)=> (i?"L":"M")+xs(i).toFixed(1)+" "+ys(v).toFixed(1)).join(" ");
  const area = line+" L"+xs(n-1).toFixed(1)+" "+(H-pad)+" L"+xs(0).toFixed(1)+" "+(H-pad)+" Z";
  return React.createElement("svg",{className:"lp-spine",viewBox:"0 0 "+W+" "+H,preserveAspectRatio:"none","aria-hidden":"true"},
    React.createElement("defs",null,
      React.createElement("linearGradient",{id:"lpg",x1:"0",y1:"0",x2:"0",y2:"1"},
        React.createElement("stop",{offset:"0%","stopColor":"var(--pos)","stopOpacity":"0.30"}),
        React.createElement("stop",{offset:"100%","stopColor":"var(--pos)","stopOpacity":"0"}))),
    React.createElement("line",{x1:pad,y1:ys(50),x2:W-pad,y2:ys(50),className:"lp-spine-mid"}),
    React.createElement("path",{d:area,fill:"url(#lpg)"}),
    React.createElement("path",{d:line,className:"lp-spine-line",fill:"none"}),
    pts.map((v,i)=>React.createElement("circle",{key:i,cx:xs(i),cy:ys(v),r:4,
      className:"lp-spine-dot"+(v>=50?" pos":" neg")})));
}

const LP_FEATURES = [
  { icon:"spine",  title:"Value-Charge Spine",
    body:"Plot every scene by its emotional charge end-to-end, so you can see at a glance which scenes truly turn — and which fall flat." },
  { icon:"script", title:"Writers’ Room",
    body:"Turn beats into a screenplay, scene by scene. Action and reaction, the controlling idea, desire against antagonism." },
  { icon:"palette", title:"Art Room",
    body:"Characters, props, locations, a style bible and a full shot list — canonical references so every frame stays consistent." },
  { icon:"robot", title:"AI Agents",
    body:"Story Doctor, Continuity Repair and Table-Read refine an existing story — each shows its reasoning and asks before changing a thing." },
  { icon:"clapper", title:"Shot List & Storyboard",
    body:"One beat, one shot. Size, angle, lens and move for every moment, rendered from your characters, locations and grade." },
  { icon:"sparkles", title:"MUSE, your story guide",
    body:"A built-in AI co-pilot that reads your spine and helps you fix what doesn’t turn. Try the taste in the corner — sign up to put it to work." },
];

const LP_STEPS = [
  { n:"1", t:"Bring an idea", d:"A logline, a “what if”, a character, even just a vibe." },
  { n:"2", t:"Architect the spine", d:"TURN develops it into a logline and builds the value-charge spine, scene by scene." },
  { n:"3", t:"Grow the film", d:"Beats, script, cast, props, locations, style and shots — all flow from the spine." },
];

/* Pricing — PLACEHOLDER amounts; set your real prices/limits here. */
const LP_TIERS = [
  { id:"free", name:"Free", price:"$0", per:"forever", blurb:"Try the studio.",
    feats:["1 film","Value-charge spine, beats & script","MUSE — a taste","A few image generations"],
    cta:"Start free" },
  { id:"pro", name:"Pro", price:"$19", per:"/ month", blurb:"Finish your film.", featured:true, tag:"Most popular",
    feats:["Unlimited films","Full Art Room — characters, props, locations, style, shots","All AI Agents","MUSE, unlimited","High-resolution generations"],
    cta:"Choose Pro" },
  { id:"studio", name:"Studio", price:"$49", per:"/ month", blurb:"For working filmmakers.",
    feats:["Everything in Pro","Highest generation limits","Priority rendering","Early access to new features"],
    cta:"Choose Studio" },
];

function Landing({ onStart, onSignIn }){
  const Icn = (name, s)=> React.createElement(Icon[name] || Icon.sparkles, {s:s||18});
  return React.createElement("div",{className:"landing"},

    React.createElement("header",{className:"lp-nav"},
      React.createElement("div",{className:"lp-brand"},
        React.createElement("span",{className:"lp-logo"},"TURN"),
        React.createElement("span",{className:"lp-brand-sub"},"Story architecture for AI filmmakers")),
      React.createElement("div",{className:"lp-nav-cta"},
        React.createElement("button",{className:"lp-btn ghost",onClick:onSignIn},"Sign in"),
        React.createElement("button",{className:"lp-btn primary",onClick:()=>onStart("free")},"Start free"))),

    React.createElement("section",{className:"lp-hero"},
      React.createElement("div",{className:"lp-hero-copy"},
        React.createElement("div",{className:"lp-eyebrow"},"The Infinite Studio method"),
        React.createElement("h1",{className:"lp-h1"},"Architect your film before you shoot a frame."),
        React.createElement("p",{className:"lp-lede"},
          "TURN turns an idea into a value-charge spine — every scene plotted by its emotional turn — then grows your beats, script, cast and shots from it. One studio, every department."),
        React.createElement("div",{className:"lp-hero-cta"},
          React.createElement("button",{className:"lp-btn primary big",onClick:()=>onStart("free")},
            Icn("sparkles",16),"Start free"),
          React.createElement("button",{className:"lp-btn ghost big",onClick:onSignIn},"I have an account")),
        React.createElement("div",{className:"lp-hero-note"},"Free to start · build your first film in minutes")),
      React.createElement("div",{className:"lp-hero-art"},
        React.createElement("div",{className:"lp-hero-card"},
          React.createElement("div",{className:"lp-hero-card-top"},
            React.createElement("span",{className:"lp-hero-card-t"},"Value-Charge Spine"),
            React.createElement("span",{className:"lp-legend"},
              React.createElement("span",{className:"lp-key pos"},"Positive"),
              React.createElement("span",{className:"lp-key neg"},"Negative"))),
          React.createElement(HeroSpine,null)))),

    React.createElement("section",{className:"lp-section"},
      React.createElement("div",{className:"lp-sec-head"},
        React.createElement("h2",{className:"lp-h2"},"One studio, every department"),
        React.createElement("p",{className:"lp-sec-sub"},"From the first value charge to the last shot — your whole film, in one place.")),
      React.createElement("div",{className:"lp-grid"},
        LP_FEATURES.map((f,i)=>React.createElement("div",{key:i,className:"lp-card"},
          React.createElement("div",{className:"lp-card-ic"}, Icn(f.icon,20)),
          React.createElement("div",{className:"lp-card-t"}, f.title),
          React.createElement("div",{className:"lp-card-b"}, f.body))))),

    React.createElement("section",{className:"lp-section steps"},
      React.createElement("div",{className:"lp-sec-head"},
        React.createElement("h2",{className:"lp-h2"},"How it works")),
      React.createElement("div",{className:"lp-steps"},
        LP_STEPS.map((s,i)=>React.createElement("div",{key:i,className:"lp-step"},
          React.createElement("div",{className:"lp-step-n"}, s.n),
          React.createElement("div",{className:"lp-step-t"}, s.t),
          React.createElement("div",{className:"lp-step-d"}, s.d))))),

    React.createElement("section",{className:"lp-section pricing"},
      React.createElement("div",{className:"lp-sec-head"},
        React.createElement("h2",{className:"lp-h2"},"Simple pricing"),
        React.createElement("p",{className:"lp-sec-sub"},"Start free. Upgrade when you’re ready to finish your film — cancel anytime.")),
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
          React.createElement("button",{className:"lp-btn "+(t.featured?"primary":"ghost")+" full",onClick:()=>onStart(t.id)}, t.cta)))),
      React.createElement("div",{className:"lp-pricing-note"},"Prices shown are placeholders — set your own in landing.jsx.")),

    React.createElement("section",{className:"lp-final"},
      React.createElement("h2",{className:"lp-h2"},"Start building your film."),
      React.createElement("p",{className:"lp-final-sub"},"Sign up free and architect your first spine today."),
      React.createElement("button",{className:"lp-btn primary big",onClick:()=>onStart("free")},
        Icn("sparkles",16),"Start free")),

    React.createElement("footer",{className:"lp-foot"},
      React.createElement("span",{className:"lp-logo sm"},"TURN"),
      React.createElement("span",{className:"lp-foot-note"},"© TURN · Story architecture for AI filmmakers")));
}
window.Landing = Landing;

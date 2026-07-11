/* home-dashboard.jsx — the Home / landing dashboard.

   A richer front door than the poster wall (home.jsx): a persistent left rail,
   a hero that pitches the studio and drops you straight into the production
   pipeline, a "Recent Projects" strip built from the user's real films, and a
   feature strip.

   Everything here is wired to REAL app state — projects come from the live list,
   the pipeline steps open the actual rooms, "New Project" creates a film, project
   cards open that film, and "View all" hands off to the poster wall (HomeScreen).
   Chrome that has no backing feature yet (Docs, Discord, and the secondary rail
   items) degrades to an explicit "coming soon" toast rather than a dead link. */

(function(){
  const h = React.createElement;

  // Nicer display names than the bare format labels ("Short" -> "Short Film").
  const FMT_DISPLAY = { short:"Short Film", film:"Feature Film", series:"TV Series",
    commercial:"Commercial", microdrama:"Micro-Drama", documentary:"Documentary" };
  function displayType(p){
    if(p && p.fmt && FMT_DISPLAY[p.fmt]) return FMT_DISPLAY[p.fmt];
    if(typeof formatOf==="function" && p && p.fmt){
      try{ const f=formatOf({ format:p.fmt }); if(f&&f.label) return f.label; }catch(e){}
    }
    return "Film";
  }

  function updatedAgo(ts){
    if(!ts) return "";
    const diff = Date.now() - new Date(ts).getTime();
    if(!(diff>=0)) return "Updated just now";
    const m=Math.floor(diff/60000), hr=Math.floor(m/60), d=Math.floor(hr/24);
    if(d>0)  return "Updated "+d+"d ago";
    if(hr>0) return "Updated "+hr+"h ago";
    if(m>0)  return "Updated "+m+"m ago";
    return "Updated just now";
  }

  const initials = (t)=> (t||"Untitled").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase() || "·";

  const soon = (name)=>{ if(window.appToast) window.appToast(name+" — coming soon","info"); };

  // Left-rail entries. `to` decides behaviour; unwired ones fall back to a toast.
  const NAV = [
    { id:"home",      label:"Home",      icon:"grid" },
    { id:"projects",  label:"Projects",  icon:"film" },
    { id:"templates", label:"Templates", icon:"layers" },
    { id:"models",    label:"Models",    icon:"box" },
    { id:"people",    label:"People",    icon:"user" },
    { id:"assets",    label:"Assets",    icon:"image" },
    { id:"updates",   label:"Updates",   icon:"history" },
  ];

  // Pipeline steps mirror window.ROOMS but with the landing-page phrasing.
  const STEPS = [
    { id:"writers", no:"01", phase:"Development",    name:"Writers Room",   live:true },
    { id:"art",     no:"02", phase:"Pre-production", name:"The Art Room",   live:true },
    { id:"stage",   no:"03", phase:"Production",     name:"The Stage",      live:true },
    { id:"cutting", no:"04", phase:"Post",           name:"Coming soon",    live:false },
  ];

  const FEATURES = [
    { icon:"sparkles", title:"Cinematic Generation", body:"Cinematic video generation with native audio." },
    { icon:"layers",   title:"Multi-Modal Inputs",   body:"Text, images, videos, audio. Up to 12 assets combined." },
    { icon:"camera",   title:"Director-Level Control",body:"Camera, lighting, performance, and more." },
    { icon:"film",     title:"From Shot to Sequence", body:"Build scenes, extend, and refine with ease." },
  ];

  function Ic(name, s){ const I = (window.Icon && (Icon[name]||Icon.grid)); return I ? h(I,{s:s||16}) : null; }

  function HomeDashboard(props){
    const { projects, currentId, room,
            onOpen, onCreate, onAllProjects, onGoRoom, onClose, accountSlot } = props;

    // real films only (shows are containers), newest-updated first (list already sorted)
    const films = (projects||[]).filter(p=> String(p.isShow)!=="true");
    const recent = films.slice(0,5);
    const current = films.find(p=> p.id===currentId) || null;
    const hero = current || films.find(p=> p.cover) || films[0] || null;
    const activeRoom = room || "writers";

    // ----- left rail --------------------------------------------------------
    const nav = h("nav",{className:"hd-nav"},
      NAV.map(n=> h("button",{ key:n.id,
        className:"hd-nav-item"+(n.id==="home"?" on":""),
        onClick:()=>{
          if(n.id==="home") return;                         // already here
          if(n.id==="projects") return onAllProjects && onAllProjects();
          soon(n.label);
        }},
        h("span",{className:"hd-nav-ic"}, Ic(n.icon,17)),
        h("span",{className:"hd-nav-lab"}, n.label))));

    const sidebar = h("aside",{className:"hd-sidebar"},
      h("button",{className:"hd-brand", onClick:onClose, title:"Back to your film"},
        (typeof BrandMark!=="undefined") && h(BrandMark,null),
        h("span",{className:"hd-brand-name"},"TURN")),
      nav,
      h("div",{className:"hd-sidebar-foot"}, accountSlot || null));

    // ----- top bar ----------------------------------------------------------
    const topbar = h("header",{className:"hd-topbar"},
      h("button",{className:"hd-proj", onClick:onAllProjects, title:"Switch project"},
        h("span",{className:"hd-proj-ic"}, Ic("clapper",15)),
        h("span",{className:"hd-proj-name"}, (current && current.title) || "No project open"),
        current && h("span",{className:"hd-proj-badge"}, displayType(current)),
        Ic("chevD",14)),
      h("div",{className:"hd-top-actions"},
        h("button",{className:"hd-tbtn", onClick:()=>soon("Docs")}, Ic("script",15), "Docs"),
        h("button",{className:"hd-tbtn", onClick:()=>soon("Discord")}, Ic("globe",15), "Discord"),
        h("button",{className:"hd-tbtn hd-accent", onClick:onCreate}, Ic("plus",15), "New Project")));

    // ----- hero -------------------------------------------------------------
    const stepper = h("div",{className:"hd-steps"},
      STEPS.map(st=> h("button",{ key:st.id,
        className:"hd-step"+(st.id===activeRoom?" on":"")+(st.live?"":" soon"),
        disabled:!st.live,
        onClick:()=> st.live && onGoRoom && onGoRoom(st.id)},
        h("span",{className:"hd-step-no"}, st.no),
        h("span",{className:"hd-step-phase"}, st.phase),
        h("span",{className:"hd-step-name"}, st.name))));

    const activeStep = STEPS.find(s=>s.id===activeRoom) || STEPS[0];
    const hero_panel = h("div",{className:"hd-hero-media",
        style: hero && hero.cover ? { backgroundImage:'url("'+hero.cover+'")' } : null},
      !(hero && hero.cover) && h("div",{className:"hd-hero-media-fallback"}),
      h("button",{className:"hd-play", onClick:()=> onGoRoom && onGoRoom("stage"), title:"Go to The Stage"},
        Ic("play",26)),
      hero && h("div",{className:"hd-hero-media-cap"}, hero.title||"Untitled film"));

    const heroSection = h("section",{className:"hd-hero"},
      h("div",{className:"hd-hero-left"},
        h("h1",{className:"hd-hero-title"}, "From idea to ",
          h("span",{className:"hd-accent-text"},"final frame.")),
        h("p",{className:"hd-hero-sub"},"The all-in-one AI production studio powered by Seedance 2.0."),
        stepper,
        h("div",{className:"hd-hero-cta"},
          h("button",{className:"hd-btn hd-btn-accent", onClick:()=> onGoRoom && onGoRoom(activeStep.live?activeStep.id:"stage")},
            "Go to "+(activeStep.live?activeStep.name:"The Stage"), Ic("arrowR",16)),
          h("button",{className:"hd-btn hd-btn-ghost", onClick:onClose}, "Open Project"))),
      h("div",{className:"hd-hero-right"}, hero_panel));

    // ----- recent projects --------------------------------------------------
    const recentSection = h("section",{className:"hd-recent"},
      h("div",{className:"hd-sec-head"},
        h("h2",{className:"hd-sec-title"},"Recent Projects"),
        h("button",{className:"hd-viewall", onClick:onAllProjects}, "View all ", Ic("arrowR",14))),
      h("div",{className:"hd-recent-row"},
        recent.map(p=> h("button",{ key:p.id, className:"hd-card"+(p.id===currentId?" current":""),
            onClick:()=> onOpen && onOpen(p.id)},
          h("div",{className:"hd-card-art",
              style: p.cover ? { backgroundImage:'url("'+p.cover+'")' } : null},
            !p.cover && h("span",{className:"hd-card-initials"}, initials(p.title)),
            h("span",{className:"hd-card-pill"}, displayType(p).toUpperCase()),
            h("div",{className:"hd-card-shade"},
              h("div",{className:"hd-card-name"}, p.title||"Untitled film"),
              h("div",{className:"hd-card-meta"}, Ic("history",12), updatedAgo(p.updated_at||p.created_at)))))),
        h("button",{className:"hd-card hd-card-new", onClick:onCreate},
          h("div",{className:"hd-card-art hd-card-new-art"},
            Ic("plus",26),
            h("div",{className:"hd-card-new-lab"},"New Project")))));

    // ----- feature strip ----------------------------------------------------
    const featureSection = h("section",{className:"hd-features"},
      FEATURES.map((f,i)=> h("div",{key:i, className:"hd-feat"},
        h("span",{className:"hd-feat-ic"}, Ic(f.icon,18)),
        h("div",{className:"hd-feat-t"},
          h("div",{className:"hd-feat-title"}, f.title),
          h("div",{className:"hd-feat-body"}, f.body)))));

    return h("div",{className:"hd-root"},
      sidebar,
      h("div",{className:"hd-main"},
        topbar,
        h("div",{className:"hd-scroll"},
          heroSection,
          recentSection,
          featureSection)));
  }

  window.HomeDashboard = HomeDashboard;
})();

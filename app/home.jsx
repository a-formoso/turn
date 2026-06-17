/* home.jsx — the Home / Dashboard screen: every film the signed-in user owns,
   shown as a wall of movie posters. Click a poster to open that film; "+ New film"
   spins up a blank one. Each card can mint an AI-generated poster (key art built
   from the title + logline) that persists on the project's doc.cover, so the wall
   shows real covers across films. Reachable from the TURN brand mark in the top bar.

   Covers live on doc.cover (a downscaled data URL) and ride along in
   cloudListProjects via the `cover:doc->>cover` extract — no per-project asset
   cache needed, so the wall can show every film's art at once. */

/* The exact prompt used to mint a film's poster — shared so the "Copy prompt"
   action hands the user the SAME text generatePoster() sends (app.jsx reuses this). */
function posterPrompt(proj){
  const title = (proj && proj.title) || "Untitled film";
  const logline = ((proj && proj.logline) || "").trim();
  return "Cinematic movie poster key art for the film “"+title+"”. "+
    (logline ? logline+". " : "")+
    "A single striking hero image; bold dramatic composition; rich cinematic colour and "+
    "evocative lighting; the mood that sells the story at a glance. Vertical theatrical "+
    "poster framing. Absolutely NO text, NO title, NO lettering or captions anywhere.";
}
window.posterPrompt = posterPrompt;

/* Wall order: by default newest-CREATED first; once the user drags films into a custom
   arrangement every film carries an `ord` and that wins (a just-created film with no ord
   floats to the front). */
function sortFilms(list){
  const arr = (list||[]).slice();
  const anyOrd = arr.some(p=> p.ord!=null);
  const byCreated = (a,b)=> new Date(b.created_at||0) - new Date(a.created_at||0);
  if(!anyOrd) return arr.sort(byCreated);
  return arr.sort((a,b)=>{
    const ao=(a.ord!=null?Number(a.ord):-1), bo=(b.ord!=null?Number(b.ord):-1);
    return ao!==bo ? ao-bo : byCreated(a,b);
  });
}

function HomeScreen({ projects, currentId, onOpen, onCreate, onDelete, onGeneratePoster, onReorder, onClose, accountSlot }){
  const [busy, setBusy]   = React.useState({});     // id -> true while its poster renders
  const [making, setMaking] = React.useState(false); // creating a new film
  const [overId, setOverId] = React.useState(null); // drag: card currently hovered as drop target
  const dragId = React.useRef(null);                // drag: id of the film being dragged
  const dragged = React.useRef(false);              // a real drag happened → swallow the click

  // shows are containers, not openable films — keep the wall to actual films
  const films = sortFilms((projects||[]).filter(p=> String(p.isShow)!=="true"));

  // ---- drag to rearrange ----------------------------------------------------
  const onDragStart = (id)=>(e)=>{ dragId.current=id; dragged.current=false; try{ e.dataTransfer.effectAllowed="move"; e.dataTransfer.setData("text/plain", id); }catch(_){} };
  const onDragOverCard = (id)=>(e)=>{ if(!dragId.current) return; e.preventDefault(); dragged.current=true; try{ e.dataTransfer.dropEffect="move"; }catch(_){} if(id!==overId) setOverId(id); };
  const commitReorder = (targetId)=>{
    const from = dragId.current; dragId.current=null; setOverId(null);
    if(!from || !onReorder) return;
    const ids = films.map(f=>f.id);
    const next = ids.filter(id=>id!==from);
    if(targetId==null || targetId===from){ next.push(from); }      // dropped past the end → last
    else { const ti=next.indexOf(targetId); next.splice(ti<0?next.length:ti, 0, from); }
    if(next.join()!==ids.join()) onReorder(next);
  };
  const onDropCard = (id)=>(e)=>{ e.preventDefault(); commitReorder(id); };
  const onDragEnd = ()=>{ dragId.current=null; setOverId(null); };

  const genPoster = async (p, e)=>{
    if(e){ e.stopPropagation(); }
    if(busy[p.id]) return;
    setBusy(b=>({ ...b, [p.id]:true }));
    try{ await onGeneratePoster(p); }
    catch(err){ if(window.appToast) window.appToast(String((err&&err.message)||"Couldn't make the poster."),"error"); }
    finally{ setBusy(b=>{ const n={ ...b }; delete n[p.id]; return n; }); }
  };

  const copyPrompt = async (p, e)=>{
    if(e){ e.stopPropagation(); }
    const text = posterPrompt(p);
    try{ await navigator.clipboard.writeText(text); if(window.appToast) window.appToast("Poster prompt copied","success"); }
    catch(err){ if(window.appToast) window.appToast("Couldn't copy — clipboard blocked.","error"); }
  };

  const del = async (p, e)=>{
    if(e){ e.stopPropagation(); }
    const ok = await window.appConfirm({ title:"Delete this film?",
      body:"“"+(p.title||"Untitled")+"” and everything in it — scenes, script, art, voices — will be permanently deleted.",
      confirmLabel:"Delete film", danger:true });
    if(ok) await onDelete(p.id);
  };

  const create = async ()=>{
    if(making) return;
    setMaking(true);
    try{ await onCreate(); }
    finally{ setMaking(false); }
  };

  const fmtLabel = (p)=>{
    if(typeof formatOf==="function" && p.fmt){ try{ const f=formatOf({ format:p.fmt }); if(f&&f.label) return f.label; }catch(e){} }
    return p.fmt || "Film";
  };
  const initials = (t)=> (t||"Untitled").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase() || "·";

  return React.createElement("div",{className:"home-screen"},
    React.createElement("div",{className:"home-top"},
      React.createElement("button",{className:"home-brand",onClick:onClose,title:"Back to your film"},
        (typeof BrandMark!=="undefined") && React.createElement(BrandMark,null),
        React.createElement("span",{className:"brand-name"},"T",React.createElement("b",null,"U"),"RN")),
      React.createElement("div",{className:"home-top-right"}, accountSlot || null)),

    React.createElement("div",{className:"home-body"},
      React.createElement("div",{className:"home-head"},
        React.createElement("h1",{className:"home-title"},"Your films"),
        React.createElement("p",{className:"home-sub"}, films.length
          ? (films.length+" film"+(films.length===1?"":"s")+" in your studio"
              + (films.length>1 ? " · drag to rearrange" : ""))
          : "Start your first film")),

      React.createElement("div",{className:"home-grid"},
        films.map(p=> React.createElement("div",{key:p.id,
            className:"film-card"+(p.id===currentId?" current":"")+(overId===p.id?" drag-over":""),
            draggable:true,
            onDragStart:onDragStart(p.id), onDragOver:onDragOverCard(p.id),
            onDrop:onDropCard(p.id), onDragEnd:onDragEnd,
            onClick:()=>{ if(dragged.current){ dragged.current=false; return; } onOpen(p.id); },
            role:"button",tabIndex:0,
            onKeyDown:(e)=>{ if(e.key==="Enter"||e.key===" ") onOpen(p.id); }},

          React.createElement("div",{className:"film-poster"},
            p.cover
              ? React.createElement("img",{className:"film-cover",src:p.cover,alt:p.title||"poster",draggable:false})
              : React.createElement("div",{className:"film-placeholder"},
                  React.createElement("span",{className:"film-initials"}, initials(p.title))),
            busy[p.id] && React.createElement("div",{className:"film-rendering"},
              React.createElement("span",{className:"film-spin"}),
              React.createElement("span",null,"Painting poster…")),
            p.id===currentId && React.createElement("span",{className:"film-open-badge"},"Open"),

            // hover toolbar
            React.createElement("div",{className:"film-tools"},
              React.createElement("button",{className:"film-tool",title:p.cover?"Regenerate poster":"Generate poster",
                onClick:(e)=>genPoster(p,e),disabled:!!busy[p.id]},
                React.createElement((Icon.sparkle||Icon.image||Icon.wand||Icon.layers),{s:14}),
                p.cover?"Redo":"Poster"),
              React.createElement("button",{className:"film-tool film-tool-icon",title:"Copy the poster prompt",
                onClick:(e)=>copyPrompt(p,e)},
                React.createElement((Icon.copy||Icon.file),{s:14})),
              React.createElement("button",{className:"film-tool film-tool-icon film-tool-danger",title:"Delete film",
                onClick:(e)=>del(p,e)},
                React.createElement((Icon.trash||Icon.x),{s:14})))),

          React.createElement("div",{className:"film-meta"},
            React.createElement("div",{className:"film-name"}, p.title||"Untitled film"),
            React.createElement("div",{className:"film-format"}, fmtLabel(p))))),

        // + New film tile — kept to the RIGHT, after the existing films (also the
        // "drop here to send to the end" target while dragging)
        React.createElement("button",{className:"film-card film-new",onClick:create,disabled:making,
          onDragOver:(e)=>{ if(dragId.current) e.preventDefault(); },
          onDrop:(e)=>{ e.preventDefault(); commitReorder(null); }},
          React.createElement("div",{className:"film-poster film-new-poster"},
            making
              ? React.createElement("span",{className:"film-spin"})
              : React.createElement((Icon.plus||Icon.sparkle||Icon.layers),{s:30})),
          React.createElement("div",{className:"film-meta"},
            React.createElement("div",{className:"film-name"}, making?"Creating…":"New film"),
            React.createElement("div",{className:"film-format"},"Blank canvas"))))));
}
window.HomeScreen = HomeScreen;

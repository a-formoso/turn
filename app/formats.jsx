/* formats.jsx — the FORMAT registry: what we're making.
   Single source of truth for everything format-aware (docs/Formats Plan.md).
   Formats change the SIZE and DRESSING of what the studio builds — target scene
   count & runtime, screenplay emphasis, aspect & Stage defaults, room copy —
   never the pipeline itself (Development → Pre-production → Production → Post
   holds for all). Nothing elsewhere may check format ids inline; it reads this
   registry through the helpers at the bottom.

   Per-entry fields used by Phase 2:
   - stage:{ clipMax, aspect }  — the Stage's per-clip budget (seconds) and the
     format's native frame (drives headless shot generation, storyboard panels
     and prompt wording; the interactive engine dock stays user-controlled).
   - screenplayBrief — one line merged into the scene drafter's prompt
     ("full" formats omit it; "light"/"interview" formats reshape the page).
   - coverageBrief — one line merged into the shot-coverage drafter's prompt.
   - rooms:{ tabId:{ title, tip } } — Art Room intro overrides (a documentary's
     "cast" is subjects; a commercial's props are the product). Missing = default.
   - tabs:{ tabId:"hidden" } — removes a tab for this format (capability; used
     sparingly — formats hide almost nothing). */

const FORMATS = [
  { id:"film",        label:"Film",        icon:"film",    scenes:[14,18], sceneTarget:16, runtimeMin:15, aspect:"16:9",
    screenplay:"full",
    blurb:"A complete short film — the full method.",
    spineBrief:"a complete short film with a full dramatic arc",
    stage:{ clipMax:15, aspect:"16:9" } },

  { id:"short",       label:"Short",       icon:"clapper", scenes:[6,10],  sceneTarget:8,  runtimeMin:5,  aspect:"16:9",
    screenplay:"full",
    blurb:"One idea, one turn, a few minutes.",
    spineBrief:"a short — one central idea, one decisive turn, a few minutes of screen time; keep the spine lean",
    stage:{ clipMax:15, aspect:"16:9" } },

  { id:"commercial",  label:"Commercial",  icon:"bolt",    scenes:[3,5],   sceneTarget:4,  runtimeMin:1,  aspect:"16:9",
    screenplay:"light",
    blurb:"A product story in 30–60 seconds.",
    spineBrief:"a 30–60 second commercial — every scene sells one beat of the product story; end on the promise",
    screenplayBrief:"THIS IS A COMMERCIAL SCRIPT, not feature scene-work: write tight action blocks, VO lines and on-screen SUPERs; every line earns its second; land the product promise and end-card in the final beat",
    coverageBrief:"commercial coverage: few shots, each one a poster — hero the product, keep cuts fast and clean",
    stage:{ clipMax:15, aspect:"16:9" },
    rooms:{
      props:{ title:"Product & Props", tip:"The hero product and everything around it. The product's reference sheet is the most important asset in the project — every shot must match it exactly." },
      characters:{ title:"Talent (Casting)", tip:"The faces of the spot. Each gets a canonical reference sheet so they look identical in every frame." } } },

  { id:"microdrama",  label:"Micro-drama", icon:"user",    scenes:[6,8],   sceneTarget:7,  runtimeMin:2,  aspect:"9:16",
    screenplay:"full",
    blurb:"Vertical episodes that hook in seconds.",
    spineBrief:"a vertical micro-drama episode — hook inside the first scene, a cliff at the end of every scene, shot for phones",
    coverageBrief:"vertical 9:16 coverage: faces big in frame, singles over wides, compositions that read on a phone",
    stage:{ clipMax:15, aspect:"9:16" } },

  { id:"series",      label:"Series",      icon:"layers",  scenes:[12,16], sceneTarget:14, runtimeMin:10, aspect:"16:9",
    screenplay:"full", needsShow:true,
    blurb:"Episodes that share one world.",
    spineBrief:"a series episode — a complete episode arc that also plants threads for the next one",
    stage:{ clipMax:15, aspect:"16:9" } },

  { id:"documentary", label:"Documentary", icon:"globe",   scenes:[10,14], sceneTarget:12, runtimeMin:10, aspect:"16:9",
    screenplay:"interview",
    blurb:"Real subjects, a found structure.",
    spineBrief:"a documentary — real subjects and places; scenes are sequences of testimony, observation and archive, structured to turn like drama",
    screenplayBrief:"THIS IS A DOCUMENTARY: scenes are written as interview questions + expected testimony beats, narration beds, and observational action — no invented dialogue in subjects' mouths; mark ARCHIVE where found footage carries the beat",
    coverageBrief:"documentary coverage: interview setups, observational handheld, archive inserts and cutaways — honest, not staged",
    stage:{ clipMax:15, aspect:"16:9" },
    rooms:{
      characters:{ title:"Subjects (Casting)", tip:"The real people on camera. Each subject gets a reference sheet so their look stays consistent across interview setups and observational scenes." },
      props:{ title:"Artifacts & Archive", tip:"The objects, documents and archive materials the camera returns to — each gets a reference sheet so it reads identically in every cutaway." } } },
];
window.FORMATS = FORMATS;

/* normalize anything stored in project.format (registry id, legacy freeform text
   like "Feature Film", or nothing) to a registry entry. Default: film. */
function formatOf(project){
  const raw = ((project && project.format) || "").toString().toLowerCase();
  return FORMATS.find(f=>f.id===raw)
      || FORMATS.find(f=>raw.includes(f.id) || raw.includes(f.label.toLowerCase()))
      || FORMATS[0];
}
window.formatOf = formatOf;

/* ---- Phase 2 helpers — the only way other files read format behavior ---- */
function clipMaxFor(project){ const f=formatOf(project); return (f.stage&&f.stage.clipMax)||15; }
function aspectFor(project){ const f=formatOf(project); return (f.stage&&f.stage.aspect)||"16:9"; }
/* Art Room intro copy for a tab: {title?, tip?} — empty object means "use defaults" */
function roomCopy(project, tabId){ const f=formatOf(project); return (f.rooms&&f.rooms[tabId])||{}; }
/* true when a tab is hidden for this format */
function tabHidden(project, tabId){ const f=formatOf(project); return !!(f.tabs&&f.tabs[tabId]==="hidden"); }
window.clipMaxFor = clipMaxFor; window.aspectFor = aspectFor;
window.roomCopy = roomCopy; window.tabHidden = tabHidden;

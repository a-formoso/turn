/* formats.jsx — the FORMAT registry: what we're making.
   Single source of truth for everything format-aware (docs/Formats Plan.md).
   Formats change the SIZE and DRESSING of what the studio builds — target scene
   count & runtime, screenplay emphasis, aspect & Stage defaults — never the
   pipeline itself (Development → Pre-production → Production → Post holds for all).
   Nothing elsewhere may check format ids inline; it reads this registry. */

const FORMATS = [
  { id:"film",        label:"Film",        icon:"film",    scenes:[14,18], sceneTarget:16, runtimeMin:15, aspect:"16:9",
    screenplay:"full",
    blurb:"A complete short film — the full method.",
    spineBrief:"a complete short film with a full dramatic arc" },
  { id:"short",       label:"Short",       icon:"clapper", scenes:[6,10],  sceneTarget:8,  runtimeMin:5,  aspect:"16:9",
    screenplay:"full",
    blurb:"One idea, one turn, a few minutes.",
    spineBrief:"a short — one central idea, one decisive turn, a few minutes of screen time; keep the spine lean" },
  { id:"commercial",  label:"Commercial",  icon:"bolt",    scenes:[3,5],   sceneTarget:4,  runtimeMin:1,  aspect:"16:9",
    screenplay:"light",
    blurb:"A product story in 30–60 seconds.",
    spineBrief:"a 30–60 second commercial — every scene sells one beat of the product story; end on the promise" },
  { id:"microdrama",  label:"Micro-drama", icon:"user",    scenes:[6,8],   sceneTarget:7,  runtimeMin:2,  aspect:"9:16",
    screenplay:"full",
    blurb:"Vertical episodes that hook in seconds.",
    spineBrief:"a vertical micro-drama episode — hook inside the first scene, a cliff at the end of every scene, shot for phones" },
  { id:"series",      label:"Series",      icon:"layers",  scenes:[12,16], sceneTarget:14, runtimeMin:10, aspect:"16:9",
    screenplay:"full", needsShow:true,
    blurb:"Episodes that share one world.",
    spineBrief:"a series episode — a complete episode arc that also plants threads for the next one" },
  { id:"documentary", label:"Documentary", icon:"globe",   scenes:[10,14], sceneTarget:12, runtimeMin:10, aspect:"16:9",
    screenplay:"interview",
    blurb:"Real subjects, a found structure.",
    spineBrief:"a documentary — real subjects and places; scenes are sequences of testimony, observation and archive, structured to turn like drama" },
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

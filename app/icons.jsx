/* icons.jsx — line icons (1.6 stroke, currentColor) + helpers */
const I = ({d, s=16, sw=1.6, fill=false, children, vb=24}) =>
  React.createElement("svg",{width:s,height:s,viewBox:`0 0 ${vb} ${vb}`,fill:fill?"currentColor":"none",
    stroke:fill?"none":"currentColor",strokeWidth:sw,strokeLinecap:"round",strokeLinejoin:"round"},
    d?React.createElement("path",{d}):children);

const Icon = {
  spine:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M4 12h3l2-7 3 14 2-9 2 5h4"})]}),
  graph:(p)=>I({...p,d:"M4 19V5M4 19h16M7 14l3-5 3 3 4-7"}),
  grid:(p)=>I({...p,d:"M4 6h16M4 12h16M4 18h16M9 4v16"}),
  board:(p)=>I({...p,d:"M4 5h5v14H4zM10 5h5v9h-5zM16 5h4v6h-4z"}),
  plus:(p)=>I({...p,d:"M12 5v14M5 12h14"}),
  camera:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M3 8.5A1.5 1.5 0 0 1 4.5 7H7l1.2-1.8A1 1 0 0 1 9 4.7h6a1 1 0 0 1 .8.5L17 7h2.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z"}),
    React.createElement("circle",{key:2,cx:12,cy:12.5,r:3.2})]}),
  image:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:3,y:4,width:18,height:16,rx:2}),
    React.createElement("circle",{key:2,cx:8.5,cy:9.5,r:1.6}),
    React.createElement("path",{key:3,d:"M21 16l-5-5-7 7"})]}),
  userScan:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"}),
    React.createElement("circle",{key:2,cx:12,cy:10.5,r:2.4}),
    React.createElement("path",{key:3,d:"M8.2 16c.5-1.7 2-2.6 3.8-2.6s3.3.9 3.8 2.6"})]}),
  search:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:11,cy:11,r:6}),
    React.createElement("path",{key:2,d:"M20 20l-4.3-4.3"})]}),
  minus:(p)=>I({...p,d:"M5 12h14"}),
  trash:(p)=>I({...p,d:"M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"}),
  arrowR:(p)=>I({...p,d:"M5 12h14M13 6l6 6-6 6"}),
  arrowSmall:(p)=>I({...p,s:12,d:"M5 12h14M13 6l6 6-6 6"}),
  chevD:(p)=>I({...p,d:"M6 9l6 6 6-6"}),
  chevU:(p)=>I({...p,d:"M6 15l6-6 6 6"}),
  chevR:(p)=>I({...p,d:"M9 6l6 6-6 6"}),
  check:(p)=>I({...p,d:"M5 13l4 4L19 7"}),
  scissors:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:6,cy:6,r:2.4}),
    React.createElement("circle",{key:2,cx:6,cy:18,r:2.4}),
    React.createElement("path",{key:3,d:"M8 8l12 8M8 16l12-8"})]}),
  alert:(p)=>I({...p,d:"M12 8v5M12 17h.01M10.3 3.5L2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 3.5a2 2 0 00-3.4 0z"}),
  sparkles:(p)=>I({...p,d:"M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3zM19 14l.8 2.2 2.2.8-2.2.8L19 20l-.8-2.2-2.2-.8 2.2-.8L19 14z"}),
  target:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:12,cy:12,r:8}),
    React.createElement("circle",{key:2,cx:12,cy:12,r:3.2})]}),
  eye:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"}),
    React.createElement("circle",{key:2,cx:12,cy:12,r:2.6})]}),
  eyeOff:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M9.9 4.2A10 10 0 0112 4c6.5 0 10 7 10 7a16 16 0 01-3 3.7M6.3 6.3A16 16 0 002 11s3.5 7 10 7a10 10 0 005-1.3"}),
    React.createElement("path",{key:2,d:"M9.7 9.7a3 3 0 004.2 4.2"}),
    React.createElement("path",{key:3,d:"M3 3l18 18"})]}),
  mask:(p)=>I({...p,d:"M3 5s2 3 9 3 9-3 9-3v6c0 5-4 8-9 8s-9-3-9-8V5zM8 12h.01M16 12h.01"}),
  user:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:12,cy:8,r:3.5}),
    React.createElement("path",{key:2,d:"M5 20c0-3.5 3-6 7-6s7 2.5 7 6"})]}),
  heart:(p)=>I({...p,d:"M12 20s-7-4.7-9.3-9C1 8 2.5 4.5 6 4.5c2 0 3.2 1.2 4 2.3.8-1.1 2-2.3 4-2.3 3.5 0 5 3.5 3.3 6.5C19 15.3 12 20 12 20z"}),
  clock:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:12,cy:12,r:8.5}),
    React.createElement("path",{key:2,d:"M12 7v5l3 2"})]}),
  layers:(p)=>I({...p,d:"M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5"}),
  bolt:(p)=>I({...p,fill:true,d:"M13 2L4 14h6l-1 8 9-12h-6l1-8z"}),
  send:(p)=>I({...p,d:"M4 12l16-7-7 16-2-7-7-2z"}),
  mail:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:3,y:5,width:18,height:14,rx:2}),
    React.createElement("path",{key:2,d:"M3 7l9 6 9-6"})]}),
  whatsapp:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M3 21l1.6-5A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4-1L3 21z"}),
    React.createElement("path",{key:2,d:"M8.5 8.5c-.3 1.5.6 3 1.8 4.2s2.7 2.1 4.2 1.8c.6-.1 1-1 .8-1.5l-1.3-.9-1 .8c-.7-.3-1.3-.7-1.8-1.2s-.9-1.1-1.2-1.8l.8-1-.9-1.3c-.5-.2-1.4.2-1.4.8z",fill:"currentColor",stroke:"none"})]}),
  x:(p)=>I({...p,d:"M6 6l12 12M18 6L6 18"}),
  pin:(p)=>I({...p,d:"M12 2v6M12 8c-3 0-5 2-5 5h10c0-3-2-5-5-5zM12 13v8"}),
  globe:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:12,cy:12,r:8.5}),
    React.createElement("path",{key:2,d:"M3.5 12h17M12 3.5c2.5 2.5 2.5 14 0 17M12 3.5c-2.5 2.5-2.5 14 0 17"})]}),
  film:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:3,y:4,width:18,height:16,rx:2}),
    React.createElement("path",{key:2,d:"M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"})]}),
  box:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M21 8.5l-9-5-9 5v7l9 5 9-5z"}),
    React.createElement("path",{key:2,d:"M3 8.5l9 5 9-5M12 13.5v7"})]}),
  flask:(p)=>I({...p,d:"M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"}),
  download:(p)=>I({...p,d:"M12 4v11M7 11l5 5 5-5M5 20h14"}),
  panelLeft:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:3,y:5,width:18,height:14,rx:2}),
    React.createElement("path",{key:2,d:"M9 5v14"}),
    React.createElement("path",{key:3,d:"M5.5 9h1.5M5.5 12h1.5",strokeWidth:1.4})]}),
  panelRight:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:3,y:5,width:18,height:14,rx:2}),
    React.createElement("path",{key:2,d:"M15 5v14"}),
    React.createElement("path",{key:3,d:"M17 9h1.5M17 12h1.5",strokeWidth:1.4})]}),
  chevL:(p)=>I({...p,d:"M15 6l-6 6 6 6"}),
  script:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"}),
    React.createElement("path",{key:2,d:"M14 3v5h5"}),
    React.createElement("path",{key:3,d:"M9 13h6M9 17h4",strokeWidth:1.4})]}),
  wand:(p)=>I({...p,d:"M15 4V2M15 10V8M11 6H9M21 6h-2M6 21L20 7l-3-3L3 18l3 3zM18 9l-3-3"}),
  undo:(p)=>I({...p,d:"M3 9h13a5 5 0 010 10h-3M3 9l4-4M3 9l4 4"}),
  redo:(p)=>I({...p,d:"M21 9H8a5 5 0 000 10h3M21 9l-4-4M21 9l-4 4"}),
  robot:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:4,y:8,width:16,height:11,rx:2.5}),
    React.createElement("path",{key:2,d:"M12 4v4M9 13h.01M15 13h.01M9.5 16h5"}),
    React.createElement("circle",{key:3,cx:12,cy:4,r:1.3,fill:"currentColor",stroke:"none"}),
    React.createElement("path",{key:4,d:"M2 12v3M22 12v3"})]}),
  sun:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:12,cy:12,r:4}),
    React.createElement("path",{key:2,d:"M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"})]}),
  moon:(p)=>I({...p,d:"M21 12.8A8.5 8.5 0 1111.2 3a6.6 6.6 0 009.8 9.8z"}),
  monitor:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:3,y:4,width:18,height:13,rx:2}),
    React.createElement("path",{key:2,d:"M8 21h8M12 17v4"})]}),
  copy:(p)=>I({...p,children:[
    React.createElement("rect",{key:1,x:9,y:9,width:11,height:11,rx:2}),
    React.createElement("path",{key:2,d:"M5 15V5a2 2 0 012-2h8"})]}),
  palette:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.6 0-.5-.3-.9-.6-1.3-.3-.4-.6-.8-.6-1.3 0-.8.7-1.4 1.5-1.4H16a5 5 0 005-5c0-4.4-4-8-9-8z"}),
    React.createElement("circle",{key:2,cx:7.5,cy:11.5,r:1,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:3,cx:12,cy:8,r:1,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:4,cx:16.5,cy:11.5,r:1,fill:"currentColor",stroke:"none"})]}),
  clapper:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M3 8h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8z"}),
    React.createElement("path",{key:2,d:"M3 8l1.5-3.5 4 1L7 9M9.5 5.5l4 1L12 10M15 6.5l4 1L17.5 11"})]}),
  scissorsCut:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:6,cy:6,r:2.4}),
    React.createElement("circle",{key:2,cx:6,cy:18,r:2.4}),
    React.createElement("path",{key:3,d:"M8 8l12 8M8 16l12-8"})]}),
  grip:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:9,cy:6,r:1.4,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:2,cx:15,cy:6,r:1.4,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:3,cx:9,cy:12,r:1.4,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:4,cx:15,cy:12,r:1.4,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:5,cx:9,cy:18,r:1.4,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:6,cx:15,cy:18,r:1.4,fill:"currentColor",stroke:"none"})]}),
  warn:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M12 3 1 21h22z"}),
    React.createElement("line",{key:2,x1:12,y1:9,x2:12,y2:14}),
    React.createElement("circle",{key:3,cx:12,cy:18,r:0.8,fill:"currentColor",stroke:"none"})]}),
  info:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:12,cy:12,r:9}),
    React.createElement("line",{key:2,x1:12,y1:11,x2:12,y2:16}),
    React.createElement("circle",{key:3,cx:12,cy:8,r:0.9,fill:"currentColor",stroke:"none"})]}),
  history:(p)=>I({...p,children:[
    React.createElement("path",{key:1,d:"M3 12a9 9 0 1 0 3-6.7L3 8"}),
    React.createElement("path",{key:2,d:"M3 4v4h4"}),
    React.createElement("path",{key:3,d:"M12 8v4l3 2"})]}),
  moreV:(p)=>I({...p,children:[
    React.createElement("circle",{key:1,cx:12,cy:5,r:1.6,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:2,cx:12,cy:12,r:1.6,fill:"currentColor",stroke:"none"}),
    React.createElement("circle",{key:3,cx:12,cy:19,r:1.6,fill:"currentColor",stroke:"none"})]}),
};

window.Icon = Icon;
window.TURNI = I;

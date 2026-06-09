# TURN — application structure (Room → Room)

TURN is organised as a **film production pipeline**: a sequence of *Rooms*
(departments), each with its own set of in-body *view tabs*. You move through the
Rooms left-to-right, and the work product of one Room feeds the next
(Writers' beats → Art Room shots → Storyboard sheets → …).

- Rooms are defined in [`app/chrome.jsx`](../app/chrome.jsx) (`ROOMS`), the switcher lives in the top bar.
- A Room's view tabs render as a full-width bar under the top bar (`ViewNav`).
- **MUSE** (the help assistant) and **New Story** (seed → spine) are cross-cutting — available in every Room.

---

## 1. The pipeline at a glance

```mermaid
flowchart LR
  classDef live  fill:#16331f,stroke:#3fbf6f,color:#eafff0,stroke-width:1px;
  classDef soon  fill:#1a1a1d,stroke:#555,color:#999,stroke-dasharray:4 3;

  W["①&nbsp; Writers' Room<br/><b>Development</b><br/>· LIVE ·"]:::live
  A["②&nbsp; The Art Room<br/><b>Pre-production</b><br/>· LIVE ·"]:::live
  S["③&nbsp; The Stage<br/><b>Production</b><br/>Soon"]:::soon
  C["④&nbsp; The Cutting Room<br/><b>Post</b><br/>Soon"]:::soon

  W -->|"scenes · beats · script"| A
  A -->|"shot list · storyboard"| S
  S -->|"takes · footage"| C
```

---

## 2. Inside each Room (views / tabs)

```mermaid
flowchart TB
  classDef room  fill:#101216,stroke:#c96442,color:#fff,stroke-width:1.5px;
  classDef view  fill:#15171c,stroke:#3a3f4a,color:#dfe3ea;
  classDef tab   fill:#15171c,stroke:#3a3f4a,color:#dfe3ea;
  classDef mod   fill:#1b1530,stroke:#7a6cae,color:#e9e4ff;
  classDef soon  fill:#1a1a1d,stroke:#555,color:#888,stroke-dasharray:4 3;
  classDef cross fill:#0d1f1c,stroke:#2fae9a,color:#d8fff7;

  %% ---------- WRITERS' ROOM ----------
  subgraph WR["①  WRITERS' ROOM — Development"]
    direction TB
    WRv["View tabs"]:::room
    V1["Spine<br/><i>Value-Charge Spine</i>"]:::view
    V2["Audit<br/><i>Turn Audit — if a scene<br/>doesn't turn, cut it</i>"]:::view
    V3["Board<br/><i>16 scenes / 3 acts</i>"]:::view
    V4["Script<br/><i>Screenplay draft</i>"]:::view
    WRv --> V1 --> V2 --> V3 --> V4

    AG["Writers' Room modal — AI agents"]:::mod
    AG1["Story Doctor — fix"]:::mod
    AG2["Continuity Repair — fix"]:::mod
    AG3["Adaptation — build"]:::mod
    AG4["Table-Read — report"]:::mod
    AG --> AG1 & AG2 & AG3 & AG4
  end

  %% ---------- ART ROOM ----------
  subgraph AR["②  THE ART ROOM — Pre-production"]
    direction TB
    ARv["Tabs (left → right)"]:::room
    T1["Props"]:::tab
    T2["Characters"]:::tab
    T3["Locations"]:::tab
    T4["Style Bible<br/><i>per-scene grade + film stock</i>"]:::tab
    T5["Shot List<br/><i>1 beat = 1 shot</i>"]:::tab
    T6["Storyboard<br/><i>1 scene = 1 composite sheet</i>"]:::tab
    ARv --> T1 --> T2 --> T3 --> T4 --> T5 --> T6
  end

  %% ---------- STAGE / CUTTING ----------
  subgraph ST["③  THE STAGE — Production (Soon)"]
    direction TB
    STn["Voice / video generation"]:::soon
  end
  subgraph CR["④  THE CUTTING ROOM — Post (Soon)"]
    direction TB
    CRn["Edit / assembly"]:::soon
  end

  WR --> AR --> ST --> CR

  %% ---------- CROSS-CUTTING ----------
  MUSE["MUSE — floating help assistant<br/><i>answers only · every Room</i>"]:::cross
  NEW["New Story — seed → spine<br/><i>entry point</i>"]:::cross
  NEW -.-> WR
  MUSE -.-> WR
  MUSE -.-> AR
```

---

## 3. How the work flows (data lineage)

```mermaid
flowchart LR
  classDef d fill:#15171c,stroke:#3a3f4a,color:#dfe3ea;

  seed["Seed / idea<br/>(New Story · Adaptation)"]:::d
  spine["Scenes + value charges<br/>(Spine)"]:::d
  beats["Beats / subtext<br/>(Audit · Board)"]:::d
  script["Screenplay<br/>(Script)"]:::d
  art["Props · Characters · Locations<br/>+ Style Bible grade"]:::d
  shots["Shot List<br/>(1 beat → 1 shot frame)"]:::d
  board["Storyboard sheet<br/>(composite per scene)"]:::d

  seed --> spine --> beats --> script
  script --> art --> shots --> board
  beats -. feeds .-> shots
```

**Key dependencies**
- A **scene** carries open/close *value + charge* — the Spine graph and the per-film colour script ride on this.
- A **beat** becomes exactly **one shot** in the Shot List; the Shot List frame composes Style-Bible grade + location plate + character/prop sheets.
- The **Storyboard** turns each scene into **one composite sheet** (GPT Image 2, the "Cinematic Storyboard Grid"), pulling beats + shot grammar + the locked cast/location.

---

## 4. Source map

| Concern | File |
|---|---|
| Rooms + top bar + view tabs | `app/chrome.jsx` (`ROOMS`, `RoomSwitcher`, `ViewNav`) |
| App state + composition (room/view/artView) | `app/app.jsx` |
| Art Room shell + tab list | `app/artroom.jsx` (`ART_TABS`) |
| Writers' views | `app/spine.jsx`, `app/inspector.jsx`, `app/script.jsx` |
| Art tabs | `app/props.jsx`, `app/character.jsx`, `app/locations*.jsx`, `app/stylebible*.jsx`, `app/shots*.jsx`, `app/storyboard.jsx` |
| AI agents (Writers' Room modal) | `app/agents.jsx`, `app/agents-ui.jsx` |
| MUSE help assistant | `app/muse.jsx`, `app/ai.jsx` (`museSystemPrompt`, `APP_FEATURES`) |
| Sample film data | `app/story-data.jsx` |

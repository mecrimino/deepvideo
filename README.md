<div align="center">

# 🎬 Deep Vision — Autonomous AI Video Studio

![Deep Vision](https://img.shields.io/badge/DEEP_VISION-AUTONOMOUS_VIDEO_STUDIO-8957e5?style=flat-square)
![Python](https://img.shields.io/badge/Python-3776AB?style=flat-square&logo=python&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)
![FFmpeg](https://img.shields.io/badge/FFmpeg-388e3c?style=flat-square&logo=ffmpeg&logoColor=white)
![License](https://img.shields.io/badge/LICENSE-MIT-yellow?style=flat-square)

**Describe an idea — get a finished, editable video.** The agent crew researches,
writes, sources footage, adds motion graphics, narrates, subtitles, reviews and
assembles it. Runs with **zero API keys**; add keys to level up.

[Run it](#-quick-start) • [Workflow](#-the-workflow) • [Features](#-features) • [Keys](#-keys-all-optional) • [Layout](#-layout)

</div>

## 🎥 What is Deep Vision?

Deep Vision is a **three-tier, local-first AI video studio** — a React editor, a
Node gateway, and a Python agent core. You connect a YouTube channel, talk a
video through with the Director, and the crew produces it end-to-end: script,
footage, motion graphics, narration, subtitles and a finished timeline you can
edit and render. The whole stack runs keyless — heavy AI degrades to
deterministic fallbacks, so nothing ever hard-blocks.

> 💬 **You say:** *"create a space documentary"*
> 🎬 **Deep Vision:** suggests 4 specific topics → you pick one → asks how long →
> drafts a 12-section outline you approve → writes the full script → sources
> ~150 scenes of real footage → narrates → subtitles → hands you an editable
> timeline. Nothing renders until you say so.

> 💬 **You say:** *paste a 10-minute narration + connect your channel*
> 🎬 **Deep Vision:** transcribes it, splits it into scenes, matches stock/AI
> visuals per scene in your brand's style, and builds the full timeline —
> "Fill missing footage" resumes any gaps without redoing the rest.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- FFmpeg on `PATH`
- (optional) API keys — see [Keys](#-keys-all-optional); the app runs without any

### Install & run

```bash
# 1. Install dependencies
pip install -r requirements.txt
npm install

# 2. (optional) add your keys
cp .env.example .env

# 3. Start the three tiers
npm run dev:core       # Python core  → FastAPI  :8000
npm run dev:backend    # Node gateway → Fastify  :8787   (proxies /api → core)
npm run dev            # frontend      → Vite     :5173   (proxies /api,/files,/dev)
```

Then open **http://localhost:5173**. ⚡

## 🎬 The workflow

```
Idea ──► Director chat ──► Setup ──► Processing ──► Editor ──► Render
        (talk it through)  (voice/    (live agent   (timeline
                            theme/     pipeline)      video editor)
                            footage)
```

1. **Connect a channel** (YouTube URL / @handle) with a niche — it tells the
   agents what footage to find. Each channel is a **brand profile**: voice,
   theme, footage source, compliance rules, background.
2. **Talk-first planning** — an idea opens a staged Director chat; nothing
   generates until you approve the outline and script.
3. **Creative Setup** — confirm voice, theme, footage source and background.
4. **Generate** — the pipeline runs live and streams to the Processing screen;
   it keeps working in the background and shows on Home.
5. **Edit & render** — a full timeline editor (layers, drag/trim/split,
   captions, agent chat) exports to MP4.

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🗣️ **Talk-first planning** | Staged Director chat: topic → length → outline → script, before anything renders |
| 🎬 **Agent pipeline** | Segment → keywords → retrieve → rank → pick → assemble, streamed live |
| 📺 **Brand profiles** | Per-channel voice, theme, footage source, compliance toggles, background |
| 🎙️ **Narration** | Local Kokoro TTS voices with previews, or upload your own audio |
| 🖼️ **Footage & images** | Pexels + Pixabay stock, AI images, motion graphics — your pick per channel |
| 💬 **Subtitles** | Word-timed captions built from the narration |
| ✂️ **Timeline editor** | Layers, drag/trim/split, captions, agent chat, render to MP4 |
| 🩹 **Fill missing footage** | Resume scenes a run left uncovered without redoing the rest |
| 📊 **Developer Dashboard** | Live, project-scoped telemetry: workflow graph, agents, LLM+prompt feed, API/rate-limit monitor |
| 🔁 **Resilient** | Real cancel, reload-safe generations, rate-limit wait-and-retry, key rotation |
| 🆓 **Keyless** | Runs with zero API keys; each key just upgrades a capability |

## 🔑 Keys (all optional)

Copy `.env.example` to `.env` and fill in what you have — the app runs without
any of them, each key just upgrades a capability:

| Key | Powers |
|-----|--------|
| `OPENROUTER_API_KEYS` / `GROQ_API_KEYS` | LLM (planning, scripts, keywords) — rotated on rate-limit |
| `PEXELS_API_KEYS` / `PIXABAY_API_KEYS` | stock video + image search |
| `CF_IMAGE_WORKER_URL` / `POLLINATIONS_IMAGE_URL` | AI image generation |
| `VITE_YOUTUBE_API_KEY` (+ `_BACKUP`) | channel resolve + subscriber stats |

Keys live in `.env` / `frontend/.env` and are **gitignored — never committed**.
Free-tier quotas are documented in `core/providers/api_manager.py`; runs pace
themselves to stay inside them and wait-and-retry when a provider throttles.

## 📁 Layout

```
deepvideo/
├── frontend/          # React + Vite + Zustand app and the timeline video editor
├── shared/types/      # data model (EDL/timeline, run, API) — "@deep-vision/shared"
├── backend/           # Fastify gateway :8787 — serves /api, proxies AI, media at /files
├── core/              # Python FastAPI :8000 — agents + orchestrator + providers
│   ├── agents/          # director, planner, research, script, scene, image, video,
│   │                    #   graphics, audio, subtitle, timeline, reviewer, exporter
│   ├── orchestrator/    # pipeline (the 6-stage run) + render + run registry
│   ├── providers/       # LLM router, stock search, AI image, API manager (keys/limits)
│   ├── memory/  tools/  # working/vector memory · ffmpeg, transcriber, downloader
│   └── dev/             # Developer Dashboard metrics + /dev API
├── apps/              # desktop (Electron) + web wrappers (scaffold)
├── assets/            # fonts, music, sfx, transitions, overlays, templates, backgrounds
└── cache/ downloads/ temp/ logs/ projects/   # runtime data — gitignored (.gitkeep)
```

See **[CLAUDE.md](CLAUDE.md)** for the full core map (which chapter/agent lives where).

## 🛠️ Commands

```bash
npm run dev            # frontend  (also: npm run dev:backend, npm run dev:core)
npm run typecheck      # frontend + backend TypeScript
python tests/check_timeline_export.py    # guards the render graph
```

<div align="center">

Built with 🎬 for creators. **Deep Vision** — *describe it, and it makes the video.*

</div>

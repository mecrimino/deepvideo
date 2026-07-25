# Tools Stack for Autonomous AI Video Editor

## Core Development Stack

| Category | Tool | Open Source | Run Locally | Use Now | Future Upgrade |
|----------|------|:-----------:|:-----------:|:-------:|----------------|
| Desktop App | Electron | ✅ | ✅ | ✅ | Keep |
| Frontend | React | ✅ | ✅ | ✅ | Keep |
| Language (Frontend) | TypeScript | ✅ | ✅ | ✅ | Keep |
| Build Tool | Vite | ✅ | ✅ | ✅ | Keep |
| Styling | Tailwind CSS | ✅ | ✅ | ✅ | Keep |
| UI Components | shadcn/ui | ✅ | ✅ | ✅ | Keep |
| State Management | Zustand | ✅ | ✅ | ✅ | Keep |
| Server State | TanStack Query | ✅ | ✅ | ✅ | Keep |
| Backend | Node.js + Fastify | ✅ | ✅ | ✅ | Keep |
| Realtime | Socket.IO | ✅ | ✅ | ✅ | Keep |
| AI Language | Python | ✅ | ✅ | ✅ | Keep |
| Agent Framework | LangGraph | ✅ | ✅ | ✅ | Keep |
| LLM Framework | LangChain (limited use) | ✅ | ✅ | ✅ | Keep |
| Data Validation | Pydantic | ✅ | ✅ | ✅ | Keep |
| Database | SQLite | ✅ | ✅ | ✅ | PostgreSQL |
| Vector Database | ChromaDB | ✅ | ✅ | ✅ | Qdrant |
| Cache | SQLite + Disk Cache | ✅ | ✅ | ✅ | Redis |
| Rendering | FFmpeg | ✅ | ✅ | ✅ | Keep |
| Timeline Format | OpenTimelineIO | ✅ | ✅ | ✅ | Keep |
| Video Processing | PyAV | ✅ | ✅ | Optional | Keep |
| Image Processing | OpenCV | ✅ | ✅ | ✅ | Keep |
| Image Editing | Pillow | ✅ | ✅ | ✅ | Keep |
| OCR | PaddleOCR | ✅ | ✅ | ✅ | Keep |
| Backup OCR | Tesseract | ✅ | ✅ | Optional | Keep |
| Speech-to-Text | faster-whisper | ✅ | ✅ | API first | Local later |
| Browser Automation | Playwright | ✅ | ✅ | ✅ | Keep |
| AI Browser | Browser Use | ✅ | ✅ | Later | Keep |
| Downloader | yt-dlp | ✅ | ✅ | ✅ | Keep |
| Gallery Downloader | gallery-dl | ✅ | ✅ | Optional | Keep |
| Embedding Model | BGE / Nomic Embed | ✅ | ✅ | Later | Keep |
| Logging (Python) | Loguru | ✅ | ✅ | ✅ | Keep |
| Logging (Node) | Pino | ✅ | ✅ | ✅ | Keep |
| Testing (Python) | Pytest | ✅ | ✅ | ✅ | Keep |
| Testing (Frontend) | Vitest | ✅ | ✅ | ✅ | Keep |
| E2E Testing | Playwright Test | ✅ | ✅ | Later | Keep |
| Configuration | .env + Pydantic Settings | ✅ | ✅ | ✅ | Keep |
| Storage | Local SSD | ✅ | ✅ | ✅ | MinIO |
| Package Manager (Node) | pnpm | ✅ | ✅ | ✅ | Keep |
| Package Manager (Python) | uv | ✅ | ✅ | ✅ | Keep |
| Version Control | Git | ✅ | ✅ | ✅ | Keep |
| IDE | VS Code | ✅ | ✅ | ✅ | Keep |
| AI Coding Assistant | Claude Code | ❌ | Cloud | ✅ | Keep |
| API Documentation | FastAPI OpenAPI | ✅ | ✅ | ✅ | Keep |
| Monitoring | Prometheus | ✅ | ✅ | Later | Keep |
| Dashboard | Grafana | ✅ | ✅ | Later | Keep |
| Containers | Docker | ✅ | ✅ | Later | Keep |

## AI Providers (Current)

| Category | Recommended |
|----------|-------------|
| LLM | OpenAI, Anthropic, Gemini, Groq, OpenRouter |
| Image Generation | OpenAI Images, Fal.ai, Replicate, Google Imagen |
| Voice Generation | ElevenLabs, Cartesia, OpenAI TTS |
| Search | Tavily, Brave Search |
| Stock Images | Pexels API, Pixabay API |
| Stock Videos | Pexels API, Pixabay API |

## Local AI (Future)

| Category | Tool |
|----------|------|
| Local LLM | Ollama, llama.cpp, vLLM |
| Image Generation | ComfyUI, FLUX, Stable Diffusion |
| Voice Generation | Kokoro TTS, Piper TTS, F5-TTS |
| Search Engine | SearXNG |
| Vector Database | Qdrant |
| Object Storage | MinIO |

## Recommended Development Workflow

1. Electron + React desktop app.
2. Fastify (Node.js) backend.
3. Python + LangGraph AI agents.
4. Cloud APIs for LLM, image, and voice.
5. FFmpeg for local rendering.
6. Cache API responses.

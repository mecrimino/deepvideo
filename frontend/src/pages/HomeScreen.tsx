import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Loader2,
  Mic,
  Play,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import type { PipelineStage } from '@deep-vision/shared';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ProjectSummary } from '@deep-vision/shared';
import { Avatar } from '../components/Avatar';
import { GradientLogo } from '../components/GradientLogo';
import { ModelModal } from '../components/ModelModal';
import { models } from '../data/models';
import { sampleScripts } from '../data/sample-scripts';
import {
  addChannel,
  getActiveChannel,
  getChannelsState,
  refreshChannelsIfStale,
  removeChannel,
  setActiveChannel,
  subscribeChannel,
} from '../utils/channel';
import { fmtSubscribers, resolveChannel } from '../services/youtube';
import { getCredits, subscribeCredits } from '../utils/credits';
import { formatDuration } from '../utils/format';
import { deleteProject, listProjects, loadProject } from '../services/project';
import { uploadAudio } from '../services/transcribe';
import { useAppStore } from '../stores/useAppStore';
import { fileUrl, useEditorStore } from '../stores/useEditorStore';
import { colors, fontMono, gradients } from '../styles/theme';

/** "2h ago" style relative time for project cards. */
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : `${Math.floor(d / 7)}w ago`;
}

function dateTag(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toUpperCase();
}

const STAGE_SHORT: Record<PipelineStage, string> = {
  segment: 'Segmenting the script…',
  queries: 'Writing keywords…',
  retrieve: 'Searching footage…',
  rerank: 'Ranking candidates…',
  pick: 'Picking clips…',
  history: 'Downloading & assembling…',
};

const chInputStyle: React.CSSProperties = {
  background: colors.card,
  border: `1px solid ${colors.border8}`,
  borderRadius: 8,
  color: colors.text,
  fontSize: 12.5,
  padding: '7px 9px',
  outline: 'none',
};

export function HomeScreen() {
  const prompt = useAppStore((s) => s.prompt);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const script = useAppStore((s) => s.script);
  const setScript = useAppStore((s) => s.setScript);
  const audio = useAppStore((s) => s.audio);
  const setAudio = useAppStore((s) => s.setAudio);
  const modelIdx = useAppStore((s) => s.modelIdx);
  const showModel = useAppStore((s) => s.showModel);
  const showPlus = useAppStore((s) => s.showPlus);
  const togglePlus = useAppStore((s) => s.togglePlus);
  const openModel = useAppStore((s) => s.openModel);
  const go = useAppStore((s) => s.go);
  const startPlanning = useAppStore((s) => s.startPlanning);
  const gen = useAppStore((s) => s.gen);
  const cancelGeneration = useAppStore((s) => s.cancelGeneration);
  const openGeneration = useAppStore((s) => s.openGeneration);

  const [showScript, setShowScript] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Real, live local data.
  const credits = useSyncExternalStore(subscribeCredits, getCredits);
  const chState = useSyncExternalStore(subscribeChannel, getChannelsState);
  const activeChannel = getActiveChannel();
  const [editingChannel, setEditingChannel] = useState(false);
  const [chUrlDraft, setChUrlDraft] = useState('');
  const [chNicheDraft, setChNicheDraft] = useState('');
  const [chBusy, setChBusy] = useState(false);
  const [chError, setChError] = useState<string | null>(null);

  // Real saved projects from the server.
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const refreshProjects = () =>
    listProjects()
      .then((r) => setProjects(r.projects))
      .catch(() => setProjects([]));
  const rehydrateGen = useAppStore((s) => s.rehydrateGen);
  useEffect(() => {
    void refreshProjects();
    void rehydrateGen(); // a run still processing server-side shows as a live card
    void refreshChannelsIfStale(); // YouTube stats — at most once a day (7:00 rule)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Two-click delete confirmation (second click within 3s deletes).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDelete) return;
    const t = window.setTimeout(() => setPendingDelete(null), 3000);
    return () => window.clearTimeout(t);
  }, [pendingDelete]);

  const removeProject = async (id: string) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    setPendingDelete(null);
    try {
      await deleteProject(id);
    } finally {
      void refreshProjects();
    }
  };

  const pickAudio = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadAudio(file);
      setAudio({ path: res.path, name: res.name, durationSec: res.durationSec });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const openProject = async (id: string) => {
    try {
      const { project } = await loadProject(id);
      useEditorStore.getState().openTimeline(project.timeline, {
        title: project.title,
        projectId: project.id,
        runId: project.runId,
      });
      go('editor');
    } catch {
      // leave the card in place; the server likely isn't running
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        overflow: 'hidden',
        background: gradients.homeHero,
      }}
    >
      {/* hidden narration-audio picker */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickAudio(file);
          e.target.value = '';
        }}
      />

      {/* top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 30px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: '-.02em',
          }}
        >
          <GradientLogo />
          Deep Video
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            title="Local credits balance — generations deduct their estimated cost"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(20,20,23,.7)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${colors.border9}`,
              padding: '7px 13px',
              borderRadius: 999,
              fontSize: 13,
              color: colors.textMid,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: colors.gold,
                display: 'inline-block',
              }}
            />
            {credits.toLocaleString()} credits
          </div>
          <Avatar size={34} />
        </div>
      </div>

      {/* hero + prompt */}
      <div
        style={{
          maxWidth: 840,
          margin: '8vh auto 0',
          padding: '0 24px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 30 }}>
          <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-.025em', margin: '0 0 10px' }}>
            What will you create today?
          </h1>
          <p style={{ margin: 0, color: colors.textDim, fontSize: 16 }}>
            Describe an idea and the agent produces a finished video — script, footage, motion
            graphics, and edit.
          </p>
        </div>

        <div
          style={{
            position: 'relative',
            background: colors.panel,
            border: `1px solid ${colors.border9}`,
            borderRadius: 24,
            padding: '20px 20px 14px',
            boxShadow: '0 26px 70px rgba(0,0,0,.5)',
          }}
        >
          <textarea
            rows={3}
            placeholder="Create a space exploration story..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: colors.text,
              fontSize: 17,
              lineHeight: 1.5,
              minHeight: 66,
            }}
          />

          {/* attached narration audio chip */}
          {(audio || uploading || uploadError) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  background: 'rgba(47,107,255,.12)',
                  border: '1px solid rgba(47,107,255,.35)',
                  color: '#a9c3ff',
                  fontSize: 12.5,
                  padding: '5px 10px',
                  borderRadius: 999,
                }}
              >
                {uploading ? (
                  <>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    Uploading audio…
                  </>
                ) : audio ? (
                  <>
                    <Mic size={13} />
                    {audio.name} · {formatDuration(audio.durationSec)}
                    <X
                      size={13}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setAudio(null)}
                    />
                  </>
                ) : (
                  <span style={{ color: '#ff9d9d' }}>{uploadError}</span>
                )}
              </span>
              {audio && (
                <span style={{ fontSize: 11.5, color: colors.textGhost }}>
                  Narration will be transcribed with whisper and drives the edit timing.
                </span>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={togglePlus}
                className="hv-dark"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: '50%',
                  background: colors.control,
                  border: `1px solid ${colors.border9}`,
                  color: '#cfcfd4',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Plus size={19} />
              </button>
              {showPlus && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 48,
                    left: 0,
                    width: 200,
                    background: colors.raised,
                    border: `1px solid ${colors.border10}`,
                    borderRadius: 14,
                    padding: 6,
                    boxShadow: '0 18px 44px rgba(0,0,0,.55)',
                    zIndex: 5,
                  }}
                >
                  <div
                    className="hv-dark"
                    onClick={() => {
                      togglePlus();
                      setShowScript(true);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '10px 11px',
                      borderRadius: 10,
                      fontSize: 14,
                      color: colors.textSoft,
                      cursor: 'pointer',
                    }}
                  >
                    <FileText size={17} color={colors.textDim} />
                    Custom Script
                    {script.trim() && (
                      <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#6fd08e' }} />
                    )}
                  </div>
                  <div
                    className="hv-dark"
                    onClick={() => {
                      togglePlus();
                      audioInputRef.current?.click();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      padding: '10px 11px',
                      borderRadius: 10,
                      fontSize: 14,
                      color: colors.textSoft,
                      cursor: 'pointer',
                    }}
                  >
                    <Mic size={17} color={colors.textDim} />
                    Custom Audio
                    {audio && (
                      <span style={{ marginLeft: 'auto', width: 7, height: 7, borderRadius: '50%', background: '#6fd08e' }} />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* channel pill — real YouTube channels, switchable, cached locally */}
            <div style={{ position: 'relative' }}>
              <button
                className="hv-dark"
                onClick={() => {
                  setChError(null);
                  setEditingChannel((v) => !v);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: colors.control,
                  border: `1px solid ${colors.border9}`,
                  padding: '5px 12px 5px 5px',
                  borderRadius: 999,
                  color: colors.textSoft,
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {activeChannel?.thumb ? (
                  <img
                    src={activeChannel.thumb}
                    alt=""
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <Avatar size={24} />
                )}
                {activeChannel?.title ?? 'Add channel'}
                <ChevronDown size={15} color={colors.textFaint} />
              </button>
              {editingChannel && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 44,
                    left: 0,
                    width: 300,
                    background: colors.raised,
                    border: `1px solid ${colors.border10}`,
                    borderRadius: 14,
                    padding: 12,
                    boxShadow: '0 18px 44px rgba(0,0,0,.55)',
                    zIndex: 5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {/* saved channels — click to switch */}
                  {chState.channels.map((c) => {
                    const active = c.id === (activeChannel?.id ?? '');
                    return (
                      <div
                        key={c.id}
                        onClick={() => {
                          setActiveChannel(c.id);
                          setEditingChannel(false);
                        }}
                        className="hv-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 9px',
                          borderRadius: 10,
                          background: active ? 'rgba(47,107,255,.12)' : colors.card,
                          border: `1px solid ${active ? colors.accent : colors.border8}`,
                          cursor: 'pointer',
                        }}
                      >
                        {c.thumb ? (
                          <img
                            src={c.thumb}
                            alt=""
                            style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <Avatar size={30} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: colors.textBright,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {c.title}
                          </div>
                          <div style={{ fontSize: 11, color: colors.textFaint }}>
                            {fmtSubscribers(c.subscribers)} subscribers · {c.niche}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeChannel(c.id);
                          }}
                          title="Remove channel"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: colors.textGhost,
                            cursor: 'pointer',
                            fontSize: 14,
                            padding: 2,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}

                  {/* brand profile — full per-channel settings page */}
                  {chState.channels.length > 0 && (
                    <button
                      onClick={() => {
                        setEditingChannel(false);
                        go('brand');
                      }}
                      className="hv-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '9px 10px',
                        borderRadius: 10,
                        background: colors.card,
                        border: `1px solid ${colors.border8}`,
                        color: colors.textSoft,
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ⚙ Brand profile — voice, theme, compliance
                    </button>
                  )}

                  {/* add a channel — URL/ID + niche, BOTH mandatory */}
                  <div
                    style={{
                      borderTop: chState.channels.length ? `1px solid ${colors.border8}` : 'none',
                      paddingTop: chState.channels.length ? 10 : 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                    }}
                  >
                    <input
                      value={chUrlDraft}
                      onChange={(e) => setChUrlDraft(e.target.value)}
                      placeholder="Channel URL, @handle or ID *"
                      style={chInputStyle}
                    />
                    <input
                      value={chNicheDraft}
                      onChange={(e) => setChNicheDraft(e.target.value)}
                      placeholder="Channel niche (e.g. senior fitness) *"
                      style={chInputStyle}
                    />
                    {chError && (
                      <div style={{ fontSize: 11.5, color: '#e48a8a' }}>{chError}</div>
                    )}
                    <button
                      disabled={!chUrlDraft.trim() || !chNicheDraft.trim() || chBusy}
                      onClick={() => {
                        const url = chUrlDraft.trim();
                        const niche = chNicheDraft.trim();
                        if (!url || !niche) return;
                        setChBusy(true);
                        setChError(null);
                        resolveChannel(url)
                          .then((yt) => {
                            addChannel({ ...yt, niche, fetchedAt: Date.now() });
                            setChUrlDraft('');
                            setChNicheDraft('');
                            setEditingChannel(false);
                          })
                          .catch((err: Error) => setChError(err.message))
                          .finally(() => setChBusy(false));
                      }}
                      className="hv-blue"
                      style={{
                        padding: '8px 0',
                        borderRadius: 9,
                        background:
                          chUrlDraft.trim() && chNicheDraft.trim() ? colors.accent : colors.control,
                        border: 'none',
                        color: chUrlDraft.trim() && chNicheDraft.trim() ? '#fff' : colors.textGhost,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: chBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {chBusy ? 'Looking up channel…' : 'Add channel'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ flex: 1 }} />
            <button
              onClick={openModel}
              className="hv-dark"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: colors.control,
                border: `1px solid ${colors.border9}`,
                padding: '9px 13px',
                borderRadius: 999,
                color: colors.textSoft,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {models[modelIdx].name}
              <ChevronDown size={15} color={colors.textFaint} />
            </button>
            <button
              onClick={() => {
                // No connected channel → no niche → can't make a video. Open the
                // channel menu so the user connects one (and sets its niche) first.
                if (!activeChannel?.niche?.trim()) {
                  setChError('Connect a channel (with its niche) before creating a video.');
                  setEditingChannel(true);
                  return;
                }
                // An idea starts a planning chat with the Director (talk it
                // through first). A pasted script or uploaded audio already has
                // content, so it continues straight to theme/setup.
                if (prompt.trim() && !audio && !script.trim()) startPlanning();
                else go('theme');
              }}
              className="hv-blue"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: colors.accent,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                border: 'none',
              }}
            >
              <ArrowUp size={20} />
            </button>
          </div>
        </div>

        {/* recent generations — REAL saved projects */}
        <div style={{ marginTop: 42 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: colors.textBright }}>
              Recent Generations
            </div>
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 13,
                color: colors.textDim,
              }}
            >
              {projects ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : ''}
              <ArrowUpRight size={14} />
            </span>
          </div>

          {projects && projects.length === 0 && !gen && (
            <div
              style={{
                border: `1px dashed ${colors.border10}`,
                borderRadius: 14,
                padding: '26px 20px',
                textAlign: 'center',
                color: colors.textGhost,
                fontSize: 13,
              }}
            >
              No generations yet — describe an idea above and hit send.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            {/* live background generation card */}
            {gen && (
              <div
                onClick={() => void openGeneration()}
                className="hv-card"
                title={
                  gen.status === 'done'
                    ? 'Finished — click to open in the editor'
                    : gen.status === 'failed'
                      ? (gen.error ?? 'Generation failed')
                      : 'Generating — click to watch progress'
                }
                style={{
                  background: colors.panel,
                  border:
                    gen.status === 'failed'
                      ? '1px solid rgba(228,106,106,.4)'
                      : gen.status === 'done'
                        ? '1px solid rgba(111,208,142,.4)'
                        : '1px solid rgba(47,107,255,.45)',
                  borderRadius: 14,
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    aspectRatio: '16/10',
                    background: gradients.placeholder,
                    position: 'relative',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {gen.status === 'done' ? (
                    <span
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: 'rgba(111,208,142,.16)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <Play size={18} color="#6fd08e" />
                    </span>
                  ) : gen.status === 'failed' ? (
                    <CircleAlert size={26} color="#e46a6a" />
                  ) : (
                    <Loader2
                      size={26}
                      color={colors.accent}
                      style={{ animation: 'spin 1s linear infinite' }}
                    />
                  )}
                  {(gen.status === 'running' || gen.status === 'starting') && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void cancelGeneration();
                      }}
                      title="Cancel generation"
                      style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,.6)',
                        border: '1px solid rgba(228,106,106,.5)',
                        color: '#e48a8a',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      <X size={13} />
                    </button>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      left: 9,
                      bottom: 8,
                      fontFamily: fontMono,
                      fontSize: 10,
                      color:
                        gen.status === 'done'
                          ? '#6fd08e'
                          : gen.status === 'failed'
                            ? '#e48a8a'
                            : '#6f9bff',
                      letterSpacing: '.04em',
                    }}
                  >
                    {gen.status === 'done'
                      ? 'READY'
                      : gen.status === 'failed'
                        ? 'FAILED'
                        : 'GENERATING'}
                  </div>
                </div>
                <div style={{ padding: '10px 12px 12px' }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: colors.textSoft,
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {gen.title}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textGhost, marginTop: 4 }}>
                    {gen.status === 'done'
                      ? 'Finished — click to open'
                      : gen.status === 'failed'
                        ? (gen.error ?? 'Failed').slice(0, 48)
                        : STAGE_SHORT[gen.stage ?? 'segment']}
                  </div>
                </div>
              </div>
            )}

            {(projects ?? []).slice(0, 8).map((p) => (
              <div
                key={p.id}
                className="hv-card"
                onClick={() => void openProject(p.id)}
                style={{
                  background: colors.panel,
                  border: `1px solid ${colors.border7}`,
                  borderRadius: 14,
                  overflow: 'hidden',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    aspectRatio: '16/10',
                    background: p.thumb
                      ? `url(${fileUrl(p.thumb)}) center/cover`
                      : gradients.placeholder,
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 9,
                      bottom: 8,
                      fontFamily: fontMono,
                      fontSize: 10,
                      color: p.thumb ? '#e7e7ea' : colors.textMono,
                      letterSpacing: '.04em',
                      textShadow: p.thumb ? '0 1px 3px rgba(0,0,0,.8)' : undefined,
                    }}
                  >
                    {dateTag(p.createdAt)}
                  </div>
                  {p.durationSec !== undefined && p.durationSec > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        right: 8,
                        bottom: 8,
                        background: 'rgba(0,0,0,.6)',
                        padding: '2px 7px',
                        borderRadius: 6,
                        fontSize: 11,
                        color: colors.textMid,
                      }}
                    >
                      {formatDuration(p.durationSec)}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeProject(p.id);
                    }}
                    title={pendingDelete === p.id ? 'Click again to delete permanently' : 'Delete project'}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: pendingDelete === p.id ? 'rgba(228,106,106,.9)' : 'rgba(0,0,0,.55)',
                      border: `1px solid ${pendingDelete === p.id ? '#e46a6a' : 'rgba(255,255,255,.15)'}`,
                      color: pendingDelete === p.id ? '#fff' : colors.textDim,
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ padding: '10px 12px 12px' }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: colors.textSoft,
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {p.title}
                  </div>
                  <div style={{ fontSize: 11, color: colors.textGhost, marginTop: 4 }}>
                    Updated {timeAgo(p.updatedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModel && <ModelModal />}

      {showScript && (
        <div
          onClick={() => setShowScript(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.6)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(640px, 92vw)',
              background: colors.panel,
              border: `1px solid ${colors.border9}`,
              borderRadius: 18,
              padding: 20,
              boxShadow: '0 26px 70px rgba(0,0,0,.6)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Custom narration script</div>
              <button
                onClick={() => setShowScript(false)}
                style={{ background: 'transparent', border: 'none', color: colors.textDim, cursor: 'pointer' }}
              >
                <X size={17} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: colors.textFaint, marginBottom: 10, lineHeight: 1.5 }}>
              The pipeline segments this script into beats and retrieves matching clips from your
              local library. Leave it empty to use the prompt text instead.
            </div>
            <textarea
              rows={8}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Paste or write the narration script…"
              style={{
                width: '100%',
                background: colors.card,
                border: `1px solid ${colors.border8}`,
                borderRadius: 10,
                color: colors.text,
                fontSize: 13.5,
                lineHeight: 1.55,
                padding: '10px 12px',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              {sampleScripts.map((s) => (
                <button
                  key={s.title}
                  onClick={() => setScript(s.text)}
                  className="hv-dark"
                  style={{
                    fontSize: 12,
                    color: colors.textSoft,
                    background: colors.control,
                    border: `1px solid ${colors.border9}`,
                    padding: '6px 11px',
                    borderRadius: 999,
                    cursor: 'pointer',
                  }}
                >
                  {s.title}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => setShowScript(false)}
                className="hv-blue"
                style={{
                  background: colors.accent,
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '8px 18px',
                  borderRadius: 9,
                  cursor: 'pointer',
                }}
              >
                Use this script
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

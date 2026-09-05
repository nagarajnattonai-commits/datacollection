'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Mic,
  Square,
  Upload,
  Check,
  Headphones,
  Download,
  RefreshCw,
  ArrowRight,
  Settings2,
  Users,
  ClipboardCheck,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import type { State, Task, Actor, Role } from '@/lib/workflow';
import { audioCriteria } from '@/lib/audio-criteria';

type Snapshot = {
  state: State;
  actor: Actor;
  demo: boolean;
  automaticSttConfigured: boolean;
};
const labels: Record<string, string> = {
  QUICK_REVIEW: 'Quick Review',
  REJECTED: 'Retake requested',
  STT_PENDING: 'Awaiting transcript',
  STT_PROCESSING: 'Transcribing',
  STT_FAILED: 'Transcription failed',
  DEEP_REVIEW: 'Deep Review',
  READY_TO_DELIVER: 'Ready to deliver',
};
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger aria-label={label}>
          <SelectValue>
            {options.find((o) => o.value === value)?.label ?? value}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
function Blank({ title, description }: { title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
function Status({ task }: { task: Task }) {
  return (
    <span className={`status status-${task.status.toLowerCase()}`}>
      {labels[task.status]}
    </span>
  );
}
function Player({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [speed, setSpeed] = useState('1');
  return (
    <div className="player">
      <audio ref={ref} controls preload="metadata" src={src} />
      <Choice
        label="Playback speed"
        value={speed}
        onChange={(v) => {
          setSpeed(v);
          if (ref.current) ref.current.playbackRate = Number(v);
        }}
        options={[
          { value: '0.75', label: '0.75×' },
          { value: '1', label: '1×' },
          { value: '1.25', label: '1.25×' },
          { value: '1.5', label: '1.5×' },
        ]}
      />
    </div>
  );
}
export default function Workspace({
  initialRole,
  signOutUrl,
}: {
  initialRole: Role;
  signOutUrl: string;
}) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [role] = useState<Role>(initialRole),
    [tab, setTab] = useState(
      initialRole === 'qa'
        ? 'quick'
        : initialRole === 'admin'
          ? 'manage'
          : 'contribute',
    );
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0);
  const [qualityChecks, setQualityChecks] = useState<Record<string, boolean>>(
    {},
  );
  const qualityConfirmed = audioCriteria.every(
    (item) => qualityChecks[item.id],
  );
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<State['config'] | null>(null),
    [memberEmail, setMemberEmail] = useState(''),
    [memberRole, setMemberRole] = useState('contributor');
  const api = useCallback(
    async (path = '/api/workspace', init: RequestInit = {}) => {
      const response = await fetch(path, {
        ...init,
        headers: { ...init.headers, 'x-demo-role': role },
      });
      if (!response.ok) {
        const body = (await response
          .json()
          .catch(() => ({ error: 'The request failed.' }))) as {
          error: string;
        };
        throw new Error(body.error);
      }
      return response;
    },
    [role],
  );
  const refresh = useCallback(async () => {
    const next = (await (await api()).json()) as Snapshot;
    setData(next);
    setConfig((c) => c ?? next.state.config);
    return next;
  }, [api]);
  useEffect(() => {
    setData(null);
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function action(
    payload: Record<string, unknown>,
    success = 'Saved successfully.',
  ) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refresh();
      setNotice(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function startRecording() {
    setError('');
    setQualityChecks({});
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw new Error(
          'Recording is unavailable in this browser. Upload an audio file instead.',
        );
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = input;
      const mime = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ].find((m) => MediaRecorder.isTypeSupported(m));
      const rec = new MediaRecorder(
        input,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = rec;
      const chunks: BlobPart[] = [];
      let bytes = 0;
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > 19 * 1024 * 1024 && rec.state === 'recording') rec.stop();
        }
      };
      rec.onstop = () => {
        const type = rec.mimeType;
        setFile(
          new File(
            chunks,
            `recording-${Date.now()}.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`,
            { type },
          ),
        );
        input.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      rec.onerror = () => {
        setError('Recording stopped unexpectedly. Please retake it.');
        input.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      rec.start(1000);
      setFile(null);
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
    }
  }
  async function upload() {
    if (!file) return;
    if (!qualityConfirmed) {
      setError('Confirm every audio quality check before submitting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('audio', file);
      await api('/api/workspace', { method: 'POST', body: form });
      setFile(null);
      setQualityChecks({});
      await refresh();
      setNotice('Recording submitted for Quick Review.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    setBusy(true);
    setError('');
    try {
      const blob = await (await api('/api/workspace?export=1')).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fieldnote-delivery.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'read_audio_workspace',
            title: 'Read audio review progress',
            description:
              'Read the current user’s permitted audio tasks and review-round progress.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: async (input: unknown) => {
              if (
                !input ||
                typeof input !== 'object' ||
                Object.keys(input).length
              )
                throw new Error('Expected an empty object.');
              const snapshot = await refresh();
              return {
                role: snapshot.actor.role,
                project: snapshot.state.config.name,
                tasks: snapshot.state.tasks.map((t) => ({
                  id: t.id,
                  name: t.name,
                  status: t.status,
                  streak: t.streak,
                })),
                rounds: snapshot.state.rounds,
              };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, [refresh]);
  const state = data?.state,
    actor = data?.actor;
  const round = state?.rounds.find((r) => r.status === 'open');
  const complete =
    round?.taskIds.filter((id) =>
      state?.tasks
        .find((t) => t.id === id)
        ?.reviews.some((r) => r.round === round.number),
    ).length ?? 0;
  const mine = state?.tasks.filter((t) => t.contributor === actor?.id) ?? [];
  const canReview = actor?.role === 'admin' || actor?.role === 'qa';
  const admin = actor?.role === 'admin';
  const quick = state?.tasks.filter((t) => t.status === 'QUICK_REVIEW') ?? [];
  const deep = state?.tasks.filter((t) => t.status === 'DEEP_REVIEW') ?? [];
  const ready =
    state?.tasks.filter((t) => t.status === 'READY_TO_DELIVER') ?? [];
  function reviewCards(kind: 'quick' | 'deep') {
    const tasks = (kind === 'quick' ? quick : deep).filter(
      (t) =>
        t.claim?.userId === actor?.id &&
        (t.claim?.expires ?? 0) > Date.now() &&
        (kind === 'quick' ||
          (round?.taskIds.includes(t.id) &&
            !t.reviews.some((r) => r.round === round.number))),
    );
    return (
      <>
        <div className="section-head">
          <div>
            <h2>
              {kind === 'quick'
                ? 'Listen. Check. Pass it on.'
                : 'A closer listen.'}
            </h2>
            <p>
              {kind === 'quick'
                ? 'Approve usable recordings before transcription begins.'
                : 'Listen to the audio and correct the transcript only where needed.'}
            </p>
          </div>
          <Button
            disabled={busy || (kind === 'deep' && !round)}
            onClick={() =>
              action(
                { action: 'claim', kind, count: 5 },
                'Your review batch is ready.',
              )
            }
          >
            <Headphones /> Claim up to 5
          </Button>
        </div>
        <p className="helper">
          Claims last 15 minutes. Your own recordings are excluded from your
          review queue.
        </p>
        {!tasks.length ? (
          <Blank
            title={
              kind === 'deep' && !round
                ? 'Waiting for an open round'
                : 'No recordings claimed'
            }
            description={
              kind === 'deep' && !round
                ? 'An administrator can open a round when transcripts are ready.'
                : 'Claim a batch to start. Submitted recordings stay locked for the current round.'
            }
          />
        ) : (
          <div className="review-list">
            {tasks.map((t) => (
              <article className="review-card" key={t.id}>
                <div className="section-head">
                  <div>
                    <h3>{t.name}</h3>
                    <span className="helper">
                      {t.locale} · Claim ends{' '}
                      {new Date(t.claim!.expires).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <span className="pill">
                    {kind === 'deep'
                      ? `${t.streak} / 3 clean rounds`
                      : 'Audio quality'}
                  </span>
                </div>
                <Player src={`/api/workspace?audio=${t.id}`} />
                {kind === 'quick' ? (
                  <>
                    <label className="field">
                      <span>Feedback for the contributor</span>
                      <Textarea
                        placeholder="Required if requesting a retake"
                        value={notes[t.id] ?? ''}
                        onChange={(e) =>
                          setNotes({ ...notes, [t.id]: e.target.value })
                        }
                      />
                    </label>
                    <div className="actions">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          action(
                            {
                              action: 'quick',
                              id: t.id,
                              approved: true,
                              note: notes[t.id] ?? '',
                            },
                            'Approved. Recording is now waiting for transcription.',
                          )
                        }
                      >
                        <Check /> Approve
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          action(
                            {
                              action: 'quick',
                              id: t.id,
                              approved: false,
                              note: notes[t.id] ?? '',
                            },
                            'Retake requested.',
                          )
                        }
                      >
                        <RotateCcw /> Request retake
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <label className="field">
                      <span>Transcript</span>
                      <Textarea
                        className="transcript"
                        value={drafts[t.id] ?? t.transcript}
                        onChange={(e) =>
                          setDrafts({ ...drafts, [t.id]: e.target.value })
                        }
                      />
                    </label>
                    <div className="actions">
                      <Button
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await action(
                              {
                                action: 'deep',
                                id: t.id,
                                text: drafts[t.id] ?? t.transcript,
                              },
                              'Review submitted. This recording is locked until the round closes.',
                            )
                          )
                            setDrafts((d) => {
                              const next = { ...d };
                              delete next[t.id];
                              return next;
                            });
                        }}
                      >
                        <Check /> Submit review
                      </Button>
                      <span className="helper">
                        {(drafts[t.id] ?? t.transcript).trim() === t.transcript
                          ? 'No changes · adds one clean round when closed'
                          : 'Edited · resets the clean-round streak when closed'}
                      </span>
                    </div>
                    <details>
                      <summary>
                        Transcript history ({t.reviews.length} reviews)
                      </summary>
                      <p className="history">
                        <strong>Original · {t.source}</strong>
                        <br />
                        {t.originalTranscript}
                      </p>
                      {t.reviews.map((r) => (
                        <div className="history" key={r.round}>
                          <strong>
                            Round {r.round} · {r.edited ? 'Edited' : 'No edit'}{' '}
                            · {r.actor}
                          </strong>
                          {r.edited && (
                            <>
                              <p>Before: {r.before}</p>
                              <p>After: {r.after}</p>
                            </>
                          )}
                        </div>
                      ))}
                    </details>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </>
    );
  }
  return (
    <main className="workspace">
      <header className="topbar">
        <a className="brand" href="/">
          <AudioLines /> FIELDNOTE <span>Audio workspace</span>
        </a>
        <div className="actions">
          <span className="pill">{actor?.role ?? initialRole}</span>
          <a href="/login" className="workspace-account-link">
            Change portal
          </a>
          <a href={signOutUrl} target="_top" className="workspace-account-link">
            {data?.demo ? 'Leave demo' : 'Sign out'}
          </a>
          <Button
            variant="ghost"
            aria-label="Refresh workspace"
            onClick={() =>
              refresh()
                .then(() => {
                  setError('');
                  setNotice('Workspace refreshed.');
                })
                .catch((e) => setError(e.message))
            }
          >
            <RefreshCw />
          </Button>
        </div>
      </header>
      <section className="heading">
        <div>
          <p className="eyebrow">COLLECT · REVIEW · DELIVER</p>
          <h1>{state?.config.name ?? 'Every voice, carefully reviewed.'}</h1>
          <p>
            {state
              ? `${state.config.language.toUpperCase()} / ${state.config.locale} · ${actor?.email}`
              : 'A clear path from the first recording to a trusted transcript.'}
          </p>
        </div>
        <span className="pill">
          {round ? `Round ${round.number} is open` : 'Between review rounds'}
        </span>
      </section>
      {error && (
        <div className="message error" role="alert">
          {error}
          {!data && (
            <a className="sign-in" href={`/login/${initialRole}`} target="_top">
              Return to login <ArrowRight size={16} />
            </a>
          )}
        </div>
      )}
      {notice && (
        <div className="message success" role="status">
          {notice}
        </div>
      )}
      {!data ? (
        <section className="panel">
          <h2>
            {error ? 'Workspace access required' : 'Opening your workspace…'}
          </h2>
          <p>
            {error
              ? 'A workspace administrator must give your signed-in account access.'
              : 'Loading recordings and review progress.'}
          </p>
        </section>
      ) : (
        <>
          {data.demo && (
            <div className="demo-note">
              Local pilot · Use Change portal to try each workflow. Recordings
              and reviews are saved on this computer.
            </div>
          )}
          <section className="metrics" aria-label="Collection progress">
            {[
              [state!.tasks.length, 'Recordings'],
              [quick.length, 'Quick Review'],
              [deep.length, 'Deep Review'],
              [ready.length, 'Ready to deliver'],
            ].map(([number, label]) => (
              <div key={label} className="metric">
                <span>{label}</span>
                <strong>{number}</strong>
              </div>
            ))}
          </section>
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList className="workspace-tabs" variant="line">
              {actor?.role !== 'qa' && (
                <TabsTrigger value="contribute">
                  <Mic /> Contributor studio
                </TabsTrigger>
              )}
              {canReview && (
                <TabsTrigger value="quick">
                  <Headphones /> Quick Review
                </TabsTrigger>
              )}
              {canReview && (
                <TabsTrigger value="deep">
                  <ClipboardCheck /> Deep Review
                </TabsTrigger>
              )}
              {admin && (
                <TabsTrigger value="manage">
                  <Settings2 /> Manage project
                </TabsTrigger>
              )}
              {admin && (
                <TabsTrigger value="delivery">
                  <Download /> Delivery
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="contribute">
              <div className="studio-grid">
                <section className="panel">
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">CONTRIBUTOR STUDIO</p>
                      <h2>Make your next recording</h2>
                    </div>
                    <span className="step-number">01</span>
                  </div>
                  <div
                    className={`record-area ${recording ? 'is-recording' : ''}`}
                  >
                    <Mic size={42} />
                    <h3>
                      {recording
                        ? `Recording · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
                        : file
                          ? 'Your recording is ready'
                          : 'Your voice starts here'}
                    </h3>
                    <p>
                      {file
                        ? file.name
                        : 'Record in a quiet space, or upload an existing audio file.'}
                    </p>
                    {recording ? (
                      <Button
                        variant="destructive"
                        onClick={() => recorder.current?.stop()}
                      >
                        <Square /> Stop recording
                      </Button>
                    ) : (
                      <div className="actions">
                        <Button onClick={startRecording} disabled={busy}>
                          <Mic />
                          {file ? 'Retake' : 'Record audio'}
                        </Button>
                        <label className="upload-label">
                          <Upload size={16} /> Upload audio
                          <input
                            type="file"
                            accept="audio/*,.webm,.m4a,.flac"
                            disabled={busy}
                            onChange={(e) => {
                              const chosen = e.target.files?.[0];
                              if (chosen && chosen.size > 20 * 1024 * 1024)
                                setError('Choose an audio file up to 20 MB.');
                              else if (chosen) {
                                setFile(chosen);
                                setQualityChecks({});
                              }
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}
                    <span className="helper">
                      WAV, MP3, WebM, M4A, OGG or FLAC · up to 20 MB
                    </span>
                  </div>
                  {preview && !recording && (
                    <div className="record-preview">
                      <Player src={preview} />
                      <fieldset className="audio-checklist">
                        <legend>Audio quality checklist</legend>
                        <p>
                          Listen to your recording, then confirm every item.
                        </p>
                        {audioCriteria.map((item) => (
                          <label key={item.id}>
                            <input
                              type="checkbox"
                              checked={Boolean(qualityChecks[item.id])}
                              onChange={(event) =>
                                setQualityChecks((current) => ({
                                  ...current,
                                  [item.id]: event.target.checked,
                                }))
                              }
                            />
                            <span>
                              <strong>{item.title}</strong>
                              <small>{item.description}</small>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                      <div className="actions">
                        <Button
                          disabled={busy || !qualityConfirmed}
                          onClick={upload}
                        >
                          {busy ? 'Submitting…' : 'Submit recording'}
                          <ArrowRight />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setFile(null);
                            setQualityChecks({});
                          }}
                          disabled={busy}
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
                <aside className="panel requirements">
                  <p className="eyebrow">BEFORE YOU RECORD</p>
                  <h2>A good take starts here.</h2>
                  <div className="locale">
                    {state!.config.locale}
                    <span>Project language</span>
                  </div>
                  <p className="pre-wrap">{state!.config.requirements}</p>
                  <ul
                    className="quality-tips"
                    aria-label="Audio quality criteria"
                  >
                    {audioCriteria.map((item) => (
                      <li key={item.id}>
                        <Check size={17} aria-hidden="true" />
                        <span>
                          <strong>{item.title}</strong>
                          {item.description}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="workflow-note">
                    <Check size={22} />
                    <p>
                      Every recording passes Quick Review, transcription, and at
                      least three clean Deep Review rounds.
                    </p>
                  </div>
                </aside>
              </div>
              <section className="panel submissions">
                <h2>Your submissions</h2>
                {!mine.length ? (
                  <Blank
                    title="Your first recording belongs here"
                    description="Submit a recording to follow its progress and see reviewer feedback."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recording</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Feedback</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mine.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>{t.name}</TableCell>
                          <TableCell>
                            {new Date(t.created).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Status task={t} />
                          </TableCell>
                          <TableCell>{t.quick?.note || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </TabsContent>
            <TabsContent value="quick">
              <section className="panel">{reviewCards('quick')}</section>
            </TabsContent>
            <TabsContent value="deep">
              <section className="panel">
                {round && (
                  <div className="round-progress">
                    <div>
                      <strong>Round {round.number}</strong>
                      <span>
                        {complete} / {round.taskIds.length} reviewed
                      </span>
                    </div>
                    <Progress value={(100 * complete) / round.taskIds.length} />
                  </div>
                )}
                {reviewCards('deep')}
              </section>
            </TabsContent>
            <TabsContent value="manage">
              <div className="manage-grid">
                <section className="panel">
                  <p className="eyebrow">ROUND CONTROL</p>
                  <h2>
                    {round
                      ? `Deep Review · round ${round.number}`
                      : 'Ready for the next round?'}
                  </h2>
                  <p>
                    {round
                      ? `${complete} of ${round.taskIds.length} recordings have been reviewed. New transcripts wait for the next round.`
                      : `${deep.length} transcribed recordings are waiting. Opening a round fixes its eligible set.`}
                  </p>
                  <div className="actions">
                    <Button
                      disabled={busy || !!round || !deep.length}
                      onClick={() =>
                        action(
                          { action: 'openRound' },
                          'A new Deep Review round is open.',
                        )
                      }
                    >
                      Open next round
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        busy || !round || complete !== round?.taskIds.length
                      }
                      onClick={() =>
                        action(
                          { action: 'closeRound' },
                          'Round closed. Clean-round streaks and delivery records are updated.',
                        )
                      }
                    >
                      Close completed round
                    </Button>
                  </div>
                  <div className="round-history">
                    {state!.rounds.map((r) => (
                      <span className="pill" key={r.number}>
                        Round {r.number} · {r.status}
                      </span>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <p className="eyebrow">TRANSCRIPTION</p>
                  <h2>Audio to first draft</h2>
                  <p>
                    {state!.config.provider === 'manual'
                      ? 'Manual import is selected. Add a real transcript for each approved recording below.'
                      : data.automaticSttConfigured
                        ? 'Automatic transcription is configured. Keep the background worker running to process the queue.'
                        : 'Automatic transcription needs a provider key before the worker can process recordings.'}
                  </p>
                  <span className="pill">
                    {
                      state!.tasks.filter((t) => t.status.startsWith('STT_'))
                        .length
                    }{' '}
                    in the transcription queue
                  </span>
                </section>
              </div>
              <section className="panel submissions">
                <h2>Transcription queue</h2>
                {!state!.tasks.some((t) =>
                  ['STT_PENDING', 'STT_FAILED', 'STT_PROCESSING'].includes(
                    t.status,
                  ),
                ) ? (
                  <Blank
                    title="No transcripts waiting"
                    description="Quick Review approval adds recordings to this queue."
                  />
                ) : (
                  state!.tasks
                    .filter((t) =>
                      ['STT_PENDING', 'STT_FAILED', 'STT_PROCESSING'].includes(
                        t.status,
                      ),
                    )
                    .map((t) => (
                      <div className="review-card" key={t.id}>
                        <div className="section-head">
                          <h3>{t.name}</h3>
                          <Status task={t} />
                        </div>
                        <Player src={`/api/workspace?audio=${t.id}`} />
                        {t.job.error && (
                          <p className="error-text">
                            {t.job.error} · Attempt {t.job.attempts} of 3
                          </p>
                        )}
                        {t.status !== 'STT_PROCESSING' && (
                          <>
                            <label className="field">
                              <span>Manual transcript import</span>
                              <Textarea
                                placeholder="Listen to the recording and enter its actual transcript"
                                value={drafts[t.id] ?? ''}
                                onChange={(e) =>
                                  setDrafts({
                                    ...drafts,
                                    [t.id]: e.target.value,
                                  })
                                }
                              />
                            </label>
                            <div className="actions">
                              <Button
                                disabled={busy || !drafts[t.id]?.trim()}
                                onClick={() =>
                                  action(
                                    {
                                      action: 'transcript',
                                      id: t.id,
                                      text: drafts[t.id],
                                    },
                                    'Transcript imported. This recording can enter the next review round.',
                                  )
                                }
                              >
                                Save original transcript
                              </Button>
                              {t.status === 'STT_FAILED' && (
                                <Button
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    action(
                                      { action: 'retry', id: t.id },
                                      'Transcription queued for retry.',
                                    )
                                  }
                                >
                                  Retry automatic transcription
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))
                )}
              </section>
              <div className="manage-grid submissions">
                <section className="panel">
                  <h2>Project settings</h2>
                  {config && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        action(
                          { action: 'config', ...config },
                          'Project settings saved.',
                        );
                      }}
                    >
                      <label className="field">
                        <span>Project name</span>
                        <Input
                          required
                          maxLength={120}
                          value={config.name}
                          onChange={(e) =>
                            setConfig({ ...config, name: e.target.value })
                          }
                        />
                      </label>
                      <div className="two-fields">
                        <label className="field">
                          <span>Language code</span>
                          <Input
                            required
                            placeholder="ta"
                            value={config.language}
                            onChange={(e) =>
                              setConfig({ ...config, language: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Locale</span>
                          <Input
                            required
                            placeholder="ta-IN"
                            value={config.locale}
                            onChange={(e) =>
                              setConfig({ ...config, locale: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span>Recording requirements</span>
                        <Textarea
                          value={config.requirements}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              requirements: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Domain vocabulary</span>
                        <Input
                          value={config.vocabulary}
                          onChange={(e) =>
                            setConfig({ ...config, vocabulary: e.target.value })
                          }
                        />
                      </label>
                      <Choice
                        label="Transcription provider"
                        value={config.provider}
                        onChange={(v) =>
                          setConfig({
                            ...config,
                            provider: v as 'manual' | 'openai',
                          })
                        }
                        options={[
                          {
                            value: 'manual',
                            label: 'Manual transcript import',
                          },
                          { value: 'openai', label: 'OpenAI transcription' },
                        ]}
                      />
                      <p className="helper">
                        Language and locale changes apply to new recordings.
                      </p>
                      <Button type="submit" disabled={busy}>
                        Save settings
                      </Button>
                    </form>
                  )}
                </section>
                <section className="panel">
                  <h2>
                    <Users className="inline-icon" /> Team access
                  </h2>
                  <p>Add the email each teammate uses to sign in.</p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await action(
                          {
                            action: 'member',
                            email: memberEmail,
                            role: memberRole,
                          },
                          'Team access updated.',
                        )
                      )
                        setMemberEmail('');
                    }}
                  >
                    <label className="field">
                      <span>Email</span>
                      <Input
                        type="email"
                        required
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                      />
                    </label>
                    <Choice
                      label="Role"
                      value={memberRole}
                      onChange={setMemberRole}
                      options={[
                        { value: 'contributor', label: 'Contributor' },
                        { value: 'qa', label: 'QA reviewer' },
                        {
                          value: 'admin',
                          label: 'Administrator / team leader',
                        },
                      ]}
                    />
                    <Button type="submit" disabled={busy}>
                      Add or update member
                    </Button>
                  </form>
                  <div className="member-list">
                    {state!.members.map((m) => (
                      <div key={m.email}>
                        <span>{m.email}</span>
                        <span className="pill">{m.role}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
              <section className="panel submissions">
                <h2>Team activity</h2>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team member</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state!.audit
                      .slice(-30)
                      .reverse()
                      .map((entry, i) => (
                        <TableRow key={`${entry.at}-${i}`}>
                          <TableCell>{entry.actor}</TableCell>
                          <TableCell>{entry.action}</TableCell>
                          <TableCell>
                            {new Date(entry.at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
                {!state!.audit.length && <p>No activity yet.</p>}
              </section>
            </TabsContent>
            <TabsContent value="delivery">
              <section className="panel">
                <div className="section-head">
                  <div>
                    <p className="eyebrow">READY TO DELIVER</p>
                    <h2>Reviewed, refined, ready.</h2>
                    <p>
                      Only recordings with three consecutive no-edit rounds
                      appear here.
                    </p>
                  </div>
                  <Button disabled={busy || !ready.length} onClick={download}>
                    <Download /> Export records
                  </Button>
                </div>
                {!ready.length ? (
                  <Blank
                    title="Quality takes a few rounds"
                    description="Completed recordings arrive here automatically when the administrator closes their third consecutive clean round."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recording</TableHead>
                        <TableHead>Final transcript</TableHead>
                        <TableHead>Locale</TableHead>
                        <TableHead>Audio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ready.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>
                            {t.name}
                            <br />
                            <span className="helper">
                              {t.streak} clean rounds
                            </span>
                          </TableCell>
                          <TableCell className="delivery-transcript">
                            {t.transcript}
                          </TableCell>
                          <TableCell>{t.locale}</TableCell>
                          <TableCell>
                            <a
                              className="text-link"
                              href={`/api/workspace?audio=${t.id}`}
                              download={t.name}
                            >
                              Download audio
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <p className="helper">
                  The JSON export includes final transcripts, original drafts,
                  audio checksums and complete review history. Audio links
                  require workspace access.
                </p>
              </section>
            </TabsContent>
          </Tabs>
          <footer>
            Fieldnote · Audio collection pilot{' '}
            <span>Three clean rounds. One trusted transcript.</span>
          </footer>
        </>
      )}
    </main>
  );
}

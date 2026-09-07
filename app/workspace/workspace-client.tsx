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
  Trash2,
  Wifi,
  Gauge,
  FileCheck2,
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
  directUploadConfigured: boolean;
};
const labels: Record<string, string> = {
  PROCESSING: 'Checking audio',
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
        : initialRole === 'admin' || initialRole === 'team_leader'
          ? 'manage'
          : 'contribute',
    );
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0);
  const [analysis, setAnalysis] = useState<{
    durationSeconds: number;
    silent: boolean;
    waveform: number[];
    sampleRate?: number;
    channels?: number;
    bitDepth?: number;
  } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [liveLevels, setLiveLevels] = useState<number[]>(
    Array.from({ length: 18 }, () => 0.08),
  );
  const [intakeAnswers, setIntakeAnswers] = useState<
    Record<string, string | boolean>
  >({});
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [resubmitTaskId, setResubmitTaskId] = useState<string | null>(null);
  const [submissionFilter, setSubmissionFilter] = useState('all');
  const [qualityChecks, setQualityChecks] = useState<Record<string, boolean>>(
    {},
  );
  const qualityConfirmed = audioCriteria.every(
    (item) => qualityChecks[item.id],
  );
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    audioContext = useRef<AudioContext | null>(null),
    animationFrame = useRef<number | null>(null),
    recordingStartedAt = useRef(0),
    uploadIdentity = useRef<string | null>(null),
    recordPanel = useRef<HTMLElement | null>(null);
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
  useEffect(() => {
    if (
      recording &&
      data &&
      seconds >= data.state.config.technical.maxDurationSeconds &&
      recorder.current?.state === 'recording'
    )
      recorder.current.stop();
  }, [data, recording, seconds]);
  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
      audioContext.current?.close().catch(() => {});
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
      const context = new AudioContext();
      audioContext.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      context.createMediaStreamSource(input).connect(analyser);
      const meterData = new Uint8Array(analyser.frequencyBinCount);
      const updateMeter = () => {
        analyser.getByteFrequencyData(meterData);
        setLiveLevels(
          Array.from(meterData.slice(0, 18), (value) =>
            Math.max(0.06, value / 255),
          ),
        );
        animationFrame.current = requestAnimationFrame(updateMeter);
      };
      updateMeter();
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
        const recorded = new File(
          chunks,
          `recording-${Date.now()}.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`,
          { type },
        );
        input.getTracks().forEach((t) => t.stop());
        if (animationFrame.current)
          cancelAnimationFrame(animationFrame.current);
        animationFrame.current = null;
        audioContext.current?.close().catch(() => {});
        audioContext.current = null;
        setRecording(false);
        void selectFile(
          recorded,
          Math.max(1, (Date.now() - recordingStartedAt.current) / 1000),
        );
      };
      rec.onerror = () => {
        setError('Recording stopped unexpectedly. Please retake it.');
        input.getTracks().forEach((t) => t.stop());
        setRecording(false);
      };
      rec.start(1000);
      recordingStartedAt.current = Date.now();
      setFile(null);
      setAnalysis(null);
      setConsentAccepted(false);
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
    }
  }
  async function selectFile(chosen: File, recordedDuration?: number) {
    const project = data?.state.config;
    if (!project) return;
    setError('');
    setNotice('');
    setAnalyzing(true);
    setAnalysis(null);
    uploadIdentity.current = null;
    setConsentAccepted(false);
    setQualityChecks({});
    try {
      const mime = normalizedAudioType(chosen);
      if (chosen.size < 1 || chosen.size > project.technical.maxBytes)
        throw new Error(
          `Choose an audio file up to ${formatBytes(project.technical.maxBytes)}.`,
        );
      if (!project.technical.formats.includes(mime))
        throw new Error(
          'Choose one of the audio formats listed for this project.',
        );
      const inspected = await inspectAudio(chosen, recordedDuration);
      if (
        inspected.durationSeconds < project.technical.minDurationSeconds ||
        inspected.durationSeconds > project.technical.maxDurationSeconds
      )
        throw new Error(
          `Record between ${formatDuration(project.technical.minDurationSeconds)} and ${formatDuration(project.technical.maxDurationSeconds)}.`,
        );
      if (inspected.silent)
        throw new Error(
          'This recording sounds silent. Check your microphone and record again.',
        );
      setFile(
        chosen.type === mime
          ? chosen
          : new File([chosen], chosen.name, { type: mime }),
      );
      setAnalysis(inspected);
    } catch (caught) {
      setFile(null);
      setError(
        caught instanceof Error
          ? caught.message
          : 'We could not check this audio file. Choose another file.',
      );
    } finally {
      setAnalyzing(false);
    }
  }
  async function upload() {
    if (!file) return;
    if (!qualityConfirmed) {
      setError('Confirm every audio quality check before submitting.');
      return;
    }
    if (!analysis || analysis.silent) {
      setError('Wait for the audio check to finish before submitting.');
      return;
    }
    const missingField = state!.config.intakeFields.find(
      (field) =>
        field.required &&
        (field.type === 'checkbox'
          ? intakeAnswers[field.id] !== true
          : !String(intakeAnswers[field.id] ?? '').trim()),
    );
    if (missingField) {
      setError(`Complete “${missingField.label}” before submitting.`);
      return;
    }
    if (state!.config.consent?.required && !consentAccepted) {
      setError('Accept the project consent before submitting.');
      return;
    }
    setBusy(true);
    setError('');
    setUploadProgress(0);
    try {
      if (data!.directUploadConfigured) {
        const idempotencyKey =
          uploadIdentity.current ??
          (uploadIdentity.current = crypto.randomUUID());
        const startPath = resubmitTaskId
          ? `/api/recordings/${encodeURIComponent(resubmitTaskId)}/resubmit`
          : '/api/recordings/upload-url';
        const instructions = (await (
          await api(startPath, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: state!.config.id,
              name: file.name,
              mime: normalizedAudioType(file),
              bytes: file.size,
              durationSeconds: analysis.durationSeconds,
              idempotencyKey,
            }),
          })
        ).json()) as {
          alreadySubmitted?: boolean;
          recordingId?: string;
          sessionId: string;
          idempotencyKey: string;
          partSize: number;
          contentType: string;
          parts: { partNumber: number; url: string }[];
        };
        if (!instructions.alreadySubmitted) {
          const uploaded: { partNumber: number; etag: string }[] = [];
          for (const part of instructions.parts) {
            const start = (part.partNumber - 1) * instructions.partSize;
            const slice = file.slice(
              start,
              Math.min(file.size, start + instructions.partSize),
            );
            const etag = await uploadPartWithRetry(
              part.url,
              slice,
              instructions.contentType,
            );
            uploaded.push({ partNumber: part.partNumber, etag });
            setUploadProgress(
              Math.round((100 * uploaded.length) / instructions.parts.length),
            );
          }
          await api('/api/recordings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: instructions.sessionId,
              idempotencyKey: instructions.idempotencyKey,
              parts: uploaded,
              metadata: intakeAnswers,
              consentAccepted,
              qualityChecks: audioCriteria.map((item) => item.id),
            }),
          });
        }
      } else {
        const form = new FormData();
        form.set('audio', file);
        form.set(
          'qualityChecks',
          JSON.stringify(audioCriteria.map((item) => item.id)),
        );
        form.set('durationSeconds', String(analysis.durationSeconds));
        form.set('metadata', JSON.stringify(intakeAnswers));
        form.set('consentAccepted', String(consentAccepted));
        if (resubmitTaskId) form.set('resubmitTaskId', resubmitTaskId);
        await api('/api/workspace', { method: 'POST', body: form });
        setUploadProgress(100);
      }
      setFile(null);
      setAnalysis(null);
      setQualityChecks({});
      setConsentAccepted(false);
      setResubmitTaskId(null);
      uploadIdentity.current = null;
      await refresh();
      setNotice(
        data!.directUploadConfigured
          ? 'Upload complete. We are checking the audio before Quick Review.'
          : 'Recording submitted for Quick Review.',
      );
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
  const displayedMine = mine.filter(
    (task) => submissionFilter === 'all' || task.status === submissionFilter,
  );
  const intakeComplete = Boolean(
    state?.config.intakeFields.every((field) =>
      field.required
        ? field.type === 'checkbox'
          ? intakeAnswers[field.id] === true
          : Boolean(String(intakeAnswers[field.id] ?? '').trim())
        : true,
    ),
  );
  const submissionReady = Boolean(
    file &&
    analysis &&
    !analysis.silent &&
    qualityConfirmed &&
    intakeComplete &&
    (!state?.config.consent?.required || consentAccepted),
  );
  const canReview =
    actor?.role === 'admin' ||
    actor?.role === 'team_leader' ||
    actor?.role === 'qa';
  const admin = actor?.role === 'admin';
  const manager = admin || actor?.role === 'team_leader';
  const canContribute = admin || actor?.role === 'contributor';
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
              {canContribute && (
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
              {manager && (
                <TabsTrigger value="manage">
                  <Settings2 /> Manage project
                </TabsTrigger>
              )}
              {manager && (
                <TabsTrigger value="delivery">
                  <Download /> Delivery
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="contribute">
              <div className="studio-grid">
                <section className="panel" ref={recordPanel}>
                  <div className="section-head">
                    <div>
                      <p className="eyebrow">CONTRIBUTOR STUDIO</p>
                      <h2>
                        {resubmitTaskId
                          ? 'Replace the recording requested by review'
                          : 'Make your next recording'}
                      </h2>
                    </div>
                    <span className="step-number">01</span>
                  </div>
                  {resubmitTaskId && (
                    <div className="retake-banner" role="status">
                      <RotateCcw size={20} />
                      <div>
                        <strong>Retake in progress</strong>
                        <span>
                          Your earlier attempt and reviewer feedback will stay
                          in the submission history.
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => setResubmitTaskId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
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
                    {recording && (
                      <>
                        <div
                          className="live-waveform"
                          aria-label="Live microphone level"
                        >
                          {liveLevels.map((level, index) => (
                            <span
                              key={index}
                              style={{
                                height: `${Math.round(8 + level * 46)}px`,
                              }}
                            />
                          ))}
                        </div>
                        <p
                          className={`timer-guide ${
                            seconds >=
                            state!.config.technical.maxDurationSeconds
                              ? 'is-over'
                              : seconds <
                                  state!.config.technical.minDurationSeconds
                                ? 'is-under'
                                : 'is-good'
                          }`}
                        >
                          {seconds < state!.config.technical.minDurationSeconds
                            ? `${Math.ceil(state!.config.technical.minDurationSeconds - seconds)} seconds more needed`
                            : seconds >=
                                state!.config.technical.maxDurationSeconds
                              ? 'Maximum length reached — stop now'
                              : 'Recording length is within the project range'}
                        </p>
                      </>
                    )}
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
                            accept={state!.config.technical.formats.join(',')}
                            disabled={busy}
                            onChange={(e) => {
                              const chosen = e.target.files?.[0];
                              if (chosen) void selectFile(chosen);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                    )}
                    <span className="helper">
                      {state!.config.technical.formats
                        .map(audioFormatLabel)
                        .join(', ')}{' '}
                      · up to {formatBytes(state!.config.technical.maxBytes)}
                    </span>
                  </div>
                  {analyzing && (
                    <div className="analysis-progress" role="status">
                      <Gauge size={20} /> Checking length, sound level and file
                      format…
                    </div>
                  )}
                  {preview && !recording && (
                    <div className="record-preview">
                      <Player src={preview} />
                      {analysis && (
                        <section
                          className="technical-check"
                          aria-label="Automatic audio checks"
                        >
                          <div className="preview-waveform" aria-hidden="true">
                            {analysis.waveform.map((level, index) => (
                              <span
                                key={index}
                                style={{
                                  height: `${Math.round(8 + level * 42)}px`,
                                }}
                              />
                            ))}
                          </div>
                          <div className="check-grid">
                            <span>
                              <FileCheck2 />{' '}
                              <strong>
                                {formatDuration(analysis.durationSeconds)}
                              </strong>{' '}
                              duration
                            </span>
                            <span>
                              <Check />{' '}
                              <strong>
                                {audioFormatLabel(normalizedAudioType(file!))}
                              </strong>{' '}
                              format
                            </span>
                            <span>
                              <Gauge /> <strong>Voice detected</strong> sound
                              level
                            </span>
                            {analysis.sampleRate && (
                              <span>
                                <Wifi />{' '}
                                <strong>
                                  {Math.round(analysis.sampleRate / 1000)} kHz
                                </strong>{' '}
                                decoded rate
                              </span>
                            )}
                          </div>
                        </section>
                      )}
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
                      <fieldset className="intake-form">
                        <legend>Project details</legend>
                        <p>These answers are saved with this recording.</p>
                        <div className="intake-grid">
                          {state!.config.intakeFields.map((field) => (
                            <div
                              className={`field intake-field ${field.type === 'textarea' ? 'is-wide' : ''}`}
                              key={field.id}
                            >
                              <span>
                                {field.label}{' '}
                                {field.required && <em>Required</em>}
                              </span>
                              {field.type === 'textarea' ? (
                                <Textarea
                                  required={field.required}
                                  maxLength={field.maxLength ?? 500}
                                  placeholder={field.placeholder}
                                  value={String(intakeAnswers[field.id] ?? '')}
                                  onChange={(event) =>
                                    setIntakeAnswers((current) => ({
                                      ...current,
                                      [field.id]: event.target.value,
                                    }))
                                  }
                                />
                              ) : field.type === 'select' ? (
                                <select
                                  required={field.required}
                                  value={String(intakeAnswers[field.id] ?? '')}
                                  onChange={(event) =>
                                    setIntakeAnswers((current) => ({
                                      ...current,
                                      [field.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Choose an option</option>
                                  {field.options?.map((option) => (
                                    <option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : field.type === 'radio' ? (
                                <div className="radio-options">
                                  {field.options?.map((option) => (
                                    <label key={option.value}>
                                      <input
                                        type="radio"
                                        name={`intake-${field.id}`}
                                        value={option.value}
                                        checked={
                                          intakeAnswers[field.id] ===
                                          option.value
                                        }
                                        onChange={() =>
                                          setIntakeAnswers((current) => ({
                                            ...current,
                                            [field.id]: option.value,
                                          }))
                                        }
                                      />
                                      {option.label}
                                    </label>
                                  ))}
                                </div>
                              ) : field.type === 'checkbox' ? (
                                <label className="standalone-check">
                                  <input
                                    type="checkbox"
                                    checked={intakeAnswers[field.id] === true}
                                    onChange={(event) =>
                                      setIntakeAnswers((current) => ({
                                        ...current,
                                        [field.id]: event.target.checked,
                                      }))
                                    }
                                  />
                                  Confirm
                                </label>
                              ) : (
                                <Input
                                  type={
                                    field.type === 'number' ? 'number' : 'text'
                                  }
                                  required={field.required}
                                  maxLength={field.maxLength}
                                  placeholder={field.placeholder}
                                  value={String(intakeAnswers[field.id] ?? '')}
                                  onChange={(event) =>
                                    setIntakeAnswers((current) => ({
                                      ...current,
                                      [field.id]: event.target.value,
                                    }))
                                  }
                                />
                              )}
                              {field.help && <small>{field.help}</small>}
                            </div>
                          ))}
                        </div>
                      </fieldset>
                      {state!.config.consent && (
                        <label className="consent-check">
                          <input
                            type="checkbox"
                            checked={consentAccepted}
                            onChange={(event) =>
                              setConsentAccepted(event.target.checked)
                            }
                          />
                          <span>
                            <strong>
                              Recording consent ·{' '}
                              {state!.config.consent.version}
                            </strong>
                            {state!.config.consent.text}
                          </span>
                        </label>
                      )}
                      {busy && uploadProgress > 0 && (
                        <div className="upload-progress" role="status">
                          <div>
                            <span>Secure upload</span>
                            <strong>{uploadProgress}%</strong>
                          </div>
                          <Progress value={uploadProgress} />
                        </div>
                      )}
                      <div className="actions">
                        <Button
                          disabled={busy || !submissionReady}
                          onClick={upload}
                        >
                          {busy
                            ? 'Submitting…'
                            : resubmitTaskId
                              ? 'Submit replacement'
                              : 'Submit recording'}
                          <ArrowRight />
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setFile(null);
                            setAnalysis(null);
                            setQualityChecks({});
                            setConsentAccepted(false);
                            uploadIdentity.current = null;
                          }}
                          disabled={busy}
                        >
                          <Trash2 /> Discard
                        </Button>
                      </div>
                    </div>
                  )}
                </section>
                <aside className="panel requirements">
                  <p className="eyebrow">BEFORE YOU RECORD</p>
                  <h2>{state!.config.brief}</h2>
                  <div className="brief-list">
                    {state!.config.content.prompt && (
                      <div>
                        <span>Your prompt</span>
                        <strong>{state!.config.content.prompt}</strong>
                      </div>
                    )}
                    {state!.config.content.topic && (
                      <div>
                        <span>Topic</span>
                        <strong>{state!.config.content.topic}</strong>
                      </div>
                    )}
                    <div>
                      <span>Language</span>
                      <strong>
                        {state!.config.language.toUpperCase()} ·{' '}
                        {state!.config.locale}
                      </strong>
                    </div>
                    <div>
                      <span>Recording length</span>
                      <strong>
                        {formatDuration(
                          state!.config.technical.minDurationSeconds,
                        )}
                        –
                        {formatDuration(
                          state!.config.technical.maxDurationSeconds,
                        )}
                      </strong>
                    </div>
                    {state!.config.technical.sampleRate && (
                      <div>
                        <span>Target sample rate</span>
                        <strong>
                          {state!.config.technical.sampleRate / 1000} kHz
                        </strong>
                      </div>
                    )}
                    {state!.config.technical.bitDepth && (
                      <div>
                        <span>Target bit depth</span>
                        <strong>{state!.config.technical.bitDepth}-bit</strong>
                      </div>
                    )}
                    {state!.config.technical.channels && (
                      <div>
                        <span>Channels</span>
                        <strong>
                          {state!.config.technical.channels === 1
                            ? 'Mono'
                            : 'Stereo'}
                        </strong>
                      </div>
                    )}
                    {state!.config.environment && (
                      <div>
                        <span>Environment</span>
                        <strong>{state!.config.environment}</strong>
                      </div>
                    )}
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
                <div className="section-head">
                  <div>
                    <h2>Your submissions</h2>
                    <p>
                      Track checks, review feedback and every replacement
                      attempt.
                    </p>
                  </div>
                  <Choice
                    label="Filter by status"
                    value={submissionFilter}
                    onChange={setSubmissionFilter}
                    options={[
                      { value: 'all', label: `All (${mine.length})` },
                      { value: 'PROCESSING', label: 'Checking audio' },
                      { value: 'QUICK_REVIEW', label: 'Quick Review' },
                      { value: 'REJECTED', label: 'Retake requested' },
                      { value: 'STT_PENDING', label: 'Awaiting transcript' },
                      { value: 'STT_PROCESSING', label: 'Transcribing' },
                      { value: 'STT_FAILED', label: 'Transcription failed' },
                      { value: 'DEEP_REVIEW', label: 'Deep Review' },
                      { value: 'READY_TO_DELIVER', label: 'Ready to deliver' },
                    ]}
                  />
                </div>
                {!mine.length ? (
                  <Blank
                    title="Your first recording belongs here"
                    description="Submit a recording to follow its progress and see reviewer feedback."
                  />
                ) : !displayedMine.length ? (
                  <Blank
                    title="No submissions with this status"
                    description="Choose another status to see your recordings."
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recording</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Feedback</TableHead>
                        <TableHead>History</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedMine.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell>{t.name}</TableCell>
                          <TableCell>
                            {new Date(t.created).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Status task={t} />
                          </TableCell>
                          <TableCell>{t.quick?.note || '—'}</TableCell>
                          <TableCell>
                            {t.attempts?.length ? (
                              <details className="attempt-history">
                                <summary>
                                  {t.attempts.length + 1} attempts
                                </summary>
                                {t.attempts.map((attempt, index) => (
                                  <p key={`${attempt.audioKey}-${index}`}>
                                    Attempt {index + 1} ·{' '}
                                    {new Date(
                                      attempt.submittedAt,
                                    ).toLocaleDateString()}
                                    {attempt.feedback
                                      ? ` · ${attempt.feedback}`
                                      : ''}
                                  </p>
                                ))}
                              </details>
                            ) : (
                              'First attempt'
                            )}
                          </TableCell>
                          <TableCell>
                            {t.status === 'REJECTED' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setResubmitTaskId(t.id);
                                  setFile(null);
                                  setAnalysis(null);
                                  setQualityChecks({});
                                  setConsentAccepted(false);
                                  uploadIdentity.current = null;
                                  recordPanel.current?.scrollIntoView({
                                    behavior: 'smooth',
                                  });
                                }}
                              >
                                <RotateCcw /> Redo
                              </Button>
                            ) : (
                              <span className="helper">No action needed</span>
                            )}
                          </TableCell>
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
                {admin && (
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
                          { value: 'team_leader', label: 'Team leader' },
                          { value: 'admin', label: 'Administrator' },
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
                )}
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
                    description="Completed recordings arrive here automatically when an administrator or team leader closes their third consecutive clean round."
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

function normalizedAudioType(file: File) {
  const declared = file.type.toLowerCase().split(';')[0].trim();
  if (declared === 'audio/x-wav' || declared === 'audio/wave')
    return 'audio/wav';
  if (declared === 'audio/x-m4a') return 'audio/mp4';
  if (declared === 'audio/mp3') return 'audio/mpeg';
  if (declared) return declared;
  const extension = file.name.toLowerCase().split('.').pop();
  return (
    {
      wav: 'audio/wav',
      mp3: 'audio/mpeg',
      webm: 'audio/webm',
      m4a: 'audio/mp4',
      mp4: 'audio/mp4',
      ogg: 'audio/ogg',
      oga: 'audio/ogg',
      flac: 'audio/flac',
    }[extension ?? ''] ?? 'application/octet-stream'
  );
}

function audioFormatLabel(mime: string) {
  return (
    {
      'audio/wav': 'WAV',
      'audio/mpeg': 'MP3',
      'audio/webm': 'WebM',
      'audio/mp4': 'M4A',
      'audio/ogg': 'OGG',
      'audio/flac': 'FLAC',
    }[mime] ?? mime.replace('audio/', '').toUpperCase()
  );
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

function formatDuration(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return minutes
    ? `${minutes}:${String(remainder).padStart(2, '0')}`
    : `${remainder}s`;
}

async function inspectAudio(file: File, fallbackDuration?: number) {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const samples = buffer.getChannelData(0);
    const bucketCount = 44;
    const waveform = Array.from({ length: bucketCount }, (_, index) => {
      const start = Math.floor((index * samples.length) / bucketCount);
      const end = Math.max(
        start + 1,
        Math.floor(((index + 1) * samples.length) / bucketCount),
      );
      let peak = 0;
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1)
        peak = Math.max(peak, Math.abs(samples[sampleIndex] ?? 0));
      return Math.min(1, peak);
    });
    let sumSquares = 0;
    let overallPeak = 0;
    const stride = Math.max(1, Math.floor(samples.length / 250_000));
    let counted = 0;
    for (let index = 0; index < samples.length; index += stride) {
      const value = samples[index] ?? 0;
      sumSquares += value * value;
      overallPeak = Math.max(overallPeak, Math.abs(value));
      counted += 1;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, counted));
    return {
      durationSeconds:
        Number.isFinite(buffer.duration) && buffer.duration > 0
          ? buffer.duration
          : Math.max(0, fallbackDuration ?? 0),
      silent: overallPeak < 0.01 || rms < 0.002,
      waveform,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      bitDepth: readWavBitDepth(file, await file.slice(0, 44).arrayBuffer()),
    };
  } catch {
    if (!fallbackDuration)
      throw new Error(
        'This browser could not inspect the audio. Convert it to WAV, MP3, WebM, M4A, OGG or FLAC and try again.',
      );
    return {
      durationSeconds: fallbackDuration,
      silent: false,
      waveform: Array.from(
        { length: 44 },
        (_, index) => 0.2 + (index % 5) * 0.08,
      ),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

function readWavBitDepth(file: File, header: ArrayBuffer) {
  if (normalizedAudioType(file) !== 'audio/wav' || header.byteLength < 36)
    return undefined;
  const view = new DataView(header);
  return view.getUint16(34, true);
}

async function uploadPartWithRetry(
  url: string,
  part: Blob,
  contentType: string,
) {
  let lastError = 'The upload could not finish.';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: part,
      });
      if (!response.ok) throw new Error(`Storage returned ${response.status}.`);
      const etag = response.headers.get('etag')?.replace(/^"|"$/g, '');
      if (!etag)
        throw new Error(
          'Storage did not return an upload receipt. The bucket must expose the ETag header.',
        );
      return etag;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt < 3)
        await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw new Error(`${lastError} Check your connection and try again.`);
}

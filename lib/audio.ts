import { WorkflowError } from './workflow.ts';
export function sniffAudio(bytes: Uint8Array): string {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length));
  if (bytes.length < 12)
    throw new WorkflowError('This is not a supported audio file.', 400);
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WAVE') return 'audio/wav';
  if (ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (ascii(0, 4) === 'fLaC') return 'audio/flac';
  if (ascii(0, 3) === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224))
    return 'audio/mpeg';
  if (
    bytes[0] === 26 &&
    bytes[1] === 69 &&
    bytes[2] === 223 &&
    bytes[3] === 163
  )
    return 'audio/webm';
  if (ascii(4, 4) === 'ftyp') return 'audio/mp4';
  throw new WorkflowError(
    'Upload WAV, MP3, WebM, OGG, FLAC or M4A audio.',
    400,
  );
}

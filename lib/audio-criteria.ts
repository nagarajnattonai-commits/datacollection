export const audioCriteria = [
  {
    id: 'quiet',
    title: 'Quiet background',
    description:
      'Turn off fans, television, and music. Use noise suppression if your device offers it.',
  },
  {
    id: 'pace',
    title: 'Natural, steady pace',
    description:
      'Do not rush. Speak at a comfortable speed and leave a short pause between sentences.',
  },
  {
    id: 'distance',
    title: 'Good microphone distance',
    description:
      'Keep the microphone about 15–20 cm away and avoid touching or moving it.',
  },
  {
    id: 'clarity',
    title: 'Clear, consistent voice',
    description:
      'Speak clearly at an even volume. Avoid whispering, shouting, or covering the microphone.',
  },
  {
    id: 'complete',
    title: 'One clean, complete take',
    description:
      'Restart if there are interruptions, long silences, clipped words, or mistakes.',
  },
  {
    id: 'playback',
    title: 'Listen before submitting',
    description:
      'Play the full recording and confirm that every word is easy to hear.',
  },
] as const;

// Web Speech recognition, iOS Safari flavour: a fresh instance per user
// gesture, started synchronously inside the gesture. Network-backed on iOS —
// fails offline; callers must offer typed fallback.

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

export function recognitionAvailable(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
}

export function localeForDialect(dialect: string): string {
  switch (dialect) {
    case 'Mexican': return 'es-MX';
    case 'Rioplatense': return 'es-AR';
    case 'Colombian': return 'es-CO';
    case 'Chilean': return 'es-CL';
    case 'Andean': return 'es-PE';
    case 'Central American': return 'es-CR';
    case 'Caribbean': return 'es-DO';
    case 'Castilian': return 'es-ES';
    default: return 'es-US';
  }
}

export function createRecognition(locale: string): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as RecognitionCtor | undefined;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = locale;
  rec.interimResults = true;
  rec.continuous = false; // unreliable on iOS; hold-to-talk is one attempt per gesture
  return rec;
}

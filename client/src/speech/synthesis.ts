// speechSynthesis, iOS flavour: must be unlocked inside a user gesture (a
// zero-length utterance), voice list loads asynchronously, and the hardware
// ringer switch silences it entirely — surface that once.

let unlocked = false;
let voices: SpeechSynthesisVoice[] = [];

export function synthesisAvailable(): boolean {
  return 'speechSynthesis' in window;
}

/** Call inside the first user gesture of the session. */
export function unlockSynthesis(): void {
  if (unlocked || !synthesisAvailable()) return;
  const utterance = new SpeechSynthesisUtterance('');
  utterance.volume = 0;
  speechSynthesis.speak(utterance);
  unlocked = true;
  refreshVoices();
  speechSynthesis.addEventListener('voiceschanged', refreshVoices);
}

function refreshVoices(): void {
  voices = speechSynthesis.getVoices();
}

function pickVoice(locale: string): SpeechSynthesisVoice | null {
  if (voices.length === 0) refreshVoices();
  return (
    voices.find((v) => v.lang === locale) ??
    voices.find((v) => v.lang.startsWith('es')) ??
    null
  );
}

/** Speak Spanish text, sentence-chunked (long utterances get cut when the app
 *  backgrounds). Slightly slowed. */
export function speak(text: string, locale: string): void {
  if (!synthesisAvailable()) return;
  speechSynthesis.cancel();
  const sentences = text.match(/[^.!?¿¡]+[.!?]*/g) ?? [text];
  for (const sentence of sentences) {
    const u = new SpeechSynthesisUtterance(sentence.trim());
    u.lang = locale;
    u.rate = 0.9;
    const voice = pickVoice(locale);
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }
}

export function stopSpeaking(): void {
  if (synthesisAvailable()) speechSynthesis.cancel();
}

/** Split Spanish text into sentences. TTS chunking, dictation, and
 *  mined-card context must all split identically — one implementation. */
export function splitSentences(text: string): string[] {
  return (text.match(/[^.!?¿¡]+[.!?]*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

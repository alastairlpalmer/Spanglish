import type { TalkRequest, TalkStreamEvent } from '@seiscientas/shared';
import { currentAccessToken } from './auth';

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
  signal?: AbortSignal;
}

/** POST /api/ai/talk and read the SSE stream via fetch. EventSource can't
 *  POST, and iOS Safari supports response streaming since 16.4. */
export async function streamTalk(body: TalkRequest, handlers: StreamHandlers): Promise<void> {
  const token = await currentAccessToken();
  let res: Response;
  try {
    res = await fetch('/api/ai/talk', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: handlers.signal,
    });
  } catch (e) {
    if ((e as Error).name !== 'AbortError') handlers.onError('no connection');
    return;
  }

  if (!res.ok || !res.body) {
    if (res.status === 429) handlers.onError('AI features paused until tomorrow');
    else handlers.onError('conversation failed');
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith('data:')) continue; // ignore keepalives/comments
        let event: TalkStreamEvent;
        try {
          event = JSON.parse(line.slice(5).trim()) as TalkStreamEvent;
        } catch {
          continue;
        }
        if (event.type === 'delta') handlers.onDelta(event.text);
        else if (event.type === 'done') {
          handlers.onDone();
          return;
        } else if (event.type === 'error') {
          handlers.onError(event.message);
          return;
        }
      }
    }
    // Stream ended without a done event (backgrounded / dropped). Partial
    // text is already delivered; let the caller offer a retry.
    handlers.onError('stream interrupted');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') handlers.onError('stream interrupted');
  }
}

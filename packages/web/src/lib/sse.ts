export interface SseEvent {
  event: string;
  data: unknown;
}

export interface SseParser {
  push: (chunk: string) => SseEvent[];
}

// Miroir de formatSseEvent (packages/api/src/question/sse.ts) : chaque bloc
// est "event: <nom>\ndata: <json>\n\n". Incrémental car fetch() livre le
// corps de la réponse en morceaux de taille arbitraire, jamais alignés sur
// les limites d'un événement.
export function createSseParser(): SseParser {
  let buffer = '';

  return {
    push(chunk: string): SseEvent[] {
      buffer += chunk;
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      const events: SseEvent[] = [];
      for (const block of blocks) {
        const parsed = parseBlock(block);
        if (parsed !== undefined) {
          events.push(parsed);
        }
      }
      return events;
    },
  };
}

function parseBlock(block: string): SseEvent | undefined {
  let event: string | undefined;
  let dataLine: string | undefined;
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) {
      event = line.slice('event: '.length);
    } else if (line.startsWith('data: ')) {
      dataLine = line.slice('data: '.length);
    }
  }
  if (event === undefined || dataLine === undefined) {
    return undefined;
  }
  try {
    return { event, data: JSON.parse(dataLine) };
  } catch {
    return undefined;
  }
}

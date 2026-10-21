// Cloud AI — the OPTIONAL hosted-model layer.
//
// Local-first rules: this module only ever fires when the user has turned on
// "Cloud AI" in Settings AND pasted a provider key. Keys and the toggle live
// in the local DB (kvar); nothing is configured through a remote source. When
// enabled, requests go straight from this phone to the chosen OpenAI-
// compatible endpoint — no proxy, no intermediate server of ours.
//
// All functions return null on any failure (network, auth, quota, parse) so
// the callers stay on the deterministic rules engine — cloud AI is never a
// dependency, it only sharpens wording and fills tag gaps.

import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

// OpenAI-compatible endpoints + default models per provider preset.
export const AI_PRESETS = {
  gemini: {
    label: 'Google Gemini (free tier)',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.5-flash-lite',
    keyUrl: 'https://openrouter.ai/keys',
  },
  groq: {
    label: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    keyUrl: 'https://console.groq.com/keys',
  },
} as const;

export type CloudPresetId = keyof typeof AI_PRESETS;

export interface CloudAiConfig {
  enabled: boolean;
  endpoint: string;
  model: string;
  key: string;
  /** item/product photos ride along with the request (they leave the phone) */
  photos: boolean;
}

/** Readable settings shape used by callers (built from the DB). */
export function cloudConfigOf(enabled: boolean, endpoint: string, model: string, key: string, photos: boolean): CloudAiConfig {
  return { enabled, endpoint, model, key, photos };
}

export function cloudReady(c: CloudAiConfig | null | undefined): boolean {
  return !!c && c.enabled && c.key.trim().length > 0 && !!c.endpoint && !!c.model;
}

// ------------------------------------------------------------------ transport

interface ChatArgs {
  system: string;
  user: string;
  /** local file:// image URIs; included only when cfg.photos */
  images?: string[];
  json?: boolean;
  maxTokens?: number;
}

const TIMEOUT_MS = 25_000;
/** Long-edge cap for photos sent to the cloud — keeps payloads small. */
const IMAGE_MAX_EDGE = 640;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure-JS base64 for a small byte array (a ~640px JPEG is well within it). */
function base64FromBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + B64_CHARS[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + '=';
  }
  return out;
}

/** Downscale a local photo to a small JPEG data URL for multimodal calls. */
async function toDataUrl(fileUri: string): Promise<string | null> {
  try {
    const uri = fileUri.startsWith('file://') ? fileUri : `file://${fileUri}`;
    const image = await ImageManipulator.manipulate(uri, {
      maxWidth: IMAGE_MAX_EDGE,
      maxHeight: IMAGE_MAX_EDGE,
    }).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
    const bytes = await new File(saved.uri).bytes();
    const b64 = base64FromBytes(bytes);
    return b64 ? `data:image/jpeg;base64,${b64}` : null;
  } catch {
    return null;
  }
}

/** Single-shot chat completion; returns reply text or null. Never throws. */
export async function cloudChat(cfg: CloudAiConfig, args: ChatArgs): Promise<string | null> {
  if (!cloudReady(cfg)) return null;
  try {
    const content: Record<string, unknown>[] = [];
    if (cfg.photos && args.images?.length) {
      for (const src of args.images.slice(0, 3)) {
        const dataUrl = await toDataUrl(src);
        if (dataUrl) content.push({ type: 'image_url', image_url: { url: dataUrl } });
      }
    }
    content.push({ type: 'text', text: args.user });

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(`${cfg.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key.trim()}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content },
        ],
        ...(args.json ? { response_format: { type: 'json_object' } } : {}),
        max_tokens: args.maxTokens ?? 256,
        temperature: 0.4,
      }),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text ? text : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ helpers

/** Extract the first balanced JSON object from a reply (models love prose). */
export function sliceJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

// Product-page parsing + tag inference — "add by link".
//
// Pure module: no Expo/React imports, so parsing can be tested from Node.
// The app fetches the product page ONCE itself, like a browser. Nothing is
// proxied or uploaded; parsed text, the chosen picture and its pixel analysis
// all stay on device. Everything here is a suggestion — the tag form is always
// user-confirmable (product spec: rules propose, the user confirms).

import { PALETTE, typeOf, suggestSeasons } from './taxonomy';
import type { CategoryId, ColorId, MaterialId, PatternId, SeasonId } from './types';

// ------------------------------------------------------------------ types

export interface ExtractedPage {
  url: string;
  title: string | null;
  /** site/brand label, e.g. "Everlane" or "myntra.com" */
  site: string | null;
  /** product images, ranked best-first, absolute https URLs */
  images: string[];
  /** title + description + keywords, for tag inference */
  text: string;
}

export interface PixelTags {
  colors: ColorId[];
  pattern: PatternId;
}

export interface AutoTags {
  subtype: string;
  category: CategoryId;
  colors: ColorId[];
  pattern: PatternId;
  material: MaterialId | null;
  warmth: number;
  formality: number;
  seasons: SeasonId[];
}

// ------------------------------------------------------------------ html helpers

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', cent: '¢',
  pound: '£', yen: '¥', euro: '€', copy: '©', reg: '®', trade: '™', hellip: '…',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  eacute: 'é', egrave: 'è', ugrave: 'ù', agrave: 'à', ccedil: 'ç', ouml: 'ö',
  uuml: 'ü', auml: 'ä', oulig: 'œ',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? ' ');
}

export function collapseWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** attributes of one tag, both double- and single-quoted */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([:a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(tag))) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  }
  return out;
}

/** minimal URL absolutizer (Hermes has no WHATWG URL) */
export function absolutizeUrl(u: string, base: string): string | null {
  u = u.trim();
  if (!u || u.startsWith('data:')) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  const root = base.match(/^(https?:\/\/[^/?#]+)/i);
  if (!root) return null;
  if (u.startsWith('/')) return root[1] + u;
  const dir = base.match(/^(https?:\/\/.+\/)/i);
  return (dir?.[1] ?? root[1] + '/') + u;
}

/** upgrade small CDN size params so we fetch the best available quality */
export function normalizeImageUrl(u: string): string {
  if (!/^https?:/i.test(u)) return u;
  return u.replace(/([?&](?:w|width)=)(\d{2,4})/i, (m, p1, num) => (parseInt(num, 10) < 900 ? p1 + '1200' : m));
}

// ------------------------------------------------------------------ image candidates

const IMG_JUNK = /(?:sprite|logo|favicon|icon|glyph|placeholder|blank|spinner|loading|banner|avatar|badge|pixel|tracking|1x1|transparent|analytics|captcha|payment|arrow|chevron|breadcrumb|currency|hamburger|close|cart|search|wishlist|facebook|twitter|pinterest|instagram|whatsapp|share|rating|review|flag|play|video-poster)/i;

/** best-effort image size hint from the URL itself (0 = unknown) */
export function sizeHintOf(u: string): number {
  let best = 0;
  const clamp = (n: number) => (n >= 100 && n <= 4000 ? n : 0);
  let m = /[/_.-](\d{2,4})[x×_/-](\d{2,4})(?:[/?._-]|$)/i.exec(u);
  if (m) best = Math.max(best, Math.max(parseInt(m[1], 10), parseInt(m[2], 10)));
  m = /[?&](?:w|width|wid)[=](\d{2,4})/i.exec(u);
  if (m) best = Math.max(best, parseInt(m[1], 10));
  m = /\/(?:w_|w-|width\/)(\d{2,4})[/]/i.exec(u);
  if (m) best = Math.max(best, parseInt(m[1], 10));
  m = /[/_.-](\d{3,4})(?:\.(?:jpe?g|png|webp))/i.exec(u);
  if (m) best = Math.max(best, parseInt(m[1], 10));
  return clamp(best);
}

function pushCandidate(list: string[], seen: Map<string, number>, url: string, score: number): void {
  if (!url || !/^https?:\/\//i.test(url)) return;
  if (/\.(?:svg|gif)(?:[?#]|$)/i.test(url)) return;
  if (IMG_JUNK.test(url)) return;
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (!path || path.length < 8) return;
  const prev = seen.get(path);
  if (prev !== undefined && prev >= score) return;
  seen.set(path, score);
  list.push(url);
}

/**
 * Parse a product page's HTML: title, brand/site, ranked product images,
 * and a concatenated text blob. Pure and Node-testable.
 */
export function parseProductHtml(html: string, pageUrl: string): ExtractedPage {
  let title: string | null = null;
  let brand: string | null = null;
  let siteName: string | null = null;
  const desc: string[] = [];
  const keywords: string[] = [];
  const meta: string[] = []; // editorially picked images: JSON-LD + og/twitter
  const wildcard: string[] = []; // <img>/<source> candidates
  const seen = new Map<string, number>();
  let metaSeq = 0;

  // --- JSON-LD product nodes
  const scriptRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let s: RegExpExecArray | null;
  while ((s = scriptRe.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(s[1].trim());
    } catch {
      continue;
    }
    const nodes: Record<string, unknown>[] = [];
    const queue: unknown[] = [parsed];
    while (queue.length && nodes.length < 60) {
      const cur = queue.shift();
      if (Array.isArray(cur)) {
        queue.push(...cur);
        continue;
      }
      if (!(cur && typeof cur === 'object')) continue;
      const obj = cur as Record<string, unknown>;
      nodes.push(obj);
      if (obj['@graph']) queue.push(obj['@graph']);
      if (obj['mainEntity']) queue.push(obj['mainEntity']);
    }
    const isProduct = (n: any) => {
      const tt = String(n['@type'] ?? '');
      return /product|clothing|shoe|wear/i.test(tt) && !/website|breadcrumb|listitem/i.test(tt);
    };
    for (const n of nodes) {
      if (!isProduct(n)) continue;
      const name = typeof n.name === 'string' ? n.name : null;
      if (name && !title) title = decodeEntities(collapseWs(name));
      const b = n.brand;
      if (typeof b === 'string') brand = b;
      else if (b && typeof (b as Record<string, unknown>).name === 'string') {
        brand = String((b as Record<string, unknown>).name);
      }
      if (typeof n.description === 'string') desc.push(n.description);
      if (typeof n.keywords === 'string') keywords.push(n.keywords);
      if (typeof n.sku === 'string') keywords.push(n.sku);
      const imgs = n.image ?? n.imageUrl ?? n.images;
      if (typeof imgs === 'string') meta.push(imgs);
      else if (Array.isArray(imgs)) {
        for (const im of imgs) {
          if (typeof im === 'string') meta.push(im);
          else if (im && typeof (im as Record<string, unknown>).url === 'string') {
            meta.push(String((im as Record<string, unknown>).url));
          }
        }
      }
    }
  }

  // --- meta tags (handle arbitrary attribute order)
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attrsOf(tag);
    const key = a.property ?? a.name ?? a.itemprop ?? '';
    const val = a.content ?? '';
    if (!key || !val) continue;
    const k = key.toLowerCase();
    const v = decodeEntities(val.trim());
    if (k === 'og:title' || k === 'twitter:title') title = title ?? v;
    else if (k === 'og:site_name') siteName = v;
    else if (k === 'og:description' || k === 'description' || k === 'twitter:description') desc.push(v);
    else if (k === 'keywords') keywords.push(v);
    else if (k === 'og:image' || k === 'og:image:secure_url' || k === 'twitter:image' || k === 'twitter:image:src' || k === 'image') {
      metaSeq += 1;
      const abs = absolutizeUrl(v, pageUrl) ?? '';
      pushCandidate(meta, seen, normalizeImageUrl(abs), 550 - metaSeq);
    }
  }

  if (!title) {
    const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
    if (tm) title = decodeEntities(collapseWs(tm[1]));
  }
  // strip common site suffixes: "… | Brand", "… – Brand", "… - Brand"
  if (title) {
    const parts = title.split(/\s+[|–-]\s+/);
    if (parts.length > 1 && parts[0].length >= 8) title = parts[0];
  }

  // --- <img> and <source> tags
  for (const tag of html.match(/<(?:img|source)\b[^>]*>/gi) ?? []) {
    const a = attrsOf(tag);
    let src = a.src || a['data-src'] || a['data-original'] || a['data-lazy-src'] || a['data-image'] || '';
    src = decodeEntities(src);
    const srcset = decodeEntities(a.srcset || a['data-srcset'] || '');
    if (srcset) {
      // pick the largest descriptor candidate
      let bestUrl = '';
      let bestW = 0;
      for (const part of srcset.split(',')) {
        const bits = part.trim().split(/\s+/);
        const u = bits[0];
        if (!u) continue;
        const dm = bits[1] && /^(\d+)w$/i.test(bits[1]) ? parseInt(bits[1], 10) : 800;
        if (dm > bestW) {
          bestW = dm;
          bestUrl = u;
        }
      }
      if (bestUrl) src = bestUrl;
    }
    const abs = absolutizeUrl(src, pageUrl);
    if (!abs) continue;
    const norm = normalizeImageUrl(abs);
    const hint = sizeHintOf(norm);
    const score = hint >= 300 ? 100 + hint / 20 : hint > 0 ? 40 : 12;
    pushCandidate(wildcard, seen, norm, score);
  }

  // --- assemble ranked list: meta picks first, then big-document images.
  // Final choke point: entity-decode, absolutize, normalize size params, dedupe
  // scheme-insensitively (JSON-LD often lists http:// and https:// twins).
  const ranked: string[] = [];
  const used = new Set<string>();
  for (const group of [meta, wildcard]) {
    for (const u of group) {
      const abs = absolutizeUrl(decodeEntities(u), pageUrl);
      if (!abs) continue;
      const norm = normalizeImageUrl(abs);
      const key = norm.split(/[?#]/)[0].toLowerCase().replace(/^https?:\/\//, '');
      if (used.has(key)) continue;
      used.add(key);
      ranked.push(norm);
    }
  }

  const site = brand ? collapseWs(decodeEntities(brand)) : siteName;
  const host = pageUrl.match(/^https?:\/\/(?:www\.)?([^/?#]+)/i)?.[1] ?? null;
  const text = collapseWs(
    [title, site, ...desc.slice(0, 2), ...keywords.slice(0, 4)].filter(Boolean).join(' . ')
  ).toLowerCase();

  return {
    url: pageUrl,
    title,
    site: site ?? host,
    images: ranked.slice(0, 8),
    text,
  };
}

// ------------------------------------------------------------------ text → tags

type Hint = [target: string, words: string[]];

const TYPE_HINTS: Hint[] = [
  ['winter-coat', ['winter coat', 'padded coat', 'warm coat']],
  ['puffer', ['puffer', 'padded jacket', 'quilted jacket', 'padded parka']],
  ['raincoat', ['raincoat', 'rain jacket', 'rain coat', 'shell jacket', 'windbreaker', 'hardshell']],
  ['overcoat', ['overcoat', 'topcoat', 'peacoat', 'top coat']],
  ['trench', ['trench']],
  ['blazer', ['blazer', 'suit jacket', 'sport coat', ' sportcoat']],
  ['bomber', ['bomber']],
  ['denim-jacket', ['denim jacket', 'jean jacket', 'trucker jacket']],
  ['shirt-jacket', ['shirt jacket', 'shacket', 'overshirt']],
  ['chelsea-boots', ['chelsea boot']],
  ['dress-shoes', ['dress shoe', 'oxford', 'derby shoe', 'brogue', 'wingtip']],
  ['running-shoes', ['running shoe', 'running shoes', 'trainer', 'sneaker', 'walking shoe', 'gym shoe', 'sport shoe', 'tennis shoe']],
  ['slides', ['slide sandal', 'pool slide', 'flip flop', 'flip-flop', 'slides', 'thong sandal', 'chappal']],
  ['sandals', ['sandal', 'espadrille']],
  ['heels', ['heel sandal', 'pumps', 'stiletto', 'block heel', 'kitten heel', 'wedge heel', 'heels']],
  ['flats', ['ballet flat', 'ballerina', 'bifold flat']],
  ['loafers', ['loafer', 'moccasin', 'boat shoe', 'saddle shoe']],
  ['boots', ['boot']],
  ['sneakers', ['canvas shoe', 'low top', 'high top', 'retro sneaker']],
  ['hoodie', ['hoodie', 'hooded sweatshirt', 'hoodie sweatshirt', 'zip-up hoodie', 'hoodie zip']],
  ['cardigan', ['cardigan']],
  ['sweatshirt', ['sweatshirt', 'crewneck', 'crew neck', 'pullover sweat', 'raglan']],
  ['vest', ['sweater vest', 'sleeveless knit', 'vest knit', 'knit vest', 'sleeveless sweater']],
  ['tank', ['tank', 'camisole', 'cami', 'spaghetti strap', 'sleeveless top', 'strappy']],
  ['crop', ['crop top', 'cropped', 'boobtube', 'boob tube']],
  ['polo', ['polo']],
  ['blouse', ['blouse', 'peplum', 'ruffle top']],
  ['tshirt', ['t-shirt', 'tshirt', 'tee']],
  ['shirt', ['shirt', 'button-down', 'button up', 'poplin', 'flannel shirt', 'oxford']],
  ['evening-dress', ['evening dress', 'evening gown', 'gown', 'cocktail dress', 'party dress', 'slip dress']],
  ['knit-dress', ['knit dress', 'sweater dress', 'knitted dress']],
  ['midi-dress', ['midi', 'hem mid']],
  ['day-dress', ['maxi dress', 'wrap dress', 'shirt dress', 'sundress', 'day dress', 'a-line dress', 'skater dress', 'bodycon', 'shift dress', 'kaftan', 'caftan', 'dress', 'frock']],
  ['jeans', ['jeans', 'denim bottoms', 'skinny jean']],
  ['chinos', ['chino']],
  ['trousers', ['trouser', 'dress pants', 'formal pants', 'pleated pants', 'slacks', 'palazzo', 'tailored pants']],
  ['shorts', ['shorts', 'bermuda', 'cargo short', 'denim short']],
  ['skirt', ['skirt', 'midi skirt', 'mini skirt', 'pleated skirt', 'tile skirt', 'skort']],
  ['joggers', ['jogger', 'sweatpant', 'sweat pants', 'sweat pant', 'track pant', 'lazy pant', 'cozy pants']],
  ['cargos', ['cargo']],
  ['linen-pants', ['linen trouser', 'linen pant', 'linen shorts', 'linen drawstring']],
  ['bag', ['tote', 'handbag', 'crossbody', 'shoulder bag', 'backpack', 'clutch', 'sling bag', 'tote bag', 'satchel', 'hobo bag', 'belt bag', 'bucket bag', 'messenger bag', 'bag']],
  ['belt', ['belt']],
  ['beanie', ['beanie', 'toque', 'wool hat', 'knitted hat', 'cuffed hat']],
  ['cap', ['baseball cap', 'snapback', 'dad cap', 'trucker cap', 'cap']],
  ['hat', ['sun hat', 'fedora', 'bucket hat', 'straw hat', 'panama hat', 'wide brim', 'hat']],
  ['scarf', ['scarf', 'muffler', 'shawl', 'stole', 'bandana', 'neckerchief']],
  ['gloves', ['glove', 'mitten']],
  ['watch', ['watch', 'timepiece']],
  ['sunglasses', ['sunglasses', 'sun glasses', 'shades', 'eyewear']],
  ['jewellery', ['jewellery', 'jewelry', 'necklace', 'bracelet', 'earring', 'pendant', 'anklet', 'cufflink', 'brooch', 'ring']],
  ['socks', ['sock']],
];

const MATERIAL_HINTS: Hint[] = [
  ['suede', ['suede']],
  ['leather', ['leather', 'nu-buck', 'nubuck', 'patent leather']],
  ['cashmere', ['cashmere', 'pashmina']],
  ['silk', ['silk', 'satin', 'mulberry', 'tencel', 'cupro']],
  ['linen', ['linen']],
  ['denim', ['denim', 'raw denim', 'stonewashed']],
  ['wool', ['wool', 'merino', 'tweed', 'alpaca', 'angora', 'felted']],
  ['fleece', ['fleece', 'sherpa', 'teddy fabric', 'polar fleece', 'sherpa lining']],
  ['knit', ['knit', 'knitted', 'crochet', 'ribbed knit', 'cable-knit', 'chunky knit']],
  ['synthetic', ['polyester', 'nylon', 'viscose', 'rayon', 'elastane', 'spandex', 'lycra', 'acrylic', 'polyamide', 'performance', 'gore-tex', 'goretex', 'recycled poly', 'ripstop', 'modal', 'lyocell', 'cupro', 'semi-sheer']],
  ['cotton', ['cotton', 'organic cotton', 'poplin', 'terry', 'seersucker', 'muslin', 'canvas']],
];

const PATTERN_HINTS: Hint[] = [
  ['striped', ['striped', 'stripe', 'stripes', 'pinstripe', 'breton', 'racing stripe']],
  ['checked', ['checked', 'check', 'checks', 'plaid', 'gingham', 'tartan', 'windowpane', 'argyle', 'psychedelia']],
  ['printed', ['printed', 'print', 'floral', 'flower', 'leopard', 'animal', 'paisley', 'graphic', 'camo', 'camouflage', 'polka', 'toile', 'abstract', 'embroider', 'slogan', 'typography', 'motif', 'mandala']],
];

const COLOR_HINTS: Hint[] = [
  ['white', ['white', 'snow', 'optic white']],
  ['cream', ['cream', 'ivory', 'ecru', 'oat', 'oatmeal', 'bone']],
  ['beige', ['beige', 'taupe', 'sand', 'almond', 'wheat', 'pumice']],
  ['tan', ['tan', 'camel', 'caramel', 'toffee']],
  ['brown', ['brown', 'chocolate', 'mocha', 'coffee', 'chestnut', 'walnut', 'cognac', 'tobacco', 'cocoa']],
  ['grey', ['grey', 'gray', 'charcoal', 'ash', 'carbon', 'silver', 'slate', 'storm', 'pewter']],
  ['black', ['black', 'noir', 'onyx', 'obsidian']],
  ['navy', ['navy', 'indigo', 'midnight', 'marine']],
  ['blue', ['blue', 'cobalt', 'azure', 'royal', 'cornflower', 'denim blue', 'sky']],
  ['denim', ['denim', 'washed blue', 'stone wash']],
  ['teal', ['teal', 'turquoise', 'aqua', 'cerulean']],
  ['green', ['green', 'emerald', 'forest', 'sage', 'mint', 'marine green', 'bottle green', 'sea green']],
  ['olive', ['olive', 'khaki', 'army', 'military green', 'moss', 'avocado']],
  ['red', ['red', 'burgundy', 'maroon', 'wine', 'oxblood', 'cherry', 'crimson', 'scarlet']],
  ['orange', ['orange', 'rust', 'terracotta', 'peach', 'coral', 'salmon', 'tangerine', 'ginger']],
  ['yellow', ['yellow', 'mustard', 'lemon', 'ochre', 'saffron', 'butter']],
  ['pink', ['pink', 'blush', 'rose', 'fuchsia', 'mauve', 'ballet']],
  ['purple', ['purple', 'lavender', 'violet', 'lilac', 'plum', 'aubergine', 'magenta']],
];

/** single-word hints match on word boundary; multi-word via substring */
function matchHint(text: string, hints: Hint[]): string | null {
  let best: { target: string; at: number } | null = null;
  for (const [target, words] of hints) {
    for (const w of words) {
      let idx: number;
      if (w.includes(' ') || w.includes('-')) {
        idx = text.indexOf(w);
      } else {
        const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = new RegExp(`(?:^|[^a-z])${escaped}(?:s|es)?(?:$|[^a-z])`, 'i').exec(text);
        idx = m ? m.index : -1;
      }
      if (idx < 0) continue;
      if (!best || idx < best.at) best = { target, at: idx };
      break; // hint lists are ordered: first matching word per target wins
    }
  }
  return best?.target ?? null;
}

export interface TextTags {
  subtype: string | null;
  material: MaterialId | null;
  pattern: PatternId | null;
  colors: ColorId[];
  formalNudge: number; // -1, 0 or +1
}

/** Infer tags from the page's own text (title, description, keywords). */
export function inferFromText(text: string): TextTags {
  const subtypeRaw = matchHint(text, TYPE_HINTS);
  const materialRaw = matchHint(text, MATERIAL_HINTS);
  const patternRaw = matchHint(text, PATTERN_HINTS);

  const colors: ColorId[] = [];
  for (const [target, words] of COLOR_HINTS) {
    if (colors.length >= 3) break;
    for (const w of words) {
      const re = new RegExp(`(?:^|[^a-z])${w}(?:$|[^a-z])`, 'i');
      if (re.test(text)) {
        colors.push(target as ColorId);
        break;
      }
    }
  }

  let formalNudge = 0;
  const formalWords = ['formal', 'office', 'workwear', 'tailored', 'business', 'sartorial', 'dressy', 'evening wear'];
  const casualWords = ['casual', 'lounge', 'loungewear', 'homewear', 'athleisure', 'activewear', 'everyday', 'relaxed fit', 'sports'];
  for (const w of formalWords) if (text.includes(w)) { formalNudge = 1; break; }
  for (const w of casualWords) if (text.includes(w)) { formalNudge = -1; break; }

  return {
    subtype: subtypeRaw,
    material: (materialRaw as MaterialId | null) ?? null,
    pattern: (patternRaw as PatternId | null) ?? null,
    colors,
    formalNudge,
  };
}

// ------------------------------------------------------------------ pixel analysis

/** pixel bucket compression */
const F = 0.3, G = 0.59; // luminance weights; B = 0.11
function wdist2(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return F * dr * dr + G * dg * dg + 0.11 * db * db;
}

function nearestColorId(r: number, g: number, b: number): ColorId {
  let bestId: ColorId = 'grey';
  let best = Infinity;
  for (const p of PALETTE) {
    const pr = parseInt(p.hex.slice(1, 3), 16);
    const pg = parseInt(p.hex.slice(3, 5), 16);
    const pb = parseInt(p.hex.slice(5, 7), 16);
    let d = wdist2(r, g, b, pr, pg, pb);
    if (p.id === 'denim') d += 900; // denim photo hue ≈ grey/navy — prefer those unless clearly denim
    if (d < best) {
      best = d;
      bestId = p.id;
    }
  }
  return bestId;
}

/**
 * Analyze decoded RGBA pixels of an (already small) garment photo:
 * dominant colors with background suppression + rough pattern guess.
 * Pure and Node-testable.
 */
export function analyzePixels(data: Uint8Array, width: number, height: number): PixelTags {
  const total = width * height;
  if (total < 16 || data.length < total * 4) return { colors: [], pattern: 'solid' };

  // Background = dominant color of the border ring (product shots keep the
  // background at the edges even for heavily-patterned garments).
  const RING = 2;
  const BUCKETS = 4096;
  const ringCounts = new Array<number>(BUCKETS).fill(0);
  const ringSums = new Float64Array(BUCKETS * 3);
  const ringPixel = (x: number, y: number) => {
    const i = y * width + x;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    ringCounts[key]++;
    ringSums[key * 3] += r;
    ringSums[key * 3 + 1] += g;
    ringSums[key * 3 + 2] += b;
  };
  for (let x = 0; x < width; x++) {
    for (let dy = 0; dy < RING; dy++) {
      ringPixel(x, dy);
      ringPixel(x, height - 1 - dy);
    }
  }
  for (let y = 0; y < height; y++) {
    for (let dx = 0; dx < RING; dx++) {
      ringPixel(dx, y);
      ringPixel(width - 1 - dx, y);
    }
  }
  let bgKey = 0;
  for (let k = 1; k < BUCKETS; k++) {
    if (ringCounts[k] > ringCounts[bgKey]) {
      bgKey = k;
    } else if (ringCounts[k] > 0 && ringCounts[k] === ringCounts[bgKey]) {
      // tie → prefer the lighter bucket (backgrounds are typically light)
      const la = ringSums[bgKey * 3] * F + ringSums[bgKey * 3 + 1] * G + ringSums[bgKey * 3 + 2] * 0.11;
      const lb = ringSums[k * 3] * F + ringSums[k * 3 + 1] * G + ringSums[k * 3 + 2] * 0.11;
      if (lb / ringCounts[k] > la / ringCounts[bgKey]) bgKey = k;
    }
  }
  if (ringCounts[bgKey] === 0) return { colors: [], pattern: 'solid' };
  const bgR = ringSums[bgKey * 3] / ringCounts[bgKey];
  const bgG = ringSums[bgKey * 3 + 1] / ringCounts[bgKey];
  const bgB = ringSums[bgKey * 3 + 2] / ringCounts[bgKey];

  // use the dominant pixel color as background estimate; foreground = pixels
  // far enough from it, within inner 90% to shrink edge artifacts
  const inset = Math.max(0, Math.floor(Math.min(width, height) * 0.05));
  const counts = new Array<number>(BUCKETS).fill(0);
  const sums = new Float64Array(BUCKETS * 3);
  let fgCount = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const threshold = attempt === 0 ? 1800 : 900;
    counts.fill(0);
    sums.fill(0);
    fgCount = 0;
    for (let y = inset; y < height - inset; y++) {
      for (let x = inset; x < width - inset; x++) {
        const i = y * width + x;
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        if (wdist2(r, g, b, bgR, bgG, bgB) < threshold) continue;
        fgCount++;
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        counts[key]++;
        sums[key * 3] += r;
        sums[key * 3 + 1] += g;
        sums[key * 3 + 2] += b;
      }
    }
    if (fgCount >= Math.max(24, total * 0.05)) break;
    // second pass simply accepts a looser background match; garment ≈ bg color
    // is a degenerate case we can't fix cheaply — colors stay empty then.
  }

  if (fgCount < 12) return { colors: [], pattern: 'solid' };

  // dominant foreground clusters
  const order: number[] = [];
  for (let k = 0; k < BUCKETS; k++) if (counts[k] > 0) order.push(k);
  order.sort((a, b) => counts[b] - counts[a]);
  const clusters: { r: number; g: number; b: number; i: number }[] = [];
  for (const k of order) {
    const c = { r: sums[k * 3] / counts[k], g: sums[k * 3 + 1] / counts[k], b: sums[k * 3 + 2] / counts[k], i: counts[k] };
    let near = false;
    for (const chosen of clusters) {
      if (wdist2(c.r, c.g, c.b, chosen.r, chosen.g, chosen.b) < 1400) {
        near = true;
        break;
      }
    }
    if (!near) clusters.push(c);
    if (clusters.length >= 3) break;
  }
  const c0 = clusters[0];
  const c1 = clusters[1];
  const c2 = clusters[2];
  const topShare = (c0?.i ?? 0) / fgCount;

  // stripe guess: do dominant color A and B alternate in row-bands?
  let striped = false;
  if (c1 && c1.i / fgCount >= 0.12) {
    let runs = 0;
    let lastType = '';
    for (let y = 0; y < height; y++) {
      let n0 = 0, n1 = 0, nf = 0;
      for (let x = inset; x < width - inset; x++) {
        const i = y * width + x;
        const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
        if (wdist2(r, g, b, bgR, bgG, bgB) < 1800) continue;
        nf++;
        if (wdist2(r, g, b, c0.r, c0.g, c0.b) < wdist2(r, g, b, c1.r, c1.g, c1.b)) n0++;
        else n1++;
      }
      if (!nf) continue;
      const type = n0 >= n1 ? 'a' : 'b';
      if (type !== lastType) {
        runs++;
        lastType = type;
      }
    }
    striped = runs >= 4;
  }

  const pattern: PatternId = striped
    ? 'striped'
    : topShare < 0.55 || (c2 && c2.i / fgCount >= 0.12)
      ? 'printed'
      : 'solid';

  const colors: ColorId[] = [nearestColorId(c0.r, c0.g, c0.b)];
  if (c1 && c1.i / fgCount >= 0.12) colors.push(nearestColorId(c1.r, c1.g, c1.b));
  if (c2 && c2.i / fgCount >= 0.12) colors.push(nearestColorId(c2.r, c2.g, c2.b));

  return { colors, pattern };
}

// ------------------------------------------------------------------ merge: text + pixels → draft fields

/**
 * Combine text inference and pixel analysis into tag defaults.
 * Text wins where present; pixels fill in colors and pattern shape;
 * type defaults carry warmth/formality/seasons.
 */
export function autoTagsFromProduct(page: ExtractedPage, pixel: PixelTags | null): AutoTags {
  const t = inferFromText(page.text);
  const subtypeId = t.subtype ?? 'tshirt';
  const ty = typeOf(subtypeId);
  const material = t.material;

  let warmth = ty.warmth;
  if (material && ['fleece', 'suede', 'leather', 'wool', 'cashmere'].includes(material)) {
    warmth = Math.min(5, warmth + 1);
  }
  if (material && ['silk', 'linen'].includes(material)) {
    warmth = Math.max(1, warmth - 1);
  }
  let formality = ty.formality + t.formalNudge;
  if (material === 'leather' || material === 'silk' || material === 'suede') formality = Math.max(ty.formality, 2);
  formality = Math.max(0, Math.min(4, formality));

  const colors: ColorId[] = [...t.colors];
  for (const c of pixel?.colors ?? []) {
    if (colors.length >= 3) break;
    if (!colors.includes(c)) colors.push(c);
  }

  return {
    subtype: subtypeId,
    category: ty.category,
    colors,
    pattern: t.pattern ?? pixel?.pattern ?? 'solid',
    material,
    warmth,
    formality,
    seasons: suggestSeasons(warmth, material),
  };
}

/** Flatten an ExtractedPage's images for a picker: caller decides on emptiness. */
export function topImages(page: ExtractedPage, n: number): string[] {
  return page.images.slice(0, n);
}

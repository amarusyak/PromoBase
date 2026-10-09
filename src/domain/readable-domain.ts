/**
 * Merchant domains are stored in the ASCII form browsers report, in which an
 * international name looks like "xn--mnchen-3ya.de". This turns such a name
 * back into the spelling a person recognises ("münchen.de"), for display and
 * search only. The stored form stays the one that is compared with visits.
 *
 * The decoding is Punycode as defined in RFC 3492. Browsers offer the
 * opposite direction through the URL parser, but not this one.
 */

const BASE = 36;
const T_MIN = 1;
const T_MAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_CODE_POINT = 128;
const HIGHEST_CODE_POINT = 0x10ffff;
const PREFIX = 'xn--';

/** The value of one Punycode digit: a to z are 0 to 25, 0 to 9 are 26 to 35. */
function digitValue(char: string): number | undefined {
  const code = char.charCodeAt(0);
  if (code >= 97 && code <= 122) return code - 97;
  if (code >= 48 && code <= 57) return code - 22;
  return undefined;
}

function adapt(delta: number, length: number, first: boolean): number {
  let rest = first ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  rest += Math.floor(rest / length);
  let k = 0;
  while (rest > Math.floor(((BASE - T_MIN) * T_MAX) / 2)) {
    rest = Math.floor(rest / (BASE - T_MIN));
    k += BASE;
  }
  return k + Math.floor(((BASE - T_MIN + 1) * rest) / (rest + SKEW));
}

/** Decodes the part of a label after "xn--". Undefined when it is not valid Punycode. */
function decodeLabel(encoded: string): string | undefined {
  const lastDash = encoded.lastIndexOf('-');
  const output: number[] = [];
  for (const char of encoded.slice(0, Math.max(lastDash, 0))) {
    output.push(char.charCodeAt(0));
  }

  let position = lastDash < 0 ? 0 : lastDash + 1;
  let codePoint = INITIAL_CODE_POINT;
  let index = 0;
  let bias = INITIAL_BIAS;

  while (position < encoded.length) {
    const previousIndex = index;
    let weight = 1;
    for (let k = BASE; ; k += BASE) {
      const digit = digitValue(encoded.charAt(position));
      position += 1;
      // Also covers running off the end of the text: charAt gives "" there.
      if (digit === undefined) return undefined;
      index += digit * weight;
      if (index > Number.MAX_SAFE_INTEGER) return undefined;
      const threshold = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias;
      if (digit < threshold) break;
      weight *= BASE - threshold;
    }
    const length = output.length + 1;
    bias = adapt(index - previousIndex, length, previousIndex === 0);
    codePoint += Math.floor(index / length);
    if (codePoint > HIGHEST_CODE_POINT) return undefined;
    index %= length;
    output.splice(index, 0, codePoint);
    index += 1;
  }

  return output.length === 0 ? undefined : String.fromCodePoint(...output);
}

/**
 * The spelling of a stored merchant domain that a person recognises. Labels
 * that are not encoded, or cannot be decoded, come back as they are.
 */
export function readableDomain(domain: string): string {
  return domain
    .split('.')
    .map((label) =>
      label.startsWith(PREFIX) ? (decodeLabel(label.slice(PREFIX.length)) ?? label) : label,
    )
    .join('.');
}

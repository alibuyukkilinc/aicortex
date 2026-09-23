import { randomBytes, createHash } from "node:crypto";

// Turkish-aware folding so "kullanici" matches "Kullanıcı" in keyword search.
// FTS5's remove_diacritics handles most accents, but not ı/İ, so we fold before indexing and querying.
const FOLD: Record<string, string> = {
  ı: "i",
  İ: "i",
  I: "i",
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ç: "c",
  Ç: "c",
  ö: "o",
  Ö: "o",
  ü: "u",
  Ü: "u",
};

export function fold(text: string): string {
  return text
    .replace(/[ıİIşŞğĞçÇöÖüÜ]/g, (c) => FOLD[c] ?? c)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Rough token estimate (~4 chars per token). Good enough for budgeting responses.
export function estimateTokens(value: unknown): number {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(s.length / 4);
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// ULID: time-sortable, collision-safe ids so parallel writers never clash in git.
export function ulid(now = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  const bytes = randomBytes(16);
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i] % 32];
  return time + rand;
}

export function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 8);
}

export function nowIso(): string {
  return new Date().toISOString();
}

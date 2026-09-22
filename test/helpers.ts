import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cortex } from "../src/core/cortex.js";
import { initProject } from "../src/core/init.js";
import { loadProject } from "../src/core/project.js";
import { Embedder } from "../src/search/embedder.js";

// Semantic search is off unless a test passes an embedder, so results never depend on this machine's setup.
export function tempProject(name = "demo", opts: { embedder?: (() => Embedder) | null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "cortex-test-"));
  const init = initProject(root, name, { language: "en" }); // fixed, so tests do not depend on this machine's locale
  const cortex = new Cortex(loadProject(root), { embedder: opts.embedder ?? null });
  const human = cortex.actor("owner");
  const ai = cortex.actor("ai-agent");
  return {
    root,
    init,
    cortex,
    human,
    ai,
    cleanup() {
      cortex.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// A tiny deterministic "model": words map to concepts, so synonyms across languages land near each other
// without downloading anything. Enough to test ranking, fusion, filters and incremental indexing.
const CONCEPTS: string[][] = [
  ["odeme", "ödeme", "payment", "iyzico", "kart", "checkout", "tahsilat"],
  ["yavas", "yavaş", "slow", "performans", "performance", "lazy", "hizli", "hızlı", "gecikme"],
  ["sifre", "şifre", "password", "secret", "gizli", "vault", "anahtar"],
  ["deploy", "yayin", "yayın", "release", "sunucu", "server", "ci"],
  ["siparis", "sipariş", "order", "onay", "confirm", "iki", "twice", "double"],
];

export class FakeEmbedder implements Embedder {
  readonly model = "fake-concepts-v1";
  calls = 0;
  embedded = 0;

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls++;
    this.embedded += texts.length;
    const HASHED = 64;
    return texts.map((text) => {
      const v = new Float32Array(CONCEPTS.length + HASHED);
      const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
      for (const w of words) {
        const concept = CONCEPTS.findIndex((c) => c.some((x) => w.startsWith(x)));
        if (concept >= 0) v[concept] += 1;
        else {
          // Unknown words scatter into hashed dimensions, so unrelated texts end up far apart.
          let h = 0;
          for (const ch of w) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
          v[CONCEPTS.length + (h % HASHED)] += 0.3;
        }
      }
      const n = Math.hypot(...v) || 1;
      return v.map((x) => x / n);
    });
  }
}

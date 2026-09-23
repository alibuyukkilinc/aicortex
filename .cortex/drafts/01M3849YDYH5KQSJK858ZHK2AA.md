---
kind: node
target: server
proposed_by: ai-agent
reason: "S7-S8-S11: smoke kabuksuz, lint/format, yayın iş akışı ve 0.2.0 hazırlığı."
base_rev: c0d262b1
id: 01M3849YDYH5KQSJK858ZHK2AA
proposed_at: 2026-09-23T21:56:16.446Z
data:
  path: server
  title: Çalıştırma, derleme ve yayın
  summary: "Tek proje yerelde çalışır: `aicortex start` 127.0.0.1:4747. Derleme =
    tsc + vite, çıktı dist/. CI: 3 işletim sistemi × Node 22.16 ve 24, lint bir
    ayakta. Yayın: v*.*.* etiketi CI'ı çalıştırıp npm'e provenance ile yükler.
    0.2.0 hazır, henüz yayınlanmadı."
  links:
    code:
      - file: package.json
      - file: tsconfig.json
      - file: vite.config.ts
      - file: .github/workflows/ci.yml
      - file: .github/workflows/release.yml
      - file: scripts/smoke.mjs
      - file: scripts/release-notes.mjs
  verified_at_commit: 2a12ac4
  id: 01M34Q1CBEMJA6S58G199HVFBQ
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:56:16.439Z
---

- Node 22.16 veya üstü gerekir (node:sqlite'ın FTS5'li ilk sürümü). Veritabanı sunucusu, Docker veya API anahtarı gerekmez.
- `npm run build`, `npm test` (node:test, tsx ile), `npm run typecheck` (sunucu ve web), `npm run lint` (oxlint, tip bilgili, uyarı da hata), `npm run format:check` (Prettier).
- `npm run dev -- start` API'yi kaynaktan çalıştırır, panonun son build'ini sunar. `aicortex --version` sürümü yazar.
- Paket adı `aicortex`; komut `aicortex` ve kısa adıyla `cortex` olarak gelir. Pakette yalnızca `dist` (kaynak haritaları hariç) ve `CHANGELOG.md`: 61 dosya, 540 KB.
- CI (`.github/workflows/ci.yml`): her push ve PR'da tip kontrolü, testler, derleme ve `npm run smoke`; lint ve biçim yalnızca ubuntu/Node 24 ayağında. `workflow_call` ile yayın iş akışından da çağrılır. Uzak depo henüz yok; GitHub'a gönderilince çalışır.
- Yayın (`.github/workflows/release.yml`): `v*.*.*` etiketi → tüm CI matrisi → etiket package.json sürümüyle aynı mı → `npm publish --provenance` (`NPM_TOKEN` gizli değişkeni) → GitHub sürümü, notları `scripts/release-notes.mjs` CHANGELOG'dan çıkarır. `prepublishOnly` typecheck, lint, test, build ve smoke'u yeniden çalıştırır.
- Yayından önce eksik: package.json'da `repository`/`bugs`/`homepage` (provenance `repository.url`'yi denetler, gerçek adres olmalı).
- `npm run smoke` (`scripts/smoke.mjs`): paketi `npm pack` ile paketler (kaynak haritası sızarsa hata), boş klasöre kurar, `aicortex init` ve `start` çalıştırır, API/brief/pano cevabını kontrol eder ve süreyi ölçer (sınır 120 s, yerelde ~15-20 s). npm'i kabuksuz, argüman listesiyle çağırır.

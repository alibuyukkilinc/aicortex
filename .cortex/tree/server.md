---
title: Çalıştırma, derleme ve yayın
summary: "Tek proje yerelde çalışır: `cortexboard start` 127.0.0.1:4747. Derleme
  = tsc + vite, çıktı dist/. CI: 3 işletim sistemi × Node 22.16 ve 24, lint bir
  ayakta. Yayın: v*.*.* etiketi CI'ı çalıştırıp npm'e provenance ile yükler.
  Paket adı `cortexboard`."
links:
  code:
    - file: package.json
    - file: tsconfig.json
    - file: vite.config.ts
    - file: .github/workflows/ci.yml
    - file: .github/workflows/release.yml
    - file: scripts/smoke.mjs
    - file: scripts/release-notes.mjs
verified_at_commit: 0ee05a38f206a18ec39a2854c47b1a9fa4f57476
id: 01M34Q1CBEMJA6S58G199HVFBQ
status: active
updated_by: ai-agent
updated_at: 2026-09-24T07:30:10.734Z
---

- Node 22.16 veya üstü gerekir (node:sqlite'ın FTS5'li ilk sürümü). Veritabanı sunucusu, Docker veya API anahtarı gerekmez.
- `npm run build`, `npm test` (node:test, tsx ile), `npm run typecheck` (sunucu ve web), `npm run lint` (oxlint, tip bilgili, uyarı da hata), `npm run format:check` (Prettier).
- `npm run dev -- start` API'yi kaynaktan çalıştırır, panonun son build'ini sunar. `cortexboard --version` sürümü yazar.
- Paket adı `cortexboard`; komut `cortexboard` ve kısa adıyla `cortex` olarak gelir. Pakette yalnızca `dist` (kaynak haritaları hariç), `CHANGELOG.md` ve `docs`: 64 dosya, 565 KB.
- **Ad neden `cortexboard`:** npm, yeni paket adlarını noktalama işaretlerini atarak karşılaştırır. `aicortex` ile npm'de zaten bulunan `ai-cortex` aynı ada indiği için registry reddediyor; ilk v0.2.0 denemesi bu yüzden hiçbir şey yayınlamadan başarısız oldu. Ad seçilirken `npm view <ad>` 404 vermesi yeterli değil, tireli/noktalı/alt çizgili varyantlarına da bakmak gerekir.
- CI (`.github/workflows/ci.yml`): her push ve PR'da tip kontrolü, testler, derleme ve `npm run smoke`; lint ve biçim yalnızca ubuntu/Node 24 ayağında. `workflow_call` ile yayın iş akışından da çağrılır. Depo: github.com/alibuyukkilinc/aicortex (depo adı eski adında kaldı; provenance package.json'daki `repository.url` ile eşleşmek zorunda olduğu için depo adı değişirse package.json da değişmeli).
- Yayın (`.github/workflows/release.yml`): `v*.*.*` etiketi → tüm CI matrisi → etiket package.json sürümüyle aynı mı → `npm publish --provenance` (`NPM_TOKEN` gizli değişkeni) → GitHub sürümü, notları `scripts/release-notes.mjs` CHANGELOG'dan çıkarır. `prepublishOnly` typecheck, lint, test, build ve smoke'u yeniden çalıştırır.
- İş akışı günlüğünü okumak için GitHub hesabıyla oturum açmak gerekiyor; bu yüzden npm reddederse çıktısı yakalanıp `::error::` anotasyonu olarak basılır. Anotasyonlar koşu sayfasında ve herkese açık checks API'sinde (`/repos/:o/:r/check-runs/:jobId/annotations`) oturumsuz okunabilir.
- `npm run smoke` (`scripts/smoke.mjs`): paketi `npm pack` ile paketler (kaynak haritası sızarsa hata), boş klasöre kurar, `cortexboard init` ve `start` çalıştırır, API/brief/pano cevabını kontrol eder ve süreyi ölçer (sınır 120 s, yerelde ~15-20 s). npm'i kabuksuz, argüman listesiyle çağırır.

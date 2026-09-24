---
kind: node
target: code-structure
proposed_by: ai-agent
reason: "Gözden geçirme: gitProject helpers'a taşındı (S3), lint/biçim
  politikası (S8), sayı ölçme ve CLI alt süreç testleri (S7, S9) eklendi."
base_rev: c5e8e4c0
id: 01M38PT3NJM8KEP7AEZZZRGA59
proposed_at: 2026-09-24T03:19:40.466Z
data:
  path: code-structure
  title: Kod yapısı ve alışkanlıklar
  summary: src/{core,store,index,search,git,api,hub,mcp,util}, web/src, test/. ESM
    TypeScript 7, girdiler zod ile denetlenir, yorumlar 'neden'i anlatır. Lint
    oxlint (tip bilgili), biçim Prettier. Testler gerçek geçici projeler ve
    gerçek git depolarıyla; süre değil sayı ölçülür.
  links:
    code:
      - file: test/helpers.ts
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34Q1CBH9Y1DPA0KSNF0G7D3
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:19:40.452Z
---

- `src/core`: iş mantığı. `src/store`: yalnızca dosya okuma/yazma (ekler dahil). `src/index`: SQLite önbelleği. `src/git`: git çağrıları ve biçim karşılaştırması. `src/hub`: ekip sunucusu. Arayüz katmanlarında mantık olmaz.
- Denetim: zod şemaları servisin yanında (`NodeInput`, `CreateItemInput`, `ActivityInput`); hatalar `CortexError(kod, mesaj, durum, ipucu)`.
- Testler: `test/*.test.ts`, node:test, tsx ile (CI derlemeden önce test eder). `test/helpers.ts`: `tempProject()` gerçek, kurulmuş bir proje açar (dil `en`, saat dilimi `UTC` sabit); `gitProject()` küçük bir kod tabanı ve gerçek commit'lerle bir git deposu açar (eskime hiçbir zaman sahte değil). CLI alt süreç olarak test edilir (`test/cli.test.ts`).
- Süre değil sayı ölç: paylaşımlı CI makinelerinde duvar saati oynar, git çağrısı ya da klasör listeleme sayısı oynamaz (`test/perf.test.ts`; `Git.calls`, `ItemStore.scans`).
- Hata düzeltirken önce testi yaz ve kırmızı gör; commit mesajına ne koruduğunu ve ölçülen önce/sonra sayısını yaz.
- Lint: `npm run lint` = oxlint `--type-aware` (typescript-eslint TypeScript 7'yi desteklemediği için; karar `01M3837TYN730SW3BRBT5YWDAX`), küçük kural seti (`.oxlintrc.json`), uyarı da hata. Biçim: `npm run format:check`, Prettier `printWidth: 160`; `.cortex/` ve Markdown biçimlenmez. Biçim süpürgeleri `.git-blame-ignore-revs`'e yazılır.
- Web: tıklanan ama düğme olamayan her şey `Pressable`/`ListRow` (`web/src/ui.tsx`); etiketler `htmlFor`/`id` ile bağlı.
- Ayrıntılı kurallar ve CI düzeni: `CONTRIBUTING.md`.

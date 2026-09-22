---
title: Cortex
summary: İnsan ve AI için ortak proje beyni. Bilgi ağacı, pano, kararlar,
  sorular ve AI'ın yaptıkları repodaki .cortex/ klasöründe durur ve git ile
  saklanır. Node/TypeScript; REST, MCP ve web pano var. Hiç LLM çağırmaz,
  veritabanı sunucusu gerekmez.
tags:
  - genel-bakis
links:
  code:
    - file: src/core/cortex.ts
    - file: CORTEX_SPEC.md
    - file: README.md
verified_at_commit: bb4ed332003f1825a56abcbfd80c7fb9823d1e8e
id: 01M34Q1CBAV6VRTFKAVCK99EC0
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:45:15.010Z
---

## Ne işe yarar?
Dağınık ve eskiyen `.md` dosyalarının yerine, repoda duran tek bir doğruluk kaynağı koyar (`.cortex/`).
AI bilgiyi **yukarıdan aşağı** okur: önce kısa özet (brief), sonra dal (tree), en son tek düğüm (node). Böylece her şeyi birden yüklemez, token harcamaz.
Kontrol insandadır: AI'ın bilgiye yazdığı her şey önce taslak olur, insan onaylar.

## Ana parçalar
- **Çekirdek** (`src/core`): `Cortex` sınıfı. REST, MCP ve CLI bunun üstünde ince katmanlardır.
- **Depolama** (`src/store`): düz markdown ve YAML dosyaları, aktivite için JSONL. Asıl veri dosyalardır.
- **İndeks** (`src/index`): SQLite (node:sqlite) önbelleği ve kelime araması. Silinse de dosyalardan yeniden kurulur.
- **Anlamla arama** (`src/search`): isteğe bağlı, bilgisayarda çalışan çok dilli model.
- **Eskime tespiti** (`src/git`, `src/core/staleness.ts`): bağlı kod değişince bilgi "eskimiş olabilir" diye işaretlenir.
- **Raporlar** (`src/core/reports.ts`): dosyalardan ve aktivite günlüğünden sayılır.
- **Arayüzler**: REST (`src/api`), MCP (`src/mcp`), CLI (`src/cli.ts`), web pano (`web/`).

## İlkeler (CORTEX_SPEC.md'den)
Token dostu · tek komutla çalışır · git dostu · kontrol insanda · AI'ın yaptıkları şeffaf · API kendi kurallarını anlatır · basit.

## Markdown dosyaları
`CORTEX_SPEC.md` ilk v1 spesifikasyonudur; tarihçedir, güncel tutulmaz. `README.md` kullanıcıya yönelik ürün tanıtımıdır.
Projenin güncel bilgisi bu ağaçtır.

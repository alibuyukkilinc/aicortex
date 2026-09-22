---
title: Cortex
summary: İnsan ve AI için ortak proje beyni. Bilgi ağacı, pano, kararlar,
  sorular ve AI'ın yaptıkları repodaki .cortex/ klasöründe durur. Tek proje için
  yerel çalışır; ekip için bir sunucu (hub) çok projeyi, kişileri, AI ajanlarını
  ve rolleri yönetir. Hiç LLM çağırmaz.
tags:
  - genel-bakis
links:
  code:
    - file: src/core/cortex.ts
    - file: CORTEX_SPEC.md
    - file: README.md
verified_at_commit: 22cc2549d317b2e5d2c6e4dbb92b402671c7213f
id: 01M34Q1CBAV6VRTFKAVCK99EC0
status: active
updated_by: ai-agent
updated_at: 2026-09-22T17:21:53.400Z
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
- **Ekip sunucusu** (`src/hub`): çok proje, e-posta + şifreyle giriş, AI ajanları için token, proje başına rol ve görünürlük.

## İlkeler (CORTEX_SPEC.md'den)
Token dostu · tek komutla çalışır · git dostu · kontrol insanda · AI'ın yaptıkları şeffaf · API kendi kurallarını anlatır · basit.

## Markdown dosyaları
`CORTEX_SPEC.md` ana spesifikasyondur ve kodla uyumlu tutulur (sistemin ne yaptığı). `README.md` kullanıcıya yönelik ürün tanıtımıdır.
Ayrıntılı proje bilgisi (hangi dosya ne yapar, neden böyle karar verdik) bu ağaçtadır. npm paketi: `aicortex`.

---
title: Cortex
summary: İnsan ve AI için ortak proje beyni. Bilgi ağacı, pano, kararlar,
  sorular, ekler ve AI'ın yaptıkları repodaki .cortex/ klasöründe durur. Tek
  proje için yerel çalışır; ekip için bir sunucu (hub) çok projeyi, kişileri, AI
  ajanlarını ve rolleri yönetir. Hiç LLM çağırmaz.
links:
  code:
    - file: src/core/cortex.ts
    - file: CORTEX_SPEC.md
    - file: README.md
verified_at_commit: 0ee05a38f206a18ec39a2854c47b1a9fa4f57476
id: 01M34Q1CBAV6VRTFKAVCK99EC0
status: active
updated_by: ai-agent
updated_at: 2026-09-24T07:30:10.675Z
---

## Ne işe yarar?
Dağınık ve eskiyen `.md` dosyalarının yerine, repoda duran tek bir doğruluk kaynağı koyar (`.cortex/`).
AI bilgiyi **yukarıdan aşağı** okur: önce kısa özet (brief), sonra dal (tree), en son tek düğüm (node). Böylece her şeyi birden yüklemez, token harcamaz.
Kontrol insandadır: AI'ın bilgiye yazdığı her şey önce taslak olur, insan onaylar.

## Ana parçalar
- **Çekirdek** (`src/core`): `Cortex` sınıfı. REST, MCP ve CLI bunun üstünde ince katmanlardır.
- **Depolama** (`src/store`): düz markdown ve YAML dosyaları, aktivite için JSONL, kalem ekleri kalemin klasöründe düz dosya. Asıl veri dosyalardır.
- **İndeks** (`src/index`): SQLite (node:sqlite) önbelleği ve kelime araması. Silinse de dosyalardan yeniden kurulur.
- **Anlamla arama** (`src/search`): isteğe bağlı, bilgisayarda çalışan çok dilli model.
- **Eskime tespiti** (`src/git`, `src/core/staleness.ts`): bağlı kod değişince bilgi derecesiyle (yüksek/orta/biçimsel) işaretlenir; panoda "Eskimiş bilgi" sayfası.
- **Raporlar** (`src/core/reports.ts`): dosyalardan ve aktivite günlüğünden sayılır.
- **Arayüzler**: REST (`src/api`), MCP (`src/mcp`, 20 araç), CLI (`src/cli.ts`), web pano (`web/`, Trello tarzı kartlar).
- **Ekip sunucusu** (`src/hub`): çok proje, e-posta + şifreyle giriş, AI ajanları için token, proje başına rol ve görünürlük.

## İlkeler (CORTEX_SPEC.md'den)
Token dostu · tek komutla çalışır · git dostu · kontrol insanda · AI'ın yaptıkları şeffaf · API kendi kurallarını anlatır · basit.

## Markdown dosyaları
`CORTEX_SPEC.md` ana spesifikasyondur ve kodla uyumlu tutulur (sistemin ne yaptığı; kabul kriterleri 8/9 işaretli). `README.md` kullanıcıya yönelik ürün tanıtımıdır. `CHANGELOG.md` sürüm notları (her girdi ölçülmüş önce/sonra ile), `CONTRIBUTING.md` katkı düzeni ve alışkanlıklar, `SECURITY.md` güvenlik bildirimi.
Ayrıntılı proje bilgisi (hangi dosya ne yapar, neden böyle karar verdik) bu ağaçtadır.

## Yayın
npm paketi: **`cortexboard`**, ilk yayınlanan sürüm 0.2.0 (24 Eylül 2026, provenance imzalı). Kurulum: `npx cortexboard init`, sonra `npx cortexboard start`. Komut kısa adıyla `cortex` olarak da gelir.
Ad neden `aicortex` değil: npm yeni adları noktalama işaretlerini atarak karşılaştırıyor ve npm'de zaten `ai-cortex` var; ayrıntı `server` düğümünde.
Depo: github.com/alibuyukkilinc/aicortex (depo adı eski adında kaldı).

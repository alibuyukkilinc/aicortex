# Cortex — İnsan + AI Ortak Proje Beyni

> Bu dosya, Cortex projesinin **ana prompt'u ve temel spesifikasyonudur**. Bir AI'a veya geliştiriciye verildiğinde sistemi sıfırdan kurabilecek kadar net olmalıdır.
> Durum: v1 taslağı · Lisans: MIT · Dil: Kod/API İngilizce, arayüz ve README İngilizce + Türkçe

---

## 1. Neden var?

Bugün AI ile yazılım geliştirirken:
- Proje bilgisi dağınık `.md` dosyalarında yaşıyor. Bu dosyalar eskiyor, birbiriyle çelişiyor, AI'ın kafasını karıştırıyor.
- AI her oturumda projeyi baştan anlamaya çalışıyor, tüm dokümanları okuyup token harcıyor.
- İnsan, AI'ın ne yaptığını ve neden yaptığını takip edemiyor. "Nasılsa AI halleder" algısı proje hakimiyetini insandan alıyor.

**Cortex** projenin tek doğruluk kaynağıdır. Bilgi ağacını, iş panosunu, kararları, soruları ve AI aktivitesini tek yerde tutar. İnsanlar, AI'lar ve diğer AI'lar süreci buradan yürütür. **Kontrol insanda kalır.**

## 2. Temel ilkeler (pazarlık dışı)

1. **Token dostu:** AI hiçbir zaman "her şeyi" çekmez. Önce özet alır, sonra ihtiyaç duyduğu dala iner (kademeli yükleme). Sistemin kendisi hiçbir LLM çağrısı yapmaz.
2. **Tek komutla ayağa kalkar:** `npx cortex init` ve `npx cortex start` yeterlidir. Harici veritabanı, Docker veya API anahtarı gerekmez.
3. **Git dostu:** Veri projenin içindeki `.cortex/` klasöründe, okunabilir dosyalar olarak durur. Git ile versiyonlanır, diff alınır, merge edilir.
4. **Kontrol insanda:** Kuralları, şemaları ve onay politikalarını insan belirler. AI'ın kritik değişiklikleri onaya düşer.
5. **Şeffaflık:** AI'ın her anlamlı eylemi (ne, neden, hangi dosya, hangi commit) kaydedilir ve insan tarafından sorgulanabilir.
6. **Kendini anlatan API:** AI bir ucu kullanırken o ucun kurallarını da öğrenir. Ayrı dokümana ihtiyaç yoktur.
7. **Basitlik:** Yeni bir geliştirici veya AI, 5 dakikada kullanmaya başlayabilmelidir.

## 3. Teknoloji

| Katman | Seçim | Not |
|---|---|---|
| Çalışma ortamı | Node.js ≥ 22 (TypeScript) | `npx` ile dağıtım |
| HTTP API | Fastify | REST + OpenAPI çıktısı |
| MCP | `@modelcontextprotocol/sdk` | stdio + HTTP transport |
| İndeks | SQLite (`node:sqlite` veya `better-sqlite3`) + FTS5 + `sqlite-vec` | **Yeniden üretilebilir önbellektir**, git'e girmez |
| Embedding | `@huggingface/transformers` + çok dilli küçük model (ör. `multilingual-e5-small`, quantized) | İlk kullanımda bir kez indirilir, TR/EN destekler |
| Web pano | React + Vite | Derlenmiş hâli pakete gömülü gelir |
| Dosya formatı | Markdown + YAML frontmatter, log için JSONL | İnsan okuyabilir, diff alınabilir |
| Kimlik | ULID | Paralel yazımda çakışma olmaz |

## 4. Depolama düzeni

```
proje/
└── .cortex/
    ├── cortex.config.yaml       # proje ayarları, aktörler, onay politikaları
    ├── rules/                   # insan kontrolündeki kurallar ve şemalar
    │   ├── _global.yaml         # tüm AI'lara geçerli kurallar
    │   ├── issue.schema.yaml
    │   ├── decision.schema.yaml
    │   └── ...
    ├── tree/                    # bilgi ağacı (klasör = dal)
    │   ├── backend/
    │   │   ├── _node.md         # dalın özeti
    │   │   └── auth/
    │   │       ├── _node.md
    │   │       └── jwt-refresh.md
    │   ├── frontend/  seo/  security/  server/  mobile/  code-structure/ ...
    ├── items/                   # kartlar, issue'lar, sorular, notlar, kararlar
    │   └── 01J9Z...-login-rate-limit.md
    ├── activity/                # AI + insan aktivite günlüğü (append-only)
    │   └── 2026-09-22.jsonl
    └── .index/                  # SQLite + vektörler (gitignore'da)
```

- Her kayıt tek bir dosyadır. Bu sayede merge çakışmaları azalır.
- `.index/` silinirse `cortex reindex` ile dosyalardan yeniden üretilir.

## 5. Veri modeli

### 5.1 Bilgi düğümü (Node)
```yaml
id: 01J9Z...
path: backend/auth/jwt-refresh
title: JWT yenileme akışı
summary: "Access token 15dk, refresh token 30 gün; refresh rotation aktif."   # ≤ 300 karakter, zorunlu
tags: [auth, security]
links:
  code: [{ file: src/auth/refresh.ts, lines: "10-80" }]
  items: [01J9Y...]             # ilgili karar/issue
verified_at_commit: a1b2c3d     # bilginin doğrulandığı commit
status: active | draft | stale | deprecated
updated_by: claude-code
updated_at: 2026-09-22T10:15:00Z
---
(detay gövdesi: markdown)
```

### 5.2 Kalem (Item) türleri
Tüm türler ortak alanları paylaşır (`id, type, title, status, column, category_path, author, assignee, created_at, updated_at, links, thread`), türe özel alanları ise `rules/*.schema.yaml` tanımlar.

| Tür | Amaç |
|---|---|
| `task` | Trello kartı: kolonlarda ilerler (Backlog → Yapılıyor → İnceleme → Bitti) |
| `issue` | Hata/sorun kaydı |
| `question` | İnsan→AI, AI→insan veya AI→AI soru |
| `note` | Serbest not |
| `decision` | Ne karar verdik, **neden**, alternatifler nelerdi, sonuçları neler (ADR) |

`thread`: Her kalemin yanıt zinciri vardır. Yanıtlar da şemaya tabidir.

### 5.3 Aktivite
```json
{"id":"01J9...","actor":"claude-code","action":"code_change","summary":"Login'e rate limit eklendi","why":"issue 01J9Y... gereği","files":["src/auth/login.ts"],"commit":"d4e5f6","refs":["01J9Y..."],"at":"2026-09-22T10:20:00Z"}
```

### 5.4 Aktör
`cortex.config.yaml` içinde tanımlanır: `{ id: "ali", kind: "human" }`, `{ id: "claude-code", kind: "ai", token: "..." }`. Her istek bir aktör token'ı taşır, kimin ne yaptığı her zaman bellidir. Tam login sistemi v2'ye kalır.

## 6. Kademeli yükleme (token ekonomisinin kalbi)

AI şu sırayla çalışır:

1. **`GET /api/brief`** (oturum başı, ~500 token hedefi):
   - Projenin tek paragraflık özeti
   - Üst seviye dallar ve her birinin 1 satırlık özeti
   - **Bu aktöre yönelik** bekleyen sorular, açık issue'lar, onay bekleyen taslaklar
   - Global kuralların kısa hâli ve `rules_version` hash'i
2. **`GET /api/tree/{path}?depth=1`**: Bir dalın çocuklarını yalnızca özetleriyle getirir.
3. **`GET /api/node/{path}`**: Yalnızca gerektiğinde tam detayı getirir.
4. **`GET /api/search?q=...`**: Anlamadığı her yerde arama yapar. Sonuçlar tam içerik değil, `path + summary + skor` döner.

Tüm listeleme uçlarında şunlar bulunur:
- `fields=`: Yalnızca istenen alanlar döner.
- `limit/cursor`: Sayfalama.
- `budget=`: Yaklaşık token bütçesi. Sunucu, cevabı bütçeye sığacak şekilde özetler ve keser.

## 7. Kendini anlatan API ve kurallar

- Her kalem türünün bir şeması vardır (`rules/<type>.schema.yaml`): zorunlu alanlar, alan formatları (ör. tarih ISO-8601 UTC), izinli durum geçişleri, yanıt kuralları ve AI'a yönelik düz dil talimatları.
- Her cevapta bir `_meta` alanı bulunur:
  ```json
  "_meta": { "rules_version": "r-7f3a", "rules_url": "/api/rules/issue" }
  ```
  AI, `rules_version` değişmediyse kuralları yeniden çekmez. Böylece token harcanmaz.
- Geçersiz bir yazım denemesinde sunucu yalnızca hata döndürmez, **hangi kuralın ihlal edildiğini ve doğru örneği** de döndürür. AI bu sayede kendini düzeltir.
- Kuralları **yalnızca `human` aktörler** değiştirebilir (panel veya dosya). AI kural değişikliğini yalnızca `proposal` olarak önerebilir.

Örnek şema parçası:
```yaml
type: issue
fields:
  severity: { enum: [low, medium, high, critical], required: true }
  category_path: { type: tree_path, required: true }
reply:
  required: [body, resolution]
  resolution: { enum: [fixed, wontfix, needs_info, duplicate] }
  must_link_commit_if: "resolution == fixed"
transitions:
  open: [in_progress, closed]
  in_progress: [review, open]
ai_instructions: >
  Bir issue'yu 'fixed' kapatırken commit hash'i ve değişen dosyaları ekle.
  Emin olmadığın durumda kapatma, soru aç.
```

## 8. Onay politikası (AI yetkisi)

`cortex.config.yaml` içinde tür bazında belirlenir:
```yaml
approval:
  activity: auto         # direkt yazılır
  note: auto
  question: auto
  task: auto
  issue: auto
  node: review           # bilgi ağacı değişiklikleri taslak olarak düşer
  decision: review
  rules: human_only
```
`review` olan yazımlar `status: draft` ile kaydedilir ve panelde "Onay bekleyenler" listesine düşer. İnsan tek tıkla onaylar, reddeder veya düzenler. Taslak bilgi, arama sonuçlarında açıkça "taslak" etiketiyle görünür.

## 9. Kod bağı ve eskime tespiti

- Düğüm ve aktiviteler, ilgili dosya/satır aralığını ve `verified_at_commit` bilgisini tutar.
- `cortex check` (ve sunucu arka planda) git geçmişine bakar. Bağlı dosyalar o commit'ten sonra değiştiyse düğümü `stale` olarak işaretler.
- `stale` düğümler `brief` içinde "gözden geçirilmesi gerekenler" olarak AI'a ve insana gösterilir. **Eskimiş dokümanın ilacı budur.**

## 10. Arama

- Hibrit arama: FTS5 (kelime) + vektör (anlam) skorları birleştirilir (ör. Reciprocal Rank Fusion).
- Filtreler: `type`, `category_path`, `status`, `author`, `since`.
- Her dosya değiştiğinde (API veya diskte elle düzenleme; dosya izleyici ile) indeks artımlı olarak güncellenir.
- Model ilk kullanımda indirilir. İndirilemezse sistem kelime aramasıyla çalışmaya devam eder.

## 11. Gelen kutusu (soru-cevap akışı)

- Sistem kendi başına hiçbir LLM çağırmaz.
- İnsan, bir aktiviteye veya karta "Bunu neden böyle yaptın?" diye soru bırakır. Soru, `assignee: claude-code` ile kaydedilir.
- AI bir sonraki oturumda `brief` içinde "Sana yönelik 2 soru var" bilgisini görür ve cevaplar.
- Ters yön de aynıdır: AI emin olmadığında insana soru açar ve **cevap gelene kadar o konuda varsayım yapmaz**.
- Panelde okunmamış sayacı ve bildirim bulunur.

## 12. Arayüzler (v1)

### 12.1 REST API (temel katman)
```
GET    /api/brief
GET    /api/tree/{path}?depth=&fields=
GET    /api/node/{path}
PUT    /api/node/{path}
GET    /api/search?q=&type=&path=&budget=
GET    /api/items?type=&status=&assignee=&path=
POST   /api/items
GET    /api/items/{id}
PATCH  /api/items/{id}
POST   /api/items/{id}/replies
GET    /api/inbox
POST   /api/activity
GET    /api/activity?since=&actor=
GET    /api/rules  |  GET /api/rules/{type}
GET    /api/approvals  |  POST /api/approvals/{id}/{approve|reject}
GET    /api/openapi.json
```

### 12.2 MCP sunucusu
Aynı çekirdeğin ince bir sarmalayıcısıdır: `cortex_brief`, `cortex_tree`, `cortex_node`, `cortex_search`, `cortex_items`, `cortex_create_item`, `cortex_reply`, `cortex_log_activity`, `cortex_rules`, `cortex_update_node`.
Kurulum: `npx cortex mcp` (stdio). README'de Claude Code, Cursor ve VS Code için tek satırlık yapılandırma örnekleri bulunur.

### 12.3 Web pano (`http://localhost:4747`)
- **Pano:** Kanban kolonları, kategori (dal) filtresi.
- **Ağaç:** Bilgi ağacı gezgini (özet → detay), stale/draft rozetleri.
- **Aktivite akışı:** AI ne yaptı, neden, hangi dosya. Her satırda "Soru sor" butonu.
- **Gelen kutusu** ve **Onay bekleyenler**.
- **Kurallar:** Şemaları görüntüleme ve düzenleme (yalnızca insan).
- **Arama çubuğu:** Her ekranda bulunur.
- TR/EN dil desteği, açık/koyu tema.

## 13. İlk kurulum akışı

```bash
npx cortex init      # .cortex/ oluşturur, şablon dalları ve varsayılan kuralları koyar, .gitignore'a .index ekler
npx cortex start     # API + pano + dosya izleyici
```
`init` sonrasında:
1. Mevcut `.md` dosyaları (README, docs/, CLAUDE.md vb.) taranır ve "içe aktarım adayları" olarak listelenir.
2. Sistem, kullanıcının kendi AI'ına verilecek hazır bir **bootstrap görevi** üretir: "Projeyi tara, ağacı kur, her dala özet yaz, kararları çıkar." AI bu görevi API/MCP üzerinden yapar. Tüm yazımlar `draft` olarak düşer.
3. İnsan panelden onaylar. Onaylanan bilgi aktif olur.
4. Projedeki `CLAUDE.md` veya `AGENTS.md` dosyasına **tek bir kısa blok** eklenir: "Bu projede bilgi kaynağı Cortex'tir. Oturum başında `cortex_brief` çağır, değişiklikten önce `cortex_search` yap, değişiklikten sonra `cortex_log_activity` gönder." Bundan sonra `.md` dosyalarında doküman güncellenmez.

## 14. AI çalışma protokolü (her AI'a öğretilecek)

1. Oturum başında `brief` çağır. Sana yönelik soruları ve issue'ları gör.
2. Bir değişiklikten önce ilgili konuyu `search` ile ara, gerekirse ilgili dala in. Tüm ağacı okuma.
3. Anlamadığın bir yerde önce ara. Sonuç yoksa insana `question` aç, varsayım yapma.
4. Kod değiştirdikten sonra `activity` gönder (ne, neden, dosyalar, commit, ilgili kalem).
5. Mimari veya davranış değiştiyse ilgili düğümü güncelle veya `decision` aç (onaya düşer).
6. Kurallara uy. `rules_version` değiştiyse kuralları yeniden çek.

## 15. Kapsam

**v1 (bu sürüm):** Bölüm 4–14'ün tamamı, tek proje, yerel çalışma, basit aktör kimliği.

**Sonra:**
- Raporlar (haftalık özet, AI aktivite istatistikleri, açık issue yaşlanması, stale bilgi oranı)
- Merkezi/ekip sunucusu, tam login ve rol yönetimi
- Çoklu proje
- İsteğe bağlı anlık AI cevabı (kullanıcının kendi API anahtarıyla)
- Webhook'lar, GitHub Issues/PR senkronizasyonu
- VS Code eklentisi

## 16. Kabul kriterleri (v1 "bitti" sayılır, eğer)

- [ ] Temiz bir Windows, macOS ve Linux makinede, yalnızca Node kuruluyken `npx cortex init && npx cortex start` 2 dakikadan kısa sürede çalışıyorsa
- [ ] `brief` cevabı örnek bir projede 800 tokenin altında kalıyorsa
- [ ] Hibrit arama Türkçe ve İngilizce sorgularda ilgili düğümü ilk 3 sonuçta getiriyorsa
- [ ] Şemaya aykırı bir yazım, ihlal edilen kural ve doğru örnekle reddediliyorsa
- [ ] `review` türündeki AI yazımları onaysız aktif olmuyorsa
- [ ] Bağlı dosya değiştiğinde düğüm `stale` işaretleniyorsa
- [ ] `.index/` silinip `reindex` çalıştırıldığında hiçbir veri kaybolmuyorsa
- [ ] Claude Code MCP üzerinden, Bölüm 14'teki protokolü baştan sona uygulayabiliyorsa
- [ ] İki geliştirici `.cortex/` üzerinde paralel çalışıp git merge yaptığında veri bozulmuyorsa

## 17. Açık sorular

- İsim çakışması: npm'de `cortex` alınmış olabilir, ayrıca Snowflake Cortex ve Cortex (Prometheus) gibi ürünler var. Alternatifler: `@cortex-dev/cli`, `cortexhq`, `projcortex`. Kontrol edilmeli.
- Varsayılan port: 4747 uygun mu?
- Varsayılan dal şablonu: backend, frontend, server, mobile, security, seo, code-structure. Başka dallar gerekiyor mu?

---
title: MCP sunucusu
summary: "`cortexboard mcp` stdio üzerinden 23 araç sunar; merkezde ayrıca HTTP
  ucu vardır (POST /mcp/p/<proje>). Araçlar proje REST API'sini konuşur;
  kurallar, rol ve görünürlük her yolda aynı. Az çağrı için
  `cortex_items(preview)` ve `cortex_item(ids)`; tartışmalar için
  `cortex_discuss`."
links:
  code:
    - file: src/mcp/server.ts
    - file: src/mcp/client.ts
    - file: src/hub/mcpHttp.ts
    - file: src/core/items.ts
verified_at_commit: b2ffcf3274cd981a82cd0839e44e5d900cde3a64
id: 01M34QY9T47QSX4Q0GQ8V6GPEH
status: active
updated_by: ai-agent
updated_at: 2026-09-24T20:09:05.022Z
---

- Araçlar (`src/mcp/server.ts`) doğrudan çekirdeği değil `McpApi`yi çağırır (`src/mcp/client.ts`):
  - `localApi(cortex, actor)`: bellek içi Fastify; `projectRoutes` aynen çalışır, ağ yok, token yok.
  - `remoteApi(hub, project, token)`: `<hub>/api/p/<proje>/…` uçlarına `Authorization: Bearer` ile gider; ajanın rolü ve görünürlüğü uygulanır.
  - `call(method, path, { query, body, text, binary })`: `binary` gövdeyi bayt olarak döndürür (ekler için); hub'daki HTTP köprüsü de aynısını destekler.
- HTTP ucu (`src/hub/mcpHttp.ts`): `POST /mcp/p/<proje>`, durumsuz; her istek için yeni sunucu ve taşıyıcı açılır, çağrı `app.inject` ile aynı proje rotalarına gider. Hatalı ajan token'ları adres başına sınırlanır (REST ile ortak sayaç).
- Böylece tek kaynak var: REST'te düzelttiğin kural MCP'de de geçerli olur.
- Hatalar iki tarafta da kod, mesaj ve ipucuyla döner (`setErrorHandler`); yetki reddi `hint.needs` ile hangi yetkinin eksik olduğunu söyler.
- MCP yolunda asla `console.log` kullanılmaz: stdout protokole aittir (stderr kullan). `test/cli.test.ts` bunu gerçek bir alt süreçle, her stdout satırını JSON-RPC olarak ayrıştırarak denetler.
- **Az çağrıyla okuma** (A/B ölçümünden, 2026-09-24, commit be7ccd7): ajanlar kalemleri listeleyip tek tek açıyordu (5 soruya ~20 çağrı).
  - `cortex_items(preview: true)` (REST `GET /items?preview=true`): her satıra gövdenin 200 karakterlik özeti (`gist`) ve son cevap (`last_reply`: kim, ne zaman, hangi duruma, kısa metin) eklenir. Varsayılan kapalı; pano listesi hafif kalır. Kör turdaki bir tartışmanın son cevabı önizlemeye girmez.
  - `cortex_item(ids: [...])`: en fazla 10 kalem tek çağrıda. Her kimlik REST'e ayrı gider, görünürlük aynen uygulanır; bulunamayan ya da gizli kalem yalnızca kendi satırında `{id, error}` döner. `_meta` cevapta bir kez yer alır. Tek `id` eskisi gibi çalışır.
  - Sonuç: çağrı sayısı ~20'den ~12'ye, süre ~43 sn'den ~35 sn'ye indi; toplam token değişmedi (okunan içerik aynı).
- `cortex_item` kalemin eklerini `attachments` altında listeler. `cortex_item_file(id, name)`: Markdown ve metin metin olarak (100.000 karaktere kadar), güvenli resimler (≤4 MB) MCP `image` içeriği olarak döner — AI ekran görüntüsüne doğrudan bakabilir; diğer dosyalar yalnızca tanımlanır.
- **Tartışmalar** (`backend/discussions`): `cortex_discussions` (liste; `asks_you` senden görüş bekleyenleri işaretler), `cortex_discuss` (görüş yaz: `kind`, `stance`, `confidence`, `evidence`, `body`; `POST /items/:id/replies` sarmalayıcısı), `cortex_close_vote` (oyları say). Tartışma açmak için ayrı araç yok: `cortex_create_item` type `discussion`. `cortex_item` bir tartışmada `discussion` özetini (kör tur mu, kim yazdı, kim bekleniyor, görebiliyorsa oy sayımı) taşır; kör turda başkalarının görüşleri `sealed: true` ve boş gövdeyle gelir. Sunucu talimatı ajanlara gelen kutusundaki tartışmaları `cortex_discuss` ile cevaplamalarını söyler.
- `cortex_log_activity` cevabı, değişikliğin eskittiği düğümleri ve "bu turda kapat" ipucunu içerir (`backend/activity`).
- `cortex_claim` (`action: "claim"|"release"`) ve `cortex_update_item`'daki `if_rev`: görev devri ve eşzamanlılık. Ayrıntı: `backend/items-and-rules`.
- MCP sunucusu kaynaktan çalışsa da oturum başında açılır: araç kodu değişince yeni araçlar için sunucu yeniden bağlanmalı.
- `test/interfaces.test.ts` araç listesini, `test/hub.test.ts` merkez üzerinden MCP'yi (araç sayısı 23), `test/protocol.test.ts` §14 protokolünü uçtan uca, `test/attachments.test.ts` ek okumayı, `test/open-queue.test.ts` önizleme ve toplu okumayı, `test/discussions.test.ts` tartışmaları kontrol eder.

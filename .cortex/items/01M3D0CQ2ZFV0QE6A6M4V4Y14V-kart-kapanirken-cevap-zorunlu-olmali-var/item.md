---
id: 01M3D0CQ2ZFV0QE6A6M4V4Y14V
type: issue
title: Kart kapanırken cevap zorunlu olmalı (varsayılan açık, kart başına
  kapatılabilir)
status: review
category_path: backend/items-and-rules
author: ai-agent
assignee: "@ai"
tags:
  - kurallar
  - mcp
  - pano
fields:
  severity: medium
  steps: 1) arsaproje/alihanfront projesinde bir insan task açar. 2) AI işi
    bitirir, cortex_update_item ile status=review yapar (yalnız `reason`
    doldurur), cortex_log_activity yazar. 3) Kartı açan insan kartta HİÇ cevap
    görmez.
  expected: Kartı kapatan/devreden (review, resolved veya terminal duruma alan)
    kişi karta ne yapıldığını anlatan bir cevap bırakmak zorunda; kartı açan
    kişi isterse bu zorunluluğu o kart için kapatabilir.
  actual: Cevap hiçbir yolda zorunlu değil. update_item 'reason' alanı,
    handoff_note ve activity kartta cevap olarak görünmüyor; AI bunlarla işi
    'bitirmiş' sayıyor.
  environment: cortexboard 0.4.0, MCP stdio, actor ai-agent
created_at: 2026-09-25T19:24:05.087Z
updated_at: 2026-09-25T19:37:09.323Z
updated_by: ai-agent
---

## Ne oldu (gerçek olay, 2026-09-25)
arsaproje frontend panosunda sahibi "panel ilan listede düzenleme" görevini açtı. AI görevi yaptı, commit'ledi, `update_item(status=review, reason=...)` + devir notu + `cortex_log_activity` yazdı — **karta cevap yazmadı**. Sahibi kartı açınca ne yapıldığını göremedi ve "kuralı neden atladın" diye sordu. Ayrıca AI işe başlarken task'ı `doing`'e almamıştı (yalnız claim).

## Kök neden
1. **Task şemasında cevap kuralı yok.** `DEFAULT_SCHEMAS.task.ai_instructions` yalnız "doing'e al, bitince review" diyor (`src/core/schema.ts:73`).
2. **Issue şemasındaki kural da delinebiliyor.** `reply.require_when` (fixed → commits+files) yalnız bir cevap GELİRSE denetleniyor (`src/core/items.ts:298`). `update_item` ile cevapsız durum değişikliği hiçbir kontrole takılmıyor. Yani eksik tür bağımsız, genel.
3. **Görünmez kanallar cevap sanılıyor.** `reason`, `handoff_note`, activity kartı okuyan insana görünmüyor ama AI'a "yazdım" hissi veriyor.

## İstenen davranış (sahibinin tarifi)
- Kart açılırken **"Kapanışta cevap zorunlu" varsayılan AÇIK** gelir.
- Kartı açan kişi isterse **kapatabilir** ("cevap zorunlu değil") — ör. basit, kendini anlatan işler.

## Öneri (uygulama taslağı)
- **Şema:** yeni `reply_required` ayarı — hangi durumlara geçişte cevap şart (varsayılan: `review` + resolved + terminal durumlar) ve varsayılan değer (`true`). `validateRulesDoc` denetler; eski projeler yerleşik varsayılana düşer.
- **Kalem:** kart başına bayrak (ör. `reply_required: boolean`, oluştururken şemadaki varsayılanla dolar). Pano oluşturma formunda onay kutusu; kart üzerinde küçük bir "cevap zorunlu" işareti ve değiştirme.
- **Zorlama (`ItemService.update`):** bayrak açıksa, bu durumlara geçiş `update_item` ile yapılırsa `reply_required` hatası: "Önce cortex_reply ile ne yaptığını yaz; durumu aynı çağrıda `status` ile değiştir." Geçiş yalnız `cortex_reply(..., status)` yolunda (cevap + durum tek adımda) kabul edilir.
- **AI talimatı:** task/issue/question `ai_instructions` metinlerine: "Kapanış cevabında: ne yapıldı, commit/sürüm, sınırlar, test adımları, dosyalar. reason/handoff/activity kartta görünmez."
- **MCP araç açıklamaları:** `cortex_update_item` açıklamasına "kapanış geçişi cevap gerektirebilir, cortex_reply kullan" notu; `cortex_create_item` yeni alanı alır.

## Karar bekleyen noktalar
1. Zorlama yalnız AI aktörlerine mi, herkese mi? (Öneri: varsayılan yalnız AI; insan panodan kapatırken zorlanmaz — kararı veren zaten o.)
2. Hangi geçişler: yalnız `review` + terminal mi, yoksa `doing`'den her çıkış mı?
3. Tartışma (`discussion`) ve karar (`decision`) türleri kapsam dışı mı? (Öneri: evet; onların kendi akışı var.)

## Kabul ölçütü
- Bayrağı açık bir task'ı AI `update_item(status=review)` ile taşıyamaz; `cortex_reply(status=review)` ile taşır ve cevap kartta görünür.
- Bayrağı kapalı kartta eski davranış sürer.
- Pano formunda kutu varsayılan işaretli; kart detayında değiştirilebilir.
- Testler: şema doğrulama, update reddi, reply+status kabulü, eski proje (şemada alan yok) davranışı.

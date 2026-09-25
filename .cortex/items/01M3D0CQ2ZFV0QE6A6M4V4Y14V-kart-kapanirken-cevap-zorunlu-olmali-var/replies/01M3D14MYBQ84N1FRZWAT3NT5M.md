---
id: 01M3D14MYBQ84N1FRZWAT3NT5M
author: ai-agent
created_at: 2026-09-25T19:37:09.323Z
status_change:
  from: in_progress
  to: review
---

## Ne yapıldı
- **Şema** (`src/core/schema.ts`): yeni `reply_required: { statuses, default }`. Yerleşik: görev `[review, done]`, issue `[review, closed]`, `default: true`. Şema dosyasında anahtar yoksa `loadSchema` yerleşik kurala düşer (bu repo dahil eski projeler dosyasız düzelir). `validateRulesDoc` alanı denetler (`src/core/cortex.ts`). `describeSchema` alanı AI'a ve panoya gösterir.
- **Kalem** (`src/core/types.ts`, `src/core/items.ts`): `Item.reply_required`. Oluştururken verilmezse türün varsayılanı yazılır; bayraksız eski kartlar varsayılanı izler.
- **Zorlama** (`ItemService.update`): AI, bayrak açıkken bu durumlara `update_item` ile geçemez → `reply_required` (400), ipucu `cortex_reply(..., status)`. Reply yolu aynen çalışır; cevap kartta görünür.
- **Bayrağı değiştirme**: oluştururken herkes; sonradan yalnız insan (AI denerse 403 — kendi yükünü kaldıramasın).
- **AI talimatları**: task/issue `ai_instructions` artık "bitirirken cevapla, reason/devir notu/activity kartta görünmez" diyor. MCP'de `cortex_update_item` ve `cortex_reply` açıklamaları güncellendi, `cortex_create_item` `reply_required` alır.
- **Pano** (`web/src/items.tsx`, `types.ts`, `i18n.ts`): yeni kayıt penceresinde "Kapanışta cevap zorunlu" kutusu (varsayılan işaretli, yalnız kuralı olan türlerde); kart çekmecesinde aynı kutu, insan değiştirebilir, hangi durumlara uygulandığını gösterir.

## Karar bekleyen noktalar: öneriler uygulandı
1. Zorlama yalnız AI'a; insan panodan taşırken zorlanmaz.
2. Geçişler: `review` + terminal (görevde `done`, issue'da `closed`). `doing`'den her çıkış değil.
3. `discussion`, `decision`, `note`, `question` kapsam dışı (soruda cevap zaten reply).
Farklı istenirse şema dosyasından (`reply_required`) proje bazında değiştirilebilir.

## Test
- `test/items.test.ts`'e 3 test: update reddi + reply(status) kabulü (task ve issue), insan taşıması serbest; kart başına kapatma ve AI'ın kapatamaması; eski şema/eski kart geri düşüşü ve `validateRulesDoc`.
- `npm test` 181/181, `npm run typecheck` ve `npm run build` temiz.
- Panoda elle: kart çekmecesinde kutu işaretli "(İncelemede, Kapalı)"; yeni kayıtta görev/issue'da işaretli, notta yok.

## Sınırlar
- Commit atılmadı (sahibi istemedi); değişiklikler çalışma ağacında.
- Çalışan MCP süreci eski kodla açık; kural yeniden başlatınca devreye girer.
- Pano listesindeki kartlarda ayrı işaret yok; yalnız detayda.

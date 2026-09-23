---
kind: node
target: frontend/pages
proposed_by: ai-agent
reason: S2 (rapor grafiği), S3 (Eskimiş bilgi sayfası, onay uyarısı) ve S10
  (klavye erişimi, taşı menüsü, etiketler) sayfaları değiştirdi.
base_rev: 37165fa3
id: 01M38426F4HAAR7KDMDQ95J4GY
proposed_at: 2026-09-23T21:52:02.532Z
data:
  path: frontend/pages
  title: Pano sayfaları
  summary: Her sayfa web/src/pages altında ayrı bir dosya. Kalem çekmecesi ve soru
    sorma penceresi web/src/items.tsx'te; kalem formları kurallardan otomatik
    üretilir (web/src/SchemaForm.tsx). Tıklanan her satır klavyeyle de çalışır
    (Pressable/ListRow).
  links:
    code:
      - file: web/src/pages
      - file: web/src/items.tsx
      - file: web/src/SchemaForm.tsx
      - file: web/src/hub.tsx
      - file: web/src/ui.tsx
  verified_at_commit: d9280d1
  id: 01M34QY9ZWPSMQ85J1ACFRTWTS
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T21:52:02.525Z
---

- Bildirimler (`pages/Inbox.tsx`): tek satırlık özet ("5 şey seni bekliyor · 2 taslak onayını bekliyor") ve başlığı, sayısı, bir cümlelik açıklaması olan gruplar: işi durduran sorular, sana atananlar, grubunu bekleyenler, cevaplanan soruların, yeni yanıtlar, kararlar, onay bekleyen taslaklar, eskimiş bilgi (yalnızca yüksek ve orta derece). Pano: tür başına kanban; yasak geçişler soluk ve açıklamalı; her kartta "Şuraya taşı" menüsü (klavye ve dokunmatik için sürüklemenin karşılığı), taşıma `aria-live` ile duyurulur.
- Bilgi: ağaç (ad bir bağlantı, `aria-current`; açma/kapama ayrı düğme, `aria-expanded`), markdown, kod bağlantıları; üstte yol ve işlem düğmeleri; eskimiş düğümde derece, "Hâlâ doğru", "Düzelt" ve (insanlar için) "Ertele".
- Eskimiş bilgi (`pages/Stale.tsx`): dereceye göre gruplar, satır başına Doğrula / Düzelt / Ertele, "biçimsel olanların hepsini doğrula", ertelenenler katlanır.
- Arama: taslak sonuçlar "taslak, onay bekliyor" etiketiyle görünür, tıklayınca Onaylar'a gider.
- Aktivite: canlı akış, her kayıtta "bunu sor" düğmesi.
- Onaylar: mevcut ve önerilen yan yana; onay kutularıyla toplu onay/ret, işlenemeyenler seçili kalır. Onaydan sonra kod değişmişse "Kontrol ettim: HEAD'de doğrula" seçeneği çıkar.
- Kalem formu ve ayrıntı paneli: alanlar kurallardan üretilir, hazır alan ve seçenek adları çevrilir (`SchemaForm`, `FieldRow`). Her etiket `htmlFor`/`id` ile kontrolüne bağlı.
- Raporlar: dönem ve dışa aktarma düğmeleri; özet kutuları, grafikler (denetim kayıtları grafikte bağlam serisi), listeler, markdown kopyala/indir. Kurallar: YAML düzenleyici, geçersiz kural kaydedilmez.
- Hub ekranları (`web/src/hub.tsx`): giriş, davet, projelerim, organizasyon (kişiler, AI ajanları, projeler; davet bağlantısı ve token bir kez gösterilir), proje Üyeler sayfası (rol, görür, dallar). Üst çubukta proje değiştirici ve hesap menüsü.
- Kılavuz (`pages/Guide.tsx`): sistem nasıl işler, sıradan bir gün, AI bağlantısı, rol tablosu, mobil ekip örneği, terimler sözlüğü.
- Erişilebilirlik: tıklanan ama `<button>` olamayan her şey (satır, kart) `Pressable` (`web/src/ui.tsx`): `role="button"`, sekme sırası, Enter/Space; içindeki onay kutusu gibi öğelerin tuşları onlarda kalır. Arka plan örtüleri `aria-hidden`, Escape kapatır. `.oxlintrc.json`'daki jsx-a11y kuralları (etiket için `assert: htmlFor`) gerilemeyi engeller.
- Rolün izin vermediği düğmeler gizlenir (`useSession().can(perm)`); asıl denetim sunucuda.

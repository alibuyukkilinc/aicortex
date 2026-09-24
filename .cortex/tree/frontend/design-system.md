---
title: "Tasarım sistemi: renkler, yazı tipi, bileşenler"
summary: "Apple sistem görünümüne yakın: tek vurgu sistem mavisi, nötr griler,
  gerçek siyah koyu tema, çerçevesiz kartlar. Pano kartları Trello tarzı;
  tartışma seçenekleri `--opt-0..5` renkleriyle. SF Pro, yoksa Inter. Gradyan ve
  neon yok."
links:
  code:
    - file: web/src/styles.css
    - file: web/src/charts.tsx
    - file: web/src/ui.tsx
    - file: web/src/main.tsx
verified_at_commit: b2ffcf3274cd981a82cd0839e44e5d900cde3a64
id: 01M34QYA1Q9QSJH06S50NZT2N4
status: active
updated_by: ai-agent
updated_at: 2026-09-24T20:09:06.522Z
---

## Yazı tipi
- Sıra: `-apple-system` / SF Pro, sonra Inter Variable. Başlıklar `--font-display`, 26 px, sıkı harf aralığı.
- Ölçek (512d9a9'da bir kademe küçüldü): taban 13,5 px; kullanılan boylar 26 / 22 / 17 / 16 / 15 / 14 / 13,5 / 13 / 12,5 / 12 / 11,5 / 11. En küçük etiketler 11 px'te sabit; daha küçüğüne inilmiyor.
- Inter Variable (arayüz) ve JetBrains Mono Variable (kod), `@fontsource-variable/*` paketlerinden `web/src/main.tsx` içinde yüklenir. Dış font servisi yok: pano yerel bir araç, internetsiz de çalışmalı.
- Genel `h3` küçük, büyük harfli, soluk bir bölüm etiketidir. Kart başlığı gibi okunur bir `h3` gerekiyorsa (ör. `.disc-card-title`) `text-transform`, renk ve boy açıkça ezilir.

## Değişkenler (`web/src/styles.css`)
- Temalar: `:root` (açık), `@media (prefers-color-scheme: dark)` ve `:root[data-theme="dark"]`; üçü de aynı değişkenleri tanımlamalı.
- Yüzeyler: `--bg`, `--surface`, `--surface-2`, `--surface-3`; çizgiler `--border`, `--border-strong`; metin `--text`, `--muted`, `--faint`.
- Vurgu: sistem mavisi (`--accent` #0071e3 / koyuda #0a84ff), `--accent-hover`, `--accent-soft`, `--accent-text`, `--on-accent`, odak halkası `--ring`. Durum: `--ok`, `--warn`, `--danger` (+ `-soft`).
- Dolgular: `--fill`, `--fill-strong`, `--raised` (dolgu üstündeki kart), `--chrome`.
- Ölçek: `--radius-sm/--radius/--radius-lg/--radius-xl` (6/8/12/14), `--control` 32 px, `--control-sm` 28 px, gölgeler `--shadow-sm/--shadow/--shadow-lg`.
- Tartışma seçenekleri: `--opt-0` … `--opt-5` (mavi, turuncu, yeşil, mor, camgöbeği, pembe; koyu temada parlak karşılıkları). `.o0`…`.o5` sınıfı `--o` değişkenini ayarlar; `.opt-dot` ve `.vote-track > span` onu kullanır. Seçenek sırası renk sırasıdır, 6'dan sonra döner.

## Bileşenler
- Düğme: `.btn` (varsayılan), `.primary`, `.danger`, `.ghost`, `.sm`; `.icon-btn` (ikon-only, her zaman `aria-label`).
- `Pressable` / `ListRow` (`web/src/ui.tsx`): tıklanan ama düğme olamayan satır ve kartlar için `role="button"`, sekme sırası, Enter/Space. Odak halkası `:focus-visible`; kırpan kartların içindeki satırlarda halka içe çizilir.
- Açılır pencere (`Modal`), çekmece (`Drawer`), bildirim (`toast`). Escape yalnızca en üstteki pencereyi kapatır. Arka plan örtüleri `aria-hidden`. `.modal-foot` pencereye göre yapışkandır (`position: sticky`, negatif kenar); pencere dışında kullanılmaz (tartışma görüş kutusu kendi `.disc-composer-foot`'unu kullanır).
- Etiketler: `StatusChip`, `TypeChip`, derece çipi (`.sev-high/medium/low`). Tartışma durumları: tartışılıyor = vurgu, oylandı = uyarı, karara bağlandı = tamam. Emoji yok, çizgi ikonlar `Icon` (ek için `clip`, `image`, `download`, `trash`, `text`, `clock`; tartışma için `debate`, `eye`).
- Pano kartı (`.kcard`): kenardan kenara kapak resmi (`.kcard-cover`), renkli seviye etiketi (`.klabel.lv-low/medium/high/critical`: yeşil/sarı/turuncu/kırmızı), rozetler (`.kbadge`; son tarih geçtiyse kırmızı, bugünse turuncu, bitince yeşil), sütun altında "Kart ekle".
- **Sütun yüksekliği:** `.column-body` bir flex kolonudur ve flex çocukları varsayılan olarak küçülür; bu yüzden kartlara `flex-shrink: 0` verilir, yoksa dolu sütun kaydırma çubuğu göstermek yerine kartları ezer. Pano sayfası pencereyi doldurur (`.main:has(> .board)` flex + `overflow: hidden`, `.board` `flex: 1` ve `grid-auto-rows: 100%`), sütun da `max-height: 100%` ile görünür alana sığar. `:has` desteklemeyen tarayıcıda `calc(100vh - 200px)` yedeği devrede.
- Tartışma ekranı: kart ızgarası `.disc-grid` (en az 340 px), detayda `.disc-layout` = içerik + 340 px yapışkan yan panel (1100 px altında tek sütun), seçenek sütunları `.disc-columns` (en az 230 px), görüş kartı `.view-card` (`.sealed` kesikli/boş, `.synthesis` mor kenar).
- Ekler: `.att-grid` küçük resim ızgarası, üzerine gelince işlemler (dokunmatikte hep görünür); `.drop-area.dropping` kesikli vurgu çerçevesi ve "bırak" ipucu; Markdown alanında Yaz/Önizle sekmeleri (`.md-tabs`).
- `.sr-only`: yalnızca ekran okuyucu için metin (panodaki `aria-live` duyurusu).
- Hareketler 120-200 ms; `prefers-reduced-motion` açıksa kapanır.

## Grafikler
- Renkler: `--viz-ai` (mor), `--viz-human` (camgöbeği), `--viz-system` (denetim kayıtları, soluk), `--viz-bar`, `--viz-grid`, `--viz-axis`.
- Çubuk en fazla 24 px, veri ucunda 4 px yuvarlatma, bölümler arası 2 px, ince ızgara, fare ve klavyeyle ipucu, tablo görünümü (`web/src/charts.tsx`). `Series.context`: yalnızca ipucu ve açıklamada görünen, ekseni belirlemeyen seri.

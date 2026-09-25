---
title: "Tasarım sistemi: renkler, yazı tipi, bileşenler"
summary: "Apple sistem görünümüne yakın: tek vurgu sistem mavisi, nötr griler,
  gerçek siyah koyu tema, çerçevesiz kartlar. Yazı boyu yalnızca `--text-*`
  adımları, boşluk `--space-*`, renk yalnızca tema değişkeni. Ortak Loading
  (iskelet) ve EmptyState. Gradyan, neon ve kartlarda cam yok."
links:
  code:
    - file: web/src/styles.css
    - file: web/src/ui.tsx
    - file: web/src/charts.tsx
    - file: web/src/main.tsx
verified_at_commit: 4a005676941ea541e4c54fb5a19eb7183a44bee7
id: 01M34QYA1Q9QSJH06S50NZT2N4
status: active
updated_by: ai-agent
updated_at: 2026-09-24T21:20:24.673Z
---

Karar `01M3AJ1SRRPTM51GFWVBVT78PS` (tartışma `01M3AHHGHTMCEMGPQZZ55FV60W`): görünümü değiştirmeden sistemi her ekranda aynı uygula. 1. tur commit 4a00567; kalanlar görev `01M3AJF3RYE2NB30ZNVAAB0595`.

## Kurallar (yeni kodda uyulacak)
- **Yazı boyu:** yalnızca `--text-2xs` 11 · `--text-xs` 12 · `--text-sm` 12,5 · `--text-base` 13,5 (gövde) · `--text-md` 15 · `--text-lg` 17 · `--text-xl` 22 · `--text-2xl` 26. px yazma; 11 px altı yok.
- **Boşluk:** `--space-1..6` = 4 / 8 / 12 / 16 / 24 / 32 px. Eski kuralların çoğu hâlâ px (2. tur).
- **Renk:** yalnızca değişken. Renkli zemin üstü metin `--on-color`; bildirim `--toast-bg/--toast-text/--toast-danger`; fark vurgusu `--diff-changed/removed/added`; pano etiketleri `--label-low/medium/high`. Yeni renk üç tema bloğunda da tanımlanır.
- **Kırılma noktaları:** yalnızca 600 / 860 / 1100 px.
- **Satır içi stil yazma:** ortak sınıf kullan: `.grow` (flex 1 + min-width 0), `.w-auto`, `.text-xs`, `.text-2xs`, `.mt-0`, `.m-0`, `.plain-link`, `.pre-wrap`. 96 satır içi stil kaldı (çoğu items.tsx, Reports, Knowledge, hub).
- **Cam etkisi** (`backdrop-filter`) yalnızca üst çubuk, kenar çubuğu, pencere ve bildirimlerde. Kartlara yayılmaz: yoğun metinde kontrastı düşürür, renkli arka plan ister ("gradyan yok" kuralı), kaydırmayı yavaşlatır. Bu tartışmada bilerek reddedildi.
- **Gradyan yok:** iskelet yükleme de gradyan kaydırma değil, opaklık nabzı kullanır.

## Yazı tipi
- Sıra: `-apple-system` / SF Pro, sonra Inter Variable. Başlıklar `--font-display`, sıkı harf aralığı.
- Inter Variable ve JetBrains Mono Variable `@fontsource-variable/*` paketlerinden `web/src/main.tsx` içinde yüklenir; dış font servisi yok.
- Genel `h3` küçük, büyük harfli, soluk bölüm etiketidir. Okunur bir kart başlığı gerekiyorsa (ör. `.disc-card-title`) `text-transform`, renk ve boy açıkça ezilir.

## Değişkenler (`web/src/styles.css`)
- Temalar: `:root` (açık), `@media (prefers-color-scheme: dark)` ve `:root[data-theme="dark"]`; renkler üçünde de tanımlı. Ölçekler (`--text-*`, `--space-*`, `--radius*`, `--control*`) yalnızca `:root`'ta.
- Yüzeyler `--bg`, `--surface`, `--surface-2/3`; çizgiler `--border`, `--border-strong`; metin `--text`, `--muted`, `--faint`.
- Vurgu sistem mavisi (`--accent`, `--accent-hover/soft/text`, `--on-accent`, `--ring`). Durum `--ok`, `--warn`, `--danger` (+ `-soft`). Dolgular `--fill`, `--fill-strong`, `--raised`, `--chrome`.
- Tartışma seçenekleri `--opt-0..5`; `.o0..o5` sınıfı `--o`'yu ayarlar, `.opt-dot` ve `.vote-track > span` kullanır.

## Bileşenler (`web/src/ui.tsx`)
- `Loading({ rows })`: sayfanın şeklinde iskelet satırlar (`.skeleton`, `.skeleton-row`, `.skeleton-bar`), ekran okuyucuya "Yükleniyor…" (`role="status"`), azaltılmış harekette durur.
- `EmptyState({ icon, title, hint?, action?, card? })`: ikon, boşluğun anlamı ve varsa sıradaki adım düğmesi. Bildirimler, Tartışmalar, Arama, Aktivite, Onaylar, Eskimiş bilgide kullanılıyor; hub ve Bilgi sayfasında hâlâ eski `.empty`.
- Düğme `.btn` (`.primary`, `.danger`, `.ghost`, `.sm`), `.icon-btn` (her zaman `aria-label`). `Pressable`/`ListRow`: tıklanan satır ve kartlar için `role="button"`, sekme sırası, Enter/Space.
- `Modal`, `Drawer`, `toast`; Escape yalnızca en üstteki pencereyi kapatır. `.modal-foot` pencereye göre yapışkandır, pencere dışında kullanılmaz.
- Etiketler `StatusChip`, `TypeChip`, derece çipi. Çizgi ikonlar `Icon` (`debate`, `eye` dahil); emoji yok.
- Kenar çubuğu grupları: `.nav-group` + `.nav-group-label` (Çalışma / Hafıza / Proje). Daraltılmış şeritte başlık yer tutar, açılınca görünür; telefonda `display: contents` ile tek şerit.
- Pano: başlık + ana eylem `page-head`'de, filtreler ayrı `.toolbar.board-filters` satırında. Kart `.kcard` (kapak, `.klabel.lv-*`, `.kbadge`); kartlara `flex-shrink: 0` şart, pano sayfası pencereyi doldurur.
- Tartışma ekranı: `.disc-grid`, `.disc-layout` (içerik + 340 px yan panel, 1100 px altında tek sütun), `.disc-columns`, `.view-card`.
- Hareketler 120-200 ms; `prefers-reduced-motion` açıksa kapanır.

## Grafikler
- `--viz-ai`, `--viz-human`, `--viz-system`, `--viz-bar`, `--viz-grid`, `--viz-axis`. Çubuk en fazla 24 px, ucunda 4 px yuvarlatma, ince ızgara, klavyeyle ipucu, tablo görünümü (`web/src/charts.tsx`).

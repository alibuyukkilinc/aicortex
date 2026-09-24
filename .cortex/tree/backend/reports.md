---
title: Raporlar
summary: "Dönem raporu (7/30/90 gün veya tarih aralığı): gerekçeli kayıtlar ve
  ayrı sayılan denetim izi, açılan/kapanan kayıtlar, sorular, kararlar, AI
  taslak onay oranı, issue yaşı, eyleme değer eskimiş bilgi. Sayılarak
  hesaplanır, LLM yok. JSON veya TR/EN markdown."
links:
  code:
    - file: src/core/reports.ts
    - file: src/core/reportMarkdown.ts
    - file: web/src/pages/Reports.tsx
    - file: web/src/charts.tsx
    - file: src/util/time.ts
verified_at_commit: 2a7b14697ac1c6333ac1fac454eba0517827bf2d
id: 01M34QY9PF26EEEGQRYECABXXH
status: active
updated_by: ai-agent
updated_at: 2026-09-24T15:08:08.883Z
---

- `parsePeriod`: göreli dönemler projenin saat diliminde takvim gününe hizalı ("7d" = bugün + önceki 6 gün). Saat dilimi `cortex.config.yaml` → `timezone`, yoksa UTC. Gün hesabı `src/util/time.ts` içinde, yalnızca Intl ile; yaz saati geçişleri doğru. En fazla 366 gün.
- `ReportService.build` dönemin aktivitesini (`activityBetween`) ve o anki kalemleri, taslakları, eskime durumunu okur.
- Aktivite iki ayrı sayı: `totals.activity.logged` (birinin kendi yazdığı "ne yaptım, neden" kaydı) ve `totals.activity.system` (Cortex'in denetim kaydı). Manşet `logged`'dır. `daily[].ai/human` yalnızca kayıtları, `daily[].system` denetimi sayar.
- Bilgi sağlığı: `knowledge.stale` yalnızca eyleme değer eskimiş düğümler (yüksek + orta, ertelenmemiş), `knowledge.stale_info` geri kalanı (yalnızca biçimsel ya da ertelenmiş); `attention.stale_nodes` her düğümün derecesini taşır. Markdown'da "N eskimiş (%) + M yalnızca biçimsel ya da ertelenmiş" ve listede **derece** yazılır.
- Panoda denetim serisi bir bağlam serisidir (`Series.context`, `web/src/charts.tsx`): açıklamada ve ipucunda görünür, çizilmez ve ekseni belirlemez. Rapor sayfasındaki satırlar klavyeyle açılır (`ListRow`).
- Kısmi görünürlüğü olan hub üyesi proje çapındaki raporu alamaz (403).
- `reportToMarkdown(report, lang)`: Slack'e veya PR açıklamasına yapıştırmak için.
- Erişim: `GET /api/report` (`format=md`), MCP `cortex_report`, CLI `cortexboard report`, panoda Raporlar sayfası.
- "Belgelenmemiş dal" = özetinde hâlâ init'in yer tutucu metni olan dal. Kontrol `isPlaceholder` (`src/core/init.ts`): kurulum metinlerinin dil tablosundan üretilir, yani Türkçe kurulan bir ağaçtaki yer tutucular da sayılır. Yeni bir dil eklendiğinde burada yapılacak bir şey yok.

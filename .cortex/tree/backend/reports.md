---
title: Raporlar
summary: "Dönem raporu (7/30/90 gün veya tarih aralığı): AI ve insan aktivitesi,
  açılan/kapanan kayıtlar, sorular, kararlar, AI taslak onay oranı, issue yaşı,
  eskimiş bilgi. Sayılarak hesaplanır, LLM yok. JSON veya TR/EN markdown."
tags:
  - rapor
links:
  code:
    - file: src/core/reports.ts
    - file: src/core/reportMarkdown.ts
    - file: web/src/pages/Reports.tsx
    - file: src/util/time.ts
verified_at_commit: 4286d44b16a1e5a8ee46681a64ba1e3d593809d0
id: 01M34QY9PF26EEEGQRYECABXXH
status: active
updated_by: ai-agent
updated_at: 2026-09-22T14:53:23.122Z
---

- `parsePeriod`: göreli dönemler projenin saat diliminde takvim gününe hizalı ("7d" = bugün + önceki 6 gün). Saat dilimi `cortex.config.yaml` → `timezone`, yoksa UTC. Gün hesabı `src/util/time.ts` içinde, yalnızca Intl ile; yaz saati geçişleri doğru. En fazla 366 gün.
- `ReportService.build` dönemin aktivitesini (`activityBetween`) ve o anki kalemleri, taslakları, eskime durumunu okur.
- `reportToMarkdown(report, lang)`: Slack'e veya PR açıklamasına yapıştırmak için.
- Erişim: `GET /api/report` (`format=md`), MCP `cortex_report`, CLI `cortex report`, panoda Raporlar sayfası.
- "Belgelenmemiş dal" = özetinde hâlâ init'in yer tutucu metni olan dal.

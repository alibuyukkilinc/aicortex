---
kind: node
target: backend/reports
proposed_by: ai-agent
reason: S2 aktiviteyi kayıt ve denetim olarak ayırdı; düğüm eski tek sayıyı
  anlatıyordu.
base_rev: 27f47649
id: 01M3809JFPAZWCB7591SF8QPX3
proposed_at: 2026-09-23T20:46:09.910Z
data:
  path: backend/reports
  title: Raporlar
  summary: "Dönem raporu (7/30/90 gün veya tarih aralığı): gerekçeli kayıtlar ve
    ayrı sayılan denetim izi, açılan/kapanan kayıtlar, sorular, kararlar, AI
    taslak onay oranı, issue yaşı, eskimiş bilgi. Sayılarak hesaplanır, LLM yok.
    JSON veya TR/EN markdown."
  links:
    code:
      - file: src/core/reports.ts
      - file: src/core/reportMarkdown.ts
      - file: web/src/pages/Reports.tsx
      - file: web/src/charts.tsx
      - file: src/util/time.ts
  verified_at_commit: 5e6d7ba
  id: 01M34QY9PF26EEEGQRYECABXXH
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T20:46:09.908Z
---

- `parsePeriod`: göreli dönemler projenin saat diliminde takvim gününe hizalı ("7d" = bugün + önceki 6 gün). Saat dilimi `cortex.config.yaml` → `timezone`, yoksa UTC. Gün hesabı `src/util/time.ts` içinde, yalnızca Intl ile; yaz saati geçişleri doğru. En fazla 366 gün.
- `ReportService.build` dönemin aktivitesini (`activityBetween`) ve o anki kalemleri, taslakları, eskime durumunu okur.
- Aktivite iki ayrı sayı: `totals.activity.logged` (birinin kendi yazdığı "ne yaptım, neden" kaydı) ve `totals.activity.system` (Cortex'in denetim kaydı). Manşet `logged`'dır; bir AI turu onlarca denetim kaydı ürettiği için ikisini toplamak işi değil yazma sayısını ölçer. `daily[].ai/human` yalnızca kayıtları, `daily[].system` denetimi sayar.
- Panoda denetim serisi bir bağlam serisidir (`Series.context`, `web/src/charts.tsx`): açıklamada ve ipucunda görünür, çizilmez ve ekseni belirlemez.
- `reportToMarkdown(report, lang)`: Slack'e veya PR açıklamasına yapıştırmak için.
- Erişim: `GET /api/report` (`format=md`), MCP `cortex_report`, CLI `cortex report`, panoda Raporlar sayfası.
- "Belgelenmemiş dal" = özetinde hâlâ init'in yer tutucu metni olan dal.

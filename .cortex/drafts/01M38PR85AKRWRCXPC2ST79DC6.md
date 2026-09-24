---
kind: node
target: backend/activity
proposed_by: ai-agent
reason: "Gözden geçirme: log cevabındaki eskime bildirimi ve HEAD kontrolü (S3,
  S9), yeni denetim eylemleri (claim/attach), merge=union ve rapordaki ayrım
  eklendi."
base_rev: 07c19f12
id: 01M38PR85AKRWRCXPC2ST79DC6
proposed_at: 2026-09-24T03:18:39.530Z
data:
  path: backend/activity
  title: Aktivite günlüğü
  summary: "Kim ne yaptı ve neden: eylem, özet, neden (kod değişikliği, düzeltme,
    yeniden düzenleme, ayar ve yayında zorunlu), dosyalar, commit, ilgili
    kayıtlar. Cevap, değişikliğin eskittiği bilgiyi söyler. Denetim kayıtları da
    burada; dosyalar git'te union ile birleşir."
  links:
    code:
      - file: src/core/activity.ts
      - file: src/store/activity.ts
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34QY9JNH4GZNC68N7H8SJ0M
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:18:39.521Z
---

- `ActivityService.log` kaydı `rules/activity.schema.yaml`'a göre denetler; `refs` gerçek bir kalem kimliği ya da düğüm yolu olmalı.
- Cevap, değiştirilen dosyaları anlatan bilgi düğümlerini listeler (`related_knowledge`). Dosya bildirilmişse önce HEAD'e bakılır (`staleness.refresh(false, true)`: kısıtlamayı atlar, yalnızca HEAD değiştiyse yeniden hesaplar), çünkü AI genelde commit'ten saniyeler sonra kaydeder. Eskiyen düğümler `stale: { severity, files }` ile işaretlenir ve ipucu "bunları bu turda güncelle ya da doğrula" der (taslak olarak insana düşer).
- Sistem kayıtları (`node.updated`, `draft.*`, `item.created/updated/replied/claimed/released/attached/detached`, `rules.updated`) `meta` taşır: tür, eski/yeni durum, taslak türü, öneren. Raporlar metni ayrıştırmak zorunda kalmaz; eski kayıtlar için metin ayrıştırma yedek olarak duruyor.
- Depolama `src/store/activity.ts`: `activity/<gün>/<aktör>.jsonl`, yalnızca ekleme. Aynı aktör iki makinede aynı gün yazarsa aynı dosyaya ekler; `.cortex/.gitattributes` bu dosyaları `merge=union` ile birleştirir (satırlar bağımsız, kimlik tekil, okuyanlar kimliğe göre sıralar). Birleştirmede bozulmuş tek satır atlanır, günlüğün geri kalanı okunur.
- Raporda manşet yalnızca kayıtlardır (`logged`); denetim kayıtları ayrı sayılır (`system`).

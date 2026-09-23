---
kind: node
target: backend/approval
proposed_by: ai-agent
reason: S3 onayda yeniden sabitleme ve stale_after_approval uyarısını ekledi;
  bağlı satır aralığı (420-560) da kaymıştı, putNode..many aralığına
  güncellendi.
base_rev: 85220d03
id: 01M380ZK0FZB69NQ4SGVZQK7Y7
proposed_at: 2026-09-23T20:58:11.343Z
data:
  path: backend/approval
  title: Taslaklar ve onay politikası
  summary: "Her tür için cortex.config.yaml'da politika var: auto (direkt
    yazılır), review (taslak olur) veya human_only (AI yazamaz). AI'ın bilgi
    düğümü yazımları taslak olur; insan tek tek veya toplu onaylar ya da
    reddeder. Onayda düğüm, kodu değişmediyse HEAD'e sabitlenir."
  links:
    code:
      - file: src/core/cortex.ts
        lines: 543-752
      - file: src/store/drafts.ts
      - file: web/src/pages/Approvals.tsx
  verified_at_commit: e3f0a0a
  id: 01M34QY9GN6ZWRZ7CKCPF5SVBN
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-23T20:58:11.338Z
---

- `init` sonrası varsayılan: `node: review`, diğerleri `auto`. Kararlar `auto` çünkü kabul ve ret zaten yalnızca insana ait.
- AI `review` altında düğüm yazınca üst dalın var olduğu hemen kontrol edilir, sonra taslak kaydedilir; o anki düğümün özeti `base_rev` olarak saklanır.
- AI aynı düğüme yeniden taslak önerirse eski taslağının yerine geçer; incelemeci her düğüm için tek taslak görür.
- `approve`: taslaktan sonra düğüm değiştiyse reddeder (409 `conflict`), zorlanırsa yine de uygular.
- Onayda sabitleme (`pinOnApproval`): taslağın bağlı dosyaları öneri commit'i ile HEAD arasında değişmediyse düğüm HEAD'e sabitlenir. Değiştiyse eski commit korunur, sonuç `warning: "stale_after_approval"` ve `stale_changes` döner; pano "Kontrol ettim: HEAD'de doğrula" seçeneğini sunar. `verify_at_head=true` (tekil: sorgu, toplu: gövde) onaylayanın HEAD'e kefil olmasıdır. Eskiden onaylanan her taslak öneri commit'inde kalıyordu ve arada dosyasına dokunan her commit onu doğar doğmaz eskitiyordu.
- Toplu onay/ret (`approveMany`, `rejectMany`): önce üst düğümler onaylanır, böylece yeni bir dal ve altındakiler birlikte onaylanabilir. Biri hata verirse diğerleri devam eder, hatalı olan ayrıca bildirilir; onaydan sonra hâlâ eskimiş olanlar `stale_after_approval` listesinde döner.
- Onay ve ret yalnızca insana ait ve denetim kaydı bırakır (`draft.approved` / `draft.rejected`); raporlar AI güven oranını buradan hesaplar.
- Taslaklar `.cortex/drafts/` altında dosyadır; bekleyen onaylar da git'te saklanır.
- Aktör başına onay istisnası: `Actor.policy` (ör. hub'daki Güvenilir AI rolü `{ node: "auto" }`), yoksa projenin politikası geçerli.
- Hub'da onay listesi: onaylama yetkisi olan kendi görebildiği tüm taslakları, olmayan yalnızca kendi önerdiklerini görür.

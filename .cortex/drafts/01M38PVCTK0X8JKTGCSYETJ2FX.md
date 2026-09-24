---
kind: node
target: backend/approval
proposed_by: ai-agent
reason: "Gözden geçirme: eklerin taslak kuralı, sabitlemenin pratikteki sonucu
  (bugün 8 taslak eskimiş kaldı) ve kaymış satır aralığı (543-752 → 590-815)
  güncellendi."
base_rev: 33a4ccdc
id: 01M38PVCTK0X8JKTGCSYETJ2FX
proposed_at: 2026-09-24T03:20:22.611Z
data:
  path: backend/approval
  title: Taslaklar ve onay politikası
  summary: "Her tür için cortex.config.yaml'da politika var: auto (direkt
    yazılır), review (taslak olur) veya human_only (AI yazamaz). AI'ın bilgi
    düğümü yazımları taslak olur; insan tek tek veya toplu onaylar ya da
    reddeder. Onayda düğüm, kodu değişmediyse HEAD'e sabitlenir. Ekler taslağa
    giremez."
  links:
    code:
      - file: src/core/cortex.ts
        lines: 590-815
      - file: src/store/drafts.ts
      - file: web/src/pages/Approvals.tsx
  verified_at_commit: 3295916c724365d800427f9468950a5ad1f02895
  id: 01M34QY9GN6ZWRZ7CKCPF5SVBN
  status: active
  updated_by: ai-agent
  updated_at: 2026-09-24T03:20:22.603Z
---

- `init` sonrası varsayılan: `node: review`, diğerleri `auto`. Kararlar `auto` çünkü kabul ve ret zaten yalnızca insana ait.
- AI `review` altında düğüm yazınca üst dalın var olduğu hemen kontrol edilir, sonra taslak kaydedilir; o anki düğümün özeti `base_rev` olarak saklanır.
- AI aynı düğüme yeniden taslak önerirse eski taslağının yerine geçer; incelemeci her düğüm için tek taslak görür.
- `approve`: taslaktan sonra düğüm değiştiyse reddeder (409 `conflict`), zorlanırsa yine de uygular.
- Onayda sabitleme (`pinOnApproval`): taslağın bağlı dosyaları öneri commit'i ile HEAD arasında değişmediyse düğüm HEAD'e sabitlenir. Değiştiyse eski commit korunur, sonuç `warning: "stale_after_approval"` ve `stale_changes` döner; pano "Kontrol ettim: HEAD'de doğrula" seçeneğini sunar. `verify_at_head=true` (tekil: sorgu, toplu: gövde) onaylayanın HEAD'e kefil olmasıdır. Sonuç: bir taslağı yazdıktan sonra aynı dosyalara kod commit'lenirse, onaylansa bile eskimiş kalır (2026-09-24'te 11 taslağın 8'inde böyle oldu) — taslakları kod durulduktan sonra yazmak ya da HEAD'de doğrulamak gerekir.
- Toplu onay/ret (`approveMany`, `rejectMany`): önce üst düğümler onaylanır, böylece yeni bir dal ve altındakiler birlikte onaylanabilir. Biri hata verirse diğerleri devam eder, hatalı olan ayrıca bildirilir; onaydan sonra hâlâ eskimiş olanlar `stale_after_approval` listesinde döner ve pano "İncele" ile Eskimiş bilgi sayfasına götürür.
- Onay ve ret yalnızca insana ait ve denetim kaydı bırakır (`draft.approved` / `draft.rejected`); raporlar AI güven oranını buradan hesaplar.
- Taslaklar `.cortex/drafts/` altında dosyadır; bekleyen onaylar da git'te saklanır.
- Aktör başına onay istisnası: `Actor.policy` (ör. hub'daki Güvenilir AI rolü `{ node: "auto" }`), yoksa projenin politikası geçerli.
- Ekler taslak olamaz (bayt taşıyamaz): politikası AI için `review` olan bir türde AI ek yükleyemez/kaldıramaz (403), `auto`'da doğrudan yükler, insan her zaman yükler (`ItemService.attachGate`).
- Hub'da onay listesi: onaylama yetkisi olan kendi görebildiği tüm taslakları, olmayan yalnızca kendi önerdiklerini görür.

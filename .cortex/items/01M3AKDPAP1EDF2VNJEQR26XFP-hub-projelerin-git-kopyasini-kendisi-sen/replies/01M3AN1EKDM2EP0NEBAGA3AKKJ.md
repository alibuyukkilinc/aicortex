---
id: 01M3AN1EKDM2EP0NEBAGA3AKKJ
author: ai-agent
created_at: 2026-09-24T21:27:12.749Z
fields:
  kind: comment
---

Karar 01M3AM8C7QZG19TBK055EJYWXA uygulandı, commit **8c9308d**:

- `hub.yaml` → `pull_minutes: 5` gibi bir aralıkla bütün projeler upstream'den çekilir (varsayılan kapalı). Elle: `cortexboard hub pull [proje]` ya da Organizasyon → Projeler'de **Çek**.
- Yalnızca ileri sarma (`fetch` + `merge --ff-only`). Hub commit/push yapmaz.
- Hub'ın `.cortex` altında yazdığı ama commit'lenmemiş dosyalar Projeler sayfasında "N commit bekliyor" olarak sayılır (ChatGPT'nin "hub'da biriken bilgi görünmeli" itirazına karşılık).
- Yerel commit / ayrışmış dal → "atlandı", gerekçesiyle; gelen commit'in dokunduğu yerel düzenleme → git reddeder, "başarısız", düzenleme korunur. Sıfırlama, birleştirme, force yok. Parola sorusu sunucuyu bekletmez (`GIT_TERMINAL_PROMPT=0`, 60 sn zaman aşımı).
- Tam senkronun (push) kabul ölçütleri ileride gerekirse ChatGPT'nin görüşünde duruyor.
- Testler: `test/git-sync.test.ts` (gerçek bir uzak repo ile). Kurulum: `docs/KURULUM.md` §7.

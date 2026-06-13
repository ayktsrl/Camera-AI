// Eyes-free sesli koçluk KONTRATI — owner spor salonunda ekrana bakmadan tüm seansı
// kulakla yürütür. Bu test "hangi olayda ne söyleniyor" metnini sabitler + kritik
// geçişlerin (set bitti / seans sonu / kalan-tekrar) asla sessiz kalmadığını doğrular.

import { describe, it, expect } from "vitest";
import {
  setDoneReps,
  setDoneTimed,
  setDoneHold,
  sessionDone,
  repMilestone,
  REP_MILESTONE,
  warningSayOptions,
} from "../coachLines";

describe("set bitti anonsları (eyes-free kritik geçiş)", () => {
  it("rep set: tekrar sayısı + 'Aferin' söylenir", () => {
    const line = setDoneReps(10);
    expect(line).toContain("Set bitti");
    expect(line).toContain("10 tekrar");
    expect(line).toContain("Aferin");
  });

  it("rep set: count null ise sayı atlanır ama 'Set bitti'/'Aferin' kalır", () => {
    expect(setDoneReps(null)).toBe("Set bitti. Aferin.");
  });

  it("süre-dozlu set: 'süre doldu' söylenir", () => {
    expect(setDoneTimed()).toContain("süre doldu");
  });

  it("izometrik (plank) set: tutulan süre söylenir", () => {
    const line = setDoneHold(30);
    expect(line).toContain("30 saniye tuttun");
    expect(line).toContain("Aferin");
  });

  it("izometrik set: süre 0 ise süre kısmı atlanır", () => {
    expect(setDoneHold(0)).toBe("Set bitti. Aferin.");
  });
});

describe("seans sonu anonsu (eyes-free kritik geçiş)", () => {
  it("toplam set sayısı + 'Antrenman bitti' + 'Aferin' söylenir", () => {
    const line = sessionDone(18);
    expect(line).toContain("Antrenman bitti");
    expect(line).toContain("18 set");
    expect(line).toContain("Aferin");
  });
});

describe("kalan-tekrar kilometre taşı (salon — her tekrar değil, kalan vurgulanır)", () => {
  it("hedefe 1 kala 'Son tekrar'", () => {
    expect(repMilestone(9, 10)).toEqual(REP_MILESTONE.last);
  });

  it("hedefe 3 kala '3 kaldı' (hedef > 4 ise)", () => {
    expect(repMilestone(7, 10)).toEqual(REP_MILESTONE.threeLeft);
  });

  it("kısa sette (hedef <= 4) '3 kaldı' söylenmez (spam önler)", () => {
    expect(repMilestone(1, 4)).toBeNull();
  });

  it("ara tekrarlarda kilometre taşı yok (her tekrar sayım sesi ayrı)", () => {
    expect(repMilestone(5, 10)).toBeNull();
  });

  it("rep-dozlu değilse (target null) kilometre taşı yok", () => {
    expect(repMilestone(5, null)).toBeNull();
  });

  it("son tekrar 3-kala'nın önüne geçer (remaining=1 öncelikli)", () => {
    // hedef=2: count=1 → remaining=1 → 'Son tekrar' (3-kala değil)
    expect(repMilestone(1, 2)).toEqual(REP_MILESTONE.last);
  });
});

describe("form hatası önceliği (kritik öne çıkar, salonda güvenlik)", () => {
  it("kritik hata: kuyruğu keser (interrupt) + kısa cooldown", () => {
    const opts = warningSayOptions({ rule: "kneeValgus", severity: "critical" });
    expect(opts.interrupt).toBe(true);
    expect(opts.cooldownMs).toBeLessThan(4000); // varsayılan 4 sn'den kısa
    expect(opts.key).toBe("kneeValgus");
  });

  it("major hata: mevcut cooldown deseni (interrupt yok → spam dengesi korunur)", () => {
    const opts = warningSayOptions({ rule: "depth", severity: "major" });
    expect(opts.interrupt).toBeUndefined();
    expect(opts.cooldownMs).toBeUndefined();
    expect(opts.key).toBe("depth");
  });

  it("minor/severity yoksa da kuyruğu kesmez", () => {
    expect(warningSayOptions({ rule: "tempo" }).interrupt).toBeUndefined();
  });
});

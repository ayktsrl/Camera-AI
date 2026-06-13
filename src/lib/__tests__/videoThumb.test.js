// videoThumb — ID çıkarımı (3 URL formu) + thumbnail üretimi + fallback.

import { describe, it, expect } from "vitest";
import { youTubeId, thumbUrl } from "../videoThumb";

describe("youTubeId", () => {
  it("watch?v=ID formundan ID çıkarır", () => {
    expect(youTubeId("https://www.youtube.com/watch?v=czMg1_idVcg")).toBe(
      "czMg1_idVcg"
    );
  });

  it("watch + ekstra query (timestamp) ile de çalışır", () => {
    expect(
      youTubeId("https://www.youtube.com/watch?v=oAHFF8wziy0&t=30s")
    ).toBe("oAHFF8wziy0");
  });

  it("youtu.be/ID kısa formundan ID çıkarır", () => {
    expect(youTubeId("https://youtu.be/EdgOc-sbddA")).toBe("EdgOc-sbddA");
  });

  it("shorts/ID formundan ID çıkarır", () => {
    expect(youTubeId("https://www.youtube.com/shorts/SuvO4TBwSu4")).toBe(
      "SuvO4TBwSu4"
    );
  });

  it("www'sız ve m. host'larını da kabul eder", () => {
    expect(youTubeId("https://youtube.com/watch?v=czMg1_idVcg")).toBe(
      "czMg1_idVcg"
    );
    expect(youTubeId("https://m.youtube.com/watch?v=czMg1_idVcg")).toBe(
      "czMg1_idVcg"
    );
  });

  it("embed/ID formundan ID çıkarır", () => {
    expect(youTubeId("https://www.youtube.com/embed/czMg1_idVcg")).toBe(
      "czMg1_idVcg"
    );
  });

  it("ID çıkarılamayan / geçersiz girdilerde null döner", () => {
    expect(youTubeId(null)).toBeNull();
    expect(youTubeId(undefined)).toBeNull();
    expect(youTubeId("")).toBeNull();
    expect(youTubeId("not a url")).toBeNull();
    expect(youTubeId("https://vimeo.com/123456789")).toBeNull();
    expect(youTubeId("https://www.youtube.com/")).toBeNull();
    expect(youTubeId("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});

describe("thumbUrl", () => {
  it("geçerli URL için hqdefault thumbnail üretir", () => {
    expect(thumbUrl("https://www.youtube.com/watch?v=czMg1_idVcg")).toBe(
      "https://img.youtube.com/vi/czMg1_idVcg/hqdefault.jpg"
    );
  });

  it("shorts ve youtu.be için de hqdefault üretir", () => {
    expect(thumbUrl("https://www.youtube.com/shorts/SuvO4TBwSu4")).toBe(
      "https://img.youtube.com/vi/SuvO4TBwSu4/hqdefault.jpg"
    );
    expect(thumbUrl("https://youtu.be/EdgOc-sbddA")).toBe(
      "https://img.youtube.com/vi/EdgOc-sbddA/hqdefault.jpg"
    );
  });

  it("ID çıkarılamazsa null döner (fallback tetiklenir)", () => {
    expect(thumbUrl("https://vimeo.com/123456789")).toBeNull();
    expect(thumbUrl(null)).toBeNull();
  });
});

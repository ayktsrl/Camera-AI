// YouTube videoUrl → thumbnail URL üreteci (saf, ağsız, bağımlılıksız).
//
// Program datasındaki videoUrl üç biçimde gelir:
//   1) https://www.youtube.com/watch?v=ID          (ekstra query ?v=ID&t=...)
//   2) https://youtu.be/ID
//   3) https://www.youtube.com/shorts/ID
//
// hqdefault.jpg her video tipinde (shorts dahil) ve embeddable:false
// videolarda da publictir — thumbnail erişimi embed iznine bağlı değildir.
// ID çıkarılamazsa null döner; çağıran taraf temiz fallback gösterir.

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** videoUrl'den 11 karakterlik YouTube video ID'sini çıkarır; yoksa null. */
export function youTubeId(videoUrl) {
  if (typeof videoUrl !== "string" || videoUrl.length === 0) return null;

  let url;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");

  // youtu.be/ID
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return YT_ID_RE.test(id) ? id : null;
  }

  // youtube.com aileleri
  if (host === "youtube.com" || host === "m.youtube.com") {
    // watch?v=ID
    const v = url.searchParams.get("v");
    if (v && YT_ID_RE.test(v)) return v;

    // /shorts/ID  veya  /embed/ID
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      (segments[0] === "shorts" || segments[0] === "embed") &&
      YT_ID_RE.test(segments[1] ?? "")
    ) {
      return segments[1];
    }
  }

  return null;
}

/**
 * videoUrl'den thumbnail görsel URL'i üretir; ID çıkarılamazsa null.
 * hqdefault: 480×360, tüm video tiplerinde mevcut, en güvenilir varyant.
 */
export function thumbUrl(videoUrl) {
  const id = youTubeId(videoUrl);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

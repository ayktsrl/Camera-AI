// İn-app hedef-poz önizlemesi — kendi ürettiğimiz inline SVG silüet.
// Dış link / video / thumbnail YOK; offline + telif-temiz (owner: "link falan koyma").
// Hareket başına basit iki-poz silüeti (tepe + dip), nötr çizgi-figür.
// Bilinmeyen hareket → nötr "hareket" simgesi (figür ayakta).
//
// Silüetler kasıtlı minimal: P0'da kullanıcının "ne yapacağını" anlaması yeter;
// zengin iskelet animasyonu Dalga 2 kapsamında (spec §4 P1).

// ortak çizim primitifleri (viewBox 0 0 100 100) -----------------------------

function Figure({ joints, opacity = 1 }) {
  // joints: { head:[x,y], shoulder, hip, knee, ankle, elbow?, wrist? }
  const { head, shoulder, hip, knee, ankle, elbow, wrist } = joints;
  const line = (a, b, key) =>
    a && b ? (
      <line
        key={key}
        x1={a[0]}
        y1={a[1]}
        x2={b[0]}
        y2={b[1]}
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    ) : null;
  return (
    <g opacity={opacity}>
      {line(shoulder, hip, "torso")}
      {line(hip, knee, "thigh")}
      {line(knee, ankle, "shin")}
      {elbow && line(shoulder, elbow, "uarm")}
      {wrist && line(elbow, wrist, "farm")}
      {head && (
        <circle
          cx={head[0]}
          cy={head[1]}
          r="5.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        />
      )}
    </g>
  );
}

// hareket başına iki-poz silüeti ---------------------------------------------

const POSES = {
  squat: {
    top: {
      head: [50, 16],
      shoulder: [50, 26],
      hip: [50, 52],
      knee: [50, 72],
      ankle: [50, 90],
    },
    bottom: {
      head: [40, 30],
      shoulder: [42, 40],
      hip: [44, 64],
      knee: [62, 64],
      ankle: [60, 90],
    },
  },
  pushup: {
    // Yatay düzlem — yandan görünüm: gövde düz hat, dirsek açılır/kapanır.
    top: {
      head: [16, 40],
      shoulder: [30, 46],
      hip: [62, 52],
      knee: [80, 56],
      ankle: [94, 60],
      elbow: [30, 70],
      wrist: [30, 88],
    },
    bottom: {
      head: [16, 52],
      shoulder: [30, 58],
      hip: [62, 60],
      knee: [80, 62],
      ankle: [94, 64],
      elbow: [44, 78],
      wrist: [30, 88],
    },
  },
  lunge: {
    // Yan görünüm: ayakta (tepe) → öne hamle, ön diz bükük + gövde hafif öne (dip).
    top: {
      head: [50, 16],
      shoulder: [50, 26],
      hip: [50, 52],
      knee: [50, 72],
      ankle: [50, 90],
    },
    bottom: {
      // Öne hamle: ön ayak ileride (sağda), ön diz ~90° bükük; gövde hafif öne eğik.
      head: [46, 26],
      shoulder: [48, 36],
      hip: [50, 60],
      knee: [66, 74], // ön diz öne-aşağı (ayak ucunun üstünde, geçmeden)
      ankle: [68, 90], // ön ayak ileride
    },
  },
  generic: {
    top: {
      head: [50, 16],
      shoulder: [50, 28],
      hip: [50, 56],
      knee: [50, 76],
      ankle: [50, 92],
      elbow: [38, 42],
      wrist: [30, 56],
    },
    bottom: null,
  },
};

function poseKeyFor(exercise) {
  const ref = exercise?.ruleSetRef;
  if (ref === "squat") return "squat";
  if (ref === "pushup") return "pushup";
  if (ref === "lunge") return "lunge";
  return "generic";
}

/**
 * @param {object} exercise - { name, ruleSetRef }
 * @param {string} size     - "strip" | "sm" | "md", varsayılan "md"
 */
export default function PosePreview({ exercise, size = "md" }) {
  const poseKey = poseKeyFor(exercise);
  const pose = POSES[poseKey];
  const className = `pose-preview pose-preview--${size}`;

  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 100 100" className="pose-preview-svg">
        {/* zemin/destek çizgisi — duruşu yere oturtur */}
        <line
          x1="8"
          y1={poseKey === "pushup" ? "90" : "92"}
          x2="92"
          y2={poseKey === "pushup" ? "90" : "92"}
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.35"
        />
        {pose.bottom && <Figure joints={pose.bottom} opacity={0.35} />}
        <Figure joints={pose.top} opacity={1} />
      </svg>
    </span>
  );
}

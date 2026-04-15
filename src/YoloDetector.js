import * as tf from "@tensorflow/tfjs";

let yoloModel = null;
const INPUT_SIZE = 640;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);

  const interW = Math.max(0, x2 - x1);
  const interH = Math.max(0, y2 - y1);
  const interArea = interW * interH;

  const areaA = a.w * a.h;
  const areaB = b.w * b.h;
  const union = areaA + areaB - interArea;

  if (union <= 0) return 0;
  return interArea / union;
}

function nonMaxSuppression(boxes, iouThreshold = 0.45) {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept = [];

  while (sorted.length) {
    const current = sorted.shift();
    kept.push(current);

    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (iou(current, sorted[i]) > iouThreshold) {
        sorted.splice(i, 1);
      }
    }
  }

  return kept;
}

export async function loadYoloModel() {
  if (yoloModel) return yoloModel;

  yoloModel = await tf.loadGraphModel("/yolo/model.json");
  return yoloModel;
}

export async function detectPeople(video, scoreThreshold = 0.35) {
  if (!yoloModel) return [];
  if (!video || video.readyState < 2) return [];

  const inputTensor = tf.tidy(() => {
    return tf.browser
      .fromPixels(video)
      .resizeBilinear([INPUT_SIZE, INPUT_SIZE])
      .toFloat()
      .div(255)
      .expandDims(0);
  });

  const rawOutput = await yoloModel.executeAsync(inputTensor);
  const outputTensor = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;

  const shape = outputTensor.shape;
  const data = await outputTensor.data();

  tf.dispose(inputTensor);
  if (Array.isArray(rawOutput)) {
    rawOutput.forEach((tensor) => tensor.dispose());
  } else {
    outputTensor.dispose();
  }

  let numBoxes = 0;
  let channels = 0;
  let getValue;

  if (shape.length === 3 && shape[1] === 84) {
    numBoxes = shape[2];
    channels = shape[1];
    getValue = (channelIndex, boxIndex) => data[channelIndex * numBoxes + boxIndex];
  } else if (shape.length === 3 && shape[2] === 84) {
    numBoxes = shape[1];
    channels = shape[2];
    getValue = (channelIndex, boxIndex) => data[boxIndex * channels + channelIndex];
  } else {
    console.error("Unexpected YOLO output shape:", shape);
    return [];
  }

  const detections = [];

  for (let i = 0; i < numBoxes; i += 1) {
    const cx = getValue(0, i) / INPUT_SIZE;
    const cy = getValue(1, i) / INPUT_SIZE;
    const w = getValue(2, i) / INPUT_SIZE;
    const h = getValue(3, i) / INPUT_SIZE;

    // YOLO COCO class 0 = person
    const personScore = getValue(4, i);

    if (personScore < scoreThreshold) continue;

    const x = clamp(cx - w / 2, 0, 1);
    const y = clamp(cy - h / 2, 0, 1);
    const boxW = clamp(w, 0, 1);
    const boxH = clamp(h, 0, 1);

    detections.push({
      x,
      y,
      w: boxW,
      h: boxH,
      score: personScore,
      centerNorm: {
        x: clamp(x + boxW / 2, 0, 1),
        y: clamp(y + boxH / 2, 0, 1),
      },
    });
  }

  return nonMaxSuppression(detections);
}
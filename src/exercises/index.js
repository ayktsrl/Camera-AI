// Egzersiz kayıt defteri — UI buradan okur, motor buradan beslenir.
// Yeni egzersiz: tanım dosyasını yazın, buraya ekleyin; başka koda dokunmayın.

import { squat } from "./squat";
import { pushup } from "./pushup";
import { lunge } from "./lunge";
import { jumpingJack } from "./jumpingJack";
import { kneeRaise } from "./kneeRaise";
import { lateralRaise } from "./lateralRaise";
import { hammerCurl } from "./hammerCurl";
import { shoulderPress } from "./shoulderPress";

export const EXERCISES = [
  squat,
  pushup,
  lunge,
  jumpingJack,
  kneeRaise,
  lateralRaise,
  hammerCurl,
  shoulderPress,
];

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || EXERCISES[0];
}

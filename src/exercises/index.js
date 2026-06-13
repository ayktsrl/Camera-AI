// Egzersiz kayıt defteri — UI buradan okur, motor buradan beslenir.
// Yeni egzersiz: tanım dosyasını yazın, buraya ekleyin; başka koda dokunmayın.

import { squat } from "./squat";
import { pushup } from "./pushup";
import { lunge } from "./lunge";

export const EXERCISES = [squat, pushup, lunge];

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || EXERCISES[0];
}

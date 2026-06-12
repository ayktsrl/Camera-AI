// Egzersiz kayıt defteri — UI buradan okur, motor buradan beslenir.
// Yeni egzersiz: tanım dosyasını yazın, buraya ekleyin; başka koda dokunmayın.

import { squat } from "./squat";

export const EXERCISES = [squat];

export function getExercise(id) {
  return EXERCISES.find((e) => e.id === id) || EXERCISES[0];
}

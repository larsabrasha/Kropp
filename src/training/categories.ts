import { t } from '../i18n/i18n'
import { areasOf, isCardioOnly } from './editing'
import type { BodyArea, Exercise, Workout } from './model'

// An exercise's body areas, and the name and icon a workout gets from them.

/**
 * Categories for the exercises from the old training log, until they are set in the app. Hand-written:
 * the names say what they train better than any rule would. Keys are lower case.
 */
const DEFAULTS: Readonly<Record<string, readonly BodyArea[]>> = {
  'armhävningar på hantlar': ['Chest', 'Arms'],
  'axlar hantlar rakt upp': ['Shoulders'],
  'axlar hantlar rakt åt sidan': ['Shoulders'],
  'axlar hantlar sidan': ['Shoulders'],
  'axlar hantlar upp i bänk': ['Shoulders'],
  'axlar hantlar uppåt': ['Shoulders'],
  'axlar hantlar uppåt upprätt': ['Shoulders'],
  'benböj lår baksida': ['Legs'],
  'benböj lår framsida': ['Legs'],
  'benböj lår maskin': ['Legs'],
  'benböj lår uppåt i maskin': ['Legs'],
  'benböj med steg framåt': ['Legs'],
  'biceps böjd stång': ['Arms'],
  'biceps hantlar': ['Arms'],
  'biceps rak stång': ['Arms'],
  'biceps stång': ['Arms'],
  'biceps stång rulla fingrar': ['Arms'],
  'biceps vajer': ['Arms'],
  'biceps z-stång': ['Arms'],
  'bröst bänk sidan (ont)': ['Chest'],
  'bröst hantlar': ['Chest'],
  'bröst maskin': ['Chest'],
  'bröst med hantlar på bänk': ['Chest'],
  'bröst åt sidan med hantlar': ['Chest'],
  'bröstpress maskin': ['Chest'],
  bänkpress: ['Chest'],
  'bänkpress hantlar': ['Chest'],
  'bänkpress med hantlar': ['Chest'],
  'cykel till gymet': ['Legs'],
  deadlift: ['Back', 'Legs'],
  'dra bak i maskin': ['Back'],
  'dra hantel upp från mark': ['Back'],
  'dra mig upp i ringar': ['Back', 'Arms'],
  'dra ner i maskin': ['Back'],
  'dra ner stång': ['Back'],
  'dra ner stång i maskin': ['Back'],
  'dra ner två handtag i maskin': ['Back'],
  'dra upp axlar med hantlar': ['Shoulders'],
  'dra upp nacke/axlar med hantlar': ['Shoulders'],
  'dra upp stång mot mage stående': ['Back'],
  'dra vikt bakåt maskin': ['Back'],
  'gå upp på bänk': ['Legs'],
  'gång i maskin': ['Legs'],
  'häng i stång': ['Back', 'Arms'],
  'häng i stång + dra mig upp i ringar': ['Back', 'Arms'],
  'hänga i armarna': ['Back', 'Arms'],
  'höj ben från bänk': ['Core'],
  'höj och sänk ben från bänk': ['Core'],
  'höjning sänk ben liggandes på bänk': ['Core'],
  'löpning på band': ['Legs'],
  magmaskin: ['Core'],
  'marklyft?': ['Back', 'Legs'],
  plankan: ['Core'],
  'pull down maskin': ['Back'],
  'pull down maskin 2': ['Back'],
  'sit ups': ['Core'],
  'solar rakt upp bänk': ['Chest'],
  squats: ['Legs'],
  'squats med kettlebell': ['Legs'],
  'squats med kettlebell till huvud': ['Legs', 'Shoulders'],
  'sänk hängande från stång': ['Back', 'Arms'],
  triceps: ['Arms'],
  'triceps bakåt på bänk': ['Arms'],
  'triceps dips': ['Arms'],
  'triceps maskin': ['Arms'],
  'triceps rak stång bänk': ['Arms'],
  'triceps rak stång i maskin': ['Arms'],
  'triceps stång på bänk': ['Arms'],
  'triceps sänk från bänk': ['Arms'],
  'tricepshävningar på bänk': ['Arms'],
  'trips rep i maskin': ['Arms'],
  tåhävningar: ['Legs'],
  'underarm stång bakom': ['Arms'],
  'underarmar bakom rygg': ['Arms'],
  vader: ['Legs'],
  'vader egenvikt': ['Legs'],
}

/** The chosen categories, or the default for an exercise from the old log, or none. */
export function categoriesOf(exercise: Exercise): readonly BodyArea[] {
  return exercise.categories.length > 0 ? exercise.categories : (DEFAULTS[exercise.name.trim().toLowerCase()] ?? [])
}

/**
 * The picture that stands for a body area in the workout list: one exercise illustration per
 * area, so the icons match the exercise pictures and are cached the same way.
 */
const AREA_ICONS: Record<BodyArea, string> = {
  Legs: 'squat',
  Chest: 'bench-press',
  Back: 'lat-pulldown',
  Core: 'crunch',
  Arms: 'bicep-curl',
  Shoulders: 'overhead-press',
}

const CARDIO_ICON = 'running'

export type ExerciseMap = ReadonlyMap<string, Exercise>

/** The icon for a workout: its dominant area, the first in its name; undefined when none is known. */
export function iconFor(workout: Workout, exercises: ExerciseMap): string | undefined {
  const find = (id: string) => exercises.get(id)
  if (isCardioOnly(workout, find)) return CARDIO_ICON
  const [first] = areasOf(workout, find, categoriesOf)
  return first && AREA_ICONS[first]
}

export const MAX_AREAS_IN_NAME = 3

/** "Ben, rygg och mage", or "Kondition", or undefined when nothing is known yet. */
export function workoutName(workout: Workout, exercises: ExerciseMap): string | undefined {
  const find = (id: string) => exercises.get(id)
  if (isCardioOnly(workout, find)) return t('Workout.CardioOnly')

  // At most three areas, the ones with the most exercises, so a name stays one short line.
  const names = areasOf(workout, find, categoriesOf)
    .slice(0, MAX_AREAS_IN_NAME)
    .map((a, i) => (i === 0 ? t(`BodyArea.${a}`) : t(`BodyArea.${a}`).toLocaleLowerCase()))
  if (names.length === 0) return undefined
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} ${t('Common.And')} ${names.at(-1)}`
}

/** A workout's name in one word, where there is room for no more: its main area, or cardio. */
export function shortWorkoutName(workout: Workout, exercises: ExerciseMap): string | undefined {
  const find = (id: string) => exercises.get(id)
  if (isCardioOnly(workout, find)) return t('Workout.CardioOnly')
  const first = areasOf(workout, find, categoriesOf)[0]
  return first === undefined ? undefined : t(`BodyArea.${first}`)
}

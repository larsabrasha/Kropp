/**
 * The training model, as the aggregates are stored and synced. The JSON is the one the .NET version
 * wrote (camelCase, enums by name, dates as yyyy-MM-dd, null fields left out), so records written
 * before the port read the same. Never rename a field or an enum value: they are stored.
 */

/** A calendar date, yyyy-MM-dd. A date rather than a timestamp, so a time zone can never move it a day. */
export type DateOnly = string

/** What an exercise trains, and so what a workout is named after. */
export const BODY_AREAS = ['Legs', 'Chest', 'Back', 'Core', 'Arms', 'Shoulders'] as const
export type BodyArea = (typeof BODY_AREAS)[number]

export const EXERCISE_KINDS = ['Strength', 'Bodyweight', 'Timed', 'Cardio'] as const
/**
 * Strength: repetitions with a load in kilograms. Bodyweight: repetitions without an added load.
 * Timed: held for a number of seconds, like a plank. Cardio: duration, distance and heart rate.
 */
export type ExerciseKind = (typeof EXERCISE_KINDS)[number]

/**
 * Planned: nothing logged yet, also when its day has passed. Done: every exercise finished.
 * Skipped: no longer derived; kept so workouts stored with it can still be read.
 * InProgress: something logged, with exercises still to go.
 */
export const WORKOUT_STATUSES = ['Planned', 'Done', 'Skipped', 'InProgress'] as const
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number]

/** An entry in the exercise register. A workout refers to it by id, so renaming it rewrites nothing. */
export interface Exercise {
  id: string
  name: string
  kind: ExerciseKind
  /** A setting that holds between workouts, like "Sitthöjd 11". */
  settingsNote?: string
  isArchived: boolean
  /** What the exercise trains. Empty for exercises from before categories; they get a default by name. */
  categories: BodyArea[]
  /** The picture's folder name; undefined for the default by name, NO_ILLUSTRATION for none. */
  illustration?: string
  /** Cardio logged by time alone, like the treadmill walk: no distance, no pulse. */
  measuresTimeOnly: boolean
  /** How much − and + change the weight; undefined for DEFAULT_WEIGHT_STEP_KG. */
  weightStepKg?: number
}

export const NO_ILLUSTRATION = 'none'
export const DEFAULT_WEIGHT_STEP_KG = 2.5
/** The steps offered: plates and machines mostly go by 2.5, dumbbells by 1 or 2. */
export const WEIGHT_STEPS = [0.5, 1, 1.25, 2, 2.5, 5] as const

export interface SetResult {
  reps?: number
  weightKg?: number
  seconds?: number
}

export interface WorkoutExercise {
  exerciseId: string
  order: number
  comment?: string
  /** A setting for this occasion only, like "45 grader". */
  settings?: string
  targetSets?: number
  targetReps?: number
  targetWeightKg?: number
  targetSeconds?: number
  /** Cardio's plan. What was done is durationMinutes and distanceKm. */
  targetDurationMinutes?: number
  targetDistanceKm?: number
  /** What was actually done, one entry per set. */
  sets: SetResult[]
  /** Ended before the plan was done. The plan is kept, so the next workout plans the same. */
  isSkipped: boolean
  durationMinutes?: number
  distanceKm?: number
  avgHeartRate?: number
}

/** One visit to the gym, and the unit of sync: exercises and sets travel with it. */
export interface Workout {
  id: string
  date: DateOnly
  sessionNumber?: number
  status: WorkoutStatus
  note?: string
  /** The template the workout was planned from, if any. */
  templateId?: string
  exercises: WorkoutExercise[]
}

/** A standard workout to plan from: its exercises in order with their targets, never any results. */
export interface WorkoutTemplate {
  id: string
  name: string
  exercises: WorkoutExercise[]
}

/** The user's settings: one document, always under SETTINGS_ID. */
export interface UserSettings {
  id: string
  sessionsPerWeek: number
  /**
   * When all data was last deleted (LocalRepository.deleteAll), as an ISO timestamp in UTC. What
   * that deleted counts as missing to a later import, so a backup brings it back; what was
   * deleted after it stays deleted.
   */
  resetAt?: string
}

export const SETTINGS_ID = '00000000-0000-0000-0000-00000000c0de'
export const MIN_SESSIONS_PER_WEEK = 1
export const MAX_SESSIONS_PER_WEEK = 7
export const DEFAULT_SETTINGS: UserSettings = { id: SETTINGS_ID, sessionsPerWeek: 3 }

/** Days from one session to the next that spread the week's sessions evenly: 3 a week, every other day. */
export function daysBetweenSessions(settings: UserSettings): number {
  const n = Math.min(Math.max(settings.sessionsPerWeek, MIN_SESSIONS_PER_WEEK), MAX_SESSIONS_PER_WEEK)
  return Math.max(1, Math.trunc(7 / n))
}

/** A deleted workout, kept whole for a while, under the workout's id. */
export interface TrashedWorkout {
  id: string
  /** An ISO timestamp in UTC. */
  deletedAt: string
  workout: Workout
}

export const EMPTY_ID = '00000000-0000-0000-0000-000000000000'

export function newId(): string {
  return crypto.randomUUID()
}

// Reading: the .NET serializer left out nulls and filled defaults for missing fields. These do the same,
// so a document written by either version reads alike. Unknown fields are kept as they are.

type Json = Record<string, unknown>

const orUndefined = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value)

export function readSet(json: Json): SetResult {
  return withoutNulls(json) as SetResult
}

export function readEntry(json: Json): WorkoutExercise {
  const e = withoutNulls(json)
  return {
    ...e,
    exerciseId: String(e.exerciseId).toLowerCase(),
    order: typeof e.order === 'number' ? e.order : 0,
    sets: Array.isArray(e.sets) ? e.sets.map((s: Json) => readSet(s)) : [],
    isSkipped: e.isSkipped === true,
  }
}

export function readWorkout(json: Json): Workout {
  const w = withoutNulls(json)
  return {
    ...w,
    id: String(w.id).toLowerCase(),
    status: (orUndefined(w.status) as WorkoutStatus | undefined) ?? 'Planned',
    templateId: typeof w.templateId === 'string' ? w.templateId.toLowerCase() : undefined,
    exercises: Array.isArray(w.exercises) ? w.exercises.map((e: Json) => readEntry(e)) : [],
  } as Workout
}

export function readExercise(json: Json): Exercise {
  const e = withoutNulls(json)
  return {
    ...e,
    id: String(e.id).toLowerCase(),
    kind: (e.kind as ExerciseKind | undefined) ?? 'Strength',
    isArchived: e.isArchived === true,
    categories: Array.isArray(e.categories) ? e.categories : [],
    measuresTimeOnly: e.measuresTimeOnly === true,
  } as Exercise
}

export function readTemplate(json: Json): WorkoutTemplate {
  const t = withoutNulls(json)
  return {
    ...t,
    id: String(t.id).toLowerCase(),
    exercises: Array.isArray(t.exercises) ? t.exercises.map((e: Json) => readEntry(e)) : [],
  } as WorkoutTemplate
}

export function readSettings(json: Json): UserSettings {
  const s = withoutNulls(json)
  return {
    ...s,
    id: typeof s.id === 'string' ? s.id.toLowerCase() : SETTINGS_ID,
    sessionsPerWeek: typeof s.sessionsPerWeek === 'number' ? s.sessionsPerWeek : DEFAULT_SETTINGS.sessionsPerWeek,
  }
}

export function readTrashedWorkout(json: Json): TrashedWorkout {
  const t = withoutNulls(json)
  return { ...t, id: String(t.id).toLowerCase(), workout: readWorkout(t.workout as Json) } as TrashedWorkout
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withoutNulls(json: Json): Record<string, any> {
  return Object.fromEntries(Object.entries(json ?? {}).filter(([, v]) => v !== null && v !== undefined))
}

/** JSON as the .NET serializer wrote it: null and undefined fields left out. */
export function toJson(aggregate: unknown): string {
  return JSON.stringify(aggregate, (_, value) => (value === null ? undefined : value))
}

import type { LocalRepository } from '../sync/localRepo'

/**
 * Whether anything refers to the exercise: a workout, planned or done, or a template. Only an
 * exercise nothing refers to may be deleted; one in use is hidden instead, so no workout ever
 * shows an exercise that is gone.
 */
export function isInUse(repository: LocalRepository, exerciseId: string): boolean {
  const refers = (owner: { exercises: { exerciseId: string }[] }) =>
    owner.exercises.some((e) => e.exerciseId === exerciseId)
  return repository.peekAll('workout').some(refers) || repository.peekAll('template').some(refers)
}

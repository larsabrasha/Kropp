import { formatDate, t } from '../i18n/i18n'
import { daysBetween, today } from '../training/dates'
import type { DateOnly, ExerciseKind, WorkoutExercise } from '../training/model'
import { isShort, num, result, setMain, setText } from '../training/text'

const SPEECH_BUBBLE =
  'M12 3C6.5 3 2 6.8 2 11.5c0 2.6 1.4 4.9 3.6 6.5-.2 1.3-.8 2.5-1.8 3.4-.2.2 0 .6.3.6 2 0 3.7-.8 4.9-1.7 1 .3 2 .4 3 .4 5.5 0 10-3.8 10-8.5S17.5 3 12 3z'

/** "mån 21 sep": the language's short names, without the full stop Swedish puts after them. */
const shortDate = (date: DateOnly) => formatDate(date, 'ddd d MMM').replaceAll('.', '')

function ago(date: DateOnly): string {
  const days = daysBetween(date, today())
  return days <= 0 ? t('Entry.AgoToday') : days === 1 ? t('Entry.AgoYesterday') : t('Entry.AgoDays', days)
}

/**
 * Below the sets, one line each, every one opening the editor: how it went last time and what was
 * said then, the settings to use, and what is said this time. The lines under the buttons stand in
 * by half the buttons' corner radius (px-1.5), where the eye sees the rounded edge begin; flush with
 * it they look crowded, a whole radius in.
 */
export function EntryContextLines({
  entry,
  kind,
  forTemplate,
  lastTime,
  measuredLastTime,
  lastTimeDate,
  settingsParts,
  onOpenEditor,
}: {
  entry: WorkoutExercise
  kind: ExerciseKind
  forTemplate: boolean
  lastTime: WorkoutExercise | undefined
  /** lastTime as far as the exercise measures it (see ExerciseEntryCard). */
  measuredLastTime: WorkoutExercise | undefined
  lastTimeDate: DateOnly | undefined
  /** The settings to use: the exercise's own, then this time's. */
  settingsParts: string[]
  onOpenEditor: () => void
}) {
  return (
    <>
      {lastTime && measuredLastTime && (
        <LastTimeLines last={lastTime} shown={measuredLastTime} date={lastTimeDate} kind={kind} onTap={onOpenEditor} />
      )}
      {settingsParts.length > 0 && (
        <button
          type="button"
          onClick={onOpenEditor}
          aria-label={`${t('Entry.Settings')}: ${settingsParts.join(', ')}`}
          data-testid="settings-line"
          className="mt-1.5 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
              <circle cx="16" cy="6" r="2" />
              <circle cx="10" cy="12" r="2" />
              <circle cx="18" cy="18" r="2" />
            </svg>
          </span>
          <span className="min-w-0 break-words">{settingsParts.join(' · ')}</span>
        </button>
      )}
      {!forTemplate && entry.comment?.trim() && (
        <button
          type="button"
          onClick={onOpenEditor}
          aria-label={`${t('Entry.Comment')}: ${entry.comment}`}
          data-testid="comment"
          className="mt-1.5 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
            <svg className="size-[18px] text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="currentColor">
              <path d={SPEECH_BUBBLE} />
            </svg>
          </span>
          <span className="min-w-0 break-words whitespace-pre-line">{entry.comment}</span>
        </button>
      )}
    </>
  )
}

/** How it went last time, and what was said then. */
function LastTimeLines({
  last,
  shown,
  date,
  kind,
  onTap,
}: {
  last: WorkoutExercise
  shown: WorkoutExercise
  date: DateOnly | undefined
  kind: ExerciseKind
  onTap: () => void
}) {
  const label = date ? `${shortDate(date)} (${ago(date)}), ${result(shown, kind)}` : result(shown, kind)
  const first = shown.sets[0]?.weightKg
  const uniform = kind === 'Strength' && shown.sets.every((x) => x.weightKg === first) ? first : undefined
  return (
    <>
      <button
        type="button"
        onClick={onTap}
        aria-label={t('Entry.LastTime', label)}
        data-testid="last-time"
        className="mt-4 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {date && (
            <span data-testid="last-time-date">
              {shortDate(date)} ({ago(date)})
            </span>
          )}
          {kind === 'Cardio' || shown.sets.length === 0 ? (
            <span className="tabular-nums">{result(shown, kind)}</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1" data-testid="last-sets">
              {shown.sets.map((set, i) => {
                const shortSet = isShort(set, shown, kind)
                return (
                  <span
                    key={i}
                    className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${shortSet ? 'bg-amber-200 text-gray-900 dark:bg-amber-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                    data-short={shortSet ? 'true' : 'false'}
                  >
                    {uniform === undefined && kind === 'Strength' ? setText(set, kind) : setMain(set, kind)}
                  </span>
                )
              })}
              {uniform !== undefined && <span className="text-xs tabular-nums">× {num(uniform)} kg</span>}
            </span>
          )}
        </span>
      </button>
      {last.comment?.trim() && (
        <button
          type="button"
          onClick={onTap}
          aria-label={`${t('Entry.LastComment')}: ${last.comment}`}
          data-testid="last-comment"
          className="mt-1 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        >
          <span className="flex h-5 w-5 shrink-0 items-start justify-center" aria-hidden="true">
            <svg
              className="size-4 text-gray-300 dark:text-gray-600"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 2v9a4 4 0 0 0 4 4h8" />
            </svg>
          </span>
          <span className="-ml-1 flex h-5 w-4 shrink-0 items-center justify-center" aria-hidden="true">
            <svg className="size-4 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="currentColor">
              <path d={SPEECH_BUBBLE} />
            </svg>
          </span>
          <span className="min-w-0 break-words whitespace-pre-line">{last.comment}</span>
        </button>
      )}
    </>
  )
}

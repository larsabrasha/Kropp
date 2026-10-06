import { useState } from 'react'
import { t } from '../i18n/i18n'
import { CATALOG } from '../illustrations/catalog'
import { Limits } from '../training/limits'
import { BODY_AREAS, NO_ILLUSTRATION, type BodyArea } from '../training/model'
import { GROUPS, type PictureGroup } from '../illustrations/groups'
import { chipStyle } from '../ui/chipStyle'
import { Picture } from '../ui/Picture'
import { SearchField } from '../ui/SearchField'

// Every illustration, searchable by its English name, with "no picture" first, then grouped by the
// body areas the app names exercises by, the exercise's own first, then cardio and the rest; filling the sheet
// and scrolling with it, the search kept at the top as iOS keeps a sheet's search in view.
// Thumbnails load lazily, so opening the picker fetches only what scrolls into view. The pictures' credit is
// shown here, where they are chosen, and not wherever one is shown.

// Ordinal and case-insensitive, as the names are English whatever the app's language.
const upper = (text: string) => text.toUpperCase()
const compareOrdinal = (a: string, b: string) => (upper(a) < upper(b) ? -1 : upper(a) > upper(b) ? 1 : 0)

function matching(query: string): [slug: string, name: string][] {
  const wanted = upper(query.trim())
  const asSlug = upper(query.trim().replaceAll(' ', '-'))
  return Object.entries(CATALOG)
    .filter(([slug, [name]]) => upper(name).includes(wanted) || upper(slug).includes(asSlug))
    .sort(([, [a]], [, [b]]) => compareOrdinal(a, b))
    .map(([slug, [name]]) => [slug, name])
}

/** The groups in the order shown: the exercise's own first, by what it trains, or cardio for cardio. */
function groupOrder(areas: readonly BodyArea[], cardio: boolean): PictureGroup[] {
  const all: PictureGroup[] = [...BODY_AREAS, 'Cardio', 'Other']
  const first: PictureGroup[] = cardio ? ['Cardio'] : [...areas]
  return [...first, ...all.filter((g) => !first.includes(g))]
}

const groupName = (group: PictureGroup) =>
  group === 'Cardio' ? t('Workout.CardioOnly') : group === 'Other' ? t('Illustration.Other') : t(`BodyArea.${group}`)

export function IllustrationPicker({
  selected,
  onPick,
  areas = [],
  cardio = false,
}: {
  selected: string | undefined
  onPick: (slug: string) => void
  /** What the exercise trains, whose pictures come first. */
  areas?: readonly BodyArea[]
  cardio?: boolean
}) {
  const [query, setQuery] = useState('')
  // One group alone, chosen above the grid; all of them, the exercise's own first, until then.
  const [only, setOnly] = useState<PictureGroup>()
  const matches = matching(query)
  const order = groupOrder(areas, cardio)
  const groups = order
    .filter((group) => only === undefined || group === only)
    .map((group) => ({ group, slugs: matches.filter(([slug]) => (GROUPS[slug] ?? 'Other') === group) }))
    .filter((g) => g.slugs.length > 0)
  const shownCount = groups.reduce((n, g) => n + g.slugs.length, 0)
  const tile = ([slug, name]: [string, string]) => (
    <button
      type="button"
      key={slug}
      onClick={() => onPick(slug)}
      title={name}
      aria-label={name}
      data-slug={slug}
      className={`rounded-[0.875rem] ${selected === slug ? 'ring-2 ring-blue-500' : ''}`}
    >
      <Picture slug={slug} size="grid" lazy />
    </button>
  )

  return (
    <div data-testid="illustration-picker">
      <div className="sticky top-0 z-10 -mx-5 -mt-2 bg-ground px-5 pt-2 pb-2">
        <SearchField
          value={query}
          maxLength={Limits.search}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Illustration.Search')}
        />
        {/* A filter by group, as iOS sets filters in a row of capsules that scrolls sideways. */}
        <div
          className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]"
          role="group"
          aria-label={t('Illustration.Filter')}
          data-testid="picture-filter"
        >
          <button
            type="button"
            aria-pressed={only === undefined}
            onClick={() => setOnly(undefined)}
            className={chipStyle(only === undefined)}
          >
            {t('Illustration.All')}
          </button>
          {order.map((group) => (
            <button
              key={group}
              type="button"
              aria-pressed={only === group}
              data-group={group}
              onClick={() => setOnly(only === group ? undefined : group)}
              className={chipStyle(only === group)}
            >
              {groupName(group)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 px-4 text-[0.8125rem] text-label-2">{t('Illustration.Count', shownCount)}</p>
      </div>
      <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-6">
        <button
          type="button"
          onClick={() => onPick(NO_ILLUSTRATION)}
          className={`flex aspect-square items-center justify-center rounded-[0.875rem] border border-dashed border-label-3 p-1 text-center text-[0.8125rem] text-label-2 ${selected === undefined ? 'ring-2 ring-blue-500' : ''}`}
        >
          {t('Illustration.None')}
        </button>
      </div>
      {groups.map(({ group, slugs }) => (
        <section key={group} className="mt-section" data-group={group}>
          <h3 className="px-4 pb-2 text-[1.0625rem] font-semibold text-label-2">{groupName(group)}</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">{slugs.map(tile)}</div>
        </section>
      ))}
      <p className="mt-4 px-4 text-[0.8125rem] leading-tight text-label-2" data-testid="illustration-credit">
        {t('Illustration.Credit')}{' '}
        <a href="https://github.com/bryllim/workout-guide" target="_blank" rel="noopener" className="underline">
          Bryl Lim
        </a>
        ,{' '}
        <a href="https://github.com/everkinetic/data" target="_blank" rel="noopener" className="underline">
          Everkinetic
        </a>
        ,{' '}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener" className="underline">
          CC BY-SA 4.0
        </a>
      </p>
    </div>
  )
}

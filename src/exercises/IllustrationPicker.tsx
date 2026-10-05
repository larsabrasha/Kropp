import { useState } from 'react'
import { t } from '../i18n/i18n'
import { CATALOG } from '../illustrations/catalog'
import { picture } from '../illustrations/illustrations'
import { Limits } from '../training/limits'
import { NO_ILLUSTRATION } from '../training/model'

// Every illustration, searchable by its English name, with "no picture" first. Thumbnails load
// lazily, so opening the picker fetches only what scrolls into view. The pictures' credit is
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

export function IllustrationPicker({
  selected,
  onPick,
}: {
  selected: string | undefined
  onPick: (slug: string) => void
}) {
  const [query, setQuery] = useState('')
  const matches = matching(query)

  return (
    <div data-testid="illustration-picker">
      <input
        type="search"
        value={query}
        maxLength={Limits.search}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Illustration.Search')}
        aria-label={t('Illustration.Search')}
        autoComplete="off"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
      />
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('Illustration.Count', matches.length)}</p>
      <div className="mt-2 grid max-h-80 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
        <button
          type="button"
          onClick={() => onPick(NO_ILLUSTRATION)}
          className={`flex aspect-square items-center justify-center rounded-lg border border-dashed border-gray-300 p-1 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400 ${selected === undefined ? 'ring-2 ring-blue-500' : ''}`}
        >
          {t('Illustration.None')}
        </button>
        {matches.map(([slug, name]) => (
          <button
            type="button"
            key={slug}
            onClick={() => onPick(slug)}
            title={name}
            aria-label={name}
            data-slug={slug}
            className={`aspect-square rounded-lg bg-gray-100 p-1 dark:bg-gray-800 ${selected === slug ? 'ring-2 ring-blue-500' : ''}`}
          >
            <img src={picture(slug)} alt="" loading="lazy" className="illustration size-full object-contain" />
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-tight text-gray-400 dark:text-gray-500" data-testid="illustration-credit">
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

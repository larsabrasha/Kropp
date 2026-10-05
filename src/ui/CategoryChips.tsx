import { t } from '../i18n/i18n'
import { BODY_AREAS, type BodyArea } from '../training/model'
import { chipStyle } from './chipStyle'

/** The six body areas as toggles. The last selected one cannot be turned off: an exercise always has one. */
export function CategoryChips({
  selected,
  onChange,
}: {
  selected: readonly BodyArea[]
  onChange: (areas: BodyArea[]) => void
}) {
  const toggle = (area: BodyArea) => {
    const next = selected.includes(area) ? selected.filter((a) => a !== area) : [...selected, area]
    onChange(BODY_AREAS.filter((a) => next.includes(a)))
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('Entry.Categories')} data-testid="category-chips">
      {BODY_AREAS.map((area) => {
        const on = selected.includes(area)
        return (
          <button
            key={area}
            type="button"
            aria-pressed={on}
            data-area={area}
            disabled={on && selected.length === 1}
            onClick={() => toggle(area)}
            className={chipStyle(on)}
          >
            {t(`BodyArea.${area}`)}
          </button>
        )
      })}
    </div>
  )
}

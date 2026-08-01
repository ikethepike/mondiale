# Anthem lyric files

One JSON file per country at `public/anthems/lyrics/<ISO>-anthem.json`, fetched
by `ViewAnthemBuzz` when a challenge carries a `lyricsUrl` and rendered by
`components/challenge/LyricWall.vue`.

## Schema

```jsonc
{
  "isoCode": "SE",
  "title": "Du gamla, du fria",
  "language": { "code": "sv", "name": "Swedish", "script": "Latin" },
  "sources": {
    "local":   { "author": "Richard Dybeck", "year": 1844, "licence": "Public domain", "note": "…" },
    "english": { "author": "Government of Sweden", "licence": "Public domain", "note": "…" }
  },
  "verses": [
    { "local": ["line", "line"], "english": ["line", "line"] }
  ]
}
```

| Field | Notes |
| --- | --- |
| `isoCode` | ISO 3166-1 alpha-2. Must match the filename. |
| `title` | The anthem's own name, in its own language. |
| `language.code` | BCP-47, e.g. `sv`, `ja`, `uk`. |
| `language.script` | `Latin`, `Cyrillic`, `Greek`, `Arabic`, `Hebrew`, `CJK`, `Thai`, `Devanagari`, `Ethiopic`, `Hangul`, `Other`. Used to assert the right text was captured — a verse tagged `Cyrillic` holding only Latin characters means the wrong block was extracted. |
| `sources.local` | Origin of the original-language text. `year` is the text's authorship year, not the anthem's adoption year. |
| `sources.english` | Origin of the translation. Tracked separately because a translation carries its own rights independent of the original. |
| `verses[]` | Ordered. Each has parallel `local` and `english` line arrays. |

### Lines, not blobs

`local` and `english` are arrays of lines. The wall paces itself line by line
and staggers each one's entrance, so it needs the breaks the text actually has
rather than wherever a paragraph wraps.

Keep both arrays the same length where the sense allows — the reveal
cross-fades line-for-line, and a mismatch means some lines swap early.

Repeated lines are repeated in the array; the wall does not expand refrains.

## Blanking markup

Double brackets mask a span until the reveal:

```json
"local": ["Du gamla, Du fria, Du fjällhöga [[nord]],"]
```

`LyricWall.parseLine` splits each line into `LyricSpan[]`:

```ts
[{ text: 'Du gamla, Du fria, Du fjällhöga ' }, { text: 'nord', blanked: true }, { text: ',' }]
```

Rules:

- Mark every form that names the country, in **both** columns — proper name,
  endonym, poetic name, demonym, and any inflected or possessive form.
- Marking is per-file and by hand: no matcher handles declension across a
  hundred languages.
- A literal `[[` is escaped as `\[\[`.

Blanked spans render masked but **keep their width**, so line length stays
readable while the letters are hidden and the line never reflows on reveal.

## Render states

`LyricWall` takes three inputs beyond the data:

| Prop | Effect |
| --- | --- |
| `revealed` | Masks fade off, exposing blanked words. |
| `translated` | Swaps the `local` column for `english`. |
| `maxLines` | Caps rendered lines (default 10). Anthem lengths vary widely, so the wall trims rather than scrolling indefinitely. |

The round drives these in sequence: the wall appears partway through the clock
(`HINT_UNLOCK_AT.lyrics` in `lib/use-buzz-round.ts`), `revealed` flips when the
round resolves, and `translated` follows after `TRANSLATE_AFTER_MS` so the two
reveals read as separate movements.

## Adding a country

1. Create `<ISO>-anthem.json` matching the schema above.
2. Confirm the captured text's script matches `language.script`.
3. Trim to the verses actually sung.
4. Record both `sources` entries, including where the translation came from.
5. Mark every giveaway in both columns with `[[…]]`.
6. Set `lyricsUrl` on the dealt challenge to `/anthems/lyrics/<ISO>-anthem.json`.

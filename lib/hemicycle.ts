/**
 * Seats the arc draws. Real chambers run from 51 (Suriname) to 630 (Germany),
 * and drawing one dot per seat would be a wall of dots on a phone at the top
 * of that range. The arc is scaled to this and each dot stands for a share.
 */
export const MAX_SEAT_DOTS = 180

/** Concentric rows of seats in a hemicycle, back row first. */
export const HEMICYCLE_ROWS = 5
/** The arc's inner radius as a share of its width — the well in the middle. */
const INNER_RADIUS = 0.32
const OUTER_RADIUS = 0.94

/**
 * Every seat in a hemicycle, LEFT to RIGHT then back row to front — the order
 * a chamber is read in, so a bench's dots are contiguous when they are handed
 * out in sequence.
 *
 * Seats are spread over the rows in proportion to each row's arc length, so
 * the back row (longer) carries more of them and the spacing stays even. A
 * naive equal split leaves the front row crowded and the back row sparse.
 */
/** Each row's radius as a share of the arc's half-width, back row first. */
export const hemicycleRadii = (rows: number) =>
  Array.from({ length: rows }, (_, row) =>
    rows === 1 ? OUTER_RADIUS : OUTER_RADIUS - ((OUTER_RADIUS - INNER_RADIUS) * row) / (rows - 1)
  )

export const hemicycleSeats = (total: number, rows = HEMICYCLE_ROWS) => {
  if (total <= 0) return []
  const usableRows = Math.min(rows, total)
  const radii = hemicycleRadii(usableRows)
  const circumference = radii.reduce((sum, radius) => sum + radius, 0)

  const perRow = radii.map(radius => Math.max(1, Math.round((total * radius) / circumference)))
  // Rounding drifts; settle the difference on the back row, which has the room.
  let drift = total - perRow.reduce((sum, count) => sum + count, 0)
  for (let row = 0; drift !== 0; row = (row + 1) % usableRows) {
    const step = drift > 0 ? 1 : -1
    if (perRow[row]! + step >= 1) {
      perRow[row] = perRow[row]! + step
      drift -= step
    }
  }

  const seats: { x: number; y: number; row: number }[] = []
  radii.forEach((radius, row) => {
    const count = perRow[row]!
    for (let seat = 0; seat < count; seat += 1) {
      // A half-turn from π (left) to 0 (right); centred in its own slice so
      // the ends of a row sit inside the arc rather than on its edge.
      const angle = Math.PI - (Math.PI * (seat + 0.5)) / count
      seats.push({
        x: 50 + Math.cos(angle) * radius * 50,
        y: 100 - Math.sin(angle) * radius * 100,
        row,
      })
    }
  })

  // Left to right overall, so consecutive seats belong to the same bench.
  return seats.sort((a, b) => a.x - b.x || a.row - b.row)
}

/** How many marks a chamber is drawn with: one per seat, up to `MAX_SEAT_DOTS`. */
export const seatDots = (totalSeats: number) => Math.max(0, Math.min(MAX_SEAT_DOTS, totalSeats))

/**
 * Hand `dots` marks out to groups in proportion to their seats, in group order,
 * by largest remainder — so the marks always sum to `dots` and no group is
 * rounded out of the chamber while another gets a mark it never held.
 */
export const seatRun = <Key>(
  dots: number,
  groups: readonly { key: Key; seats: number }[]
): Key[] => {
  const total = groups.reduce((sum, group) => sum + Math.max(0, group.seats), 0)
  if (!total || dots <= 0) return []
  const exact = groups.map(group => (Math.max(0, group.seats) / total) * dots)
  const counts = exact.map(Math.floor)
  let left = dots - counts.reduce((sum, count) => sum + count, 0)
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of byRemainder) {
    if (left <= 0) break
    counts[index]! += 1
    left -= 1
  }
  return groups.flatMap((group, index) => Array.from({ length: counts[index]! }, () => group.key))
}

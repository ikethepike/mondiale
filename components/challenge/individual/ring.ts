/** Position a candidate evenly around the ring stage (start at top, clockwise).
 *  Shared by the two ring gates — Border Detective's neighbour flags and
 *  Trajectory Match's pickable candidates. */
export const ringSlot = (index: number, total: number) => {
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2
  return {
    left: `${50 + Math.cos(angle) * 42}%`,
    top: `${50 + Math.sin(angle) * 42}%`,
  }
}

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
export const hemicycleSeats = (total: number, rows = HEMICYCLE_ROWS) => {
  if (total <= 0) return []
  const usableRows = Math.min(rows, total)
  const radii = Array.from({ length: usableRows }, (_, row) =>
    usableRows === 1
      ? OUTER_RADIUS
      : OUTER_RADIUS - ((OUTER_RADIUS - INNER_RADIUS) * row) / (usableRows - 1)
  )
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

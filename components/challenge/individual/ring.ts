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

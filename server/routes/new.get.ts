import { newRoomName } from '~~/lib/room-name'

// The home form's no-JS path: a submit that beats hydration lands here and is
// handed a fresh room, carrying the form's fields (the variant) along.
export default defineEventHandler(event => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(getQuery(event))) {
    if (typeof value === 'string') params.append(key, value)
  }
  const query = params.toString()
  const search = query ? `?${query}` : ''
  return sendRedirect(event, `/room/${newRoomName()}${search}`, 302)
})

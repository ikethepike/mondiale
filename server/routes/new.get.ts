import { newRoomPath } from '~~/lib/room-name'

// The home form's no-JS path: a submit that beats hydration lands here and is
// handed a fresh room, carrying the form's fields (the variant) along.
export default defineEventHandler(event => {
  const fields = Object.entries(getQuery(event)).filter(
    (field): field is [string, string] => typeof field[1] === 'string'
  )
  return sendRedirect(event, newRoomPath(fields), 302)
})

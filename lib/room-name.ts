import { generate } from 'random-words'

/**
 * A fresh room id, drawn at the moment a game is created — never at render
 * time: the home page is prerendered, so a name drawn in setup is baked into
 * the HTML and every pre-hydration "Create Game" lands in the same room.
 */
export const newRoomName = (): string => generate({ exactly: 3, join: '-' }) as string

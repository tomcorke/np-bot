export interface RawPlayerGameData {
  status: 'active'
  name: string
  turn_based: number
  number: string
  players: number
  maxPlayers: number
  config: {
    description: string
  }
}

interface RawPlayerData {
  games_in: number
  user_id: string
  alias: string
  open_games: RawPlayerGameData[]
}

export type InitPlayerResponse = [
  'meta_init_player',
  RawPlayerData
]
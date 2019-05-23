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

export type RawPlayerData = [
  'meta_init_player',
  {
    games_in: number
    user_id: string
    alias: string
    open_games: RawPlayerGameData[]
  }
]
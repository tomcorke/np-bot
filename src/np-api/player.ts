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

export interface RawPlayerData {
  games_in: number
  user_id: string
  alias: string
  open_games: RawPlayerGameData[]
}

export const EMPTY_PLAYER_DATA: RawPlayerData = {
  games_in: 0,
  user_id: '',
  alias: '',
  open_games: []
}

export type InitPlayerResponse = [
  'meta_init_player',
  RawPlayerData
]
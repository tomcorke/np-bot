import * as fs from 'fs'
import * as path from 'path'
import * as shelljs from 'shelljs'

import { Star, RawStarData } from './star'
import { Fleet, RawFleetData } from './fleet'
import { decodeHTMLEntities } from '../../util';

export interface RawUniverseData {
  isFakeUniverse?: boolean

  name: string
  player_uid: number
  stars: { [key:string]: RawStarData }
  fleets: { [key:string]: RawFleetData }
  players: { [key:string]: never }

  started: boolean
  start_time: number

  paused: boolean
  game_over: number

  now: number

  turn_based: number
  turn_based_time_out: number

  production_rate: number
  production_counter: number

  tick: number
  tick_rate: number
}

export const EMPTY_UNIVERSE_DATA: RawUniverseData = {
  isFakeUniverse: false,

  name: 'Empty universe',
  player_uid: -1,
  stars: {},
  fleets: {},
  players: {},

  started: false,
  start_time: -1,

  paused: false,
  game_over: 0,

  now: 0,

  turn_based: 0,
  turn_based_time_out: 0,

  production_rate: 0,
  production_counter: 0,

  tick: 0,
  tick_rate: 0,
}

export const EMPTY_UNIVERSE_ID = 'x'

export class Universe {

  gameId: string

  isReal: boolean
  rawData: RawUniverseData

  name: string

  started: boolean
  startTime: number

  paused: boolean
  gameOver: number

  playerId: number
  stars: Map<number, Star>
  fleets: Map<number, Fleet>

  turnBased: number
  turnBasedTimeOut: number

  productionRate: number
  productionCounter: number

  tick: number
  tickRate: number

  constructor(gameId: string, data: RawUniverseData) {

    this.isReal = data.isFakeUniverse !== undefined ? !data.isFakeUniverse : true

    this.gameId = gameId
    this.name = decodeHTMLEntities(data.name)

    if (process.env.NODE_ENV === 'development' && this.gameId !== EMPTY_UNIVERSE_ID) {
      const safeGameName = decodeHTMLEntities(data.name).replace(/[[\]'" ?:|<>]/g, '_')
      const universePath = path.join(__dirname, `../../../cache/debug/universe/${safeGameName}_tick_${data.tick}.json`)
      console.log(`DEV: Saving universe data at "${universePath}"`)
      shelljs.mkdir('-p', path.dirname(universePath))
      fs.writeFileSync(universePath, JSON.stringify(data, null, 2), 'utf8')
    }

    this.rawData = data
    this.playerId = data.player_uid

    this.fleets = new Map<number, Fleet>()
    Object.keys(data.fleets)
      .forEach(fid => {
        const fleet = data.fleets[fid]
        this.fleets.set(fleet.uid, new Fleet(fleet))
      })

    this.stars = new Map<number, Star>()
    Object.keys(data.stars)
      .forEach(sid => {
        const star = data.stars[sid]
        this.stars.set(star.uid, new Star(star))
      })

    this.started = data.started
    this.startTime = data.start_time

    this.paused = data.paused
    this.gameOver = data.game_over

    this.turnBased = data.turn_based
    this.turnBasedTimeOut = data.turn_based_time_out

    this.productionRate = data.production_rate
    this.productionCounter = data.production_counter

    this.tick = data.tick
    this.tickRate = data.tick_rate

  }

  getStars() : Star[] {
    return Array.from(this.stars.values())
  }

  getStar(id: number) : Star | undefined {
    return this.stars.get(id)
  }

  getStarByName(name: string) : Star | undefined{
    const safeName = (name || '').toLowerCase()
    return this.getStars().find(star => star.name.toLowerCase() === safeName)
  }

  getPlayerStars(playerId: number) : Star[] {
    return this.getStars().filter(star => star.ownerId === playerId)
  }

  getOwnStars() : Star[] {
    return this.getPlayerStars(this.playerId)
  }

  getFleets() : Fleet[] {
    return Array.from(this.fleets.values())
  }

  getFleet(id: number): Fleet | undefined {
    return this.fleets.get(id)
  }

  getFleetsAtStar(star: Star, playerId?: number) : Fleet[] {
      const fleets = this.getFleets().filter(fleet => fleet.orbitingStarId === star.id)
      if (playerId) {
        return fleets.filter(fleet => fleet.ownerId === playerId)
      }
      return fleets
  }

  isSameGame(other: Universe) {
    return this.gameId === other.gameId
  }
}
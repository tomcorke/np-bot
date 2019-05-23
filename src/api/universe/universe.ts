import * as fs from 'fs'
import * as path from 'path'
import * as shelljs from 'shelljs'

import { Star, RawStarData } from './star'
import { Fleet, RawFleetData } from './fleet'

export interface RawUniverseData {
  name: string
  player_uid: number
  stars: { [key:string]: RawStarData }
  fleets: { [key:string]: RawFleetData }
  players: { [key:string]: never }
  started: boolean
  paused: boolean
}

export const EMPTY_UNIVERSE: RawUniverseData = {
  name: 'Empty universe',
  player_uid: -1,
  stars: {},
  fleets: {},
  players: {},
  started: false,
  paused: false,
}

export class Universe {

  rawData: RawUniverseData

  playerId: number
  stars: Map<number, Star>
  fleets: Map<number, Fleet>

  constructor(data: RawUniverseData) {
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

    if (process.env.NODE_ENV === 'development') {
      const universePath = path.join(__dirname, `../../../cache/universes/${data.name}.json`)
      console.log(`DEV: Caching universe data at "${universePath}"`)
      shelljs.mkdir('-p', path.dirname(universePath))
      fs.writeFileSync(universePath, JSON.stringify(data, null, 2), 'utf8')
    }

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
}
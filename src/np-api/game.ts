import { EventEmitter } from "events";
import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
import * as shelljs from 'shelljs'

const writeFileP = promisify(fs.writeFile)
const readFileP = promisify(fs.readFile)

import { Universe, Star, Fleet } from "./universe";
import {
  RawUniverseData,
  EMPTY_UNIVERSE_DATA,
  EMPTY_UNIVERSE_ID,
} from "./universe/universe";

import NeptunesPrideApi, { DEFAULT_REQUEST_HEADERS, encodeFormData } from ".";

interface ApiOrderResponse {
  event: string
  report: RawUniverseData
}

export enum GAME_EVENTS {
  TURN_CHANGE = 'TURN_CHANGE',
  TICK_CHANGE = 'TICK_CHANGE',
}

const ORDER_URI = 'https://np.ironhelmet.com/trequest/order'

function sum(items: number[]) {
  return items.reduce((sum, item) => {
    return sum + item
  }, 0)
}

const AUTO_REFRESH_DELAY = 10000

export class Game extends EventEmitter {
  api: NeptunesPrideApi
  gameId: string
  name: string
  universe: Universe
  orderQueue?: Promise<Universe>
  refreshTimer?: NodeJS.Timeout

  constructor (api: NeptunesPrideApi, gameId: string, name: string, universe?: Universe) {
    super()
    this.api = api
    this.gameId = gameId
    this.name = name
    this.universe = universe || new Universe(EMPTY_UNIVERSE_ID, EMPTY_UNIVERSE_DATA)
  }

  setUniverse(universe: Universe) {
    this.universe = universe
  }

  async handleOrderResponse(res: ApiOrderResponse): Promise<Universe> {
    if (res.event === 'order:full_universe') {

      const newUniverse = new Universe(this.gameId, res.report)

      if (this.universe.isReal
        && this.universe.isSameGame(newUniverse)
        && this.universe.tick !== newUniverse.tick) {

        if (this.universe.turnBased) {
          this.emit(GAME_EVENTS.TURN_CHANGE, newUniverse.tick)
        }
        this.emit(GAME_EVENTS.TICK_CHANGE, newUniverse.tick)
      }

      this.universe = newUniverse

      await this.saveUniverse()

    } else if (res.event !== 'order:ok') {
      throw Error(`Unexpected order response: ${res.event}, (${JSON.stringify(res)})`)
    }
    return this.universe
  }

  async queueOrder(orderFunc: () => Promise<Universe>) : Promise<Universe> {

    const delayedCallOrderFunc = async () => {
      return new Promise<Universe>(resolve => {
        setTimeout(() => {
          orderFunc().then(resolve)
        }, 100)
      })
    }

    if (!this.orderQueue) {
      this.orderQueue = delayedCallOrderFunc()
    } else {
      this.orderQueue = this.orderQueue
        .then(delayedCallOrderFunc)
    }

    return this.orderQueue
  }

  async sendOrder(order: string) : Promise<Universe> {
    console.log('sendOrder', this.gameId, order)

    const authToken = this.api.authToken
    if (!authToken) {
      throw Error('Auth token required, call getAuthToken first')
    }

    const orderFunc = async () => {
      const response = await fetch(ORDER_URI, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...DEFAULT_REQUEST_HEADERS,
          cookie: `auth=${authToken}`,
        },
        body: encodeFormData({
          type: 'order',
          order,
          version: '',
          game_number: this.gameId,
        }),
      })

      const json = await response.json() as ApiOrderResponse
      return this.handleOrderResponse(json)
    }

    return this.queueOrder(orderFunc)
  }

  async getUniverse() : Promise<Universe> {
    console.log('getUniverse', this.gameId)
    return this.sendOrder('full_universe_report')
  }

  getTotalShips(star: Star, playerId: number = this.universe.playerId) {
    const starShips = star.ownerId === playerId ? star.ships : 0
    const fleetShips = sum(this.universe.getFleetsAtStar(star).map(fleet => fleet.ships))
    return starShips + fleetShips
  }

  async buildFleet(star: Star, ships: number = 1) : Promise<Universe> {
    return this.sendOrder(`new_fleet,${star.id},${ships}`)
  }

  async moveShipsToFleet(fleet: Fleet, totalShips: number) : Promise<Universe> {
    return this.sendOrder(`ship_transfer,${fleet.id},${totalShips}`)
  }

  async moveAllShipsToStar(star: Star) : Promise<Universe> {
    return this.sendOrder(`gather_all_ships,${star.id}`)
  }

  getUniverseFilePath() {
    return path.join(__dirname, `../../cache/games/${this.gameId}.json`)
  }

  async loadOrGetUniverse() {
    let universe: Universe
    try {
      universe = await this.loadUniverse()
      console.log(`Loaded universe from cache for game ${this.gameId}`)
    } catch (e) {
      console.log(`Cache data not found for game ${this.gameId}, fetching...`)
      universe = await this.getUniverse()
    }
    return universe
  }

  async saveUniverse() : Promise<any> {
    const filePath = this.getUniverseFilePath()
    console.log('saveUniverse', this.gameId, filePath)
    await shelljs.mkdir('-p', path.dirname(filePath))
    return writeFileP(filePath, JSON.stringify(this.universe.rawData, null, 2), 'utf8')
  }

  async loadUniverse() : Promise<Universe> {
    const filePath = this.getUniverseFilePath()
    console.log('loadUniverse', this.gameId, filePath)
    if (!fs.existsSync(filePath))
      throw Error(`Could not load universe from "${filePath}", file does not exist.`)
    return readFileP(filePath, 'utf8')
      .then((data: string) => new Universe(this.gameId, JSON.parse(data)))
  }

  async splitShipsToFleets(star: Star) : Promise<Universe> {

    const fleets = this.universe.getFleetsAtStar(star)
    const shipsAtStar = this.getTotalShips(star)

    const accurateShipsPerFleet = shipsAtStar / fleets.length
    const shipsPerFleet = fleets.map(fleet => ({ fleet, shipsToMove: Math.floor(accurateShipsPerFleet) }))

    while(sum(shipsPerFleet.map(spf => spf.shipsToMove)) < shipsAtStar) {
      shipsPerFleet[0].shipsToMove++
    }

    await Promise.all(
        shipsPerFleet
          .filter(spf => spf.shipsToMove)
          .map(spf => this.moveShipsToFleet(spf.fleet, spf.shipsToMove))
      )

    return this.universe
  }

  startRefresh() {
    this.stopRefresh()
    this.refreshTimer = setInterval(async () => {
      try {
        console.log(`Refreshing universe for game ${this.gameId}`)
        await this.getUniverse()
      } catch (e) {
        console.error(`Error refreshing game ${this.gameId}`, e)
      }
    }, AUTO_REFRESH_DELAY)
  }

  resetRefresh() {
    if (this.refreshTimer) {
      this.startRefresh()
    }
  }

  stopRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
  }
}
import fetch from  'isomorphic-fetch'
import * as setCookieParser from 'set-cookie-parser'
import * as path from 'path'
import * as fs from 'fs'
import { promisify } from 'util'
import * as shelljs from 'shelljs'

import { Universe, Star, Fleet } from './universe'
import { RawUniverseData, EMPTY_UNIVERSE } from './universe/universe'
import { RawPlayerData } from './player';

const writeFileP = promisify(fs.writeFile)
const readFileP = promisify(fs.readFile)

const initPlayerUrl = 'https://np.ironhelmet.com/mrequest/init_player'
const loginUrl = 'https://np.ironhelmet.com/arequest/login'
const ordersUrl = 'https://np.ironhelmet.com/trequest/order'

export const ALL = Symbol('ALL')

const DEFAULT_REQUEST_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
}

type StringMap = {
  [key: string]: string
}

function encodeFormData(data: StringMap) {
  return Object.keys(data)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&')
}

function sum(items: number[]) {
  return items.reduce((sum, item) => {
    return sum + item
  }, 0)
}

interface ApiOrderResponse {
  event: string
  report: RawUniverseData
}

export default class NeptunesPrideApi {

  private authToken?: string
  universeFilePath?: string
  gameId?: string
  universe: Universe = new Universe(EMPTY_UNIVERSE)
  private orderQueue?: Promise<Universe>

  async getAuthToken(username: string, password: string) : Promise<string> {
    console.log('getAuthToken')
    const res = await fetch(loginUrl, {
      method: 'POST',
      credentials: 'include',
      headers: DEFAULT_REQUEST_HEADERS,
      body: encodeFormData({
        type: 'login',
        alias: username,
        password
      }),
    })

    // eslint-disable-next-line no-underscore-dangle
    const setCookieHeader = res.headers.get('set-cookie')
    if (setCookieHeader) {
      const cookies = setCookieParser.parse(setCookieHeader)
      const authCookie = cookies.find(c => c.name === 'auth')
      if (authCookie) {
        console.log('auth:', authCookie.value)
        this.authToken = authCookie.value
        return authCookie.value
      }
    }

    throw Error('No auth cookie received')
  }

  async initPlayer() {
    const authToken = this.authToken
    if (!authToken) {
      throw Error('Auth token required, call getAuthToken first')
    }

    const res = await fetch(initPlayerUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...DEFAULT_REQUEST_HEADERS,
        cookie: `auth=${authToken}`,
      },
      body: encodeFormData({
        type: 'init_player'
      })
    })
    const json = await res.json()

    if (!json[0] || json[0] !== 'meta:init_player') {
      throw Error('Unexpected init_player response')
    }

    return (json as RawPlayerData)[1]
  }

  setGameId(gameId: string) {
    console.log('setGameId', gameId)
    this.universeFilePath = path.join(__dirname, `universe.${gameId}.json`)
    this.gameId = gameId
  }

  handleOrderResponse(res: ApiOrderResponse): Universe {
    if (res.event === 'order:full_universe') {
      this.universe = new Universe(res.report)
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
    console.log('sendOrder', order)

    const authToken = this.authToken
    if (!authToken) {
      throw Error('Auth token required, call getAuthToken first')
    }

    const gameId = this.gameId
    if (!gameId) {
      throw Error('Game ID required, call setGameId first')
    }

    const orderFunc = async () => {
      const response = await fetch(ordersUrl, {
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
          game_number: gameId,
        }),
      })

      const json = await response.json() as ApiOrderResponse
      const universe = this.handleOrderResponse(json)
      return universe
    }

    return this.queueOrder(orderFunc)
  }

  async getUniverse() : Promise<Universe> {
    console.log('getUniverse')
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

  async saveUniverse(universe: Universe, filePath: string) : Promise<any> {
    console.log('saveUniverse', filePath)
    await shelljs.mkdir('p', path.dirname(filePath))
    return writeFileP(filePath, JSON.stringify(universe.rawData, null, 2), 'utf8')
  }

  async loadUniverse(filePath: string) : Promise<Universe> {
    console.log('getSavedUniverse')
    if (!fs.existsSync(filePath))
      throw Error(`Could not load universe from "${filePath}", file does not exist.`)
    return readFileP(filePath, 'utf8')
      .then((data: string) => new Universe(JSON.parse(data)))
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

}

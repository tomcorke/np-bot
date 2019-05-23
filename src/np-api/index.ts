import fetch from  'isomorphic-fetch'
import * as setCookieParser from 'set-cookie-parser'
import { EventEmitter } from 'events';

import { InitPlayerResponse } from './player';
import { Game, GAME_EVENTS } from './game';
import { decodeHTMLEntities } from '../util';

const INIT_PLAYER_URI = 'https://np.ironhelmet.com/mrequest/init_player'
const LOGIN_URI = 'https://np.ironhelmet.com/arequest/login'

export const ALL = Symbol('ALL')

export const DEFAULT_REQUEST_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
}

type StringMap = {
  [key: string]: string
}

export function encodeFormData(data: StringMap) {
  return Object.keys(data)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join('&')
}
export default class NeptunesPrideApi extends EventEmitter {

  authToken?: string
  games = new Map<string, Game>()

  async getAuthToken(username: string, password: string) : Promise<string> {
    console.log('getAuthToken')
    const res = await fetch(LOGIN_URI, {
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

    const res = await fetch(INIT_PLAYER_URI, {
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

    return (json as InitPlayerResponse)[1]
  }

  addGame(gameId: string, name: string) {
    console.log('addGame', gameId, name)
    const game = new Game(this, gameId, name)
    this.games.set(gameId, game)
    Object.values(GAME_EVENTS).forEach(event => game.on(event, (...args: any[]) => this.emit(event, game, ...args)))
    return game
  }

}
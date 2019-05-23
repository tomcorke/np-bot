import * as path from 'path'
import * as fs from 'fs'
import * as shelljs from 'shelljs'

import { GuildConfig } from './guild'

export interface Config {
  defaultCommandChannelName: string
  defaultBotRoleName: string
  guilds: Map<string, GuildConfig>
}

const initialConfig: Config = {
  defaultCommandChannelName: 'bot-command',
  defaultBotRoleName: 'neptunes-pride-bot',
  guilds: new Map<string, GuildConfig>(),
}

const configFilePath = path.join(__dirname, '../config/config.json')

const getConfig = () => {
  let configFromFile: Partial<Config> | undefined
  if (fs.existsSync(configFilePath)) {
    configFromFile = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Partial<Config>
  }
  const config = { ...initialConfig, ...configFromFile }
  return config
}

export const config = getConfig()

export const saveConfig = () => {
  if (!fs.existsSync(configFilePath)) {
    shelljs.mkdir('-p', path.dirname(configFilePath))
  }
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8')
}
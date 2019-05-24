import * as path from 'path'
import * as fs from 'fs'
import * as shelljs from 'shelljs'

import { GuildConfig } from './guild'


export interface Config {
  defaultCommandChannelName: string
  defaultNotificationChannelName: string
  guilds: { [guildId: string]: GuildConfig }
}

const initialConfig: Config = {
  defaultCommandChannelName: 'bot-command',
  defaultNotificationChannelName: 'bot-notifications',
  guilds: {}
}

const configFilePath = path.join(__dirname, '../../config/config.json')

const loadOrCreateConfig = () => {
  let configFromFile: Partial<Config> | undefined
  if (fs.existsSync(configFilePath)) {
    configFromFile = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Partial<Config>
  }
  const config: Config = {
    ...initialConfig,
    ...configFromFile,
  }
  return config
}

export const config = loadOrCreateConfig()

export const saveConfig = () => {
  if (!fs.existsSync(configFilePath)) {
    shelljs.mkdir('-p', path.dirname(configFilePath))
  }
  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8')
}
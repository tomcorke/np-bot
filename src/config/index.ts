import * as path from 'path'
import * as fs from 'fs'
import * as shelljs from 'shelljs'

import { GuildConfig } from './guild'
import { stringify } from 'querystring';

interface FileConfig {
  defaultCommandChannelName: string
  defaultBotRoleName: string
  guilds: [string, GuildConfig][]
}

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

const configFilePath = path.join(__dirname, '../../config/config.json')

const getConfig = () => {
  let configFromFile: Partial<FileConfig> | undefined
  if (fs.existsSync(configFilePath)) {
    configFromFile = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Partial<FileConfig>
  }
  const config: Config = {
    ...initialConfig,
    ...configFromFile,
    guilds: new Map<string, GuildConfig>(configFromFile && configFromFile.guilds || [])
  }
  return config
}

export const config = getConfig()

export const saveConfig = () => {
  const fileSafeConfig: FileConfig = {
    ...config,
    guilds: [...config.guilds],
  }
  if (!fs.existsSync(configFilePath)) {
    shelljs.mkdir('-p', path.dirname(configFilePath))
  }
  fs.writeFileSync(configFilePath, JSON.stringify(fileSafeConfig, null, 2), 'utf8')
}
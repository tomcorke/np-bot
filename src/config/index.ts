import * as path from 'path'
import * as fs from 'fs'
import * as shelljs from 'shelljs'

import { FileGuildConfig } from './guild'

export interface FileConfig {
  defaultCommandChannelName: string
  defaultNotificationChannelName: string
  guilds: { [guildId: string]: FileGuildConfig }
}

const initialConfig: FileConfig = {
  defaultCommandChannelName: 'bot-command',
  defaultNotificationChannelName: 'bot-notifications',
  guilds: {}
}

const configFilePath = path.join(__dirname, '../../config/config.json')

class Config{

  private config: FileConfig
  private guilds: Map<string, FileGuildConfig>

  constructor(config: FileConfig) {
    this.config = config
    this.guilds = new Map(Object.entries(config.guilds))
  }

  get<T extends keyof FileConfig>(prop: T): FileConfig[T] {
    return initialConfig[prop]
  }

  set<T extends keyof FileConfig, V extends FileConfig[T]>(prop: T, value: V): void {
    this.config[prop] = value
  }

  async getGuildConfig(guildID: string) {
  }

  save() {
    if (!fs.existsSync(configFilePath)) {
      shelljs.mkdir('-p', path.dirname(configFilePath))
    }
    fs.writeFileSync(configFilePath, JSON.stringify(this.config, null, 2), 'utf8')
  }
}

const loadOrCreateConfig = () => {
  let configFromFile: Partial<Config> | undefined
  if (fs.existsSync(configFilePath)) {
    configFromFile = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Partial<Config>
  }
  const config: FileConfig = {
    ...initialConfig,
    ...configFromFile,
  }
  return new Config(config)
}

export const config = loadOrCreateConfig()
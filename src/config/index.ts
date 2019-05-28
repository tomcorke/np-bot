import * as path from 'path'
import * as fs from 'fs'
import * as shelljs from 'shelljs'
import Discord from 'discord.js'

import { FileGuildConfig, GuildConfig } from './guild'
import NeptunesPrideApi from '../np-api';

export interface FileConfig {
  defaultCommandChannelName: string
  defaultNotificationChannelName: string
  guilds: { [guildId: string]: FileGuildConfig }
}

type CONTROLLED_PROPS = 'guilds'
type UncontrolledFileConfig = Pick<FileConfig, Exclude<keyof FileConfig, CONTROLLED_PROPS>>

const DEFAULT_CONFIG: FileConfig = {
  defaultCommandChannelName: 'bot-command',
  defaultNotificationChannelName: 'bot-notifications',
  guilds: {}
}

const configFilePath = path.join(__dirname, '../../config/config.json')

export class Config{

  fileConfig: FileConfig

  readonly api: NeptunesPrideApi
  readonly guilds = new Map<string, GuildConfig>()

  constructor(api: NeptunesPrideApi, config: FileConfig) {
    this.api = api
    this.fileConfig = config
  }

  get<T extends keyof UncontrolledFileConfig>(prop: T): FileConfig[T] {
    return this.fileConfig[prop]
  }

  set<T extends keyof UncontrolledFileConfig, V extends FileConfig[T]>(prop: T, value: V): void {
    console.log(`config set`, prop, value)
    this.fileConfig[prop] = value
    this.save()
  }

  getGuildConfig(guild: Discord.Guild) {
    const existingGuildConfig = this.guilds.get(guild.id)
    if (existingGuildConfig) return existingGuildConfig

    const guildConfig = new GuildConfig(this, guild)
    this.fileConfig.guilds[guild.id] = guildConfig.fileGuildConfig
    this.guilds.set(guild.id, guildConfig)
    this.save()
    return guildConfig
  }

  deleteGuild(guild: Discord.Guild) {
    const guildConfig = this.guilds.get(guild.id)
    if (guildConfig) {

    }
    this.guilds.delete(guild.id)
    delete this.fileConfig.guilds[guild.id]
    this.save()
  }

  save() {
    if (!fs.existsSync(configFilePath)) {
      shelljs.mkdir('-p', path.dirname(configFilePath))
    }
    fs.writeFileSync(configFilePath, JSON.stringify(this.fileConfig, null, 2), 'utf8')
  }
}

export const getConfig = (api: NeptunesPrideApi) => {
  let configFromFile: Partial<FileConfig> | undefined
  if (fs.existsSync(configFilePath)) {
    configFromFile = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Partial<FileConfig>
  }
  const fileConfig: FileConfig = {
    ...DEFAULT_CONFIG,
    ...configFromFile,
  }
  return new Config(api, fileConfig)
}
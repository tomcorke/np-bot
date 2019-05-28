import Discord from 'discord.js'
import chalk from 'chalk'

import { Config } from '.'
import { MissingPermissionsError } from '../errors'
import { getGuildHelpers } from '../discord'
import { FileGameConfig, GameConfig } from './game';
import { RawPlayerGameData } from '../np-api/player';
import NeptunesPrideApi from '../np-api';

export interface FileGuildConfig {
  commandChannelId?: string
  games: { [gameId: string]: FileGameConfig }
}

const DEFAULT_GUILD_CONFIG: FileGuildConfig = {
  games: {}
}

type CONTROLLED_PROPS = 'games'
type UncontrolledFileGuildConfig = Pick<FileGuildConfig, Exclude<keyof FileGuildConfig, CONTROLLED_PROPS>>

const expectedPermissions = [
  'MANAGE_CHANNELS',
  'MANAGE_MESSAGES',
  'READ_MESSAGES',
  'READ_MESSAGE_HISTORY',
  'SEND_MESSAGES',
  'ADD_REACTIONS',
] as const


export class GuildConfig implements BaseConfig {

  fileGuildConfig: FileGuildConfig

  config: Config
  guild: Discord.Guild
  private games: Map<string, GameConfig> = new Map<string, GameConfig>()

  presenceUpdateTimer?: NodeJS.Timeout

  constructor(config: Config, guild: Discord.Guild) {
    this.config = config
    this.guild = guild

    const guildConfig: FileGuildConfig = { ...DEFAULT_GUILD_CONFIG, ...config.fileConfig.guilds[guild.id] }
    this.fileGuildConfig = guildConfig

    const botMember = guild.me

    const missingPermissions = expectedPermissions.filter(p => !botMember.hasPermission(p, false, false, false))
    if (missingPermissions.length > 0) {
      console.log(`Bot is missing expected permissions in server "${guild.name}":`)
      console.log(chalk.red(JSON.stringify(missingPermissions)))
      throw new MissingPermissionsError(`Bot is missing expected permissions in server "${guild.name}": ${JSON.stringify(missingPermissions)}`)
    }

    const setRandomPresence = async () => {
      const gameMessages = [
        'in ur galaxy',
        'with ur industries',
        'with ur ships',
        'as an evil overlord',
        'with your heart',
        'a tiny violin',
        'internet spaceships',
        'with ur economy',
        'with ur science',
        'with ur stars',
        'with ur carriers',
      ]
      try {
        await guild.client.user.setPresence({ game: { name: gameMessages[Math.floor(Math.random() * gameMessages.length)] }, status: 'online' })
      } catch (e) {
        // Whatever
      }
    }

    setRandomPresence()
    this.presenceUpdateTimer = setInterval(setRandomPresence, 60000)

    // Initialise existing games for this guild
    Object.keys(guildConfig.games).forEach(gameId => this.getGameConfig(gameId))
  }

  get api() {
    return this.config.api
  }

  get<T extends keyof UncontrolledFileGuildConfig>(prop: T) {
    return this.fileGuildConfig[prop]
  }

  set<T extends keyof UncontrolledFileGuildConfig, V extends FileGuildConfig[T]>(prop: T, value: V) {
    console.log(`guildConfig set`, prop, value)
    this.fileGuildConfig[prop] = value
    this.config.save()
  }

  async getCommandChannel() {
    const helpers = getGuildHelpers(this.guild)
    const commandChannelId = this.get('commandChannelId')
    const commandChannel = await helpers.getOrCreateTextChannel(this.config.get('defaultCommandChannelName'), commandChannelId)
    if (!commandChannel) {
      throw Error(`Could not get or create command channel for guild ${this.guild.name}`)
    }
    if (commandChannelId !== commandChannel.id) {
      this.set('commandChannelId', commandChannel.id)
      this.save()
    }
    return commandChannel
  }

  getGameConfig(gameId: string) {
    const existingGameConfig = this.games.get(gameId)
    if (existingGameConfig) return existingGameConfig

    const gameConfig = new GameConfig(this, gameId)
    this.fileGuildConfig.games[gameId] = gameConfig.fileGameConfig
    this.games.set(gameId, gameConfig)
    this.save()
    return gameConfig
  }

  getGameConfigs() {
    return Array.from(this.games.keys()).map(gameId => this.getGameConfig(gameId))
  }

  save() {
    this.config.save()
  }

  dispose() {
    if (this.presenceUpdateTimer) clearInterval(this.presenceUpdateTimer)
  }
}
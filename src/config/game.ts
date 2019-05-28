import Discord from 'discord.js'

import { GuildConfig } from "./guild";
import { getGuildHelpers } from "../discord";
import { getOrCreateCommandMessage } from "../discord/command-message";
import { RawPlayerGameData } from '../np-api/player';
import NeptunesPrideApi from '../np-api';
import { decodeHTMLEntities } from '../util';


export interface FileGameConfig {
  controlMessageId?: string
  notificationsEnabled: boolean
  notificationChannelId?: string
  ignored?: boolean
}

const DEFAULT_GAME_CONFIG: FileGameConfig = {
  notificationsEnabled: true
}

export class GameConfig implements BaseConfig {

  fileGameConfig: FileGameConfig
  guildConfig: GuildConfig
  gameId: string

  updateControlMessage?: (...args: any[]) => Promise<void>

  constructor (guildConfig: GuildConfig, gameId: string) {
    this.gameId = gameId
    this.guildConfig = guildConfig

    const gameConfig = { ...DEFAULT_GAME_CONFIG, ...guildConfig.fileGuildConfig.games[gameId] }
    this.fileGameConfig = gameConfig
  }

  get api() {
    return this.guildConfig.api
  }

  get<T extends keyof FileGameConfig>(prop: T) {
    return this.fileGameConfig[prop]
  }

  set<T extends keyof FileGameConfig, V extends FileGameConfig[T]>(prop: T, value: V) {
    console.log(`gameConfig set`, prop, value)
    this.fileGameConfig[prop] = value
    this.guildConfig.save()
  }

  get config() {
    return this.guildConfig.config
  }

  get guild() {
    return this.guildConfig.guild
  }

  async getNotificationChannel() {
    const helpers = getGuildHelpers(this.guild)
    const notificationChannelId =  this.get('notificationChannelId')
    const gameNotificationChannel = await helpers.getOrCreateTextChannel(this.config.get('defaultNotificationChannelName'), notificationChannelId)
    if (!gameNotificationChannel) {
      throw Error(`Could not get or create game notification channel for guild ${this.guild.name}, game ${this.gameId}`)
    }
    if (notificationChannelId !== gameNotificationChannel.id) {
      this.set('notificationChannelId', gameNotificationChannel.id)
      this.save()
    }
    return gameNotificationChannel
  }

  async getGuildGameControlMessageContent(guild: Discord.Guild, game: RawPlayerGameData, api: NeptunesPrideApi) {
    const gameObject = await api.games.get(game.number)

    const notificationChannel = await this.getNotificationChannel()

    const content = new Discord.RichEmbed()
      .setTitle(decodeHTMLEntities(game.name))
      .setURL(`https://np.ironhelmet.com/game/${game.number}`)
      .setDescription(decodeHTMLEntities(game.config.description))
      .setFooter(`Game ID: ${game.number}, last updated ${new Date(Date.now()).toLocaleString()}`)
      .addField('Players', `${game.players}/${game.maxPlayers}`, true)
      .addField('Status', game.status, true)

    if (gameObject && gameObject.universe.isReal) {
      content.addField('Game tick', gameObject.universe.tick, true)
      if (gameObject.universe.turnBased) {
        content.addField('Game turn', gameObject.universe.tick / gameObject.universe.tickRate, true)
      }
    }

    content
      .addField('Notifications', this.get('notificationsEnabled'), true)
      .addField('Notification channel', `#${notificationChannel.name}`, true)

    if (this.get('ignored'))
      content.addField('Ignored', !!this.get('ignored'), true)

    return content
  }


  async getGuildGameControlMessage(channel: Discord.TextChannel, game: RawPlayerGameData, api: NeptunesPrideApi) {
    const messageId = this.get('controlMessageId')
    const { message, update } = await getOrCreateCommandMessage({
      channel,
      messageContentProducer: () => this.getGuildGameControlMessageContent(channel.guild, game, api),
      messageId,
      reactions: {
        '💬': async (update) => {
          this.set('notificationsEnabled', !this.get('notificationsEnabled'))
          return update()
        }
      }
    })

    if (messageId !== message.id) {
      this.set('controlMessageId', message.id)
      this.save()
    }
    return { message, update }
  }

  save() {
    this.guildConfig.save()
  }

  dispose() {
  }
}
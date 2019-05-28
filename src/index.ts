import Discord from 'discord.js'
import { map as bluebirdMap } from 'bluebird'
import chalk from 'chalk'

import { initDiscord, getGuildHelpers, getOrCreateTextChannel } from './discord'
import {
  decodeHTMLEntities
} from './util'

import { config, getConfig, Config } from './config'
import { GuildConfig } from './config/guild'
import { MissingPermissionsError } from './errors';
import { GAME_EVENTS, Game } from './np-api/game';
import NeptunesPrideApi from './np-api';
import { RawPlayerGameData } from './np-api/player';
import { getOrCreateCommandMessage } from './discord/command-message';

require('dotenv-safe').config()

declare var process: {
  env: {
    NEPTUNES_PRIDE_USERNAME: string
    NEPTUNES_PRIDE_PASSWORD: string
    NODE_ENV?: string
  }
}
const {
  NEPTUNES_PRIDE_USERNAME,
  NEPTUNES_PRIDE_PASSWORD,
} = process.env

const send = (channel: Discord.TextChannel, content: string | Discord.RichEmbed) => {
  console.log(`Sending message to ${channel.name}:`)
  if (typeof content === 'object') {
    console.log(JSON.stringify(content, null, 2))
  } else {
    console.log(`"${content}"`)
  }
  return channel.send(content)
}

const initNeptunesPrideApi = async () => {
  const api = new NeptunesPrideApi()

  if (process.env.NODE_ENV === 'development') {
    Object.values(GAME_EVENTS).forEach(event => api.on(event, (...args: any[]) => console.log('API EVENT', event, ...args)))
  }

  await api.getAuthToken(NEPTUNES_PRIDE_USERNAME, NEPTUNES_PRIDE_PASSWORD)
  return api
}


const guildEventListen = (api: NeptunesPrideApi, discordClient: Discord.Client, event: GAME_EVENTS, listener: (guild: Discord.Guild, game: Game, ...args: any[]) => Promise<void> | void) => {
  api.on(event, async (game: Game, ...args: any[]) => {
    try {
      await bluebirdMap(
        discordClient.guilds.array(),
        async guild => {
          try {
            await listener(guild, game, ...args)
          } catch (e) {
            console.error(`Error handling event "${event}" for guild "${guild.name}"`, e)
          }
        },
        { concurrency: 1 }
      )
    } catch (e) {
      console.error(`Error handling event "${event}"`, e)
    }
  })
}

const initGuild = async (config: Config, api: NeptunesPrideApi, guild: Discord.Guild) => {
  let guildConfig: GuildConfig
  let commandChannel: Discord.TextChannel

  await api.updatePlayerGames()

  try {
    guildConfig = await config.getGuildConfig(guild)
    commandChannel = await guildConfig.getCommandChannel()
  } catch (e) {
    if (e instanceof MissingPermissionsError) {
      console.log(chalk.red(`Bot not running for server "${guild.name}" due to missing permissions`))
      return
    }
    throw e
  }

  await commandChannel.fetchMessages()
  const gameControlMessageIds = guildConfig.getGameConfigs().map(g => g.get('controlMessageId'))
  await Promise.all(commandChannel.messages.map(async m => {
    if (m.createdTimestamp > commandChannel.guild.me.joinedTimestamp
      && m.deletable
      && !m.pinned
      && !gameControlMessageIds.includes(m.id)) {
      console.log(`Deleting message ${m.id}`)
      await m.delete()
    }
  }))

  await bluebirdMap(
    api.player.open_games.sort((a, b) => a.number < b.number ? -1 : 1),
    async game => {
      const guildConfig = config.getGuildConfig(guild)
      const gameConfig = guildConfig.getGameConfig(game.number)
      const { message, update } = await gameConfig.getGuildGameControlMessage(commandChannel, game, api)
      gameConfig.updateControlMessage = update
      const gameApi = api.games.get(game.number)
      if (gameApi) {
        gameApi.on(GAME_EVENTS.UNIVERSE_UPDATE, update)
      }
    }
  )
}

const deleteGuild = async (config: Config, guild: Discord.Guild) => {
  config.deleteGuild(guild)
}

;(async () => {
  try {
    const api = await initNeptunesPrideApi()

    const config = getConfig(api)

    const { discordClient } = await initDiscord()

    await bluebirdMap(
      discordClient.guilds.array(),
      async guild => initGuild(config, api, guild),
      { concurrency: 1 }
    )

    discordClient.on('guildCreate', (guild: Discord.Guild) => initGuild(config, api, guild))
    discordClient.on('guildDelete', (guild: Discord.Guild) => deleteGuild(config, guild))

    discordClient.on('message', async (message: Discord.Message) => {
      const guildConfig = config.getGuildConfig(message.guild)
      const commandChannel = await guildConfig.getCommandChannel()
      if (message.channel.id === commandChannel.id && message.author.id !== message.guild.me.id) {
        if (message.content.startsWith('!ignoreGame')) {
          const args = message.content.split(/\s+/)
          const gameId = args[1]
          if (gameId && api.player.open_games.some(game => game.number === gameId)) {
            const gameConfig = await guildConfig.getGameConfig(gameId)
            gameConfig.set('ignored', !gameConfig.get('ignored'))
            if (gameConfig.updateControlMessage) await gameConfig.updateControlMessage()
          }
        }
        try {
          console.log(`Deleting message ${message.id}`)
          await message.delete()
        } catch (e) {
          // This is fine, I guess
        }
      }
    })

    // Register game event handlers for all guilds
    guildEventListen(api, discordClient, GAME_EVENTS.TURN_CHANGE, async (guild: Discord.Guild, game: Game, tick: number) => {
      const guildConfig = await config.getGuildConfig(guild)
      const gameConfig = await guildConfig.getGameConfig(game.gameId)
      if (gameConfig.get('notificationsEnabled')) {
        const notificationChannel = await getOrCreateTextChannel(discordClient, guild, config.get('defaultNotificationChannelName'), gameConfig.get('notificationChannelId'))
        await notificationChannel.send(`Tick tock! Turn change in game "${game.universe.name}", now on tick ${tick}`)
      }
    })

    // Fetch initial universes
    await bluebirdMap(
      api.games.values(),
      async game => {
        await game.loadOrGetUniverse()
      }
    )

    // Start auto-refresh of games
    for (let game of api.games.values()) {
      game.startRefresh()
    }


  } catch (e) {
    console.error(e)
  }
})()
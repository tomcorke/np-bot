import Discord from 'discord.js'
import { map as bluebirdMap } from 'bluebird'
import chalk from 'chalk'

import { initDiscord, getGuildHelpers, getOrCreateTextChannel } from './discord'
import {
  decodeHTMLEntities
} from './util'

import { config } from './config'
import { FileGuildConfig, getCommandChannel, getGameConfig, getGameNotificationChannel, getGuildConfig } from './config/guild'
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

const getGuildGameControlMessageContent = async (guild: Discord.Guild, game: RawPlayerGameData, api: NeptunesPrideApi) => {
  const guildConfig = await getGuildConfig(guild)
  const gameConfig = await getGameConfig(guildConfig, game.number)
  const gameObject = await api.games.get(game.number)

  const notificationChannel = await getGameNotificationChannel(guild, game.number)

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
    .addField('Notifications', gameConfig.notificationsEnabled, true)
    .addField('Notification channel', `#${notificationChannel.name}`, true)

  if (gameConfig.ignored)
    content.addField('Ignored', !!gameConfig.ignored, true)

  return content
}

const getGuildGameControlMessage = async (channel: Discord.TextChannel, game: RawPlayerGameData, api: NeptunesPrideApi) => {

  const guildConfig = await getGuildConfig(channel.guild)
  const gameConfig = await getGameConfig(guildConfig, game.number)

  const { message, update } = await getOrCreateCommandMessage({
    channel,
    messageContentProducer: () => getGuildGameControlMessageContent(channel.guild, game, api),
    messageId: gameConfig.controlMessageId,
    reactions: {
      '💬': async (update) => {
        gameConfig.notificationsEnabled = !gameConfig.notificationsEnabled
        config.save()
        return update()
      }
    }
  })

  gameConfig.controlMessageId = message.id
  await config.save()

  return { message, update }
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

const initGuild = async (api: NeptunesPrideApi, guild: Discord.Guild) => {
  let guildConfig: FileGuildConfig
  let commandChannel: Discord.TextChannel

  await api.updatePlayerGames()

  try {
    guildConfig = await getGuildConfig(guild)
    commandChannel = await getCommandChannel(guild)
  } catch (e) {
    if (e instanceof MissingPermissionsError) {
      console.log(chalk.red(`Bot not running for server "${guild.name}" due to missing permissions`))
      return
    }
    throw e
  }

  await commandChannel.fetchMessages()
  const gameControlMessageIds = Object.values(guildConfig.games).map(g => g.controlMessageId)
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
      const { message, update } = await getGuildGameControlMessage(commandChannel, game, api)
      const gameConfig = getGameConfig(guildConfig, game.number)
      gameConfig.updateControlMessage = update
      const gameApi = api.games.get(game.number)
      if (gameApi) {
        gameApi.on(GAME_EVENTS.UNIVERSE_UPDATE, update)
      }
    }
  )
}

;(async () => {
  try {
    const npApi = await initNeptunesPrideApi()

    const { discordClient } = await initDiscord()

    await bluebirdMap(
      discordClient.guilds.array(),
      async guild => initGuild(npApi, guild),
      { concurrency: 1 }
    )

    discordClient.on('guildCreate', (guild: Discord.Guild) => initGuild(npApi, guild))

    discordClient.on('message', async (message: Discord.Message) => {
      const commandChannel = await getCommandChannel(message.guild)
      const guildConfig = await getGuildConfig(message.guild)
      if (message.channel.id === commandChannel.id && message.author.id !== message.guild.me.id) {
        if (message.content.startsWith('!ignoreGame')) {
          const args = message.content.split(/\s+/)
          const gameId = args[1]
          if (gameId && npApi.player.open_games.some(game => game.number === gameId)) {
            const gameConfig = await getGameConfig(guildConfig, gameId)
            gameConfig.ignored = !gameConfig.ignored;
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
    guildEventListen(npApi, discordClient, GAME_EVENTS.TURN_CHANGE, async (guild: Discord.Guild, game: Game, tick: number) => {
      const helpers = getGuildHelpers(guild)
      const guildConfig = await getGuildConfig(guild)
      const gameConfig = await getGameConfig(guildConfig, game.gameId)
      if (gameConfig.notificationsEnabled) {
        const notificationChannel = await getOrCreateTextChannel(discordClient, guild, config.get('defaultNotificationChannelName'), gameConfig.notificationChannelId)
        await notificationChannel.send(`Tick tock! Turn change in game "${game.universe.name}", now on tick ${tick}`)
      }
    })

    // Fetch initial universes
    await bluebirdMap(
      npApi.games.values(),
      async game => {
        await game.loadOrGetUniverse()
      }
    )

    // Start auto-refresh of games
    for (let game of npApi.games.values()) {
      game.startRefresh()
    }


  } catch (e) {
    console.error(e)
  }
})()
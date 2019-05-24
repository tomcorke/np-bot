import Discord from 'discord.js'
import { map as bluebirdMap } from 'bluebird'
import chalk from 'chalk'

import { initDiscord, getGuildHelpers } from './discord'
import {
  decodeHTMLEntities
} from './util'

import { saveConfig } from './config'
import { GuildConfig, getCommandChannel, getGameConfig, getGameNotificationChannel, getGuildConfig } from './config/guild'
import { MissingPermissionsError } from './errors';
import { GAME_EVENTS, Game } from './np-api/game';
import NeptunesPrideApi from './np-api';
import { RawPlayerGameData } from './np-api/player';

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

const updateGuildControlMessage = async (guild: Discord.Guild, message: Discord.Message, game: RawPlayerGameData) => {
  const guildConfig = await getGuildConfig(guild)
  const gameConfig = await getGameConfig(guildConfig, game.number)

  const notificationChannel = await getGameNotificationChannel(guild, game.number)

  const messageContent = new Discord.RichEmbed()
    .setTitle(decodeHTMLEntities(game.name))
    .setURL(`https://np.ironhelmet.com/game/${game.number}`)
    .setDescription(decodeHTMLEntities(game.config.description))
    .addField('Players', `${game.players}/${game.maxPlayers}`, true)
    .addField('Status', game.status, true)
    .addField('Notifications', gameConfig.notificationsEnabled, true)
    .addField('Notification channel', `#${notificationChannel.name}`, true)


  await message.edit(messageContent)
}

const createOrUpdateGuildGameControlMessage = async (guild: Discord.Guild, commandChannel: Discord.TextChannel, game: RawPlayerGameData) => {

  const guildConfig = await getGuildConfig(guild)
  const gameConfig = await getGameConfig(guildConfig, game.number)

  let gameMessage: Discord.Message | Discord.Message[] | undefined

  const controlMessageId = gameConfig.controlMessageId
  if (controlMessageId) {
    try {
      gameMessage = await commandChannel.fetchMessage(controlMessageId)
    } catch (e) {
      console.error(`Error fetching game control message with ID ${controlMessageId} in guild "${guildConfig.name}"`)
    }
  }
  if (!gameMessage) {
    gameMessage = await send(commandChannel, '')
  }

  const messages = ([] as Discord.Message[]).concat(gameMessage)
  if (messages.length === 0) throw Error(`No game control message for game "${game.name}" in guild "${guildConfig.name}"`)
  if (messages.length > 1) throw Error(`Unexpected more than one game control message for game "${game.name}" in guild "${guildConfig.name}"!`)

  const message = messages[0]
  await updateGuildControlMessage(guild, message, game)

  gameConfig.controlMessageId = message.id
  saveConfig()

  const CONTROL_REACTIONS = ['💬']
  const CONTROL_ACTIONS: { [key: string]: () => Promise<void> } = {
    '💬': async () => {
      gameConfig.notificationsEnabled = !gameConfig.notificationsEnabled
      saveConfig()
      await updateGuildControlMessage(guild, message, game)
    }
  }

  // Clear all existing reactions that aren't by the bot
  await Promise.all(message.reactions
    .map(async r => {
      const users = await r.fetchUsers()
      return Promise.all(users
        .filter(u => (
          u.id !== commandChannel.guild.me.id
          || !CONTROL_REACTIONS.includes(r.emoji.name)
        ))
        .map(u => r.remove(u))
      )
    })
  )

  // Add control reactions
  await Promise.all(CONTROL_REACTIONS.map(r => message.react(r)))

  // Create filter for other user's reactions
  const filter: Discord.CollectorFilter = (reaction: Discord.MessageReaction, user: Discord.User) => {
    if (user.id === message.author.id) return false
    return true
  }
  const collector = message.createReactionCollector(filter)
  collector.on('collect', async (reaction, collector) => {
    try {
      // If unrecognised reaction, remove all occurences of it!
      if (!CONTROL_REACTIONS.includes(reaction.emoji.name)) return await Promise.all(reaction.users.map(user => reaction.remove(user)))
      // Otherwise handle the reaction and remove only instances of this reaction that aren't from the bot
      await CONTROL_ACTIONS[reaction.emoji.name]()
      await Promise.all(reaction.users.filter(u => u.id !== commandChannel.guild.me.id).map(user => reaction.remove(user)))
    } catch (e) {
      console.error(`Error removing reaction "${reaction.emoji.name}" from message ${reaction.message.id}`)
    }
  })

  return gameMessage
}

;(async () => {
  try {
    const npApi = await initNeptunesPrideApi()
    await npApi.updatePlayerGames()

    const { discordClient } = await initDiscord()

    await bluebirdMap(
      discordClient.guilds.array(),
      async guild => {

        let guildConfig: GuildConfig
        let commandChannel: Discord.TextChannel
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

        await bluebirdMap(
          npApi.player.open_games.sort((a, b) => a.number < b.number ? -1 : 1),
          async game => {
            await createOrUpdateGuildGameControlMessage(guild, commandChannel, game)
          }
        )

      },
      { concurrency: 1 }
    )

    const guildEventListen = (event: GAME_EVENTS, listener: (guild: Discord.Guild, game: Game, ...args: any[]) => Promise<void> | void) => {
      npApi.on(event, async (game: Game, ...args: any[]) => {
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

    // Fetch initial universes
    await bluebirdMap(
      npApi.games.values(),
      async game => {
        await game.loadOrGetUniverse()
      }
    )

    // Register game event handlers
    guildEventListen(GAME_EVENTS.TURN_CHANGE, async (guild: Discord.Guild, game: Game, tick: number) => {
      const helpers = getGuildHelpers(guild)
      const logChannel = await helpers.getOrCreateTextChannel('bot-log')
      logChannel.send(`Tick tock! Turn change in game "${game.universe.name}", now on tick ${tick}`)
    })

    // Start auto-refresh of games
    for (let game of npApi.games.values()) {
      game.startRefresh()
    }


  } catch (e) {
    console.error(e)
  }
})()
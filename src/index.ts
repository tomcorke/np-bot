import Discord from 'discord.js'
import { map as bluebirdMap } from 'bluebird'
import chalk from 'chalk'

import { initDiscord, getGuildHelpers } from './discord'
import {
  decodeHTMLEntities
} from './util'

import { initGuild, GuildConfig } from './config/guild'
import { MissingPermissionsError } from './errors';
import { GAME_EVENTS, Game } from './np-api/game';
import NeptunesPrideApi from './np-api';

require('dotenv-safe').config()

declare var process: {
  env: {
    NEPTUNES_PRIDE_USERNAME: string
    NEPTUNES_PRIDE_PASSWORD: string
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

  await api.getAuthToken(NEPTUNES_PRIDE_USERNAME, NEPTUNES_PRIDE_PASSWORD)
  const player = await api.initPlayer()

  player.open_games.forEach(game => api.addGame(game.number, decodeHTMLEntities(game.name)))

  return { npApi: api, player}
}

;(async () => {
  try {
    const { npApi, player } = await initNeptunesPrideApi()
    const { discordClient } = await initDiscord()

    await bluebirdMap(
      discordClient.guilds.array(),
      async guild => {

        let guildConfig: GuildConfig
        let commandChannel: Discord.TextChannel
        try {
          ({
            guildConfig,
            commandChannel
          } = await initGuild(guild))
        } catch (e) {
          if (e instanceof MissingPermissionsError) {
            console.log(chalk.red(`Bot not running for server "${guild.name}" due to missing permissions`))
            return
          }
          throw e
        }

        const pendingMessageDeletions: Promise<any>[] = []
        const existingMessages = await commandChannel.fetchMessages()
        existingMessages.forEach(m => {
          if (m.deletable) pendingMessageDeletions.push(m.delete())
        })
        await Promise.all(pendingMessageDeletions)
        await commandChannel.send('Hello world!')
        await commandChannel.send('Listing active Neptune\'s Pride games:')

        const pendingGameListMessages: Promise<any>[] = []
        player.open_games.forEach(game => {
          pendingGameListMessages.push(send(commandChannel, new Discord.RichEmbed()
            .setTitle(decodeHTMLEntities(game.name))
            .setURL(`https://np.ironhelmet.com/game/${game.number}`)
            .setDescription(decodeHTMLEntities(game.config.description))
            .addField('Players', `${game.players}/${game.maxPlayers}`, true)
          ))
        })
        await Promise.all(pendingGameListMessages)

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
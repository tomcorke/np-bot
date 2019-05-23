import Discord from 'discord.js'
import { map as bluebirdMap } from 'bluebird'
import chalk from 'chalk'

import NeptunesPrideApi from './api'
import { initDiscord, getGuildHelpers } from './discord'
import {
  decodeHTMLEntities
} from './util'

import { config } from './config'
import { getGuildConfig, GuildConfig } from './config/guild'
import { MissingPermissionsError } from './errors';

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

const initApi = async () => {
  const api = new NeptunesPrideApi()

  await api.getAuthToken(NEPTUNES_PRIDE_USERNAME, NEPTUNES_PRIDE_PASSWORD)
  const player = await api.initPlayer()

  if (player.games_in === 1) {
    const gameId = player.open_games[0].number
    api.setGameId(gameId)
  } else if(player.games_in === 0) {
    throw Error('Player is in no games!')
  } else {
    throw Error('Multiple games, prompt here')
  }

  await api.getUniverse()
  console.log('Universe ready')

  return { npApi: api, player}
}

const send = (channel: Discord.TextChannel, content: string | Discord.RichEmbed) => {
  console.log(`Sending message to ${channel.name}:`)
  if (typeof content === 'object') {
    console.log(JSON.stringify(content, null, 2))
  } else {
    console.log(`"${content}"`)
  }
  return channel.send(content)
}

;(async () => {
  try {
    const { npApi, player } = await initApi()
    const { discordClient } = await initDiscord()

    await bluebirdMap(
      discordClient.guilds.array(),
      async guild => {

        const helpers = getGuildHelpers(guild)

        let guildConfig: GuildConfig
        try {
          guildConfig = await getGuildConfig(guild)
        } catch (e) {
          if (e instanceof MissingPermissionsError) {
            console.log(chalk.red(`Bot not running for server "${guild.name}" due to missing permissions`))
            return
          }
          throw e
        }

        const botCommandChannel = await helpers.getOrCreateTextChannel(config.defaultCommandChannelName)
        const categoryId = botCommandChannel.parentID

        const pendingMessageDeletions: Promise<any>[] = []
        const existingMessages = await botCommandChannel.fetchMessages()
        existingMessages.forEach(m => {
          if (m.deletable) pendingMessageDeletions.push(m.delete())
        })
        await Promise.all(pendingMessageDeletions)
        await botCommandChannel.send('Hello world!')
        await botCommandChannel.send('Listing active Neptune\'s Pride games:')

        const pendingGameListMessages: Promise<any>[] = []
        player.open_games.forEach(game => {
          pendingGameListMessages.push(send(botCommandChannel, new Discord.RichEmbed()
            .setTitle(game.name)
            .setURL(`https://np.ironhelmet.com/game/${game.number}`)
            .setDescription(decodeHTMLEntities(game.config.description))
            .addField('Players', `${game.players}/${game.maxPlayers}`, true)
          ))
        })
        await Promise.all(pendingGameListMessages)

      },
      { concurrency: 1 }
    )

  } catch (e) {
    console.error(e)
  }
})()
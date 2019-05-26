import Discord from 'discord.js'
import chalk from 'chalk'

import { config } from '.'
import { MissingPermissionsError } from '../errors'
import { getGuildHelpers } from '../discord'
import { FileGameConfig } from './game';

export interface FileGuildConfig {
  name: string
  commandChannelId?: string
  games: { [gameId: string]: FileGameConfig }
}

const guildConfigs: { [guildId: string]: FileGuildConfig } = {}

const expectedPermissions = [
  'MANAGE_CHANNELS',
  'MANAGE_MESSAGES',
  'READ_MESSAGES',
  'READ_MESSAGE_HISTORY',
  'SEND_MESSAGES',
  'ADD_REACTIONS',
] as const

const initGuild = async (guild: Discord.Guild) => {

  const partialGuildConfig: Partial<FileGuildConfig> = config.get('guilds')[guild.id] || {}

  const botMember = guild.me

  const missingPermissions = expectedPermissions.filter(p => !botMember.hasPermission(p, false, false, false))
  if (missingPermissions.length > 0) {
    console.log(`Bot is missing expected permissions in server "${guild.name}":`)
    console.log(chalk.red(JSON.stringify(missingPermissions)))
    throw new MissingPermissionsError(`Bot is missing expected permissions in server "${guild.name}": ${JSON.stringify(missingPermissions)}`)
  }

  const guildConfig: FileGuildConfig = {
    ...partialGuildConfig,
    name: guild.name,
    games: partialGuildConfig.games || {}
  }

  config.get('guilds')[guild.id] = guildConfig
  guildConfigs[guild.id] = guildConfig

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

  await setRandomPresence()
  setInterval(setRandomPresence, 60000)

  config.save()

  return guildConfig
}

export const getGuildConfig = async (guild: Discord.Guild) => {
  const guildConfig = guildConfigs[guild.id] || await initGuild(guild)
  config.get('guilds')[guild.id] = guildConfig
  return guildConfig
}

export const getCommandChannel = async (guild: Discord.Guild) => {
  const guildConfig = guildConfigs[guild.id] || await initGuild(guild)
  const helpers = getGuildHelpers(guild)
  const commandChannel = await helpers.getOrCreateTextChannel(config.get('defaultCommandChannelName'), guildConfig.commandChannelId)
  if (!commandChannel) {
    throw Error(`Could not get or create command channel for guild ${guild.name}`)
  }
  guildConfig.commandChannelId = commandChannel.id
  return commandChannel
}

export const getGameNotificationChannel = async (guild: Discord.Guild, gameId: string) => {
  const guildConfig = guildConfigs[guild.id] || await initGuild(guild)
  const guildGameConfig = getGameConfig(guildConfig, gameId)
  const helpers = getGuildHelpers(guild)
  const gameNotificationChannel = await helpers.getOrCreateTextChannel(config.get('defaultNotificationChannelName'), guildGameConfig.notificationChannelId)
  if (!gameNotificationChannel) {
    throw Error(`Could not get or create game notification channel for guild ${guild.name}, game ${gameId}`)
  }
  guildGameConfig.notificationChannelId = gameNotificationChannel.id
  return gameNotificationChannel
}

export const hasGameConfig = (guildConfig: FileGuildConfig, gameId: string) => {
  return guildConfig.games[gameId] !== undefined
}

export const getGameConfig = (guildConfig: FileGuildConfig, gameId: string) => {
  const gameConfig = guildConfig.games[gameId] = guildConfig.games[gameId] || {
    notificationsEnabled: true
  }
  return gameConfig
}
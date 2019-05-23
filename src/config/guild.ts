import Discord from 'discord.js'
import chalk from 'chalk'

export interface GuildConfig {
  name: string
  commandChannelId: string
}

import { config, saveConfig } from '.'
import { MissingPermissionsError } from '../errors'
import { getGuildHelpers } from '../discord'

const expectedPermissions = [
  'MANAGE_CHANNELS',
  'MANAGE_MESSAGES',
  'READ_MESSAGES',
  'READ_MESSAGE_HISTORY',
  'SEND_MESSAGES',
  'ADD_REACTIONS',
  'CHANGE_NICKNAME',
  'MANAGE_NICKNAMES',
] as const

export const initGuild = async (guild: Discord.Guild) => {

  const guildConfig: Partial<GuildConfig> = config.guilds.get(guild.id) || {}

  guildConfig.name = guild.name

  const helpers = getGuildHelpers(guild)

  const botMember = guild.me

  const missingPermissions = expectedPermissions.filter(p => !botMember.hasPermission(p, false, false, false))
  if (missingPermissions.length > 0) {
    console.log(`Bot is missing expected permissions in server "${guild.name}":`)
    console.log(chalk.red(JSON.stringify(missingPermissions)))
    throw new MissingPermissionsError(`Bot is missing expected permissions in server "${guild.name}": ${JSON.stringify(missingPermissions)}`)
  }

  let commandChannelId = guildConfig.commandChannelId
  let commandChannel: Discord.TextChannel | undefined
  if (commandChannelId) {
    commandChannel = guild.channels.get(commandChannelId) as Discord.TextChannel | undefined
  }
  if (!commandChannel) {
    commandChannel = await helpers.getOrCreateTextChannel(config.defaultCommandChannelName)
    guildConfig.commandChannelId = commandChannel.id
  }

  config.guilds.set(guild.id, guildConfig as GuildConfig)

  // Set user name and presence

  // await botMember.setNickname('Neptune\'s Pride Watcher')
  const gameMessages = [
    'in ur galaxy',
    'with ur industries',
    'with ur ships',
    'as an evil overlord',
    'the good guy',
    'internet spaceships'
  ]

  await guild.client.user.setPresence({ game: { name: gameMessages[Math.floor(Math.random() * gameMessages.length)] }, status: 'online' })

  saveConfig()

  return {
    guildConfig: guildConfig as GuildConfig,
    commandChannel,
  }
}
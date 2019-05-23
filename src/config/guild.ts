import Discord from 'discord.js'
import chalk from 'chalk'

export interface GuildConfig {
  botRoleId?: string
  commandChannelId?: string
}

import { config } from '.'
import { MissingPermissionsError } from '../errors'
import { getGuildHelpers } from '../discord'

const expectedPermissions = [
  'MANAGE_CHANNELS',
  'MANAGE_MESSAGES',
  'READ_MESSAGES',
  'READ_MESSAGE_HISTORY',
  'SEND_MESSAGES',
  'ADD_REACTIONS',
] as const

export const getGuildConfig = async (guild: Discord.Guild) => {

  const guildConfig: GuildConfig = config.guilds.get(guild.id) || {}

  const botMember = guild.me
  const missingPermissions = expectedPermissions.filter(p => !botMember.hasPermission(p, false, false, false))
  if (missingPermissions.length > 0) {
    console.log(`Bot is missing expected permissions in server "${guild.name}":`)
    console.log(chalk.red(JSON.stringify(missingPermissions)))
    throw new MissingPermissionsError(`Bot is missing expected permissions in server "${guild.name}": ${JSON.stringify(missingPermissions)}`)
  }

  return guildConfig
}
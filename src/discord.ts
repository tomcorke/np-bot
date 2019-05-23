import Discord from 'discord.js'

require('dotenv-safe').config()

declare var process: {
  env: {
    DISCORD_BOT_TOKEN: string
  }
}
const {
  DISCORD_BOT_TOKEN
} = process.env

export const initDiscord = async () => {

  const discordClient = new Discord.Client()

  const clientReady = new Promise(resolve => {
    discordClient.once('ready', () => {
      console.log('Discord client ready')
      resolve()
    })
  })

  discordClient.login(DISCORD_BOT_TOKEN)

  await clientReady

  return { discordClient }
}

export const getGuildHelpers = (guild: Discord.Guild) => {
  const client = guild.client
  return {
    getTextChannels: getTextChannels.bind(null, client, guild),
    getTextChannel: getTextChannel.bind(null, client, guild),
    getOrCreateTextChannel: getOrCreateTextChannel.bind(null, client, guild),
  }
}

export const getTextChannels = (discordClient: Discord.Client, guild: Discord.Guild) => {
  return guild.channels.filter(c => c.type === 'text') as Discord.Collection<string, Discord.TextChannel>
}

export const getTextChannel = (discordClient: Discord.Client, guild: Discord.Guild, name: string) => {
  return getTextChannels(discordClient, guild).find(c => c.name === name) as Discord.TextChannel | undefined
}

export const getOrCreateTextChannel = async (discordClient: Discord.Client, guild: Discord.Guild, name: string, options?: Discord.ChannelData) => {
  let channel = getTextChannel(discordClient, guild, name)
  if (channel) return channel
  channel = await guild.createChannel(name, { ...options, type: 'text' }) as Discord.TextChannel
  return channel
}
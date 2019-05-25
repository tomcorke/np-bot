import Discord from 'discord.js'
import chalk from 'chalk'

type MessageContentProducer = () => string | Discord.RichEmbed | Promise<string> | Promise<Discord.RichEmbed>

type UpdateMessageFunction = () => Promise<void>

interface CommandMessageReactionMap {
  [emojiName: string]: (update: UpdateMessageFunction) => void | Promise<void>
}

interface CommandMessageOptions {
  channel: Discord.TextChannel,
  messageId?: string,
  messageContentProducer: MessageContentProducer,
  reactions?: CommandMessageReactionMap
}

export const getOrCreateCommandMessage = async (options: CommandMessageOptions) => {
  const {
    channel,
    messageId,
    messageContentProducer,
    reactions = {},
  } = options

  // Attempt to find existing message if ID is passed
  let existingMessage: Discord.Message | undefined
  if (messageId) {
    try {
      existingMessage = await channel.fetchMessage(messageId)
    } catch (e) {
      console.log(`Could not get message in guild "${chalk.green(channel.guild.name)}", channel "${chalk.green(channel.name)}", messageId: ${messageId}`)
    }
  }

  // Create new placeholder message if no existing message
  let newMessage: Discord.Message | Discord.Message[] = []
  if (!existingMessage) {
    newMessage = await channel.send('...')
  }

  const message = ([] as Discord.Message[]).concat(existingMessage || newMessage)[0]
  if (!message) {
    throw Error(`Could not get or create command message in guild "${chalk.green(channel.guild.name)}", channel "${chalk.green(channel.name)}", messageId: ${messageId}`)
  }

  // Create update method which fetches content from messageContentProducer
  const update: UpdateMessageFunction = async () => {
    if (message) {
      const messageContent = await messageContentProducer()
      await message.edit(messageContent)
    }
  }

  // Remove all reactions by users other than bot, and any other reactions not in command reactions
  const reactionKeys = Object.keys(reactions)
  await Promise.all(message.reactions.map(async r => {
    const users = await r.fetchUsers()
    await Promise.all(users
      .filter(u => u.id !== channel.guild.me.id || !reactionKeys.includes(r.emoji.name))
      .map(async u => r.remove(u)))
  }))

  await Promise.all(reactionKeys.map(r => message.react(r)))

  // Create filter for other user's reactions
  const filter: Discord.CollectorFilter = (reaction: Discord.MessageReaction, user: Discord.User) => user.id !== message.author.id

  // Handle reactions on this message
  const collector = message.createReactionCollector(filter)
  collector.on('collect', async reaction => {
    try {
      // If unrecognised reaction, remove all occurences of it!
      if (!reactionKeys.includes(reaction.emoji.name)) return await Promise.all(reaction.users.map(user => reaction.remove(user)))
      // Otherwise handle the reaction and remove only instances of this reaction that aren't from the bot
      // Pass update method into reaction handlers, so they may trigger an update of the message by calling it
      await reactions[reaction.emoji.name](update)
      await Promise.all(reaction.users.filter(u => u.id !== channel.guild.me.id).map(user => reaction.remove(user)))
    } catch (e) {
      console.error(`Error removing or handling reaction "${reaction.emoji.name}" from message ${reaction.message.id}`)
    }
  })

  // Update message first time
  await update()

  return { message, update }
}
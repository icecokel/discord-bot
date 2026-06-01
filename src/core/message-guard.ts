import { ChannelType, Message } from "discord.js";

export const shouldProcessMessage = (
  message: Pick<Message, "author" | "channel">,
  ownerId: string | undefined,
): boolean => {
  if (message.author.bot) return false;
  if (!ownerId) return false;
  if (message.author.id !== ownerId) return false;
  return message.channel.type === ChannelType.DM;
};

import { ChannelType, Message } from "discord.js";

export const shouldProcessMessage = (
  message: Pick<Message, "author" | "channel">,
  _ownerId?: string,
): boolean => {
  if (message.author.bot) return false;
  return true;
};

export const shouldProcessNaturalLanguageMessage = (
  message: Pick<Message, "channel">,
): boolean => {
  return message.channel.type === ChannelType.DM;
};

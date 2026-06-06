import { ChannelType, Message } from "discord.js";

export const shouldProcessMessage = (
  message: Pick<Message, "author" | "channel">,
  _ownerId?: string,
): boolean => {
  if (message.author.bot) return false;
  return true;
};

export const shouldProcessNaturalLanguageMessage = (
  message: Pick<Message, "author" | "channel">,
  adminId?: string,
): boolean => {
  return Boolean(
    adminId &&
      message.author.id === adminId &&
      message.channel.type === ChannelType.DM,
  );
};

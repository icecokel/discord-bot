export const normalizeCommandArgs = (args: string[]): string[] => {
  return args.map((arg) => arg.trim()).filter((arg) => arg.length > 0);
};

export const joinRegionTokens = (args: string[]): string => {
  return args.join(" ").trim();
};

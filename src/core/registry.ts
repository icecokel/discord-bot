// This file is manually updated for TypeScript migration.
// If you run 'npm run build', the generate-registry script might overwrite this file with JS requires.
// For now, we manually import TS files.

import help from "../features/basic/commands/help";
import info from "../features/basic/commands/info";
import ping from "../features/basic/commands/ping";
import whoami from "../features/basic/commands/whoami";

import game from "../features/games/commands/game";

import fortune from "../features/tools/commands/fortune";
import weatherWeekly from "../features/tools/commands/weather-weekly";
import weather from "../features/tools/commands/weather";
import reminder from "../features/tools/commands/reminder";
import seasonalFood from "../features/info/commands/seasonal-food";

export const commands = [
  help,
  info,
  ping,
  whoami,
  game,
  fortune,
  weatherWeekly,
  weather,
  reminder,
  seasonalFood,
];

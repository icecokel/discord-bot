// This file is manually updated for TypeScript migration.
// If you run 'npm run build', the generate-registry script might overwrite this file with JS requires.
// For now, we manually import TS files.

import help from "../features/basic/commands/help";
import info from "../features/basic/commands/info";
import ping from "../features/basic/commands/ping";
import whoami from "../features/basic/commands/whoami";

import answer from "../features/games/commands/answer";
import dice from "../features/games/commands/dice";
import wordQuiz from "../features/games/commands/word-quiz";

import fortune from "../features/tools/commands/fortune";
import weatherWeekly from "../features/tools/commands/weather-weekly";
import weather from "../features/tools/commands/weather";
import seasonalFood from "../features/info/commands/seasonal-food";

export const commands = [
  help,
  info,
  ping,
  whoami,
  answer,
  dice,
  wordQuiz,
  fortune,
  weatherWeekly,
  weather,
  seasonalFood,
];

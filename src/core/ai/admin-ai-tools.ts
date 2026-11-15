import type { AiToolset } from "./providers/base-provider";
import { getGmailToolset } from "../../features/gmail-monitor/gmail-ai-tools";

/**
 * Registry of toolsets the admin Claude can use. The bot's other capabilities are either
 * listed here (Claude calls them while answering) or run as scheduled jobs.
 * Each provider returns null when its feature is disabled or unconfigured.
 */
const TOOLSET_PROVIDERS: (() => AiToolset | null)[] = [
  getGmailToolset,
];

export const getAdminAiToolsets = (): AiToolset[] =>
  TOOLSET_PROVIDERS.map((provide) => provide()).filter((toolset): toolset is AiToolset => toolset !== null);

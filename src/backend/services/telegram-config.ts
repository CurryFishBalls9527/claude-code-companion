import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const CONFIG_PATH = join(homedir(), '.claude', 'companion-telegram.json');

export interface TelegramConfig {
  botToken: string;
  allowedUserIds: number[];
  enabled: boolean;
}

const DEFAULT_CONFIG: TelegramConfig = {
  botToken: '',
  allowedUserIds: [],
  enabled: false,
};

export function loadTelegramConfig(): TelegramConfig {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG };
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    return {
      botToken: raw.botToken ?? '',
      allowedUserIds: Array.isArray(raw.allowedUserIds) ? raw.allowedUserIds : [],
      enabled: raw.enabled ?? false,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveTelegramConfig(config: TelegramConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/** Return config with bot token masked for frontend display */
export function maskConfig(config: TelegramConfig): TelegramConfig & { tokenSet: boolean } {
  return {
    ...config,
    botToken: config.botToken ? '***' + config.botToken.slice(-4) : '',
    tokenSet: !!config.botToken,
  };
}

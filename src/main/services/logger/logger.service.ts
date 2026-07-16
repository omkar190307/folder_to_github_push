import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { getPrismaClient } from '../database/db-setup';

export class LoggerService {
  private static logFilePath: string | null = null;

  private static getLogFile(): string {
    if (this.logFilePath) return this.logFilePath;
    const isProd = app.isPackaged;
    const logDir = isProd 
      ? path.join(app.getPath('userData'), 'logs')
      : path.join(process.cwd(), 'logs');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    this.logFilePath = path.join(logDir, 'app.log');
    return this.logFilePath;
  }

  public static sanitize(message: string): string {
    if (!message) return '';
    // Redact standard GitHub PATs (ghp_...)
    let clean = message.replace(/ghp_[a-zA-Z0-9]{36,255}/g, '[REDACTED_TOKEN]');
    // Redact GitHub OAuth tokens or newer PATs (github_pat_...)
    clean = clean.replace(/github_pat_[a-zA-Z0-9_]{82}/g, '[REDACTED_TOKEN]');
    // Redact general bearer/oauth authorizations
    clean = clean.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]');
    return clean;
  }

  private static writeToFile(level: string, message: string) {
    try {
      const logFile = this.getLogFile();
      const sanitized = this.sanitize(message);
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] [${level.toUpperCase()}] ${sanitized}\n`;
      fs.appendFileSync(logFile, line, 'utf8');
      console.log(line.trim());
    } catch (err) {
      console.error('Failed to write log file:', err);
    }
  }

  public static async info(action: string, details: string) {
    this.writeToFile('INFO', `${action}: ${details}`);
    try {
      const prisma = getPrismaClient();
      await prisma.activityLog.create({
        data: {
          action: this.sanitize(action),
          details: this.sanitize(details),
        },
      });
    } catch {
      // Ignored if db not yet initialized
    }
  }

  public static async error(errorMsg: string, stack?: string) {
    this.writeToFile('ERROR', `${errorMsg} ${stack || ''}`);
    try {
      const prisma = getPrismaClient();
      await prisma.errorLog.create({
        data: {
          error: this.sanitize(errorMsg),
          stack: stack ? this.sanitize(stack) : undefined,
        },
      });
    } catch {
      // Ignored if db not yet initialized
    }
  }
}

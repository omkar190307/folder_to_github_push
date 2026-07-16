import { ApplicationSettings } from '@prisma/client';
import { getPrismaClient } from '../database/db-setup';
import { LoggerService } from '../logger/logger.service';

export class SettingsService {
  public static async getSettings(): Promise<ApplicationSettings> {
    try {
      const prisma = getPrismaClient();
      let settings = await prisma.applicationSettings.findUnique({
        where: { id: 'default' },
      });

      if (!settings) {
        settings = await prisma.applicationSettings.create({
          data: {
            id: 'default',
            theme: 'dark',
            defaultVisibility: 'private',
            autoCommit: false,
            autoPush: false,
            autoPull: false,
            uploadConcurrency: 3,
            checkUpdates: true,
          },
        });
      }

      return settings;
    } catch (err) {
      await LoggerService.error('Failed to get application settings', (err as Error).stack);
      throw err;
    }
  }

  public static async updateSettings(
    newSettings: Partial<Omit<ApplicationSettings, 'id'>>
  ): Promise<ApplicationSettings> {
    try {
      const prisma = getPrismaClient();
      const updated = await prisma.applicationSettings.update({
        where: { id: 'default' },
        data: newSettings,
      });

      await LoggerService.info('Settings Updated', JSON.stringify(newSettings));
      return updated;
    } catch (err) {
      await LoggerService.error('Failed to update application settings', (err as Error).stack);
      throw err;
    }
  }
}

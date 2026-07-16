import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let prisma: PrismaClient | null = null;

export function getDbPath(): string {
  const isProd = app.isPackaged;
  const dbDir = isProd 
    ? path.join(app.getPath('userData'), 'database')
    : path.join(process.cwd(), 'database');
  
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  return path.join(dbDir, 'publisher-pro.db');
}

export async function initializeDatabase(): Promise<PrismaClient> {
  if (prisma) return prisma;

  const dbPath = getDbPath();
  const dbExists = fs.existsSync(dbPath);

  if (!dbExists) {
    const isProd = app.isPackaged;
    // In dev, the template database is at prisma/dev.db
    // In prod, we copy from process.resourcesPath/templates/dev.db or the packaged location
    const templateDbPath = isProd
      ? path.join(process.resourcesPath, 'templates', 'dev.db')
      : path.join(process.cwd(), 'prisma', 'dev.db');

    if (fs.existsSync(templateDbPath)) {
      try {
        fs.copyFileSync(templateDbPath, dbPath);
      } catch (err) {
        console.error('Failed to copy database template:', err);
      }
    } else {
      console.warn('Database template not found at:', templateDbPath);
    }
  }

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${dbPath}`,
      },
    },
  });

  // Seed default settings if they don't exist
  try {
    const settingsCount = await prisma.applicationSettings.count();
    if (settingsCount === 0) {
      await prisma.applicationSettings.create({
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
  } catch (err) {
    console.error('Error seeding default settings:', err);
  }

  return prisma;
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return prisma;
}

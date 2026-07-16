import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initializeDatabase } from './services/database/db-setup';
import { registerIpcHandlers } from './ipc/ipc-handlers';
import { LoggerService } from './services/logger/logger.service';

let mainWindow: BrowserWindow | null = null;

// Configure Prisma Engine Library Path for Packaged Apps
if (app.isPackaged) {
  const isWin = process.platform === 'win32';
  const queryEngineName = isWin ? 'query_engine-windows.dll.node' : 'libquery_engine.so.node';
  const queryEnginePath = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    '.prisma',
    'client',
    queryEngineName
  );
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = queryEnginePath;
}

async function createWindow() {
  const preloadPath = path.join(__dirname, '../preload/preload.js');
  console.log('Preload Absolute Path:', path.resolve(preloadPath));
  console.log('Preload File Exists?:', require('fs').existsSync(preloadPath));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
    title: 'GitHub Project Publisher Pro',
    backgroundColor: '#0f172a',
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('Preload script error:', preloadPath, error);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (${sourceId}:${line})`);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    await initializeDatabase();
    await LoggerService.info('Startup', 'Database initialized successfully.');

    registerIpcHandlers();
    await LoggerService.info('Startup', 'IPC handlers registered successfully.');

    await createWindow();
    await LoggerService.info('Startup', 'Main window created successfully.');
  } catch (err) {
    console.error('Application startup failure:', err);
    try {
      await LoggerService.error('Application startup failure', (err as Error).stack);
    } catch {}
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (mainWindow === null) {
    await createWindow();
  }
});

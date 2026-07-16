const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

async function startDev() {
  console.log('Starting development environment...');
  
  const isWin = process.platform === 'win32';
  const npxCmd = isWin ? 'npx.cmd' : 'npx';

  // Start Vite dev server in background
  const viteProcess = spawn(npxCmd, ['vite'], {
    shell: true,
    stdio: 'inherit',
  });

  const buildMain = async () => {
    try {
      await esbuild.build({
        entryPoints: [path.join(__dirname, '../src/main/main.ts')],
        bundle: true,
        platform: 'node',
        target: 'node20',
        outfile: path.join(__dirname, '../dist/main/main.js'),
        external: ['electron', '@prisma/client'],
        sourcemap: true,
      });

      await esbuild.build({
        entryPoints: [path.join(__dirname, '../src/main/preload.ts')],
        bundle: true,
        platform: 'node',
        target: 'node20',
        outfile: path.join(__dirname, '../dist/preload/preload.js'),
        external: ['electron'],
        sourcemap: true,
      });
      console.log('Electron main & preload compiled.');
      return true;
    } catch (err) {
      console.error('Esbuild compile failed:', err);
      return false;
    }
  };

  const compiled = await buildMain();
  if (!compiled) {
    viteProcess.kill();
    process.exit(1);
  }

  let electronProcess = null;
  let isRestarting = false;
  const startElectron = () => {
    if (electronProcess) {
      isRestarting = true;
      electronProcess.kill();
    }
    
    electronProcess = spawn(npxCmd, ['electron', '.'], {
      shell: true,
      stdio: 'inherit',
    });

    electronProcess.on('close', () => {
      if (!isRestarting) {
        viteProcess.kill();
        process.exit(0);
      }
      isRestarting = false;
    });
  };

  startElectron();

  const srcMainPath = path.join(__dirname, '../src/main');
  let fsTimeout = null;

  fs.watch(srcMainPath, { recursive: true }, async (event, filename) => {
    if (filename) {
      if (fsTimeout) return;
      fsTimeout = setTimeout(() => { fsTimeout = null; }, 500);
      
      console.log(`File change detected in main process: ${filename}. Recompiling...`);
      const success = await buildMain();
      if (success) {
        console.log('Restarting Electron...');
        startElectron();
      }
    }
  });
}

startDev().catch((err) => {
  console.error('Failed to start dev:', err);
  process.exit(1);
});

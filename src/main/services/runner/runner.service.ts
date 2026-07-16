import { ChildProcess, spawn } from 'child_process';
import { getPrismaClient } from '../database/db-setup';
import { LoggerService } from '../logger/logger.service';
import { BrowserWindow } from 'electron';
import { exec } from 'child_process';

export class RunnerService {
  private static runningProcesses = new Map<string, {
    process: ChildProcess;
    startTime: number;
    logBuffer: string[];
    command: string;
  }>();

  private static getWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  }

  /**
   * Spawns a command for a project and listens to stdout/stderr.
   */
  public static async runProject(projectId: string, command: string, folderPath: string): Promise<boolean> {
    if (this.runningProcesses.has(projectId)) {
      throw new Error('Project is already running.');
    }

    try {
      await LoggerService.info('Runner', `Starting project ${projectId} with command: ${command}`);
      
      const startTime = Date.now();
      const isWindows = process.platform === 'win32';
      
      let proc: ChildProcess;
      if (isWindows) {
        proc = spawn('cmd.exe', ['/c', command], {
          cwd: folderPath,
          env: process.env,
        });
      } else {
        const tokens = command.split(/\s+/);
        const execName = tokens[0];
        const args = tokens.slice(1);
        proc = spawn(execName, args, {
          cwd: folderPath,
          env: process.env,
        });
      }

      const logBuffer: string[] = [];
      const runningEntry = {
        process: proc,
        startTime,
        logBuffer,
        command,
      };
      
      this.runningProcesses.set(projectId, runningEntry);

      const sendLog = (text: string) => {
        logBuffer.push(text);
        if (logBuffer.length > 5000) {
          logBuffer.shift();
        }
        
        const win = this.getWindow();
        if (win) {
          win.webContents.send(`project-log:${projectId}`, text);
        }
      };

      proc.stdout?.on('data', (data) => {
        const text = data.toString('utf8');
        sendLog(text);
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString('utf8');
        sendLog(text);
      });

      proc.on('close', async (code) => {
        const duration = Date.now() - startTime;
        this.runningProcesses.delete(projectId);

        await LoggerService.info('Runner', `Project ${projectId} exited with code ${code}`);

        try {
          const prisma = getPrismaClient();
          await prisma.runHistory.create({
            data: {
              projectId,
              command,
              exitCode: code ?? -1,
              duration,
              logs: logBuffer.join(''),
            },
          });
        } catch (dbErr) {
          console.error('Failed to write run history to DB:', dbErr);
        }

        const win = this.getWindow();
        if (win) {
          win.webContents.send(`project-exit:${projectId}`, code);
        }
      });

      proc.on('error', async (err) => {
        sendLog(`System Error: ${err.message}\n`);
        await LoggerService.error(`Runner spawn error on project ${projectId}`, err.stack);
      });

      return true;
    } catch (err) {
      await LoggerService.error(`Runner failed to run project ${projectId}`, (err as Error).stack);
      throw err;
    }
  }

  /**
   * Kills the running project process, killing the tree on Windows.
   */
  public static async stopProject(projectId: string): Promise<boolean> {
    const entry = this.runningProcesses.get(projectId);
    if (!entry) {
      return false;
    }

    const { process: proc } = entry;
    
    return new Promise((resolve) => {
      const pid = proc.pid;
      if (!pid) {
        proc.kill();
        this.runningProcesses.delete(projectId);
        resolve(true);
        return;
      }

      const isWindows = process.platform === 'win32';
      if (isWindows) {
        exec(`taskkill /pid ${pid} /f /t`, (err) => {
          this.runningProcesses.delete(projectId);
          resolve(!err);
        });
      } else {
        proc.kill('SIGTERM');
        this.runningProcesses.delete(projectId);
        resolve(true);
      }
    });
  }

  public static isRunning(projectId: string): boolean {
    return this.runningProcesses.has(projectId);
  }

  public static getRunningLogs(projectId: string): string {
    const entry = this.runningProcesses.get(projectId);
    return entry ? entry.logBuffer.join('') : '';
  }
}

import { ipcMain, dialog, BrowserWindow } from 'electron';
import { getPrismaClient } from '../services/database/db-setup';
import { ScannerService } from '../services/scanner/scanner.service';
import { GitService } from '../services/git/git.service';
import { GitHubService } from '../services/github/github.service';
import { RunnerService } from '../services/runner/runner.service';
import { SecurityService } from '../services/security/security.service';
import { SettingsService } from '../services/config/settings.service';
import { LoggerService } from '../services/logger/logger.service';

export function registerIpcHandlers() {
  const prisma = getPrismaClient();

  // Scanner
  ipcMain.handle('scanner:select-directory', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const targetPath = result.filePaths[0];
    return targetPath;
  });

  ipcMain.handle('scanner:scan', async (_event, path: string) => {
    if (!SecurityService.validatePath(path)) {
      throw new Error('Invalid or non-existent path selected');
    }
    return await ScannerService.scanAndSave(path);
  });

  // DB Project CRUD
  ipcMain.handle('db:get-projects', async () => {
    return await prisma.project.findMany({
      orderBy: { lastOpened: 'desc' },
    });
  });

  ipcMain.handle('db:get-project', async (_event, id: string) => {
    return await prisma.project.update({
      where: { id },
      data: { lastOpened: new Date() },
    });
  });

  ipcMain.handle('db:update-project', async (_event, id: string, data: any) => {
    // Avoid changing id or timestamps manually
    const { id: _, createdAt, updatedAt, ...updatable } = data;
    return await prisma.project.update({
      where: { id },
      data: updatable,
    });
  });

  ipcMain.handle('db:delete-project', async (_event, id: string) => {
    return await prisma.project.delete({
      where: { id },
    });
  });

  // DB GitHub Accounts
  ipcMain.handle('db:get-github-accounts', async () => {
    const accounts = await prisma.githubAccount.findMany();
    // Do not return raw or encrypted token to renderer for safety
    return accounts.map(a => ({
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      avatar: a.avatar,
      defaultAccount: a.defaultAccount,
      lastLogin: a.lastLogin,
    }));
  });

  ipcMain.handle('db:save-github-account', async (_event, account: { username: string; displayName?: string; avatar?: string; token: string }) => {
    const encryptedToken = SecurityService.encrypt(account.token);
    
    const existing = await prisma.githubAccount.findFirst({
      where: { username: account.username },
    });

    if (existing) {
      return await prisma.githubAccount.update({
        where: { id: existing.id },
        data: {
          displayName: account.displayName || existing.displayName,
          avatar: account.avatar || existing.avatar,
          encryptedToken,
          lastLogin: new Date(),
        },
      });
    } else {
      const count = await prisma.githubAccount.count();
      return await prisma.githubAccount.create({
        data: {
          username: account.username,
          displayName: account.displayName,
          avatar: account.avatar,
          encryptedToken,
          defaultAccount: count === 0,
        },
      });
    }
  });

  ipcMain.handle('db:delete-github-account', async (_event, id: string) => {
    return await prisma.githubAccount.delete({
      where: { id },
    });
  });

  ipcMain.handle('db:set-default-github-account', async (_event, id: string) => {
    await prisma.githubAccount.updateMany({
      data: { defaultAccount: false },
    });
    return await prisma.githubAccount.update({
      where: { id },
      data: { defaultAccount: true },
    });
  });

  // Git operations
  ipcMain.handle('git:is-installed', async () => {
    return await GitService.isGitInstalled();
  });

  ipcMain.handle('git:init', async (_event, path: string) => {
    return await GitService.initProject(path);
  });

  ipcMain.handle('git:status', async (_event, path: string) => {
    try {
      const git = (GitService as any).getGit(path);
      return await git.status();
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle('git:publish', async (_event, projectId: string, repoUrl: string, token: string, message?: string) => {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Project not found');

    let resolvedToken = token;
    if (!resolvedToken) {
      const defaultAccount = await prisma.githubAccount.findFirst({ where: { defaultAccount: true } });
      if (!defaultAccount) throw new Error('No GitHub account authenticated.');
      resolvedToken = SecurityService.decrypt(defaultAccount.encryptedToken);
    }

    const uploadHistory = await prisma.uploadHistory.create({
      data: {
        projectId,
        status: 'PENDING',
        startedAt: new Date(),
      },
    });

    try {
      const isGitInit = project.gitInitialized;
      if (!isGitInit) {
        await GitService.initProject(project.folderPath);
        await prisma.project.update({
          where: { id: projectId },
          data: { gitInitialized: true },
        });
      }

      const commitHash = await GitService.commitAndPush(project.folderPath, repoUrl, resolvedToken, message);

      let repository = await prisma.repository.findFirst({ where: { url: repoUrl } });
      if (!repository) {
        const match = repoUrl.match(/\/([^\/]+)\.git$/);
        const repositoryName = match ? match[1] : project.name;
        repository = await prisma.repository.create({
          data: {
            repositoryName,
            visibility: 'unknown',
            url: repoUrl,
          },
        });
      }

      await prisma.project.update({
        where: { id: projectId },
        data: { repositoryId: repository.id },
      });

      await prisma.uploadHistory.update({
        where: { id: uploadHistory.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          commitHash,
          repositoryUrl: repoUrl,
        },
      });

      return { success: true, commitHash };
    } catch (err) {
      await prisma.uploadHistory.update({
        where: { id: uploadHistory.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage: (err as Error).message,
        },
      });
      throw err;
    }
  });

  ipcMain.handle('git:pull', async (_event, projectId: string, repoUrl: string, token: string) => {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Project not found');

    let resolvedToken = token;
    if (!resolvedToken) {
      const defaultAccount = await prisma.githubAccount.findFirst({ where: { defaultAccount: true } });
      if (!defaultAccount) throw new Error('No GitHub account authenticated.');
      resolvedToken = SecurityService.decrypt(defaultAccount.encryptedToken);
    }

    return await GitService.pull(project.folderPath, repoUrl, resolvedToken);
  });

  // GitHub services
  ipcMain.handle('github:device-code', async (_event, clientId: string) => {
    return await GitHubService.requestDeviceCode(clientId);
  });

  ipcMain.handle('github:poll-token', async (_event, clientId: string, deviceCode: string, interval: number) => {
    return await GitHubService.pollForToken(clientId, deviceCode, interval);
  });

  ipcMain.handle('github:validate-token', async (_event, token: string) => {
    return await GitHubService.validateToken(token);
  });

  ipcMain.handle('github:create-repo', async (_event, token: string, name: string, description: string, isPrivate: boolean) => {
    let resolvedToken = token;
    if (!resolvedToken) {
      const defaultAccount = await prisma.githubAccount.findFirst({ where: { defaultAccount: true } });
      if (!defaultAccount) throw new Error('No GitHub account authenticated.');
      resolvedToken = SecurityService.decrypt(defaultAccount.encryptedToken);
    }
    const cleanRepoName = SecurityService.sanitizeRepoName(name);
    return await GitHubService.createRepository(resolvedToken, cleanRepoName, description, isPrivate);
  });

  // Runner
  ipcMain.handle('runner:run', async (_event, projectId: string, command: string, folderPath: string) => {
    return await RunnerService.runProject(projectId, command, folderPath);
  });

  ipcMain.handle('runner:stop', async (_event, projectId: string) => {
    return await RunnerService.stopProject(projectId);
  });

  ipcMain.handle('runner:is-running', (_event, projectId: string) => {
    return RunnerService.isRunning(projectId);
  });

  ipcMain.handle('runner:get-logs', (_event, projectId: string) => {
    return RunnerService.getRunningLogs(projectId);
  });

  // Settings
  ipcMain.handle('settings:get', async () => {
    return await SettingsService.getSettings();
  });

  ipcMain.handle('settings:update', async (_event, data: any) => {
    return await SettingsService.updateSettings(data);
  });

  // Logs & History
  ipcMain.handle('logs:get', async () => {
    const activityLogs = await prisma.activityLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    const errorLogs = await prisma.errorLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    const uploadHistory = await prisma.uploadHistory.findMany({
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    const runHistory = await prisma.runHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return { activityLogs, errorLogs, uploadHistory, runHistory };
  });

  ipcMain.handle('logs:activity', async (_event, action: string, details: string) => {
    await LoggerService.info(action, details);
    return true;
  });

  ipcMain.handle('logs:error', async (_event, error: string, stack?: string) => {
    await LoggerService.error(error, stack);
    return true;
  });
}

console.log('[Preload] Preload script initializing...');
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  selectDirectory: () => ipcRenderer.invoke('scanner:select-directory'),
  scanDirectory: (path: string) => ipcRenderer.invoke('scanner:scan', path),
  
  getProjects: () => ipcRenderer.invoke('db:get-projects'),
  getProject: (id: string) => ipcRenderer.invoke('db:get-project', id),
  updateProject: (id: string, data: any) => ipcRenderer.invoke('db:update-project', id, data),
  deleteProject: (id: string) => ipcRenderer.invoke('db:delete-project', id),
  
  getGithubAccounts: () => ipcRenderer.invoke('db:get-github-accounts'),
  saveGithubAccount: (account: any) => ipcRenderer.invoke('db:save-github-account', account),
  deleteGithubAccount: (id: string) => ipcRenderer.invoke('db:delete-github-account', id),
  setDefaultGithubAccount: (id: string) => ipcRenderer.invoke('db:set-default-github-account', id),
  
  checkGitInstalled: () => ipcRenderer.invoke('git:is-installed'),
  initGit: (path: string) => ipcRenderer.invoke('git:init', path),
  gitStatus: (path: string) => ipcRenderer.invoke('git:status', path),
  publishProject: (projectId: string, repoUrl: string, token: string, message?: string) => 
    ipcRenderer.invoke('git:publish', projectId, repoUrl, token, message),
  pullProject: (projectId: string, repoUrl: string, token: string) => 
    ipcRenderer.invoke('git:pull', projectId, repoUrl, token),
    
  githubRequestDeviceCode: (clientId: string) => ipcRenderer.invoke('github:device-code', clientId),
  githubPollForToken: (clientId: string, deviceCode: string, interval: number) => 
    ipcRenderer.invoke('github:poll-token', clientId, deviceCode, interval),
  githubValidateToken: (token: string) => ipcRenderer.invoke('github:validate-token', token),
  githubCreateRepo: (token: string, name: string, description: string, isPrivate: boolean) => 
    ipcRenderer.invoke('github:create-repo', token, name, description, isPrivate),

  runProject: (projectId: string, command: string, folderPath: string) => 
    ipcRenderer.invoke('runner:run', projectId, command, folderPath),
  stopProject: (projectId: string) => ipcRenderer.invoke('runner:stop', projectId),
  isProjectRunning: (projectId: string) => ipcRenderer.invoke('runner:is-running', projectId),
  getProjectLogs: (projectId: string) => ipcRenderer.invoke('runner:get-logs', projectId),

  onProjectLog: (projectId: string, callback: (text: string) => void) => {
    const channel = `project-log:${projectId}`;
    const listener = (_event: any, text: string) => callback(text);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onProjectExit: (projectId: string, callback: (code: number) => void) => {
    const channel = `project-exit:${projectId}`;
    const listener = (_event: any, code: number) => callback(code);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (data: any) => ipcRenderer.invoke('settings:update', data),

  getLogs: () => ipcRenderer.invoke('logs:get'),
  logActivity: (action: string, details: string) => ipcRenderer.invoke('logs:activity', action, details),
  logError: (error: string, stack?: string) => ipcRenderer.invoke('logs:error', error, stack)
});

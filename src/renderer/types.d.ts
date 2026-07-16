export interface AppApi {
  selectDirectory: () => Promise<string | null>;
  scanDirectory: (path: string) => Promise<any[]>;
  
  getProjects: () => Promise<any[]>;
  getProject: (id: string) => Promise<any>;
  updateProject: (id: string, data: any) => Promise<any>;
  deleteProject: (id: string) => Promise<any>;
  
  getGithubAccounts: () => Promise<any[]>;
  saveGithubAccount: (account: any) => Promise<any>;
  deleteGithubAccount: (id: string) => Promise<any>;
  setDefaultGithubAccount: (id: string) => Promise<any>;
  
  checkGitInstalled: () => Promise<boolean>;
  initGit: (path: string) => Promise<boolean>;
  gitStatus: (path: string) => Promise<any>;
  publishProject: (projectId: string, repoUrl: string, token: string, message?: string) => Promise<any>;
  pullProject: (projectId: string, repoUrl: string, token: string) => Promise<any>;
  
  githubRequestDeviceCode: (clientId: string) => Promise<any>;
  githubPollForToken: (clientId: string, deviceCode: string, interval: number) => Promise<string>;
  githubValidateToken: (token: string) => Promise<any>;
  githubCreateRepo: (token: string, name: string, description: string, isPrivate: boolean) => Promise<any>;

  runProject: (projectId: string, command: string, folderPath: string) => Promise<boolean>;
  stopProject: (projectId: string) => Promise<boolean>;
  isProjectRunning: (projectId: string) => Promise<boolean>;
  getProjectLogs: (projectId: string) => Promise<string>;

  onProjectLog: (projectId: string, callback: (text: string) => void) => () => void;
  onProjectExit: (projectId: string, callback: (code: number) => void) => () => void;

  getSettings: () => Promise<any>;
  updateSettings: (data: any) => Promise<any>;

  getLogs: () => Promise<any>;
  logActivity: (action: string, details: string) => Promise<boolean>;
  logError: (error: string, stack?: string) => Promise<boolean>;
}

declare global {
  interface Window {
    api: AppApi;
  }
}

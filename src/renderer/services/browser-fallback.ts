/**
 * browser-fallback.ts
 * Minimal shim that patches window.api for basic functions needed by App.tsx.
 * The main upload logic (GitHub API calls) is handled directly in upload.tsx.
 */

if (typeof window !== 'undefined' && !(window as any).api) {
  (window as any).isBrowserEmulation = true;

  function getStore<T>(key: string, def: T): T {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; }
    catch { return def; }
  }
  function setStore(key: string, val: unknown) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  (window as any).api = {
    // GitHub account management
    getGithubAccounts: async () => {
      const accounts: any[] = getStore('publisher_accounts', []);
      return accounts.map(({ token, ...rest }) => rest); // never expose token to display
    },
    saveGithubAccount: async (acc: any) => {
      const accounts: any[] = getStore('publisher_accounts', []);
      const idx = accounts.findIndex((a: any) => a.username === acc.username);
      const record = {
        id: crypto.randomUUID(),
        username: acc.username,
        displayName: acc.displayName || acc.username,
        avatar: acc.avatar || '',
        token: acc.token,
        defaultAccount: accounts.length === 0,
        lastLogin: new Date().toISOString(),
      };
      if (idx >= 0) accounts[idx] = { ...accounts[idx], ...record };
      else accounts.push(record);
      setStore('publisher_accounts', accounts);
      const { token, ...safe } = record;
      return safe;
    },
    deleteGithubAccount: async (id: string) => {
      const accounts: any[] = getStore('publisher_accounts', []);
      setStore('publisher_accounts', accounts.filter((a: any) => a.id !== id));
      return true;
    },

    // Real GitHub token validation
    githubValidateToken: async (token: string) => {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as any;
        throw new Error(body.message || `GitHub API error ${res.status}`);
      }
      const user = await res.json() as any;
      return {
        username: user.login,
        displayName: user.name || user.login,
        avatar: user.avatar_url || '',
        email: user.email || '',
      };
    },

    // Stubs for unused paths in browser mode
    getProjects: async () => [],
    getProject: async () => null,
    updateProject: async () => null,
    deleteProject: async () => true,
    getSettings: async () => ({ theme: 'dark', defaultVisibility: 'private', autoCommit: false, autoPush: false, autoPull: false, uploadConcurrency: 3, checkUpdates: true }),
    updateSettings: async (data: any) => data,
    getLogs: async () => ({ activityLogs: [], errorLogs: [], uploadHistory: [], runHistory: [] }),
    logActivity: async () => true,
    logError: async () => true,
    checkGitInstalled: async () => true,
    selectDirectory: async () => null,
    scanDirectory: async () => [],
    githubCreateRepo: async () => ({}),
    publishProject: async () => ({}),
    pullProject: async () => ({}),
    runProject: async () => false,
    stopProject: async () => false,
    isProjectRunning: async () => false,
    getProjectLogs: async () => '',
    onProjectLog: () => () => {},
    onProjectExit: () => () => {},
    initGit: async () => true,
    gitStatus: async () => null,
    githubRequestDeviceCode: async () => ({}),
    githubPollForToken: async () => '',
    setDefaultGithubAccount: async () => true,
  } as any;

  console.log('[Browser Mode] ✓ window.api ready');
}

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

export interface Project {
  id: string;
  name: string;
  folderPath: string;
  language: string;
  framework: string;
  version?: string;
  size: number;
  gitInitialized: boolean;
  repositoryId?: string;
  lastOpened?: string;
  createdAt: string;
  updatedAt: string;
  // Detected/saved run commands
  estimatedRunCommand?: string;
  estimatedInstallCommand?: string;
  estimatedBuildCommand?: string;
  packageManager?: string;
}

export interface GithubAccount {
  id: string;
  username: string;
  displayName?: string;
  avatar?: string;
  defaultAccount: boolean;
  lastLogin: string;
}

export interface ApplicationSettings {
  theme: string;
  defaultGithubAccount?: string;
  defaultVisibility: string;
  autoCommit: boolean;
  autoPush: boolean;
  autoPull: boolean;
  uploadConcurrency: number;
  checkUpdates: boolean;
}

export interface HistoryLogs {
  activityLogs: any[];
  errorLogs: any[];
  uploadHistory: any[];
  runHistory: any[];
}

interface AppContextType {
  projects: Project[];
  githubAccounts: GithubAccount[];
  settings: ApplicationSettings | null;
  isGitInstalled: boolean;
  history: HistoryLogs;
  isLoading: boolean;
  isSidebarLoading: boolean;
  activeProject: Project | null;
  setActiveProjectId: (id: string | null) => void;
  refreshData: () => Promise<void>;
  checkGit: () => Promise<void>;
  updateSettings: (newSettings: Partial<ApplicationSettings>) => Promise<void>;
  scanFolder: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [githubAccounts, setGithubAccounts] = useState<GithubAccount[]>([]);
  const [settings, setSettings] = useState<ApplicationSettings | null>(null);
  const [isGitInstalled, setIsGitInstalled] = useState<boolean>(true);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSidebarLoading, setIsSidebarLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<HistoryLogs>({
    activityLogs: [],
    errorLogs: [],
    uploadHistory: [],
    runHistory: [],
  });

  const checkGit = useCallback(async () => {
    try {
      const installed = await window.api.checkGitInstalled();
      setIsGitInstalled(installed);
    } catch {
      setIsGitInstalled(false);
    }
  }, []);

  const refreshData = useCallback(async (showSidebarLoader = false) => {
    if (showSidebarLoader) setIsSidebarLoading(true);
    try {
      const [projs, accounts, sets, logs] = await Promise.all([
        window.api.getProjects(),
        window.api.getGithubAccounts(),
        window.api.getSettings(),
        window.api.getLogs(),
      ]);

      setProjects(projs || []);
      setGithubAccounts(accounts || []);
      setSettings(sets);
      setHistory(logs || { activityLogs: [], errorLogs: [], uploadHistory: [], runHistory: [] });
    } catch (err) {
      console.error('Failed to load application data:', err);
    } finally {
      setIsLoading(false);
      setIsSidebarLoading(false);
    }
  }, []);

  // Wrap for external calls that don't need sidebar loader (e.g. after publish, pull, etc.)
  const refreshDataPublic = useCallback(async () => {
    await refreshData(false);
  }, [refreshData]);

  useEffect(() => {
    setIsLoading(true);
    checkGit();
    refreshData(false);
  }, [checkGit, refreshData]);

  const updateSettings = async (newSettings: Partial<ApplicationSettings>) => {
    if (!settings) return;
    try {
      const updated = await window.api.updateSettings(newSettings);
      setSettings(updated);
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  const scanFolder = async () => {
    setIsSidebarLoading(true);
    try {
      const folderPath = await window.api.selectDirectory();
      if (folderPath) {
        await window.api.scanDirectory(folderPath);
        await refreshData(false);
      }
    } catch (err) {
      console.error('Scanning failed:', err);
      alert('Scanning failed: ' + (err as Error).message);
    } finally {
      setIsSidebarLoading(false);
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  const setActiveProjectId = (id: string | null) => {
    setActiveProjectIdState(id);
    if (id) {
      window.api.getProject(id).then((updatedProject) => {
        if (updatedProject) {
          setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updatedProject } : p));
        }
      }).catch(console.error);
    }
  };

  return (
    <AppContext.Provider
      value={{
        projects,
        githubAccounts,
        settings,
        isGitInstalled,
        history,
        isLoading,
        isSidebarLoading,
        activeProject,
        setActiveProjectId,
        refreshData: refreshDataPublic,
        checkGit,
        updateSettings,
        scanFolder,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

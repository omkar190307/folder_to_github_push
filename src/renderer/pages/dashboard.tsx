import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { 
  FolderPlus, Search, Github, AlertTriangle, 
  Terminal, Database, X, Loader2, RefreshCw
} from 'lucide-react';
import { ProjectDetails } from './project-details';

export const Dashboard: React.FC = () => {
  const { 
    projects, 
    githubAccounts, 
    isGitInstalled, 
    history, 
    isLoading,
    isSidebarLoading,
    activeProject, 
    setActiveProjectId, 
    refreshData, 
    checkGit, 
    scanFolder 
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [showAccounts, setShowAccounts] = useState(false);
  const [newPat, setNewPat] = useState('');
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [authError, setAuthError] = useState('');
  const accountsDropdownRef = useRef<HTMLDivElement>(null);

  // Close accounts dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (accountsDropdownRef.current && !accountsDropdownRef.current.contains(e.target as Node)) {
        setShowAccounts(false);
      }
    };
    if (showAccounts) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showAccounts]);

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.language.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.folderPath.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const defaultAccount = githubAccounts.find(a => a.defaultAccount) || githubAccounts[0] || null;

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPat.trim()) return;
    setIsAddingAccount(true);
    setAuthError('');
    try {
      const userDetails = await window.api.githubValidateToken(newPat.trim());
      await window.api.saveGithubAccount({
        username: userDetails.username,
        displayName: userDetails.displayName,
        avatar: userDetails.avatar,
        token: newPat.trim()
      });
      setNewPat('');
      setShowAccounts(false);
      await refreshData();
    } catch (err) {
      setAuthError((err as Error).message || 'Invalid GitHub token');
    } finally {
      setIsAddingAccount(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await window.api.deleteGithubAccount(id);
      await refreshData();
    } catch (err) {
      console.error(err);
    }
  };

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      
      {/* Browser Emulation Banner */}
      {(window as any).isBrowserEmulation && (
        <div className="bg-indigo-950/70 border-b border-indigo-800/40 px-4 py-2 flex items-center gap-3 text-indigo-400 text-xs shrink-0">
          <span className="bg-indigo-500/20 text-indigo-300 font-bold px-1.5 py-0.5 rounded text-[10px] border border-indigo-500/20 shrink-0">Browser Mode</span>
          <span>Running in sandbox emulation. File scanning uses HTML5 Directory Picker. Git operations are simulated.</span>
        </div>
      )}

      {/* Git Warning Banner */}
      {!isGitInstalled && (
        <div className="bg-amber-950/70 border-b border-amber-800/40 px-4 py-2.5 flex items-center justify-between gap-4 text-amber-400 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>
              <strong>Git was not detected on this system.</strong> Local Git operations (init, commit, push, pull) will be disabled. Install Git and restart the app.
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a 
              href="https://git-scm.com/downloads" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="bg-amber-600 hover:bg-amber-500 text-slate-950 px-3 py-1 font-semibold rounded transition-colors"
            >
              Download Git
            </a>
            <button 
              onClick={checkGit}
              className="border border-amber-800 hover:bg-amber-900/30 px-3 py-1 font-medium rounded transition-colors"
            >
              Scan Again
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-16 border-b border-slate-800/60 bg-slate-900/40 px-6 flex items-center justify-between backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-violet-600/10 text-violet-400 rounded-xl border border-violet-500/20">
            <Github size={20} />
          </div>
          <span className="font-bold text-sm tracking-tight">Publisher Pro</span>
        </div>

        {/* Profile / Account Actions */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => refreshData()}
            className="p-1.5 hover:bg-slate-800/50 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
            title="Refresh data"
          >
            <RefreshCw size={14} />
          </button>

          <div ref={accountsDropdownRef} className="relative">
            {defaultAccount ? (
              <button 
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex items-center gap-2.5 p-1.5 hover:bg-slate-800/50 rounded-xl transition-all outline-none"
              >
                {defaultAccount.avatar ? (
                  <img src={defaultAccount.avatar} alt="Avatar" className="w-6 h-6 rounded-lg object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded-lg bg-violet-700 flex items-center justify-center text-xs font-semibold text-white">
                    {defaultAccount.username[0].toUpperCase()}
                  </div>
                )}
                <span className="text-xs text-slate-300 font-medium hidden sm:inline">
                  {defaultAccount.displayName || defaultAccount.username}
                </span>
              </button>
            ) : (
              <button 
                onClick={() => setShowAccounts(true)}
                className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-xl font-medium text-xs transition-colors flex items-center gap-1.5 shadow-lg shadow-violet-950/30"
              >
                <Github size={14} />
                Connect GitHub
              </button>
            )}

            {showAccounts && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 z-50 space-y-4">
                <div className="flex justify-between items-center text-xs text-slate-400 font-semibold border-b border-slate-800 pb-2">
                  <span>GitHub Accounts</span>
                  <button 
                    onClick={() => setShowAccounts(false)}
                    className="hover:text-slate-200 p-0.5 rounded"
                  >
                    <X size={14} />
                  </button>
                </div>
                
                {githubAccounts.length > 0 && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {githubAccounts.map(acc => (
                      <div key={acc.id} className="flex items-center justify-between bg-slate-950 p-2.5 border border-slate-800 rounded-xl">
                        <div className="flex items-center gap-2 text-xs">
                          {acc.avatar ? (
                            <img src={acc.avatar} alt="Avatar" className="w-5 h-5 rounded-md" />
                          ) : (
                            <div className="w-5 h-5 rounded-md bg-violet-700 flex items-center justify-center text-[10px] font-bold text-white">
                              {acc.username[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200 truncate max-w-28">{acc.username}</span>
                            {acc.defaultAccount && <span className="text-[9px] text-violet-400">Default</span>}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDisconnect(acc.id)}
                          className="text-red-400 hover:text-red-300 text-[10px] font-medium hover:bg-red-950/30 px-2 py-0.5 rounded transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleAddAccount} className="space-y-2 border-t border-slate-800 pt-3">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                    {githubAccounts.length === 0 ? 'Connect Account' : 'Add Another Account'}
                  </span>
                  <input 
                    type="password"
                    placeholder="GitHub Personal Access Token"
                    value={newPat}
                    onChange={(e) => setNewPat(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-lg text-xs outline-none text-slate-300 transition-all"
                  />
                  {authError && (
                    <span className="text-[10px] text-red-400 block">{authError}</span>
                  )}
                  <button 
                    type="submit"
                    disabled={isAddingAccount || !newPat.trim()}
                    className="w-full py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isAddingAccount ? <><Loader2 size={11} className="animate-spin" /> Verifying...</> : 'Add Account'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 w-full flex overflow-hidden">
        
        {/* Left Side - Projects Navigation */}
        <aside className="w-72 border-r border-slate-800/60 bg-slate-900/20 flex flex-col shrink-0">
          
          {/* Scan Action */}
          <div className="p-4 border-b border-slate-800/60 shrink-0">
            <button 
              onClick={scanFolder}
              disabled={isSidebarLoading}
              className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold text-slate-200 transition-colors flex items-center justify-center gap-2 group shadow-sm disabled:opacity-60"
            >
              {isSidebarLoading 
                ? <><Loader2 size={14} className="animate-spin text-violet-400" /> Scanning...</>
                : <><FolderPlus size={15} className="text-violet-400 group-hover:scale-105 transition-transform" /> Scan Parent Directory</>
              }
            </button>
          </div>

          {/* Search Box */}
          <div className="px-4 py-3 border-b border-slate-800/60 shrink-0">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500">
                <Search size={14} />
              </span>
              <input 
                type="text" 
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800 focus:border-violet-500 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-300 outline-none transition-all placeholder-slate-600"
              />
            </div>
          </div>

          {/* Projects List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {isLoading ? (
              <div className="text-center text-xs text-slate-500 py-10 flex flex-col items-center gap-2">
                <Loader2 size={18} className="animate-spin text-violet-500" />
                Loading projects...
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center text-xs text-slate-600 py-10 px-2">
                {projects.length === 0 
                  ? 'No projects yet. Click "Scan Parent Directory" to get started.'
                  : 'No projects match your search.'
                }
              </div>
            ) : (
              filteredProjects.map(proj => {
                const isActive = activeProject?.id === proj.id;
                return (
                  <button 
                    key={proj.id}
                    onClick={() => setActiveProjectId(proj.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all border outline-none flex flex-col gap-1.5 ${
                      isActive 
                        ? 'bg-violet-600/10 border-violet-500/40 shadow-inner' 
                        : 'bg-slate-900/30 hover:bg-slate-900/70 border-slate-800/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 w-full">
                      <span className="font-semibold text-xs text-slate-200 truncate max-w-[170px]">{proj.name}</span>
                      <span className="text-[10px] text-slate-500 shrink-0">{formatSize(proj.size)}</span>
                    </div>

                    <div className="flex justify-between items-center text-[10px] w-full text-slate-400">
                      <span className="truncate max-w-[130px] font-mono">
                        {proj.framework && proj.framework !== 'Unknown' ? proj.framework : proj.language}
                      </span>
                      {proj.repositoryId ? (
                        <span className="text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded border border-green-500/25 shrink-0">Synced</span>
                      ) : (
                        <span className="text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50 shrink-0">Local</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Project count footer */}
          {projects.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-800/60 text-[10px] text-slate-600 shrink-0">
              {filteredProjects.length} of {projects.length} projects
            </div>
          )}
        </aside>

        {/* Right Side - Project Details / Welcome */}
        <main className="flex-1 bg-slate-950 flex flex-col overflow-hidden">
          {activeProject ? (
            <ProjectDetails />
          ) : (
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              
              {/* App Overview Card */}
              <div className="relative p-8 rounded-3xl overflow-hidden glass-panel border border-slate-800 flex items-center justify-between">
                <div className="space-y-3 max-w-lg z-10">
                  <span className="text-[10px] font-bold tracking-wider text-violet-400 uppercase bg-violet-600/10 px-2.5 py-1 rounded-full border border-violet-500/20">System Workspace</span>
                  <h2 className="text-2xl font-bold tracking-tight text-white leading-tight">
                    Manage Multiple Projects from One Workspace
                  </h2>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Choose a parent directory to scan for codebases. Publisher Pro will scan configurations, detect package dependencies, and let you create/sync/run them instantly.
                  </p>
                  <button 
                    onClick={scanFolder}
                    disabled={isSidebarLoading}
                    className="mt-2 inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <FolderPlus size={14} />
                    {isSidebarLoading ? 'Scanning...' : 'Scan a Directory'}
                  </button>
                </div>
                <div className="w-32 h-32 text-slate-800 absolute right-8 bottom-4 opacity-10 hidden md:block select-none pointer-events-none">
                  <Database size={128} />
                </div>
              </div>

              {/* System Stats grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Detected Projects</span>
                  <div className="text-3xl font-bold text-slate-100 mt-2">{projects.length}</div>
                </div>
                <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">GitHub Accounts</span>
                  <div className="text-3xl font-bold text-slate-100 mt-2">{githubAccounts.length}</div>
                </div>
                <div className="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Successful Publishes</span>
                  <div className="text-3xl font-bold text-slate-100 mt-2">
                    {(history.uploadHistory || []).filter(h => h.status === 'SUCCESS').length}
                  </div>
                </div>
              </div>

              {/* Recent Activity Logs */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-slate-300">Recent Activity</h3>
                <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="bg-slate-900/70 border-b border-slate-800 text-slate-400 font-medium">
                        <th className="px-5 py-3.5">Action</th>
                        <th className="px-5 py-3.5">Details</th>
                        <th className="px-5 py-3.5 text-right">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {(history.activityLogs || []).slice(0, 6).map((log, i) => (
                        <tr key={log.id || i} className="hover:bg-slate-900/20 text-slate-300">
                          <td className="px-5 py-3 font-semibold text-slate-200">{log.action}</td>
                          <td className="px-5 py-3 font-mono text-slate-400 truncate max-w-sm">{log.details}</td>
                          <td className="px-5 py-3 text-right text-slate-500">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                      {(history.activityLogs || []).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-5 py-8 text-center text-slate-600">No activity logged yet. Scan a directory to get started.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

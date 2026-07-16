import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp, Project } from '../contexts/AppContext';
import {
  ArrowLeft, Github, Terminal, Play, Square,
  CheckCircle2, Lock, Unlock, Loader2, Copy, Trash2,
  ExternalLink, AlertTriangle, Rocket, FlaskConical, Check
} from 'lucide-react';

export const ProjectDetails: React.FC = () => {
  const {
    activeProject,
    setActiveProjectId,
    githubAccounts,
    isGitInstalled,
    refreshData,
    history
  } = useApp();

  const project = activeProject as Project;

  // ── Commands ──────────────────────────────────────────────────────────────
  const [runCommand, setRunCommand]         = useState('');
  const [installCommand, setInstallCommand] = useState('');
  const [buildCommand, setBuildCommand]     = useState('');

  // ── Publish form ──────────────────────────────────────────────────────────
  const [repoName, setRepoName]         = useState('');
  const [repoDesc, setRepoDesc]         = useState('');
  const [isPrivate, setIsPrivate]       = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // ── Publish result ────────────────────────────────────────────────────────
  const [publishedUrl, setPublishedUrl]   = useState<string | null>(null);
  const [publishedHtmlUrl, setPublishedHtmlUrl] = useState<string | null>(null);
  const [urlCopied, setUrlCopied]         = useState(false);

  // ── Process runner ────────────────────────────────────────────────────────
  const [consoleLogs, setConsoleLogs]     = useState('');
  const [isProcessRunning, setIsProcessRunning] = useState(false);
  const [hasTestedRun, setHasTestedRun]   = useState(false);  // user ran the project at least once

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isPublishing, setIsPublishing]   = useState(false);
  const [isPulling, setIsPulling]         = useState(false);
  const [isPushing, setIsPushing]         = useState(false);
  const [isSavingCommands, setIsSavingCommands] = useState(false);
  const [actionError, setActionError]     = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [activeTab, setActiveTab]         = useState<'run' | 'publish'>('run');

  const logEndRef  = useRef<HTMLDivElement>(null);
  const prevIdRef  = useRef<string>('');

  // ── Reset state on project change ─────────────────────────────────────────
  useEffect(() => {
    if (!project || prevIdRef.current === project.id) return;
    prevIdRef.current = project.id;

    setRunCommand(project.estimatedRunCommand || '');
    setInstallCommand(project.estimatedInstallCommand || '');
    setBuildCommand(project.estimatedBuildCommand || '');
    setRepoName(project.name.replace(/[^a-zA-Z0-9\-_.]/g, '-').toLowerCase());
    setRepoDesc('');
    setActionError('');
    setActionSuccess('');
    setConsoleLogs('');
    setHasTestedRun(false);
    setPublishedUrl(null);
    setPublishedHtmlUrl(null);

    // Check if already published
    if (project.repositoryId) {
      // Try to find the URL from history (populated on refreshData)
    }

    // Check if already running
    window.api.isProjectRunning(project.id).then(running => {
      setIsProcessRunning(running);
      if (running) {
        setHasTestedRun(true);
        window.api.getProjectLogs(project.id).then(setConsoleLogs).catch(console.error);
      }
    }).catch(console.error);
  }, [project?.id]);

  // Restore published URL from history when project has repositoryId
  useEffect(() => {
    if (!project?.repositoryId) return;
    const upload = history.uploadHistory.find(
      (h: any) => h.projectId === project.id && h.status === 'SUCCESS'
    );
    if (upload?.repositoryUrl) {
      // Convert clone URL to browser URL
      const htmlUrl = upload.repositoryUrl
        .replace(/\.git$/, '')
        .replace('git@github.com:', 'https://github.com/');
      setPublishedUrl(upload.repositoryUrl);
      setPublishedHtmlUrl(htmlUrl);
    }
  }, [project?.repositoryId, history.uploadHistory]);

  // ── Live log subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!project?.id) return;
    const unsubLog  = window.api.onProjectLog(project.id, text => {
      setConsoleLogs(prev => prev + text);
    });
    const unsubExit = window.api.onProjectExit(project.id, code => {
      setIsProcessRunning(false);
      setConsoleLogs(prev => prev + `\n[Publisher Pro] Process exited with code ${code}\n`);
      refreshData();
    });
    return () => { unsubLog(); unsubExit(); };
  }, [project?.id, refreshData]);

  // ── Auto-scroll terminal ──────────────────────────────────────────────────
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [consoleLogs]);

  // ── Accounts ──────────────────────────────────────────────────────────────
  const defaultAccount = useMemo(() =>
    githubAccounts.find(a => a.defaultAccount) || githubAccounts[0] || null,
    [githubAccounts]
  );

  const activeAccount = useMemo(() =>
    selectedAccountId
      ? githubAccounts.find(a => a.id === selectedAccountId) || defaultAccount
      : defaultAccount,
    [selectedAccountId, githubAccounts, defaultAccount]
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getToken = async (): Promise<string> => {
    const accounts: any[] = await window.api.getGithubAccounts() as any;
    // getGithubAccounts() returns sans-token for display; fetch raw from storage
    const raw: any[] = JSON.parse(localStorage.getItem('publisher_accounts') || '[]');
    const acc = raw.find((a: any) => a.id === (activeAccount?.id || accounts[0]?.id));
    if (!acc?.token) throw new Error('No GitHub token found. Please reconnect your account.');
    return acc.token;
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2500);
    } catch { alert('Copy failed. URL: ' + url); }
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSaveCommands = async () => {
    setIsSavingCommands(true);
    try {
      await window.api.updateProject(project.id, {
        estimatedRunCommand: runCommand,
        estimatedInstallCommand: installCommand,
        estimatedBuildCommand: buildCommand,
      });
      setActionSuccess('Commands saved.');
      setTimeout(() => setActionSuccess(''), 3000);
    } catch (err) {
      setActionError('Save failed: ' + (err as Error).message);
    } finally {
      setIsSavingCommands(false);
    }
  };

  const handleStartProcess = async () => {
    if (!runCommand.trim()) return;
    setConsoleLogs(`$ ${runCommand}\n`);
    setIsProcessRunning(true);
    setHasTestedRun(true);
    try {
      await window.api.runProject(project.id, runCommand, project.folderPath);
    } catch (err) {
      setIsProcessRunning(false);
      setConsoleLogs(prev => prev + `[Error] ${(err as Error).message}\n`);
    }
  };

  const handleStopProcess = async () => {
    setConsoleLogs(prev => prev + `\n[Publisher Pro] Stopping...\n`);
    try {
      await window.api.stopProject(project.id);
      setIsProcessRunning(false);
    } catch (err) {
      setConsoleLogs(prev => prev + `[Error] ${(err as Error).message}\n`);
    }
  };

  const handleDeleteProject = async () => {
    if (!confirm(`Remove "${project.name}" from the list? Your local files will NOT be deleted.`)) return;
    try {
      if (isProcessRunning) await window.api.stopProject(project.id);
      await window.api.deleteProject(project.id);
      setActiveProjectId(null);
      await refreshData();
    } catch (err) {
      setActionError('Failed to remove: ' + (err as Error).message);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) { setActionError('Connect a GitHub account first.'); return; }
    if (!repoName.trim()) { setActionError('Repository name is required.'); return; }

    setIsPublishing(true);
    setActionError('');
    setActionSuccess('');
    setPublishedUrl(null);
    setPublishedHtmlUrl(null);

    try {
      const token = await getToken();

      // 1. Create repo on GitHub
      const repo = await window.api.githubCreateRepo(
        token, repoName.trim(), repoDesc.trim(), isPrivate
      ) as any;

      // 2. Push all files
      const result = await window.api.publishProject(
        project.id, repo.url, token, `Initial commit from Publisher Pro`
      ) as any;

      const htmlUrl = repo.htmlUrl || repo.url.replace(/\.git$/, '').replace('git@github.com:', 'https://github.com/');
      setPublishedUrl(repo.url);
      setPublishedHtmlUrl(htmlUrl);

      const filesInfo = result?.filesUploaded ? ` (${result.filesUploaded} files uploaded)` : '';
      setActionSuccess(`✓ Repository created and files uploaded!${filesInfo}`);
      await refreshData();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setIsPublishing(false);
    }
  };

  const handlePush = async () => {
    setIsPushing(true);
    setActionError('');
    try {
      const logs = await window.api.getLogs();
      const upload = (logs.uploadHistory || []).find(
        (h: any) => h.projectId === project.id && h.status === 'SUCCESS'
      );
      if (!upload?.repositoryUrl) throw new Error('No repository URL found. Publish the project first.');

      const token = await getToken();
      await window.api.publishProject(project.id, upload.repositoryUrl, token, 'Sync commit from Publisher Pro');
      setActionSuccess('✓ Changes pushed.');
      await refreshData();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async () => {
    setIsPulling(true);
    setActionError('');
    try {
      const logs = await window.api.getLogs();
      const upload = (logs.uploadHistory || []).find(
        (h: any) => h.projectId === project.id && h.status === 'SUCCESS'
      );
      if (!upload?.repositoryUrl) throw new Error('No repository URL found.');

      const token = await getToken();
      await window.api.pullProject(project.id, upload.repositoryUrl, token);
      setActionSuccess('✓ Changes pulled.');
      await refreshData();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setIsPulling(false);
    }
  };

  const filteredUploadHistory = useMemo(() =>
    (history.uploadHistory || []).filter((h: any) => h.projectId === project.id),
    [history.uploadHistory, project.id]
  );

  const filteredRunHistory = useMemo(() =>
    (history.runHistory || []).filter((h: any) => h.projectId === project.id),
    [history.runHistory, project.id]
  );

  if (!project) return null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 w-full flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="h-14 border-b border-slate-800/60 bg-slate-900/10 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setActiveProjectId(null)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold text-slate-100 truncate">{project.name}</h2>
              <span className="text-[10px] bg-slate-800 border border-slate-700/50 text-slate-400 px-1.5 py-0.5 rounded shrink-0">{project.language}</span>
              {project.framework && project.framework !== 'Unknown' && project.framework !== project.language && (
                <span className="text-[10px] bg-violet-900/30 border border-violet-700/30 text-violet-400 px-1.5 py-0.5 rounded shrink-0">{project.framework}</span>
              )}
              {hasTestedRun && (
                <span className="text-[10px] bg-green-900/30 border border-green-700/30 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                  <Check size={9} /> Tested
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-600 font-mono truncate max-w-xs">{project.folderPath}</span>
          </div>
        </div>

        {/* Sync Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleDeleteProject} className="p-1.5 hover:bg-red-950/30 rounded-lg text-slate-600 hover:text-red-400 transition-colors" title="Remove from list">
            <Trash2 size={14} />
          </button>
          {project.repositoryId ? (
            <>
              <button onClick={handlePull} disabled={isPulling || isPushing}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-800 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                {isPulling ? <><Loader2 size={10} className="animate-spin" /> Pulling...</> : 'Pull'}
              </button>
              <button onClick={handlePush} disabled={isPushing || isPulling}
                className="bg-violet-600 hover:bg-violet-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5">
                {isPushing ? <><Loader2 size={10} className="animate-spin" /> Pushing...</> : 'Push Changes'}
              </button>
            </>
          ) : (
            <span className="text-[10px] font-bold text-slate-500 bg-slate-900 px-2.5 py-1 rounded-full border border-slate-800">Not Synced</span>
          )}
        </div>
      </div>

      {/* ── Published Success Banner ────────────────────────────────────────── */}
      {(publishedUrl || (project.repositoryId && publishedHtmlUrl)) && (
        <div className="mx-5 mt-4 p-4 bg-green-950/40 border border-green-800/40 rounded-2xl shrink-0">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 size={16} className="text-green-400 shrink-0" />
            <span className="text-sm font-semibold text-green-300">
              🎉 Project published successfully!
            </span>
          </div>
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
            <code className="text-violet-400 text-xs font-mono flex-1 truncate">
              {publishedHtmlUrl || publishedUrl}
            </code>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => copyUrl(publishedHtmlUrl || publishedUrl || '')}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                  urlCopied
                    ? 'bg-green-700 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {urlCopied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy Link</>}
              </button>
              <a
                href={publishedHtmlUrl || publishedUrl || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-[11px] font-semibold transition-colors"
              >
                <ExternalLink size={11} /> Open on GitHub
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Status Messages ─────────────────────────────────────────────────── */}
      <div className="mx-5 mt-3 space-y-2 shrink-0">
        {actionError && (
          <div className="p-3 bg-red-950/40 border border-red-800/40 text-red-400 rounded-xl text-xs flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span className="flex-1">{actionError}</span>
            <button onClick={() => setActionError('')} className="hover:text-red-200 shrink-0">×</button>
          </div>
        )}
        {actionSuccess && (
          <div className="p-3 bg-green-950/40 border border-green-800/40 text-green-400 rounded-xl text-xs flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}
      </div>

      {/* ── Tab Switcher ────────────────────────────────────────────────────── */}
      <div className="mx-5 mt-4 flex gap-1 p-1 bg-slate-900/60 border border-slate-800 rounded-xl shrink-0 w-fit">
        <button
          onClick={() => setActiveTab('run')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'run'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal size={13} />
          Test Run
          {hasTestedRun && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
        </button>
        <button
          onClick={() => setActiveTab('publish')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            activeTab === 'publish'
              ? 'bg-violet-600 text-white shadow'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Rocket size={13} />
          Publish to GitHub
          {project.repositoryId && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
        </button>
      </div>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden mt-4">

        {/* Left: Tab panels */}
        <div className="flex-1 flex flex-col overflow-hidden px-5 pb-5">

          {/* ── TEST RUN TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'run' && (
            <div className="flex-1 flex flex-col space-y-4 overflow-hidden">

              {/* Run hint */}
              {!hasTestedRun && (
                <div className="flex items-start gap-3 p-3.5 bg-blue-950/30 border border-blue-800/30 rounded-xl text-xs text-blue-300 shrink-0">
                  <FlaskConical size={16} className="shrink-0 mt-0.5 text-blue-400" />
                  <div>
                    <p className="font-semibold mb-0.5">Step 1: Test your project locally</p>
                    <p className="text-blue-400/80">Run your project here to verify it works correctly before uploading to GitHub. Once tested, switch to the <strong>Publish to GitHub</strong> tab.</p>
                  </div>
                </div>
              )}

              {/* Commands config */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/20 border border-slate-900 p-4 rounded-2xl shrink-0">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Run Command</label>
                  <input type="text" value={runCommand} onChange={e => setRunCommand(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg text-xs font-mono text-slate-300 outline-none"
                    placeholder="e.g. npm run dev"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Install Command</label>
                  <input type="text" value={installCommand} onChange={e => setInstallCommand(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg text-xs font-mono text-slate-300 outline-none"
                    placeholder="e.g. npm install"
                  />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Build Command</label>
                    <input type="text" value={buildCommand} onChange={e => setBuildCommand(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-800 focus:border-blue-500 rounded-lg text-xs font-mono text-slate-300 outline-none"
                      placeholder="e.g. npm run build"
                    />
                  </div>
                  <button onClick={handleSaveCommands} disabled={isSavingCommands}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-50 shrink-0">
                    {isSavingCommands ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>

              {/* Terminal */}
              <div className="flex-1 flex flex-col bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden min-h-[200px]">
                {/* Terminal header */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-900 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
                    </div>
                    <span className="text-[10px] text-slate-600 font-mono">terminal</span>
                    {isProcessRunning && (
                      <span className="flex items-center gap-1 text-[10px] text-green-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        Running
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setConsoleLogs('')} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">Clear</button>
                    {isProcessRunning ? (
                      <button onClick={handleStopProcess}
                        className="flex items-center gap-1 bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors">
                        <Square size={9} /> Stop
                      </button>
                    ) : (
                      <button onClick={handleStartProcess} disabled={!runCommand.trim()}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 px-3 py-1 rounded-lg text-[10px] font-semibold transition-colors">
                        <Play size={9} /> Run Project
                      </button>
                    )}
                  </div>
                </div>

                {/* Log output */}
                <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] text-slate-300">
                  <pre className="whitespace-pre-wrap select-text">
                    {consoleLogs || '// Click "Run Project" to start execution\n// Output will appear here in real time'}
                  </pre>
                  <div ref={logEndRef} />
                </div>
              </div>

              {/* Nudge to publish after test */}
              {hasTestedRun && !project.repositoryId && (
                <div
                  onClick={() => setActiveTab('publish')}
                  className="p-3 bg-violet-950/40 border border-violet-800/30 rounded-xl text-xs text-violet-300 flex items-center gap-3 cursor-pointer hover:bg-violet-950/60 transition-colors shrink-0"
                >
                  <Rocket size={15} className="text-violet-400 shrink-0" />
                  <span>
                    <strong>Project tested!</strong> Click here to upload it to GitHub →
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── PUBLISH TAB ─────────────────────────────────────────────────── */}
          {activeTab === 'publish' && (
            <div className="overflow-y-auto space-y-5 pr-1">

              {/* Already published */}
              {project.repositoryId ? (
                <div className="p-5 bg-slate-900/30 border border-slate-800 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2">
                    <Github size={16} className="text-green-400" />
                    <h3 className="text-xs font-bold text-slate-200">Repository Synced</h3>
                    <span className="text-[10px] bg-green-500/10 border border-green-500/25 text-green-400 px-1.5 py-0.5 rounded">Live</span>
                  </div>
                  {publishedHtmlUrl && (
                    <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
                      <code className="text-violet-400 text-xs font-mono flex-1 truncate">{publishedHtmlUrl}</code>
                      <button onClick={() => copyUrl(publishedHtmlUrl)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${urlCopied ? 'bg-green-700 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}>
                        {urlCopied ? <><Check size={11} /> Copied!</> : <><Copy size={11} /> Copy Link</>}
                      </button>
                      <a href={publishedHtmlUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-[11px] font-semibold transition-colors">
                        <ExternalLink size={11} /> Open
                      </a>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">Use <strong className="text-slate-400">Push Changes</strong> in the top-right to sync new commits.</p>
                </div>
              ) : (
                <>
                  {/* Run-first nudge */}
                  {!hasTestedRun && (
                    <div
                      onClick={() => setActiveTab('run')}
                      className="p-3.5 bg-amber-950/30 border border-amber-800/30 rounded-xl text-xs text-amber-300 flex items-center gap-3 cursor-pointer hover:bg-amber-950/50 transition-colors"
                    >
                      <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                      <span>
                        <strong>Recommended:</strong> Test your project in the <strong>Test Run</strong> tab first to make sure it works before uploading.
                        <span className="ml-1 underline cursor-pointer">Go to Test Run →</span>
                      </span>
                    </div>
                  )}

                  {!activeAccount ? (
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-xs text-slate-400 text-center">
                      Connect a GitHub account using the button in the top-right header to publish.
                    </div>
                  ) : (
                    <div className="p-5 bg-slate-900/30 border border-slate-800 rounded-2xl space-y-4">
                      <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
                        <Github size={16} className="text-violet-400" />
                        <h3 className="text-xs font-bold text-slate-200">Publish to GitHub</h3>
                        <span className="text-[10px] text-slate-500 ml-auto">as {activeAccount.username}</span>
                      </div>

                      <form onSubmit={handlePublish} className="space-y-4">
                        {githubAccounts.length > 1 && (
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 mb-1">GitHub Account</label>
                            <select
                              value={selectedAccountId || defaultAccount?.id || ''}
                              onChange={e => setSelectedAccountId(e.target.value)}
                              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-lg text-xs text-slate-300 outline-none"
                            >
                              {githubAccounts.map(acc => (
                                <option key={acc.id} value={acc.id}>
                                  {acc.username}{acc.defaultAccount ? ' (default)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 mb-1">Repository Name</label>
                            <input type="text" value={repoName} onChange={e => setRepoName(e.target.value)} required
                              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-lg text-xs text-slate-300 outline-none font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 mb-1">Visibility</label>
                            <div className="grid grid-cols-2 p-0.5 bg-slate-950 border border-slate-800 rounded-lg">
                              <button type="button" onClick={() => setIsPrivate(true)}
                                className={`py-1.5 text-[10px] font-medium rounded-md flex items-center justify-center gap-1 transition-all ${isPrivate ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                                <Lock size={10} /> Private
                              </button>
                              <button type="button" onClick={() => setIsPrivate(false)}
                                className={`py-1.5 text-[10px] font-medium rounded-md flex items-center justify-center gap-1 transition-all ${!isPrivate ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                                <Unlock size={10} /> Public
                              </button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 mb-1">Description <span className="text-slate-600">(optional)</span></label>
                          <input type="text" value={repoDesc} onChange={e => setRepoDesc(e.target.value)}
                            placeholder="A brief description of your project..."
                            className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-lg text-xs text-slate-300 outline-none"
                          />
                        </div>

                        <button type="submit" disabled={isPublishing || !repoName.trim()}
                          className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-violet-950/40 transition-colors flex items-center justify-center gap-2">
                          {isPublishing
                            ? <><Loader2 size={13} className="animate-spin" /> Creating repo & uploading files...</>
                            : <><Rocket size={13} /> Publish Project to GitHub</>
                          }
                        </button>

                        {isPublishing && (
                          <p className="text-[10px] text-slate-500 text-center">
                            Uploading files via GitHub API... this may take a moment for large projects.
                          </p>
                        )}
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Right: History panel ──────────────────────────────────────────── */}
        <div className="w-64 overflow-y-auto pb-5 pr-5 pl-3 space-y-4 shrink-0">

          {/* Project Info */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Project Info</h4>
            <div className="bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-xs space-y-2">
              {[
                ['Language', project.language],
                ['Framework', project.framework || '—'],
                ['Version', project.version || '—'],
                ['Package Mgr', project.packageManager || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <span className="text-slate-500">{label}</span>
                  <span className="text-slate-300 font-medium truncate max-w-28 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Upload History */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Upload History</h4>
            {filteredUploadHistory.length === 0 ? (
              <div className="text-xs text-slate-600 text-center py-5 bg-slate-900/20 border border-slate-900 rounded-xl">No uploads yet.</div>
            ) : filteredUploadHistory.map((upload: any) => (
              <div key={upload.id} className="bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-xs space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-200 text-[11px]">
                    {upload.filesUploaded ? `${upload.filesUploaded} files` : 'Publish'}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    upload.status === 'SUCCESS' ? 'text-green-400 bg-green-500/10' :
                    upload.status === 'FAILED'  ? 'text-red-400 bg-red-500/10' :
                    'text-yellow-400 bg-yellow-500/10 animate-pulse'
                  }`}>{upload.status}</span>
                </div>
                {upload.commitHash && (
                  <div className="text-[10px] font-mono text-slate-500">#{upload.commitHash.substring(0, 7)}</div>
                )}
                {upload.repositoryUrl && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-violet-400/70 truncate flex-1">
                      {upload.repositoryUrl.replace(/\.git$/, '').split('/').slice(-2).join('/')}
                    </span>
                    <button
                      onClick={() => {
                        const url = upload.repositoryUrl.replace(/\.git$/, '').replace('git@github.com:', 'https://github.com/');
                        copyUrl(url);
                      }}
                      className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
                      title="Copy link"
                    >
                      <Copy size={10} />
                    </button>
                  </div>
                )}
                {upload.errorMessage && (
                  <div className="text-[10px] text-red-400 break-words border-t border-slate-800 pt-1">{upload.errorMessage}</div>
                )}
                <div className="text-[9px] text-slate-600">{new Date(upload.startedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>

          {/* Run History */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Run History</h4>
            {filteredRunHistory.length === 0 ? (
              <div className="text-xs text-slate-600 text-center py-5 bg-slate-900/20 border border-slate-900 rounded-xl">No runs yet.</div>
            ) : filteredRunHistory.map((run: any) => (
              <div key={run.id} className="bg-slate-900/30 border border-slate-900 p-3 rounded-xl text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-mono text-[10px] text-slate-300 truncate max-w-36">{run.command}</span>
                  <span className={`text-[9px] px-1 rounded ${run.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
                    :{run.exitCode}
                  </span>
                </div>
                <div className="text-[9px] text-slate-600 mt-1">{new Date(run.createdAt).toLocaleString()}</div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
};

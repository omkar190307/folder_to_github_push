import React, { useState, useEffect, useRef } from 'react';
import {
  Github, FolderOpen, Upload, Copy, ExternalLink, Check,
  Loader2, X, LogOut, Clock, CheckCircle2, AlertCircle,
  FileCode, Rocket, RefreshCw
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────── */
interface FolderInfo {
  name: string;
  fileCount: number;
  language: string;
  framework: string;
  packageManager: string;
  estimatedRunCommand: string;
  estimatedInstallCommand: string;
}

interface UploadRecord {
  id: string;
  folderName: string;
  repoName: string;
  htmlUrl: string;
  cloneUrl: string;
  filesUploaded: number;
  uploadedAt: string;
  isPrivate: boolean;
}

type Phase = 'idle' | 'analyzing' | 'ready' | 'uploading' | 'done' | 'error';

/* ─── Helpers ─────────────────────────────────────────────────────── */
const SKIP = new Set(['node_modules','.git','dist','build','out','target','.cache','coverage','vendor','__pycache__','.venv','venv','.idea','.vscode','start.bat']);

function randSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function toRepoName(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9\-_.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function countFiles(handle: FileSystemDirectoryHandle, depth = 0): Promise<number> {
  if (depth > 6) return 0;
  let count = 0;
  for await (const [name, entry] of (handle as any).entries()) {
    if (SKIP.has(name) || SKIP.has(name.toLowerCase()) || name.toLowerCase() === 'start.bat' || name.startsWith('.')) continue;
    if (entry.kind === 'file') count++;
    else count += await countFiles(entry, depth + 1);
  }
  return count;
}

async function detectInfo(handle: FileSystemDirectoryHandle): Promise<Omit<FolderInfo, 'name' | 'fileCount'>> {
  const top: string[] = [];
  for await (const [n] of (handle as any).entries()) top.push(n);

  if (top.includes('package.json')) {
    try {
      const fh = await (handle as any).getFileHandle('package.json');
      const pkg = JSON.parse(await (await fh.getFile()).text());
      const d = { ...pkg.dependencies, ...pkg.devDependencies };
      let fw = 'Node.js', lang = 'JavaScript';
      if (d['typescript'] || d['ts-node']) lang = 'TypeScript';
      if (d['next']) fw = 'Next.js';
      else if (d['react']) fw = 'React';
      else if (d['vue']) fw = 'Vue.js';
      else if (d['svelte'] || d['@sveltejs/kit']) fw = 'Svelte';
      else if (d['electron']) fw = 'Electron';
      else if (d['express'] || d['fastify']) fw = 'Node API';
      const sc = pkg.scripts || {};
      const pm = top.includes('yarn.lock') ? 'yarn' : top.includes('pnpm-lock.yaml') ? 'pnpm' : 'npm';
      return {
        language: lang, framework: fw, packageManager: pm,
        estimatedRunCommand: sc.dev ? `${pm} run dev` : sc.start ? `${pm} run start` : '',
        estimatedInstallCommand: pm === 'yarn' ? 'yarn' : `${pm} install`,
      };
    } catch {}
  }
  if (top.includes('Cargo.toml')) return { language:'Rust', framework:'Cargo', packageManager:'cargo', estimatedRunCommand:'cargo run', estimatedInstallCommand:'cargo fetch' };
  if (top.includes('go.mod')) return { language:'Go', framework:'Go Module', packageManager:'go', estimatedRunCommand:'go run .', estimatedInstallCommand:'go mod download' };
  if (top.some(f => ['requirements.txt','pyproject.toml','setup.py'].includes(f))) return { language:'Python', framework:'Python', packageManager:'pip', estimatedRunCommand:'python main.py', estimatedInstallCommand:'pip install -r requirements.txt' };
  if (top.includes('pom.xml')) return { language:'Java', framework:'Maven', packageManager:'maven', estimatedRunCommand:'mvn spring-boot:run', estimatedInstallCommand:'mvn install' };
  if (top.some(f => f.endsWith('.csproj'))) return { language:'C#', framework:'.NET', packageManager:'dotnet', estimatedRunCommand:'dotnet run', estimatedInstallCommand:'dotnet restore' };
  if (top.includes('Gemfile')) return { language:'Ruby', framework:'Rails', packageManager:'bundler', estimatedRunCommand:'rails server', estimatedInstallCommand:'bundle install' };

  // generic — detect language from file extensions
  const extCount: Record<string, number> = {};
  for (const f of top) { const e = f.split('.').pop() || ''; extCount[e] = (extCount[e]||0) + 1; }
  const topExt = Object.entries(extCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
  const langMap: Record<string,string> = { js:'JavaScript', ts:'TypeScript', py:'Python', rs:'Rust', go:'Go', java:'Java', php:'PHP', rb:'Ruby', cs:'C#', cpp:'C++', c:'C', html:'HTML', css:'CSS' };
  return { language: langMap[topExt] || 'Unknown', framework: 'Custom Project', packageManager: '', estimatedRunCommand: '', estimatedInstallCommand: '' };
}

async function collectAndUpload(
  handle: FileSystemDirectoryHandle,
  owner: string,
  repoName: string,
  token: string,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
  abortRef?: React.MutableRefObject<boolean>
): Promise<number> {
  // Collect all files first
  const files: { path: string; file: File }[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    for await (const [name, entry] of (dir as any).entries()) {
      if (SKIP.has(name) || SKIP.has(name.toLowerCase()) || name.toLowerCase() === 'start.bat' || name.startsWith('.')) continue;
      const p = prefix ? `${prefix}/${name}` : name;
      if (entry.kind === 'file') {
        files.push({ path: p, file: await entry.getFile() });
      } else {
        await walk(entry, p);
      }
    }
  }
  await walk(handle, '');

  const total = files.length;
  if (total === 0) throw new Error('No files found in the selected folder.');
  let done = 0;
  let firstFileOk = false;

  for (const { path, file } of files) {
    if (abortRef?.current || signal?.aborted) {
      throw new Error('UPLOAD_CANCELLED');
    }
    try {
      // skip very large files (>5 MB)
      if (file.size > 5_000_000) { done++; onProgress(done, total); continue; }
      const buf = await file.arrayBuffer();
      const b64 = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ''));
      const res = await fetch(`https://api.github.com/repos/${owner}/${repoName}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          message: done === 0 ? 'Initial commit from Publisher Pro' : `Add ${path}`,
          content: b64,
        }),
        signal,
      });
      // Throw on the first file to surface repo-level issues early
      if (!res.ok && !firstFileOk) {
        const errBody = await res.json().catch(() => ({} as any));
        if (res.status === 403 || (errBody.message && errBody.message.toLowerCase().includes('resource not accessible'))) {
          throw new Error('RESOURCE_NOT_ACCESSIBLE: Your Personal Access Token does not have write access to this repository. Please generate a Classic token with "repo" scope.');
        }
        throw new Error(
          `File upload failed (${res.status}): ${errBody.message || res.statusText}. ` +
          (res.status === 404 ? 'Repository may not have initialized yet.' : '')
        );
      }
      if (res.ok) firstFileOk = true;
    } catch (e: any) {
      if (abortRef?.current || signal?.aborted || e.name === 'AbortError') {
        throw new Error('UPLOAD_CANCELLED');
      }
      // Re-throw errors from the first file so we surface them
      if (!firstFileOk) throw e;
      // For later files just skip silently
    }
    done++;
    onProgress(done, total);
    // Throttle: pause every 5 files to avoid GitHub secondary rate limit
    if (done % 5 === 0) await new Promise(r => setTimeout(r, 300));
  }
  return done;
}

/* ─── Main Component ──────────────────────────────────────────────── */
export default function UploadPage({ account, onDisconnect }: { account: any; onDisconnect: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [folderInfo, setFolderInfo] = useState<FolderInfo | null>(null);
  const [repoName, setRepoName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ htmlUrl: string; cloneUrl: string; filesUploaded: number } | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const tokenRef = useRef<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  const abortRef = useRef<boolean>(false);

  const handleCancelUpload = () => {
    abortRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setPhase('ready');
    setError('Upload canceled by user.');
  };

  useEffect(() => {
    // Load stored uploads and token
    const stored = localStorage.getItem('pub_uploads');
    if (stored) try { setUploads(JSON.parse(stored)); } catch {}
    // Get token from storage
    const accounts = JSON.parse(localStorage.getItem('publisher_accounts') || '[]');
    const acc = accounts.find((a: any) => a.username === account.username);
    if (acc?.token) tokenRef.current = acc.token;
  }, [account]);

  const saveUpload = (rec: UploadRecord) => {
    setUploads(prev => {
      const next = [rec, ...prev].slice(0, 20);
      localStorage.setItem('pub_uploads', JSON.stringify(next));
      return next;
    });
  };

  /* ── Step 1: Select Folder ── */
  const handleSelectFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      setError('Your browser does not support folder picking. Use Chrome or Edge.');
      return;
    }
    setError('');
    setPhase('analyzing');
    setFolderInfo(null);
    setResult(null);

    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      dirHandleRef.current = handle;

      const [info, fileCount] = await Promise.all([
        detectInfo(handle),
        countFiles(handle),
      ]);

      const info2: FolderInfo = { name: handle.name, fileCount, ...info };
      setFolderInfo(info2);
      setRepoName(`${toRepoName(handle.name)}-${randSuffix()}`);
      setPhase('ready');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError('Could not read folder: ' + err.message);
      }
      setPhase('idle');
    }
  };

  /* ── Step 2: Upload to GitHub ── */
  const handleUpload = async () => {
    if (!dirHandleRef.current || !repoName.trim()) {
      setError('Please select a folder first.');
      return;
    }

    // Reload token in case it was stored after component mounted
    const rawAccounts = JSON.parse(localStorage.getItem('publisher_accounts') || '[]');
    const acc = rawAccounts.find((a: any) => a.username === account.username) || rawAccounts[0];
    const token = acc?.token || tokenRef.current;
    if (!token) {
      setError('GitHub token not found. Please disconnect and reconnect your account.');
      return;
    }
    tokenRef.current = token;

    abortRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPhase('uploading');
    setError('');
    setProgress({ done: 0, total: folderInfo?.fileCount || 0 });

    try {
      // 1. Validate token and get username
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      });
      if (!userRes.ok) {
        if (userRes.status === 401) throw new Error('GitHub token is invalid or expired. Please disconnect and reconnect your account.');
        throw new Error(`GitHub authentication failed (HTTP ${userRes.status}). Try reconnecting.`);
      }
      const ghUser = await userRes.json();
      const owner = ghUser.login;

      // 2. Create repository on GitHub
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ name: repoName.trim(), private: isPrivate, auto_init: false }),
        signal: controller.signal,
      });
      if (!createRes.ok) {
        const errBody = await createRes.json().catch(() => ({} as any));
        if (createRes.status === 403 || (errBody.message && errBody.message.toLowerCase().includes('resource not accessible'))) {
          throw new Error('RESOURCE_NOT_ACCESSIBLE: Your Personal Access Token does not have permission to create repositories. Please generate a Classic token with "repo" scope.');
        }
        if (createRes.status === 404) {
          throw new Error(
            'RESOURCE_NOT_ACCESSIBLE: Repository creation returned 404/403. Your token lacks the "repo" scope or is a Fine-Grained token without repository creation access.'
          );
        }
        if (createRes.status === 422) {
          // Repo already exists — generate a new name
          setRepoName(`${toRepoName(folderInfo!.name)}-${randSuffix()}`);
          throw new Error(`Repository "${repoName}" already exists. A new name was generated — please click Upload again.`);
        }
        throw new Error(errBody.message || `Failed to create repository (HTTP ${createRes.status}).`);
      }
      const repo = await createRes.json();

      // 3. Wait 2 seconds for GitHub to fully initialize the empty repo
      await new Promise(r => setTimeout(r, 2000));
      if (abortRef.current || controller.signal.aborted) {
        throw new Error('UPLOAD_CANCELLED');
      }

      // 4. Upload all files with progress
      const filesUploaded = await collectAndUpload(
        dirHandleRef.current,
        owner,
        repo.name,
        token,
        (done, total) => setProgress({ done, total }),
        controller.signal,
        abortRef
      );

      const htmlUrl = repo.html_url;
      const cloneUrl = repo.clone_url;

      setResult({ htmlUrl, cloneUrl, filesUploaded });
      setPhase('done');

      saveUpload({
        id: crypto.randomUUID(),
        folderName: folderInfo!.name,
        repoName: repo.name,
        htmlUrl,
        cloneUrl,
        filesUploaded,
        uploadedAt: new Date().toISOString(),
        isPrivate,
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'UPLOAD_CANCELLED') {
        setPhase('ready');
        setError('Upload canceled by user.');
        return;
      }
      setError(err.message || 'Upload failed.');
      setPhase('error');
    }
  };

  const copyLink = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { alert(url); }
  };

  const reset = () => {
    setPhase('idle');
    setFolderInfo(null);
    setResult(null);
    setError('');
    dirHandleRef.current = null;
  };

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  /* ── Render ── */
  return (
    <div className="h-screen w-full flex flex-col bg-gradient-animated overflow-hidden">

      {/* Header */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-white/[0.04] bg-slate-950/50 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-violet-600/20 border border-violet-500/20 rounded-xl">
            <Github size={18} className="text-violet-400" />
          </div>
          <span className="font-bold text-sm text-white">Publisher Pro</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50"
          >
            <Clock size={13} />
            History {uploads.length > 0 && <span className="bg-slate-700 text-slate-300 px-1.5 rounded-full text-[10px]">{uploads.length}</span>}
          </button>

          <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
            {account.avatar
              ? <img src={account.avatar} alt="" className="w-6 h-6 rounded-lg object-cover" />
              : <div className="w-6 h-6 rounded-lg bg-violet-700 flex items-center justify-center text-xs font-bold">{account.username?.[0]?.toUpperCase()}</div>
            }
            <span className="text-xs text-slate-300 font-medium">{account.username}</span>
            <button onClick={onDisconnect} className="p-1 hover:bg-slate-800 rounded-lg text-slate-600 hover:text-slate-400 transition-colors" title="Disconnect">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* Main panel */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-4">

            {/* ── IDLE / ANALYZING ── */}
            {(phase === 'idle' || phase === 'analyzing') && (
              <div className="slide-up text-center space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Upload Any Project to GitHub</h2>
                  <p className="text-slate-400 text-sm">Select a folder — we'll auto-detect the project type, create a unique repository, and upload everything.</p>
                </div>

                <button
                  onClick={handleSelectFolder}
                  disabled={phase === 'analyzing'}
                  className="upload-zone w-full rounded-3xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all disabled:opacity-60 group"
                >
                  {phase === 'analyzing' ? (
                    <>
                      <Loader2 size={40} className="text-violet-400 animate-spin" />
                      <span className="text-slate-300 font-medium">Analyzing folder...</span>
                    </>
                  ) : (
                    <>
                      <div className="p-4 bg-violet-600/10 border border-violet-500/20 rounded-2xl group-hover:bg-violet-600/20 transition-colors">
                        <FolderOpen size={36} className="text-violet-400" />
                      </div>
                      <div>
                        <p className="text-slate-200 font-semibold text-base">Click to Select Folder</p>
                        <p className="text-slate-500 text-xs mt-1">Any project folder — React, Python, Node, Go, Rust...</p>
                      </div>
                    </>
                  )}
                </button>

                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-800/30 rounded-xl text-xs text-red-400 text-left">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>
            )}

            {/* ── READY (folder analyzed, show form) ── */}
            {phase === 'ready' && folderInfo && (
              <div className="slide-up space-y-4">
                {/* Folder info card */}
                <div className="glass rounded-2xl p-4 flex items-center gap-4">
                  <div className="p-2.5 bg-blue-600/10 border border-blue-500/20 rounded-xl shrink-0">
                    <FileCode size={22} className="text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-sm">{folderInfo.name}</span>
                      <span className="text-[10px] bg-violet-900/40 border border-violet-700/30 text-violet-400 px-1.5 py-0.5 rounded">{folderInfo.framework}</span>
                      <span className="text-[10px] bg-slate-800 border border-slate-700/40 text-slate-400 px-1.5 py-0.5 rounded">{folderInfo.language}</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-0.5">{folderInfo.fileCount} files detected{folderInfo.packageManager ? ` · ${folderInfo.packageManager}` : ''}</p>
                  </div>
                  <button onClick={reset} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-600 hover:text-slate-400 transition-colors shrink-0">
                    <X size={14} />
                  </button>
                </div>

                {/* Repo config */}
                <div className="glass rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Rocket size={15} className="text-violet-400" />
                    Repository Settings
                  </h3>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Repository Name (auto-generated, editable)</label>
                    <input
                      type="text"
                      value={repoName}
                      onChange={e => setRepoName(toRepoName(e.target.value))}
                      className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl text-sm text-slate-200 outline-none font-mono transition-colors"
                    />
                    <p className="text-[10px] text-slate-600 mt-1">github.com/{account.username}/{repoName}</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Visibility</label>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        onClick={() => setIsPrivate(false)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-all ${!isPrivate ? 'bg-violet-600 border-violet-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                      >
                        🌐 Public
                      </button>
                      <button
                        onClick={() => setIsPrivate(true)}
                        className={`py-2 rounded-xl text-xs font-semibold border transition-all ${isPrivate ? 'bg-violet-600 border-violet-500 text-white' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                      >
                        🔒 Private
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex flex-col gap-2 p-3 bg-red-950/40 border border-red-800/30 rounded-xl text-xs text-red-400">
                      <div className="flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span className="font-medium">{error.replace('RESOURCE_NOT_ACCESSIBLE: ', '')}</span>
                      </div>
                      {error.includes('RESOURCE_NOT_ACCESSIBLE') && (
                        <a
                          href="https://github.com/settings/tokens/new?scopes=repo,user,delete_repo&description=Publisher+Pro+Upload+Tool"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 py-2 px-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-center flex items-center justify-center gap-1.5 transition-colors shadow-md"
                        >
                          <ExternalLink size={13} /> Click here to generate Classic Token with "repo" checked
                        </a>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={!repoName.trim()}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-violet-900/40"
                  >
                    <Upload size={16} />
                    Upload {folderInfo.fileCount} Files to GitHub
                  </button>
                </div>
              </div>
            )}

            {/* ── UPLOADING ── */}
            {phase === 'uploading' && (
              <div className="slide-up text-center space-y-6">
                <div>
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-violet-600/10 border border-violet-500/20 mb-4">
                    <Loader2 size={32} className="text-violet-400 animate-spin" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">Uploading to GitHub...</h2>
                  <p className="text-slate-400 text-sm">Creating repository and uploading your files. Please wait.</p>
                </div>

                <div className="glass rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{progress.done} of {progress.total} files uploaded</span>
                    <span className="font-mono text-violet-400">{pct}%</span>
                  </div>
                  <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full progress-shimmer transition-all duration-300"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-600">
                    Uploading to <code className="text-slate-500">github.com/{account.username}/{repoName}</code>
                  </p>

                  <button
                    onClick={handleCancelUpload}
                    className="mt-4 w-full py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5"
                  >
                    <X size={14} /> Cancel Upload
                  </button>
                </div>
              </div>
            )}

            {/* ── DONE ── */}
            {phase === 'done' && result && (
              <div className="slide-up space-y-4 text-center">
                <div>
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-600/10 border border-green-500/20 mb-4">
                    <CheckCircle2 size={32} className="text-green-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">Uploaded Successfully! 🎉</h2>
                  <p className="text-slate-400 text-sm">{result.filesUploaded} files uploaded to your GitHub repository.</p>
                </div>

                {/* Link card */}
                <div className="glass success-glow rounded-2xl p-5 space-y-3 text-left">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your Repository Link</p>
                  <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-3">
                    <code className="text-violet-400 text-sm font-mono flex-1 truncate">{result.htmlUrl}</code>
                    <button
                      onClick={() => copyLink(result.htmlUrl)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${copied ? 'bg-green-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
                    >
                      {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                    </button>
                    <a
                      href={result.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-bold transition-colors shrink-0"
                    >
                      <ExternalLink size={12} /> Open
                    </a>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    {isPrivate ? '🔒 Private' : '🌐 Public'} repository · {result.filesUploaded} files · {account.username}/{repoName}
                  </div>
                </div>

                <button
                  onClick={reset}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} />
                  Upload Another Project
                </button>
              </div>
            )}

            {/* ── ERROR (upload failed) ── */}
            {phase === 'error' && (
              <div className="slide-up space-y-4 text-center">
                <div>
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-600/10 border border-red-500/20 mb-4">
                    <AlertCircle size={32} className="text-red-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">Upload Failed</h2>
                  <p className="text-red-400 text-sm mb-4">{error.replace('RESOURCE_NOT_ACCESSIBLE: ', '')}</p>
                  {error.includes('RESOURCE_NOT_ACCESSIBLE') && (
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo,user,delete_repo&description=Publisher+Pro+Upload+Tool"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl text-center flex items-center justify-center gap-2 transition-colors shadow-lg mb-3"
                    >
                      <ExternalLink size={15} /> 1-Click Generate Classic Token (Pre-checked)
                    </a>
                  )}
                </div>
                <button onClick={reset} className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2">
                  <RefreshCw size={14} /> Try Again
                </button>
              </div>
            )}

          </div>
        </div>

        {/* ── History Side Panel ── */}
        {showHistory && (
          <div className="w-80 border-l border-white/[0.04] bg-slate-950/60 flex flex-col fade-in">
            <div className="flex items-center justify-between p-4 border-b border-white/[0.04] shrink-0">
              <h3 className="text-sm font-bold text-slate-200">Upload History</h3>
              <button onClick={() => setShowHistory(false)} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-slate-300 transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {uploads.length === 0 ? (
                <div className="text-center text-slate-600 text-xs py-10">No uploads yet.</div>
              ) : uploads.map(u => (
                <div key={u.id} className="glass rounded-xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-200 truncate">{u.folderName}</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">{u.repoName}</p>
                    </div>
                    <span className="text-[9px] shrink-0 text-slate-600">{new Date(u.uploadedAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">{u.filesUploaded} files</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-[10px] text-slate-500">{u.isPrivate ? '🔒' : '🌐'}</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => copyLink(u.htmlUrl)}
                      className="p-1 hover:bg-slate-800 rounded text-slate-600 hover:text-slate-400 transition-colors"
                      title="Copy link"
                    >
                      <Copy size={11} />
                    </button>
                    <a href={u.htmlUrl} target="_blank" rel="noopener noreferrer"
                      className="p-1 hover:bg-slate-800 rounded text-slate-600 hover:text-violet-400 transition-colors">
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

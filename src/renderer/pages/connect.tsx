import React, { useState } from 'react';
import { Github, Key, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ConnectPage({ onConnected }: { onConnected: () => void }) {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      const user = await window.api.githubValidateToken(token.trim());
      await window.api.saveGithubAccount({
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        token: token.trim(),
      });
      onConnected();
    } catch (err: any) {
      setError(err.message || 'Invalid token. Make sure it has "repo" and "user" permissions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-animated p-4">
      <div className="w-full max-w-md slide-up">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="p-3 bg-violet-600/20 border border-violet-500/30 rounded-2xl">
            <Github size={28} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Publisher Pro</h1>
            <p className="text-xs text-slate-500">GitHub Upload Tool</p>
          </div>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-8 shadow-2xl">
          <h2 className="text-lg font-bold text-white mb-1">Connect GitHub Account</h2>
          <p className="text-slate-400 text-sm mb-6">
            Enter a Personal Access Token (PAT) to get started. It needs <code className="text-violet-400 bg-slate-800 px-1 rounded">repo</code> and <code className="text-violet-400 bg-slate-800 px-1 rounded">user</code> scopes.
          </p>

          <form onSubmit={handleConnect} className="space-y-4">
            <div className="relative">
              <Key size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={token}
                onChange={e => setToken(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl text-sm text-slate-200 outline-none transition-colors font-mono"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-800/30 rounded-xl text-xs text-red-400">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg shadow-violet-900/40"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" /> Verifying with GitHub...</>
                : <><CheckCircle2 size={15} /> Connect Account <ArrowRight size={14} /></>
              }
            </button>
          </form>

            <a
              href="https://github.com/settings/tokens/new?scopes=repo,user,delete_repo&description=Publisher+Pro+Upload+Tool"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700/60 rounded-xl text-xs text-violet-400 hover:text-violet-300 font-semibold text-center transition-colors"
            >
              ✨ Click Here to Generate Classic Token (Pre-checked)
            </a>
        </div>
      </div>
    </div>
  );
}

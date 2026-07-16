import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Github, Key, Terminal, FolderSync, ArrowRight, ShieldAlert, CheckCircle2 } from 'lucide-react';

interface OnboardingProps {
  onSkip: () => void;
  onSuccess: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onSkip, onSuccess }) => {
  const [authMethod, setAuthMethod] = useState<'pat' | 'oauth'>('pat');
  const [patToken, setPatToken] = useState('');
  const [clientId, setClientId] = useState('');
  const [deviceCodeData, setDeviceCodeData] = useState<{ user_code: string; verification_uri: string; expires_in: number } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleVerifyPat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patToken.trim()) return;
    setIsVerifying(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const userDetails = await window.api.githubValidateToken(patToken.trim());
      await window.api.saveGithubAccount({
        username: userDetails.username,
        displayName: userDetails.displayName,
        avatar: userDetails.avatar,
        token: patToken.trim()
      });
      setSuccessMsg(`Welcome, ${userDetails.displayName || userDetails.username}! Connecting...`);
      setTimeout(() => {
        onSuccess(); // ✅ advance past onboarding
      }, 1200);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Verification failed. Please check your token and that it has "repo" and "user" scopes.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleStartOAuth = async () => {
    if (!clientId.trim()) {
      setErrorMsg('Please enter a GitHub OAuth Client ID.');
      return;
    }
    setIsVerifying(true);
    setErrorMsg('');
    setDeviceCodeData(null);
    try {
      const codeData = await window.api.githubRequestDeviceCode(clientId.trim());
      setDeviceCodeData(codeData);
      
      const token = await window.api.githubPollForToken(clientId.trim(), codeData.device_code, codeData.interval);
      const userDetails = await window.api.githubValidateToken(token);
      
      await window.api.saveGithubAccount({
        username: userDetails.username,
        displayName: userDetails.displayName,
        avatar: userDetails.avatar,
        token: token
      });
      
      setSuccessMsg(`Welcome, ${userDetails.displayName || userDetails.username}! Connecting...`);
      setTimeout(() => {
        onSuccess(); // ✅ advance past onboarding
      }, 1200);
    } catch (err) {
      setErrorMsg((err as Error).message || 'OAuth authentication failed.');
    } finally {
      setIsVerifying(false);
      setDeviceCodeData(null);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-6 overflow-y-auto">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-12 gap-8 items-stretch">
        
        {/* Info Column */}
        <div className="md:col-span-5 flex flex-col justify-between p-8 bg-slate-900/60 border border-slate-800 rounded-3xl backdrop-blur-xl">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-violet-600/20 text-violet-400 rounded-2xl border border-violet-500/20">
                <Github size={28} />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-white">Publisher Pro</h1>
            </div>
            
            <h2 className="text-2xl font-bold text-slate-100 mb-4 leading-snug">
              Publish projects to GitHub in seconds.
            </h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Detect frameworks, initialize Git, commit files, and host repositories with standard developer practices.
            </p>

            <div className="space-y-4">
              <div className="flex gap-3 items-start">
                <div className="p-1 bg-blue-500/10 text-blue-400 rounded-lg mt-0.5">
                  <FolderSync size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Recursive Scanning</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Automatically identifies standard codebases.</p>
                </div>
              </div>
              
              <div className="flex gap-3 items-start">
                <div className="p-1 bg-violet-500/10 text-violet-400 rounded-lg mt-0.5">
                  <Terminal size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">Local Execution</h4>
                  <p className="text-slate-400 text-xs mt-0.5">Spawns runs, builds, and monitors outputs locally.</p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="pt-6 border-t border-slate-800 text-xs text-slate-500">
            Secure offline storage. Encrypted credentials.
          </div>
        </div>

        {/* Form Column */}
        <div className="md:col-span-7 flex flex-col justify-center p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-100">Setup GitHub Account</h3>
            <p className="text-slate-400 text-xs mt-1">Authenticate to create and push repositories.</p>
          </div>

          {/* Toggle Tab */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-xl mb-6">
            <button
              onClick={() => { setAuthMethod('pat'); setErrorMsg(''); }}
              className={`py-2 text-xs font-medium rounded-lg transition-all ${
                authMethod === 'pat' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Personal Access Token
            </button>
            <button
              onClick={() => { setAuthMethod('oauth'); setErrorMsg(''); }}
              className={`py-2 text-xs font-medium rounded-lg transition-all ${
                authMethod === 'oauth' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              OAuth Device Flow
            </button>
          </div>

          {errorMsg && (
            <div className="flex gap-2 items-center p-3 bg-red-950/40 border border-red-800/30 text-red-400 rounded-xl text-xs mb-4">
              <ShieldAlert size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex gap-2 items-center p-3 bg-green-950/40 border border-green-800/30 text-green-400 rounded-xl text-xs mb-4 animate-pulse">
              <CheckCircle2 size={16} />
              <span>{successMsg}</span>
            </div>
          )}

          {authMethod === 'pat' ? (
            <form onSubmit={handleVerifyPat} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  GitHub Personal Access Token (PAT)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Key size={16} />
                  </span>
                  <input
                    type="password"
                    placeholder="ghp_..."
                    required
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl text-sm text-slate-200 outline-none transition-colors"
                  />
                </div>
                <p className="text-slate-500 text-[10px] leading-relaxed mt-2">
                  Create a PAT on GitHub with <code className="bg-slate-950 px-1 py-0.5 rounded text-violet-400">repo</code> and <code className="bg-slate-950 px-1 py-0.5 rounded text-violet-400">user</code> scopes to allow creating and publishing repositories.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  disabled={isVerifying || !patToken.trim()}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-lg shadow-violet-950/45 transition-colors flex items-center justify-center gap-2"
                >
                  {isVerifying ? 'Verifying Token...' : 'Verify & Continue'}
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Skip Authentication
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                  OAuth Client ID
                </label>
                <input
                  type="text"
                  placeholder="Enter your GitHub OAuth Application Client ID"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 focus:border-violet-500 rounded-xl text-sm text-slate-200 outline-none transition-colors"
                />
              </div>

              {deviceCodeData && (
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                  <div className="text-xs text-slate-400">
                    Go to <a href={deviceCodeData.verification_uri} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">{deviceCodeData.verification_uri}</a> and enter the code:
                  </div>
                  <div className="text-2xl font-bold tracking-widest text-center py-2 text-violet-400 bg-slate-900 border border-slate-800 rounded-lg">
                    {deviceCodeData.user_code}
                  </div>
                  <div className="text-[10px] text-slate-500 text-center animate-pulse">
                    Waiting for authorization...
                  </div>
                </div>
              )}

              <div className="pt-2 flex flex-col gap-2">
                <button
                  onClick={handleStartOAuth}
                  disabled={isVerifying || !clientId.trim()}
                  className="w-full py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-lg shadow-violet-950/45 transition-colors flex items-center justify-center gap-2"
                >
                  {isVerifying && !deviceCodeData ? 'Starting Flow...' : (deviceCodeData ? 'Awaiting Authorization...' : 'Start Device Flow')}
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  onClick={onSkip}
                  className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Skip Authentication
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

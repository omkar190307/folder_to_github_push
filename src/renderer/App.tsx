import React, { useState, useEffect } from 'react';
import ConnectPage from './pages/connect';
import UploadPage from './pages/upload';
import './services/browser-fallback';

export default function App() {
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadAccount = async () => {
    try {
      const accounts: any[] = await window.api.getGithubAccounts();
      setAccount(accounts.length > 0 ? accounts[0] : null);
    } catch {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAccount(); }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-animated">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <span className="text-slate-500 text-xs">Loading...</span>
        </div>
      </div>
    );
  }

  if (!account) {
    return <ConnectPage onConnected={() => loadAccount()} />;
  }

  return <UploadPage account={account} onDisconnect={() => { setAccount(null); }} />;
}

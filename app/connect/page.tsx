'use client';

import { FormEvent, useEffect, useState } from 'react';

export default function ConnectQuickBooksPage() {
  const [setupKey, setSetupKey] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (new URLSearchParams(window.location.search).get('connected') === '1') {
        setStatus('QuickBooks Online is connected. You can close this page.');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('Opening QuickBooks…');
    const response = await fetch('/api/quickbooks/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ setupKey }),
    });
    const result = await response.json().catch(() => ({ message: 'QuickBooks connection could not be started.' })) as { authorizationUrl?: string; message?: string };
    if (!response.ok || !result.authorizationUrl) {
      setStatus(result.message || 'QuickBooks connection could not be started.');
      return;
    }
    window.location.assign(result.authorizationUrl);
  };

  return (
    <main className="center-page">
      <section className="center-card connect-card">
        <p className="eyebrow">Private setup</p>
        <h1>Connect QuickBooks Online</h1>
        <p>Enter the private setup key configured in Netlify. You will be redirected to Intuit to authorize the company.</p>
        <form onSubmit={connect}>
          <label className="field"><span>Setup key</span><input type="password" required autoComplete="off" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} /></label>
          <button className="button-primary" type="submit">Connect QuickBooks</button>
        </form>
        {status && <p className="connect-status" role="status">{status}</p>}
      </section>
    </main>
  );
}

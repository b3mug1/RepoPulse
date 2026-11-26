import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { exchangeGitHubCode, setStoredAuthToken } from '../api/client';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const ghError = searchParams.get('error_description') || searchParams.get('error');

    if (ghError) {
      setError(ghError);
      return;
    }
    if (!code || !state) {
      setError('Missing OAuth code or state parameter.');
      return;
    }

    exchangeGitHubCode(code, state)
      .then((res) => {
        setStoredAuthToken(res.access_token);
        navigate('/', { replace: true });
      })
      .catch((err) => {
        setError(err.response?.data?.detail || 'GitHub sign-in failed.');
      });
  }, [navigate, searchParams]);

  return (
    <div className="analysis-page max-w-md mx-auto py-16">
      <div className="glass p-6 text-center space-y-4">
        {error ? (
          <>
            <AlertCircle className="mx-auto text-rose-500" size={28} />
            <h1 className="text-base font-semibold text-slate-800">GitHub Sign-In Failed</h1>
            <p className="text-xs text-slate-500">{error}</p>
            <Link to="/" className="report-action inline-flex">
              Back to Home
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto spin text-indigo-500" size={28} />
            <h1 className="text-base font-semibold text-slate-800">Completing GitHub Sign-In…</h1>
            <p className="text-xs text-slate-500">Connecting your GitHub session and private repo access.</p>
          </>
        )}
      </div>
    </div>
  );
}

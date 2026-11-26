import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { exchangeGitHubCode, setStoredAuthToken, setStoredAuthUser } from '../api/client';
import { useLocale } from '../i18n';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLocale();
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
      setError(t.missingOAuthError);
      return;
    }

    exchangeGitHubCode(code, state)
      .then((res) => {
        setStoredAuthUser(res.user);
        setStoredAuthToken(res.access_token);
        navigate('/', { replace: true });
      })
      .catch((err) => {
        setError(err.response?.data?.detail || t.githubSignInFailedMsg);
      });
  }, [navigate, searchParams, t.githubSignInFailedMsg, t.missingOAuthError]);

  return (
    <div className="analysis-page max-w-md mx-auto py-16">
      <div className="glass p-6 text-center space-y-4">
        {error ? (
          <>
            <AlertCircle className="mx-auto text-rose-500" size={28} />
            <h1 className="text-base font-semibold text-slate-800">{t.githubSignInFailed}</h1>
            <p className="text-xs text-slate-500">{error}</p>
            <Link to="/" className="report-action inline-flex">
              {t.backToHome}
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto spin text-indigo-500" size={28} />
            <h1 className="text-base font-semibold text-slate-800">{t.completingGitHubSignIn}</h1>
            <p className="text-xs text-slate-500">{t.connectingGitHubSession}</p>
          </>
        )}
      </div>
    </div>
  );
}

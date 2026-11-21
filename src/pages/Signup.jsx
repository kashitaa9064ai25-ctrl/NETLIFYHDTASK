import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export default function Login() {
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState('credentials'); // 'credentials' | '2fa_prompt'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [pendingUser, setPendingUser] = useState(null);
  const [loginReason, setLoginReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Authenticate credentials, then check if 2FA challenge is triggered
  const handleInitialAuth = async (firebaseUser) => {
    try {
      const res = await fetch('/api/2fa/check-login-requirement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: firebaseUser.uid }),
      });
      const data = await res.json();

      if (data.requires2FA) {
        setPendingUser(firebaseUser);
        if (data.loginCount === 1) {
          setLoginReason('Initial 2FA verification required for new account.');
        } else if (data.loginCount % 5 === 0) {
          setLoginReason(`Security Check: 2FA required on every 5th login (Login #${data.loginCount}).`);
        } else {
          setLoginReason('Two-Factor Authentication required.');
        }
        setStep('2fa_prompt');
      } else {
        // Complete login directly without challenge
        await fetch('/api/2fa/complete-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: firebaseUser.uid }),
        });
        navigate('/browse');
      }
    } catch (err) {
      console.error(err);
      navigate('/browse');
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await loginWithEmail(email, password);
      await handleInitialAuth(user);
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const user = await loginWithGoogle();
      await handleInitialAuth(user);
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  // Submit 6-digit TOTP code
  const handleVerify2FACode = async (e) => {
    e.preventDefault();
    if (token.length !== 6) return setError('Please enter a 6-digit code.');

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/2fa/complete-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: pendingUser.uid,
          token: token.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        navigate('/browse');
      } else {
        setError(data.message || 'Invalid 2FA code.');
      }
    } catch (err) {
      setError('Verification network failure.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
      <h2 className="text-xl font-bold text-gray-800 mb-2">Log In to DEV@Deakin</h2>

      {error && <div className="p-3 mb-4 bg-red-50 text-red-700 text-xs rounded border border-red-200">{error}</div>}

      {step === 'credentials' ? (
        <>
          <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-gray-700 font-semibold mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-bold rounded shadow transition disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </form>

          <div className="my-4 flex items-center justify-between text-xs text-gray-400">
            <hr className="w-full border-gray-200" />
            <span className="px-2">OR</span>
            <hr className="w-full border-gray-200" />
          </div>

          <button
            onClick={handleGoogleSubmit}
            disabled={loading}
            className="w-full py-2 border border-gray-300 rounded text-xs font-semibold hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
        </>
      ) : (
        /* 2FA Challenge View */
        <form onSubmit={handleVerify2FACode} className="space-y-4 text-center">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto text-lg font-bold">
            🔒
          </div>
          <h3 className="text-sm font-bold text-gray-800">Security Verification</h3>
          <p className="text-xs text-gray-500">{loginReason}</p>

          <div>
            <input
              type="text"
              maxLength={6}
              required
              placeholder="123456"
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
              className="w-36 mx-auto text-center font-mono text-lg tracking-widest border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || token.length !== 6}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded transition disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Verify Code & Sign In'}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-xs text-gray-500">
        Need an account? <Link to="/signup" className="text-blue-600 font-semibold hover:underline">Sign Up</Link>
      </p>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export default function TwoFactorSetup() {
    const { currentUser } = useAuth();

    const [isEnabled, setIsEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [setupStep, setSetupStep] = useState('idle'); // 'idle' | 'scanning' | 'success'
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [disableCode, setDisableCode] = useState('');
    const [statusMessage, setStatusMessage] = useState('');
    const [error, setError] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // Check 2FA state from Firestore
    useEffect(() => {
        const checkStatus = async () => {
            if (!currentUser?.uid) return;
            try {
                const userRef = doc(db, 'users', currentUser.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    setIsEnabled(!!userSnap.data().twoFactorEnabled);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        checkStatus();
    }, [currentUser]);

    // Request new TOTP secret & QR code
    const handleStartSetup = async () => {
        setError('');
        setStatusMessage('');
        setActionLoading(true);

        try {
            const res = await fetch('http://localhost:5000/api/2fa/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.uid,
                    email: currentUser.email,
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setQrCodeUrl(data.qrCode);
                setSecretKey(data.secret);
                setSetupStep('scanning');
            } else {
                setError(data.message || 'Failed to initiate 2FA setup.');
            }
        } catch (err) {
            setError('Could not connect to backend server on port 5000.');
        } finally {
            setActionLoading(false);
        }
    };

    // Verify code to activate
    const handleVerifyAndEnable = async (e) => {
        e.preventDefault();
        if (verificationCode.trim().length !== 6) {
            return setError('Please enter a valid 6-digit numerical code.');
        }

        setActionLoading(true);
        setError('');

        try {
            const res = await fetch('http://localhost:5000/api/2fa/verify-and-enable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.uid,
                    token: verificationCode.trim(),
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setIsEnabled(true);
                setSetupStep('idle');
                setVerificationCode('');
                setStatusMessage('Two-Factor Authentication is now actively protecting your account!');
            } else {
                setError(data.message || 'Invalid code. Please try again.');
            }
        } catch (err) {
            setError('Verification network failure.');
        } finally {
            setActionLoading(false);
        }
    };

    // Disable 2FA
    const handleDisable2FA = async (e) => {
        e.preventDefault();
        if (disableCode.trim().length !== 6) {
            return setError('Please provide the 6-digit code from your authenticator to disable.');
        }

        setActionLoading(true);
        setError('');

        try {
            const res = await fetch('http://localhost:5000/api/2fa/disable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: currentUser.uid,
                    token: disableCode.trim(),
                }),
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setIsEnabled(false);
                setDisableCode('');
                setStatusMessage('2FA has been disabled on this account.');
            } else {
                setError(data.message || 'Failed to disable 2FA.');
            }
        } catch (err) {
            setError('Network error while disabling 2FA.');
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return <div className="text-center py-20 text-gray-500 text-sm">Loading security configuration...</div>;
    }

    return (
        <div className="max-w-2xl mx-auto py-12 px-4">
            <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
                <div className="flex items-center justify-between pb-6 border-b border-gray-200 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Two-Factor Authentication (2FA)</h1>
                        <p className="text-xs text-gray-500 mt-1">
                            Add a layer of security to your DEV@Deakin account using Time-Based One-Time Passwords (TOTP).
                        </p>
                    </div>
                    <span
                        className={`text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider ${isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                            }`}
                    >
                        {isEnabled ? '● Active' : '○ Disabled'}
                    </span>
                </div>

                {statusMessage && (
                    <div className="mb-6 p-3 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded text-xs font-medium">
                        {statusMessage}
                    </div>
                )}

                {error && (
                    <div className="mb-6 p-3 bg-red-50 border border-red-300 text-red-700 rounded text-xs font-medium">
                        {error}
                    </div>
                )}

                {/* State 1: 2FA is Disabled, Not started */}
                {!isEnabled && setupStep === 'idle' && (
                    <div className="space-y-4">
                        <p className="text-sm text-gray-600 leading-relaxed">
                            When 2FA is active, signing in and executing sensitive administrative actions will require a 6-digit code generated by an authenticator application (Google Authenticator, Authy, Microsoft Authenticator, or 1Password).
                        </p>
                        <button
                            onClick={handleStartSetup}
                            disabled={actionLoading}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow transition disabled:opacity-50"
                        >
                            {actionLoading ? 'Initializing...' : 'Set Up Two-Factor Authentication'}
                        </button>
                    </div>
                )}

                {/* State 2: QR Code is Displayed for Scanning */}
                {!isEnabled && setupStep === 'scanning' && (
                    <div className="space-y-6 animate-in fade-in">
                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
                            <h3 className="text-sm font-bold text-gray-800 mb-2">Step 1: Scan this QR Code</h3>
                            <p className="text-xs text-gray-500 mb-4">
                                Open your authenticator app (Google Authenticator, Authy, etc.) and point your camera at the QR code below.
                            </p>

                            {qrCodeUrl && (
                                <div className="inline-block p-3 bg-white border border-gray-300 rounded shadow-sm">
                                    <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48 mx-auto" />
                                </div>
                            )}

                            <div className="mt-4">
                                <span className="text-[11px] text-gray-400 block mb-1">Manual entry key:</span>
                                <code className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-300 select-all">
                                    {secretKey}
                                </code>
                            </div>
                        </div>

                        <form onSubmit={handleVerifyAndEnable} className="space-y-3">
                            <h3 className="text-sm font-bold text-gray-800">Step 2: Enter the 6-Digit Code</h3>
                            <p className="text-xs text-gray-500">
                                Enter the six-digit code shown in your authenticator app to confirm configuration.
                            </p>

                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    maxLength={6}
                                    required
                                    placeholder="e.g. 123456"
                                    value={verificationCode}
                                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-48 text-center tracking-widest font-mono text-base font-bold border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button
                                    type="submit"
                                    disabled={actionLoading || verificationCode.length !== 6}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow transition disabled:opacity-50"
                                >
                                    {actionLoading ? 'Verifying...' : 'Verify & Activate'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSetupStep('idle')}
                                    className="px-4 py-2 border border-gray-300 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* State 3: 2FA is Currently Active */}
                {isEnabled && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold">
                                ✓
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-emerald-900">Account Protected</h4>
                                <p className="text-xs text-emerald-700">
                                    Your account is secured with Time-Based One-Time Password verification.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleDisable2FA} className="border-t pt-6 space-y-3">
                            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider text-red-600">
                                Disable Two-Factor Authentication
                            </h4>
                            <p className="text-xs text-gray-500">
                                To turn off 2FA, enter the current 6-digit code from your authenticator app below:
                            </p>

                            <div className="flex gap-3">
                                <input
                                    type="text"
                                    maxLength={6}
                                    placeholder="6-digit code"
                                    value={disableCode}
                                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                                    className="w-36 text-center font-mono tracking-widest text-sm font-bold border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-red-500"
                                />
                                <button
                                    type="submit"
                                    disabled={actionLoading || disableCode.length !== 6}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded shadow transition disabled:opacity-50"
                                >
                                    {actionLoading ? 'Disabling...' : 'Confirm Disable'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}
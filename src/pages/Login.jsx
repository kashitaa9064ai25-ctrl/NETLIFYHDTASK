import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { loginWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("credentials"); // 'credentials' | 'otp_prompt'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // OTP Verification States
  const [pendingUser, setPendingUser] = useState(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challengeReason, setChallengeReason] = useState("");

  // Evaluates login requirement and automatically triggers Email OTP dispatch
  const processPostAuthSecurity = async (firebaseUser, userEmail) => {
    try {
      const res = await fetch("/api/2fa/check-login-requirement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: firebaseUser.uid }),
      });
      const data = await res.json();

      if (data.requires2FA) {
        setPendingUser(firebaseUser);
        const targetEmail = userEmail || firebaseUser.email;
        setPendingEmail(targetEmail);

        if (data.loginCount === 1) {
          setChallengeReason("First login verification: An OTP has been sent to your email.");
        } else if (data.loginCount % 5 === 0) {
          setChallengeReason(`Security check (Login #${data.loginCount}): An OTP has been sent to your email.`);
        } else {
          setChallengeReason("Security verification: An OTP has been sent to your email.");
        }

        // TRIGGER EMAIL OTP DISPATCH
        try {
          await fetch("/api/auth/send-email-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: targetEmail }),
          });
        } catch (otpErr) {
          console.error("Failed to trigger email OTP:", otpErr);
        }

        setStep("otp_prompt");
      } else {
        // Normal login without challenge
        await fetch("/api/2fa/complete-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: firebaseUser.uid }),
        });
        navigate("/browse");
      }
    } catch (err) {
      console.error("Post-auth error:", err);
      navigate("/browse");
    }
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const userCred = await loginWithEmail(email, password);
      await processPostAuthSecurity(userCred.user || userCred, email);
    } catch (err) {
      console.error(err);
      if (err.code === "auth/unverified-email") {
        setError(err.message);
      } else if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password" ||
        err.code === "auth/invalid-credential"
      ) {
        setError("Invalid email address or password. Please verify your credentials.");
      } else {
        setError(err.message || "Failed to log in.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const userCred = await loginWithGoogle();
      const user = userCred.user || userCred;
      await processPostAuthSecurity(user, user.email);
    } catch (err) {
      console.error(err);
      setError("Google Sign-In failed or was closed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (otpCode.trim().length !== 6) {
      return setError("Please enter the complete 6-digit code.");
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/2fa/complete-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: pendingUser.uid,
          email: pendingEmail,
          token: otpCode.trim(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        navigate("/browse");
      } else {
        setError(data.message || "Invalid 6-digit OTP code.");
      }
    } catch (err) {
      console.error(err);
      setError("Network error while verifying OTP code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json();
      if (data.success) {
        alert("New OTP dispatched! Check your email (or backend terminal).");
      }
    } catch (err) {
      setError("Failed to resend OTP.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 border border-gray-300 rounded-lg shadow-sm">
        <div>
          <h2 className="text-center text-2xl font-extrabold text-gray-900">
            {step === "credentials" ? "Sign in to DEV@Deakin" : "Email Verification"}
          </h2>
          <p className="mt-2 text-center text-xs text-gray-600">
            {step === "credentials" ? (
              <>
                Need an account?{" "}
                <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-500">
                  Create an account
                </Link>
              </>
            ) : (
              challengeReason
            )}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-3 text-xs text-red-700 leading-relaxed">
            {error}
          </div>
        )}

        {step === "credentials" ? (
          <>
            {/* Google Sign-In */}
            <div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 rounded shadow-sm bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Sign in with Google
              </button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-gray-300"></div>
              <span className="flex-shrink mx-4 text-xs font-semibold text-gray-400 uppercase">
                Or with email
              </span>
              <div className="flex-grow border-t border-gray-300"></div>
            </div>

            <form className="space-y-4" onSubmit={handleEmailLogin}>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@gmail.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-gray-800 hover:bg-black text-white text-sm font-semibold rounded shadow transition disabled:opacity-50"
              >
                {loading ? "Authenticating..." : "Sign In"}
              </button>
            </form>
          </>
        ) : (
          /* STEP 2: Email OTP Prompt View */
          <form className="space-y-5" onSubmit={handleVerifyOtp}>
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto text-xl font-bold">
              ✉️
            </div>

            <div className="text-center">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Enter 6-Digit Email OTP
              </label>
              <input
                type="text"
                maxLength={6}
                autoFocus
                required
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="w-44 mx-auto text-center font-mono text-xl tracking-widest border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
              />
              <p className="text-[11px] text-gray-500 mt-2">
                Sent to: <span className="font-semibold text-gray-700">{pendingEmail}</span>
              </p>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={loading}
                className="text-xs text-blue-600 hover:underline mt-1 font-semibold"
              >
                Resend OTP
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="submit"
                disabled={loading || otpCode.length !== 6}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded shadow transition disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify OTP & Continue"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setOtpCode("");
                  setError("");
                }}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-800 font-semibold"
              >
                ← Back to credentials
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
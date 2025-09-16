"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";

const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  // Capture ?ref=... if present
  const refId = useMemo(() => (params?.get("ref") || "").trim(), [params]);

  // If already signed in, bounce to dashboard
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.push("/dashboard");
    });
    return () => unsub();
  }, [router]);

  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const emailOk = isValidEmail(email);
  const canSubmit = emailOk && password && !loading;

  const friendlyError = (codeOrMsg) => {
    const txt = String(codeOrMsg || "");
    if (txt.includes("auth/invalid-email")) return "That email address looks invalid.";
    if (txt.includes("auth/user-disabled")) return "This account has been disabled.";
    if (txt.includes("auth/user-not-found")) return "No account found with that email.";
    if (txt.includes("auth/wrong-password")) return "Incorrect password. Please try again.";
    if (txt.includes("auth/too-many-requests"))
      return "Too many attempts. Please wait a moment and try again.";
    if (txt.toLowerCase().includes("network")) return "Network error. Check your connection and try again.";
    return "Unable to log in. Please check your email and password.";
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!emailOk) {
      setEmailTouched(true);
      setError("Please enter a valid email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push("/dashboard");
    } catch (err) {
      setError(friendlyError(err.code || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError("");
    setNotice("");
    if (!emailOk) {
      setEmailTouched(true);
      setError("Enter a valid email first to receive the reset link.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice("Password reset link sent. Please check your inbox.");
    } catch (err) {
      setError(friendlyError(err.code || err.message));
    }
  };

  const registerHref = refId ? `/register?ref=${encodeURIComponent(refId)}` : "/register";

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-4 py-10">
        <div className="rounded-2xl border border-gray-100 bg-white/80 p-6 shadow-sm">
          {/* Brand (optional) */}
          <div className="flex justify-center">
            <Image
              src="/nuvantage-icon.svg"
              alt="NuVantage India"
              width={48}
              height={48}
              className="opacity-90"
              priority
            />
          </div>

          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 text-center">
            Login to NuVantage India
          </h1>

          {/* Referral banner */}
          {refId && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs text-blue-800">
              Referred by <span className="font-mono font-semibold">{refId}</span>. If you don’t have an account yet, please{" "}
              <a href={registerHref} className="underline font-medium">create one here</a>.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && (
            <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              {notice}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4" noValidate>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-800">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (!emailTouched) setEmailTouched(true);
                }}
                onBlur={() => setEmailTouched(true)}
                className={`mt-1 w-full rounded-xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  !emailTouched || emailOk
                    ? "border-gray-200 focus:ring-blue-500"
                    : "border-red-300 focus:ring-red-500"
                }`}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                aria-invalid={emailTouched && !emailOk ? "true" : "false"}
              />
              {emailTouched && !emailOk && (
                <p className="mt-1 text-xs text-red-600">Please enter a valid email.</p>
              )}
            </div>

            {/* Password with show/hide */}
            <div>
              <label className="block text-sm font-medium text-gray-800">Password</label>
              <div className="relative mt-1">
                <input
                  type={pwVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 pr-20 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={pwVisible ? "Hide password" : "Show password"}
                  aria-pressed={pwVisible}
                  onClick={() => setPwVisible((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {pwVisible ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Logging in…" : "Login"}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleReset}
                className="text-blue-600 hover:underline"
              >
                Forgot password?
              </button>

              <a href={registerHref} className="text-gray-600 hover:underline">
                Create an account
              </a>
            </div>
          </form>

          {/* Divider */}
          <div className="mt-6 border-t border-gray-100" />

          {/* Referral link helper (optional) */}
          <p className="mt-4 text-center text-xs text-gray-500">
            Have a sponsor? Use your referral link to register.
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

  // Capture ?ref=... safely (no useSearchParams; avoids Suspense requirement)
  const [refId, setRefId] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      setRefId((p.get("ref") || "").trim());
    }
  }, []);

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
  const registerHref = refId ? `/register?ref=${encodeURIComponent(refId)}` : "/register";

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Subtle background ornaments */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-24 h-72 w-72 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-3xl border border-gray-100/80 bg-white/80 backdrop-blur-sm p-7 shadow-xl">
          {/* Brand */}
          <div className="flex flex-col items-center text-center">
            <div className="rounded-2xl ring-1 ring-gray-100 shadow-sm p-3 bg-white">
              <Image
                src="/nuvantage-icon.svg"
                alt="NuVantage India"
                width={96}     // bigger logo
                height={96}
                priority
                className="block"
              />
            </div>

            <h1 className="mt-4 text-[22px] sm:text-2xl font-semibold tracking-tight text-gray-900">
              Welcome back to NuVantage India
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Sign in to continue building your India team.
            </p>
          </div>

          {/* Referral banner */}
          {!!refId && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-2 text-[13px] text-blue-800">
              Referred by <span className="font-mono font-semibold">{refId}</span>. If you don’t have an account yet,{" "}
              <a href={registerHref} className="underline font-medium">create one here</a>.
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div
              className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
              role="status"
              aria-live="polite"
            >
              {notice}
            </div>
          )}

          {/* Form */}
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
                className={`mt-1 w-full rounded-2xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                  !emailTouched || emailOk
                    ? "border-gray-200 focus:ring-blue-500"
                    : "border-red-300 focus:ring-red-500"
                }`}
                placeholder="you@example.com"
                autoComplete="email"
                inputMode="email"
                aria-invalid={emailTouched && !emailOk ? "true" : "false"}
                autoFocus
              />
              {emailTouched && !emailOk && (
                <p className="mt-1 text-xs text-red-600">Please enter a valid email.</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-800">Password</label>
              <div className="relative mt-1">
                <input
                  type={pwVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-3 py-3 pr-24 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Your password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={pwVisible ? "Hide password" : "Show password"}
                  aria-pressed={pwVisible}
                  onClick={() => setPwVisible((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {pwVisible ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? "Logging in…" : "Login"}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleReset}
                className="text-blue-700 hover:underline"
              >
                Forgot password?
              </button>

              <a href={registerHref} className="text-gray-700 hover:underline">
                Create an account
              </a>
            </div>
          </form>

          {/* Footer helper */}
          <div className="mt-6 border-t border-gray-100" />
          <p className="mt-4 text-center text-xs text-gray-500">
            Have a sponsor? Use your referral link to register.
          </p>
        </div>
      </div>
    </div>
  );
}

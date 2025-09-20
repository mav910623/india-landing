"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "@/lib/firebase";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
import { useTranslations, useLocale } from "next-intl";

/** Utility */
const isValidEmail = (e) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

/** ---- Small, inline language selector (permanent on page) ---- */
function InlineLangSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const current = useLocale();

  const SUPPORTED = ["en", "hi", "ta"];
  const labels = { en: "English", hi: "हिन्दी", ta: "தமிழ்" };

  const onChange = (next) => {
    if (!next || next === current) return;
    // Replace the /en|/hi|/ta prefix with the chosen locale
    const newPath = pathname.replace(/^\/(en|hi|ta)(?=\/|$)/, `/${next}`);
    router.push(newPath);
  };

  return (
    <div className="flex justify-end">
      <label htmlFor="lang" className="sr-only">
        Language
      </label>
      <select
        id="lang"
        value={SUPPORTED.includes(current) ? current : "en"}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Language"
      >
        {SUPPORTED.map((lc) => (
          <option key={lc} value={lc}>
            {labels[lc]}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function LoginPage() {
  const t = useTranslations("login");
  const router = useRouter();

  /** Referral capture */
  const [refId, setRefId] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      setRefId((p.get("ref") || "").trim());
    }
  }, []);

  /** Redirect if signed in */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) router.push("/dashboard");
    });
    return () => unsub();
  }, [router]);

  /** State */
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const emailOk = isValidEmail(email);
  const canSubmit = emailOk && password && !loading;
  const registerHref = refId
    ? `/register?ref=${encodeURIComponent(refId)}`
    : "/register";

  /** Error translation */
  const friendlyError = (codeOrMsg) => {
    const txt = String(codeOrMsg || "");
    if (txt.includes("auth/invalid-email")) return t("errors.invalidEmail");
    if (txt.includes("auth/user-disabled")) return t("errors.userDisabled");
    if (txt.includes("auth/user-not-found")) return t("errors.userNotFound");
    if (txt.includes("auth/wrong-password")) return t("errors.wrongPassword");
    if (txt.includes("auth/too-many-requests"))
      return t("errors.tooManyRequests");
    if (txt.toLowerCase().includes("network"))
      return t("errors.networkError");
    return t("errors.generic");
  };

  /** Handlers */
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");

    if (!emailOk) {
      setEmailTouched(true);
      setError(t("errors.invalidEmail"));
      return;
    }
    if (!password) {
      setError(t("errors.noPassword"));
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
      setError(t("errors.invalidEmailForReset"));
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice(t("notices.resetSent"));
    } catch (err) {
      setError(friendlyError(err.code || err.message));
    }
  };

  /** UI */
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Background ornaments */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-24 h-72 w-72 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md px-4 py-12">
        <div className="rounded-3xl border border-gray-100/80 bg-white/80 backdrop-blur-sm p-7 shadow-xl">
          {/* ---- Permanent language selector (top of the card) ---- */}
          <InlineLangSelect />

          {/* Brand */}
          <div className="mt-3 flex flex-col items-center text-center">
            <div className="rounded-2xl ring-1 ring-gray-100 shadow-sm p-3 bg-white">
              <Image
                src="/nuvantage-icon.svg"
                alt="NuVantage India"
                width={96}
                height={96}
                priority
                className="block"
              />
            </div>

            <h1 className="mt-4 text-[22px] sm:text-2xl font-semibold tracking-tight text-gray-900">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-gray-600">{t("subtitle")}</p>
          </div>

          {/* Referral banner */}
          {!!refId && (
            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-2 text-[13px] text-blue-800">
              {t("referredBy")}{" "}
              <span className="font-mono font-semibold">{refId}</span>.{" "}
              {t("createAccountPrompt")}{" "}
              <a href={registerHref} className="underline font-medium">
                {t("createHere")}
              </a>
              .
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div
              className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}
          {notice && (
            <div
              className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
              role="status"
            >
              {notice}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="mt-6 space-y-4" noValidate>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-800">
                {t("fields.email")}
              </label>
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
                placeholder={t("placeholders.email")}
                autoComplete="email"
                inputMode="email"
                aria-invalid={emailTouched && !emailOk ? "true" : "false"}
                autoFocus
              />
              {emailTouched && !emailOk && (
                <p className="mt-1 text-xs text-red-600">{t("errors.invalidEmail")}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-800">
                {t("fields.password")}
              </label>
              <div className="relative mt-1">
                <input
                  type={pwVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-gray-200 px-3 py-3 pr-24 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t("placeholders.password")}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  aria-label={pwVisible ? t("actions.hidePw") : t("actions.showPw")}
                  aria-pressed={pwVisible}
                  onClick={() => setPwVisible((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  {pwVisible ? t("actions.hidePw") : t("actions.showPw")}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
            >
              {loading ? t("actions.loggingIn") : t("actions.login")}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={handleReset}
                className="text-blue-700 hover:underline"
              >
                {t("actions.forgotPw")}
              </button>

              <a href={registerHref} className="text-gray-700 hover:underline">
                {t("actions.createAccount")}
              </a>
            </div>
          </form>

          {/* Footer helper */}
          <div className="mt-6 border-t border-gray-100" />
          <p className="mt-4 text-center text-xs text-gray-500">
            {t("footer.sponsorNote")}
          </p>
        </div>
      </div>
    </div>
  );
}

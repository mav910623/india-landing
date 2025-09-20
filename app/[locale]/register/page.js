"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  serverTimestamp,
  arrayUnion,
  writeBatch,
  limit,
} from "firebase/firestore";
import { getCountries, getCountryCallingCode } from "libphonenumber-js/min";

/** =========================================================
 *  Build/runtime hints (CSR)
 * ======================================================== */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/** =========================================================
 *  Helpers
 * ======================================================== */
function referralIdFromUid(uid) {
  return "NU" + uid.slice(0, 6).toUpperCase();
}
function randomReferralCandidate() {
  return "NU" + Math.random().toString(36).substring(2, 8).toUpperCase();
}
async function referralIdExists(refId) {
  const qy = query(collection(db, "users"), where("referralId", "==", refId), limit(1));
  const snap = await getDocs(qy);
  return !snap.empty;
}
async function generateUniqueReferralId(uid) {
  const c1 = referralIdFromUid(uid);
  if (!(await referralIdExists(c1))) return c1;
  for (let i = 0; i < 10; i++) {
    const cand = randomReferralCandidate();
    if (!(await referralIdExists(cand))) return cand;
  }
  return "NU" + Date.now().toString().slice(-6);
}
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());
const hasMinLen = (p) => String(p || "").length >= 8;
const hasUpper = (p) => /[A-Z]/.test(String(p || ""));
const hasNumber = (p) => /[0-9]/.test(String(p || ""));
const passwordScore = (p) => [hasMinLen(p), hasUpper(p), hasNumber(p)].filter(Boolean).length;

function unmaskPan(s) {
  return String(s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function constrainPanCore(core) {
  const raw = unmaskPan(core).slice(0, 10);
  let out = "";
  for (let i = 0; i < raw.length && out.length < 10; i++) {
    const ch = raw[i], idx = out.length;
    if (idx <= 4 || idx === 9) {
      if (/[A-Z]/.test(ch)) out += ch;
    } else {
      if (/[0-9]/.test(ch)) out += ch;
    }
  }
  return out;
}
function formatPanMasked(core10) {
  const c = constrainPanCore(core10);
  if (c.length <= 5) return c;
  if (c.length <= 9) return `${c.slice(0, 5)}-${c.slice(5)}`;
  return `${c.slice(0, 5)}-${c.slice(5, 9)}-${c.slice(9)}`;
}
const isValidPANCore = (core) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(core);

function toE164(dial, local) {
  const d = String(dial || "").replace(/[^\d+]/g, "");
  const digits = String(local || "").replace(/\D/g, "");
  if (String(local || "").trim().startsWith("+")) {
    const just = String(local).replace(/[^\d+]/g, "");
    return just.startsWith("+") ? just : `+${just}`;
  }
  const dialDigits = d.replace(/\D/g, "");
  if (!dialDigits || !digits) return "";
  return `+${dialDigits}${digits}`;
}
function flagFromCC(cc) {
  if (!cc || cc.length !== 2) return "🏳️";
  const A = 0x1f1e6, a = "A".charCodeAt(0);
  return String.fromCodePoint(...cc.toUpperCase().split("").map((c) => A + (c.charCodeAt(0) - a)));
}

/** =========================================================
 *  Small, accessible custom picker for phone country (i18n)
 * ======================================================== */
function PhoneCountryPicker({ countries, value, onChange, t }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    }
    function onEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  const current = value || null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
        title={t("a11y.changeCountry")}
      >
        <span className="text-base leading-none">{current?.flag || "🌍"}</span>
        <span className="font-mono text-gray-800">{current?.dial || "+.."}</span>
        <svg aria-hidden="true" className={`h-4 w-4 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor">
          <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.585l3.71-3.355a.75.75 0 011.02 1.1l-4.2 3.8a.75.75 0 01-1.02 0l-4.2-3.8a.75.75 0 01-.02-1.06z" />
        </svg>
      </button>

      {open && (
        <div role="listbox" className="absolute z-50 mt-2 w-64 max-h-64 overflow-auto rounded-2xl border border-gray-200 bg-white p-1 shadow-lg">
          {countries.map((c) => {
            const selected = current?.cc === c.cc;
            return (
              <button
                key={c.cc}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => { onChange?.(c); setOpen(false); }}
                className={`w-full text-left rounded-xl px-2 py-2 text-sm hover:bg-gray-50 ${
                  selected ? "bg-blue-50" : ""
                }`}
              >
                <span className="mr-2">{c.flag}</span>
                <span className="align-middle">{c.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** =========================================================
 *  Page Component
 * ======================================================== */
export default function RegisterPage() {
  const router = useRouter();
  const { locale = "en" } = useParams();
  const t = useTranslations("register");

  /** ---------- Countries (runtime-built) ---------- */
  const [countries, setCountries] = useState([]);
  const [country, setCountry] = useState(null);
  const [residence, setResidence] = useState(null);

  useEffect(() => {
    try {
      const regionNames = new Intl.DisplayNames([locale], { type: "region" });
      const list = getCountries()
        .map((cc) => {
          let dial = "";
          try { dial = `+${getCountryCallingCode(cc)}`; } catch { dial = ""; }
          const name = regionNames.of(cc) || cc;
          return { cc, name, dial, flag: flagFromCC(cc) };
        })
        .filter((c) => c.dial)
        .sort((a, b) => a.name.localeCompare(b.name));
      setCountries(list);

      const india = list.find((c) => c.cc === "IN") || null;
      setCountry(india || list[0] || null);
      setResidence(list[0] || india || null);
    } catch (e) {
      console.error("Building country list failed:", e);
      setCountries([]); setCountry(null); setResidence(null);
    }
  }, [locale]);

  /** ---------- Steps & Sponsor ---------- */
  const [step, setStep] = useState(1);
  const [uplineInput, setUplineInput] = useState("");
  const [upline, setUpline] = useState(null);
  const [checkingUpline, setCheckingUpline] = useState(false);
  const [refLocked, setRefLocked] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const ref = (p.get("ref") || "").trim();
      if (ref) {
        const up = ref.toUpperCase();
        setUplineInput(up);
        setRefLocked(true);
        (async () => {
          setCheckingUpline(true);
          try {
            const qy = query(collection(db, "users"), where("referralId", "==", up), limit(1));
            const snap = await getDocs(qy);
            if (snap.empty) {
              setUpline(null);
              setNotice(t("notices.uplineNotFound"));
            } else {
              const sDoc = snap.docs[0];
              setUpline({ id: sDoc.id, ...sDoc.data() });
              setNotice(t("notices.uplineFound", { name: sDoc.data().name, ref: sDoc.data().referralId }));
              setStep(2);
            }
          } catch (err) {
            console.error("Upline lookup error (auto):", err);
            setNotice(t("errors.uplineCheck"));
            setUpline(null);
          } finally {
            setCheckingUpline(false);
          }
        })();
      }
    }
  }, [t]);

  /** ---------- Form fields ---------- */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);

  const [phoneLocal, setPhoneLocal] = useState("");

  const [panInput, setPanInput] = useState("");
  const [panCore, setPanCore] = useState("");

  const [password, setPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);

  const [participantType, setParticipantType] = useState("IN"); // "IN" | "NRI" | "OCI" | "INTL"
  const isInternational = participantType !== "IN";

  const [nuskinId, setNuskinId] = useState("");

  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState("");

  // Validate
  const emailValid = useMemo(() => isValidEmail(email), [email]);
  const pwScore = useMemo(() => passwordScore(password), [password]);
  const pwOk = pwScore === 3;

  // PAN mask handling (for Indian National only)
  function onPanChange(v) {
    const core = constrainPanCore(v);
    setPanCore(core);
    setPanInput(formatPanMasked(core));
  }

  /** ---------- Actions ---------- */

  // Step 1 — Verify upline
  const checkUpline = async () => {
    setNotice("");
    const id = String(uplineInput || "").trim().toUpperCase();
    if (!id) {
      setNotice(t("notices.enterSponsor"));
      return;
    }
    setCheckingUpline(true);
    try {
      const qy = query(collection(db, "users"), where("referralId", "==", id), limit(1));
      const snap = await getDocs(qy);
      if (snap.empty) {
        setUpline(null);
        setNotice(t("notices.uplineNotFound"));
        return;
      }
      const sDoc = snap.docs[0];
      setUpline({ id: sDoc.id, ...sDoc.data() });
      setNotice(t("notices.uplineFound", { name: sDoc.data().name, ref: sDoc.data().referralId }));
      setStep(2);
    } catch (err) {
      console.error("Upline lookup error:", err);
      setNotice(t("errors.uplineCheck"));
      setUpline(null);
    } finally {
      setCheckingUpline(false);
    }
  };

  // Step 2 — Register
  const registerUser = async () => {
    setNotice("");

    if (!upline?.id) {
      setNotice(t("errors.validUplineRequired"));
      setStep(1);
      return;
    }

    const nameNorm = String(name || "").trim();
    const emailNorm = String(email || "").trim().toLowerCase();
    const rawPhone = String(phoneLocal || "").trim();
    const e164 = toE164(country?.dial, phoneLocal);

    const panNorm = isInternational ? "" : panCore;

    if (!nameNorm || !emailNorm || !rawPhone || !password) {
      setNotice(t("errors.fillAll"));
      return;
    }
    if (!emailValid) {
      setNotice(t("errors.emailInvalid"));
      return;
    }
    if (!e164.startsWith("+")) {
      setNotice(t("errors.phoneInvalid"));
      return;
    }
    if (!pwOk) {
      setNotice(t("errors.passwordPolicy"));
      return;
    }

    if (!isInternational) {
      if (!isValidPANCore(panNorm)) {
        setNotice(t("errors.panInvalid"));
        return;
      }
    } else {
      if (!residence?.cc) {
        setNotice(t("errors.selectResidence"));
        return;
      }
      if (!nuskinId.trim()) {
        setNotice(t("errors.nuskinIdRequired"));
        return;
      }
    }

    setRegistering(true);
    let createdAuthUser = null;

    try {
      const emailQ = query(collection(db, "users"), where("email", "==", emailNorm), limit(1));
      const emailSnap = await getDocs(emailQ);
      if (!emailSnap.empty) {
        setRegistering(false);
        setNotice(t("errors.emailExists"));
        return;
      }

      const phoneQ = query(collection(db, "users"), where("phone", "==", e164), limit(1));
      const phoneSnap = await getDocs(phoneQ);
      if (!phoneSnap.empty) {
        setRegistering(false);
        setNotice(t("errors.phoneExists"));
        return;
      }

      if (!isInternational) {
        const panQ = query(collection(db, "users"), where("pan", "==", panNorm), limit(1));
        const panSnap = await getDocs(panQ);
        if (!panSnap.empty) {
          setRegistering(false);
          setNotice(t("errors.panExists"));
          return;
        }
      }

      const userCredential = await createUserWithEmailAndPassword(auth, emailNorm, password);
      createdAuthUser = userCredential.user;
      const uid = createdAuthUser.uid;
      try { await updateProfile(createdAuthUser, { displayName: nameNorm }); } catch {}

      const referralId = await generateUniqueReferralId(uid);

      const batch = writeBatch(db);
      const userRef = doc(db, "users", uid);
      const payload = {
        uid,
        name: nameNorm,
        nameLC: nameNorm.toLowerCase(),
        email: emailNorm,
        phone: e164,
        phoneRaw: rawPhone,
        countryCode: country?.cc || "",
        countryDial: country?.dial || "",
        referralId,
        upline: upline.id,
        referrals: [],
        participantType, // "IN" | "NRI" | "OCI" | "INTL"
        isInternational,
        createdAt: serverTimestamp(),
      };

      if (isInternational) {
        payload["pan"] = null;
        payload["residenceCountryCC"] = residence?.cc || "";
        payload["residenceCountryName"] = residence?.name || "";
        payload["nuskinId"] = nuskinId.trim();
      } else {
        payload["pan"] = panNorm;
        payload["residenceCountryCC"] = "IN";
        payload["residenceCountryName"] = "India";
        payload["nuskinId"] = "";
      }

      batch.set(userRef, payload);

      const sponsorRef = doc(db, "users", upline.id);
      batch.update(sponsorRef, { referrals: arrayUnion(uid) });

      await batch.commit();

      setNotice(t("notices.registered", { referralId }));
      router.push(`/${locale}/dashboard`);

      // Reset (best effort)
      setStep(1);
      setUplineInput("");
      setUpline(null);
      setName("");
      setEmail("");
      setPhoneLocal("");
      setPanInput("");
      setPanCore("");
      setPassword("");
      setParticipantType("IN");
      setNuskinId("");
    } catch (err) {
      console.error("Registration error:", err);
      try { if (createdAuthUser?.delete) await createdAuthUser.delete(); } catch {}
      setNotice(`❌ ${err?.message || t("errors.registrationFailed")}`);
    } finally {
      setRegistering(false);
    }
  };

  /** =========================================================
   *  UI
   * ======================================================== */
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Ornaments */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-blue-100/40 blur-3xl" />
        <div className="absolute -bottom-16 -right-24 h-72 w-72 rounded-full bg-indigo-100/40 blur-3xl" />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Brand header */}
        <div className="mb-6 sm:mb-8 flex flex-col items-center text-center">
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
          <h1 className="mt-4 text-[22px] sm:text-3xl font-semibold tracking-tight text-gray-900">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-gray-600">{t("subtitle")}</p>
        </div>

        <div className="rounded-3xl border border-gray-100/80 bg-white/80 backdrop-blur-sm p-6 sm:p-7 shadow-xl">
          {notice && (
            <div
              className={
                notice.startsWith("✅")
                  ? "mb-4 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800 border border-green-200"
                  : "mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 border border-red-200"
              }
              role="status"
              aria-live="polite"
            >
              {notice}
            </div>
          )}

          {/* Step indicator */}
          <div className="mb-5 flex items-center justify-center gap-2 text-xs text-gray-600">
            <span
              className={`px-2.5 py-1 rounded-full border ${
                step === 1 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50"
              }`}
            >
              {t("steps.s1")}
            </span>
            <span>→</span>
            <span
              className={`px-2.5 py-1 rounded-full border ${
                step === 2 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50"
              }`}
            >
              {t("steps.s2")}
            </span>
          </div>

          {step === 1 && (
            <section>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                {t("labels.sponsorId")}
              </label>

              <div className="flex gap-2">
                <input
                  value={uplineInput}
                  onChange={(e) => setUplineInput(e.target.value.toUpperCase())}
                  placeholder={t("placeholders.sponsorId")}
                  className="flex-1 rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={refLocked}
                />
                <button
                  onClick={checkUpline}
                  disabled={checkingUpline}
                  className="rounded-2xl bg-blue-600 text-white px-4 py-3 text-sm font-semibold hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {checkingUpline ? t("actions.checking") : t("actions.verify")}
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                {t("hints.needSponsor")}
              </p>
            </section>
          )}

          {step === 2 && upline && (
            <section>
              <div className="mb-4">
                <div className="text-xs text-gray-500">{t("labels.uplineConfirmed")}</div>
                <div className="text-base sm:text-lg font-medium text-gray-900">
                  {upline.name}{" "}
                  <span className="text-xs sm:text-sm text-gray-500 ml-1">({upline.referralId})</span>
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-800 mb-3">
                {t("labels.yourDetails")}
              </label>

              {/* Participant Type */}
              <div className="mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t("labels.status")}
                  </label>
                  <select
                    value={participantType}
                    onChange={(e) => setParticipantType(e.target.value)}
                    className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="IN">{t("status.IN")}</option>
                    <option value="NRI">{t("status.NRI")}</option>
                    <option value="OCI">{t("status.OCI")}</option>
                    <option value="INTL">{t("status.INTL")}</option>
                  </select>
                </div>
              </div>

              {/* Reminder for international */}
              {isInternational && (
                <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
                  {t.rich("reminders.intlPayout", {
                    strong: (chunks) => <strong>{chunks}</strong>,
                  })}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("placeholders.fullName")}
                  className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    placeholder={t("placeholders.email")}
                    type="email"
                    className={`w-full rounded-2xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                      !emailTouched || emailValid
                        ? "border-gray-200 focus:ring-blue-500"
                        : "border-red-300 focus:ring-red-500"
                    }`}
                  />
                  {emailTouched && !emailValid && (
                    <p className="mt-1 text-xs text-red-600">{t("errors.emailInline")}</p>
                  )}
                </div>

                {/* Country code (compact) + Phone */}
                <div className="col-span-1 sm:col-span-2">
                  <div className="flex gap-2 items-stretch">
                    <PhoneCountryPicker
                      countries={countries}
                      value={country}
                      onChange={(c) => setCountry(c)}
                      t={(key) => t(key)}
                    />
                    <input
                      value={phoneLocal}
                      onChange={(e) => setPhoneLocal(e.target.value)}
                      inputMode="tel"
                      placeholder={t("placeholders.phone")}
                      className="flex-1 rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {t("hints.phoneSavedAs")}{" "}
                    <span className="font-mono text-gray-700">
                      {toE164(country?.dial, phoneLocal) || `${country?.dial || "+"}…`}
                    </span>{" "}
                    {t("hints.whatsappReady")}
                  </p>
                </div>

                {/* Residence Country + Nu Skin ID (international only) */}
                {isInternational && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t("labels.residenceCountry")}
                      </label>
                      <select
                        value={residence?.cc || ""}
                        onChange={(e) => {
                          const next = countries.find((c) => c.cc === e.target.value) || null;
                          setResidence(next);
                        }}
                        className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {countries.map((c) => (
                          <option key={c.cc} value={c.cc}>
                            {c.flag} {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t("labels.nuskinId")}
                      </label>
                      <input
                        value={nuskinId}
                        onChange={(e) => setNuskinId(e.target.value)}
                        placeholder={t("placeholders.nuskinId")}
                        className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </>
                )}

                {/* PAN (Indian National only) */}
                {!isInternational && (
                  <div>
                    <input
                      value={panInput}
                      onChange={(e) => onPanChange(e.target.value)}
                      placeholder={t("placeholders.pan")}
                      className={`w-full rounded-2xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                        !panCore || isValidPANCore(panCore)
                          ? "border-gray-200 focus:ring-blue-500"
                          : "border-red-300 focus:ring-red-500"
                      }`}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {t.rich("hints.panFormat", { mono: (c) => <span className="font-mono">{c}</span> })}
                    </p>
                    {panCore && !isValidPANCore(panCore) && (
                      <p className="mt-1 text-xs text-red-600">{t("errors.panInline")}</p>
                    )}
                  </div>
                )}

                {/* Password */}
                <div>
                  <div className="relative">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("placeholders.password")}
                      type={pwVisible ? "text" : "password"}
                      className="w-full rounded-2xl border border-gray-200 px-3 py-3 pr-24 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setPwVisible((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {pwVisible ? t("actions.hide") : t("actions.show")}
                    </button>
                  </div>

                  {/* Password strength */}
                  <div className="mt-2">
                    <div className="h-2 w-full rounded bg-gray-100 overflow-hidden">
                      <div
                        className={`h-2 transition-all ${
                          pwScore === 0
                            ? "w-0"
                            : pwScore === 1
                            ? "w-1/3 bg-red-500"
                            : pwScore === 2
                            ? "w-2/3 bg-amber-500"
                            : "w-full bg-green-600"
                        }`}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                      <Rule ok={hasMinLen(password)} label={t("pwRules.len")} />
                      <Rule ok={hasUpper(password)} label={t("pwRules.upper")} />
                      <Rule ok={hasNumber(password)} label={t("pwRules.number")} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={registerUser}
                  disabled={registering}
                  className="flex-1 rounded-2xl bg-green-600 text-white px-4 py-3 text-sm font-semibold hover:bg-green-700 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {registering ? t("actions.registering") : t("actions.registerLogin")}
                </button>
                <button
                  onClick={() => {
                    setStep(1);
                    setUpline(null);
                    setUplineInput("");
                    setNotice("");
                  }}
                  type="button"
                  className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:scale-[0.99] transition"
                >
                  {t("actions.back")}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Auth toggle helper */}
        <div className="mt-4 text-center text-sm text-gray-600">
          {t("already")}
          {" "}
          <a href={`/${locale}/login`} className="text-blue-600 hover:underline">
            {t("actions.login")}
          </a>
        </div>
      </div>
    </div>
  );

  function Rule({ ok, label }) {
    return (
      <div className="flex items-center gap-1">
        <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-green-600" : "bg-gray-300"}`} />
        <span className={`${ok ? "text-gray-800" : ""}`}>{label}</span>
      </div>
    );
  }
}

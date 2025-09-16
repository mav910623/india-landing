"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
    const ch = raw[i],
      idx = out.length;
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

const COUNTRIES = [
  { cc: "IN", flag: "🇮🇳", name: "India", dial: "+91", example: "9876543210" },
  { cc: "MY", flag: "🇲🇾", name: "Malaysia", dial: "+60", example: "123456789" },
  { cc: "SG", flag: "🇸🇬", name: "Singapore", dial: "+65", example: "81234567" },
  { cc: "AE", flag: "🇦🇪", name: "UAE", dial: "+971", example: "501234567" },
  { cc: "US", flag: "🇺🇸", name: "United States", dial: "+1", example: "4155551234" },
];

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
function guessDefaultCountry(local) {
  const digits = String(local || "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return COUNTRIES.find((c) => c.cc === "IN") || COUNTRIES[0];
  }
  return COUNTRIES[0];
}

/** =========================================================
 *  Page Component
 * ======================================================== */
export default function RegisterPage() {
  const router = useRouter();

  // ---------- Steps & Sponsor ----------
  const [step, setStep] = useState(1);
  const [uplineInput, setUplineInput] = useState("");
  const [upline, setUpline] = useState(null);
  const [checkingUpline, setCheckingUpline] = useState(false);
  const [refLocked, setRefLocked] = useState(false);

  // Capture ?ref=... without useSearchParams (avoids Suspense requirement)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const ref = (p.get("ref") || "").trim();
      if (ref) {
        const up = ref.toUpperCase();
        setUplineInput(up);
        setRefLocked(true);
        // Auto-verify upline on mount if ref present
        (async () => {
          setCheckingUpline(true);
          try {
            const qy = query(collection(db, "users"), where("referralId", "==", up), limit(1));
            const snap = await getDocs(qy);
            if (snap.empty) {
              setUpline(null);
              setNotice("❌ Upline not found. Please confirm the Referral ID with your sponsor.");
            } else {
              const sDoc = snap.docs[0];
              setUpline({ id: sDoc.id, ...sDoc.data() });
              setNotice(`✅ Upline found: ${sDoc.data().name} (${sDoc.data().referralId})`);
              setStep(2);
            }
          } catch (err) {
            console.error("Upline lookup error (auto):", err);
            setNotice("Error checking upline. Try again.");
            setUpline(null);
          } finally {
            setCheckingUpline(false);
          }
        })();
      }
    }
  }, []);

  // ---------- Form fields ----------
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);

  const [country, setCountry] = useState(COUNTRIES[0]);
  const [phoneLocal, setPhoneLocal] = useState("");

  const [panInput, setPanInput] = useState("");
  const [panCore, setPanCore] = useState("");

  const [password, setPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState("");

  // Bias India if phone looks like 10-digit local
  useEffect(() => {
    if (!phoneLocal) return;
    setCountry((prev) => prev ?? guessDefaultCountry(phoneLocal));
  }, [phoneLocal]);

  const emailValid = useMemo(() => isValidEmail(email), [email]);
  const pwScore = useMemo(() => passwordScore(password), [password]);
  const pwOk = pwScore === 3;

  // PAN mask handling
  function onPanChange(v) {
    const core = constrainPanCore(v);
    setPanCore(core);
    setPanInput(formatPanMasked(core));
  }

  // Step 1 — Verify upline
  const checkUpline = async () => {
    setNotice("");
    const id = String(uplineInput || "").trim().toUpperCase();
    if (!id) {
      setNotice("Please enter sponsor Referral ID.");
      return;
    }
    setCheckingUpline(true);
    try {
      const qy = query(collection(db, "users"), where("referralId", "==", id), limit(1));
      const snap = await getDocs(qy);
      if (snap.empty) {
        setUpline(null);
        setNotice("❌ Upline not found. Please confirm the Referral ID with your sponsor.");
        return;
      }
      const sDoc = snap.docs[0];
      setUpline({ id: sDoc.id, ...sDoc.data() });
      setNotice(`✅ Upline found: ${sDoc.data().name} (${sDoc.data().referralId})`);
      setStep(2);
    } catch (err) {
      console.error("Upline lookup error:", err);
      setNotice("Error checking upline. Try again.");
      setUpline(null);
    } finally {
      setCheckingUpline(false);
    }
  };

  // Step 2 — Register
  const registerUser = async () => {
    setNotice("");

    if (!upline?.id) {
      setNotice("Valid upline required.");
      setStep(1);
      return;
    }

    const nameNorm = String(name || "").trim();
    const emailNorm = String(email || "").trim().toLowerCase();
    const rawPhone = String(phoneLocal || "").trim();
    const e164 = toE164(country?.dial, phoneLocal);
    const panNorm = panCore;

    if (!nameNorm || !emailNorm || !rawPhone || !panNorm || !password) {
      setNotice("Please fill all fields.");
      return;
    }
    if (!emailValid) {
      setNotice("Please enter a valid email address.");
      return;
    }
    if (!isValidPANCore(panNorm)) {
      setNotice("PAN format invalid. Expected AAAAA-9999-A.");
      return;
    }
    if (!e164.startsWith("+")) {
      setNotice("Phone number looks invalid. Please check the country code and number.");
      return;
    }
    if (!pwOk) {
      setNotice("Password must be at least 8 characters, include a capital letter and a number.");
      return;
    }

    setRegistering(true);
    let createdAuthUser = null;

    try {
      // Email uniqueness
      const emailQ = query(collection(db, "users"), where("email", "==", emailNorm), limit(1));
      const emailSnap = await getDocs(emailQ);
      if (!emailSnap.empty) {
        setRegistering(false);
        setNotice("❌ This email is already registered.");
        return;
      }

      // Phone uniqueness
      const phoneQ = query(collection(db, "users"), where("phone", "==", e164), limit(1));
      const phoneSnap = await getDocs(phoneQ);
      if (!phoneSnap.empty) {
        setRegistering(false);
        setNotice("❌ This phone number is already registered.");
        return;
      }

      // PAN uniqueness
      const panQ = query(collection(db, "users"), where("pan", "==", panNorm), limit(1));
      const panSnap = await getDocs(panQ);
      if (!panSnap.empty) {
        setRegistering(false);
        setNotice("❌ This PAN is already registered.");
        return;
      }

      // Auth
      const userCredential = await createUserWithEmailAndPassword(auth, emailNorm, password);
      createdAuthUser = userCredential.user;
      const uid = createdAuthUser.uid;
      try {
        await updateProfile(createdAuthUser, { displayName: nameNorm });
      } catch {}

      // Referral ID
      const referralId = await generateUniqueReferralId(uid);

      // Atomic write
      const batch = writeBatch(db);
      const userRef = doc(db, "users", uid);
      batch.set(userRef, {
        uid,
        name: nameNorm,
        nameLC: nameNorm.toLowerCase(),
        email: emailNorm,
        phone: e164,
        phoneRaw: rawPhone,
        countryCode: country?.dial || "",
        pan: panNorm,
        referralId,
        upline: upline.id,
        referrals: [],
        createdAt: serverTimestamp(),
      });

      const sponsorRef = doc(db, "users", upline.id);
      batch.update(sponsorRef, { referrals: arrayUnion(uid) });

      await batch.commit();

      setNotice(`✅ Registered. Your Referral ID: ${referralId}`);
      router.push("/dashboard");

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
    } catch (err) {
      console.error("Registration error:", err);
      try {
        if (createdAuthUser?.delete) await createdAuthUser.delete();
      } catch {}
      setNotice(`❌ ${err?.message || "Registration failed. Try again."}`);
    } finally {
      setRegistering(false);
    }
  };

  const phoneExample = useMemo(
    () => (country ? `${country.dial} ${country.example}` : ""),
    [country]
  );

  /** =========================================================
   *  UI
   * ======================================================== */
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white">
      {/* Subtle ornaments */}
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
            India Pre-Registration
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Verify your sponsor and complete your details.
          </p>
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
            <span className={`px-2.5 py-1 rounded-full border ${step === 1 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50"}`}>
              1 · Sponsor
            </span>
            <span>→</span>
            <span className={`px-2.5 py-1 rounded-full border ${step === 2 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50"}`}>
              2 · Your details
            </span>
          </div>

          {step === 1 && (
            <section>
              <label className="block text-sm font-medium text-gray-800 mb-2">
                Step 1 — Sponsor Referral ID (required)
              </label>

              <div className="flex gap-2">
                <input
                  value={uplineInput}
                  onChange={(e) => setUplineInput(e.target.value.toUpperCase())}
                  placeholder="Enter sponsor Referral ID (e.g. NU12345)"
                  className="flex-1 rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={refLocked}
                />
                <button
                  onClick={checkUpline}
                  disabled={checkingUpline}
                  className="rounded-2xl bg-blue-600 text-white px-4 py-3 text-sm font-semibold hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {checkingUpline ? "Checking…" : "Verify"}
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                You must confirm your sponsor’s Referral ID before proceeding.
              </p>
            </section>
          )}

          {step === 2 && upline && (
            <section>
              <div className="mb-4">
                <div className="text-xs text-gray-500">Upline confirmed</div>
                <div className="text-base sm:text-lg font-medium text-gray-900">
                  {upline.name}{" "}
                  <span className="text-xs sm:text-sm text-gray-500 ml-1">
                    ({upline.referralId})
                  </span>
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-800 mb-3">
                Step 2 — Your details
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="Email address"
                    type="email"
                    className={`w-full rounded-2xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                      !emailTouched || emailValid
                        ? "border-gray-200 focus:ring-blue-500"
                        : "border-red-300 focus:ring-red-500"
                    }`}
                  />
                  {emailTouched && !emailValid && (
                    <p className="mt-1 text-xs text-red-600">Please enter a valid email.</p>
                  )}
                </div>

                <div className="col-span-1 sm:col-span-2">
                  <div className="flex gap-2">
                    <select
                      value={country?.cc}
                      onChange={(e) =>
                        setCountry(COUNTRIES.find((c) => c.cc === e.target.value) || COUNTRIES[0])
                      }
                      className="w-[46%] sm:w-52 rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Country code"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.cc} value={c.cc}>
                          {c.flag} {c.name} ({c.dial})
                        </option>
                      ))}
                    </select>

                    <input
                      value={phoneLocal}
                      onChange={(e) => setPhoneLocal(e.target.value)}
                      inputMode="numeric"
                      placeholder={`Phone number (e.g. ${country.example})`}
                      className="flex-1 rounded-2xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    We’ll save your number as{" "}
                    <span className="font-mono text-gray-700">
                      {toE164(country?.dial, phoneLocal) || `${country.dial}…`}
                    </span>{" "}
                    (WhatsApp-ready).
                  </p>
                </div>

                <div>
                  <input
                    value={panInput}
                    onChange={(e) => onPanChange(e.target.value)}
                    placeholder="PAN (AAAAA-9999-A)"
                    className={`w-full rounded-2xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                      !panCore || isValidPANCore(panCore)
                        ? "border-gray-200 focus:ring-blue-500"
                        : "border-red-300 focus:ring-red-500"
                    }`}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Format: <span className="font-mono">AAAAA-9999-A</span>
                  </p>
                  {panCore && !isValidPANCore(panCore) && (
                    <p className="mt-1 text-xs text-red-600">Invalid PAN pattern.</p>
                  )}
                </div>

                <div>
                  <div className="relative">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      type={pwVisible ? "text" : "password"}
                      className="w-full rounded-2xl border border-gray-200 px-3 py-3 pr-24 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setPwVisible((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {pwVisible ? "Hide" : "Show"}
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
                      <Rule ok={hasMinLen(password)} label="8+ chars" />
                      <Rule ok={hasUpper(password)} label="1 uppercase" />
                      <Rule ok={hasNumber(password)} label="1 number" />
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
                  {registering ? "Registering…" : "Register & Login"}
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
                  Back
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );

  function Rule({ ok, label }) {
    return (
      <div className="flex items-center gap-1">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            ok ? "bg-green-600" : "bg-gray-300"
          }`}
        />
        <span className={`${ok ? "text-gray-800" : ""}`}>{label}</span>
      </div>
    );
  }
}

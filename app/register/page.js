"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  updateDoc,
  arrayUnion,
  writeBatch,
  limit,
} from "firebase/firestore";

/** ---------------- ID + Validators ---------------- */

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

/** Email (simple + solid) */
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "").trim());

/** Password rules: ≥8, 1 uppercase, 1 number */
const hasMinLen = (p) => String(p || "").length >= 8;
const hasUpper  = (p) => /[A-Z]/.test(String(p || ""));
const hasNumber = (p) => /[0-9]/.test(String(p || ""));
const passwordScore = (p) => [hasMinLen(p), hasUpper(p), hasNumber(p)].filter(Boolean).length;

/** PAN mask + validate */
function unmaskPan(s) {
  return String(s || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function constrainPanCore(core) {
  const raw = unmaskPan(core).slice(0, 10);
  let out = "";
  for (let i = 0; i < raw.length && out.length < 10; i++) {
    const ch = raw[i];
    const idx = out.length;
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
  if (c.length <= 9) return `${c.slice(0,5)}-${c.slice(5)}`;
  return `${c.slice(0,5)}-${c.slice(5,9)}-${c.slice(9)}`;
}
const isValidPANCore = (core) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(core);

/** ---------------- Phone helpers ---------------- */

const COUNTRIES = [
  { cc: "IN", flag: "🇮🇳", name: "India", dial: "+91",  example: "9876543210" },
  { cc: "MY", flag: "🇲🇾", name: "Malaysia", dial: "+60", example: "123456789" },
  { cc: "SG", flag: "🇸🇬", name: "Singapore", dial: "+65", example: "81234567" },
  { cc: "AE", flag: "🇦🇪", name: "UAE", dial: "+971",   example: "501234567" },
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

/** ---------------- Component ---------------- */

export default function RegisterPage() {
  const [step, setStep] = useState(1);

  // Step 1: upline
  const [uplineInput, setUplineInput] = useState("");
  const [upline, setUpline] = useState(null);
  const [checkingUpline, setCheckingUpline] = useState(false);

  // Step 2: fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);

  const [country, setCountry] = useState(COUNTRIES[0]);
  const [phoneLocal, setPhoneLocal] = useState("");

  // PAN (masked input + core)
  const [panInput, setPanInput] = useState(""); // masked view (AAAAA-9999-A)
  const [panCore, setPanCore] = useState("");   // stored view (AAAAA9999A)

  // Password + UI
  const [password, setPassword] = useState("");
  const [pwVisible, setPwVisible] = useState(false);

  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState("");

  const searchParams = useSearchParams();
  const refLocked = !!searchParams.get("ref");
  const router = useRouter();

  /** Auto-capture ?ref= */
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (!ref) return;
    const up = String(ref).toUpperCase();
    setUplineInput(up);

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
  }, [searchParams]);

  /** Bias India if phone looks like 10-digit local */
  useEffect(() => {
    if (!phoneLocal) return;
    setCountry((prev) => prev ?? guessDefaultCountry(phoneLocal));
  }, [phoneLocal]);

  /** Email + password derived UI */
  const emailValid = useMemo(() => isValidEmail(email), [email]);
  const pwScore = useMemo(() => passwordScore(password), [password]);
  const pwOk = pwScore === 3;

  /** PAN change (masked) */
  function onPanChange(v) {
    const core = constrainPanCore(v);
    setPanCore(core);
    setPanInput(formatPanMasked(core));
  }

  /** Step 1 — Verify upline */
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

  /** Step 2 — Register */
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
    const panNorm = panCore; // normalized

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
      // Optional: PAN uniqueness
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
      try { await updateProfile(createdAuthUser, { displayName: nameNorm }); } catch {}

      // Referral
      const referralId = await generateUniqueReferralId(uid);

      // Atomic write
      const batch = writeBatch(db);
      const userRef = doc(db, "users", uid);
      batch.set(userRef, {
        uid,
        name: nameNorm,
        nameLC: nameNorm.toLowerCase(),
        email: emailNorm,
        phone: e164,            // WhatsApp-ready
        phoneRaw: rawPhone,     // original
        countryCode: country?.dial || "",
        pan: panNorm,           // stored normalized (no dashes)
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

      // Reset
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
      try { if (createdAuthUser?.delete) await createdAuthUser.delete(); } catch {}
      setNotice(`❌ ${err?.message || "Registration failed. Try again."}`);
    } finally {
      setRegistering(false);
    }
  };

  /** Derived UI bits */
  const phoneExample = useMemo(
    () => country ? `${country.dial} ${country.example}` : "",
    [country]
  );
  const pwScoreVal = pwScore; // alias for readability

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:py-10">
        {/* Header */}
        <header className="mb-6 sm:mb-8 text-center">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">
            India Pre-Registration
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Verify your sponsor and complete your details.
          </p>
        </header>

        <div className="rounded-2xl border border-gray-100 bg-white/80 shadow-sm p-4 sm:p-6">
          {/* Notice */}
          {notice && (
            <div
              className={
                notice.startsWith("✅")
                  ? "mb-4 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800 border border-green-200"
                  : "mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 border border-red-200"
              }
            >
              {notice}
            </div>
          )}

          {/* STEP 1 — Upline */}
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
                  className="flex-1 rounded-xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={refLocked}
                />
                <button
                  onClick={checkUpline}
                  disabled={checkingUpline}
                  className="rounded-xl bg-blue-600 text-white px-4 py-3 text-sm font-medium hover:bg-blue-700 active:scale-[0.99] transition disabled:opacity-60"
                >
                  {checkingUpline ? "Checking…" : "Verify"}
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                You must confirm your sponsor’s Referral ID before proceeding.
              </p>
            </section>
          )}

          {/* STEP 2 — Details */}
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
                {/* Name */}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* Email with live validation */}
                <div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="Email address"
                    type="email"
                    className={`w-full rounded-xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
                      !emailTouched || emailValid
                        ? "border-gray-200 focus:ring-blue-500"
                        : "border-red-300 focus:ring-red-500"
                    }`}
                  />
                  {emailTouched && !emailValid && (
                    <p className="mt-1 text-xs text-red-600">Please enter a valid email.</p>
                  )}
                </div>

                {/* Phone group */}
                <div className="col-span-1 sm:col-span-2">
                  <div className="flex gap-2">
                    <select
                      value={country?.cc}
                      onChange={(e) =>
                        setCountry(COUNTRIES.find((c) => c.cc === e.target.value) || COUNTRIES[0])
                      }
                      className="w-[46%] sm:w-48 rounded-xl border border-gray-200 px-3 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      className="flex-1 rounded-xl border border-gray-200 px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

                {/* PAN masked */}
                <div>
                  <input
                    value={panInput}
                    onChange={(e) => onPanChange(e.target.value)}
                    placeholder="PAN (AAAAA-9999-A)"
                    className={`w-full rounded-xl border px-3 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
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

                {/* Password with show/hide + strength */}
                <div>
                  <div className="relative">
                    <input
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      type={pwVisible ? "text" : "password"}
                      className="w-full rounded-xl border border-gray-200 px-3 py-3 pr-20 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setPwVisible((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      {pwVisible ? "Hide" : "Show"}
                    </button>
                  </div>

                  {/* Strength meter */}
                  <div className="mt-2">
                    <div className="h-2 w-full rounded bg-gray-100 overflow-hidden">
                      <div
                        className={`h-2 transition-all ${
                          pwScoreVal === 0
                            ? "w-0"
                            : pwScoreVal === 1
                            ? "w-1/3 bg-red-500"
                            : pwScoreVal === 2
                            ? "w-2/3 bg-amber-500"
                            : "w-full bg-green-600"
                        }`}
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                      <Rule ok={hasMinLen(password)} label="8+ chars" />
                      <Rule ok={hasUpper(password)}  label="1 uppercase" />
                      <Rule ok={hasNumber(password)} label="1 number" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={registerUser}
                  disabled={registering}
                  className="flex-1 rounded-xl bg-green-600 text-white px-4 py-3 text-sm font-semibold hover:bg-green-700 active:scale-[0.99] transition disabled:opacity-60"
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
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 active:scale-[0.99] transition"
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

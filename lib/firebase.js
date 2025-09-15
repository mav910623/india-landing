// lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBBf4hTT9gm5DYCxpWsSd6fsw_HxFQv8jE",
  authDomain: "nuvantage-india.firebaseapp.com",
  projectId: "nuvantage-india",
  storageBucket: "nuvantage-india.firebasestorage.app",
  messagingSenderId: "240878982536",
  appId: "1:240878982536:web:f7b6902408208b7739d63d"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Auth + Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = () => {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
};

let app = null;
let auth = null;
let googleProvider = null;

if (isFirebaseConfigured()) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
  } catch (err) {
    console.error('[firebase] Error initializing Firebase client:', err);
  }
}

/**
 * Send Email OTP (Sign-In Link) via Firebase Email Link Authentication
 * User receives a magic link on their email to verify
 */
export async function sendEmailOtp(email) {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('Firebase credentials are not configured in frontend/.env. Set VITE_FIREBASE_API_KEY & VITE_FIREBASE_PROJECT_ID, or use Google Authentication.');
  }

  const actionCodeSettings = {
    // URL where Firebase redirects after clicking the email link
    url: `${window.location.origin}/verify-email-otp`,
    handleCodeInApp: true,
  };

  try {
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    // Save email locally so we can complete sign-in after redirect
    window.localStorage.setItem('emailForSignIn', email);
  } catch (error) {
    console.error('[firebase] Error sending Email OTP link:', error);
    throw error;
  }
}

/**
 * Verify Email OTP link (called after user clicks the email link)
 * Pass the full window.location.href as emailLink
 */
export async function verifyEmailOtp(email, emailLink) {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('Firebase Auth is not initialized.');
  }

  if (!isSignInWithEmailLink(auth, emailLink)) {
    throw new Error('Invalid or expired email verification link.');
  }

  try {
    const result = await signInWithEmailLink(auth, email, emailLink);
    const token = await result.user.getIdToken();
    window.localStorage.removeItem('emailForSignIn');
    return { user: result.user, idToken: token };
  } catch (error) {
    console.error('[firebase] Error verifying Email OTP link:', error);
    throw error;
  }
}

/**
 * Check if current URL is an email sign-in link
 */
export function isEmailSignInLink(url) {
  if (!auth) return false;
  return isSignInWithEmailLink(auth, url || window.location.href);
}

/**
 * Sign in / Register with Google via Firebase
 */
export async function signInWithGoogle() {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('Firebase credentials are not configured in frontend/.env. Set VITE_FIREBASE_API_KEY & VITE_FIREBASE_PROJECT_ID to enable Google Authentication.');
  }

  const provider = googleProvider || new GoogleAuthProvider();
  try {
    const userCredential = await signInWithPopup(auth, provider);
    const token = await userCredential.user.getIdToken();
    return {
      user: userCredential.user,
      idToken: token,
      email: userCredential.user.email,
      name: userCredential.user.displayName,
      phone: userCredential.user.phoneNumber
    };
  } catch (error) {
    console.error('[firebase] Google authentication error:', error);
    throw error;
  }
}

/**
 * Sign up with Email + Password via Firebase
 */
export async function registerWithFirebaseEmail(email, password) {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('Firebase credentials are not configured in frontend/.env.');
  }
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await sendEmailVerification(userCredential.user);
  } catch {}
  const token = await userCredential.user.getIdToken();
  return { user: userCredential.user, idToken: token };
}

/**
 * Log in with Email + Password via Firebase
 */
export async function signInWithFirebaseEmail(email, password) {
  if (!isFirebaseConfigured() || !auth) {
    throw new Error('Firebase credentials are not configured in frontend/.env.');
  }
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const token = await userCredential.user.getIdToken();
  return { user: userCredential.user, idToken: token };
}

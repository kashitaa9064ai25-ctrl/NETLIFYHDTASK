import React, { createContext, useContext, useState, useEffect } from "react";
import { auth, db, googleProvider } from "../firebase";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    sendEmailVerification,
    updateProfile,
    onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userPlan, setUserPlan] = useState("Free");
    const [isTrialActive, setIsTrialActive] = useState(false);
    const [trialExpiresAt, setTrialExpiresAt] = useState(null);
    const [loading, setLoading] = useState(true);

    // Sync user doc and automatically evaluate trial expiration dates
    const syncUserDoc = async (user, additionalData = {}) => {
        if (!user || !user.uid) return "Free";
        try {
            const userDocRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists()) {
                const data = userSnap.data();
                let plan = data.plan || "Free";

                // Check trial status
                if (data.isTrial && data.trialExpiresAt) {
                    const now = new Date();
                    const expiry = new Date(data.trialExpiresAt);

                    if (now > expiry) {
                        // Trial has expired — automatically revert to Free
                        plan = "Free";
                        await updateDoc(userDocRef, { plan: "Free", isTrial: false });
                        setIsTrialActive(false);
                        setTrialExpiresAt(null);
                    } else {
                        setIsTrialActive(true);
                        setTrialExpiresAt(data.trialExpiresAt);
                    }
                }

                setUserPlan(plan);
                localStorage.setItem("deakin_plan", plan);
                return plan;
            } else {
                const initialPlan = "Free";
                await setDoc(userDocRef, {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || additionalData.displayName || "",
                    plan: initialPlan,
                    trialUsed: false,
                    isTrial: false,
                    createdAt: new Date().toISOString(),
                    ...additionalData
                });
                setUserPlan(initialPlan);
                localStorage.setItem("deakin_plan", initialPlan);
                return initialPlan;
            }
        } catch (err) {
            console.warn("Could not sync remote Firestore user doc:", err);
            return "Free";
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                if (firebaseUser && firebaseUser.emailVerified) {
                    const token = await firebaseUser.getIdToken();
                    const userData = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email,
                        displayName: firebaseUser.displayName || "",
                        photoURL: firebaseUser.photoURL || null
                    };

                    const plan = await syncUserDoc(firebaseUser);

                    setCurrentUser(userData);
                    localStorage.setItem("deakin_token", token);
                    localStorage.setItem("deakin_user", JSON.stringify(userData));
                    localStorage.setItem("deakin_plan", plan);
                } else {
                    setCurrentUser(null);
                    setUserPlan("Free");
                    setIsTrialActive(false);
                    setTrialExpiresAt(null);
                    localStorage.removeItem("deakin_token");
                    localStorage.removeItem("deakin_user");
                    localStorage.removeItem("deakin_plan");
                }
            } catch (err) {
                console.error("Error evaluating auth state change:", err);
            } finally {
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const registerWithEmail = async (email, password, displayName) => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName) await updateProfile(cred.user, { displayName });
        await sendEmailVerification(cred.user);
        await syncUserDoc(cred.user, { displayName });
        await signOut(auth);
        return cred.user;
    };

    const loginWithEmail = async (email, password) => {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (!cred.user.emailVerified) {
            await signOut(auth);
            const error = new Error("This email is not yet verified. Please verify in your inbox before logging in.");
            error.code = "auth/unverified-email";
            throw error;
        }
        await syncUserDoc(cred.user);
        return cred.user;
    };

    const loginWithGoogle = async () => {
        const result = await signInWithPopup(auth, googleProvider);
        await syncUserDoc(result.user, {
            displayName: result.user.displayName,
            emailVerified: true
        });
        return result.user;
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.warn("SignOut error:", e);
        }
        localStorage.clear();
        setCurrentUser(null);
        setUserPlan("Free");
        setIsTrialActive(false);
    };

    const upgradeToPaid = async () => {
        if (!currentUser?.uid) throw new Error("No authenticated user found.");
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, {
            plan: "Paid",
            isTrial: false,
            upgradedAt: new Date().toISOString()
        });
        setUserPlan("Paid");
        setIsTrialActive(false);
        localStorage.setItem("deakin_plan", "Paid");
        return true;
    };

    // 7-Day Trial Activation
    const startFreeTrial = async () => {
        if (!currentUser?.uid) throw new Error("Please log in first.");
        const res = await fetch(`/api/users/${currentUser.uid}/start-trial`, {
            method: "POST"
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || "Failed to start trial.");

        setUserPlan("Paid");
        setIsTrialActive(true);
        setTrialExpiresAt(data.trialExpiresAt);
        localStorage.setItem("deakin_plan", "Paid");
        return true;
    };

    return (
        <AuthContext.Provider
            value={{
                currentUser,
                userPlan,
                isTrialActive,
                trialExpiresAt,
                registerWithEmail,
                loginWithEmail,
                loginWithGoogle,
                logout,
                upgradeToPaid,
                startFreeTrial,
                loading
            }}
        >
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
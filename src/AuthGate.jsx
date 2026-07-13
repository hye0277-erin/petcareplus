import React, { useEffect, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase.js";
import { createFirestoreStorage, createStructuredStorage } from "./firestore-storage.js";
import App, { StartScreen } from "../petcare-app.jsx";

export default function AuthGate() {
  const [user, setUser] = useState(undefined); // undefined: 확인 중, null: 로그아웃 상태
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      if (u) {
        window.storage = createFirestoreStorage(u.uid);
        window.structuredStorage = createStructuredStorage(u.uid);
      }
      setUser(u);
    });
  }, []);

  const handleLogin = async () => {
    setError("");
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error(e);
      setError(`로그인에 실패했어요 (${e.code || e.message}). 잠시 후 다시 시도해주세요.`);
    } finally {
      setSigningIn(false);
    }
  };

  if (user === undefined) {
    return (
      <div style={styles.wrap}>
        <div style={{ color: "#8B9A93", fontSize: 14 }}>불러오는 중…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <StartScreen onStart={handleLogin} startLabel={signingIn ? "로그인 중…" : "Google로 시작하기"} />
        {error && (
          <div style={styles.errorToast}>{error}</div>
        )}
      </>
    );
  }

  return <App onLogout={() => signOut(auth)} userEmail={user.email} />;
}

const styles = {
  wrap: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#F4F6F2",
    fontFamily: "'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
  },
  errorToast: {
    position: "fixed",
    left: "50%",
    bottom: 96,
    transform: "translateX(-50%)",
    zIndex: 20,
    background: "#E0554F",
    color: "#fff",
    fontSize: 12.5,
    padding: "10px 16px",
    borderRadius: 10,
    boxShadow: "0 8px 20px rgba(0,0,0,.2)",
    whiteSpace: "nowrap",
  },
};

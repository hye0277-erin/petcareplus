import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase.js";

// window.storage 인터페이스({get,set,delete})와 동일한 모양으로
// Firestore를 사용자별(users/{uid}/data/{key}) 문서에 저장한다.
export function createFirestoreStorage(uid) {
  const ref = (key) => doc(db, "users", uid, "data", key);
  return {
    async get(key) {
      const snap = await getDoc(ref(key));
      if (!snap.exists()) return null;
      return { value: snap.data().value };
    },
    async set(key, value) {
      await setDoc(ref(key), { value });
      return true;
    },
    async delete(key) {
      await deleteDoc(ref(key));
      return true;
    },
  };
}

import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase.js";

// window.storage 인터페이스({get,set,delete})와 동일한 모양으로
// Firestore를 사용자별(users/{uid}/data/{key}) 문서에 저장한다.
// 사진/PDF처럼 원래부터 항목별로 나뉘어 저장되는 데이터에 계속 사용한다.
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

/* ─────────────────────────────────────────────
   구조화 저장소: 앱 전체 상태를 문서 하나에 몰아넣는 대신
   컬렉션별(레코드/루틴/병원기록 등 항목 단위) 문서로 나눠 저장한다.
   - Firestore 문서 1MB 한도를 피할 수 있음
   - 항목 하나만 바뀌어도 전체를 다시 쓰지 않고 바뀐 문서만 반영
   ───────────────────────────────────────────── */
const LIST_COLLECTIONS = ["records", "routines", "vetVisits", "nextVisits"];
const DATE_MAP_COLLECTIONS = ["checkLogs", "conditionLogs"];
const BATCH_CHUNK = 400; // Firestore 배치 한도(500) 아래로 여유 있게

async function commitInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_CHUNK) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_CHUNK).forEach((op) => op(batch));
    await batch.commit();
  }
}

export function createStructuredStorage(uid) {
  const col = (name) => collection(db, "users", uid, name);
  const docRef = (name, id) => doc(db, "users", uid, name, id);

  return {
    // 구조화 저장소에 데이터가 없으면 null (아직 마이그레이션 전인 계정)
    async loadAll() {
      const profileSnap = await getDoc(docRef("profile", "main"));
      if (!profileSnap.exists()) return null;

      const listSnaps = await Promise.all(LIST_COLLECTIONS.map((name) => getDocs(col(name))));
      const dateMapSnaps = await Promise.all(DATE_MAP_COLLECTIONS.map((name) => getDocs(col(name))));

      const result = { ...profileSnap.data() };
      LIST_COLLECTIONS.forEach((name, i) => { result[name] = listSnaps[i].docs.map((d) => d.data()); });
      DATE_MAP_COLLECTIONS.forEach((name, i) => {
        const map = {};
        dateMapSnaps[i].docs.forEach((d) => { map[d.id] = d.data(); });
        result[name] = map;
      });
      return result;
    },

    // prev(마지막으로 저장 성공한 상태)와 next(지금 저장할 상태)를 비교해
    // 바뀐 문서만 배치로 반영한다. prev가 없으면 전체를 새로 씀(최초 마이그레이션).
    async saveDiff(prev, next) {
      const ops = [];

      const prevProfile = prev ? { pet: prev.pet, settings: prev.settings } : undefined;
      const nextProfile = { pet: next.pet ?? null, settings: next.settings ?? {} };
      if (JSON.stringify(prevProfile) !== JSON.stringify(nextProfile)) {
        ops.push((batch) => batch.set(docRef("profile", "main"), nextProfile));
      }

      LIST_COLLECTIONS.forEach((name) => {
        const prevMap = new Map((prev?.[name] || []).map((x) => [x.id, x]));
        const nextList = next[name] || [];
        const nextIds = new Set();
        nextList.forEach((item) => {
          if (!item.id) return; // id 없는 항목은 저장 불가 — 상위에서 항상 id를 부여해야 함
          nextIds.add(item.id);
          if (JSON.stringify(prevMap.get(item.id)) !== JSON.stringify(item)) {
            ops.push((batch) => batch.set(docRef(name, item.id), item));
          }
        });
        for (const id of prevMap.keys()) {
          if (!nextIds.has(id)) ops.push((batch) => batch.delete(docRef(name, id)));
        }
      });

      DATE_MAP_COLLECTIONS.forEach((name) => {
        const prevMap = prev?.[name] || {};
        const nextMap = next[name] || {};
        const dateKeys = new Set([...Object.keys(prevMap), ...Object.keys(nextMap)]);
        for (const dt of dateKeys) {
          if (JSON.stringify(prevMap[dt]) !== JSON.stringify(nextMap[dt])) {
            if (nextMap[dt]) ops.push((batch) => batch.set(docRef(name, dt), nextMap[dt]));
            else ops.push((batch) => batch.delete(docRef(name, dt)));
          }
        }
      });

      if (ops.length) await commitInChunks(db, ops);
      return true;
    },
  };
}

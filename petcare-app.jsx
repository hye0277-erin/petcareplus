import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import logoUrl from "./images/logo.svg";
import startDogUrl from "./images/start-dog-wide.webp";
import {
  Sun, ClipboardList, BarChart3, Stethoscope, Settings, PawPrint,
  Pill, Utensils, Droplets, Syringe, Footprints, ClipboardCheck, StickyNote,
  Check, Download, Upload, Pencil, Trash2, Plus, CalendarClock, Building2, X,
  Star, Wind, Scale, ChevronRight, Activity, Camera, Bell, BellOff,
  SlidersHorizontal, Share2, ShieldCheck,
} from "lucide-react";

/* ─────────────────────────────────────────────
   PWA 설치(홈 화면에 추가) 프롬프트
   beforeinstallprompt는 컴포넌트 마운트 전에 발생할 수 있어 모듈 스코프에서 캡처
   ───────────────────────────────────────────── */
let deferredInstallPrompt = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    window.dispatchEvent(new Event("pcplus-install-ready"));
  });
}

/* ─────────────────────────────────────────────
   저장 계층 (실서비스 배포 시 IndexedDB로 교체)
   ───────────────────────────────────────────── */
const STORE_KEY = "petcare-v2";

async function loadRaw() {
  try {
    const r = await window.storage.get(STORE_KEY);
    if (r && r.value) return JSON.parse(r.value);
  } catch (e) { /* 최초 실행 */ }
  return null;
}
async function saveData(data) {
  try { await window.storage.set(STORE_KEY, JSON.stringify(data)); return true; }
  catch (e) { console.error("저장 실패", e); return false; }
}

/* ───────────── 유틸 ───────────── */
const dstr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => dstr(new Date());
const offsetDate = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00"); d.setDate(d.getDate() + n); return dstr(d); };
const nowTime = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 86400000);
const fmtDate = (s) => { const [, m, d] = s.split("-"); return `${parseInt(m)}월 ${parseInt(d)}일`; };
const fmtShort = (s) => { const [, m, d] = s.split("-"); return `${parseInt(m)}/${parseInt(d)}`; };
const uid = () => Math.random().toString(36).slice(2, 9);

/* 한글 조합(IME) 보호 입력: 글자 조합 중에는 React가 입력창 값을 덮어쓰지 않도록 함
   (안드로이드 천지인 등에서 controlled input이 조합을 끊는 문제 해결) */
function KInput({ value, onChange, ...props }) {
  const ref = useRef(null);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current && ref.current && ref.current.value !== (value ?? "")) {
      ref.current.value = value ?? "";
    }
  }, [value]);
  return (
    <input
      ref={ref}
      defaultValue={value ?? ""}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => { composing.current = false; onChange && onChange(e); }}
      onInput={(e) => { onChange && onChange(e); }}
      {...props}
    />
  );
}

/* 연도를 바로 고를 수 있는 년/월/일 드롭다운 날짜 선택기 (달력을 여러 번 넘길 필요 없음) */
/* 오전/오후·시·분을 각각 따로 고르는 시간 선택기 (하나 고르면 다른 항목으로 자동 이동하지 않음) */
function KTimeSelect({ value, onChange }) {
  const [hh, mm] = (value || "09:00").split(":").map(Number);
  const period = hh < 12 ? "오전" : "오후";
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;

  const toValue = (per, h12, minute) => {
    let h24 = h12 % 12;
    if (per === "오후") h24 += 12;
    return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const selStyle = { ...S.input, marginBottom: 0, padding: "11px 4px", textAlign: "center" };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select style={{ ...selStyle, flex: 1 }} value={period} onChange={(e) => onChange(toValue(e.target.value, hour12, mm))}>
        <option value="오전">오전</option>
        <option value="오후">오후</option>
      </select>
      <select style={{ ...selStyle, flex: 1 }} value={hour12} onChange={(e) => onChange(toValue(period, parseInt(e.target.value, 10), mm))}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h}시</option>)}
      </select>
      <select style={{ ...selStyle, flex: 1 }} value={mm} onChange={(e) => onChange(toValue(period, hour12, parseInt(e.target.value, 10)))}>
        {Array.from({ length: 60 }, (_, i) => i).map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}분</option>)}
      </select>
    </div>
  );
}

/* 년/월/일 셀렉트 박스 방식 날짜 선택기 (달력 대신 목록에서 바로 고르는 방식) */
function KDateSelect({ value, onChange, min, max }) {
  const [open, setOpen] = useState(false);
  const base = value || todayStr();
  const [y, m, d] = base.split("-").map(Number);
  const minY = min ? parseInt(min.split("-")[0], 10) : y - 25;
  const maxY = max ? parseInt(max.split("-")[0], 10) : y + 5;
  const years = [];
  for (let yy = maxY; yy >= minY; yy--) years.push(yy);
  const daysInMonth = new Date(y, m, 0).getDate();

  const clamp = (yy, mm, dd) => {
    const dim = new Date(yy, mm, 0).getDate();
    let s = `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(dd, dim)).padStart(2, "0")}`;
    if (min && s < min) s = min;
    if (max && s > max) s = max;
    return s;
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ ...S.input, marginBottom: 0, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", background: "#FFF" }}>
        <span style={{ fontWeight: 500, color: "#1F2E26" }}>{y}년 {m}월 {d}일</span>
        <Pencil size={14} color="#9AA5A0" />
      </button>
    );
  }

  const selStyle = { ...S.input, marginBottom: 0, padding: "11px 6px", textAlign: "center" };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select style={{ ...selStyle, flex: 1.3 }} value={y} onChange={(e) => onChange(clamp(parseInt(e.target.value, 10), m, d))}>
        {years.map((yy) => <option key={yy} value={yy}>{yy}년</option>)}
      </select>
      <select style={{ ...selStyle, flex: 1 }} value={m} onChange={(e) => onChange(clamp(y, parseInt(e.target.value, 10), d))}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((mm) => <option key={mm} value={mm}>{mm}월</option>)}
      </select>
      <select style={{ ...selStyle, flex: 1 }} value={d} onChange={(e) => onChange(clamp(y, m, parseInt(e.target.value, 10)))}>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dd) => <option key={dd} value={dd}>{dd}일</option>)}
      </select>
      <button type="button" onClick={() => setOpen(false)} style={{ ...S.chip, flexShrink: 0, padding: "0 12px" }}>완료</button>
    </div>
  );
}

/* 달력형 날짜 선택기: 상단 연도를 누르면 연도 목록으로 전환해 빠르게 이동 가능 */
const WD_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
function KCalendar({ value, onChange, min, max }) {
  const base = value || todayStr();
  const [by, bm] = base.split("-").map(Number);
  const [viewY, setViewY] = useState(by);
  const [viewM, setViewM] = useState(bm); // 1~12
  const [mode, setMode] = useState("days"); // days | years
  const [yearPage, setYearPage] = useState(Math.floor(by / 12) * 12);

  const minD = min || "0001-01-01";
  const maxD = max || "9999-12-31";
  const fmt = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const openYears = () => { setYearPage(Math.floor(viewY / 12) * 12); setMode("years"); };
  const prevMonth = () => { if (viewM === 1) { setViewY(viewY - 1); setViewM(12); } else setViewM(viewM - 1); };
  const nextMonth = () => { if (viewM === 12) { setViewY(viewY + 1); setViewM(1); } else setViewM(viewM + 1); };

  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  const firstDow = new Date(viewY, viewM - 1, 1).getDay();
  const cells = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const navBtn = { width: 30, height: 30, borderRadius: 8, border: "none", background: "#F0F3F0", color: "#556158", fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

  return (
    <div style={{ ...S.card, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" style={navBtn} onClick={() => (mode === "days" ? prevMonth() : setYearPage(yearPage - 12))}>‹</button>
        {mode === "days" ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <button type="button" onClick={openYears}
              style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15, color: "#2F5E45", padding: "2px 4px", textDecoration: "underline", textUnderlineOffset: 3 }}>
              {viewY}년
            </button>
            <span style={{ fontWeight: 600, fontSize: 14, color: "#1F2E26" }}>{viewM}월</span>
          </div>
        ) : (
          <span style={{ fontWeight: 700, fontSize: 14, color: "#1F2E26" }}>{yearPage}년 - {yearPage + 11}년</span>
        )}
        <button type="button" style={navBtn} onClick={() => (mode === "days" ? nextMonth() : setYearPage(yearPage + 12))}>›</button>
      </div>

      {mode === "days" ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", textAlign: "center", fontSize: 11, color: "#9AA5A0", marginBottom: 4 }}>
            {WD_LABELS.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const ds = fmt(viewY, viewM, d);
              const disabled = ds < minD || ds > maxD;
              const selected = ds === base;
              const isToday = ds === todayStr();
              return (
                <button key={i} type="button" disabled={disabled} onClick={() => onChange(ds)}
                  style={{
                    aspectRatio: "1", border: isToday && !selected ? "1.5px solid #3E7C59" : "1.5px solid transparent", borderRadius: 8,
                    cursor: disabled ? "default" : "pointer", background: selected ? "#3E7C59" : "transparent",
                    color: disabled ? "#D7DDD8" : selected ? "#FFF" : "#1F2E26", fontWeight: selected ? 700 : 400, fontSize: 13,
                  }}>
                  {d}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {Array.from({ length: 12 }, (_, i) => yearPage + i).map((yy) => {
            const disabled = `${yy}-12-31` < minD || `${yy}-01-01` > maxD;
            return (
              <button key={yy} type="button" disabled={disabled} onClick={() => { setViewY(yy); setMode("days"); }}
                style={{ padding: "10px 0", borderRadius: 9, border: yy === viewY ? "2px solid #3E7C59" : "1px solid #E5EAE6",
                  background: yy === viewY ? "#EAF3EC" : "#FFF", color: disabled ? "#C9CFCA" : "#1F2E26", fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer" }}>
                {yy}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KTextarea({ value, onChange, ...props }) {
  const ref = useRef(null);
  const composing = useRef(false);
  useEffect(() => {
    if (!composing.current && ref.current && ref.current.value !== (value ?? "")) {
      ref.current.value = value ?? "";
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      defaultValue={value ?? ""}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={(e) => { composing.current = false; onChange && onChange(e); }}
      onInput={(e) => { onChange && onChange(e); }}
      {...props}
    />
  );
}

/* 화면 폭 감지: 900px 이상이면 PC 레이아웃 (사이드 메뉴 + 넓은 콘텐츠) */
function useIsDesktop() {
  const [desktop, setDesktop] = useState(typeof window !== "undefined" && window.innerWidth >= 900);
  useEffect(() => {
    const onResize = () => setDesktop(window.innerWidth >= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return desktop;
}

const minutesDiff = (t1, t2) => { const [h1, m1] = t1.split(":").map(Number); const [h2, m2] = t2.split(":").map(Number); return (h2 * 60 + m2) - (h1 * 60 + m1); };

/* 알림음 (짧은 2음) — 소리 재생이 차단된 환경에서는 조용히 무시 */
function playAlarmSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [1174, 0.18]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.3);
    });
  } catch { /* 무시 */ }
}

/* 프로필 사진: 정사각형 크롭 + 축소 압축 후 데이터로 저장 */
function compressImage(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = max; canvas.height = max;
        canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, max, max);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* 첨부 사진(증상/진료 기록용): 비율 유지 축소 압축 */
function compressPhoto(file, maxSide = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSide) { height = Math.round(height * (maxSide / width)); width = maxSide; }
        else if (height >= width && height > maxSide) { width = Math.round(width * (maxSide / height)); height = maxSide; }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* 사진 여러 장 첨부 위젯 (증상 기록, 진료 기록 공용) */
/* 사진 분리 저장: 사진은 본문 데이터와 별도 키에 저장해 용량 한도를 피함 */
const photoCache = new Map();
const photoKey = (id) => `petcare-photo-${id}`;
async function savePhotoData(id, dataUrl) {
  try { await window.storage.set(photoKey(id), dataUrl); photoCache.set(id, dataUrl); return true; }
  catch { return false; }
}
async function loadPhotoData(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  try {
    const r = await window.storage.get(photoKey(id));
    if (r && r.value) { photoCache.set(id, r.value); return r.value; }
  } catch { /* 없음 */ }
  return null;
}
async function deletePhotoData(id) {
  try { await window.storage.delete(photoKey(id)); } catch { /* 무시 */ }
  photoCache.delete(id);
  videoHandleCache.delete(id);
}

/* 영상은 파일 자체를 저장하지 않고, 첫 장면 썸네일 + "이 파일을 다시 열어도 되는 권한(핸들)"만 기억해요.
   핸들은 이 세션 동안만 메모리에 남아요(새로고침하면 사라짐 — 실제 배포 시 IndexedDB에 저장하면 새로고침 후에도 유지 가능).
   원본 영상을 갤러리에서 지우거나 옮기면, 나중에 재생 시도할 때 실패로 감지돼요. */
const videoHandleCache = new Map(); // id -> FileSystemFileHandle
const VIDEO_PREFIX = "vid_";

function captureVideoThumb(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.src = url;
    video.onloadeddata = () => { video.currentTime = Math.min(0.5, (video.duration || 1) / 2); };
    video.onseeked = () => {
      try {
        const scale = Math.min(1, 480 / video.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("영상을 읽을 수 없어요")); };
  });
}

/* 실제 갤러리 파일 선택창(다시 열기 권한을 함께 받아둠). 미지원 브라우저는 null 반환 */
async function pickVideoHandle() {
  if (!window.showOpenFilePicker) return null;
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "동영상", accept: { "video/*": [".mp4", ".mov", ".webm", ".m4v"] } }],
      multiple: false,
    });
    return handle;
  } catch (e) {
    if (e?.name === "AbortError") return "cancelled";
    return null;
  }
}

/* 편집용: 사진/영상 항목 목록의 신규분 저장 + 삭제분 정리 후 id 배열 반환 */
async function persistPhotoItems(items, originalIds = []) {
  const ids = [];
  for (const item of items) {
    if (item.id) { ids.push(item.id); continue; }
    const id = (item.kind === "video" ? VIDEO_PREFIX : "") + uid();
    await savePhotoData(id, item.src);
    if (item.kind === "video" && item.handle) videoHandleCache.set(id, item.handle);
    ids.push(id);
  }
  for (const oid of originalIds) if (!ids.includes(oid)) await deletePhotoData(oid);
  return ids;
}

/* 저장된 사진/영상 썸네일 표시. 영상은 재생 아이콘이 겹쳐 보여요 */
function StoredPhoto({ pid, size = 44, radius = 8, onClick, onPlayVideo }) {
  const [src, setSrc] = useState(photoCache.get(pid) || null);
  const isVideo = pid.startsWith(VIDEO_PREFIX);
  useEffect(() => {
    let live = true;
    if (!photoCache.has(pid)) loadPhotoData(pid).then((v) => { if (live) setSrc(v); });
    else setSrc(photoCache.get(pid));
    return () => { live = false; };
  }, [pid]);
  if (!src) return <div style={{ width: size, height: size, borderRadius: radius, background: "#EEF1EE", flexShrink: 0 }} />;
  const handleClick = () => { if (isVideo && onPlayVideo) onPlayVideo(pid); else if (onClick) onClick(src); };
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, cursor: onClick || onPlayVideo ? "pointer" : "default" }} onClick={handleClick}>
      <img src={src} alt="" style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", border: "1px solid #E5EAE6", display: "block" }} />
      {isVideo && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: size * 0.42, height: size * 0.42, borderRadius: "50%", background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 0, height: 0, marginLeft: 2, borderTop: `${size * 0.11}px solid transparent`, borderBottom: `${size * 0.11}px solid transparent`, borderLeft: `${size * 0.16}px solid #FFF` }} />
          </div>
        </div>
      )}
    </div>
  );
}

function AttachmentPicker({ photos, onChange, max = 3 }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, max - photos.length));
    e.target.value = "";
    if (files.length === 0) return;
    setError(""); setLoading(true);
    try {
      const results = await Promise.all(files.map((f) => compressPhoto(f)));
      onChange([...photos, ...results.map((src) => ({ src }))].slice(0, max));
    } catch {
      setError("사진을 불러오지 못했어요. 다른 사진으로 다시 시도해주세요.");
    } finally { setLoading(false); }
  };
  const pickVideo = async () => {
    setError(""); setLoading(true);
    try {
      const handle = await pickVideoHandle();
      if (handle === "cancelled") { setLoading(false); return; }
      if (!handle) { setError("이 환경(브라우저)에서는 영상 첨부를 지원하지 않아요."); setLoading(false); return; }
      const file = await handle.getFile();
      const thumb = await captureVideoThumb(file);
      onChange([...photos, { src: thumb, kind: "video", handle }].slice(0, max));
    } catch {
      setError("영상을 불러오지 못했어요. 다른 영상으로 다시 시도해주세요.");
    } finally { setLoading(false); }
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>사진·영상 첨부 (선택, 최대 {max}개)</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: "relative" }}>
            {p.kind === "video" ? (
              <div style={{ width: 60, height: 60, position: "relative" }}>
                <img src={p.src} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover", border: "1px solid #E5EAE6", display: "block" }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 0, height: 0, marginLeft: 2, borderTop: "6px solid transparent", borderBottom: "6px solid transparent", borderLeft: "9px solid #FFF" }} />
                  </div>
                </div>
              </div>
            ) : (
              <img src={p.src} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover", border: "1px solid #E5EAE6" }} />
            )}
            <button type="button" onClick={() => onChange(photos.filter((_, idx) => idx !== i))}
              style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", background: "#B65C68", border: "2px solid #FFF", color: "#FFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
              <X size={10} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <label style={{ width: 60, height: 60, borderRadius: 10, border: "1.5px dashed #C9CFCA", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", color: "#9AA5A0" }}>
            {loading ? <span style={{ fontSize: 9 }}>처리중</span> : <Camera size={18} />}
            <input type="file" accept="image/*" multiple onChange={pick}
              style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }} />
          </label>
        )}
        {photos.length < max && (
          <button type="button" onClick={pickVideo} disabled={loading}
            style={{ width: 60, height: 60, borderRadius: 10, border: "1.5px dashed #C9CFCA", background: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#9AA5A0" }}>
            {loading ? <span style={{ fontSize: 9 }}>처리중</span> : (
              <div style={{ width: 0, height: 0, marginLeft: 2, borderTop: "7px solid transparent", borderBottom: "7px solid transparent", borderLeft: "11px solid #9AA5A0" }} />
            )}
          </button>
        )}
      </div>
      {photos.some((p) => p.kind === "video") && (
        <p style={{ fontSize: 10.5, color: "#B0682E", marginTop: 6, lineHeight: 1.5 }}>
          영상은 원본 파일을 저장하지 않고 "다시 열어도 되는 권한"만 기억해둬요. 갤러리에서 원본을 지우거나 옮기면 나중에 재생이 안 될 수 있어요.
        </p>
      )}
      {error && <div style={{ fontSize: 11, color: "#B65C68", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

/* 사진 확대 보기 */
function PhotoViewer({ src, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <X size={20} color="#FFF" />
      </button>
      <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }} />
    </div>
  );
}

/* 영상 재생: 저장된 권한(핸들)으로 원본을 다시 열어봄. 삭제/이동됐으면 실패 안내 */
function VideoViewer({ pid, onClose }) {
  const [state, setState] = useState("loading"); // loading | ready | failed | unsupported
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let live = true;
    let objUrl = null;
    (async () => {
      const handle = videoHandleCache.get(pid);
      if (!handle) { if (live) setState("unsupported"); return; }
      try {
        if (handle.queryPermission) {
          const perm = await handle.queryPermission({ mode: "read" });
          if (perm !== "granted") {
            const req = await handle.requestPermission({ mode: "read" });
            if (req !== "granted") { if (live) setState("failed"); return; }
          }
        }
        const file = await handle.getFile(); // 원본이 삭제/이동됐으면 여기서 실패함
        objUrl = URL.createObjectURL(file);
        if (live) { setUrl(objUrl); setState("ready"); }
      } catch {
        if (live) setState("failed");
      }
    })();
    return () => { live = false; if (objUrl) URL.revokeObjectURL(objUrl); };
  }, [pid]);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,.15)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
        <X size={20} color="#FFF" />
      </button>
      {state === "loading" && <div style={{ color: "#FFF", fontSize: 13 }}>불러오는 중…</div>}
      {state === "ready" && (
        <video src={url} controls autoPlay style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 12 }} onClick={(e) => e.stopPropagation()} />
      )}
      {(state === "failed" || state === "unsupported") && (
        <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFF", borderRadius: 14, padding: 22, maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2E26", marginBottom: 8 }}>
            {state === "unsupported" ? "이 화면에서는 재생할 수 없어요" : "원본 영상을 찾을 수 없어요"}
          </div>
          <div style={{ fontSize: 12.5, color: "#6B7280", lineHeight: 1.6 }}>
            {state === "unsupported"
              ? "새로고침했거나 다른 기기·브라우저라서 영상 접근 권한이 사라졌어요. 갤러리에서 직접 확인해주세요."
              : "갤러리에서 이 영상이 삭제되었거나 다른 폴더로 옮겨졌을 수 있어요. 갤러리에서 직접 확인해주세요."}
          </div>
        </div>
      )}
    </div>
  );
}

/* 병원 PDF 첨부: 사진과 달리 원본 파일 자체를 그대로 저장해요 (검사결과지 PDF는 보통 용량이 작아서 가능) */
const pdfCache = new Map();
const pdfKey = (id) => `petcare-pdf-${id}`;
async function savePdfData(id, meta) {
  try { await window.storage.set(pdfKey(id), JSON.stringify(meta)); pdfCache.set(id, meta); return true; }
  catch { return false; }
}
async function loadPdfData(id) {
  if (pdfCache.has(id)) return pdfCache.get(id);
  try {
    const r = await window.storage.get(pdfKey(id));
    if (r && r.value) { const meta = JSON.parse(r.value); pdfCache.set(id, meta); return meta; }
  } catch { /* 없음 */ }
  return null;
}
async function deletePdfData(id) {
  try { await window.storage.delete(pdfKey(id)); } catch { /* 무시 */ }
  pdfCache.delete(id);
}
async function persistPdfItems(items, originalIds = []) {
  const ids = [];
  let failed = 0;
  for (const item of items) {
    if (item.id) { ids.push(item.id); continue; }
    const id = uid();
    const ok = await savePdfData(id, { name: item.name, size: item.size, data: item.data });
    if (ok) ids.push(id); else failed++;
  }
  for (const oid of originalIds) if (!ids.includes(oid)) await deletePdfData(oid);
  return { ids, failed };
}

function PdfAttachment({ pdfs, onChange, max = 3 }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pick = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, max - pdfs.length));
    e.target.value = "";
    if (files.length === 0) return;
    setError(""); setLoading(true);
    try {
      const results = await Promise.all(files.map((f) => new Promise((resolve, reject) => {
        if (f.size > 3 * 1024 * 1024) { reject(new Error("3MB 이하 파일만 첨부할 수 있어요 (텍스트로 변환 시 용량이 늘어나요)")); return; }
        const reader = new FileReader();
        reader.onload = () => resolve({ name: f.name, size: f.size, data: reader.result });
        reader.onerror = reject;
        reader.readAsDataURL(f);
      })));
      onChange([...pdfs, ...results].slice(0, max));
    } catch (err) {
      setError(err?.message || "파일을 불러오지 못했어요.");
    } finally { setLoading(false); }
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={S.label}>PDF 첨부 (검사결과지 등, 선택, 최대 {max}개)</label>
      {pdfs.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F7F9F6", borderRadius: 10, marginBottom: 6 }}>
          <StickyNote size={16} color="#6B7280" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: "#1F2E26", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          <span style={{ fontSize: 11, color: "#9AA5A0", flexShrink: 0 }}>{(p.size / 1024).toFixed(0)}KB</span>
          <button type="button" onClick={() => onChange(pdfs.filter((_, idx) => idx !== i))} style={{ ...S.iconBtn, flexShrink: 0 }}>
            <X size={14} color="#B65C68" />
          </button>
        </div>
      ))}
      {pdfs.length < max && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1.5px dashed #C9CFCA", cursor: "pointer", color: "#6B7280", fontSize: 12.5, position: "relative" }}>
          <Plus size={14} /> {loading ? "처리 중…" : "PDF 파일 추가"}
          <input type="file" accept="application/pdf" multiple onChange={pick}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }} />
        </label>
      )}
      {error && <div style={{ fontSize: 11, color: "#B65C68", marginTop: 4 }}>{error}</div>}
    </div>
  );
}

/* 저장된 PDF 한 건을 목록 행으로 표시, 탭하면 새 탭에서 열림 */
function StoredPdfRow({ pid }) {
  const [meta, setMeta] = useState(pdfCache.get(pid) || null);
  useEffect(() => { let live = true; if (!meta) loadPdfData(pid).then((m) => { if (live) setMeta(m); }); return () => { live = false; }; }, [pid]); // eslint-disable-line
  if (!meta) return null;
  const open = () => {
    try {
      // data URL(base64)을 Blob으로 바꿔 여는 방식이 iframe+document.write보다 브라우저 호환성이 좋음
      const [, b64] = meta.data.split(",");
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      window.open(meta.data, "_blank"); // 변환 실패 시 원본 data URL로라도 시도
    }
  };
  return (
    <button type="button" onClick={open} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F7F9F6", borderRadius: 10, marginTop: 6, width: "100%", border: "none", cursor: "pointer", textAlign: "left" }}>
      <StickyNote size={16} color="#6B7280" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: "#1F2E26", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta.name}</span>
      <ChevronRight size={14} color="#9AA5A0" />
    </button>
  );
}

function Avatar({ pet, size = 46, light }) {
  if (pet.photo)
    return <img src={pet.photo} alt={pet.name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: light ? "2px solid rgba(255,255,255,.35)" : "2px solid #EAF3EC" }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: light ? "rgba(255,255,255,.15)" : "#EAF3EC", color: light ? "#FFF" : "#2F5E45", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, flexShrink: 0 }}>
      {pet.name[0]}
    </div>
  );
}

function PhotoPicker({ photo, name, onChange }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 시에도 onChange가 다시 발생하도록 초기화
    if (!f) return;
    setError(""); setLoading(true);
    try {
      const dataUrl = await compressImage(f);
      onChange(dataUrl);
    } catch (err) {
      setError("사진을 불러오지 못했어요. 다른 사진으로 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {photo ? (
        <img src={photo} alt="" style={{ width: 76, height: 76, borderRadius: "50%", objectFit: "cover" }} />
      ) : (
        <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#EAF3EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {name ? <span style={{ fontSize: 28, fontWeight: 700, color: "#2F5E45" }}>{name[0]}</span> : <Camera size={26} color="#3E7C59" />}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        {/* input을 label로 직접 감싸 - ref.click() 방식은 일부 환경에서 파일 선택창이 열리지 않아 label 연결 방식으로 대체 */}
        <label style={{ ...S.chip, fontSize: 12, padding: "6px 12px", display: "flex", alignItems: "center", gap: 5, cursor: "pointer", position: "relative" }}>
          <Camera size={13} /> {loading ? "불러오는 중…" : photo ? "사진 변경" : "사진 등록"}
          <input
            type="file"
            accept="image/*"
            onChange={pick}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }}
          />
        </label>
        {photo && (
          <button type="button" style={{ ...S.chip, fontSize: 12, padding: "6px 12px", color: "#B65C68", borderColor: "#E9CDD1" }} onClick={() => onChange("")}>삭제</button>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: "#B65C68", textAlign: "center" }}>{error}</div>}
    </div>
  );
}

/* 루틴 유형 */
const TYPE_META = {
  med:   { label: "투약",      Icon: Pill,           color: "#7C6BAE", bg: "#F1EEF8" },
  feed:  { label: "급여",      Icon: Utensils,       color: "#C07A35", bg: "#F9F0E6" },
  water: { label: "급수",      Icon: Droplets,       color: "#3E86A0", bg: "#E9F3F6" },
  fluid: { label: "수액",      Icon: Syringe,        color: "#5B7FB9", bg: "#EBF0F8" },
  poop:  { label: "배변확인",  Icon: ClipboardCheck, color: "#8B7355", bg: "#F4EFE8" },
  walk:  { label: "산책/활동", Icon: Footprints,     color: "#3E7C59", bg: "#EAF3EC" },
  etc:   { label: "기타",      Icon: StickyNote,     color: "#6B7280", bg: "#F1F2F4" },
};

/* 빠른 기록 카테고리 */
const CAT_META = {
  symptom: { label: "증상", Icon: Activity,       color: "#B65C68", bg: "#F6E8EA" },
  meal:    { label: "식사", Icon: Utensils,       color: "#C07A35", bg: "#F9F0E6" },
  water:   { label: "물",   Icon: Droplets,       color: "#3E86A0", bg: "#E9F3F6", unit: "ml" },
  poop:    { label: "배변", Icon: ClipboardCheck, color: "#8B7355", bg: "#F4EFE8" },
  weight:  { label: "체중", Icon: Scale,          color: "#7C6BAE", bg: "#F1EEF8", unit: "kg" },
  breath:  { label: "호흡", Icon: Wind,           color: "#5B7FB9", bg: "#EBF0F8", unit: "회/분" },
  memo:    { label: "메모", Icon: StickyNote,     color: "#6B7280", bg: "#F1F2F4" },
};
const SYMPTOMS = ["구토", "설사", "기침", "경련", "절뚝임", "호흡이상", "가려움", "기타"];
const MEAL_OPTS = ["전부 먹음", "절반", "조금", "거부"];
const POOP_OPTS = ["정상", "설사", "혈변", "무배변"];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const TEMPLATES = {
  신부전: [
    { type: "med", name: "신장약", detail: "아침 1정", time: "08:00", repeat: "daily" },
    { type: "med", name: "신장약", detail: "저녁 1정", time: "20:00", repeat: "daily" },
    { type: "water", name: "음수량 측정", detail: "", time: "21:00", repeat: "daily" },
    { type: "fluid", name: "피하수액", detail: "100ml", time: "19:00", repeat: "interval", intervalDays: 2 },
  ],
  당뇨: [
    { type: "med", name: "인슐린 주사", detail: "아침", time: "08:00", repeat: "daily" },
    { type: "med", name: "인슐린 주사", detail: "저녁", time: "20:00", repeat: "daily" },
    { type: "feed", name: "아침 식사", detail: "정량 급여", time: "07:50", repeat: "daily" },
    { type: "feed", name: "저녁 식사", detail: "정량 급여", time: "19:50", repeat: "daily" },
  ],
  "수술 후 회복": [
    { type: "med", name: "항생제", detail: "", time: "09:00", repeat: "daily" },
    { type: "med", name: "진통제", detail: "", time: "09:00", repeat: "daily" },
    { type: "etc", name: "환부 확인", detail: "붓기·진물 체크", time: "10:00", repeat: "daily" },
    { type: "walk", name: "활동 제한 확인", detail: "넥카라 착용", time: "21:00", repeat: "daily" },
  ],
  "피부·알레르기": [
    { type: "med", name: "가려움 완화제", detail: "처방 용량", time: "08:00", repeat: "daily" },
    { type: "med", name: "피부 연고", detail: "환부 도포", time: "20:00", repeat: "daily" },
    { type: "etc", name: "약용 목욕", detail: "처방 샴푸 사용", time: "19:00", repeat: "interval", intervalDays: 3 },
    { type: "etc", name: "귀 세정", detail: "외이염 동반 관리", time: "20:30", repeat: "interval", intervalDays: 2 },
  ],
  심장질환: [
    { type: "med", name: "심장약", detail: "아침 1정", time: "08:00", repeat: "daily" },
    { type: "med", name: "심장약", detail: "저녁 1정", time: "20:00", repeat: "daily" },
    { type: "etc", name: "안정 시 호흡수 체크", detail: "수면 중 15초x4", time: "22:00", repeat: "daily" },
    { type: "walk", name: "활동량 관찰", detail: "무리한 운동 자제", time: "18:00", repeat: "daily" },
  ],
  "슬개골·관절": [
    { type: "med", name: "관절 영양제", detail: "글루코사민 등", time: "08:00", repeat: "daily" },
    { type: "walk", name: "가벼운 산책", detail: "점프·계단 자제", time: "09:00", repeat: "daily" },
    { type: "etc", name: "체중 측정", detail: "주 1회", time: "09:30", repeat: "weekdays", weekdays: [0] },
  ],
  "노령·컨디션 관찰": [
    { type: "feed", name: "사료", detail: "평소 대비 섭취량 변화 확인", time: "19:30", repeat: "daily" },
    { type: "water", name: "물 섭취량", detail: "평소 대비 변화 확인", time: "20:00", repeat: "daily" },
    { type: "poop", name: "배변·배뇨 상태", detail: "횟수, 색, 양 확인", time: "21:00", repeat: "daily" },
    { type: "walk", name: "활동량", detail: "기력, 걸음걸이 확인", time: "18:00", repeat: "daily" },
    { type: "etc", name: "구강 상태", detail: "치아, 잇몸, 입 냄새 확인", time: "21:30", repeat: "daily" },
  ],
};

const DEFAULT_DATA = {
  pet: null, routines: [], checkLogs: {}, conditionLogs: {},
  records: [], vetVisits: [], nextVisits: [],
  settings: { alarmEnabled: true },
};

/* 이전 버전 데이터 마이그레이션 */
function migrate(raw) {
  if (!raw) return null;
  const d = { ...DEFAULT_DATA, ...raw };
  if (!Array.isArray(d.records)) d.records = [];
  if (raw.symptomLogs?.length || raw.measurements?.length) {
    (raw.symptomLogs || []).forEach((s) => d.records.push({ id: s.id, date: s.date, time: s.time, cat: "symptom", value: s.type, memo: s.memo || "", star: false }));
    (raw.measurements || []).forEach((m) => d.records.push({ id: m.id, date: m.date, time: "21:00", cat: m.type, value: m.value, memo: "", star: false }));
    delete d.symptomLogs; delete d.measurements;
  }
  // 이전 버전: 다음 진료가 1건(nextVisit 단일 객체)만 저장됨 → 여러 건(nextVisits 배열)으로 이관
  if (!Array.isArray(d.nextVisits)) d.nextVisits = [];
  if (raw.nextVisit) d.nextVisits.push({ id: uid(), ...raw.nextVisit });
  delete d.nextVisit;
  if (!d.settings) d.settings = { alarmEnabled: true };
  if (d.pet && !Array.isArray(d.pet.tags)) d.pet.tags = d.pet.disease ? [d.pet.disease] : [];
  d.records.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  return d;
}

/* ───────────── 샘플 데이터 ───────────── */
function makeSampleData() {
  const routines = [
    { id: "r1", type: "med", name: "레나메진", detail: "아침 1포", time: "08:00", repeat: "daily", startDate: offsetDate(-20), active: true },
    { id: "r2", type: "med", name: "레나메진", detail: "저녁 1포", time: "20:00", repeat: "daily", startDate: offsetDate(-20), active: true },
    { id: "r3", type: "feed", name: "처방식 급여", detail: "k/d 40g", time: "08:30", repeat: "daily", startDate: offsetDate(-20), active: true },
    { id: "r4", type: "water", name: "음수량 측정", detail: "급수기 눈금 확인", time: "21:00", repeat: "daily", startDate: offsetDate(-20), active: true },
    { id: "r5", type: "fluid", name: "피하수액", detail: "100ml", time: "19:00", repeat: "interval", intervalDays: 2, startDate: offsetDate(-20), active: true },
  ];
  const checkLogs = {}, conditionLogs = {}, records = [];
  const mealSeq = ["전부 먹음", "전부 먹음", "절반", "전부 먹음", "조금"];
  for (let i = 14; i >= 0; i--) {
    const dt = offsetDate(-i);
    checkLogs[dt] = {};
    routines.forEach((r, idx) => {
      if (r.repeat === "interval" && daysBetween(r.startDate, dt) % r.intervalDays !== 0) return;
      const roll = (i * 7 + idx * 3) % 15;
      if (i > 0 && roll === 13) return;
      if (i > 0 && roll === 14) { checkLogs[dt][r.id] = { status: "skipped", time: r.time }; return; }
      if (i === 0 && r.time > nowTime()) return;
      const entry = { status: "done", time: r.time };
      if (r.type === "feed") entry.extra = mealSeq[i % mealSeq.length];
      checkLogs[dt][r.id] = entry;
    });
    conditionLogs[dt] = {
      appetite: [4, 4, 3, 5, 4, 3, 2, 3, 4, 4, 3, 4, 5, 4, 4][14 - i],
      energy:   [4, 3, 3, 4, 4, 3, 2, 3, 3, 4, 4, 4, 4, 3, 4][14 - i],
      noIssue: ![3, 7, 11].includes(i),
    };
    records.push({ id: uid(), date: dt, time: "21:00", cat: "water", value: 150 + ((i * 13) % 70), memo: "", star: false });
    records.push({ id: uid(), date: dt, time: "08:40", cat: "meal", value: mealSeq[i % mealSeq.length], memo: "", star: false });
    if (i % 3 === 0) records.push({ id: uid(), date: dt, time: "09:00", cat: "weight", value: Math.round((4.38 - (14 - i) * 0.008) * 100) / 100, memo: "", star: false });
    if (i % 4 === 1) records.push({ id: uid(), date: dt, time: "22:30", cat: "breath", value: 24 + (i % 3) * 2, memo: "수면 중 측정", star: false });
  }
  records.push(
    { id: uid(), date: offsetDate(-11), time: "07:20", cat: "symptom", value: "구토", memo: "노란 거품, 공복토 추정", star: true },
    { id: uid(), date: offsetDate(-7), time: "13:40", cat: "symptom", value: "구토", memo: "식후 30분, 사료 그대로", star: true },
    { id: uid(), date: offsetDate(-7), time: "21:10", cat: "symptom", value: "설사", memo: "묽은 변 1회", star: false },
    { id: uid(), date: offsetDate(-3), time: "09:05", cat: "symptom", value: "구토", memo: "소량, 이후 컨디션 양호", star: false },
    { id: uid(), date: offsetDate(-5), time: "18:00", cat: "memo", value: "", memo: "장난감에 반응, 오랜만에 활발하게 놀았음", star: false },
  );
  records.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const vetVisits = [
    { id: uid(), date: offsetDate(-48), hospital: "하늘동물병원", reason: "정기 검진 (혈액검사)", result: "크레아티닌 2.6, BUN 41. 신부전 3기 초입 소견. 인 수치는 정상 범위.", rx: "레나메진 하루 2회 시작, 처방식(k/d) 전환" },
    { id: uid(), date: offsetDate(-20), hospital: "하늘동물병원", reason: "재검 + 수액 교육", result: "크레아티닌 2.8로 소폭 상승. 탈수 경향 있어 피하수액 병행 결정. 체중 4.38kg.", rx: "피하수액 2일 간격 100ml 추가. 음수량 매일 기록 권장" },
  ];
  return {
    pet: { name: "모모", species: "고양이", breed: "코리안숏헤어", age: "8살", tags: ["만성 신부전 3기", "저인식 식이"], created: offsetDate(-48) },
    routines, checkLogs, conditionLogs, records, vetVisits,
    settings: { alarmEnabled: true },
    nextVisits: [
      { id: uid(), date: offsetDate(8), time: "11:00", hospital: "하늘동물병원", purpose: "혈액검사 재검 (크레아티닌 추적)" },
      { id: uid(), date: offsetDate(15), time: "15:30", hospital: "정성치과동물병원", purpose: "치석 제거 상담" },
    ],
  };
}

/* ───────────── 메인 앱 ───────────── */
export default function App({ onLogout, userEmail } = {}) {
  const desktop = useIsDesktop();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("today");
  const [saveState, setSaveState] = useState("idle");
  const [quickOpen, setQuickOpen] = useState(false);
  const saveTimer = useRef(null);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      const raw = await loadRaw();
      const d = migrate(raw) || DEFAULT_DATA;
      // 예전 버전: 사진이 본문에 통째로 저장돼 용량 초과를 일으킴 → 분리 키로 이전
      let moved = false;
      for (const list of [d.records || [], d.vetVisits || []]) {
        for (const item of list) {
          if (!Array.isArray(item.photos)) continue;
          for (let i = 0; i < item.photos.length; i++) {
            const p = item.photos[i];
            if (typeof p === "string" && p.startsWith("data:")) {
              const pid = uid();
              await savePhotoData(pid, p);
              item.photos[i] = pid;
              moved = true;
            }
          }
        }
      }
      if (moved) await saveData(d);
      setData(d);
      loaded.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current || data === null) return;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      let ok = await saveData(data);
      if (!ok) {
        // 일시적 오류(요청 몰림 등)일 수 있어 잠시 후 한 번 더 시도
        await new Promise((r) => setTimeout(r, 1500));
        ok = await saveData(data);
      }
      setSaveState(ok ? "saved" : "error");
      if (ok) setTimeout(() => setSaveState("idle"), 1500);
    }, 600);
    return () => clearTimeout(saveTimer.current);
  }, [data]);

  const update = useCallback((fn) => setData((prev) => fn(structuredClone(prev))), []);

  /* 케어 시간 알림: 30초마다 확인, 시간이 되면(60분 이내) 배너+소리+브라우저 알림 */
  const [alarmQueue, setAlarmQueue] = useState([]);
  const notifiedRef = useRef(new Set());
  useEffect(() => {
    if (!data?.pet || data.settings?.alarmEnabled === false) return;
    const check = () => {
      const date = todayStr();
      const now = nowTime();
      const logs = data.checkLogs[date] || {};
      const firing = data.routines.filter((r) => {
        if (!isDue(r, date) || r.alarm === false) return false;
        const key = date + ":" + r.id;
        if (notifiedRef.current.has(key)) return false;
        if (logs[r.id]) return false; // 이미 완료/건너뜀
        const diff = minutesDiff(r.time, now);
        return diff >= 0 && diff <= 60;
      });
      if (firing.length) {
        firing.forEach((r) => notifiedRef.current.add(date + ":" + r.id));
        setAlarmQueue((q) => [...q, ...firing.filter((f) => !q.some((x) => x.id === f.id))]);
        playAlarmSound();
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            firing.forEach((r) => new Notification(`${data.pet.name} 케어 시간이에요`, { body: `${r.time} · ${r.name}${r.detail ? ` (${r.detail})` : ""}` }));
          }
        } catch { /* 미리보기 환경에서는 브라우저 알림 미지원 */ }
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [data]);

  const completeFromAlarm = (r) => {
    update((d) => {
      const date = todayStr();
      d.checkLogs[date] = d.checkLogs[date] || {};
      d.checkLogs[date][r.id] = { status: "done", time: nowTime() };
      return d;
    });
    setAlarmQueue((q) => q.filter((x) => x.id !== r.id));
  };

  const addRecord = useCallback((rec) => {
    update((d) => {
      d.records.unshift({ id: uid(), date: todayStr(), time: nowTime(), star: false, memo: "", ...rec });
      d.records.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      return d;
    });
  }, [update]);

  if (data === null)
    return (
      <div style={S.loading}>
        <PawPrint size={36} color="#3E7C59" />
        <div style={{ marginTop: 10, color: "#6B7280", fontSize: 13 }}>기록을 불러오는 중…</div>
      </div>
    );

  if (!data.pet) {
    return <Onboarding onDone={(newData) => setData(newData)} />;
  }

  const TABS = [
    ["today", "홈", Sun],
    ["log", "기록", ClipboardList],
    ["hospital", "병원", Stethoscope],
    ["report", "리포트", BarChart3],
    ["settings", "설정", Settings],
  ];
  const showFab = tab === "today" || tab === "log";

  const views = (
    <>
      {tab === "today" && <TodayView data={data} update={update} goHospital={() => setTab("hospital")} goSettings={() => setTab("settings")} goReport={() => setTab("report")} />}
      {tab === "log" && <LogView data={data} update={update} />}
      {tab === "hospital" && <HospitalView data={data} update={update} />}
      {tab === "report" && <ReportView data={data} />}
      {tab === "settings" && <SettingsView data={data} update={update} setData={setData} onLogout={onLogout} userEmail={userEmail} />}
    </>
  );

  const alarmBanner = alarmQueue.length > 0 && (
    <div style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, zIndex: 65, padding: "10px 12px 0" }}>
      {alarmQueue.map((r) => (
        <div key={r.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, marginBottom: 6, borderColor: "#E8C9AE", background: "#FDF3EC", boxShadow: "0 4px 14px rgba(31,46,38,.15)" }}>
          <Bell size={18} color="#B0682E" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1F2E26" }}>{data.pet.name} 케어 시간이에요</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>{r.time} · {r.name}{r.detail ? ` (${r.detail})` : ""}</div>
          </div>
          <button style={{ ...S.chip, padding: "7px 12px", fontSize: 12, background: "#3E7C59", borderColor: "#3E7C59", color: "#FFF", flexShrink: 0 }}
            onClick={() => completeFromAlarm(r)}>완료</button>
          <button style={S.iconBtn} onClick={() => setAlarmQueue((q) => q.filter((x) => x.id !== r.id))}>
            <X size={16} color="#9AA5A0" />
          </button>
        </div>
      ))}
    </div>
  );

  const sheet = quickOpen && (
    <QuickRecordSheet petName={data.pet.name} onSave={(rec, keepOpen) => { addRecord(rec); if (!keepOpen) setQuickOpen(false); }} onClose={() => setQuickOpen(false)} />
  );

  /* ── PC 레이아웃: 사이드 메뉴 + 넓은 콘텐츠 ── */
  if (desktop) {
    return (
      <div style={{ minHeight: "100dvh", background: "#F4F6F2", display: "flex", fontFamily: S.app.fontFamily, color: "#1F2E26" }}>
        <SaveBadge state={saveState} />
        {alarmBanner}
        <aside style={{ width: 220, flexShrink: 0, background: "#FFF", borderRight: "1px solid #E5EAE6", padding: "22px 12px", position: "sticky", top: 0, height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 10px 22px" }}>
            <img src={logoUrl} alt="" style={{ width: 26, height: 26, borderRadius: 7, display: "block" }} />
            <span style={{ fontWeight: 700, fontSize: 17 }}>PetCare<span style={{ color: "#2F6F5E", fontSize: 13, verticalAlign: "super" }}>+</span></span>
          </div>
          {TABS.map(([k, label, Icon]) => {
            const on = tab === k;
            return (
              <button key={k} onClick={() => setTab(k)}
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", padding: "11px 12px", borderRadius: 12, border: "none", cursor: "pointer", marginBottom: 3, textAlign: "left",
                  background: on ? "#EAF3EC" : "transparent", color: on ? "#2F5E45" : "#6B7280", fontWeight: on ? 700 : 500, fontSize: 14 }}>
                <Icon size={19} strokeWidth={on ? 2.3 : 1.8} />{label}
              </button>
            );
          })}
          <div style={{ marginTop: "auto", padding: "12px 10px 0", borderTop: "1px solid #F0F3F0", display: "flex", alignItems: "center", gap: 9 }}>
            <Avatar pet={data.pet} size={32} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{data.pet.name}</div>
              <div style={{ fontSize: 10.5, color: "#9AA5A0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[data.pet.age, data.pet.breed || data.pet.species].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
        </aside>
        <main style={{ flex: 1, minWidth: 0 }}>
          <div style={{ maxWidth: 780, margin: "0 auto", padding: "10px 28px 48px" }}>{views}</div>
        </main>
        {showFab && (
          <button style={{ ...S.fab, right: 32, bottom: 32 }} onClick={() => setQuickOpen(true)} aria-label="빠른 기록">
            <Plus size={26} color="#FFF" strokeWidth={2.6} />
          </button>
        )}
        {sheet}
      </div>
    );
  }

  /* ── 모바일 레이아웃 (기존) ── */
  return (
    <div style={S.app}>
      <SaveBadge state={saveState} />
      {alarmBanner}
      <div style={S.content}>{views}</div>

      {showFab && (
        <button style={S.fab} onClick={() => setQuickOpen(true)} aria-label="빠른 기록">
          <Plus size={26} color="#FFF" strokeWidth={2.6} />
        </button>
      )}
      {sheet}

      <nav style={S.tabbar}>
        {TABS.map(([k, label, Icon]) => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{ ...S.tabBtn, color: on ? "#2F5E45" : "#9AA5A0" }}>
              <Icon size={21} strokeWidth={on ? 2.4 : 1.8} />
              <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 400 }}>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function SaveBadge({ state }) {
  if (state === "idle") return null;
  const map = { saving: ["저장 중…", "#9AA5A0"], saved: ["저장됨", "#3E7C59"], error: ["저장 실패 · 잠시 후 자동으로 다시 시도해요", "#B65C68"] };
  const [text, color] = map[state];
  return (
    <div style={{ position: "fixed", top: 10, right: 12, zIndex: 70, fontSize: 11, color, background: "#FFFFFFEE", padding: "4px 10px", borderRadius: 20, boxShadow: "0 1px 4px rgba(0,0,0,.08)", display: "flex", alignItems: "center", gap: 4 }}>
      {state === "saved" && <Check size={12} />}{text}
    </div>
  );
}

/* ───────────── 빠른 기록 바텀시트 ───────────── */
function QuickRecordSheet({ petName, onSave, onClose, initial }) {
  const isEdit = !!initial;
  const [cat, setCat] = useState(initial?.cat || null);
  const [value, setValue] = useState(initial?.value ?? "");
  const [memo, setMemo] = useState(initial?.memo || "");
  const [photos, setPhotos] = useState([]); // [{id?, src}]
  const [date, setDate] = useState(initial?.date || todayStr());
  const [time, setTime] = useState(initial?.time || nowTime());
  const [justSaved, setJustSaved] = useState(""); // 연속 기록 시 "방금 저장됨" 안내
  const originalIds = initial?.photos || [];

  // 수정 모드: 저장된 사진 id들을 미리보기용으로 불러오기
  useEffect(() => {
    let live = true;
    if (originalIds.length) {
      Promise.all(originalIds.map(async (pid) => ({ id: pid, src: await loadPhotoData(pid), kind: pid.startsWith(VIDEO_PREFIX) ? "video" : undefined })))
        .then((items) => { if (live) setPhotos(items.filter((x) => x.src)); });
    }
    return () => { live = false; };
  }, []); // eslint-disable-line

  const catList = Object.entries(CAT_META);
  const meta = cat ? CAT_META[cat] : null;
  const numeric = cat === "water" || cat === "weight" || cat === "breath";
  const opts = cat === "symptom" ? SYMPTOMS : cat === "meal" ? MEAL_OPTS : cat === "poop" ? POOP_OPTS : null;
  const canSave = cat === "memo" ? memo.trim() : numeric ? !isNaN(parseFloat(value)) : !!value;

  const buildAndSave = async (keepOpen) => {
    const ids = await persistPhotoItems(photos, originalIds);
    onSave({ cat, value: numeric ? parseFloat(value) : String(value), memo: memo.trim(), photos: ids, date, time }, keepOpen);
  };
  const resetToGrid = () => { setCat(null); setValue(""); setMemo(""); setPhotos([]); setTime(nowTime()); };

  return (
    <Modal title={cat ? `${meta.label} 기록${isEdit ? " 수정" : ""}` : "무엇을 기록할까요?"} onClose={onClose}
      footer={cat ? (
        <>
          <button style={{ ...S.primaryBtn, opacity: canSave ? 1 : 0.4 }} disabled={!canSave}
            onClick={() => buildAndSave(false)}>저장</button>
          {!isEdit && (
            canSave ? (
              <button style={{ ...S.secondaryBtn, marginTop: 8, color: "#2F5E45", borderColor: "#BCD8C4" }}
                onClick={async () => { await buildAndSave(true); setJustSaved(meta.label); resetToGrid(); }}>
                저장 후 계속 기록
              </button>
            ) : (
              <button style={{ ...S.secondaryBtn, marginTop: 8 }} onClick={resetToGrid}>다른 항목 선택</button>
            )
          )}
          {!isEdit && canSave && (
            <div style={{ fontSize: 11, color: "#9AA5A0", textAlign: "center", marginTop: 6 }}>
              저장하지 않고 항목을 바꾸면 입력한 내용이 사라져요
            </div>
          )}
        </>
      ) : null}>
      {!cat ? (
        <>
        {justSaved && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 12.5, fontWeight: 600, color: "#2F5E45", background: "#EAF3EC", borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>
            <Check size={14} /> {justSaved} 기록이 저장됐어요. 이어서 기록해보세요.
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, paddingBottom: 6 }}>
          {catList.map(([k, m]) => {
            const I = m.Icon;
            return (
              <button key={k} onClick={() => setCat(k)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 0" }}>
                <div style={{ width: 48, height: 48, borderRadius: 15, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <I size={22} color={m.color} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 500, color: "#556158" }}>{m.label}</span>
              </button>
            );
          })}
        </div>
        </>
      ) : (
        <>
          {cat !== "memo" && <label style={S.label}>{meta.label}<RequiredMark /></label>}
          {opts && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {opts.map((o) => (
                <button key={o} style={{ ...S.chip, ...(value === o ? { background: meta.bg, borderColor: meta.color, color: meta.color } : {}) }} onClick={() => setValue(o)}>{o}</button>
              ))}
            </div>
          )}
          {numeric && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input style={{ ...S.input, marginBottom: 0, flex: 1 }} type="number" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
                placeholder={cat === "weight" ? "예: 4.2" : cat === "water" ? "예: 180" : "예: 26"} />
              <span style={{ fontSize: 13, color: "#6B7280", flexShrink: 0 }}>{meta.unit}</span>
            </div>
          )}
          {cat === "breath" && (
            <p style={{ fontSize: 11, color: "#9AA5A0", margin: "0 0 12px", lineHeight: 1.6 }}>
              잠잘 때 가슴이 오르내리는 횟수를 15초간 세고 4를 곱하면 분당 호흡수예요. 심장질환은 수면 시 30회/분 이상이면 병원에 알려주세요.
            </p>
          )}
          <label style={S.label}>일시 (지난 날짜도 기록할 수 있어요)</label>
          <div style={{ marginBottom: 10 }}>
            {cat === "symptom" ? (
              <KCalendar value={date} max={todayStr()} onChange={setDate} />
            ) : (
              <KDateSelect value={date} max={todayStr()} onChange={setDate} />
            )}
          </div>
          <div style={{ marginBottom: 14 }}>
            <KTimeSelect value={time} onChange={setTime} />
          </div>
          <label style={S.label}>{cat === "memo" ? <>내용<RequiredMark /></> : "메모 (선택)"}</label>
          <KTextarea style={{ ...S.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} value={memo} onChange={(e) => setMemo(e.target.value)}
            placeholder={cat === "symptom" ? "예: 노란 거품, 식후 30분" : `${petName}의 상태를 짧게 남겨보세요`} />
          <AttachmentPicker photos={photos} onChange={setPhotos} />
        </>
      )}
    </Modal>
  );
}

function RequiredMark() {
  return <span style={{ color: "#E0554F", marginLeft: 4 }}>*</span>;
}

export function StartScreen({ onStart, startLabel }) {
  return (
    <div style={{ ...S.app, height: "100dvh", minHeight: "100dvh", position: "relative", overflow: "hidden", background: "#F2F3EB" }}>
      <img
        src={startDogUrl}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "35% bottom",
          display: "block",
          zIndex: 1,
          transform: "scale(1.115)",
        }}
      />
      <style>{`
        @keyframes startCardFloat {
          0%, 100% { transform: translateY(0) rotate(var(--rot)); }
          50% { transform: translateY(-8px) rotate(var(--rot)); }
        }
        .start-float-card { display: none !important; animation: startCardFloat 4s ease-in-out infinite; will-change: transform; }
      `}</style>
      <div className="start-float-card" style={{ position: "absolute", left: 60, top: "44%", zIndex: 2, "--rot": "0deg", animationDelay: "0s", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.6)", borderRadius: 14, padding: "9px 12px", boxShadow: "0 10px 24px rgba(31,46,38,.10)" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#E3F0E7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Check size={14} color="#2F6F5E" strokeWidth={3} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 300, color: "#556158" }}>아침 투약 완료</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#151A18" }}>08:00</div>
        </div>
      </div>
      <div className="start-float-card" style={{ position: "absolute", right: 10, top: "52.5%", zIndex: 2, "--rot": "0deg", animationDelay: "1.3s", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.6)", borderRadius: 14, padding: "9px 12px", boxShadow: "0 10px 24px rgba(31,46,38,.10)" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#E3F0E7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <CalendarClock size={14} color="#2F6F5E" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 300, color: "#556158" }}>다음 진료</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#151A18" }}>D-8</div>
        </div>
      </div>
      <div className="start-float-card" style={{ position: "absolute", left: 12, top: "70%", zIndex: 2, "--rot": "0deg", animationDelay: "2.6s", display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.55)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.6)", borderRadius: 14, padding: "9px 12px", boxShadow: "0 10px 24px rgba(31,46,38,.10)" }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: "#E3F0E7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <BarChart3 size={14} color="#2F6F5E" />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 300, color: "#556158" }}>이번 주 케어</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "#151A18" }}>92%</div>
        </div>
      </div>
      <main style={{ position: "relative", zIndex: 2, flex: 1, display: "flex", flexDirection: "column", padding: "40px 24px 132px", boxSizing: "border-box" }}>
        <div style={{ flexShrink: 0, position: "relative", zIndex: 2, textAlign: "center", top: "1%" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 6, marginBottom: 40 }}>
            <img src={logoUrl} alt="" style={{ width: 24, height: 24, borderRadius: 7, display: "block" }} />
            <div style={{ color: "#10231D", fontSize: 15, fontWeight: 700, letterSpacing: 0, lineHeight: 1 }}>
              PetCare<span style={{ color: "#2F6F5E", fontSize: 11, verticalAlign: "super", marginLeft: 1 }}>+</span>
            </div>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.4)", border: "1px solid #FFF", color: "#2F6F5E", fontSize: 10.5, fontWeight: 600, padding: "7px 13px", borderRadius: 20, marginBottom: 32 }}>
            <ShieldCheck size={13} />우리 아이의 건강 파트너
          </div>
          <h1 style={{ margin: 0, color: "#151A18", fontSize: 36, lineHeight: 1.2, fontWeight: 700, letterSpacing: 0 }}>
            아이의 하루를<br />놓치지 않게
          </h1>
          <p style={{ margin: "10px 0 0", color: "#3D3D3D", fontSize: 15, lineHeight: 1.45, fontWeight: 500, letterSpacing: 0 }}>
            매일 케어부터 진료 기록까지,<br /><span style={{ color: "#FF6600" }}>PetCare+</span>가 함께할게요.
          </p>
        </div>
      </main>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 4, zIndex: 3, padding: "16px 16px max(22px, env(safe-area-inset-bottom))" }}>
        <button type="button" style={{ ...S.primaryBtn, background: "#2F7D64", height: 54, borderRadius: 10, fontSize: 15.5 }} onClick={onStart}>
          {startLabel || "시작하기"}
        </button>
      </div>
    </div>
  );
}

/* ───────────── 온보딩 ───────────── */
const ONBOARDING_DRAFT_KEY = "petcare-onboarding-draft";

function Onboarding({ onDone }) {
  const draft = (() => {
    try { return JSON.parse(localStorage.getItem(ONBOARDING_DRAFT_KEY)) || {}; }
    catch { return {}; }
  })();
  const [name, setName] = useState(draft.name || "");
  const [species, setSpecies] = useState(draft.species || "강아지");
  const [breed, setBreed] = useState(draft.breed || "");
  const [age, setAge] = useState(draft.age || "");
  const [tags, setTags] = useState(draft.tags || "");
  const [templates, setTemplates] = useState(draft.templates || []); // 복수 선택 가능
  const [photo, setPhoto] = useState(draft.photo || "");

  useEffect(() => {
    try { localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ name, species, breed, age, tags, templates, photo })); }
    catch { /* 용량 초과 등 - 임시 저장 실패는 무시 */ }
  }, [name, species, breed, age, tags, templates, photo]);

  const start = () => {
    if (!name.trim()) return;
    const routines = templates.flatMap((t) => TEMPLATES[t].map((r) => ({ ...r, id: uid(), startDate: todayStr(), active: true })));
    try { localStorage.removeItem(ONBOARDING_DRAFT_KEY); } catch { /* 무시 */ }
    onDone({
      ...DEFAULT_DATA,
      pet: { name: name.trim(), species, breed: breed.trim(), age: age.trim(), photo, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), created: todayStr() },
      routines,
    });
  };

  return (
    <div style={{ ...S.app, justifyContent: "center" }}>
      <div style={{ padding: 24, maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ textAlign: "center" }}><img src={logoUrl} alt="" style={{ width: 48, height: 48, borderRadius: 12, display: "inline-block" }} /></div>
        <h1 style={{ textAlign: "center", fontSize: 22, color: "#1F2E26", margin: "8px 0 4px" }}>PetCare<span style={{ color: "#2F6F5E" }}>+</span></h1>
        <p style={{ textAlign: "center", color: "#6B7280", fontSize: 13, marginBottom: 24 }}>
          매일의 돌봄을 기록하고, 진료실에서 힘이 되도록
        </p>

        <PhotoPicker photo={photo} name={name} onChange={setPhoto} />
        <label style={S.label}>아이 이름 <span style={{ color: "#E0554F" }}>*</span></label>
        <KInput style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 해피" />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>나이 (선택)</label>
            <KInput style={S.input} value={age} onChange={(e) => setAge(e.target.value)} placeholder="예: 12살" />
          </div>
          <div style={{ flex: 1.4 }}>
            <label style={S.label}>품종 (선택)</label>
            <KInput style={S.input} value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="예: 말티즈" />
          </div>
        </div>
        <label style={S.label}>종류</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {["강아지", "고양이", "기타"].map((s) => (
            <button key={s} onClick={() => setSpecies(s)} style={{ ...S.chip, ...(species === s ? S.chipOn : {}) }}>{s}</button>
          ))}
        </div>
        <label style={S.label}>건강 태그 (선택, 쉼표로 구분)</label>
        <KInput style={S.input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="예: 심장질환, 신장관리" />
        <label style={S.label}>루틴 템플릿 (선택, 여러 개 가능)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {Object.keys(TEMPLATES).map((t) => {
            const on = templates.includes(t);
            return (
              <button key={t} onClick={() => setTemplates(on ? templates.filter((x) => x !== t) : [...templates, t])}
                style={{ ...S.chip, ...(on ? S.chipOn : {}), display: "flex", alignItems: "center", gap: 4 }}>
                {on && <Check size={13} />}{t}
              </button>
            );
          })}
        </div>
        {templates.length > 0 && (
          <div style={{ ...S.card, background: "#F7F9F6", marginBottom: 16 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#2F5E45", marginBottom: 6 }}>
              선택한 템플릿 {templates.length}개 · 아래 {templates.reduce((s, t) => s + TEMPLATES[t].length, 0)}개 루틴이 자동으로 추가돼요
            </div>
            {templates.map((t) => (
              <div key={t} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#9AA5A0", margin: "6px 0 2px" }}>{t}</div>
                {TEMPLATES[t].map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#556158", padding: "3px 0" }}>
                    <TypeIcon type={r.type} size={13} />
                    <span style={{ fontWeight: 600, color: "#1F2E26" }}>{r.name}</span>
                    <span>{r.detail}</span>
                    <span style={{ marginLeft: "auto", color: "#9AA5A0" }}>{r.time}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#9AA5A0", marginTop: 4 }}>
              시작 후 설정 → 반복 루틴 관리에서 언제든 수정·삭제할 수 있어요.
            </div>
          </div>
        )}
        <button onClick={start} disabled={!name.trim()} style={{ ...S.primaryBtn, opacity: name.trim() ? 1 : 0.4 }}>시작하기</button>
        {!name.trim() && (
          <div style={{ fontSize: 11.5, color: "#B0682E", textAlign: "center", marginTop: 8 }}>
            아이 이름을 입력해야 시작할 수 있어요
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────── 홈(오늘) 탭 ───────────── */
function isDue(r, dateStr) {
  if (!r.active) return false;
  if (daysBetween(r.startDate || dateStr, dateStr) < 0) return false;
  if (r.repeat === "daily") return true;
  if (r.repeat === "weekdays") return (r.weekdays || []).includes(new Date(dateStr + "T00:00").getDay());
  if (r.repeat === "interval") return daysBetween(r.startDate, dateStr) % (r.intervalDays || 1) === 0;
  return false;
}

function TypeIcon({ type, size = 18 }) {
  const m = TYPE_META[type]; const I = m.Icon;
  return (
    <div style={{ width: size + 18, height: size + 18, borderRadius: 11, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <I size={size} color={m.color} strokeWidth={2} />
    </div>
  );
}

function TodayView({ data, update, goHospital, goSettings, goReport }) {
  const date = todayStr();
  const due = data.routines.filter((r) => isDue(r, date)).sort((a, b) => a.time.localeCompare(b.time));
  const logs = data.checkLogs[date] || {};
  const [detailFor, setDetailFor] = useState(null);
  const [editingRoutine, setEditingRoutine] = useState(null);
  const [currentTime, setCurrentTime] = useState(nowTime());
  const sortedDue = [...due].sort((a, b) => {
    const group = (r) => {
      const status = logs[r.id]?.status;
      if (detailFor === r.id) return 0;
      if (status === "done" || status === "skipped") return 2;
      return minutesDiff(r.time, currentTime) > 30 ? 2 : 0;
    };
    const groupDiff = group(a) - group(b);
    return groupDiff || a.time.localeCompare(b.time);
  });
  const doneCount = due.filter((r) => logs[r.id]?.status === "done").length;
  const upcoming = (data.nextVisits || []).filter((v) => daysBetween(date, v.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const nv = upcoming[0];
  const dLeft = nv ? daysBetween(date, nv.date) : null;
  const moreCount = upcoming.length - 1;
  const pet = data.pet;
  const anomalyCount = detectAnomalies(data).length;

  const setLog = (rid, entry) =>
    update((d) => {
      d.checkLogs[date] = d.checkLogs[date] || {};
      if (entry === null) delete d.checkLogs[date][rid];
      else d.checkLogs[date][rid] = { ...(d.checkLogs[date][rid] || {}), ...entry };
      return d;
    });

  useEffect(() => {
    const tick = () => setCurrentTime(nowTime());
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const overdue = due.filter((r) => !logs[r.id]?.status && detailFor !== r.id && minutesDiff(r.time, currentTime) > 30);
    if (overdue.length === 0) return;
    update((d) => {
      d.checkLogs[date] = d.checkLogs[date] || {};
      overdue.forEach((r) => {
        if (!d.checkLogs[date][r.id]?.status) d.checkLogs[date][r.id] = { ...d.checkLogs[date][r.id], status: "skipped", time: currentTime };
      });
      return d;
    });
  }, [currentTime, date, detailFor, due, logs, update]);

  const toggle = (r) => {
    const cur = logs[r.id];
    if (cur?.status === "done") {
      setLog(r.id, null);
      if (detailFor === r.id) setDetailFor(null);
    } else {
      setLog(r.id, { status: "done", time: nowTime() });
    }
  };

  return (
    <div style={{ padding: "20px 16px 16px" }}>
      {/* 프로필 카드 */}
      <button onClick={goSettings} style={{ ...S.card, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, marginBottom: 12, background: "#2F5E45", border: "none", color: "#FFF" }}>
        <Avatar pet={pet} light />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{pet.name}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{[pet.age, pet.breed || pet.species].filter(Boolean).join(" · ")}</div>
          {pet.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
              {pet.tags.map((t) => (
                <span key={t} style={{ fontSize: 10.5, fontWeight: 600, background: "rgba(255,255,255,.18)", padding: "3px 8px", borderRadius: 10 }}>{t}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>오늘 케어</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{doneCount}<span style={{ fontSize: 12, opacity: 0.7 }}> / {due.length}</span></div>
        </div>
        <ChevronRight size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
      </button>

      {/* 이상 신호 배너 */}
      {anomalyCount > 0 && (
        <button onClick={goReport} style={{ ...S.card, width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 12, display: "flex", alignItems: "center", gap: 12, background: "#FDF3EC", borderColor: "#E8C9AE" }}>
          <Activity size={19} color="#B0682E" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1F2E26" }}>확인해볼 변화가 {anomalyCount}건 있어요</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>리포트에서 자세히 보기</div>
          </div>
          <ChevronRight size={15} color="#9AA5A0" />
        </button>
      )}

      {/* 다음 진료 배너 */}
      {nv && (
        <button onClick={goHospital} style={{ ...S.card, width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", gap: 12, background: dLeft <= 3 ? "#FDF3EC" : "#FFF", borderColor: dLeft <= 3 ? "#E8C9AE" : "#E5EAE6" }}>
          <CalendarClock size={20} color={dLeft <= 3 ? "#B0682E" : "#3E7C59"} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#1F2E26" }}>다음 진료 {dLeft === 0 ? "오늘" : `D-${dLeft}`} · {fmtDate(nv.date)}{nv.time ? ` ${nv.time}` : ""}</div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>{nv.hospital}{nv.purpose ? ` · ${nv.purpose}` : ""}</div>
          </div>
          {moreCount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: "#3E7C59", background: "#EAF3EC", padding: "4px 8px", borderRadius: 10, flexShrink: 0 }}>+{moreCount}건 더</span>
          )}
          <ChevronRight size={15} color="#9AA5A0" />
        </button>
      )}

      <h2 style={{ ...S.h2, marginBottom: 12 }}>오늘의 케어</h2>

      {due.length === 0 && (
        <div style={S.empty}>아직 루틴이 없어요.<br /><b>설정 → 반복 루틴 관리</b>에서 추가해주세요.</div>
      )}

      <div>
        {sortedDue.map((r, idx) => {
          const log = logs[r.id];
          const done = log?.status === "done";
          const skipped = log?.status === "skipped";
          const isLast = idx === sortedDue.length - 1;
          return (
            <div key={r.id} style={{ position: "relative", paddingLeft: 26, paddingBottom: isLast ? 0 : 14 }}>
              {!isLast && <div style={{ position: "absolute", left: 8, top: 18, bottom: -2, width: 1, background: "#DDE4DE" }} />}
              <div style={{ position: "absolute", left: 3, top: 16, width: 11, height: 11, borderRadius: "50%", background: done ? "#3E7C59" : "#FFF", border: done ? "none" : "2px solid #C9CFCA", zIndex: 1 }} />
              <div style={{ ...S.card, background: done ? "#F7FBF8" : skipped ? "#FAFAF9" : "#FFF" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#9AA5A0", marginBottom: 6 }}>{r.time}</div>
                <div onClick={() => toggle(r)} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", opacity: skipped ? 0.55 : 1 }}>
                  <TypeIcon type={r.type} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "#1F2E26", textDecoration: skipped ? "line-through" : "none" }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "#6B7280" }}>
                      {r.detail || TYPE_META[r.type].label}
                      {done && log.time && <span style={{ color: "#3E7C59" }}> · {log.time} 완료</span>}
                    </div>
                    {log?.extra && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{log.extra}</div>}
                  </div>
                  <button type="button" style={S.iconBtn} onClick={(e) => { e.stopPropagation(); setEditingRoutine(r); }}>
                    <Pencil size={14} color="#6B7280" />
                  </button>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: done ? "#3E7C59" : "#FFF", border: done ? "none" : "2px solid #C9CFCA", flexShrink: 0 }}>
                    {done && <Check size={15} color="#FFF" strokeWidth={3} />}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4, marginLeft: 42 }}>
                  {!skipped && !done && (
                    <button style={S.miniBtn} onClick={() => setDetailFor(detailFor === r.id ? null : r.id)}>
                      {log?.extra ? "상세 수정" : "+ 상세 남기기"}
                    </button>
                  )}
                  {skipped && <button style={S.miniBtn} onClick={() => setLog(r.id, null)}>되돌리기</button>}
                  {(done || skipped) && (
                    <button style={S.miniBtn} onClick={() => setDetailFor(detailFor === r.id ? null : r.id)}>
                      {log?.extra ? "상세 수정" : "+ 상세 남기기"}
                    </button>
                  )}
                </div>
                {detailFor === r.id && (
                  <div style={{ marginLeft: 42 }}>
                    <DetailInput type={r.type} current={log?.extra || ""} onSave={(v) => { setLog(r.id, { extra: v }); setDetailFor(null); }} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editingRoutine && (
        <RoutineEditor
          routine={editingRoutine}
          onSave={(list) => {
            update((d) => { Object.assign(d.routines.find((x) => x.id === editingRoutine.id), list[0]); return d; });
            setEditingRoutine(null);
          }}
          onDelete={() => {
            update((d) => { d.routines = d.routines.filter((x) => x.id !== editingRoutine.id); return d; });
            setEditingRoutine(null);
          }}
          onClose={() => setEditingRoutine(null)}
        />
      )}
    </div>
  );
}

function DetailInput({ type, current, onSave }) {
  const [txt, setTxt] = useState(current);
  const presets = { feed: MEAL_OPTS, med: ["잘 먹음", "거부함", "토해냄"], poop: POOP_OPTS }[type] || [];
  return (
    <div style={{ ...S.card, marginTop: 6, background: "#FBFCFA" }}>
      {presets.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {presets.map((p) => (
            <button key={p} style={{ ...S.chip, ...(txt === p ? S.chipOn : {}), padding: "5px 10px", fontSize: 12 }} onClick={() => setTxt(p)}>{p}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        <KInput style={{ ...S.input, marginBottom: 0, flex: 1 }} value={txt} onChange={(e) => setTxt(e.target.value)}
          placeholder={type === "water" ? "음수량 예: 180ml" : type === "fluid" ? "투여량 예: 100ml" : "메모"} />
        <button style={{ ...S.primaryBtn, width: "auto", padding: "0 16px" }} onClick={() => onSave(txt)}>저장</button>
      </div>
    </div>
  );
}

/* ───────────── 기록 탭 ───────────── */
function LogView({ data, update }) {
  const date = todayStr();
  const cond = data.conditionLogs[date] || {};
  const [period, setPeriod] = useState(7);   // 1 | 7 | 30 | 0(전체)
  const [pickedStart, setPickedStart] = useState("");   // 기간 선택 시작일 (""이면 기간 선택 꺼짐)
  const [pickedEnd, setPickedEnd] = useState("");       // 기간 선택 종료일 (시작일과 같으면 하루만 보기)
  const [catFilter, setCatFilter] = useState("all");
  const [starOnly, setStarOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewerSrc, setViewerSrc] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [editRec, setEditRec] = useState(null);

  const setCond = (patch) => update((d) => { d.conditionLogs[date] = { ...(d.conditionLogs[date] || {}), ...patch }; return d; });

  /* 오늘 요약 */
  const dueToday = data.routines.filter((r) => isDue(r, date));
  const medDone = dueToday.filter((r) => r.type === "med" && data.checkLogs[date]?.[r.id]?.status === "done").length;
  const medTotal = dueToday.filter((r) => r.type === "med").length;
  const todayRecs = data.records.filter((r) => r.date === date);
  const todaySym = todayRecs.filter((r) => r.cat === "symptom");
  const todayMeal = todayRecs.find((r) => r.cat === "meal");
  const todayWater = todayRecs.filter((r) => r.cat === "water").reduce((s, r) => s + (parseFloat(r.value) || 0), 0);

  /* 넛지: 오늘 증상 */
  const symCount = {};
  todaySym.forEach((s) => (symCount[s.value] = (symCount[s.value] || 0) + 1));
  const nudge = Object.entries(symCount).map(([t, n]) => `${t} ${n}회`).join(", ");

  /* 필터링 */
  const filtered = useMemo(() => {
    return data.records.filter((r) => {
      if (pickedStart) {
        if (r.date < pickedStart || r.date > pickedEnd) return false;
      } else if (period !== 0 && daysBetween(r.date, date) >= period) return false;
      if (catFilter !== "all" && r.cat !== catFilter) return false;
      if (starOnly && !r.star) return false;
      return true;
    });
  }, [data.records, period, pickedStart, pickedEnd, catFilter, starOnly, date]);

  /* 날짜별 그룹 */
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach((r) => { (g[r.date] = g[r.date] || []).push(r); });
    return Object.entries(g).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  return (
    <div style={{ padding: "20px 16px" }}>
      <h2 style={S.h2}>기록</h2>
      <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 12px" }}>완료한 케어와 직접 남긴 기록이 쌓이는 곳이에요.</p>

      {/* 오늘 요약 */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={S.cardTitle}>오늘 요약</div>
          <div style={{ fontSize: 11, color: "#9AA5A0" }}>{fmtDate(date)}</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {medTotal > 0 && <SummaryBadge Icon={Pill} color="#7C6BAE" bg="#F1EEF8" text={`복약 ${medDone}/${medTotal}회`} />}
          {todayMeal && <SummaryBadge Icon={Utensils} color="#C07A35" bg="#F9F0E6" text={`식사 ${todayMeal.value}`} />}
          {todayWater > 0 && <SummaryBadge Icon={Droplets} color="#3E86A0" bg="#E9F3F6" text={`물 ${todayWater}ml`} />}
          {todaySym.length > 0 && <SummaryBadge Icon={Activity} color="#B65C68" bg="#F6E8EA" text={`증상 ${todaySym.length}회`} />}
          {medTotal === 0 && !todayMeal && todayWater === 0 && todaySym.length === 0 && (
            <span style={{ fontSize: 12, color: "#9AA5A0" }}>아직 오늘 기록이 없어요. 우측 하단 + 버튼으로 남겨보세요.</span>
          )}
        </div>
        {nudge && (
          <div style={{ marginTop: 10, fontSize: 12, color: "#8E3B47", background: "#F6E8EA", padding: "8px 10px", borderRadius: 8, lineHeight: 1.5 }}>
            오늘 {nudge} 기록이 있어요. 다음 진료 시 함께 확인해보세요.
          </div>
        )}
      </div>

      {/* 컨디션 */}
      <div style={{ ...S.card, marginTop: 10 }}>
        <div style={S.cardTitle}>오늘의 컨디션</div>
        <ScoreRow label="식욕" value={cond.appetite} onChange={(v) => setCond({ appetite: v })} />
        <ScoreRow label="활력" value={cond.energy} onChange={(v) => setCond({ energy: v })} />
        <button onClick={() => setCond({ noIssue: !cond.noIssue })}
          style={{ ...S.chip, ...(cond.noIssue ? S.chipOn : {}), width: "100%", marginTop: 8, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {cond.noIssue && <Check size={15} />}{cond.noIssue ? "오늘 특이사항 없음으로 기록했어요" : "오늘 특이사항 없음"}
        </button>
      </div>

      {/* 필터 */}
      {(() => {
        const activeCount = (pickedStart ? 1 : period !== 7 ? 1 : 0) + (catFilter !== "all" ? 1 : 0) + (starOnly ? 1 : 0);
        const periodLabel = pickedStart
          ? (pickedStart === pickedEnd ? fmtDate(pickedStart) : `${fmtShort(pickedStart)}~${fmtShort(pickedEnd)}`)
          : (period === 0 ? "전체 기간" : period === 1 ? "오늘" : `최근 ${period}일`);
        const parts = [periodLabel];
        if (catFilter !== "all") parts.push(CAT_META[catFilter].label);
        if (starOnly) parts.push("중요만");
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20, marginBottom: 14 }}>
            <button onClick={() => setFilterOpen(true)}
              style={{ ...S.chip, display: "flex", alignItems: "center", gap: 5, flexShrink: 0, ...(activeCount > 0 ? S.chipOn : {}) }}>
              <SlidersHorizontal size={13} /> 필터
              {activeCount > 0 && (
                <span style={{ background: "#3E7C59", color: "#FFF", borderRadius: 8, fontSize: 10, fontWeight: 700, padding: "1px 5px", marginLeft: 1 }}>{activeCount}</span>
              )}
            </button>
            <div style={{ fontSize: 12.5, color: "#556158", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {parts.join(" · ")}
            </div>
          </div>
        );
      })()}

      {filterOpen && (
        <Modal title="기록 필터" onClose={() => setFilterOpen(false)} footer={<button style={S.primaryBtn} onClick={() => setFilterOpen(false)}>적용해서 보기</button>}>
          <label style={S.label}>기간</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {[[1, "오늘"], [7, "7일"], [30, "30일"], [0, "전체"]].map(([v, l]) => (
              <button key={v} style={{ ...S.chip, ...(!pickedStart && period === v ? S.chipOn : {}) }}
                onClick={() => { setPickedStart(""); setPickedEnd(""); setPeriod(v); }}>{l}</button>
            ))}
            <button style={{ ...S.chip, ...(pickedStart ? S.chipOn : {}), display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => { if (pickedStart) { setPickedStart(""); setPickedEnd(""); } else { setPickedStart(todayStr()); setPickedEnd(todayStr()); } }}>
              <CalendarClock size={12} /> 기간 선택
            </button>
          </div>
          {pickedStart && (
            <div style={{ ...S.card, background: "#F7F9F6", marginBottom: 16, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9AA5A0", marginBottom: 4 }}>시작일</div>
              <KDateSelect value={pickedStart} max={pickedEnd || todayStr()}
                onChange={(v) => { setPickedStart(v); if (pickedEnd < v) setPickedEnd(v); }} />
              <div style={{ fontSize: 11, color: "#9AA5A0", margin: "10px 0 4px" }}>종료일</div>
              <KDateSelect value={pickedEnd} max={todayStr()}
                onChange={(v) => { setPickedEnd(v); if (v < pickedStart) setPickedStart(v); }} />
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {(() => {
                  const span = daysBetween(pickedStart, pickedEnd) + 1;
                  const atToday = pickedEnd >= todayStr();
                  return (
                    <>
                      <button style={{ ...S.chip, padding: "6px 10px", fontSize: 11.5, flex: 1 }}
                        onClick={() => { setPickedStart(addDays(pickedStart, -span)); setPickedEnd(addDays(pickedEnd, -span)); }}>
                        ◀ 이전 {span}일
                      </button>
                      <button style={{ ...S.chip, padding: "6px 10px", fontSize: 11.5, flex: 1, opacity: atToday ? 0.4 : 1 }} disabled={atToday}
                        onClick={() => { setPickedStart(addDays(pickedStart, span)); setPickedEnd(addDays(pickedEnd, span)); }}>
                        다음 {span}일 ▶
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          <label style={S.label}>유형</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            <button style={{ ...S.chip, ...(catFilter === "all" ? S.chipOn : {}) }} onClick={() => setCatFilter("all")}>전체</button>
            {Object.entries(CAT_META).map(([k, m]) => (
              <button key={k} style={{ ...S.chip, ...(catFilter === k ? { background: m.bg, borderColor: m.color, color: m.color } : {}) }} onClick={() => setCatFilter(k)}>{m.label}</button>
            ))}
          </div>

          <label style={S.label}>중요 표시</label>
          <button style={{ ...S.chip, ...(starOnly ? { background: "#FDF6E3", borderColor: "#C9A227", color: "#8A6D0B" } : {}), display: "flex", alignItems: "center", gap: 5, width: "fit-content" }}
            onClick={() => setStarOnly(!starOnly)}>
            <Star size={13} fill={starOnly ? "#C9A227" : "none"} /> 중요 표시한 기록만
          </button>

          {(pickedStart || period !== 7 || catFilter !== "all" || starOnly) && (
            <button style={{ ...S.secondaryBtn, marginTop: 20 }}
              onClick={() => { setPickedStart(""); setPickedEnd(""); setPeriod(7); setCatFilter("all"); setStarOnly(false); }}>
              필터 초기화
            </button>
          )}
        </Modal>
      )}
      {/* 타임라인 */}
      {grouped.length === 0 && (
        <div style={S.empty}>
          {pickedStart ? <>{pickedStart === pickedEnd ? `${fmtDate(pickedStart)}에는` : `${fmtDate(pickedStart)} ~ ${fmtDate(pickedEnd)}에는`} 기록이 없어요.<br />위 버튼으로 다른 기간을 둘러보세요.</> : <>조건에 맞는 기록이 없어요.<br />우측 하단 + 버튼으로 첫 기록을 남겨보세요.</>}
        </div>
      )}
      {grouped.map(([dt, recs]) => (
        <div key={dt} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#556158", margin: "0 0 6px 2px" }}>
            {dt === date ? "오늘" : fmtDate(dt)}
          </div>
          {recs.map((r) => {
            const m = CAT_META[r.cat]; const I = m.Icon;
            return (
              <div key={r.id} style={{ ...S.card, marginBottom: 6, padding: "11px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <I size={15} color={m.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#1F2E26" }}>
                      {m.label}
                      {r.cat !== "memo" && r.value !== "" && <span style={{ color: m.color }}> · {r.value}{m.unit || ""}</span>}
                    </div>
                    {r.memo && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 1 }}>{r.memo}</div>}
                  </div>
                  <div style={{ fontSize: 11, color: "#9AA5A0", flexShrink: 0 }}>{r.time}</div>
                  <button style={S.iconBtn} onClick={() => setEditRec(r)}>
                    <Pencil size={14} color="#6B7280" />
                  </button>
                  <button style={S.iconBtn} onClick={() => update((d) => { const t = d.records.find((x) => x.id === r.id); t.star = !t.star; return d; })}>
                    <Star size={15} color={r.star ? "#C9A227" : "#C9CFCA"} fill={r.star ? "#C9A227" : "none"} />
                  </button>
                  <button style={S.iconBtn} onClick={() => { (r.photos || []).forEach(deletePhotoData); update((d) => { d.records = d.records.filter((x) => x.id !== r.id); return d; }); }}>
                    <Trash2 size={14} color="#B65C68" />
                  </button>
                </div>
                {r.photos?.length > 0 && (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, marginLeft: 42 }}>
                    {r.photos.map((pid) => (
                      <StoredPhoto key={pid} pid={pid} size={44} onClick={(src) => setViewerSrc(src)} onPlayVideo={(vid) => setPlayingVideo(vid)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {viewerSrc && <PhotoViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />}
      {playingVideo && <VideoViewer pid={playingVideo} onClose={() => setPlayingVideo(null)} />}
      {editRec && (
        <QuickRecordSheet
          petName={data.pet.name}
          initial={editRec}
          onSave={(rec) => {
            update((d) => {
              const t = d.records.find((x) => x.id === editRec.id);
              if (t) Object.assign(t, rec);
              d.records.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
              return d;
            });
            setEditRec(null);
          }}
          onClose={() => setEditRec(null)}
        />
      )}
    </div>
  );
}

function SummaryBadge({ Icon, color, bg, text }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, color, fontSize: 12, fontWeight: 600, padding: "6px 10px", borderRadius: 10 }}>
      <Icon size={13} />{text}
    </span>
  );
}

function ScoreRow({ label, value, onChange }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <div style={{ width: 36, fontSize: 13, fontWeight: 600, color: "#1F2E26" }}>{label}</div>
      <div style={{ display: "flex", gap: 5, flex: 1 }}>
        {[0, 1, 2, 3, 4, 5].map((v) => (
          <button key={v} onClick={() => onChange(v)}
            style={{ flex: 1, height: 34, borderRadius: 9, border: "1px solid " + (value === v ? "#3E7C59" : "#E5EAE6"), background: value === v ? "#3E7C59" : "#FFF", color: value === v ? "#FFF" : "#6B7280", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────── 리포트 탭 ───────────── */
function buildReportStats(data, dates) {
  let dueTotal = 0, doneTotal = 0, skipTotal = 0, medDue = 0, medDone = 0;
  dates.forEach((dt) => {
    data.routines.forEach((r) => {
      if (!isDue(r, dt)) return;
      dueTotal++;
      const st = data.checkLogs[dt]?.[r.id]?.status;
      if (st === "done") doneTotal++;
      if (st === "skipped") skipTotal++;
      if (r.type === "med") { medDue++; if (st === "done") medDone++; }
    });
  });
  const inRange = (r) => dates.includes(r.date);
  const sym = data.records.filter((r) => r.cat === "symptom" && inRange(r));
  const symByType = {};
  sym.forEach((s) => (symByType[s.value] = (symByType[s.value] || 0) + 1));
  const mealLow = data.records.filter((r) => r.cat === "meal" && inRange(r) && (r.value === "조금" || r.value === "거부")).length;
  const weights = data.records.filter((r) => r.cat === "weight" && inRange(r)).sort((a, b) => a.date.localeCompare(b.date));
  const weightDelta = weights.length >= 2 ? Math.round((weights[weights.length - 1].value - weights[0].value) * 100) / 100 : null;
  return { dates, dueTotal, doneTotal, skipTotal, missTotal: dueTotal - doneTotal - skipTotal, medDue, medDone, sym, symByType, mealLow, weights, weightDelta };
}

/* 이상 신호 감지: 최근 며칠과 그 이전 기간을 비교해 눈에 띄는 변화만 안내 (진단이 아닌 참고용) */
function detectAnomalies(data) {
  const today = todayStr();
  const recentDates = Array.from({ length: 3 }, (_, i) => offsetDate(-i));
  const baseDates = Array.from({ length: 11 }, (_, i) => offsetDate(-(i + 3))); // 그 이전 11일

  const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const alerts = [];

  // 1) 음수량 변화
  const waterOf = (dates) => {
    const byDate = {};
    data.records.filter((r) => r.cat === "water" && dates.includes(r.date)).forEach((r) => (byDate[r.date] = (byDate[r.date] || 0) + (parseFloat(r.value) || 0)));
    return Object.values(byDate);
  };
  const recentWater = avg(waterOf(recentDates));
  const baseWater = avg(waterOf(baseDates));
  if (recentWater !== null && baseWater !== null && baseWater > 0) {
    const diff = Math.round(((recentWater - baseWater) / baseWater) * 100);
    if (diff >= 30) alerts.push({ color: "#3E86A0", bg: "#E9F3F6", title: "음수량이 늘었어요", detail: `최근 3일 평균 ${Math.round(recentWater)}ml, 이전 평균보다 ${diff}% 늘었어요.` });
  }

  // 2) 식욕 점수 하락
  const appetiteOf = (dates) => dates.map((dt) => data.conditionLogs[dt]?.appetite).filter((v) => v !== undefined && v !== null);
  const recentApp = avg(appetiteOf(recentDates));
  const baseApp = avg(appetiteOf(baseDates));
  if (recentApp !== null && baseApp !== null && baseApp - recentApp >= 1.2) {
    alerts.push({ color: "#C07A35", bg: "#F9F0E6", title: "식욕이 떨어졌어요", detail: `최근 3일 평균 식욕 점수 ${recentApp.toFixed(1)}점, 이전 평균 ${baseApp.toFixed(1)}점보다 낮아요.` });
  }

  // 3) 증상 발생 증가 (이번 주 vs 지난 주)
  const thisWeek = Array.from({ length: 7 }, (_, i) => offsetDate(-i));
  const lastWeek = Array.from({ length: 7 }, (_, i) => offsetDate(-(i + 7)));
  const symCount = (dates) => data.records.filter((r) => r.cat === "symptom" && dates.includes(r.date)).length;
  const thisWeekSym = symCount(thisWeek);
  const lastWeekSym = symCount(lastWeek);
  if (thisWeekSym >= 2 && thisWeekSym > lastWeekSym) {
    alerts.push({ color: "#B65C68", bg: "#F6E8EA", title: "증상 기록이 늘었어요", detail: `이번 주 ${thisWeekSym}회, 지난주 ${lastWeekSym}회였어요.` });
  }

  // 4) 체중 변화
  const weights = data.records.filter((r) => r.cat === "weight").sort((a, b) => a.date.localeCompare(b.date));
  if (weights.length >= 2) {
    const latest = weights[weights.length - 1];
    const prior = [...weights].reverse().find((w) => daysBetween(w.date, latest.date) >= 10) || weights[0];
    if (prior !== latest && prior.value > 0) {
      const pct = Math.round(((latest.value - prior.value) / prior.value) * 1000) / 10;
      if (pct <= -5) alerts.push({ color: "#7C6BAE", bg: "#F1EEF8", title: "체중이 줄었어요", detail: `${prior.value}kg → ${latest.value}kg (${pct}%), ${fmtDate(prior.date)} 대비예요.` });
    }
  }

  return alerts;
}

function ReportView({ data }) {
  const desktop = useIsDesktop();
  const todayReal = todayStr();
  const [days, setDays] = useState(14);
  const [useCustom, setUseCustom] = useState(false);
  const [customStart, setCustomStart] = useState(offsetDate(-14));
  const [customEnd, setCustomEnd] = useState(todayReal);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const dates = useMemo(() => {
    if (useCustom) {
      const start = customStart <= customEnd ? customStart : customEnd;
      const end = customStart <= customEnd ? customEnd : customStart;
      const span = Math.min(daysBetween(start, end), 365); // 최대 1년으로 제한
      const arr = [];
      for (let i = 0; i <= span; i++) arr.push(addDays(start, i));
      return arr;
    }
    const arr = [];
    for (let i = days - 1; i >= 0; i--) arr.push(offsetDate(-i));
    return arr;
  }, [useCustom, customStart, customEnd, days]);

  const st = useMemo(() => buildReportStats(data, dates), [data, dates]);
  const compliance = st.dueTotal ? Math.round((st.doneTotal / st.dueTotal) * 100) : null;
  const medRate = st.medDue ? Math.round((st.medDone / st.medDue) * 100) : null;
  const lastVisit = [...data.vetVisits].sort((a, b) => b.date.localeCompare(a.date))[0];
  const upcoming = (data.nextVisits || []).filter((v) => daysBetween(todayReal, v.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const nv = upcoming[0];
  const dLeft = nv ? daysBetween(todayReal, nv.date) : null;

  const inRange = (r) => st.dates.includes(r.date);
  const appetiteData = st.dates
    .map((dt) => ({ d: fmtShort(dt), 식욕: data.conditionLogs[dt]?.appetite ?? null, 활력: data.conditionLogs[dt]?.energy ?? null }))
    .filter((x) => x.식욕 !== null || x.활력 !== null);
  const weightData = st.weights.map((m) => ({ d: fmtShort(m.date), 체중: m.value }));
  const waterByDate = {};
  data.records.filter((r) => r.cat === "water" && inRange(r)).forEach((r) => (waterByDate[r.date] = (waterByDate[r.date] || 0) + (parseFloat(r.value) || 0)));
  const waterData = Object.entries(waterByDate).sort((a, b) => a[0].localeCompare(b[0])).map(([dt, v]) => ({ d: fmtShort(dt), 음수량: v }));
  const breathData = data.records.filter((r) => r.cat === "breath" && inRange(r)).sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ d: fmtShort(r.date), 호흡수: r.value }));

  // 식사량: 거부0 · 조금1 · 절반2 · 전부먹음3, 같은 날 여러 번이면 평균
  const MEAL_SCORE = { "거부": 0, "조금": 1, "절반": 2, "전부 먹음": 3 };
  const mealByDate = {};
  data.records.filter((r) => r.cat === "meal" && inRange(r)).forEach((r) => {
    const s = MEAL_SCORE[r.value];
    if (s === undefined) return;
    (mealByDate[r.date] = mealByDate[r.date] || []).push(s);
  });
  const mealData = Object.entries(mealByDate).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dt, arr]) => ({ d: fmtShort(dt), 식사량: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10 }));

  // 배변 상태: 그 날 하나라도 이상(설사/혈변/무배변)이면 이상으로 표시
  const poopByDate = {};
  data.records.filter((r) => r.cat === "poop" && inRange(r)).forEach((r) => {
    const abnormal = r.value !== "정상";
    poopByDate[r.date] = poopByDate[r.date] ? (poopByDate[r.date] || abnormal) : abnormal;
  });
  const poopData = Object.entries(poopByDate).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dt, abnormal]) => ({ d: fmtShort(dt), 값: 1, 상태: abnormal ? "이상" : "정상" }));

  // 증상 발생 횟수(일자별)
  const symByDate = {};
  st.sym.forEach((s) => (symByDate[s.date] = (symByDate[s.date] || 0) + 1));
  const symDailyData = Object.entries(symByDate).sort((a, b) => a[0].localeCompare(b[0])).map(([dt, n]) => ({ d: fmtShort(dt), 증상: n }));

  // 일별 케어 수행률(%)
  const complianceDailyData = st.dates.map((dt) => {
    let due = 0, done = 0;
    data.routines.forEach((r) => { if (isDue(r, dt)) { due++; if (data.checkLogs[dt]?.[r.id]?.status === "done") done++; } });
    return due ? { d: fmtShort(dt), 수행률: Math.round((done / due) * 100) } : null;
  }).filter(Boolean);

  return (
    <div style={{ padding: "20px 16px" }}>
      <h2 style={S.h2}>리포트</h2>
      <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 12px" }}>{data.pet.name}의 최근 건강 기록을 요약했어요.</p>
      <div style={{ display: "flex", gap: 6, marginBottom: useCustom ? 10 : 14, flexWrap: "wrap" }}>
        {[7, 14, 30].map((d) => (
          <button key={d} style={{ ...S.chip, ...(!useCustom && days === d ? S.chipOn : {}) }} onClick={() => { setUseCustom(false); setDays(d); }}>최근 {d}일</button>
        ))}
        <button style={{ ...S.chip, ...(useCustom ? S.chipOn : {}) }} onClick={() => setUseCustom((v) => !v)}>기간 지정</button>
      </div>
      {useCustom && (
        <div style={{ ...S.card, marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#9AA5A0", marginBottom: 4 }}>시작일</div>
          <KDateSelect value={customStart} max={todayReal} onChange={setCustomStart} />
          <div style={{ fontSize: 11, color: "#9AA5A0", margin: "10px 0 4px" }}>종료일</div>
          <KDateSelect value={customEnd} max={todayReal} onChange={setCustomEnd} />
        </div>
      )}

      {/* 요약 헤더 */}
      <div style={{ ...S.card, background: "#2F5E45", color: "#FFF", border: "none" }}>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          {data.pet.name}{data.pet.tags?.[0] ? ` · ${data.pet.tags[0]}` : ""} · {fmtDate(st.dates[0])} ~ {fmtDate(st.dates[st.dates.length - 1])}
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{medRate === null ? "—" : medRate + "%"}</div><div style={{ fontSize: 11, opacity: 0.85 }}>복약 완료율</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{st.sym.length}회</div><div style={{ fontSize: 11, opacity: 0.85 }}>증상 기록</div></div>
          <div><div style={{ fontSize: 24, fontWeight: 700 }}>{st.mealLow}회</div><div style={{ fontSize: 11, opacity: 0.85 }}>식사량 감소</div></div>
          {nv && dLeft >= 0 && <div><div style={{ fontSize: 24, fontWeight: 700 }}>D-{dLeft}</div><div style={{ fontSize: 11, opacity: 0.85 }}>다음 진료</div></div>}
        </div>
        {lastVisit && (
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,.2)" }}>
            지난 진료 {fmtDate(lastVisit.date)} · {lastVisit.hospital}
            {nv && ` / 다음 진료 ${fmtDate(nv.date)}${nv.time ? ` ${nv.time}` : ""} · ${nv.hospital}`}
            {upcoming.length > 1 && ` 외 ${upcoming.length - 1}건`}
          </div>
        )}
      </div>

      {/* 이상 신호 감지 (진단이 아닌 참고용 안내) */}
      {(() => {
        const alerts = detectAnomalies(data);
        if (alerts.length === 0) return null;
        return (
          <div style={{ ...S.card, marginTop: 12, borderColor: "#E8C9AE" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
              <Activity size={15} color="#B0682E" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2E26" }}>확인해보세요</span>
            </div>
            {alerts.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 8px", background: a.bg, borderRadius: 10, marginBottom: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: a.color, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#1F2E26" }}>{a.title}</div>
                  <div style={{ fontSize: 11.5, color: "#556158" }}>{a.detail}</div>
                </div>
              </div>
            ))}
            <p style={{ fontSize: 10.5, color: "#9AA5A0", margin: "4px 0 0", lineHeight: 1.5 }}>
              최근 3일과 그 이전 기록을 단순 비교한 참고 정보예요. 진단이 아니며, 변화가 계속되면 병원에 확인해보세요.
            </p>
          </div>
        );
      })()}

      {/* 진료 전 요약 */}
      <button style={{ ...S.card, width: "100%", cursor: "pointer", marginTop: 12, display: "flex", alignItems: "center", gap: 12, textAlign: "left" }} onClick={() => setSummaryOpen(true)}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: "#EAF3EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Stethoscope size={18} color="#3E7C59" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2E26" }}>진료 전 요약 보기</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>수의사에게 보여주거나 복사해서 보낼 수 있어요</div>
        </div>
        <ChevronRight size={16} color="#9AA5A0" />
      </button>

      {/* 케어 수행 분해 */}
      {st.dueTotal > 0 && (
        <div style={{ ...S.card, marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 92, height: 92, flexShrink: 0 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={[
                  { name: "완료", value: st.doneTotal, color: "#3E7C59" },
                  { name: "건너뜀", value: st.skipTotal, color: "#C9A227" },
                  { name: "미수행", value: st.missTotal, color: "#D7DDD8" },
                ].filter((d) => d.value > 0)} dataKey="value" innerRadius="65%" outerRadius="100%" paddingAngle={2} stroke="none">
                  {[
                    { name: "완료", value: st.doneTotal, color: "#3E7C59" },
                    { name: "건너뜀", value: st.skipTotal, color: "#C9A227" },
                    { name: "미수행", value: st.missTotal, color: "#D7DDD8" },
                  ].filter((d) => d.value > 0).map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={S.cardTitle}>케어 수행률 {compliance}%</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#556158" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#3E7C59", flexShrink: 0 }} />완료 {st.doneTotal}건</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#C9A227", flexShrink: 0 }} />건너뜀 {st.skipTotal}건</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: "#D7DDD8", flexShrink: 0 }} />미수행 {st.missTotal}건</span>
            </div>
          </div>
        </div>
      )}

      {/* 증상 요약 */}
      {Object.keys(st.symByType).length > 0 && (
        <div style={{ ...S.card, marginTop: 12 }}>
          <div style={S.cardTitle}>증상 기록 요약</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {(() => {
              const entries = Object.entries(st.symByType).sort((a, b) => b[1] - a[1]);
              const max = Math.max(...entries.map(([, n]) => n));
              return entries.map(([t, n]) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 64, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: "#1F2E26" }}>{t}</div>
                  <div style={{ flex: 1, height: 16, borderRadius: 8, background: "#F6E8EA", overflow: "hidden" }}>
                    <div style={{ width: `${(n / max) * 100}%`, height: "100%", borderRadius: 8, background: "#B65C68" }} />
                  </div>
                  <div style={{ width: 28, flexShrink: 0, textAlign: "right", fontSize: 12.5, fontWeight: 700, color: "#B65C68" }}>{n}회</div>
                </div>
              ));
            })()}
          </div>
          <div style={{ marginTop: 10 }}>
            {st.sym.slice(0, 10).map((s) => (
              <div key={s.id} style={{ fontSize: 12, color: "#6B7280", padding: "3px 0", display: "flex", alignItems: "center", gap: 4 }}>
                {s.star && <Star size={11} color="#C9A227" fill="#C9A227" />}
                {fmtDate(s.date)} {s.time} · <b style={{ color: "#1F2E26" }}>{s.value}</b>{s.memo && ` — ${s.memo}`}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 체중 변화 요약 */}
      {st.weightDelta !== null && (
        <div style={{ ...S.card, marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: "#F1EEF8", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Scale size={18} color="#7C6BAE" />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1F2E26" }}>
              체중 변화 <span style={{ color: st.weightDelta < 0 ? "#B65C68" : "#3E7C59" }}>{st.weightDelta > 0 ? "+" : ""}{st.weightDelta}kg</span>
            </div>
            <div style={{ fontSize: 12, color: "#6B7280" }}>현재 {st.weights[st.weights.length - 1].value}kg · 기간 내 {st.weights.length}회 측정</div>
          </div>
        </div>
      )}

      <div style={desktop ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" } : undefined}>
      {appetiteData.length > 0 && (
        <ChartCard title="식욕·활력 추이 (0~5)">
          <LineChart data={appetiteData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis domain={[0, 5]} tick={{ fontSize: 10 }} width={24} /><Tooltip />
            <Line type="monotone" dataKey="식욕" stroke="#3E7C59" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            <Line type="monotone" dataKey="활력" stroke="#C07A35" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
          </LineChart>
        </ChartCard>
      )}
      {weightData.length > 0 && (
        <ChartCard title="체중 추이 (kg)">
          <LineChart data={weightData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={34} /><Tooltip />
            <Line type="monotone" dataKey="체중" stroke="#7C6BAE" strokeWidth={2} dot={{ r: 2.5 }} />
          </LineChart>
        </ChartCard>
      )}
      {waterData.length > 0 && (
        <ChartCard title="음수량 추이 (ml/일)">
          <LineChart data={waterData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} width={34} /><Tooltip />
            <Line type="monotone" dataKey="음수량" stroke="#3E86A0" strokeWidth={2} dot={{ r: 2.5 }} />
          </LineChart>
        </ChartCard>
      )}
      {breathData.length > 0 && (
        <ChartCard title="호흡수 추이 (회/분)">
          <LineChart data={breathData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={30} /><Tooltip />
            <Line type="monotone" dataKey="호흡수" stroke="#5B7FB9" strokeWidth={2} dot={{ r: 2.5 }} />
          </LineChart>
        </ChartCard>
      )}
      {complianceDailyData.length > 0 && (
        <ChartCard title="일별 케어 수행률 (%)">
          <BarChart data={complianceDailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis domain={[0, 100]} tick={{ fontSize: 10 }} width={30} /><Tooltip />
            <Bar dataKey="수행률" radius={[4, 4, 0, 0]}>
              {complianceDailyData.map((e, i) => <Cell key={i} fill={e.수행률 >= 80 ? "#3E7C59" : e.수행률 >= 50 ? "#C9A227" : "#B65C68"} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      )}
      {mealData.length > 0 && (
        <ChartCard title="식사량 추이 (0=거부 ~ 3=전부 먹음)">
          <BarChart data={mealData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis domain={[0, 3]} tick={{ fontSize: 10 }} width={24} /><Tooltip />
            <Bar dataKey="식사량" fill="#C07A35" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      )}
      {poopData.length > 0 && (
        <ChartCard title="배변 상태 (막대가 있으면 기록된 날)">
          <BarChart data={poopData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis hide domain={[0, 1]} /><Tooltip formatter={(v, n, p) => [p.payload.상태, "배변"]} />
            <Bar dataKey="값" radius={[4, 4, 0, 0]}>
              {poopData.map((e, i) => <Cell key={i} fill={e.상태 === "이상" ? "#B65C68" : "#8B7355"} />)}
            </Bar>
          </BarChart>
        </ChartCard>
      )}
      {symDailyData.length > 0 && (
        <ChartCard title="증상 발생 횟수 (일별)">
          <BarChart data={symDailyData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EEF1EE" />
            <XAxis dataKey="d" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} /><Tooltip />
            <Bar dataKey="증상" fill="#B65C68" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      )}

      </div>
      {st.dueTotal === 0 && st.sym.length === 0 && appetiteData.length === 0 && weightData.length === 0 && waterData.length === 0
        && breathData.length === 0 && mealData.length === 0 && poopData.length === 0 && symDailyData.length === 0 && complianceDailyData.length === 0 && (
        <div style={S.empty}>아직 리포트를 만들 기록이 부족해요.<br />케어 체크와 기록을 남기면 변화 흐름이 여기에 나타나요.</div>
      )}
      <p style={{ fontSize: 11, color: "#9AA5A0", marginTop: 16, textAlign: "center", lineHeight: 1.6 }}>
        입력한 기록을 기준으로 정리한 내용이며, 진단이나 치료 판단을 제공하지 않습니다.
      </p>

      {summaryOpen && <PreVisitSummary data={data} st={st} medRate={medRate} compliance={compliance} onClose={() => setSummaryOpen(false)} />}
    </div>
  );
}

function PreVisitSummary({ data, st, medRate, compliance, onClose }) {
  const [shareState, setShareState] = useState("");
  const today = todayStr();
  const upcoming = (data.nextVisits || []).filter((v) => daysBetween(today, v.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const lines = [];
  lines.push(`[${data.pet.name} 진료 전 요약] ${fmtDate(st.dates[0])} ~ ${fmtDate(st.dates[st.dates.length - 1])}`);
  lines.push(`${[data.pet.age, data.pet.breed || data.pet.species].filter(Boolean).join(" ")}${data.pet.tags?.length ? " / " + data.pet.tags.join(", ") : ""}`);
  lines.push("");
  if (medRate !== null) lines.push(`· 복약 완료율 ${medRate}% (전체 케어 수행률 ${compliance}%, 완료 ${st.doneTotal} / 건너뜀 ${st.skipTotal} / 미수행 ${st.missTotal})`);
  if (st.sym.length) {
    lines.push(`· 증상 ${st.sym.length}회: ${Object.entries(st.symByType).map(([t, n]) => `${t} ${n}회`).join(", ")}`);
    st.sym.slice(0, 8).forEach((s) => lines.push(`   - ${fmtDate(s.date)} ${s.time} ${s.value}${s.memo ? ` (${s.memo})` : ""}`));
  } else lines.push("· 기간 내 이상 증상 기록 없음");
  if (st.mealLow) lines.push(`· 식사량 감소(조금/거부) ${st.mealLow}회`);
  if (st.weightDelta !== null) lines.push(`· 체중 ${st.weights[0].value}kg → ${st.weights[st.weights.length - 1].value}kg (${st.weightDelta > 0 ? "+" : ""}${st.weightDelta}kg)`);
  if (upcoming.length === 1) {
    const nv = upcoming[0];
    lines.push(`· 다음 진료 예정: ${fmtDate(nv.date)}${nv.time ? ` ${nv.time}` : ""} ${nv.hospital}${nv.purpose ? ` (${nv.purpose})` : ""}`);
  } else if (upcoming.length > 1) {
    lines.push(`· 다음 진료 예정 ${upcoming.length}건:`);
    upcoming.forEach((nv) => lines.push(`   - ${fmtDate(nv.date)}${nv.time ? ` ${nv.time}` : ""} ${nv.hospital}${nv.purpose ? ` (${nv.purpose})` : ""}`));
  }
  const text = lines.join("\n");

  const copyFallback = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setShareState("copied");
      setTimeout(() => setShareState(""), 2000);
    } catch {
      setShareState("error");
      setTimeout(() => setShareState(""), 2000);
    }
  };

  const share = async () => {
    const canUseNativeShare =
      navigator.share &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
      (!navigator.canShare || navigator.canShare({ title: `${data.pet.name} 진료 전 요약`, text }));

    if (canUseNativeShare) {
      try {
        await navigator.share({ title: `${data.pet.name} 진료 전 요약`, text });
        setShareState("shared");
        setTimeout(() => setShareState(""), 2000);
        return;
      } catch (e) {
        if (e?.name === "AbortError") {
          setShareState("");
          return;
        }
      }
    }
    copyFallback();
  };

  return (
    <Modal title="진료 전 요약" onClose={onClose}
      footer={
        <>
          <button style={{ ...S.primaryBtn, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={share}>
            <Share2 size={15} /> {shareState === "shared" ? "공유했어요" : shareState === "copied" ? "복사됐어요" : "공유하기"}
          </button>
          <p style={{ fontSize: 11, color: "#9AA5A0", marginTop: 8, marginBottom: 0, textAlign: "center", lineHeight: 1.6 }}>
            공유가 지원되지 않는 환경에서는 요약 텍스트가 자동으로 복사돼요.
            {shareState === "error" ? " 복사 권한이 막혀 있어 직접 선택해 복사해주세요." : ""}
          </p>
        </>
      }>
      <div>
        <pre style={{ background: "#F7F9F6", borderRadius: 12, padding: 14, fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#1F2E26", fontFamily: "inherit", margin: 0 }}>
          {text}
        </pre>
      </div>
    </Modal>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{ ...S.card, marginTop: 12 }}>
      <div style={S.cardTitle}>{title}</div>
      <div style={{ width: "100%", height: 180 }}><ResponsiveContainer>{children}</ResponsiveContainer></div>
    </div>
  );
}

/* ───────────── 병원 탭 ───────────── */
function HospitalView({ data, update }) {
  const [editNext, setEditNext] = useState(null); // null | 'new' | visit
  const [editVisit, setEditVisit] = useState(null);
  const [viewerSrc, setViewerSrc] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);
  const today = todayStr();
  const upcoming = [...(data.nextVisits || [])].sort((a, b) => a.date.localeCompare(b.date));
  const visits = [...data.vetVisits].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div style={{ padding: "20px 16px" }}>
      <h2 style={S.h2}>병원 진료</h2>
      <p style={{ fontSize: 12, color: "#6B7280", margin: "4px 0 12px" }}>{data.pet.name}의 진료 예정과 다녀온 기록을 모아봤어요.</p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h3 style={S.h3}>다음 진료 예정</h3>
        <button style={{ ...S.chip, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }} onClick={() => setEditNext("new")}>
          <Plus size={14} /> 예정 추가
        </button>
      </div>

      {upcoming.length === 0 && (
        <div style={{ ...S.card, marginBottom: 4 }}>
          <div style={{ fontSize: 13, color: "#9AA5A0" }}>예정된 진료가 없어요. 위 버튼으로 추가해보세요. 같은 달에 다른 병원 일정이 있다면 각각 따로 추가할 수 있어요.</div>
        </div>
      )}

      {upcoming.map((v) => {
        const dLeft = daysBetween(today, v.date);
        const overdue = dLeft < 0;
        return (
          <div key={v.id} style={{ ...S.card, marginBottom: 8, background: !overdue && dLeft <= 3 ? "#FDF3EC" : "#FFF", borderColor: !overdue && dLeft <= 3 ? "#E8C9AE" : "#E5EAE6" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CalendarClock size={24} color={overdue ? "#B65C68" : dLeft <= 3 ? "#B0682E" : "#3E7C59"} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1F2E26" }}>
                  {fmtDate(v.date)}{v.time && <span style={{ fontWeight: 600, color: "#556158" }}> {v.time}</span>}
                  <span style={{ fontSize: 12, marginLeft: 8, color: overdue ? "#B65C68" : "#3E7C59" }}>
                    {dLeft === 0 ? "오늘" : dLeft > 0 ? `D-${dLeft}` : `${-dLeft}일 지남`}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#556158", marginTop: 2 }}>{v.hospital}</div>
                {v.purpose && <div style={{ fontSize: 12, color: "#6B7280" }}>{v.purpose}</div>}
              </div>
              <button style={S.iconBtn} onClick={() => setEditNext(v)}><Pencil size={14} color="#6B7280" /></button>
            </div>
            {overdue && (
              <div style={{ fontSize: 12, color: "#8E3B47", marginTop: 8, background: "#F6E8EA", padding: "8px 10px", borderRadius: 8 }}>
                진료일이 지났어요. 다녀오셨다면 아래 "기록 추가"로 결과를 남기고, 이 예정은 삭제해주세요.
              </div>
            )}
          </div>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24 }}>
        <h3 style={S.h3}>진료 기록</h3>
        <button style={{ ...S.chip, display: "flex", alignItems: "center", gap: 4, fontSize: 12 }} onClick={() => setEditVisit("new")}>
          <Plus size={14} /> 기록 추가
        </button>
      </div>

      {visits.length === 0 && (
        <div style={S.empty}>아직 진료 기록이 없어요.<br />다녀온 진료의 결과와 소견을 남겨두면<br />다음 진료 때 비교하기 좋아요.</div>
      )}

      <div style={{ marginTop: 10 }}>
        {visits.map((v) => (
          <div key={v.id} style={{ ...S.card, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Building2 size={16} color="#3E7C59" />
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1F2E26", flex: 1 }}>{fmtDate(v.date)} · {v.hospital}</div>
              <button style={S.iconBtn} onClick={() => setEditVisit(v)}><Pencil size={14} color="#6B7280" /></button>
            </div>
            {v.reason && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>진료 사유: {v.reason}</div>}
            {v.result && (
              <div style={{ fontSize: 13, color: "#1F2E26", marginTop: 8, background: "#F7F9F6", padding: "10px 12px", borderRadius: 10, lineHeight: 1.6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#2F5E45", marginBottom: 3 }}>결과·소견</div>{v.result}
              </div>
            )}
            {v.rx && (
              <div style={{ fontSize: 13, color: "#1F2E26", marginTop: 6, background: "#F1EEF8", padding: "10px 12px", borderRadius: 10, lineHeight: 1.6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7C6BAE", marginBottom: 3 }}>처방·변경 사항</div>{v.rx}
              </div>
            )}
            {v.photos?.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {v.photos.map((pid) => (
                  <StoredPhoto key={pid} pid={pid} size={52} onClick={(src) => setViewerSrc(src)} onPlayVideo={(vid) => setPlayingVideo(vid)} />
                ))}
              </div>
            )}
            {v.pdfs?.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {v.pdfs.map((pid) => <StoredPdfRow key={pid} pid={pid} />)}
              </div>
            )}
          </div>
        ))}
      </div>
      {viewerSrc && <PhotoViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />}
      {playingVideo && <VideoViewer pid={playingVideo} onClose={() => setPlayingVideo(null)} />}

      {editNext && (
        <NextVisitEditor
          current={editNext === "new" ? null : editNext}
          onSave={(next) => {
            update((d) => {
              if (next === null) { d.nextVisits = d.nextVisits.filter((x) => x.id !== editNext.id); return d; }
              if (editNext === "new") d.nextVisits.push({ ...next, id: uid() });
              else Object.assign(d.nextVisits.find((x) => x.id === editNext.id), next);
              return d;
            });
            setEditNext(null);
          }}
          onClose={() => setEditNext(null)} />
      )}
      {editVisit && (
        <VisitEditor
          visit={editVisit === "new" ? null : editVisit}
          defaultHospital={visits[0]?.hospital || upcoming[0]?.hospital || ""}
          onSave={(v, nextDate, nextTime) => {
            update((d) => {
              if (editVisit === "new") d.vetVisits.push({ ...v, id: uid() });
              else Object.assign(d.vetVisits.find((x) => x.id === editVisit.id), v);
              if (nextDate) d.nextVisits.push({ id: uid(), date: nextDate, time: nextTime || "", hospital: v.hospital, purpose: "" });
              return d;
            });
            setEditVisit(null);
          }}
          onDelete={editVisit !== "new" ? () => { (editVisit.photos || []).forEach(deletePhotoData); (editVisit.pdfs || []).forEach(deletePdfData); update((d) => { d.vetVisits = d.vetVisits.filter((x) => x.id !== editVisit.id); return d; }); setEditVisit(null); } : null}
          onClose={() => setEditVisit(null)} />
      )}
    </div>
  );
}

function NextVisitEditor({ current, onSave, onClose }) {
  const [date, setDate] = useState(current?.date || todayStr());
  const [time, setTime] = useState(current?.time || "");
  const [hospital, setHospital] = useState(current?.hospital || "");
  const [purpose, setPurpose] = useState(current?.purpose || "");
  const isToday = date === todayStr();
  const isPastTime = isToday && time && time <= nowTime();
  const canSave = hospital.trim() && !isPastTime;
  return (
    <Modal title={current ? "진료 예정 수정" : "진료 예정 추가"} onClose={onClose}
      footer={
        <>
          <button style={{ ...S.primaryBtn, opacity: canSave ? 1 : 0.4 }} disabled={!canSave}
            onClick={() => onSave({ date, time, hospital: hospital.trim(), purpose: purpose.trim() })}>저장</button>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={S.secondaryBtn} onClick={onClose}>취소</button>
            {current && <button style={{ ...S.secondaryBtn, color: "#B65C68", borderColor: "#E9CDD1" }} onClick={() => onSave(null)}>이 예정 삭제</button>}
          </div>
        </>
      }>
      <label style={S.label}>날짜<RequiredMark /></label>
      <div style={{ marginBottom: 10 }}>
        <KDateSelect value={date} min={todayStr()} onChange={setDate} />
      </div>
      <label style={S.label}>시간 (선택)</label>
      <div style={{ marginBottom: isPastTime ? 6 : 14 }}>
        <KTimeSelect value={time} onChange={setTime} />
      </div>
      {isPastTime && (
        <div style={{ fontSize: 11.5, color: "#B0682E", margin: "-8px 0 12px" }}>
          오늘 이미 지난 시간이에요. 미래 시간을 선택해주세요.
        </div>
      )}
      <label style={S.label}>병원<RequiredMark /></label>
      <KInput style={S.input} value={hospital} onChange={(e) => setHospital(e.target.value)} placeholder="예: 하늘동물병원" />
      <label style={S.label}>목적 (선택)</label>
      <KInput style={S.input} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="예: 혈액검사 재검" />
      <p style={{ fontSize: 11.5, color: "#9AA5A0", margin: 0, lineHeight: 1.6 }}>
        같은 달에 다른 병원 진료가 예정돼 있다면, 저장 후 "예정 추가"로 각각 따로 등록해주세요.
      </p>
    </Modal>
  );
}

function VisitEditor({ visit, defaultHospital, onSave, onDelete, onClose }) {
  const [date, setDate] = useState(visit?.date || todayStr());
  const [hospital, setHospital] = useState(visit?.hospital || defaultHospital);
  const [reason, setReason] = useState(visit?.reason || "");
  const [result, setResult] = useState(visit?.result || "");
  const [rx, setRx] = useState(visit?.rx || "");
  const [photos, setPhotos] = useState([]); // [{id?, src}]
  const originalIds = visit?.photos || [];
  const [pdfs, setPdfs] = useState([]); // [{id?, name, size, data}]
  const originalPdfIds = visit?.pdfs || [];
  useEffect(() => {
    let live = true;
    if (originalPdfIds.length) {
      Promise.all(originalPdfIds.map(async (pid) => { const m = await loadPdfData(pid); return m ? { id: pid, ...m } : null; }))
        .then((items) => { if (live) setPdfs(items.filter(Boolean)); });
    }
    return () => { live = false; };
  }, []); // eslint-disable-line
  useEffect(() => {
    let live = true;
    if (originalIds.length) {
      Promise.all(originalIds.map(async (pid) => ({ id: pid, src: await loadPhotoData(pid), kind: pid.startsWith(VIDEO_PREFIX) ? "video" : undefined })))
        .then((items) => { if (live) setPhotos(items.filter((x) => x.src)); });
    }
    return () => { live = false; };
  }, []); // eslint-disable-line
  const [nextDate, setNextDate] = useState("");
  const [nextTime, setNextTime] = useState("");
  const nextIsToday = nextDate === todayStr();
  const nextIsPastTime = nextIsToday && nextTime && nextTime <= nowTime();
  const canSave = hospital.trim() && date <= todayStr() && !nextIsPastTime;
  const [saveError, setSaveError] = useState("");
  const submit = async () => {
    setSaveError("");
    const ids = await persistPhotoItems(photos, originalIds);
    const { ids: pdfIds, failed } = await persistPdfItems(pdfs, originalPdfIds);
    if (failed > 0) {
      setSaveError(`PDF ${failed}개를 저장하지 못했어요. 파일 용량을 줄이거나 다시 시도해주세요.`);
      return;
    }
    onSave({ date, hospital: hospital.trim(), reason: reason.trim(), result: result.trim(), rx: rx.trim(), photos: ids, pdfs: pdfIds }, nextDate, nextTime);
  };
  return (
    <Modal title={visit ? "진료 기록 수정" : "진료 기록 추가"} onClose={onClose}
      footer={
        <>
          <button style={{ ...S.primaryBtn, opacity: canSave ? 1 : 0.4 }}
            disabled={!canSave}
            onClick={submit}>저장</button>
          {saveError && <div style={{ fontSize: 11.5, color: "#B65C68", textAlign: "center", marginTop: 6 }}>{saveError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button style={S.secondaryBtn} onClick={onClose}>취소</button>
            {onDelete && <button style={{ ...S.secondaryBtn, color: "#B65C68", borderColor: "#E9CDD1" }} onClick={onDelete}>삭제</button>}
          </div>
        </>
      }>
      <label style={S.label}>진료일<RequiredMark /></label>
      <div style={{ marginBottom: 6 }}>
        <KDateSelect value={date} max={todayStr()} onChange={setDate} />
      </div>
      {date > todayStr() && (
        <div style={{ fontSize: 11.5, color: "#B0682E", margin: "-8px 0 12px" }}>
          다녀온 진료 기록이라 미래 날짜는 선택할 수 없어요. 앞으로 갈 진료는 "예정 추가"에 등록해주세요.
        </div>
      )}
      <label style={S.label}>병원<RequiredMark /></label>
      <KInput style={S.input} value={hospital} onChange={(e) => setHospital(e.target.value)} placeholder="예: 하늘동물병원" />
      <label style={S.label}>진료 사유</label>
      <KInput style={S.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 정기 검진, 구토 증상" />
      <label style={S.label}>결과·소견</label>
      <KTextarea style={{ ...S.input, minHeight: 80, resize: "vertical", fontFamily: "inherit" }} value={result} onChange={(e) => setResult(e.target.value)}
        placeholder="검사 수치, 수의사 소견 등&#10;예: 크레아티닌 2.8, 탈수 경향" />
      <label style={S.label}>처방·변경 사항</label>
      <KTextarea style={{ ...S.input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} value={rx} onChange={(e) => setRx(e.target.value)}
        placeholder="예: 수액 2일 간격으로 변경, 약 용량 증량" />
      <AttachmentPicker photos={photos} onChange={setPhotos} max={4} />
      <p style={{ fontSize: 11, color: "#9AA5A0", margin: "-8px 0 14px", lineHeight: 1.6 }}>
        검사 결과지, 처방전, 영수증 등 병원에서 받은 사진을 첨부해두면 다음 진료 때 비교하기 좋아요.
      </p>
      <PdfAttachment pdfs={pdfs} onChange={setPdfs} max={3} />
      {!visit && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <button type="button" onClick={() => setNextDate(nextDate ? "" : todayStr())}
              style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${nextDate ? "#3E7C59" : "#C9CFCA"}`, background: nextDate ? "#3E7C59" : "#FFF", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              {nextDate && <Check size={13} color="#FFF" strokeWidth={3} />}
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2E26" }}>다음 진료 예약도 함께 등록</span>
          </div>
          {nextDate && (
            <>
              <label style={S.label}>다음 진료일</label>
              <div style={{ marginBottom: 10 }}>
                <KDateSelect value={nextDate} min={todayStr()} onChange={setNextDate} />
              </div>
              <label style={S.label}>시간 (선택)</label>
              <div style={{ marginBottom: nextIsPastTime ? 6 : 14 }}>
                <KTimeSelect value={nextTime} onChange={setNextTime} />
              </div>
            </>
          )}
          {nextIsPastTime && (
            <div style={{ fontSize: 11.5, color: "#B0682E", margin: "-8px 0 12px" }}>
              오늘 이미 지난 시간이에요. 미래 시간을 선택해주세요.
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ───────────── 설정 탭 ───────────── */
function SettingsView({ data, update, setData, onLogout, userEmail }) {
  const [section, setSection] = useState(null); // null | 'pet' | 'routines'
  const [editing, setEditing] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [templateMsg, setTemplateMsg] = useState("");
  const [alarmMsg, setAlarmMsg] = useState("");
  const pet = data.pet;

  const addTemplate = (t) => {
    update((d) => { d.routines.push(...TEMPLATES[t].map((r) => ({ ...r, id: uid(), startDate: todayStr(), active: true }))); return d; });
    setTemplateMsg(`'${t}' 템플릿의 루틴 ${TEMPLATES[t].length}개를 추가했어요`);
    setTimeout(() => setTemplateMsg(""), 3000);
  };

  const exportBackup = async () => {
    // 분리 저장된 사진도 함께 담아 완전한 백업 생성
    const ids = new Set();
    [...(data.records || []), ...(data.vetVisits || [])].forEach((item) =>
      (item.photos || []).forEach((pid) => { if (typeof pid === "string" && !pid.startsWith("data:")) ids.add(pid); }));
    const photos = {};
    for (const pid of ids) {
      const src = await loadPhotoData(pid);
      if (src) photos[pid] = src;
    }
    const blob = new Blob([JSON.stringify({ version: 4, exportedAt: new Date().toISOString(), data, photos }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `PetCare+_백업_${todayStr()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        const merged = migrate(parsed.data || parsed);
        if (!merged?.pet && !merged?.routines?.length) throw new Error("형식 오류");
        // 백업에 담긴 사진들을 분리 키로 복원
        if (parsed.photos) {
          for (const [pid, src] of Object.entries(parsed.photos)) await savePhotoData(pid, src);
        }
        setData(merged);
        await saveData(merged);
        setImportMsg("백업을 불러왔어요");
      } catch {
        setImportMsg("파일을 읽을 수 없어요. 이 앱에서 내보낸 백업 파일인지 확인해주세요.");
      }
      setTimeout(() => setImportMsg(""), 4000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const reset = async () => { setData(DEFAULT_DATA); await saveData(DEFAULT_DATA); setConfirmReset(false); };

  const Row = ({ Icon, title, desc, onClick, danger, as, accept, onFile }) => {
    const inner = (
      <>
        <Icon size={18} color={danger ? "#B65C68" : "#3E7C59"} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: danger ? "#B65C68" : "#1F2E26" }}>{title}</div>
          {desc && <div style={{ fontSize: 11.5, color: "#9AA5A0", marginTop: 1 }}>{desc}</div>}
        </div>
        <ChevronRight size={15} color="#C9CFCA" />
      </>
    );
    const rowStyle = { width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "13px 2px", borderBottom: "1px solid #F0F3F0", textAlign: "left" };
    if (as === "file") {
      // 파일 입력은 label로 직접 감싸야 일부 환경에서도 선택창이 확실히 열림 (ref.click() 방식은 불안정)
      return (
        <label style={{ ...rowStyle, position: "relative" }}>
          {inner}
          <input type="file" accept={accept} onChange={onFile}
            style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", border: 0 }} />
        </label>
      );
    }
    return <button onClick={onClick} style={rowStyle}>{inner}</button>;
  };

  return (
    <div style={{ padding: "20px 16px" }}>
      <h2 style={S.h2}>설정</h2>

      <button onClick={() => setSection("pet")} style={{ ...S.card, width: "100%", textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, margin: "12px 0 16px" }}>
        <Avatar pet={pet} size={44} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{pet.name}</div>
          <div style={{ fontSize: 12, color: "#6B7280" }}>{[pet.age, pet.breed || pet.species].filter(Boolean).join(" · ")}</div>
          {pet.tags?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
              {pet.tags.map((t) => <span key={t} style={{ fontSize: 10.5, fontWeight: 600, background: "#EAF3EC", color: "#2F5E45", padding: "3px 8px", borderRadius: 10 }}>{t}</span>)}
            </div>
          )}
        </div>
        <ChevronRight size={16} color="#9AA5A0" />
      </button>

      <div style={S.card}>
        <div style={S.cardTitle}>관리</div>
        <Row Icon={CalendarClock} title="반복 루틴 관리" desc="매일·매주 반복 케어 규칙 설정" onClick={() => setSection(section === "routines" ? null : "routines")} />
        <InstallAppRow />
      </div>

      {section === "routines" && (
        <div style={{ ...S.card, marginTop: 10 }}>
          <div style={S.cardTitle}>{pet.name}의 케어 루틴</div>
          {data.routines.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #F0F3F0", opacity: r.active ? 1 : 0.5 }}>
              <TypeIcon type={r.type} size={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div>
                <div style={{ fontSize: 11, color: "#6B7280" }}>
                  {r.time} · {r.repeat === "daily" ? "매일" : r.repeat === "weekdays" ? (r.weekdays || []).map((w) => WEEKDAYS[w]).join("") + "요일" : `${r.intervalDays}일마다`}
                  {r.detail && ` · ${r.detail}`}
                </div>
              </div>
              <button style={S.iconBtn} title={r.alarm === false ? "알림 꺼짐 · 탭하여 켜기" : "알림 켜짐 · 탭하여 끄기"}
                onClick={() => update((d) => { const t = d.routines.find((x) => x.id === r.id); t.alarm = t.alarm === false; return d; })}>
                {r.alarm === false ? <BellOff size={15} color="#C9CFCA" /> : <Bell size={15} color="#3E7C59" />}
              </button>
              <button style={S.iconBtn} onClick={() => setEditing(r)}><Pencil size={14} color="#6B7280" /></button>
              <button style={{ ...S.miniBtn, color: r.active ? "#9AA5A0" : "#3E7C59" }}
                onClick={() => update((d) => { const t = d.routines.find((x) => x.id === r.id); t.active = !t.active; return d; })}>
                {r.active ? "중지" : "재개"}
              </button>
            </div>
          ))}
          <button style={{ ...S.primaryBtn, marginTop: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={() => setEditing("new")}>
            <Plus size={16} /> 루틴 추가
          </button>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {Object.keys(TEMPLATES).map((t) => (
              <button key={t} style={{ ...S.chip, fontSize: 12 }} onClick={() => addTemplate(t)}>
                + {t} 템플릿
              </button>
            ))}
          </div>
          {templateMsg && <div style={{ fontSize: 12, color: "#3E7C59", marginTop: 8, display: "flex", alignItems: "center", gap: 4 }}><Check size={13} />{templateMsg}</div>}
        </div>
      )}

      <div style={{ ...S.card, marginTop: 10 }}>
        <div style={S.cardTitle}>알림</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 2px 10px" }}>
          {data.settings?.alarmEnabled !== false ? <Bell size={18} color="#3E7C59" /> : <BellOff size={18} color="#9AA5A0" />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2E26" }}>케어 시간 알림</div>
            <div style={{ fontSize: 11.5, color: "#9AA5A0", marginTop: 1 }}>루틴 시간이 되면 화면 상단에 알려드려요 (앱이 열려 있을 때)</div>
          </div>
          <button
            onClick={() => {
              const next = !(data.settings?.alarmEnabled !== false);
              update((d) => { d.settings = { ...(d.settings || {}), alarmEnabled: next }; return d; });
              setAlarmMsg(next ? "케어 시간 알림이 켜졌어요" : "케어 시간 알림이 꺼졌어요");
              setTimeout(() => setAlarmMsg(""), 2500);
            }}
            style={{ width: 46, height: 26, borderRadius: 13, border: "none", cursor: "pointer", position: "relative", flexShrink: 0,
              background: data.settings?.alarmEnabled !== false ? "#3E7C59" : "#D7DDD8", transition: "background .2s" }}>
            <span style={{ position: "absolute", top: 3, left: data.settings?.alarmEnabled !== false ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#FFF", transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
          </button>
        </div>
        {alarmMsg && (
          <div style={{ fontSize: 12, color: "#3E7C59", display: "flex", alignItems: "center", gap: 4, padding: "0 2px 8px" }}>
            <Check size={13} />{alarmMsg}
          </div>
        )}
        <NotifyPermissionRow />
        <p style={{ fontSize: 11, color: "#9AA5A0", margin: "8px 0 0", lineHeight: 1.6 }}>
          앱을 닫아도 울리는 푸시 알림은 실제 사이트로 배포한 뒤 브라우저 알림 권한을 허용하면 동작해요. 이 미리보기에서는 화면 안 알림만 지원돼요. 루틴별로 알림을 끄려면 루틴 수정에서 설정하세요.
        </p>
      </div>

      <div style={{ ...S.card, marginTop: 10 }}>
        <div style={S.cardTitle}>데이터</div>
        <Row Icon={Download} title="데이터 백업" desc="전체 기록을 JSON 파일로 내려받기" onClick={exportBackup} />
        <Row Icon={Upload} title="백업 불러오기" desc="백업 파일로 기록 복원 (현재 기록 교체)" as="file" accept=".json,application/json" onFile={importBackup} />
        {importMsg && <div style={{ fontSize: 12, marginTop: 8, color: importMsg.includes("불러왔어요") ? "#3E7C59" : "#B65C68" }}>{importMsg}</div>}
        <Row Icon={Trash2} title="전체 데이터 초기화" desc="모든 기록 삭제 후 처음으로" danger onClick={() => setConfirmReset(true)} />
        <p style={{ fontSize: 11, color: "#9AA5A0", marginTop: 10, marginBottom: 0, lineHeight: 1.6 }}>
          기록은 이 기기에 자동 저장돼요. 기기 변경이나 만일에 대비해 백업 파일을 정기적으로 보관하세요.
        </p>
      </div>

      {onLogout && (
        <div style={{ ...S.card, marginTop: 10 }}>
          <div style={S.cardTitle}>계정</div>
          {userEmail && <p style={{ fontSize: 12.5, color: "#5B6660", margin: "0 0 8px" }}>{userEmail}</p>}
          <Row Icon={X} title="로그아웃" desc="다시 로그인하면 기록을 이어서 볼 수 있어요" danger onClick={onLogout} />
        </div>
      )}

      <p style={{ fontSize: 11, color: "#C9CFCA", textAlign: "center", marginTop: 20 }}>PetCare+ · 프로토타입 MVP 2.0</p>

      {section === "pet" && (
        <PetEditor pet={pet} onSave={(p) => { update((d) => ({ ...d, pet: { ...d.pet, ...p } })); setSection(null); }} onClose={() => setSection(null)} />
      )}
      {editing && (
        <RoutineEditor
          routine={editing === "new" ? null : editing}
          onSave={(list) => {
            update((d) => {
              if (editing === "new") list.forEach((r) => d.routines.push({ ...r, id: uid(), startDate: todayStr(), active: true }));
              else Object.assign(d.routines.find((x) => x.id === editing.id), list[0]);
              return d;
            });
            setEditing(null);
          }}
          onDelete={editing !== "new" ? () => { update((d) => { d.routines = d.routines.filter((x) => x.id !== editing.id); return d; }); setEditing(null); } : null}
          onClose={() => setEditing(null)} />
      )}
      {confirmReset && (
        <Modal title="전체 데이터 초기화" onClose={() => setConfirmReset(false)}
          footer={
            <>
              <button style={{ ...S.primaryBtn, background: "#B65C68" }} onClick={reset}>초기화</button>
              <button style={{ ...S.secondaryBtn, marginTop: 8 }} onClick={() => setConfirmReset(false)}>취소</button>
            </>
          }>
          <p style={{ fontSize: 13, color: "#8E3B47", margin: 0, fontWeight: 600, lineHeight: 1.6 }}>
            모든 기록이 삭제되고 처음 화면으로 돌아가요. 되돌릴 수 없어요.<br />초기화 전에 백업 파일을 먼저 내려받는 것을 권장해요.
          </p>
        </Modal>
      )}
    </div>
  );
}

function InstallAppRow() {
  const [ready, setReady] = useState(typeof window !== "undefined" && !!deferredInstallPrompt);
  const [installed, setInstalled] = useState(
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true)
  );

  useEffect(() => {
    const onReady = () => setReady(true);
    const onInstalled = () => { setInstalled(true); setReady(false); };
    window.addEventListener("pcplus-install-ready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("pcplus-install-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const rowStyle = { width: "100%", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, padding: "13px 2px", borderBottom: "1px solid #F0F3F0", textAlign: "left" };

  if (installed) {
    return (
      <div style={rowStyle}>
        <Check size={18} color="#3E7C59" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2E26" }}>PetCare+ 열기</div>
          <div style={{ fontSize: 11.5, color: "#9AA5A0", marginTop: 1 }}>이미 홈 화면에 설치되어 있어요</div>
        </div>
      </div>
    );
  }

  const handleInstall = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    setReady(false);
    if (outcome === "accepted") setInstalled(true);
  };

  return (
    <button onClick={handleInstall} disabled={!ready} style={{ ...rowStyle, cursor: ready ? "pointer" : "default", opacity: ready ? 1 : 0.5 }}>
      <Download size={18} color="#3E7C59" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2E26" }}>홈 화면에 설치</div>
        <div style={{ fontSize: 11.5, color: "#9AA5A0", marginTop: 1 }}>
          {ready ? "바로가기를 만들어 앱처럼 실행해요" : "이 브라우저에서는 아직 설치할 수 없어요"}
        </div>
      </div>
      <ChevronRight size={15} color="#C9CFCA" />
    </button>
  );
}

function NotifyPermissionRow() {
  const supported = typeof Notification !== "undefined";
  const [perm, setPerm] = useState(supported ? Notification.permission : "unsupported");
  if (!supported)
    return <div style={{ fontSize: 12, color: "#9AA5A0", padding: "6px 2px", borderTop: "1px solid #F0F3F0" }}>이 환경에서는 브라우저 알림을 지원하지 않아요. (실제 배포 시 사용 가능)</div>;
  const label = perm === "granted" ? "브라우저 알림 허용됨" : perm === "denied" ? "브라우저 알림 차단됨 (브라우저 설정에서 변경)" : "브라우저 알림 권한 요청";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px 0", borderTop: "1px solid #F0F3F0" }}>
      <div style={{ flex: 1, fontSize: 13, color: perm === "granted" ? "#2F5E45" : "#556158", fontWeight: 500 }}>{label}</div>
      {perm === "default" && (
        <button style={{ ...S.chip, fontSize: 12, padding: "6px 12px" }}
          onClick={async () => { try { setPerm(await Notification.requestPermission()); } catch { /* 미지원 */ } }}>
          허용하기
        </button>
      )}
      {perm === "granted" && <Check size={16} color="#3E7C59" />}
    </div>
  );
}

function PetEditor({ pet, onSave, onClose }) {
  const [name, setName] = useState(pet.name);
  const [species, setSpecies] = useState(pet.species);
  const [breed, setBreed] = useState(pet.breed || "");
  const [age, setAge] = useState(pet.age || "");
  const [tags, setTags] = useState((pet.tags || []).join(", "));
  const [photo, setPhoto] = useState(pet.photo || "");
  return (
    <Modal title="반려동물 정보" onClose={onClose}
      footer={
        <button style={{ ...S.primaryBtn, opacity: name.trim() ? 1 : 0.4 }} disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), species, breed: breed.trim(), age: age.trim(), photo, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) })}>저장</button>
      }>
      <PhotoPicker photo={photo} name={name} onChange={setPhoto} />
      <label style={S.label}>이름<RequiredMark /></label>
      <KInput style={S.input} value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={S.label}>나이</label>
          <KInput style={S.input} value={age} onChange={(e) => setAge(e.target.value)} placeholder="예: 12살" />
        </div>
        <div style={{ flex: 1.4 }}>
          <label style={S.label}>품종</label>
          <KInput style={S.input} value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="예: 말티즈" />
        </div>
      </div>
      <label style={S.label}>종류</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {["강아지", "고양이", "기타"].map((s) => (
          <button key={s} onClick={() => setSpecies(s)} style={{ ...S.chip, ...(species === s ? S.chipOn : {}) }}>{s}</button>
        ))}
      </div>
      <label style={S.label}>건강 태그 (쉼표로 구분)</label>
      <KInput style={S.input} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="예: 심장질환, 신장관리" />
    </Modal>
  );
}

/* 이름 입력 중 재계산되지 않도록 분리한 정적 서브컴포넌트들 */
const TypeSelector = React.memo(function TypeSelector({ type, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
      {Object.entries(TYPE_META).map(([k, m]) => {
        const I = m.Icon;
        return (
          <button key={k} style={{ ...S.chip, ...(type === k ? S.chipOn : {}), fontSize: 12, padding: "6px 10px", display: "flex", alignItems: "center", gap: 5 }} onClick={() => onChange(k)}>
            <I size={13} /> {m.label}
          </button>
        );
      })}
    </div>
  );
});

const QueuePreview = React.memo(function QueuePreview({ queue, onRemove }) {
  if (queue.length === 0) return null;
  return (
    <div style={{ ...S.card, background: "#F7F9F6", marginBottom: 14 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "#2F5E45", marginBottom: 6 }}>
        저장 대기 중인 루틴 {queue.length}개
      </div>
      {queue.map((q, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
          <TypeIcon type={q.type} size={13} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#1F2E26", flex: 1 }}>{q.name}</span>
          <span style={{ fontSize: 11, color: "#9AA5A0" }}>{q.time}</span>
          <button style={S.iconBtn} onClick={() => onRemove(i)}>
            <X size={13} color="#B65C68" />
          </button>
        </div>
      ))}
    </div>
  );
});

const WeekdaySelector = React.memo(function WeekdaySelector({ weekdays, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
      {WEEKDAYS.map((w, i) => (
        <button key={i} style={{ ...S.chip, ...(weekdays.includes(i) ? S.chipOn : {}), flex: 1, padding: "7px 0" }}
          onClick={() => onChange(weekdays.includes(i) ? weekdays.filter((x) => x !== i) : [...weekdays, i])}>{w}</button>
      ))}
    </div>
  );
});

function RoutineEditor({ routine, onSave, onDelete, onClose }) {
  const isEdit = !!routine;
  const [type, setType] = useState(routine?.type || "med");
  const [name, setName] = useState(routine?.name || "");
  const [detail, setDetail] = useState(routine?.detail || "");
  const [time, setTime] = useState(routine?.time || "08:00");
  const [repeat, setRepeat] = useState(routine?.repeat || "daily");
  const [weekdays, setWeekdays] = useState(routine?.weekdays || []);
  const [intervalDays, setIntervalDays] = useState(routine?.intervalDays || 2);
  const [alarm, setAlarm] = useState(routine ? routine.alarm !== false : true);
  const [queue, setQueue] = useState([]); // 추가 모드에서 "계속 추가"로 쌓인 루틴들 (아직 미저장)

  const draftValid = name.trim() && (repeat !== "weekdays" || weekdays.length > 0);
  const buildDraft = () => ({ type, name: name.trim(), detail: detail.trim(), time, repeat, weekdays, intervalDays: Math.max(2, parseInt(intervalDays) || 2), alarm });
  const resetFields = () => {
    setType("med"); setName(""); setDetail(""); setTime("08:00");
    setRepeat("daily"); setWeekdays([]); setIntervalDays(2); setAlarm(true);
  };
  const addToQueue = () => { setQueue((q) => [...q, buildDraft()]); resetFields(); };
  const removeFromQueue = useCallback((i) => setQueue((cur) => cur.filter((_, idx) => idx !== i)), []);
  const saveAll = () => {
    const all = draftValid ? [...queue, buildDraft()] : queue;
    if (all.length > 0) onSave(all);
  };

  return (
    <Modal title={isEdit ? "루틴 수정" : "새 루틴"} onClose={onClose}
      footer={
        isEdit ? (
          <>
            <button style={{ ...S.primaryBtn, opacity: draftValid ? 1 : 0.4 }} disabled={!draftValid}
              onClick={() => onSave([buildDraft()])}>저장</button>
            {repeat === "weekdays" && weekdays.length === 0 && (
              <div style={{ fontSize: 11.5, color: "#B0682E", textAlign: "center", marginTop: 6 }}>반복할 요일을 하나 이상 선택해주세요</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={S.secondaryBtn} onClick={onClose}>취소</button>
              {onDelete && <button style={{ ...S.secondaryBtn, color: "#B65C68", borderColor: "#E9CDD1" }} onClick={onDelete}>삭제</button>}
            </div>
          </>
        ) : (
          <>
            <button style={{ ...S.primaryBtn, opacity: draftValid || queue.length > 0 ? 1 : 0.4 }}
              disabled={!draftValid && queue.length === 0}
              onClick={saveAll}>
              {queue.length > 0 ? `모두 저장 (${draftValid ? queue.length + 1 : queue.length}개)` : "저장"}
            </button>
            <button style={{ ...S.secondaryBtn, marginTop: 8, opacity: draftValid ? 1 : 0.4, color: "#2F5E45", borderColor: "#BCD8C4" }}
              disabled={!draftValid} onClick={addToQueue}>
              + 이 루틴 추가하고 계속 만들기
            </button>
            {repeat === "weekdays" && weekdays.length === 0 && (
              <div style={{ fontSize: 11.5, color: "#B0682E", textAlign: "center", marginTop: 6 }}>반복할 요일을 하나 이상 선택해주세요</div>
            )}
            <button style={{ ...S.secondaryBtn, marginTop: 8 }} onClick={onClose}>취소</button>
          </>
        )
      }>
      <QueuePreview queue={queue} onRemove={removeFromQueue} />
      <label style={S.label}>유형</label>
      <TypeSelector type={type} onChange={setType} />
      <label style={S.label}>이름<RequiredMark /></label>
      <KInput style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 신장약, 아침 사료" />
      <label style={S.label}>상세 (용량 등, 선택)</label>
      <KInput style={S.input} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="예: 1/4정, 30g" />
      <label style={S.label}>시간</label>
      <div style={{ marginBottom: 14 }}>
        <KTimeSelect value={time} onChange={setTime} />
      </div>
      <label style={S.label}>반복<RequiredMark /></label>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[["daily", "매일"], ["weekdays", "요일 지정"], ["interval", "N일 간격"]].map(([k, l]) => (
          <button key={k} style={{ ...S.chip, ...(repeat === k ? S.chipOn : {}) }} onClick={() => setRepeat(k)}>{l}</button>
        ))}
      </div>
      {repeat === "weekdays" && (
        <WeekdaySelector weekdays={weekdays} onChange={setWeekdays} />
      )}
      {repeat === "interval" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input style={{ ...S.input, marginBottom: 0, width: 70 }} type="number" min="2" value={intervalDays}
            onChange={(e) => setIntervalDays(e.target.value === "" ? "" : parseInt(e.target.value) || "")}
            onBlur={(e) => setIntervalDays(Math.max(2, parseInt(e.target.value) || 2))} />
          <span style={{ fontSize: 13, color: "#6B7280" }}>일마다 (오늘부터)</span>
        </div>
      )}
      <label style={S.label}>알림</label>
      <button style={{ ...S.chip, ...(alarm ? S.chipOn : {}), width: "100%", padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        onClick={() => setAlarm(!alarm)}>
        {alarm ? <Bell size={15} /> : <BellOff size={15} />}
        {alarm ? "케어 시간에 알림 받기 (켜짐)" : "이 루틴은 알림 없이 (꺼짐)"}
      </button>
    </Modal>
  );
}

function Modal({ title, children, footer, onClose }) {
  const desktop = useIsDesktop();
  return (
    <div style={{ ...S.modalBack, alignItems: desktop ? "center" : "flex-end", padding: desktop ? 24 : 0 }} onClick={onClose}>
      <style>{`.modal-scroll::-webkit-scrollbar{display:none;}`}</style>
      <div style={{ ...S.modal, display: "flex", flexDirection: "column", borderRadius: desktop ? 18 : "18px 18px 0 0", maxHeight: desktop ? "86vh" : "88vh" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: "#1F2E26" }}>{title}</h3>
          <button style={S.iconBtn} onClick={onClose}><X size={18} color="#6B7280" /></button>
        </div>
        <div className="modal-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" }}>{children}</div>
        {footer && <div style={{ flexShrink: 0, paddingTop: 12, borderTop: "1px solid #F0F3F0", marginTop: 6 }}>{footer}</div>}
      </div>
    </div>
  );
}

/* ───────────── 스타일 ───────────── */
const S = {
  app: { minHeight: "100dvh", background: "#F4F6F2", display: "flex", flexDirection: "column", fontFamily: "'Pretendard', -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif", color: "#1F2E26", maxWidth: 480, margin: "0 auto", width: "100%" },
  loading: { minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F4F6F2" },
  content: { flex: 1, paddingBottom: 84, overflowY: "auto" },
  tabbar: { position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, display: "flex", background: "#FFFFFF", borderTop: "1px solid #E5EAE6", padding: "7px 0 max(10px, env(safe-area-inset-bottom))", zIndex: 40 },
  tabBtn: { flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", padding: "3px 0" },
  fab: { position: "fixed", right: "max(16px, calc(50% - 224px))", bottom: 86, width: 54, height: 54, borderRadius: "50%", background: "#3E7C59", border: "none", boxShadow: "0 4px 14px rgba(47,94,69,.35)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 45 },
  h2: { fontSize: 19, fontWeight: 700, margin: 0, color: "#1F2E26", letterSpacing: "-0.3px" },
  h3: { fontSize: 15.5, fontWeight: 700, margin: 0, color: "#1F2E26", letterSpacing: "-0.2px" },
  card: { background: "#FFF", borderRadius: 14, padding: 14, border: "1px solid #E5EAE6", boxShadow: "0 1px 2px rgba(31,46,38,.03)" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#2F5E45", marginBottom: 8 },
  label: { display: "block", fontSize: 12, fontWeight: 600, color: "#556158", marginBottom: 5 },
  input: { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid #DDE4DE", fontSize: 14, marginBottom: 14, background: "#FFF", color: "#1F2E26", outline: "none" },
  chip: { padding: "8px 14px", borderRadius: 20, border: "1px solid #DDE4DE", background: "#FFF", color: "#556158", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  chipOn: { background: "#EAF3EC", borderColor: "#3E7C59", color: "#2F5E45" },
  primaryBtn: { width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "#3E7C59", color: "#FFF", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  secondaryBtn: { width: "100%", padding: "12px", borderRadius: 12, border: "1px solid #E5EAE6", background: "#FFF", color: "#6B7280", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  miniBtn: { background: "none", border: "none", fontSize: 11, color: "#6B7280", cursor: "pointer", padding: "3px 6px", fontWeight: 500 },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 5, display: "flex", alignItems: "center", flexShrink: 0 },
  empty: { textAlign: "center", color: "#9AA5A0", fontSize: 13, padding: "36px 0", lineHeight: 1.7 },
  modalBack: { position: "fixed", inset: 0, background: "rgba(31,46,38,.4)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  modal: { background: "#FFF", borderRadius: "18px 18px 0 0", padding: "20px 18px max(20px, env(safe-area-inset-bottom))", width: "100%", maxWidth: 480, maxHeight: "88vh" },
};

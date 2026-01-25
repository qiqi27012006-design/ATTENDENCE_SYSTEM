// backend/server.js
import express from "express";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// ===== load backend/.env đúng đường dẫn =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

// ===== CORS =====
const corsOptions = {
  origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-user-id", "x-role"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// ===== In-memory DB =====
const db = {
  classes: [],     // { _id, classCode, className, courseName, subjectCode, subjectName, teacherName, dayOfWeek, period, createdBy, createdAt }
  sessions: [],    // { _id, classId, attendanceCode, startTime, endTime, status, createdBy, lesson, period, createdAt, closedAt }
  attendance: [],  // { _id, sessionId, classId, studentId, checkedAt, status }
  leaves: [],      // { _id, classId, sessionId, studentId, studentName, studentCode, subjectCode, subjectName, startDate, endDate, reason, status, teacherNote, decidedAt, decidedBy, createdAt, updatedAt }
  profiles: {},    // userId -> { userId, role, fullName, email, phone, msv, updatedAt }
};

// ===== helpers =====
function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + "_" + Math.random().toString(16).slice(2);
}

function code5() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeId(s) {
  return String(s || "").trim();
}

function getAuth(req) {
  const userId = normalizeId(req.headers["x-user-id"] || "");
  const role = String(req.headers["x-role"] || "STUDENT").toUpperCase(); // STUDENT | TEACHER
  return { userId, role };
}

function ensureRole(roleNeed) {
  return (req, res, next) => {
    const { role } = getAuth(req);
    if (role !== roleNeed) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

function ensureAuth(req, res, next) {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ message: "Missing x-user-id" });
  next();
}

function autoCloseExpiredSessions() {
  const now = Date.now();
  for (const s of db.sessions) {
    if (s.status === "OPEN" && now >= s.endTime) {
      s.status = "CLOSED";
      s.closedAt = now;
    }
  }
}

function isIsoYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function parseYmdToMs(ymd) {
  const s = String(ymd || "").trim();
  if (!isIsoYmd(s)) return NaN;
  return new Date(`${s}T00:00:00`).getTime();
}

// ===================== PROFILES =====================
app.get("/api/profile/me", ensureAuth, (req, res) => {
  const { userId, role } = getAuth(req);

  const existing = db.profiles[userId] || null;
  if (!existing) {
    return res.json({
      userId,
      role,
      fullName: "",
      email: "",
      phone: "",
      msv: role === "STUDENT" ? userId : "",
      updatedAt: null,
    });
  }

  res.json(existing);
});

app.put("/api/profile/me", ensureAuth, (req, res) => {
  const { userId, role } = getAuth(req);
  const { fullName = "", email = "", phone = "", msv = "" } = req.body || {};

  const payload = {
    userId,
    role,
    fullName: String(fullName || "").trim(),
    email: String(email || "").trim(),
    phone: String(phone || "").trim(),
    msv: role === "STUDENT" ? String(msv || userId).trim() : "",
    updatedAt: Date.now(),
  };

  db.profiles[userId] = payload;
  res.json({ ok: true, profile: payload });
});

// ===================== CLASSES =====================
app.post("/api/teacher/classes", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  const { userId } = getAuth(req);

  const {
    classCode,
    className,
    courseName,
    teacherName,
    dayOfWeek,
    period,
    subjectCode,
    subjectName,
  } = req.body || {};

  const code = normalizeCode(classCode || subjectCode);
  const clsName = String(className || "").trim();
  const crsName = String(courseName || subjectName || "").trim();
  const dow = String(dayOfWeek || "").trim();
  const per = Number(period);

  if (!code) return res.status(400).json({ message: "Missing classCode/subjectCode" });
  if (!clsName) return res.status(400).json({ message: "Missing className" });
  if (!crsName) return res.status(400).json({ message: "Missing courseName/subjectName" });
  if (!dow || !per) return res.status(400).json({ message: "Missing dayOfWeek/period" });

  const c = {
    _id: uid(),
    classCode: code,
    className: clsName,
    courseName: crsName,

    // giữ field cũ cho tương thích UI
    subjectCode: code,
    subjectName: crsName,

    teacherName: teacherName || `GV_${userId}`,
    dayOfWeek: dow,
    period: per,
    createdBy: userId,
    createdAt: Date.now(),
  };

  db.classes.push(c);
  res.json(c);
});

app.get("/api/teacher/classes", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  const { userId } = getAuth(req);

  const list = db.classes
    .filter((c) => c.createdBy === userId)
    .map((c) => {
      const code = c.classCode || c.subjectCode || "";
      const crs = c.courseName || c.subjectName || "";
      const cls = c.className || (code ? `Lớp ${code}` : "");

      return {
        ...c,
        classCode: code,
        courseName: crs,
        className: cls,
        subjectCode: c.subjectCode || code,
        subjectName: c.subjectName || crs,
      };
    });

  res.json(list);
});

app.get("/api/student/classes", ensureRole("STUDENT"), ensureAuth, (req, res) => {
  const list = db.classes.map((c) => {
    const code = c.classCode || c.subjectCode || "";
    const crs = c.courseName || c.subjectName || "";
    const cls = c.className || (code ? `Lớp ${code}` : "");
    return { ...c, classCode: code, courseName: crs, className: cls };
  });
  res.json(list);
});

app.delete("/api/teacher/classes/:classId", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  const { userId } = getAuth(req);
  const { classId } = req.params;

  const idx = db.classes.findIndex((c) => c._id === classId && c.createdBy === userId);
  if (idx === -1) return res.status(404).json({ message: "Class not found" });

  db.classes.splice(idx, 1);

  // cleanup sessions/attendance/leaves
  db.sessions = db.sessions.filter((s) => s.classId !== classId);
  db.attendance = db.attendance.filter((a) => a.classId !== classId);
  db.leaves = db.leaves.filter((l) => l.classId !== classId);

  res.json({ ok: true });
});

// ===================== SESSIONS =====================
app.post("/api/attendance/create-session", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  autoCloseExpiredSessions();

  const { userId } = getAuth(req);
  const { classId, durationMin, attendanceCode, period, lesson } = req.body || {};

  if (!classId) return res.status(400).json({ message: "Missing classId" });

  // close existing open session for this class
  for (const s of db.sessions) {
    if (s.classId === String(classId) && s.status === "OPEN") s.status = "CLOSED";
  }

  const dur = Math.max(1, Number(durationMin || 10));
  const startTime = Date.now();
  const endTime = startTime + dur * 60 * 1000;

  let code = normalizeCode(attendanceCode);
  if (!code) code = code5();

  if (!/^[A-Z0-9]{3,20}$/.test(code)) {
    return res.status(400).json({ message: "Mã điểm danh chỉ gồm chữ/số (3–20 ký tự)." });
  }

  const p = Number(period || 1);

  const session = {
    _id: uid(),
    classId: String(classId),
    createdBy: userId,
    attendanceCode: code,
    startTime,
    endTime,
    status: "OPEN",
    period: p,
    lesson: String(lesson || `Ca ${p}`),
    createdAt: Date.now(),
  };

  db.sessions.push(session);
  res.json(session);
});

app.post("/api/attendance/close-session/:sessionId", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  autoCloseExpiredSessions();

  const { userId } = getAuth(req);
  const { sessionId } = req.params;

  const s = db.sessions.find((x) => x._id === sessionId);
  if (!s) return res.status(404).json({ message: "Session not found" });
  if (s.createdBy !== userId) return res.status(403).json({ message: "Not your session" });

  s.status = "CLOSED";
  s.closedAt = Date.now();
  res.json({ ok: true, session: s });
});

app.get("/api/attendance/sessions", ensureAuth, (req, res) => {
  autoCloseExpiredSessions();

  const { role, userId } = getAuth(req);
  const { classId } = req.query;
  if (!classId) return res.status(400).json({ message: "Missing classId" });

  let list = db.sessions.filter((s) => s.classId === String(classId));
  if (role === "TEACHER") list = list.filter((s) => s.createdBy === userId);

  list.sort((a, b) => b.startTime - a.startTime);
  res.json(list);
});

app.get("/api/attendance/active-session", ensureAuth, (req, res) => {
  autoCloseExpiredSessions();

  const { classId } = req.query;
  if (!classId) return res.status(400).json({ message: "Missing classId" });

  const active = db.sessions.find((s) => s.classId === String(classId) && s.status === "OPEN") || null;
  res.json(active);
});

app.get("/api/attendance/session-attendees", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  autoCloseExpiredSessions();

  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ message: "Missing sessionId" });

  const list = db.attendance
    .filter((a) => a.sessionId === String(sessionId))
    .map((a) => ({ ...a, studentMsv: a.studentId }));

  res.json(list);
});

// ===================== CHECK-IN =====================
app.post("/api/attendance/check-in", ensureRole("STUDENT"), ensureAuth, (req, res) => {
  autoCloseExpiredSessions();

  const { userId } = getAuth(req);
  const { sessionId, attendanceCode } = req.body || {};

  if (!sessionId || !attendanceCode) {
    return res.status(400).json({ message: "Missing sessionId/attendanceCode" });
  }

  const s = db.sessions.find((x) => x._id === sessionId);
  if (!s) return res.status(404).json({ message: "Session not found" });
  if (s.status !== "OPEN") return res.status(400).json({ message: "Session is closed" });

  const code = String(attendanceCode).trim().toUpperCase();
  if (code !== s.attendanceCode) return res.status(400).json({ message: "Sai mã điểm danh" });

  const exists = db.attendance.find((a) => a.sessionId === sessionId && a.studentId === userId);
  if (exists) return res.json({ message: "Bạn đã điểm danh rồi", record: exists });

  const record = {
    _id: uid(),
    sessionId,
    classId: s.classId,
    studentId: String(userId).trim(),
    checkedAt: Date.now(),
    status: "PRESENT",
  };
  db.attendance.push(record);

  res.json({ message: "Điểm danh thành công", record });
});

app.get("/api/attendance/my-attendance", ensureRole("STUDENT"), ensureAuth, (req, res) => {
  autoCloseExpiredSessions();

  const { userId } = getAuth(req);
  const { classId } = req.query;
  if (!classId) return res.status(400).json({ message: "Missing classId" });

  const list = db.attendance.filter((a) => a.classId === String(classId) && a.studentId === userId);
  list.sort((a, b) => b.checkedAt - a.checkedAt);
  res.json(list);
});

// ===================== LEAVES (IN-MEMORY) =====================
// STUDENT create leave: mode mới (range) + mode cũ (session)
app.post("/api/attendance/leave-request", ensureRole("STUDENT"), ensureAuth, (req, res) => {
  autoCloseExpiredSessions();
  const { userId } = getAuth(req);

  const {
    classId = "",
    sessionId = "",
    startDate = "",
    endDate = "",
    reason = "",
    studentName = "",
    studentCode = "",
    subjectCode = "",
    subjectName = "",
  } = req.body || {};

  const r = String(reason || "").trim();
  if (!r) return res.status(400).json({ message: "reason is required" });

  const cid = String(classId || "").trim();
  if (!cid) return res.status(400).json({ message: "classId is required" });

  // mode cũ: có sessionId
  if (String(sessionId || "").trim()) {
    // optional: verify session exists
    const s = db.sessions.find((x) => x._id === String(sessionId).trim());
    // nếu không tìm thấy session vẫn cho tạo đơn (tuỳ bạn). Ở đây: cho tạo nhưng giữ sessionId.
    const leave = {
      _id: uid(),
      classId: cid,
      sessionId: String(sessionId).trim(),
      studentId: String(userId).trim(),
      studentName: String(studentName || "").trim(),
      studentCode: String(studentCode || "").trim(),
      subjectCode: String(subjectCode || "").trim() || (s ? "" : ""),
      subjectName: String(subjectName || "").trim() || (s ? "" : ""),
      startDate: "",
      endDate: "",
      reason: r,
      status: "PENDING",
      teacherNote: "",
      decidedAt: null,
      decidedBy: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.leaves.push(leave);
    return res.json(leave);
  }

  // mode mới: theo khoảng ngày
  const sd = String(startDate || "").trim();
  const ed = String(endDate || "").trim();
  if (!sd || !ed) return res.status(400).json({ message: "startDate/endDate is required" });

  const ds = parseYmdToMs(sd);
  const de = parseYmdToMs(ed);
  if (Number.isNaN(ds) || Number.isNaN(de)) return res.status(400).json({ message: "Invalid date (use YYYY-MM-DD)" });
  if (ds > de) return res.status(400).json({ message: "startDate must be <= endDate" });

  const leave = {
    _id: uid(),
    classId: cid,
    sessionId: "",
    studentId: String(userId).trim(),
    studentName: String(studentName || "").trim(),
    studentCode: String(studentCode || "").trim(),
    subjectCode: String(subjectCode || "").trim(),
    subjectName: String(subjectName || "").trim(),
    startDate: sd,
    endDate: ed,
    reason: r,
    status: "PENDING",
    teacherNote: "",
    decidedAt: null,
    decidedBy: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  db.leaves.push(leave);
  return res.json(leave);
});

// STUDENT: view my leaves by class
app.get("/api/attendance/my-leave-requests", ensureRole("STUDENT"), ensureAuth, (req, res) => {
  const { userId } = getAuth(req);
  const classId = String(req.query.classId || "").trim();
  if (!classId) return res.status(400).json({ message: "classId is required" });

  const list = db.leaves
    .filter((l) => l.classId === classId && l.studentId === String(userId).trim())
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  res.json(list);
});

// TEACHER: view leaves by class + filter status
app.get("/api/attendance/leave-requests", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  const classId = String(req.query.classId || "").trim();
  if (!classId) return res.status(400).json({ message: "classId is required" });

  const status = String(req.query.status || "PENDING").toUpperCase();
  let list = db.leaves.filter((l) => l.classId === classId);
  if (status !== "ALL") list = list.filter((l) => String(l.status).toUpperCase() === status);

  list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(list);
});

// TEACHER: approve
app.put("/api/attendance/leave-approve/:id", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  const { userId } = getAuth(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ message: "Missing leave id in URL" });

  const teacherNote = String(req.body?.teacherNote || "").trim();
  const lv = db.leaves.find((x) => x._id === id);
  if (!lv) return res.status(404).json({ message: "Leave not found" });

  lv.status = "APPROVED";
  lv.teacherNote = teacherNote;
  lv.decidedAt = new Date();
  lv.decidedBy = String(userId).trim();
  lv.updatedAt = Date.now();

  res.json(lv);
});

// TEACHER: reject
app.put("/api/attendance/leave-reject/:id", ensureRole("TEACHER"), ensureAuth, (req, res) => {
  const { userId } = getAuth(req);
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ message: "Missing leave id in URL" });

  const teacherNote = String(req.body?.teacherNote || "").trim();
  const lv = db.leaves.find((x) => x._id === id);
  if (!lv) return res.status(404).json({ message: "Leave not found" });

  lv.status = "REJECTED";
  lv.teacherNote = teacherNote;
  lv.decidedAt = new Date();
  lv.decidedBy = String(userId).trim();
  lv.updatedAt = Date.now();

  res.json(lv);
});

// ===================== START =====================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on", PORT));

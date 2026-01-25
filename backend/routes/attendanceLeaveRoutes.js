import express from "express";
import LeaveRequest from "../models/LeaveRequest.js";

const router = express.Router();

const roleOf = (req) => String(req.headers["x-role"] || "").toUpperCase();
const uidOf = (req) => String(req.headers["x-user-id"] || "").trim();

function requireRole(role) {
  return (req, res, next) => {
    const r = roleOf(req);
    const uid = uidOf(req);
    if (!uid) return res.status(401).json({ message: "Missing x-user-id" });
    if (r !== role) return res.status(403).json({ message: `Only ${role} can access` });
    next();
  };
}

function mustHaveId(req, res, next) {
  const id = String(req.params.id || "").trim();
  if (!id) return res.status(400).json({ message: "Missing leave id in URL" });
  next();
}

// =========================
// STUDENT: Create leave
// =========================
// Hỗ trợ 2 mode:
// - Mode mới: { classId, startDate, endDate, reason, ... }
// - Mode cũ: { classId, sessionId, reason, ... } (vẫn yêu cầu classId để GV lọc theo lớp)
router.post("/leave-request", requireRole("STUDENT"), async (req, res) => {
  try {
    const studentId = uidOf(req);

    const {
      sessionId = "",
      classId = "",
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

    const sid = String(sessionId || "").trim();

    // mode cũ: có sessionId (không bắt buộc start/end)
    if (sid) {
      const doc = await LeaveRequest.create({
        classId: cid,
        sessionId: sid,
        studentId,
        studentName,
        studentCode,
        subjectCode,
        subjectName,
        reason: r,
        status: "PENDING",
      });
      return res.json(doc);
    }

    // mode mới: theo khoảng ngày
    const s = String(startDate || "").trim();
    const e = String(endDate || "").trim();
    if (!s || !e) return res.status(400).json({ message: "startDate/endDate is required" });

    const ds = new Date(s).getTime();
    const de = new Date(e).getTime();
    if (Number.isNaN(ds) || Number.isNaN(de)) return res.status(400).json({ message: "Invalid date" });
    if (ds > de) return res.status(400).json({ message: "startDate must be <= endDate" });

    const doc = await LeaveRequest.create({
      classId: cid,
      sessionId: "",
      studentId,
      studentName,
      studentCode,
      subjectCode,
      subjectName,
      startDate: s,
      endDate: e,
      reason: r,
      status: "PENDING",
    });

    return res.json(doc);
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
});

// =========================
// STUDENT: View my leaves
// =========================
router.get("/my-leave-requests", requireRole("STUDENT"), async (req, res) => {
  try {
    const studentId = uidOf(req);
    const classId = String(req.query.classId || "").trim();
    if (!classId) return res.status(400).json({ message: "classId is required" });

    const list = await LeaveRequest.find({ classId, studentId }).sort({ createdAt: -1 });
    return res.json(list);
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
});

// =========================
// TEACHER: View leaves by class
// =========================
router.get("/leave-requests", requireRole("TEACHER"), async (req, res) => {
  try {
    const classId = String(req.query.classId || "").trim();
    if (!classId) return res.status(400).json({ message: "classId is required" });

    const status = String(req.query.status || "PENDING").toUpperCase();
    const q = { classId };
    if (status !== "ALL") q.status = status;

    const list = await LeaveRequest.find(q).sort({ createdAt: -1 });
    return res.json(list);
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
});

// =========================
// TEACHER: Approve / Reject
// =========================
router.put("/leave-approve/:id", requireRole("TEACHER"), mustHaveId, async (req, res) => {
  try {
    const teacherId = uidOf(req);
    const teacherNote = String(req.body?.teacherNote || "").trim();

    const doc = await LeaveRequest.findByIdAndUpdate(
      req.params.id,
      { status: "APPROVED", teacherNote, decidedAt: new Date(), decidedBy: teacherId },
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: "Leave not found" });
    return res.json(doc);
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
});

router.put("/leave-reject/:id", requireRole("TEACHER"), mustHaveId, async (req, res) => {
  try {
    const teacherId = uidOf(req);
    const teacherNote = String(req.body?.teacherNote || "").trim();

    const doc = await LeaveRequest.findByIdAndUpdate(
      req.params.id,
      { status: "REJECTED", teacherNote, decidedAt: new Date(), decidedBy: teacherId },
      { new: true }
    );

    if (!doc) return res.status(404).json({ message: "Leave not found" });
    return res.json(doc);
  } catch (e) {
    return res.status(500).json({ message: e?.message || "Server error" });
  }
});

export default router;

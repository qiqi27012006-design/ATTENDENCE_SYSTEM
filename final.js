const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();
app.use(express.json()); 

// ===== FAKE AUTH MIDDLEWARE (TẠM THỜI) =====
app.use((req, res, next) => {
  req.user = {
    id: req.headers["x-user-id"] || "TEMP_USER_ID",
    role: req.headers["x-role"] || "STUDENT" // STUDENT | TEACHER
  };
  next();
});


// 1. MODELS (Phải khai báo đầu tiên)

// Model: AttendanceSession 
const AttendanceSession = mongoose.model("AttendanceSession", new mongoose.Schema({
  classId: { type: String, required: true },
  lesson: { type: String, required: true },
  attendanceCode: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  isClosed: { type: Boolean, default: false },
  createdBy: { type: String, required: true } 
}, { timestamps: true }));


// Model: AttendanceRecord 
const attendanceRecordSchema = new mongoose.Schema({
    sessionId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "AttendanceSession",
  required: true
},

    studentId: { type: String, ref: "User", required: true },
    status: { type: String, enum: ["PRESENT", "ABSENT", "EXCUSED"], default: "ABSENT" },
    checkInTime: { type: Date }
}, { timestamps: true });
attendanceRecordSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
const AttendanceRecord = mongoose.model("AttendanceRecord", attendanceRecordSchema);

// Model: LeaveRequest
const LeaveRequest = mongoose.model("LeaveRequest", new mongoose.Schema({
    sessionId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "AttendanceSession",
  required: true
},

    studentId: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" }
}, { timestamps: true }));

// 2. CONTROLLERS 

// Tạo session
const createSession = async (req, res) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ message: "Only teacher can create session" });
    }

    const { classId, lesson, attendanceCode, startTime, endTime } = req.body;
    if (!classId || !lesson || !attendanceCode || !startTime || !endTime) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const session = await AttendanceSession.create({
      classId,
      lesson,
      attendanceCode,
      startTime,
      endTime,
      createdBy: req.user.id
    });

    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Điểm danh 
const checkIn = async (req, res) => {
  try {
    const { sessionId, attendanceCode } = req.body;

    if (!sessionId || !attendanceCode) {
      return res.status(400).json({ message: "Missing data" });
    }

   const session = await AttendanceSession.findById(sessionId)
;
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.attendanceCode !== attendanceCode) {
      return res.status(400).json({ message: "Wrong attendance code" });
    }

    const record = await AttendanceRecord.findOneAndUpdate(
      { sessionId, studentId: req.user.id },
      {
        sessionId,
        studentId: req.user.id,
        status: "PRESENT",
        checkInTime: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      message: "Attendance success",
      record
    });
  } catch (err) {
    console.error("CHECK-IN ERROR:", err); // 👈 DÒNG QUAN TRỌNG
    res.status(500).json({ error: err.message });
  }
};


// Xin vắng 
const requestLeave = async (req, res) => {
  try {
    if (req.user.role !== "STUDENT") {
      return res.status(403).json({ message: "Only student can request leave" });
    }

    const { sessionId, reason } = req.body;
    if (!sessionId || !reason) {
      return res.status(400).json({ message: "Missing data" });
    }

    const leave = await LeaveRequest.create({
      sessionId,
      studentId: req.user.id,
      reason
    });

    res.status(201).json(leave);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Duyệt đơn 
const approveLeave = async (req, res) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ message: "Only teacher can approve leave" });
    }

    const { leaveId } = req.params;

    const leave = await LeaveRequest.findByIdAndUpdate(
      leaveId,
      { status: "APPROVED" },
      { new: true }
    );

    if (!leave) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    res.json(leave);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// Đóng session (Teacher)
const closeSession = async (req, res) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ message: "Only teacher can close session" });
    }

    const { sessionId } = req.params;

    const session = await AttendanceSession.findById(sessionId);

    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }

    if (session.isClosed) {
      return res.status(400).json({ message: "Session already closed" });
    }

    session.isClosed = true;
    await session.save();

    res.json({
      message: "Session closed successfully",
      session
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ✅ Teacher xem danh sách đơn xin vắng theo classId
app.get("/api/attendance/leave-requests", async (req, res) => {
  try {
    if (req.user.role !== "TEACHER") {
      return res.status(403).json({ message: "Only teacher can view leave requests" });
    }

    const { classId, status = "PENDING" } = req.query;
    if (!classId) return res.status(400).json({ message: "Missing classId" });

    // populate session để lọc theo classId
    const leaves = await LeaveRequest.find({ status })
      .populate("sessionId")
      .sort({ createdAt: -1 });

    const filtered = leaves.filter(
      (lv) => lv.sessionId && lv.sessionId.classId === classId
    );

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 3. ROUTES 

app.post("/api/attendance/create-session", createSession); 
app.post("/api/attendance/check-in", checkIn); 
app.post("/api/attendance/leave-request", requestLeave);
app.put("/api/attendance/leave-approve/:leaveId", approveLeave); 
app.post("/api/attendance/close-session/:sessionId", closeSession);

app.get("/", (req, res) => {
  res.send("Attendance Backend is running (Single File Mode)"); 
});

mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/attendance_system") 
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("Mongo error:", err));

const PORT = process.env.PORT || 5000; 
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

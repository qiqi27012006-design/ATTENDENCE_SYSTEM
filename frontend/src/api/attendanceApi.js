// src/api/attendanceApi.js
import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000",
});

// Demo auth headers (localStorage)
api.interceptors.request.use((config) => {
  const userId = (localStorage.getItem("userId") || "").trim() || "SV001";
  const role = (localStorage.getItem("role") || "STUDENT").toUpperCase();
  config.headers["x-user-id"] = userId;
  config.headers["x-role"] = role;
  return config;
});

function isRetryableHttpError(e) {
  const status = e?.response?.status;
  if (status === 404 || status === 405) return true;
  if (!e?.response) return true;
  return false;
}

async function tryMany(fns) {
  let lastErr = null;
  for (const fn of fns) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isRetryableHttpError(e)) break;
    }
  }
  throw lastErr;
}

export const attendanceApi = {
  // CLASSES
  createClass: (payload) => api.post("/api/teacher/classes", payload),
  getTeacherClasses: () => api.get("/api/teacher/classes"),
  deleteTeacherClass: (classId) => api.delete(`/api/teacher/classes/${classId}`),
  getMyClasses: () => api.get("/api/student/classes"),

  // SESSIONS
  getSessionsByClass: (classId) => api.get("/api/attendance/sessions", { params: { classId } }),
  getActiveSessionByClass: (classId) => api.get("/api/attendance/active-session", { params: { classId } }),
  createSession: (payload) => api.post("/api/attendance/create-session", payload),
  closeSession: (sessionId) => api.post(`/api/attendance/close-session/${sessionId}`),
  getSessionAttendees: (sessionId) => api.get("/api/attendance/session-attendees", { params: { sessionId } }),

  // CHECK-IN
  checkIn: (sessionId, attendanceCode) => api.post("/api/attendance/check-in", { sessionId, attendanceCode }),
  getMyAttendanceByClass: (classId) => api.get("/api/attendance/my-attendance", { params: { classId } }),

  // LEAVE
  // ✅ hỗ trợ: requestLeave(classId, payloadObject) hoặc requestLeave({ ... })
  // (khớp server in-memory)
  requestLeave: (arg1, arg2) => {
    // arg1 string => thường là classId
    if (typeof arg1 === "string") {
      // arg2 object => mode mới theo lớp + range
      if (arg2 && typeof arg2 === "object" && !Array.isArray(arg2)) {
        return api.post("/api/attendance/leave-request", { classId: arg1, ...arg2 });
      }
      // arg2 string => fallback kiểu cũ (sessionId, reason) nhưng server yêu cầu classId => không dùng nữa
      return api.post("/api/attendance/leave-request", { sessionId: arg1, reason: arg2 });
    }
    // arg1 object
    return api.post("/api/attendance/leave-request", arg1);
  },

  getLeaveRequestsByClass: (classId, status = "PENDING") => {
    const params = { classId };
    if (status && String(status).toUpperCase() !== "ALL") params.status = status;
    return api.get("/api/attendance/leave-requests", { params });
  },

  getMyLeaveRequestsByClass: (classId) => api.get("/api/attendance/my-leave-requests", { params: { classId } }),

  approveLeave: (leaveId, teacherNote = "") =>
    tryMany([
      () => api.put(`/api/attendance/leave-approve/${leaveId}`, { teacherNote }),
      () => api.put(`/api/attendance/leave-approve/${leaveId}`),
    ]),

  rejectLeave: (leaveId, teacherNote = "") =>
    tryMany([
      () => api.put(`/api/attendance/leave-reject/${leaveId}`, { teacherNote }),
      () => api.put(`/api/attendance/leave-reject/${leaveId}`),
    ]),

  updateLeaveStatus: (leaveId, status, teacherNote = "") => {
    const s = String(status || "").toUpperCase();
    if (s === "APPROVED") return api.put(`/api/attendance/leave-approve/${leaveId}`, { teacherNote });
    if (s === "REJECTED") return api.put(`/api/attendance/leave-reject/${leaveId}`, { teacherNote });
    return Promise.reject(new Error("Unsupported status"));
  },
};

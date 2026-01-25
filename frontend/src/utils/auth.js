// src/utils/auth.js
import { sendResetCodeEmail } from "./mailer.js";

/**
 * LocalStorage keys
 */
const USERS_KEY = "sas_users";
const SESSION_KEY = "sas_session";
const RESET_PREFIX = "sas_reset_"; // sas_reset_<emailLower>

// Keys mà attendanceApi đang đọc
const USER_ID_KEY = "userId";
const ROLE_KEY = "role";

/**
 * Helpers
 */
function safeParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}
function normalize(s) {
  return String(s || "").trim();
}
function lower(s) {
  return normalize(s).toLowerCase();
}
function isEmail(s) {
  const x = normalize(s);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
}
function readUsers() {
  return safeParse(localStorage.getItem(USERS_KEY) || "[]", []);
}
function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}
function genOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Public user
 */
function toPublicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role, // "teacher" | "student"

    // profile fields
    citizenId: user.citizenId || "",
    fullName: user.fullName || "",
    dob: user.dob || "",
    gender: user.gender || "male",
    phone: user.phone || "",
    email: user.email || "",
    avatarUrl: user.avatarUrl || "",
    address: user.address || "",

    // role-specific
    studentCode: user.studentCode || "",
    teacherCode: user.teacherCode || "",
  };
}

function syncApiAuthKeys(sessionUser) {
  if (!sessionUser?.id) return;

  // role uppercase
  localStorage.setItem(ROLE_KEY, String(sessionUser.role || "").toUpperCase()); // STUDENT | TEACHER

  // userId ưu tiên mã GV/MSSV -> username -> id
  const preferredId =
    (sessionUser.role === "teacher" ? normalize(sessionUser.teacherCode) : normalize(sessionUser.studentCode)) ||
    normalize(sessionUser.username) ||
    normalize(sessionUser.id);

  localStorage.setItem(USER_ID_KEY, preferredId);
}

/**
 * Tìm user theo username / email / citizenId
 */
function findUserByIdentifier(users, identifier) {
  const key = lower(identifier);
  return users.find(
    (x) => lower(x.username) === key || lower(x.email) === key || lower(x.citizenId) === key
  );
}

/**
 * =========================
 * REGISTER
 * =========================
 * Hỗ trợ đăng ký đầy đủ thông tin (CCCD có thể dùng làm username)
 */
export function registerUser(payload) {
  const u = normalize(payload?.username || payload?.citizenId);
  const p = String(payload?.password || "");
  const r = payload?.role === "teacher" ? "teacher" : "student";

  if (!u) return { ok: false, message: "Vui lòng nhập tên người dùng" };
  if (p.length < 4) return { ok: false, message: "Mật khẩu tối thiểu 4 ký tự" };

  const users = readUsers();
  const exists = users.some((x) => lower(x.username) === lower(u));
  if (exists) return { ok: false, message: "Tài khoản đã tồn tại" };

  // Nếu có email thì check trùng email
  const email = normalize(payload?.email);
  if (email) {
    const existsEmail = users.some((x) => lower(x.email) === lower(email));
    if (existsEmail) return { ok: false, message: "Email đã được sử dụng" };
  }

  const newUser = {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    username: u,
    password: p,
    role: r,
    createdAt: new Date().toISOString(),

    // profile (lưu ngay khi đăng ký)
    citizenId: normalize(payload?.citizenId || u),
    fullName: normalize(payload?.fullName),
    dob: normalize(payload?.dob),
    gender: normalize(payload?.gender) || "male",
    phone: normalize(payload?.phone),
    email: email,
    avatarUrl: normalize(payload?.avatarUrl),
    address: normalize(payload?.address),

    studentCode: normalize(payload?.studentCode),
    teacherCode: normalize(payload?.teacherCode),
  };

  users.push(newUser);
  writeUsers(users);

  return { ok: true, message: "Đăng ký thành công", user: toPublicUser(newUser) };
}

/**
 * =========================
 * LOGIN
 * =========================
 * Cho phép login bằng username hoặc email hoặc CCCD
 * Đồng thời: nếu user.email rỗng mà username lại là email thì tự “migrate” email = username
 */
export function loginUser({ username, password }) {
  const input = normalize(username);
  const p = String(password || "");

  if (!input) return { ok: false, message: "Vui lòng nhập tài khoản" };
  if (!p) return { ok: false, message: "Vui lòng nhập mật khẩu" };

  const users = readUsers();
  const user = findUserByIdentifier(users, input);

  if (!user || user.password !== p) return { ok: false, message: "Sai tài khoản hoặc mật khẩu" };

  // migrate: nếu email trống nhưng username là email
  if (!normalize(user.email) && isEmail(user.username)) {
    user.email = normalize(user.username);
    writeUsers(users);
  }

  const sessionUser = toPublicUser(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  syncApiAuthKeys(sessionUser);

  return { ok: true, message: "Đăng nhập thành công", user: sessionUser };
}

export function getCurrentUser() {
  return safeParse(localStorage.getItem(SESSION_KEY) || "null", null);
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(ROLE_KEY);
  return { ok: true };
}

/**
 * =========================
 * UPDATE PROFILE
 * =========================
 * FIX QUAN TRỌNG: lưu cả email/dob/gender vào sas_users
 */
export function updateProfile(payload) {
  const current = getCurrentUser();
  if (!current?.id) return { ok: false, message: "Bạn chưa đăng nhập" };

  const users = readUsers();
  const idx = users.findIndex((x) => x.id === current.id);
  if (idx === -1) return { ok: false, message: "Không tìm thấy tài khoản" };

  const u = users[idx];

  const next = {
    ...u,
    fullName: normalize(payload?.fullName),
    phone: normalize(payload?.phone),
    avatarUrl: normalize(payload?.avatarUrl),
    address: normalize(payload?.address),
    studentCode: normalize(payload?.studentCode),
    teacherCode: normalize(payload?.teacherCode),

    // ✅ thêm các field bạn thiếu trước đây
    email: normalize(payload?.email),
    dob: normalize(payload?.dob),
    gender: normalize(payload?.gender) || u.gender || "male",
  };

  users[idx] = next;
  writeUsers(users);

  const sessionUser = toPublicUser(next);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  syncApiAuthKeys(sessionUser);

  return { ok: true, message: "Cập nhật hồ sơ thành công", user: sessionUser };
}

/**
 * =========================
 * FORGOT PASSWORD (EmailJS OTP)
 * =========================
 * FIX QUAN TRỌNG:
 * - tìm theo username/email/cccd
 * - nếu user.email rỗng nhưng username là email => dùng username để gửi OTP
 */
export async function requestPasswordReset({ username }) {
  const input = normalize(username);
  if (!input) return { ok: false, message: "Vui lòng nhập CCCD hoặc Email" };

  const users = readUsers();
  const user = findUserByIdentifier(users, input);
  if (!user) return { ok: false, message: "Không tìm thấy tài khoản" };

  const targetEmail =
    normalize(user.email) || (isEmail(user.username) ? normalize(user.username) : "");

  if (!isEmail(targetEmail)) {
    return {
      ok: false,
      message:
        "Tài khoản này chưa có Email hợp lệ để nhận OTP. Vui lòng cập nhật Email trong Profile.",
    };
  }

  const otp = genOtp6();
  const minutes = 15;
  const expiresAt = Date.now() + minutes * 60 * 1000;

  const resetKey = RESET_PREFIX + lower(targetEmail);
  localStorage.setItem(resetKey, JSON.stringify({ code: otp, expiresAt }));

  try {
    await sendResetCodeEmail({
      email: targetEmail,
      otp_code: otp,
      minutes,
      app_name: "Attendance System",
    });

    return { ok: true, message: "Đã gửi mã OTP về email!", email: targetEmail };
  } catch (err) {
    localStorage.removeItem(resetKey);
    const detail = err?.text || err?.message || "unknown";
    return { ok: false, message: `Gửi email thất bại: ${detail}` };
  }
}

export function resetPassword({ username, code, newPassword }) {
  const input = normalize(username);
  const c = normalize(code);
  const np = String(newPassword || "");

  if (!input) return { ok: false, message: "Vui lòng nhập CCCD hoặc Email" };
  if (!c) return { ok: false, message: "Vui lòng nhập mã OTP" };
  if (np.length < 4) return { ok: false, message: "Mật khẩu mới tối thiểu 4 ký tự" };

  const users = readUsers();
  const user = findUserByIdentifier(users, input);
  if (!user) return { ok: false, message: "Không tìm thấy tài khoản" };

  const targetEmail =
    normalize(user.email) || (isEmail(user.username) ? normalize(user.username) : "");

  if (!isEmail(targetEmail)) {
    return { ok: false, message: "Tài khoản này chưa có Email hợp lệ để xác thực OTP." };
  }

  const resetKey = RESET_PREFIX + lower(targetEmail);
  const record = safeParse(localStorage.getItem(resetKey) || "null", null);
  if (!record) return { ok: false, message: "Chưa yêu cầu quên mật khẩu hoặc mã đã bị xoá" };

  if (Date.now() > record.expiresAt) {
    localStorage.removeItem(resetKey);
    return { ok: false, message: "Mã đã hết hạn. Vui lòng yêu cầu lại." };
  }

  if (String(record.code) !== String(c)) {
    return { ok: false, message: "Mã OTP không đúng" };
  }

  const idx = users.findIndex((x) => x.id === user.id);
  if (idx === -1) return { ok: false, message: "Không tìm thấy tài khoản" };

  users[idx].password = np;
  writeUsers(users);
  localStorage.removeItem(resetKey);

  return { ok: true, message: "Đổi mật khẩu thành công" };
}

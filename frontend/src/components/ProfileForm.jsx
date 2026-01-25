// src/components/ProfileForm.jsx
import { useEffect, useMemo, useState } from "react";
import { getCurrentUser, updateProfile } from "../utils/auth.js";
import { useNavigate } from "react-router-dom";

export default function ProfileForm({ backTo }) {
  const nav = useNavigate();

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [user, setUser] = useState(null);

  // Editable fields
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState(""); // yyyy-mm-dd
  const [gender, setGender] = useState("male"); // male|female|other
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [teacherCode, setTeacherCode] = useState("");

  const roleLabel = useMemo(() => {
    if (!user?.role) return "";
    return user.role === "teacher" ? "Giảng viên" : "Sinh viên";
  }, [user]);

  function hydrateFromUser(u) {
    setUser(u || null);
    setFullName(u?.fullName || "");
    setDob(u?.dob || "");
    setGender(u?.gender || "male");
    setPhone(u?.phone || "");
    setEmail(u?.email || "");
    setAddress(u?.address || "");
    setStudentCode(u?.studentCode || "");
    setTeacherCode(u?.teacherCode || "");
  }

  useEffect(() => {
    const u = getCurrentUser();
    hydrateFromUser(u);
  }, []);

  const onSave = async (e) => {
    e.preventDefault();
    setMsg("");
    setLoading(true);

    try {
      const cleanFullName = String(fullName || "").trim();
      const cleanPhone = String(phone || "").trim().replace(/\s+/g, "");
      const cleanEmail = String(email || "").trim();
      const cleanAddress = String(address || "").trim();
      const cleanStudentCode = String(studentCode || "").trim();
      const cleanTeacherCode = String(teacherCode || "").trim();

      if (!cleanFullName) {
        setMsg("Vui lòng nhập Họ và tên.");
        return;
      }

      // Nếu là SV/GV thì bắt buộc MSSV / Mã GV (tuỳ yêu cầu hệ bạn)
      if (user?.role === "student" && !cleanStudentCode) {
        setMsg("Vui lòng nhập MSSV.");
        return;
      }
      if (user?.role === "teacher" && !cleanTeacherCode) {
        setMsg("Vui lòng nhập Mã GV.");
        return;
      }

      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        setMsg("Email không hợp lệ.");
        return;
      }

      if (cleanPhone && !/^(\+84|0)\d{8,10}$/.test(cleanPhone)) {
        setMsg("Số điện thoại không hợp lệ.");
        return;
      }

      if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
        setMsg("Ngày sinh không hợp lệ.");
        return;
      }

      const payload = {
        fullName: cleanFullName,
        dob: dob || "",
        gender: gender || "male",
        phone: cleanPhone,
        email: cleanEmail,
        address: cleanAddress,
        studentCode: cleanStudentCode,
        teacherCode: cleanTeacherCode,
      };

      // ✅ QUAN TRỌNG: phải await
      const res = await updateProfile(payload);

      if (!res?.ok) {
        setMsg(res?.message || "Cập nhật thất bại");
        return;
      }

      hydrateFromUser(res.user);

      // ✅ Chuẩn hoá localStorage để các trang khác (StudentLeavePage) đọc ổn định
      try {
        localStorage.setItem("attendance_user", JSON.stringify(res.user));
      } catch {}

      // Đồng bộ role/userId cho attendanceApi (nếu backend bạn dùng mã số thay vì _id)
      const isTeacher = res?.user?.role === "teacher";
      localStorage.setItem("role", isTeacher ? "TEACHER" : "STUDENT");

      // Ưu tiên id DB, fallback sang mã SV/GV
      const idForApi =
        res?.user?.id ||
        res?.user?._id ||
        (isTeacher ? cleanTeacherCode : cleanStudentCode);

      if (idForApi) localStorage.setItem("userId", String(idForApi));

      setMsg("Cập nhật thành công.");
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const onCancel = () => {
    const u = getCurrentUser();
    hydrateFromUser(u);
    setMsg("");
    nav(backTo || -1);
  };

  const pageStyle = {
    minHeight: "100vh",
    padding: 24,
    color: "#eaeaea",
    background: "linear-gradient(180deg, #0f0f10 0%, #141416 100%)",
  };

  const cardStyle = {
    maxWidth: 760,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(20,20,22,0.7)",
    boxShadow: "0 10px 30px rgba(0,0,0,.35)",
    padding: 18,
  };

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.25)",
    color: "#fff",
    outline: "none",
  };

  const inputReadonly = {
    ...inputStyle,
    opacity: 0.85,
    cursor: "not-allowed",
  };

  const labelStyle = { display: "grid", gap: 6 };

  const btnStyle = (kind) => ({
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: kind === "primary" ? "rgba(255,255,255,0.10)" : "transparent",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 800,
  });

  // ✅ Sửa: id có thể là _id
  const uid = user?.id || user?._id;
  if (!uid) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Hồ sơ</h2>
          <p>Bạn chưa đăng nhập.</p>
          <button style={btnStyle("primary")} onClick={() => nav("/login")}>
            Về đăng nhập
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <button style={btnStyle()} type="button" onClick={() => nav(backTo || -1)}>
          ← Quay lại
        </button>
        <div style={{ opacity: 0.8 }}>
          {user.username} • {roleLabel}
        </div>
      </div>

      <div style={cardStyle}>
        <h2 style={{ marginTop: 0 }}>Cập nhật hồ sơ</h2>

        {msg ? (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            {msg}
          </div>
        ) : null}

        <form onSubmit={onSave} style={{ display: "grid", gap: 12 }}>
          <label style={labelStyle}>
            Tên người dùng (CCCD) — chỉ đọc
            <input style={inputReadonly} value={user.username || ""} readOnly />
          </label>

          <label style={labelStyle}>
            Email
            <input
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email"
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              Họ và tên
              <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>

            <label style={labelStyle}>
              Số điện thoại
              <input
                style={inputStyle}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 0912345678 hoặc +84912345678"
              />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={labelStyle}>
              Ngày sinh
              <input style={inputStyle} type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </label>

            <label style={labelStyle}>
              Giới tính
              <select style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="male">Nam</option>
                <option value="female">Nữ</option>
                <option value="other">Khác</option>
              </select>
            </label>
          </div>

          <label style={labelStyle}>
            Địa chỉ
            <input style={inputStyle} value={address} onChange={(e) => setAddress(e.target.value)} />
          </label>

          {user.role === "student" ? (
            <label style={labelStyle}>
              MSSV
              <input style={inputStyle} value={studentCode} onChange={(e) => setStudentCode(e.target.value)} />
            </label>
          ) : (
            <label style={labelStyle}>
              Mã GV
              <input style={inputStyle} value={teacherCode} onChange={(e) => setTeacherCode(e.target.value)} />
            </label>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btnStyle("primary")} disabled={loading} type="submit">
              {loading ? "Đang lưu..." : "Lưu thay đổi"}
            </button>

            <button style={btnStyle()} type="button" onClick={onCancel}>
              Hủy
            </button>
          </div>

          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Ghi chú: Sau khi Lưu, hệ thống đồng bộ role/userId và lưu user chuẩn vào <code>attendance_user</code>.
          </div>
        </form>
      </div>
    </div>
  );
}

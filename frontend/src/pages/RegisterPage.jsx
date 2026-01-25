import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser } from "../utils/auth.js";
import "./RegisterPage.css";

export default function RegisterPage() {
  const nav = useNavigate();

  // Thông tin cá nhân
  const [fullName, setFullName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("male"); // male | female | other
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Tài khoản
  const [citizenId, setCitizenId] = useState(""); // CCCD = username
  const [role, setRole] = useState("student"); // student | teacher
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  // UI
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setOkMsg("");

    const cleanFullName = fullName.trim();
    const cleanEmail = email.trim();
    const cleanPhone = phone.trim().replace(/\s+/g, "");
    const cleanCitizenId = citizenId.trim();

    if (!cleanFullName) return setMsg("Vui lòng nhập Họ và tên.");
    if (!dob) return setMsg("Vui lòng chọn Ngày sinh.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setMsg("Email không hợp lệ.");
    if (!/^(\+84|0)\d{8,10}$/.test(cleanPhone)) return setMsg("Số điện thoại không hợp lệ.");
    if (!/^\d{9,12}$/.test(cleanCitizenId)) return setMsg("CCCD không hợp lệ (9–12 chữ số).");
    if (password.length < 6) return setMsg("Mật khẩu tối thiểu 6 ký tự.");
    if (password !== confirm) return setMsg("Mật khẩu nhập lại không khớp.");

    setLoading(true);
    try {
      // CCCD = username (theo yêu cầu bạn)
      const payload = {
        username: cleanCitizenId,
        citizenId: cleanCitizenId,
        fullName: cleanFullName,
        dob,
        gender,
        phone: cleanPhone,
        email: cleanEmail,
        role,
        password,
      };

      const res = await Promise.resolve(registerUser(payload));
      if (!res?.ok) {
        setMsg(res?.message || "Đăng ký thất bại");
        return;
      }

      setOkMsg("Đăng ký thành công! Đang chuyển về trang đăng nhập...");
      setTimeout(() => nav("/login"), 900);
    } catch (err) {
      setMsg(err?.message || "Có lỗi xảy ra, vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-left">
        <h2 className="auth-title">Đăng ký</h2>

        <form onSubmit={onSubmit} className="auth-form">
          {/* Họ và tên */}
          <label className="auth-label">
            Họ và tên
            <input
              className="auth-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nhập họ và tên"
              required
            />
          </label>

          {/* Ngày sinh */}
          <label className="auth-label">
            Ngày sinh
            <input
              className="auth-input"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
            />
          </label>

          {/* Giới tính */}
          <div className="auth-label">
            Giới tính
            <div className="auth-radio-row">
              <label className="auth-radio">
                <input
                  type="radio"
                  name="gender"
                  checked={gender === "male"}
                  onChange={() => setGender("male")}
                />
                Nam
              </label>
              <label className="auth-radio">
                <input
                  type="radio"
                  name="gender"
                  checked={gender === "female"}
                  onChange={() => setGender("female")}
                />
                Nữ
              </label>
              <label className="auth-radio">
                <input
                  type="radio"
                  name="gender"
                  checked={gender === "other"}
                  onChange={() => setGender("other")}
                />
                Khác
              </label>
            </div>
          </div>

          {/* Số điện thoại */}
          <label className="auth-label">
            Số điện thoại
            <input
              className="auth-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="VD: 0912345678 hoặc +84912345678"
              required
            />
          </label>

          {/* Email */}
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email"
              required
            />
          </label>

          {/* CCCD (username) */}
          <label className="auth-label">
            Mã số công dân (tên người dùng)
            <input
              className="auth-input"
              inputMode="numeric"
              value={citizenId}
              onChange={(e) => setCitizenId(e.target.value)}
              placeholder="Nhập CCCD (9–12 số)"
              required
            />
          </label>

          {/* Mật khẩu */}
          <label className="auth-label">
            Mật khẩu
            <input
              className="auth-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              required
            />
          </label>

          {/* Nhập lại mật khẩu */}
          <label className="auth-label">
            Nhập lại mật khẩu
            <input
              className="auth-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Nhập lại mật khẩu"
              required
            />
          </label>

          {/* Loại tài khoản */}
          <label className="auth-label">
            Loại tài khoản
            <select
              className="auth-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="student">Học sinh / Sinh viên</option>
              <option value="teacher">Giáo viên</option>
            </select>
          </label>

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? "Đang đăng ký..." : "Đăng ký"}
          </button>

          {msg ? <div className="auth-msg auth-msg--err">{msg}</div> : null}
          {okMsg ? <div className="auth-msg auth-msg--ok">{okMsg}</div> : null}

          <div className="auth-foot">
            Đã có tài khoản? <Link className="auth-link" to="/login">Đăng nhập</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

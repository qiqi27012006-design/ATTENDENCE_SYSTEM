// src/pages/ResetPasswordPage.jsx
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { resetPassword } from "../utils/auth.js";

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const location = useLocation();

  const presetEmail = location.state?.username || "";

  const [username, setUsername] = useState(presetEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = (e) => {
    e.preventDefault();
    setMsg("");
    setOkMsg("");

    if (newPassword !== confirm) {
      setMsg("Mật khẩu nhập lại không khớp");
      return;
    }

    setLoading(true);
    try {
      const res = resetPassword({ username, code, newPassword });
      if (!res?.ok) {
        setMsg(res?.message || "Đổi mật khẩu thất bại");
        return;
      }

      setOkMsg("✅ Đổi mật khẩu thành công! Đang chuyển về đăng nhập...");
      setTimeout(() => nav("/login"), 900);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h2>Đặt lại mật khẩu</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            required
          />
        </label>

        <label>
          Mã (OTP)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Nhập mã 6 số trong email"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            required
          />
        </label>

        <label>
          Mật khẩu mới
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            required
          />
        </label>

        <label>
          Nhập lại mật khẩu mới
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            required
          />
        </label>

        <button type="submit" disabled={loading} style={{ padding: 10, cursor: "pointer" }}>
          {loading ? "Đang đổi..." : "Đổi mật khẩu"}
        </button>
      </form>

      {msg ? <p style={{ marginTop: 12, color: "tomato" }}>{msg}</p> : null}
      {okMsg ? <p style={{ marginTop: 12, color: "limegreen" }}>{okMsg}</p> : null}

      <p style={{ marginTop: 12 }}>
        <Link to="/forgot-password">Quay lại quên mật khẩu</Link>
      </p>
    </div>
  );
}

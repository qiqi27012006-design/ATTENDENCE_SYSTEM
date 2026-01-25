// src/pages/ForgotPasswordPage.jsx
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { requestPasswordReset } from "../utils/auth.js";

export default function ForgotPasswordPage() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setOkMsg("");
    setLoading(true);

    try {
      const res = await requestPasswordReset({ username });
      if (!res?.ok) {
        setMsg(res?.message || "Không gửi được email");
        return;
      }

      setOkMsg("✅ Đã gửi mã về email. Nhấn 'Tiếp tục' để nhập mã đổi mật khẩu.");
    } catch (err) {
      console.error(err);
      setMsg(err?.message || "Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 420 }}>
      <h2>Quên mật khẩu</h2>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Email
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nhập email đã đăng ký"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
            required
          />
        </label>

        <button type="submit" disabled={loading} style={{ padding: 10, cursor: "pointer" }}>
          {loading ? "Đang gửi..." : "Gửi mã về email"}
        </button>
      </form>

      {msg ? <p style={{ marginTop: 12, color: "tomato" }}>{msg}</p> : null}
      {okMsg ? (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: "limegreen" }}>{okMsg}</p>
          <button
            style={{ padding: 10, cursor: "pointer" }}
            onClick={() => nav("/reset-password", { state: { username } })}
          >
            Tiếp tục
          </button>
        </div>
      ) : null}

      <p style={{ marginTop: 12 }}>
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </div>
  );
}

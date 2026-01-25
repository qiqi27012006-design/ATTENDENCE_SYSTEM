import React from "react";
import { Outlet, useNavigate } from "react-router-dom";

export default function TeacherLayout() {
  const nav = useNavigate();

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    nav("/login", { replace: true });
  }

  return (
    <div>
      <div style={{ borderBottom: "1px solid #eee", padding: 12, display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800 }}>Teacher Panel</div>
        <button
          type="button"
          onClick={logout}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd", background: "#fff" }}
        >
          Logout
        </button>
      </div>

      <Outlet />
    </div>
  );
}

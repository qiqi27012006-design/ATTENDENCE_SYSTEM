// src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { getCurrentUser } from "../utils/auth.js";

export default function ProtectedRoute({ role, children }) {
  const loc = useLocation();

  // Ưu tiên session của auth.js
  const session = getCurrentUser();

  // Fallback theo localStorage kiểu demo
  const token = localStorage.getItem("token");
  const lsRole = (localStorage.getItem("role") || "").toLowerCase();

  const currentRole = (session?.role || lsRole || "").toLowerCase();
  const isAuthed = !!session || !!token;

  if (!isAuthed) {
    return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  }

  if (role && currentRole && currentRole !== role.toLowerCase()) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

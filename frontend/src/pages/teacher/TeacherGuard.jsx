import React from "react";
import { Navigate } from "react-router-dom";

export default function TeacherGuard({ children }) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) return <Navigate to="/login" replace />;
  if (role !== "TEACHER") return <Navigate to="/login" replace />;

  return children;
}

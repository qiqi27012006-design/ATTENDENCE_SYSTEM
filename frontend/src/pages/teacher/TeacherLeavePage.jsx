// src/pages/teacher/TeacherLeavePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { attendanceApi } from "../../api/attendanceApi";

const LS_LAST_CLASS = "teacher_leave_last_class_id";

// ---- helpers ----
function toArray(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.data)) return resp.data;
  if (Array.isArray(resp.data?.data)) return resp.data.data;
  if (Array.isArray(resp.items)) return resp.items;
  if (Array.isArray(resp.data?.items)) return resp.data.items;
  if (Array.isArray(resp.leaves)) return resp.leaves;
  if (Array.isArray(resp.data?.leaves)) return resp.data.leaves;
  return [];
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

function parseDateFlexible(input) {
  if (!input) return null;

  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;

  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(input).trim();

  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const yyyy = parseInt(m[3], 10);
    const d = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateOnly(ts) {
  const d = parseDateFlexible(ts);
  return d ? d.toLocaleDateString("vi-VN") : "-";
}

function fmtDateTime(ts) {
  const d = parseDateFlexible(ts);
  return d ? d.toLocaleString("vi-VN") : "-";
}

/**
 * Parse reason:
 * [SV: tienks | MSSV: 056206005633 | Xin nghỉ: 2026-01-24 → 2026-01-28] sss
 */
function parseLeaveReason(raw) {
  const s = String(raw || "").trim();

  const mIso = s.match(
    /^\[\s*SV\s*:\s*(.*?)\s*\|\s*MSSV\s*:\s*(.*?)\s*\|\s*Xin\s*nghỉ\s*:\s*(\d{4}-\d{2}-\d{2})\s*(?:→|->|–|-)\s*(\d{4}-\d{2}-\d{2})\s*\]\s*(.*)$/i
  );
  if (mIso) {
    return {
      studentName: (mIso[1] || "").trim(),
      studentCode: (mIso[2] || "").trim(),
      from: (mIso[3] || "").trim(),
      to: (mIso[4] || "").trim(),
      pureReason: (mIso[5] || "").trim(),
    };
  }

  const m = s.match(
    /^\[\s*SV\s*:\s*(.*?)\s*\|\s*MSSV\s*:\s*(.*?)\s*\|\s*Xin\s*nghỉ\s*:\s*(.*?)\s*(?:→|->|–|-)\s*(.*?)\s*\]\s*(.*)$/i
  );
  if (m) {
    return {
      studentName: (m[1] || "").trim(),
      studentCode: (m[2] || "").trim(),
      from: (m[3] || "").trim(),
      to: (m[4] || "").trim(),
      pureReason: (m[5] || "").trim(),
    };
  }

  const m2 = s.match(/^\[\s*Xin\s*nghỉ\s*:\s*(.+?)\s*(?:→|->|–|-)\s*(.+?)\s*\]\s*(.*)$/i);
  if (m2) {
    return {
      studentName: "",
      studentCode: "",
      from: (m2[1] || "").trim(),
      to: (m2[2] || "").trim(),
      pureReason: (m2[3] || "").trim(),
    };
  }

  return { studentName: "", studentCode: "", from: "", to: "", pureReason: s };
}

// class helpers
function getClassId(c) {
  return c?.classId || c?.class?._id || c?.class?.id || c?._id || c?.id || "";
}
function getSubjectCode(c) {
  return c?.subjectCode || c?.class?.subjectCode || "—";
}
function getSubjectName(c) {
  return c?.subjectName || c?.class?.subjectName || "";
}

// flexible approve/reject
async function approveFlexible(id) {
  const candidates = [
    () => attendanceApi.approveLeave?.(id, ""),
    () => attendanceApi.approveLeave?.(id),
    () => attendanceApi.updateLeaveStatus?.(id, "APPROVED", ""),
    () => attendanceApi.updateLeaveStatus?.(id, "APPROVED"),
  ];
  let lastErr = null;
  for (const fn of candidates) {
    if (typeof fn !== "function") continue;
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Chưa có API approve.");
}

async function rejectFlexible(id) {
  const candidates = [
    () => attendanceApi.rejectLeave?.(id, ""),
    () => attendanceApi.rejectLeave?.(id),
    () => attendanceApi.updateLeaveStatus?.(id, "REJECTED", ""),
    () => attendanceApi.updateLeaveStatus?.(id, "REJECTED"),
  ];
  let lastErr = null;
  for (const fn of candidates) {
    if (typeof fn !== "function") continue;
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Chưa có API reject.");
}

export default function TeacherLeavePage() {
  const { classId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const classInfoFromState = location.state?.classInfo;

  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [leaves, setLeaves] = useState([]);

  const [teacherClasses, setTeacherClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);

  async function loadTeacherClasses() {
    setClassesLoading(true);
    try {
      const res = await attendanceApi.getTeacherClasses?.();
      setTeacherClasses(toArray(res));
    } catch {
      setTeacherClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }

  useEffect(() => {
    loadTeacherClasses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (classesLoading) return;
    if (!teacherClasses || teacherClasses.length === 0) return;

    const routeId = String(classId || "");
    const hasRoute = routeId && teacherClasses.some((c) => String(getClassId(c)) === routeId);

    if (hasRoute) {
      localStorage.setItem(LS_LAST_CLASS, routeId);
      return;
    }

    const saved = String(localStorage.getItem(LS_LAST_CLASS) || "");
    const hasSaved = saved && teacherClasses.some((c) => String(getClassId(c)) === saved);

    const fallbackId = hasSaved ? saved : String(getClassId(teacherClasses[0]) || "");
    if (!fallbackId) return;

    const found = teacherClasses.find((c) => String(getClassId(c)) === fallbackId);
    nav(`/teacher/classes/${fallbackId}/leave`, { replace: true, state: { classInfo: found || null } });
  }, [classesLoading, teacherClasses, classId, nav]);

  const selectedClass = useMemo(() => {
    const found = teacherClasses.find((c) => String(getClassId(c)) === String(classId));
    return found || classInfoFromState || null;
  }, [teacherClasses, classId, classInfoFromState]);

  const title = useMemo(() => {
    const code = getSubjectCode(selectedClass);
    const name = getSubjectName(selectedClass);
    if (name && code && code !== "—") return `${name} — ${code}`;
    if (code && code !== "—") return code;
    return `Class: ${classId || ""}`;
  }, [selectedClass, classId]);

  const classOptions = useMemo(() => {
    const mapped = (teacherClasses || [])
      .map((c) => ({ id: getClassId(c), code: getSubjectCode(c), name: getSubjectName(c) }))
      .filter((o) => o.id);

    const seen = new Set();
    const uniq = [];
    for (const o of mapped) {
      const key = String(o.id);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(o);
    }
    return uniq;
  }, [teacherClasses]);

  function onChangeClass(newId) {
    if (!newId) return;
    localStorage.setItem(LS_LAST_CLASS, String(newId));
    const found = teacherClasses.find((c) => String(getClassId(c)) === String(newId));
    nav(`/teacher/classes/${newId}/leave`, { state: { classInfo: found || null } });
  }

  async function load() {
    setLoading(true);
    setError("");
    setMsg("");
    try {
      if (!classId) {
        setLeaves([]);
        return;
      }
      const statusArg = statusFilter === "ALL" ? undefined : statusFilter;
      const res = await attendanceApi.getLeaveRequestsByClass(classId, statusArg);
      setLeaves(toArray(res));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Network Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!classId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, statusFilter]);

  async function onApprove(id) {
    setError("");
    setMsg("");
    try {
      setActing(true);
      await approveFlexible(id);
      setMsg("Phê duyệt thành công.");
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Approve failed");
    } finally {
      setActing(false);
    }
  }

  async function onReject(id) {
    setError("");
    setMsg("");
    try {
      setActing(true);
      await rejectFlexible(id);
      setMsg("Từ chối đơn thành công.");
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Reject failed");
    } finally {
      setActing(false);
    }
  }

  const s = {
    page: {
      minHeight: "100vh",
      padding: 22,
      background:
        "radial-gradient(1200px 600px at 20% 0%, rgba(120,120,255,.10), transparent 60%), linear-gradient(180deg,#0f0f10 0%, #141416 100%)",
      color: "#eaeaea",
    },
    wrap: { maxWidth: 1100, margin: "0 auto" },
    topBar: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
    backBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,.10)",
      background: "rgba(255,255,255,.06)",
      padding: "8px 12px",
      color: "#eaeaea",
      textDecoration: "none",
      fontWeight: 800,
    },
    card: {
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))",
      boxShadow: "0 14px 40px rgba(0,0,0,.45)",
      padding: 16,
    },
    title: { fontWeight: 900, fontSize: 18, marginTop: 10 },
    sub: { color: "rgba(255,255,255,.70)", marginTop: 6, fontSize: 13 },
    alertOk: {
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(70,200,120,.30)",
      background: "rgba(10,80,30,.22)",
      color: "#b7ffca",
      fontWeight: 800,
    },
    alertErr: {
      marginTop: 12,
      padding: 12,
      borderRadius: 12,
      border: "1px solid rgba(255,90,90,.35)",
      background: "rgba(120,10,10,.25)",
      color: "#ffb4b4",
      fontWeight: 800,
    },
    row: { display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" },
    label: { fontWeight: 800, color: "rgba(255,255,255,.85)", fontSize: 13 },
    select: {
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,.12)",
      background: "rgba(0,0,0,.28)",
      color: "#fff",
      padding: "10px 12px",
      outline: "none",
      minWidth: 260,
    },
    grid: { display: "grid", gap: 12, marginTop: 14 },
    itemHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
    pill: (status) => ({
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      border: "1px solid rgba(255,255,255,.12)",
      background:
        status === "APPROVED"
          ? "rgba(30,140,80,.22)"
          : status === "REJECTED"
          ? "rgba(160,40,40,.22)"
          : "rgba(180,140,40,.20)",
      color: status === "APPROVED" ? "#b7ffca" : status === "REJECTED" ? "#ffb4b4" : "#ffe5a6",
      whiteSpace: "nowrap",
    }),
    twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 },
    btnRow: { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 },
    btn: (kind) => ({
      flex: "1 1 180px",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,.14)",
      background:
        kind === "approve"
          ? "linear-gradient(180deg, rgba(70,200,120,.25), rgba(70,200,120,.12))"
          : "linear-gradient(180deg, rgba(255,90,90,.24), rgba(255,90,90,.12))",
      color: "#fff",
      padding: "10px 12px",
      fontWeight: 900,
      cursor: "pointer",
      opacity: acting ? 0.7 : 1,
    }),
    muted: { color: "rgba(255,255,255,.72)" },
  };

  return (
    <div style={s.page}>
      <div style={s.wrap}>
        <div style={s.topBar}>
          <Link to="/teacher/classes" style={s.backBtn}>
            ← Quay lại Classes
          </Link>

          <div style={s.row}>
            <span style={s.label}>Chọn lớp</span>
            <select
              style={s.select}
              value={classId || ""}
              onChange={(e) => onChangeClass(e.target.value)}
              disabled={classesLoading || classOptions.length === 0}
            >
              {classOptions.length === 0 ? (
                <option value="">{classesLoading ? "Đang tải lớp..." : "Không có lớp"}</option>
              ) : (
                classOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code}
                    {o.name ? ` — ${o.name}` : ""}
                  </option>
                ))
              )}
            </select>

            <span style={s.label}>Bộ lọc</span>
            <select style={s.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="PENDING">PENDING (chờ duyệt)</option>
              <option value="APPROVED">APPROVED (đã duyệt)</option>
              <option value="REJECTED">REJECTED (từ chối)</option>
              <option value="ALL">Tất cả</option>
            </select>
          </div>
        </div>

        <div style={s.title}>Duyệt xin nghỉ — {title}</div>
        <div style={s.sub}>Xem và phê duyệt/từ chối đơn xin nghỉ của sinh viên.</div>

        {msg ? <div style={s.alertOk}>{msg}</div> : null}
        {error ? <div style={s.alertErr}>Lỗi: {error}</div> : null}

        <div style={{ marginTop: 14 }}>
          {loading ? (
            <div style={s.muted}>Đang tải...</div>
          ) : leaves.length === 0 ? (
            <div style={s.muted}>Không có đơn xin nghỉ.</div>
          ) : (
            <div style={s.grid}>
              {leaves.map((lv) => {
                const id = lv?._id || lv?.id;

                const rawReason = String(lv?.reason || "");
                const meta = parseLeaveReason(rawReason);

                const stuName =
                  pick(lv, ["studentName", "fullName", "name"]) ||
                  meta.studentName ||
                  pick(lv?.student, ["fullName", "name"]) ||
                  "—";

                const stuCode =
                  pick(lv, ["studentCode", "mssv"]) ||
                  meta.studentCode ||
                  pick(lv?.student, ["studentCode", "mssv"]) ||
                  "—";

                const stuId = pick(lv, ["studentId"]) || pick(lv?.student, ["_id", "id"]) || "—";

                const from = lv?.startDate || lv?.fromDate || lv?.dateFrom || meta.from;
                const to = lv?.endDate || lv?.toDate || lv?.dateTo || meta.to;

                const pureReason = (meta.pureReason || "").trim() || "—";

                const status = String(lv?.status || "PENDING").toUpperCase();
                const created = lv?.createdAt || lv?.time;

                return (
                  <div key={id} style={s.card}>
                    <div style={s.itemHeader}>
                      <div>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>Đơn xin nghỉ</div>
                        <div style={s.muted}>
                          Ngày gửi: {fmtDateTime(created)} • <span style={s.pill(status)}>{status}</span>
                        </div>
                      </div>
                    </div>

                    <div style={s.twoCol}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Họ tên sinh viên</div>
                        <div style={{ fontWeight: 900 }}>{stuName}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>MSSV</div>
                        <div style={{ fontWeight: 900 }}>{stuCode}</div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Student ID (nếu có)</div>
                        <div style={{ fontWeight: 900 }}>{stuId}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>Thời gian nghỉ</div>
                        <div style={{ fontWeight: 900 }}>
                          {from ? fmtDateOnly(from) : "—"} → {to ? fmtDateOnly(to) : "—"}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>Lý do</div>
                      <div style={{ fontWeight: 800, marginTop: 4 }}>{pureReason}</div>
                    </div>

                    {status === "PENDING" ? (
                      <div style={s.btnRow}>
                        <button type="button" style={s.btn("approve")} disabled={acting} onClick={() => onApprove(id)}>
                          Phê duyệt
                        </button>
                        <button type="button" style={s.btn("reject")} disabled={acting} onClick={() => onReject(id)}>
                          Từ chối
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

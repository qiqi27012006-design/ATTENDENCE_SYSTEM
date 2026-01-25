// src/pages/student/ClassSessionsPage.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { attendanceApi } from "../../api/attendanceApi";

function fmt(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function ClassSessionsPage() {
  const { classId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const classInfo = location.state?.classInfo; // { subjectName, subjectCode, teacherName, ... }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);

  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [attendanceCode, setAttendanceCode] = useState("");

  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState("");

  const subjectCode = classInfo?.subjectCode || "—";
  const subjectName = classInfo?.subjectName || "";

  const sessionOptions = useMemo(() => {
    const arr = Array.isArray(sessions) ? sessions : [];
    return arr.map((s) => ({
      id: s?._id || s?.id,
      label: s?.lesson ? `Buổi ${s.lesson}` : (s?.attendanceCode ? `Session (${s.attendanceCode})` : `Session ${String(s?._id || s?.id).slice(0, 6)}`),
      raw: s,
    }));
  }, [sessions]);

  async function loadAll() {
    try {
      setLoading(true);
      setError("");
      setMsg("");

      const [rs, ra, rh] = await Promise.allSettled([
        attendanceApi.getSessionsByClass(classId),
        attendanceApi.getActiveSessionByClass(classId),
        attendanceApi.getMyAttendanceByClass(classId),
      ]);

      const list = rs.status === "fulfilled" ? (rs.value?.data || []) : [];
      const act = ra.status === "fulfilled" ? (ra.value?.data || null) : null;
      const his = rh.status === "fulfilled" ? (rh.value?.data || []) : [];

      setSessions(Array.isArray(list) ? list : []);
      setActive(act && (act._id || act.id) ? act : null);
      setHistory(Array.isArray(his) ? his : []);

      // auto select session: ưu tiên active
      const actId = act?._id || act?.id;
      if (actId) setSelectedSessionId(actId);
      else if (!selectedSessionId && (list?.[0]?._id || list?.[0]?.id)) setSelectedSessionId(list[0]._id || list[0].id);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Lỗi không xác định");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!classId) {
      setError("Thiếu classId trên URL.");
      setLoading(false);
      return;
    }
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  async function onCheckIn() {
    try {
      setMsg("");
      setError("");

      const sid = selectedSessionId;
      const code = String(attendanceCode || "").trim().toUpperCase();
      if (!sid) {
        setError("Bạn chưa chọn buổi (session) để điểm danh.");
        return;
      }
      if (!code) {
        setError("Vui lòng nhập mã điểm danh.");
        return;
      }

      await attendanceApi.checkIn(sid, code);
      setMsg("Điểm danh thành công.");
      setAttendanceCode("");

      // reload history
      const rh = await attendanceApi.getMyAttendanceByClass(classId);
      setHistory(rh.data || []);
    } catch (e) {
      setError(e?.response?.data?.message || e.message || "Điểm danh thất bại");
    }
  }

  return (
    <div style={{ padding: 20, maxWidth: 980, margin: "0 auto" }}>
      <button
        type="button"
        onClick={() => nav("/student/classes")}
        style={{ background: "transparent", border: "none", color: "#7aa7ff", cursor: "pointer", padding: 0 }}
      >
        ← Quay lại TKB
      </button>

      <div style={{ marginTop: 10 }}>
        <h2 style={{ margin: "6px 0" }}>
          {subjectName ? `${subjectName} - ${subjectCode}` : subjectCode}
        </h2>
        <div style={{ opacity: 0.85 }}>Nhập mã điểm danh để check-in.</div>
      </div>

      {error ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #5a2323", background: "#2a0f0f", color: "#ffb4b4" }}>
          Lỗi: {error}
        </div>
      ) : null}

      {msg ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #224a2b", background: "#0f2416", color: "#b7ffca" }}>
          {msg}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* LEFT: Check-in */}
        <div style={{ border: "1px solid #333", borderRadius: 14, background: "#111", padding: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Điểm danh</div>

          <div style={{ opacity: 0.85, marginBottom: 8 }}>
            Session đang mở:{" "}
            <b>{active?._id ? (active.lesson ? `Buổi ${active.lesson}` : "Đang mở") : "Không có / chưa có API"}</b>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              Chọn buổi (session)
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "#0d0d0d", color: "#fff" }}
              >
                {sessionOptions.length === 0 ? (
                  <option value="">(Chưa có session)</option>
                ) : (
                  <>
                    <option value="">-- Chọn session --</option>
                    {sessionOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              Mã điểm danh
              <input
                value={attendanceCode}
                onChange={(e) => setAttendanceCode(e.target.value.toUpperCase())}
                placeholder="VD: VE4NG4"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #333", background: "#0d0d0d", color: "#fff", letterSpacing: 2, fontWeight: 800 }}
              />
            </label>

            <button
              type="button"
              onClick={onCheckIn}
              disabled={loading}
              style={{ padding: 10, borderRadius: 12, border: "1px solid #333", background: "#0d0d0d", color: "#fff", cursor: "pointer" }}
            >
              Điểm danh
            </button>

            <div style={{ marginTop: 4, opacity: 0.8 }}>
              Xin vắng?{" "}
              <Link to={`/student/classes/${classId}/leave`} state={{ classInfo }} style={{ color: "#7aa7ff" }}>
                Tạo đơn xin vắng
              </Link>
            </div>
          </div>
        </div>

        {/* RIGHT: History */}
        <div style={{ border: "1px solid #333", borderRadius: 14, background: "#111", padding: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Lịch sử điểm danh</div>

          {loading ? (
            <div>Đang tải...</div>
          ) : history.length === 0 ? (
            <div style={{ opacity: 0.8 }}>Chưa có dữ liệu (hoặc bạn chưa làm API history).</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>#</th>

                    {/* ✅ đổi Session -> Môn */}
                    <th style={th}>Môn</th>

                    <th style={th}>Thời gian</th>
                    <th style={th}>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, idx) => (
                    <tr key={h._id || idx}>
                      <td style={td}>{idx + 1}</td>

                      {/* ✅ trên: mã môn | dưới: tên môn */}
                      <td style={td}>
                        <div style={{ fontWeight: 800 }}>{subjectCode}</div>
                        <div style={{ opacity: 0.8, fontSize: 12, marginTop: 2 }}>{subjectName}</div>
                      </td>

                      <td style={td}>{fmt(h.checkedAt || h.createdAt || h.time)}</td>
                      <td style={td}>{String(h.status || "PRESENT").toUpperCase()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const th = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #222", color: "#ddd", fontWeight: 700, fontSize: 13 };
const td = { padding: "10px 8px", borderBottom: "1px solid #1a1a1a", color: "#eee" };

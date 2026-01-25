// src/pages/student/StudentLeavePage.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { attendanceApi } from "../../api/attendanceApi";

// ---------------- helpers ----------------
function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function unwrapUser(obj) {
  if (!obj || typeof obj !== "object") return null;
  if (obj.user && typeof obj.user === "object") return obj.user;
  if (obj.data?.user && typeof obj.data.user === "object") return obj.data.user;
  return obj;
}
function readUser() {
  const keys = ["attendance_user", "auth_user", "user", "currentUser"];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    const parsed = safeParse(raw);
    const u = unwrapUser(parsed);
    if (u && typeof u === "object") return u;
  }
  return null;
}
function pick(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}
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
function ensureYMD(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = String(parseInt(m[1], 10)).padStart(2, "0");
    const mm = String(parseInt(m[2], 10)).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}
function fmtDateOnly(ts) {
  if (!ts) return "-";
  const s = String(ts).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("vi-VN");
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("vi-VN");
}
function fmtDateTime(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString("vi-VN");
}
function getClassId(c) {
  return c?._id || c?.id || c?.classId || "";
}
function getSubjectCode(c) {
  return c?.subjectCode || c?.classCode || c?.code || "—";
}
function getSubjectName(c) {
  return c?.subjectName || c?.courseName || c?.name || "";
}
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

  const mOld = s.match(/^\[\s*Xin\s*nghỉ\s*:\s*(.+?)\s*(?:→|->|–|-)\s*(.+?)\s*\]\s*(.*)$/i);
  if (mOld) {
    return { studentName: "", studentCode: "", from: (mOld[1] || "").trim(), to: (mOld[2] || "").trim(), pureReason: (mOld[3] || "").trim() };
  }

  return { studentName: "", studentCode: "", from: "", to: "", pureReason: s };
}

export default function StudentLeavePage() {
  const { classId } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const classInfoFromState = location.state?.classInfo;

  const [me, setMe] = useState(() => readUser());
  useEffect(() => {
    setMe(readUser());
    const onStorage = () => setMe(readUser());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const studentName = useMemo(() => pick(me, ["fullName", "fullname", "name", "hoTen", "tenDayDu"]), [me]);
  const studentCode = useMemo(() => {
    const fromUser = pick(me, ["studentCode", "mssv", "maSoSV", "studentId", "studentID"]);
    const fromLS = (localStorage.getItem("userId") || "").trim();
    return fromUser || fromLS || "";
  }, [me]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [myClasses, setMyClasses] = useState([]);
  const [myLeaves, setMyLeaves] = useState([]);

  const selectedClass = useMemo(() => {
    const found = (Array.isArray(myClasses) ? myClasses : []).find((c) => String(getClassId(c)) === String(classId));
    return found || classInfoFromState || null;
  }, [myClasses, classId, classInfoFromState]);

  const subjectCode = getSubjectCode(selectedClass);
  const subjectName = getSubjectName(selectedClass);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  const classOptions = useMemo(() => {
    const mapped = (Array.isArray(myClasses) ? myClasses : [])
      .map((c) => ({ id: getClassId(c), code: getSubjectCode(c), name: getSubjectName(c), raw: c }))
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
  }, [myClasses]);

  useEffect(() => {
    if (!startDate && !endDate) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const d = `${yyyy}-${mm}-${dd}`;
      setStartDate(d);
      setEndDate(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    try {
      setLoading(true);
      setError("");
      setMsg("");

      const [rl, rc] = await Promise.allSettled([
        attendanceApi.getMyLeaveRequestsByClass?.(classId),
        attendanceApi.getMyClasses?.(),
      ]);

      setMyLeaves(toArray(rl.status === "fulfilled" ? rl.value : null));
      setMyClasses(toArray(rc.status === "fulfilled" ? rc.value : null));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Lỗi không xác định");
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

  function validate() {
    const r = String(reason || "").trim();
    if (!r) return "Vui lòng nhập lý do nghỉ học.";
    if (!startDate || !endDate) return "Vui lòng chọn ngày bắt đầu và ngày kết thúc.";

    const ds = new Date(`${ensureYMD(startDate)}T00:00:00`);
    const de = new Date(`${ensureYMD(endDate)}T00:00:00`);
    if (Number.isNaN(ds.getTime()) || Number.isNaN(de.getTime())) return "Ngày không hợp lệ.";
    if (ds.getTime() > de.getTime()) return "Ngày bắt đầu không được sau ngày kết thúc.";
    return "";
  }

  async function onSubmit() {
    setError("");
    setMsg("");

    const v = validate();
    if (v) return setError(v);

    try {
      setSubmitting(true);

      const fromYMD = ensureYMD(startDate);
      const toYMD = ensureYMD(endDate);

      const reasonFull = `[SV: ${studentName || "-"} | MSSV: ${studentCode || "-"} | Xin nghỉ: ${fromYMD} → ${toYMD}] ${String(
        reason
      ).trim()}`;

      await attendanceApi.requestLeave(String(classId), {
        startDate: fromYMD,
        endDate: toYMD,
        reason: reasonFull,
        studentName: studentName || "",
        studentCode: studentCode || "",
        subjectCode: subjectCode || "",
        subjectName: subjectName || "",
      });

      setMsg("Gửi thư xin nghỉ học thành công. Thư đã chuyển đến giáo viên phụ trách để phê duyệt.");
      setReason("");

      const rl2 = await attendanceApi.getMyLeaveRequestsByClass?.(classId);
      setMyLeaves(toArray(rl2));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Gửi thất bại");
    } finally {
      setSubmitting(false);
    }
  }

  function onChangeClass(newId) {
    if (!newId) return;
    const found = myClasses.find((c) => String(getClassId(c)) === String(newId));
    nav(`/student/classes/${newId}/leave`, { state: { classInfo: found || null } });
  }

  const s = {
    page: {
      minHeight: "100vh",
      padding: 22,
      background:
        "radial-gradient(1200px 600px at 20% 0%, rgba(120,120,255,.10), transparent 60%), linear-gradient(180deg,#0f0f10 0%, #141416 100%)",
      color: "#eaeaea",
    },
    topBar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      flexWrap: "wrap",
      maxWidth: 1100,
      margin: "0 auto 14px auto",
    },
    backBtn: {
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,.10)",
      background: "rgba(255,255,255,.06)",
      padding: "8px 12px",
      color: "#eaeaea",
      cursor: "pointer",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "420px 1fr",
      gap: 14,
      maxWidth: 1100,
      margin: "0 auto",
    },
    card: {
      borderRadius: 16,
      border: "1px solid rgba(255,255,255,.10)",
      background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))",
      boxShadow: "0 14px 40px rgba(0,0,0,.45)",
      padding: 16,
    },
    title: { fontWeight: 900, fontSize: 16, marginBottom: 12 },
    label: { display: "grid", gap: 6, marginBottom: 10, fontWeight: 700, color: "rgba(255,255,255,.88)" },
    input: {
      width: "100%",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,.12)",
      background: "rgba(0,0,0,.28)",
      color: "#fff",
      padding: "10px 12px",
      outline: "none",
    },
    twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    primaryBtn: {
      width: "100%",
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,.14)",
      background: "linear-gradient(180deg, rgba(255,255,255,.14), rgba(255,255,255,.08))",
      color: "#fff",
      padding: "10px 12px",
      fontWeight: 900,
      cursor: "pointer",
    },
    hint: { marginTop: 8, fontSize: 13, opacity: 0.72 },
    alertErr: {
      maxWidth: 1100,
      margin: "0 auto 12px auto",
      borderRadius: 12,
      padding: 12,
      border: "1px solid rgba(255,90,90,.35)",
      background: "rgba(120,10,10,.25)",
      color: "#ffb4b4",
    },
    alertOk: {
      maxWidth: 1100,
      margin: "0 auto 12px auto",
      borderRadius: 12,
      padding: 12,
      border: "1px solid rgba(70,200,120,.30)",
      background: "rgba(10,80,30,.22)",
      color: "#b7ffca",
    },
    table: { width: "100%", borderCollapse: "collapse" },
    th: {
      textAlign: "left",
      padding: "10px 8px",
      borderBottom: "1px solid rgba(255,255,255,.08)",
      color: "rgba(255,255,255,.78)",
      fontWeight: 800,
      fontSize: 13,
    },
    td: { padding: "10px 8px", borderBottom: "1px solid rgba(255,255,255,.06)", color: "#eaeaea", verticalAlign: "top" },
    badge: (kind) => ({
      display: "inline-block",
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 900,
      border: "1px solid rgba(255,255,255,.12)",
      background:
        kind === "APPROVED"
          ? "rgba(30,140,80,.22)"
          : kind === "REJECTED"
          ? "rgba(160,40,40,.22)"
          : "rgba(180,140,40,.20)",
      color: kind === "APPROVED" ? "#b7ffca" : kind === "REJECTED" ? "#ffb4b4" : "#ffe5a6",
    }),
  };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button
          type="button"
          onClick={() => nav(`/student/classes/${classId}/sessions`, { state: { classInfo: selectedClass || classInfoFromState } })}
          style={s.backBtn}
        >
          ← Quay lại điểm danh
        </button>
      </div>

      {error ? <div style={s.alertErr}>Lỗi: {error}</div> : null}
      {msg ? <div style={s.alertOk}>{msg}</div> : null}

      <div style={s.grid}>
        <div style={{ display: "grid", gap: 14 }}>
          <div style={s.card}>
            <div style={s.title}>Thông tin sinh viên</div>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Họ và tên</div>
                <div style={{ fontWeight: 900 }}>{studentName || "—"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>MSSV</div>
                <div style={{ fontWeight: 900 }}>{studentCode || "—"}</div>
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.title}>Môn học</div>
            <div style={{ opacity: 0.9 }}>
              <b>{subjectCode}</b> {subjectName ? <>— {subjectName}</> : null}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={s.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={s.title}>Tạo thư xin nghỉ</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Gửi bất cứ lúc nào</div>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <label style={s.label}>
                Chọn môn học
                {classOptions.length > 0 ? (
                  <select style={s.input} value={classId} onChange={(e) => onChangeClass(e.target.value)}>
                    {classOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code}
                        {o.name ? ` — ${o.name}` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input style={s.input} value={`${subjectCode}${subjectName ? ` — ${subjectName}` : ""}`} disabled readOnly />
                )}
              </label>

              <div style={s.twoCol}>
                <label style={s.label}>
                  Ngày bắt đầu
                  <input
                    type="date"
                    style={s.input}
                    value={startDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setStartDate(v);
                      if (!endDate) setEndDate(v);
                    }}
                  />
                </label>

                <label style={s.label}>
                  Ngày kết thúc
                  <input
                    type="date"
                    style={s.input}
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </label>
              </div>

              <label style={s.label}>
                Lý do nghỉ học
                <textarea
                  style={{ ...s.input, minHeight: 96, resize: "vertical" }}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="VD: Em bị ốm / bận việc gia đình..."
                />
              </label>

              <button
                type="button"
                onClick={onSubmit}
                disabled={loading || submitting}
                style={{ ...s.primaryBtn, opacity: loading || submitting ? 0.7 : 1 }}
              >
                {submitting ? "Đang gửi..." : "Gửi"}
              </button>

              <div style={s.hint}>Sau khi gửi, thư sẽ được chuyển đến giáo viên phụ trách để xem xét và phê duyệt.</div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.title}>Đơn xin nghỉ của tôi</div>

            {loading ? (
              <div style={{ opacity: 0.8 }}>Đang tải...</div>
            ) : myLeaves.length === 0 ? (
              <div style={{ opacity: 0.8 }}>Chưa có thư xin nghỉ.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>#</th>
                      <th style={s.th}>Môn</th>
                      <th style={s.th}>Từ</th>
                      <th style={s.th}>Đến</th>
                      <th style={s.th}>Trạng thái</th>
                      <th style={s.th}>Ngày gửi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myLeaves.map((lv, idx) => {
                      const code = lv?.subjectCode || subjectCode;
                      const name = lv?.subjectName || subjectName;

                      const meta = parseLeaveReason(lv?.reason);
                      const from = lv?.startDate || meta.from;
                      const to = lv?.endDate || meta.to;

                      const pureReason = meta.pureReason || String(lv?.reason || "").trim();
                      const status = String(lv?.status || "PENDING").toUpperCase();
                      const created = lv?.createdAt || lv?.time;

                      return (
                        <tr key={lv?._id || idx}>
                          <td style={s.td}>{idx + 1}</td>
                          <td style={s.td}>
                            <div style={{ fontWeight: 900 }}>{code}</div>
                            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>{name || "-"}</div>
                            {pureReason ? (
                              <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>Lý do: {pureReason}</div>
                            ) : null}
                          </td>
                          <td style={s.td}>{from ? fmtDateOnly(from) : "-"}</td>
                          <td style={s.td}>{to ? fmtDateOnly(to) : "-"}</td>
                          <td style={s.td}>
                            <span style={s.badge(status)}>{status}</span>
                          </td>
                          <td style={s.td}>{fmtDateTime(created)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { attendanceApi } from "../../api/attendanceApi";

const DAYS = [
  { value: "MON", label: "Thứ 2" },
  { value: "TUE", label: "Thứ 3" },
  { value: "WED", label: "Thứ 4" },
  { value: "THU", label: "Thứ 5" },
  { value: "FRI", label: "Thứ 6" },
  { value: "SAT", label: "Thứ 7" },
  { value: "SUN", label: "Chủ nhật" },
];
const PERIODS = [1, 2, 3, 4];

const LAST_CLASS_KEY = "attendance_teacher_last_class_id_v1";

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function dayLabelOf(v) {
  return DAYS.find((d) => d.value === v)?.label ?? v;
}

function getId(c) {
  return c?._id ?? c?.id ?? null;
}

function getCode(c) {
  return String(c?.classCode ?? c?.subjectCode ?? "").toUpperCase();
}

export default function TeacherClassesPage() {
  const nav = useNavigate();

  const formTopRef = useRef(null);
  const firstInputRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [busyCreate, setBusyCreate] = useState(false);
  const [error, setError] = useState("");

  const [classes, setClasses] = useState([]);

  // Search + Sort
  const [query, setQuery] = useState("");
  const [sortDir, setSortDir] = useState("asc"); // asc | desc

  // Form: có Thứ + Ca
  const [form, setForm] = useState({
    classCode: "",
    className: "",
    courseName: "",
    teacherName: "",
    dayOfWeek: "MON",
    period: 1,
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await attendanceApi.getTeacherClasses();
      const list = Array.isArray(res?.data) ? res.data : [];
      setClasses(list);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Network Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // ✅ SEARCH + SORT cho danh sách
  const filteredSorted = useMemo(() => {
    const q = String(query || "").trim().toUpperCase();

    const filtered = q
      ? classes.filter((c) => {
          const code = String(c.classCode ?? c.subjectCode ?? "").toUpperCase();
          const className = String(c.className ?? "").toUpperCase();
          const courseName = String(c.courseName ?? c.subjectName ?? "").toUpperCase();
          const teacher = String(c.teacherName ?? "").toUpperCase();
          const day = String(dayLabelOf(c.dayOfWeek)).toUpperCase();
          const period = String(c.period ?? "").toUpperCase();

          const hay = `${code} ${className} ${courseName} ${teacher} ${day} ${period}`;
          return hay.includes(q);
        })
      : classes.slice();

    filtered.sort((a, b) => {
      const aCode = String(a.classCode ?? a.subjectCode ?? "").toUpperCase();
      const bCode = String(b.classCode ?? b.subjectCode ?? "").toUpperCase();
      if (aCode < bCode) return sortDir === "asc" ? -1 : 1;
      if (aCode > bCode) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [classes, query, sortDir]);

  // ✅ lấy lớp “mặc định” để điều hướng: last-used (localStorage) hoặc lớp đầu tiên
  const defaultClass = useMemo(() => {
    if (!Array.isArray(classes) || classes.length === 0) return null;

    const lastId = localStorage.getItem(LAST_CLASS_KEY);
    const found = lastId ? classes.find((c) => getId(c) === lastId) : null;
    if (found) return found;

    const sorted = classes.slice().sort((a, b) => {
      const aCode = getCode(a);
      const bCode = getCode(b);
      if (aCode < bCode) return -1;
      if (aCode > bCode) return 1;
      return 0;
    });

    return sorted[0] || null;
  }, [classes]);

  async function onCreate(e) {
    e.preventDefault();
    setError("");

    const payload = {
      classCode: normalizeCode(form.classCode),
      className: String(form.className || "").trim(),
      courseName: String(form.courseName || "").trim(),
      teacherName: String(form.teacherName || "").trim(),
      dayOfWeek: form.dayOfWeek,
      period: Number(form.period),

      // backward-compatible với backend cũ
      subjectCode: normalizeCode(form.classCode),
      subjectName: String(form.courseName || "").trim(),
    };

    if (!payload.classCode) return setError("Vui lòng nhập Mã lớp học");
    if (!payload.className) return setError("Vui lòng nhập Tên lớp học");
    if (!payload.courseName) return setError("Vui lòng nhập Tên khóa học");
    if (!payload.teacherName) return setError("Vui lòng nhập Giáo viên phụ trách");

    setBusyCreate(true);
    try {
      await attendanceApi.createClass(payload);
      setForm((p) => ({ ...p, classCode: "", className: "", courseName: "" }));
      await load();
    } catch (e2) {
      setError(e2?.response?.data?.message || e2?.message || "Không tạo được lớp");
    } finally {
      setBusyCreate(false);
    }
  }

  async function onDelete(classId) {
    const ok = window.confirm("Bạn chắc chắn muốn xóa lớp này?");
    if (!ok) return;

    setError("");
    try {
      await attendanceApi.deleteTeacherClass(classId);

      // nếu xóa đúng lớp “last-used” thì xóa key
      const lastId = localStorage.getItem(LAST_CLASS_KEY);
      if (lastId && lastId === classId) localStorage.removeItem(LAST_CLASS_KEY);

      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Xóa thất bại");
    }
  }

  // ✅ bấm “Thao tác” -> luôn đi route có :id (để page không bị undefined)
  function goSessions() {
    setError("");
    if (!defaultClass) return setError("Chưa có lớp nào để quản lý điểm danh.");
    const id = getId(defaultClass);
    localStorage.setItem(LAST_CLASS_KEY, id);
    nav(`/teacher/classes/${id}/sessions`, { state: { classInfo: defaultClass } });
  }

  function goLeave() {
    setError("");
    if (!defaultClass) return setError("Chưa có lớp nào để duyệt xin vắng.");
    const id = getId(defaultClass);
    localStorage.setItem(LAST_CLASS_KEY, id);
    nav(`/teacher/classes/${id}/leave`, { state: { classInfo: defaultClass } });
  }

  function goProfile() {
    nav("/teacher/profile");
  }

  function goCreate() {
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => firstInputRef.current?.focus(), 150);
  }

  return (
    <div style={page}>
      <div style={header}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18, color: "#fff" }}>/teacher/classes</div>
          <div style={{ marginTop: 6, color: "#bbb" }}>
            Mã lớp học • Tên lớp học • Tên khóa học • Giáo viên phụ trách • Thứ • Ca
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo mã/tên lớp/khóa học/GV/thứ/ca..."
            style={searchInput}
          />

          <select value={sortDir} onChange={(e) => setSortDir(e.target.value)} style={selectSmall}>
            <option value="asc">Sắp xếp: Mã lớp tăng dần</option>
            <option value="desc">Sắp xếp: Mã lớp giảm dần</option>
          </select>

          <button type="button" onClick={goCreate} style={btnPrimary}>
            Thêm lớp
          </button>

          <button type="button" onClick={goProfile} style={btnGhost}>
            Profile
          </button>

          <button type="button" onClick={load} style={btn}>
            Refresh
          </button>
        </div>
      </div>

      {error ? <div style={toastErr}>Lỗi: {error}</div> : null}

      <div style={layout}>
        {/* LEFT: CREATE FORM */}
        <div ref={formTopRef} style={panel}>
          <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>Thêm lớp học mới</div>

          <form onSubmit={onCreate} style={{ display: "grid", gap: 12 }}>
            <label style={label}>
              Mã lớp học
              <input
                ref={firstInputRef}
                value={form.classCode}
                onChange={(e) => setForm((p) => ({ ...p, classCode: e.target.value }))}
                placeholder="VD: LH001"
                style={input}
              />
            </label>

            <label style={label}>
              Tên lớp học
              <input
                value={form.className}
                onChange={(e) => setForm((p) => ({ ...p, className: e.target.value }))}
                placeholder="VD: CNTT K65 - Nhóm 1"
                style={input}
              />
            </label>

            <label style={label}>
              Tên khóa học
              <input
                value={form.courseName}
                onChange={(e) => setForm((p) => ({ ...p, courseName: e.target.value }))}
                placeholder="VD: Cơ sở dữ liệu"
                style={input}
              />
            </label>

            <label style={label}>
              Giáo viên phụ trách
              <input
                value={form.teacherName}
                onChange={(e) => setForm((p) => ({ ...p, teacherName: e.target.value }))}
                placeholder="VD: ThS. Nguyễn Văn A"
                style={input}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={label}>
                Thứ
                <select
                  value={form.dayOfWeek}
                  onChange={(e) => setForm((p) => ({ ...p, dayOfWeek: e.target.value }))}
                  style={select}
                >
                  {DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={label}>
                Ca
                <select
                  value={form.period}
                  onChange={(e) => setForm((p) => ({ ...p, period: Number(e.target.value) }))}
                  style={select}
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button type="submit" disabled={busyCreate} style={btnPrimary}>
              {busyCreate ? "Đang thêm..." : "Thêm lớp học mới"}
            </button>
          </form>
        </div>

        {/* RIGHT: ACTIONS + LIST */}
        <div style={rightCol}>
          {/* ✅ THAO TÁC: 2 ô, bấm là đi (không cần chọn) */}
          <div style={actionsPanel}>
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Thao tác</div>

            <div style={actionsRow}>
              <button type="button" style={actionTile} onClick={goSessions}>
                Quản lý điểm danh
              </button>

              <button type="button" style={actionTile} onClick={goLeave}>
                Duyệt xin vắng
              </button>
            </div>

            <div style={hintText}>
              Mặc định mở lớp:{" "}
              <span style={{ color: "#fff", fontWeight: 900 }}>
                {defaultClass ? (defaultClass.classCode ?? defaultClass.subjectCode ?? "—") : "—"}
              </span>{" "}
              (tự lấy lớp đã dùng gần nhất, nếu chưa có thì lấy lớp đầu tiên)
            </div>
          </div>

          {loading ? (
            <div style={{ color: "#ddd", marginTop: 10 }}>Đang tải...</div>
          ) : (
            <div style={{ ...listPanel, marginTop: 10 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Danh sách lớp học</div>

              <div style={{ overflowX: "auto" }}>
                <table style={tbl}>
                  <thead>
                    <tr>
                      <th style={th}>Mã lớp học</th>
                      <th style={th}>Tên lớp học</th>
                      <th style={th}>Tên khóa học</th>
                      <th style={th}>Giáo viên phụ trách</th>
                      <th style={th}>Thứ</th>
                      <th style={th}>Ca</th>
                      <th style={thCenter}>Xóa</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredSorted.length === 0 ? (
                      <tr>
                        <td style={td} colSpan={7}>
                          Không có dữ liệu phù hợp.
                        </td>
                      </tr>
                    ) : (
                      filteredSorted.map((c) => {
                        const id = getId(c);

                        const code = c.classCode ?? c.subjectCode ?? "—";
                        const className =
                          c.className ??
                          c.class_name ??
                          c.tenLop ??
                          c.classTitle ??
                          c.subjectName ??
                          "—";

                        const courseName = c.courseName ?? c.subjectName ?? "—";
                        const teacherName = c.teacherName ?? "—";
                        const dayText = dayLabelOf(c.dayOfWeek);
                        const period = Number(c.period) || "—";

                        return (
                          <tr key={id}>
                            <td style={td}>{code}</td>
                            <td style={td}>{className}</td>
                            <td style={td}>{courseName}</td>
                            <td style={td}>{teacherName}</td>
                            <td style={td}>{dayText}</td>
                            <td style={td}>{period}</td>
                            <td style={tdCenter}>
                              <button type="button" style={dangerBtn} onClick={() => onDelete(id)}>
                                Xóa
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 8, color: "#aaa", fontSize: 12 }}>
                Đang hiển thị {filteredSorted.length} lớp (đã áp dụng tìm kiếm + sắp xếp).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== styles ===== */
const page = { minHeight: "100vh", background: "#222", color: "#eee", padding: 18 };

const header = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  alignItems: "center",
  marginBottom: 14,
};

const layout = { display: "grid", gridTemplateColumns: "340px 1fr", gap: 16, alignItems: "start" };

const panel = {
  background: "#1b1b1b",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

const rightCol = { minHeight: 200 };

const label = { display: "grid", gap: 6, color: "#ddd", fontWeight: 800 };
const input = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#2a2a2a",
  color: "#fff",
  outline: "none",
};
const select = {
  width: "100%",
  padding: 10,
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#2a2a2a",
  color: "#fff",
  outline: "none",
};

const btn = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#2a2a2a",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};
const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#111",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};
const btnGhost = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "#2a2a2a",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};

const dangerBtn = {
  padding: 0,
  border: "none",
  background: "transparent",
  color: "#ff8080",
  cursor: "pointer",
  fontWeight: 900,
};

const toastErr = {
  marginBottom: 12,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(255,120,120,0.35)",
  background: "rgba(255,0,0,0.06)",
  color: "#ffb3b3",
  fontWeight: 800,
};

const searchInput = {
  width: 320,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#2a2a2a",
  color: "#fff",
  outline: "none",
};

const selectSmall = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#2a2a2a",
  color: "#fff",
  outline: "none",
};

const actionsPanel = {
  background: "#1b1b1b",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

const actionsRow = { display: "flex", gap: 10, flexWrap: "wrap" };

const actionTile = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "#111",
  color: "#6ea8ff",
  cursor: "pointer",
  fontWeight: 900,
};

const hintText = { marginTop: 10, color: "#bbb", fontSize: 12 };

const listPanel = {
  background: "#1b1b1b",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
};

const tbl = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 860,
};

const th = {
  textAlign: "left",
  fontSize: 12,
  color: "#ddd",
  padding: "10px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.10)",
  whiteSpace: "nowrap",
};

const thCenter = { ...th, textAlign: "center" };

const td = {
  fontSize: 12,
  color: "#eee",
  padding: "10px 10px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  verticalAlign: "top",
};

const tdCenter = { ...td, textAlign: "center", whiteSpace: "nowrap" };

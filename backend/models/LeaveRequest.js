import mongoose from "mongoose";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isIsoDateOrEmpty = (v) => {
  const s = String(v || "").trim();
  if (!s) return true;
  return ISO_DATE_RE.test(s);
};

const compareIsoDate = (a, b) => {
  if (!a || !b) return 0;
  return String(a).localeCompare(String(b));
};

const LeaveRequestSchema = new mongoose.Schema(
  {
    // Mode mới: theo classId
    classId: {
      type: String,
      trim: true,
      default: "",
      index: true,
      required: function () {
        return !String(this.sessionId || "").trim();
      },
    },

    // Mode cũ: theo sessionId
    sessionId: {
      type: String,
      trim: true,
      default: "",
      index: true,
      required: function () {
        return !String(this.classId || "").trim();
      },
    },

    studentId: { type: String, required: true, trim: true, index: true },
    studentName: { type: String, default: "", trim: true },
    studentCode: { type: String, default: "", trim: true },

    subjectCode: { type: String, default: "", trim: true },
    subjectName: { type: String, default: "", trim: true },

    startDate: {
      type: String,
      default: "",
      trim: true,
      validate: { validator: isIsoDateOrEmpty, message: "startDate must be YYYY-MM-DD" },
    },

    endDate: {
      type: String,
      default: "",
      trim: true,
      validate: { validator: isIsoDateOrEmpty, message: "endDate must be YYYY-MM-DD" },
    },

    reason: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
      set: (v) => String(v || "PENDING").toUpperCase(),
    },

    teacherNote: { type: String, default: "", trim: true },
    decidedAt: { type: Date, default: null },
    decidedBy: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

LeaveRequestSchema.pre("validate", function (next) {
  const classId = String(this.classId || "").trim();
  const sessionId = String(this.sessionId || "").trim();

  if (!classId && !sessionId) {
    this.invalidate("classId", "Either classId or sessionId is required");
    this.invalidate("sessionId", "Either classId or sessionId is required");
  }

  const sd = String(this.startDate || "").trim();
  const ed = String(this.endDate || "").trim();
  if (sd && ed && compareIsoDate(sd, ed) > 0) {
    this.invalidate("endDate", "endDate must be >= startDate");
  }

  next();
});

export default mongoose.model("LeaveRequest", LeaveRequestSchema);

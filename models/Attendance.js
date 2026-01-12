const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  date: { type: String, required: true },
  batch: { type: String, required: true },
  subject: { type: String, required: true },
  teacherId: { type: String },
  records: [
    {
      student: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
      isPresent: { type: Boolean, default: false },
    },
  ],
});

attendanceSchema.index({ date: 1, batch: 1, subject: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);

const mongoose = require("mongoose");

const examSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subject: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  duration: { type: String, required: true },
  venue: { type: String, required: true },
  semester: { type: String, required: true },
  batch: { type: String, required: true },
  professor: { type: String, required: true },
  teacherId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
});

examSchema.index({ semester: 1, batch: 1, date: 1 });
examSchema.index({ teacherId: 1 });
examSchema.index({ batch: 1, date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model("Exam", examSchema);

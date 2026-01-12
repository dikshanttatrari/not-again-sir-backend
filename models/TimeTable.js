const mongoose = require("mongoose");

const TimetableSchema = new mongoose.Schema({
  semester: { type: String, required: true },
  day: {
    type: String,
    required: true,
    enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  subject: { type: String, required: true },
  professor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  room: { type: String, default: "101" },
  batch: { type: String },
  createdAt: { type: Date, default: Date.now },
});

TimetableSchema.index({ semester: 1, day: 1 });
TimetableSchema.index({ professor: 1, day: 1 });

module.exports = mongoose.model("Timetable", TimetableSchema);

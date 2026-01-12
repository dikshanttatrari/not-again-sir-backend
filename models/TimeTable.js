const mongoose = require("mongoose");

const TimetableSchema = new mongoose.Schema({
  semester: {
    type: String,
    required: true,
    index: true,
  },
  day: {
    type: String,
    required: true,
    enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  startTime: {
    type: String,
    required: true,
  },
  endTime: {
    type: String,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  professor: {
    type: String,
    required: true,
  },
  room: {
    type: String,
    default: "101",
  },
  batch: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Timetable", TimetableSchema);

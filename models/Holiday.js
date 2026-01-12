const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true },
  reason: { type: String, default: "Holiday" },
  markedBy: { type: String },
});

module.exports = mongoose.model("Holiday", holidaySchema);

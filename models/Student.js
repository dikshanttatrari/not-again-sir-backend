const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  enrollmentId: { type: String, required: true, unique: true },
  universityRollNo: { type: String, required: true, unique: true },
  classRollNo: { type: String, required: true },
  batch: { type: String, required: true },
  semester: { type: String, required: true },
  mobile: { type: String, default: "" },
  email: { type: String, default: "" },
  dob: { type: String, required: true },
  pushToken: { type: String },
  password: { type: String, required: true },
  role: { type: String, default: "student" },
  profileImage: { type: String, default: "" },
  isHOD: { type: Boolean, default: false },
});

module.exports = mongoose.model("Student", studentSchema);

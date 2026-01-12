const cron = require("node-cron");
const Student = require("../models/Student");

const startSemesterAutoUpdate = () => {
  cron.schedule("0 0 1 1,7 *", async () => {
    console.log("🔄 Running Automatic Semester Promotion...");

    try {
      // 1. Graduate the final year students (Sem 8 -> Alumni/Passout)
      // You might want to move them to an "Alumni" collection or just mark them inactive
      await Student.updateMany(
        { semester: 8 },
        { $set: { role: "alumni", semester: 0 } } // Or delete them
      );

      // 2. Promote everyone else (Sem 1 -> 2, Sem 2 -> 3, etc.)
      // $inc increases the number by 1
      const result = await Student.updateMany(
        { semester: { $lt: 8, $gt: 0 } }, // Only current students
        { $inc: { semester: 1 } }
      );

      console.log(`✅ Success! Promoted ${result.modifiedCount} students.`);
    } catch (error) {
      console.error("❌ Error updating semesters:", error);
    }
  });
};

module.exports = startSemesterAutoUpdate;

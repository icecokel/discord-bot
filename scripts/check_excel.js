const XLSX = require("xlsx");
const path = require("path");

const inputPath = path.join(__dirname, "../data/location_code.xlsx");

try {
  const workbook = XLSX.readFile(inputPath);
  console.log("All Sheet Names:", workbook.SheetNames);

  workbook.SheetNames.forEach((name) => {
    console.log(`\n--- Sheet: ${name} ---`);
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (rows.length > 0) {
      console.log("Row 0:", rows[0]);
      if (rows.length > 1) console.log("Row 1:", rows[1]);
    } else {
      console.log("(Empty Sheet)");
    }
  });
} catch (error) {
  console.error(error);
}

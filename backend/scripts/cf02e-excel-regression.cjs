const assert = require("node:assert/strict");
const ExcelJS = require("@andreeewill/exceljs");

async function main() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("WFM Report");

  sheet.addRow(["Work Order", "Status", "Team"]);
  sheet.addRow(["WO-CF02E-001", "COMPLETED", "TEST-TEAM"]);

  const buffer = await workbook.xlsx.writeBuffer();

  assert.ok(buffer.length > 0, "Empty XLSX buffer");
  assert.equal(
    Buffer.from(buffer).subarray(0, 2).toString(),
    "PK",
    "Invalid XLSX signature"
  );

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(buffer);

  const result = reopened.getWorksheet("WFM Report");
  assert.ok(result, "Worksheet missing");

  assert.equal(result.getRow(2).getCell(1).value, "WO-CF02E-001");
  assert.equal(result.getRow(2).getCell(2).value, "COMPLETED");
  assert.equal(result.getRow(2).getCell(3).value, "TEST-TEAM");

  console.log("PASS: CF-02E Excel XLSX generation and readback");
  console.log("Workbook bytes:", buffer.length);
}

main().catch(error => {
  console.error("FAIL:", error);
  process.exitCode = 1;
});

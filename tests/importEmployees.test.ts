import { describe, expect, it } from "vitest";
import { importEmployees, type ImportSuccess } from "../src/index";

const sampleRows = [
  { emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "N", monthly_ctc: "32 500" },
  { emp_no: "E002", name: "A. Pillay", id_number: "9202204720083", disability: "Yes", monthly_ctc: "41 200" },
  { emp_no: "E003", name: "J. Botha", id_number: "", disability: "no", monthly_ctc: "28 900" },
  { emp_no: "E004", name: "L. Dlamini", id_number: "0506155800085", disability: "TRUE", monthly_ctc: "19 750" },
  { emp_no: "E005", name: "M. Smith", id_number: "7712319999999", disability: "", monthly_ctc: "55 000" },
  { emp_no: "E006", name: "K. Mokoena", id_number: "9902305800086", disability: "Disabled", monthly_ctc: "18 000" },
];

const sampleHeader = { people: 6, totalMonthlyCtc: 195_350 };

function success(result: ReturnType<typeof importEmployees>): ImportSuccess {
  expect(result.ok, !result.ok ? result.error : "").toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe("importEmployees", () => {
  it("imports the sample file and sends the two bad ID numbers to exceptions", () => {
    const result = success(importEmployees(sampleRows, [], sampleHeader));

    expect(result.summary).toMatchObject({
      filePeople: 6,
      fileTotalMonthlyCtc: 195_350,
      headerPeople: 6,
      headerTotalMonthlyCtc: 195_350,
      matched: 0,
      created: 4,
      leavers: 0,
      exceptions: 2,
    });

    expect(result.created.map((employee) => employee.empNo)).toEqual(["E001", "E002", "E003", "E004"]);
    expect(result.created.map((employee) => employee.disability)).toEqual(["No", "Yes", "No", "Yes"]);
    expect(result.created[2]).toMatchObject({
      name: "J. Botha",
      idNumber: null,
      monthlyCtc: 28_900,
    });

    expect(result.exceptions).toEqual([
      {
        rowNumber: 5,
        empNo: "E005",
        name: "M. Smith",
        reasons: ["ID number citizenship digit must be 0 or 1", "ID number check digit is wrong"],
      },
      {
        rowNumber: 6,
        empNo: "E006",
        name: "K. Mokoena",
        reasons: ["ID number has an impossible date of birth"],
      },
    ]);
  });

  it("does not let one bad ID stop the valid row after it", () => {
    const result = success(
      importEmployees(
        [
          { emp_no: "E005", name: "M. Smith", id_number: "7712319999999", disability: "N", monthly_ctc: 100 },
          { emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "Y", monthly_ctc: 50 },
        ],
        [],
        { people: 2, totalMonthlyCtc: 150 },
      ),
    );

    expect(result.exceptions).toHaveLength(1);
    expect(result.created).toEqual([
      {
        empNo: "E001",
        name: "T. Nkosi",
        idNumber: "8001015009087",
        disability: "Yes",
        monthlyCtc: 50,
      },
    ]);
  });

  it("refuses the import when the people count does not match, and returns no rows to save", () => {
    const result = importEmployees(sampleRows, [], { people: 5, totalMonthlyCtc: 195_350 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Nothing was written/);
    expect(result.error).toMatch(/6 people/);
    expect(result).not.toHaveProperty("created");
    expect(result).not.toHaveProperty("matched");
    expect(result).not.toHaveProperty("exceptions");
  });

  it("refuses the import when the total CTC does not match", () => {
    const result = importEmployees(sampleRows, [], { people: 6, totalMonthlyCtc: 195_351 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.summary.fileTotalMonthlyCtc).toBe(195_350);
    expect(result.summary.headerTotalMonthlyCtc).toBe(195_351);
  });

  it("refuses the whole import when a CTC cell cannot be read", () => {
    const result = importEmployees(
      [{ emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "N", monthly_ctc: "abc" }],
      [],
      { people: 1, totalMonthlyCtc: 0 },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/row 1/);
    expect(result).not.toHaveProperty("created");
  });

  it("does not let a blank cell overwrite a value already on record", () => {
    const result = success(
      importEmployees(
        [
          {
            emp_no: "E001",
            name: " ",
            id_number: "8001015009087",
            disability: "",
            monthly_ctc: null,
          },
        ],
        [
          {
            emp_no: "E001",
            name: "T. Nkosi",
            id_number: "8001015009087",
            disability: "Yes",
            monthly_ctc: 32_500,
          },
        ],
        { people: 1, totalMonthlyCtc: 0 },
      ),
    );

    expect(result.matched).toEqual([
      {
        empNo: "E001",
        name: "T. Nkosi",
        idNumber: "8001015009087",
        disability: "Yes",
        monthlyCtc: 32_500,
      },
    ]);
    expect(result.created).toEqual([]);
  });

  it("lets a non-blank cell replace the value on record, including a zero salary", () => {
    const result = success(
      importEmployees(
        [
          {
            emp_no: "E001",
            name: "Thabo Nkosi",
            id_number: "8001015009087",
            disability: "N",
            monthly_ctc: 0,
          },
        ],
        [
          {
            emp_no: "E001",
            name: "T. Nkosi",
            id_number: "8001015009087",
            disability: "Yes",
            monthly_ctc: 32_500,
          },
        ],
        { people: 1, totalMonthlyCtc: 0 },
      ),
    );

    expect(result.matched[0]).toMatchObject({
      name: "Thabo Nkosi",
      disability: "No",
      monthlyCtc: 0,
    });
  });

  it("matches on ID number before employee number, and does not take the other person's number", () => {
    const result = success(
      importEmployees(
        [
          {
            emp_no: "E999",
            name: "T. Nkosi",
            id_number: "8001015009087",
            disability: "N",
            monthly_ctc: 32_500,
          },
        ],
        [
          { emp_no: "E001", name: "Stored", id_number: "8001015009087", disability: "Yes", monthly_ctc: 1 },
          { emp_no: "E999", name: "Other", id_number: "9202204720083", disability: "No", monthly_ctc: 2 },
        ],
        { people: 1, totalMonthlyCtc: 32_500 },
      ),
    );

    expect(result.matched).toEqual([
      {
        empNo: "E001",
        name: "T. Nkosi",
        idNumber: "8001015009087",
        disability: "No",
        monthlyCtc: 32_500,
      },
    ]);
    expect(result.leavers.map((employee) => employee.empNo)).toEqual(["E999"]);
    expect(result.warnings[0]).toMatch(/different employee/);
  });

  it("matches on employee number when the ID cell is blank", () => {
    const result = success(
      importEmployees(
        [{ emp_no: "E003", name: "J. Botha", id_number: "", disability: "no", monthly_ctc: "28 900" }],
        [{ emp_no: "E003", name: "Johannes Botha", id_number: null, disability: "Yes", monthly_ctc: 1000 }],
        { people: 1, totalMonthlyCtc: 28_900 },
      ),
    );

    expect(result.matched[0]).toMatchObject({
      empNo: "E003",
      name: "J. Botha",
      idNumber: null,
      disability: "No",
      monthlyCtc: 28_900,
    });
  });

  it("matches an ID that was stored with spaces", () => {
    const result = success(
      importEmployees(
        [{ emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "N", monthly_ctc: 10 }],
        [{ emp_no: "E001", name: "Old", id_number: "800101 5009 087", disability: "Yes", monthly_ctc: 10 }],
        { people: 1, totalMonthlyCtc: 10 },
      ),
    );

    expect(result.matched).toHaveLength(1);
    expect(result.created).toHaveLength(0);
    expect(result.matched[0].name).toBe("T. Nkosi");
  });

  it("treats a person with no match as new, and a blank disability as No", () => {
    const result = success(
      importEmployees(
        [{ emp_no: "E010", name: "New Person", id_number: "8001015009087", disability: "", monthly_ctc: 10 }],
        [],
        { people: 1, totalMonthlyCtc: 10 },
      ),
    );

    expect(result.created[0]).toMatchObject({
      empNo: "E010",
      disability: "No",
      monthlyCtc: 10,
    });
  });

  it("reports people who are on record but missing from the file as leavers", () => {
    const result = success(
      importEmployees(
        [{ emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "N", monthly_ctc: 10 }],
        [
          { emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "No", monthly_ctc: 10 },
          { emp_no: "E007", name: "Left Already", id_number: "9202204720083", disability: "Yes", monthly_ctc: 20 },
        ],
        { people: 1, totalMonthlyCtc: 10 },
      ),
    );

    expect(result.matched.map((employee) => employee.empNo)).toEqual(["E001"]);
    expect(result.leavers).toEqual([
      {
        empNo: "E007",
        name: "Left Already",
        idNumber: "9202204720083",
        disability: "Yes",
        monthlyCtc: 20,
      },
    ]);
  });

  it("does not call someone a leaver when their row failed validation", () => {
    const result = success(
      importEmployees(
        [{ emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "maybe", monthly_ctc: 10 }],
        [{ emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: "Yes", monthly_ctc: 99 }],
        { people: 1, totalMonthlyCtc: 10 },
      ),
    );

    expect(result.matched).toEqual([]);
    expect(result.leavers).toEqual([]);
    expect(result.exceptions[0].reasons[0]).toMatch(/maybe/);
  });

  it("keeps the second copy of an ID number out of the written rows", () => {
    const result = success(
      importEmployees(
        [
          { emp_no: "E001", name: "First", id_number: "8001015009087", disability: "N", monthly_ctc: 10 },
          { emp_no: "E002", name: "Second", id_number: "8001015009087", disability: "Y", monthly_ctc: 15 },
        ],
        [],
        { people: 2, totalMonthlyCtc: 25 },
      ),
    );

    expect(result.created).toHaveLength(1);
    expect(result.created[0].name).toBe("First");
    expect(result.exceptions[0].reasons).toEqual(["Duplicate ID number in this file"]);
  });

  it("ignores a completely empty row when counting people and CTC", () => {
    const result = success(
      importEmployees(
        [...sampleRows, { emp_no: "", name: null, id_number: "", disability: "", monthly_ctc: "" }],
        [],
        sampleHeader,
      ),
    );

    expect(result.summary.filePeople).toBe(6);
    expect(result.summary.created).toBe(4);
  });

  it("does not let a badly shaped row stop the valid row after it", () => {
    const result = success(
      importEmployees(
        [
          { emp_no: 15, monthly_ctc: 100 },
          { emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: true, monthly_ctc: 50 },
        ],
        [],
        { people: 2, totalMonthlyCtc: 150 },
      ),
    );

    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0].rowNumber).toBe(1);
    expect(result.created[0]).toMatchObject({ empNo: "E001", disability: "Yes", monthlyCtc: 50 });
  });

  it("reads a rand amount with commas and cents", () => {
    const result = success(
      importEmployees(
        [{ emp_no: "E001", name: "T. Nkosi", id_number: "8001015009087", disability: 1, monthly_ctc: "R32,500.50" }],
        [],
        { people: 1, totalMonthlyCtc: 32_500.5 },
      ),
    );

    expect(result.created[0]).toMatchObject({ disability: "Yes", monthlyCtc: 32_500.5 });
  });

  it("rejects a header that is not in the expected shape", () => {
    const result = importEmployees([], [], { people: "6", totalMonthlyCtc: 0 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Header is not valid/);
    expect(result.error).toMatch(/Nothing was written/);
  });

  it("rejects rows that are not a list", () => {
    const result = importEmployees({ emp_no: "E001" }, [], { people: 0, totalMonthlyCtc: 0 });
    expect(result.ok).toBe(false);
  });
});

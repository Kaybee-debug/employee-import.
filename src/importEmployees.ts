import { z } from "zod";
import {
  blankText,
  employeeKey,
  idKey,
  idText,
  parseDisability,
  parseMonthlyCtc,
  type Disability,
  type DisabilityValue,
  type MoneyValue,
} from "./fields";
import { validateSaIdNumber } from "./saId";
import { formatZodError, HeaderSchema, PayrollRowSchema, type Header, type PayrollRow } from "./schema";
import type {
  ControlSummary,
  ImportException,
  ImportFailure,
  ImportResult,
  ImportSuccess,
  WrittenEmployee,
} from "./types";

interface NormalizedRow {
  rowNumber: number;
  empty: boolean;
  empNo: string | null;
  name: string | null;
  idRaw: string | null;
  disability: DisabilityValue;
  ctc: MoneyValue;
  schemaError: string | null;
}

interface StoredEmployee {
  index: number;
  empNo: string | null;
  empKey: string | null;
  name: string | null;
  idNumber: string | null;
  idKey: string | null;
  disability: Disability | null;
  monthlyCtc: number | null;
}

/**
 * Import payroll rows for one client.
 *
 * 1. Check that rows, existing employees and the header have the right shape.
 * 2. Compare the file's people count and total monthly CTC with the header.
 *    If they differ, or a CTC cell cannot be read, return an error and no rows.
 * 3. Check each ID number. A bad row becomes an exception and does not stop the rest.
 * 4. Match a valid row by ID number, then by employee number, otherwise it is new.
 *    A blank cell does not overwrite a value already on record.
 * 5. Report leavers: people on record who were not in the file. They are not deleted.
 *
 * Save `matched` and `created` only when `ok` is true.
 */
export function importEmployees(rows: unknown, existing: unknown, header: unknown): ImportResult {
  const headerParsed = HeaderSchema.safeParse(header);
  if (!headerParsed.success) {
    return failure(
      `Header is not valid (${formatZodError(headerParsed.error)}). Nothing was written.`,
      zeroSummary(),
    );
  }

  const rowsParsed = z.array(z.unknown()).safeParse(rows);
  if (!rowsParsed.success) {
    return failure("Rows must be a list. Nothing was written.", summaryFrom(headerParsed.data, 0, 0));
  }

  const existingParsed = z.array(PayrollRowSchema).safeParse(existing);
  if (!existingParsed.success) {
    return failure(
      `Existing employees are not valid (${formatZodError(existingParsed.error)}). Nothing was written.`,
      summaryFrom(headerParsed.data, 0, 0),
    );
  }

  const normalized = rowsParsed.data.map((item, index) => normalizeRow(item, index + 1));
  const dataRows = normalized.filter((row) => !row.empty);
  const unreadableCtc = dataRows.filter((row) => row.ctc.kind === "invalid");
  const filePeople = dataRows.length;
  const fileCents = dataRows.reduce(
    (sum, row) => sum + (row.ctc.kind === "amount" ? row.ctc.cents : 0),
    0,
  );
  const control = summaryFrom(headerParsed.data, filePeople, fileCents);

  if (unreadableCtc.length > 0) {
    const rowNumbers = unreadableCtc.map((row) => row.rowNumber).join(", ");
    return failure(
      `Import refused because monthly CTC is not a valid amount on row ${rowNumbers}. Nothing was written.`,
      control,
    );
  }

  const headerCents = Math.round(headerParsed.data.totalMonthlyCtc * 100);
  if (filePeople !== headerParsed.data.people || fileCents !== headerCents) {
    return failure(
      `Import refused because the control totals do not match. File has ${filePeople} people and total monthly CTC ${formatMoney(fileCents)}. Header has ${headerParsed.data.people} people and total monthly CTC ${formatMoney(headerCents)}. Nothing was written.`,
      control,
    );
  }

  const stored = readExisting(existingParsed.data);
  if (!stored.ok) return failure(stored.error, control);

  const { matched, created, leavers, exceptions, warnings } = matchRows(dataRows, stored.employees);

  const success: ImportSuccess = {
    ok: true,
    matched,
    created,
    leavers,
    exceptions,
    warnings,
    summary: {
      ...control,
      matched: matched.length,
      created: created.length,
      leavers: leavers.length,
      exceptions: exceptions.length,
    },
  };
  return success;
}

function matchRows(dataRows: NormalizedRow[], stored: StoredEmployee[]) {
  const byId = groupBy(stored, (employee) => employee.idKey);
  const byEmp = groupBy(stored, (employee) => employee.empKey);
  const claimed = new Set<number>();
  const seen = new Set<number>();
  const usedIds = new Set<string>();
  const usedEmpKeys = new Set<string>();

  const matched: WrittenEmployee[] = [];
  const created: WrittenEmployee[] = [];
  const exceptions: ImportException[] = [];
  const warnings: string[] = [];

  for (const row of dataRows) {
    const validId = validIdFor(row);
    const reasons = rowReasons(row, validId.reasons);

    if (reasons.length > 0) {
      markSeen(seen, byId, byEmp, validId.idNumber, row.empNo);
      exceptions.push({
        rowNumber: row.rowNumber,
        empNo: row.empNo,
        name: row.name,
        reasons,
      });
      continue;
    }

    const idNumber = validId.idNumber;
    const key = employeeKey(row.empNo);
    const incomingDisability = row.disability.kind === "value" ? row.disability.value : null;
    const incomingCtc = row.ctc.kind === "amount" ? row.ctc.rands : null;
    const incoming = {
      empNo: row.empNo,
      name: row.name,
      idNumber,
      disability: incomingDisability,
      monthlyCtc: incomingCtc,
    };

    if (idNumber && usedIds.has(idNumber)) {
      exceptions.push(exception(row, ["Duplicate ID number in this file"]));
      continue;
    }

    const idMatches = available(byId, idNumber, claimed);
    if (idMatches.length > 1) {
      idMatches.forEach((employee) => seen.add(employee.index));
      exceptions.push(exception(row, ["More than one employee on record has this ID number"]));
      continue;
    }

    // ID number wins over employee number.
    if (idMatches.length === 1) {
      const current = idMatches[0];
      const employeeNumberTaken =
        key !== null &&
        (usedEmpKeys.has(key) ||
          (byEmp.get(key) ?? []).some((employee) => employee.index !== current.index));
      if (employeeNumberTaken) {
        warnings.push(
          `Row ${row.rowNumber}: employee number ${row.empNo} belongs to a different employee, so the ID match kept employee number ${current.empNo ?? "(blank)"}.`,
        );
        incoming.empNo = null;
      }
      acceptMatch(current, incoming);
      continue;
    }

    if (key && usedEmpKeys.has(key)) {
      exceptions.push(exception(row, ["Duplicate employee number in this file"]));
      continue;
    }

    const empMatches = available(byEmp, key, claimed);
    if (empMatches.length > 1) {
      empMatches.forEach((employee) => seen.add(employee.index));
      exceptions.push(exception(row, ["More than one employee on record has this employee number"]));
      continue;
    }

    if (empMatches.length === 1) {
      acceptMatch(empMatches[0], incoming);
      continue;
    }

    const written: WrittenEmployee = {
      empNo: row.empNo,
      name: row.name,
      idNumber,
      disability: incomingDisability ?? "No",
      monthlyCtc: incomingCtc,
    };
    created.push(written);
    if (idNumber) usedIds.add(idNumber);
    if (key) usedEmpKeys.add(key);
  }

  function acceptMatch(current: StoredEmployee, incomingValues: {
    empNo: string | null;
    name: string | null;
    idNumber: string | null;
    disability: Disability | null;
    monthlyCtc: number | null;
  }) {
    const written = writeEmployee(current, incomingValues);
    claimed.add(current.index);
    matched.push(written);
    if (incomingValues.idNumber) usedIds.add(incomingValues.idNumber);
    const writtenKey = employeeKey(written.empNo);
    if (writtenKey) usedEmpKeys.add(writtenKey);
  }

  const leavers = stored
    .filter((employee) => !claimed.has(employee.index) && !seen.has(employee.index))
    .map((employee) => toWritten(employee));

  return { matched, created, leavers, exceptions, warnings };
}

function writeEmployee(
  current: StoredEmployee,
  incoming: {
    empNo: string | null;
    name: string | null;
    idNumber: string | null;
    disability: Disability | null;
    monthlyCtc: number | null;
  },
): WrittenEmployee {
  return {
    empNo: incoming.empNo ?? current.empNo,
    name: incoming.name ?? current.name,
    idNumber: incoming.idNumber ?? current.idNumber,
    disability: incoming.disability ?? current.disability ?? "No",
    monthlyCtc: incoming.monthlyCtc ?? current.monthlyCtc,
  };
}

function toWritten(employee: StoredEmployee): WrittenEmployee {
  return {
    empNo: employee.empNo,
    name: employee.name,
    idNumber: employee.idNumber,
    disability: employee.disability ?? "No",
    monthlyCtc: employee.monthlyCtc,
  };
}

function rowReasons(row: NormalizedRow, idReasons: string[]): string[] {
  if (row.schemaError) return [row.schemaError];
  const reasons = [...idReasons];
  if (row.disability.kind === "invalid") {
    reasons.push(`Disability "${row.disability.raw}" is not recognised. Use Yes or No.`);
  }
  return reasons;
}

function validIdFor(row: NormalizedRow): { idNumber: string | null; reasons: string[] } {
  if (row.schemaError || row.idRaw === null) return { idNumber: null, reasons: [] };
  const checked = validateSaIdNumber(row.idRaw);
  if (!checked.ok) return { idNumber: null, reasons: checked.reasons };
  return { idNumber: checked.idNumber, reasons: [] };
}

function markSeen(
  seen: Set<number>,
  byId: Map<string, StoredEmployee[]>,
  byEmp: Map<string, StoredEmployee[]>,
  idNumber: string | null,
  empNo: string | null,
) {
  if (idNumber) {
    for (const employee of byId.get(idNumber) ?? []) seen.add(employee.index);
  }
  const key = employeeKey(empNo);
  if (key) {
    for (const employee of byEmp.get(key) ?? []) seen.add(employee.index);
  }
}

function available(
  index: Map<string, StoredEmployee[]>,
  key: string | null,
  claimed: Set<number>,
): StoredEmployee[] {
  if (!key) return [];
  return (index.get(key) ?? []).filter((employee) => !claimed.has(employee.index));
}

function groupBy(
  employees: StoredEmployee[],
  keyOf: (employee: StoredEmployee) => string | null,
): Map<string, StoredEmployee[]> {
  const groups = new Map<string, StoredEmployee[]>();
  for (const employee of employees) {
    const key = keyOf(employee);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(employee);
    groups.set(key, list);
  }
  return groups;
}

function exception(row: NormalizedRow, reasons: string[]): ImportException {
  return { rowNumber: row.rowNumber, empNo: row.empNo, name: row.name, reasons };
}

function readExisting(rows: PayrollRow[]): { ok: true; employees: StoredEmployee[] } | { ok: false; error: string } {
  const employees: StoredEmployee[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const position = index + 1;
    const ctc = parseMonthlyCtc(row.monthly_ctc ?? null);
    if (ctc.kind === "invalid") {
      return {
        ok: false,
        error: `Existing employee ${position} has a monthly CTC that is not a valid amount. Nothing was written.`,
      };
    }
    const disability = parseDisability(row.disability ?? null);
    if (disability.kind === "invalid") {
      return {
        ok: false,
        error: `Existing employee ${position} has a disability value that is not recognised. Nothing was written.`,
      };
    }
    const idNumber = idText(row.id_number);
    const empNo = blankText(row.emp_no);
    employees.push({
      index,
      empNo,
      empKey: employeeKey(empNo),
      name: blankText(row.name),
      idNumber: idNumber === null ? null : idKey(idNumber),
      idKey: idKey(idNumber),
      disability: disability.kind === "value" ? disability.value : null,
      monthlyCtc: ctc.kind === "amount" ? ctc.rands : null,
    });
  }
  return { ok: true, employees };
}

function normalizeRow(item: unknown, rowNumber: number): NormalizedRow {
  if (!isPlainObject(item)) {
    return {
      rowNumber,
      empty: false,
      empNo: null,
      name: null,
      idRaw: null,
      disability: { kind: "blank" },
      ctc: { kind: "blank" },
      schemaError: "Row is not an object",
    };
  }

  const parsed = PayrollRowSchema.safeParse(item);
  const ctc = parseMonthlyCtc(item.monthly_ctc);
  if (!parsed.success) {
    return {
      rowNumber,
      empty: false,
      empNo: null,
      name: null,
      idRaw: null,
      disability: { kind: "blank" },
      ctc,
      schemaError: formatZodError(parsed.error),
    };
  }

  const empNo = blankText(parsed.data.emp_no);
  const name = blankText(parsed.data.name);
  const idRaw = idText(parsed.data.id_number);
  const disability = parseDisability(parsed.data.disability ?? null);
  const empty =
    empNo === null &&
    name === null &&
    idRaw === null &&
    disability.kind === "blank" &&
    ctc.kind === "blank";

  return { rowNumber, empty, empNo, name, idRaw, disability, ctc, schemaError: null };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summaryFrom(header: Header, filePeople: number, fileCents: number): ControlSummary {
  return {
    filePeople,
    fileTotalMonthlyCtc: fileCents / 100,
    headerPeople: header.people,
    headerTotalMonthlyCtc: Math.round(header.totalMonthlyCtc * 100) / 100,
  };
}

function zeroSummary(): ControlSummary {
  return { filePeople: 0, fileTotalMonthlyCtc: 0, headerPeople: 0, headerTotalMonthlyCtc: 0 };
}

function failure(error: string, summary: ControlSummary): ImportFailure {
  return { ok: false, error, summary };
}

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

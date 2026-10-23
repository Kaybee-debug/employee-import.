import type { Disability } from "./fields";

/** An employee after a successful import. Disability is always Yes or No. */
export interface WrittenEmployee {
  empNo: string | null;
  name: string | null;
  idNumber: string | null;
  disability: Disability;
  monthlyCtc: number | null;
}

export interface ImportException {
  /** Position in the rows array. The first row is 1. */
  rowNumber: number;
  empNo: string | null;
  name: string | null;
  reasons: string[];
}

export interface ControlSummary {
  filePeople: number;
  fileTotalMonthlyCtc: number;
  headerPeople: number;
  headerTotalMonthlyCtc: number;
}

export interface ImportSummary extends ControlSummary {
  matched: number;
  created: number;
  leavers: number;
  exceptions: number;
}

export interface ImportSuccess {
  ok: true;
  matched: WrittenEmployee[];
  created: WrittenEmployee[];
  leavers: WrittenEmployee[];
  exceptions: ImportException[];
  warnings: string[];
  summary: ImportSummary;
}

export interface ImportFailure {
  ok: false;
  error: string;
  summary: ControlSummary;
}

export type ImportResult = ImportSuccess | ImportFailure;

# Employee import

TypeScript function that checks a client payroll file before it is written into a compliance system.

The file can contain messy values: salaries written as `32 500`, disability written as `Y`, `true`, `1` or `Disabled`, and South African ID numbers. Several clients share one database, and the file includes ID numbers, disability and pay, so a bad row must not be written and a file with the wrong totals must not be written at all.

## Run the tests

```bash
npm install
npm test
```

`npm run typecheck` checks the TypeScript types.

## Use it

```typescript
import { importEmployees } from "./src/index";

const result = importEmployees(rows, existingEmployees, {
  people: 6,
  totalMonthlyCtc: 195350,
});

if (!result.ok) {
  // Show result.error. Do not save anything.
} else {
  // Save result.matched and result.created only.
  // Show result.exceptions and result.leavers to a person before changing records.
}
```

Each row uses `emp_no`, `name`, `id_number`, `disability` and `monthly_ctc`. A cell may be `null` or `""`.

## Decisions

1. **Control totals use every row in the file.** The header is what the client confirmed about the file, not about the clean rows. People count is the number of non-empty rows. Total CTC is the sum of the numeric CTC cells. A blank CTC counts as 0 in that sum. Rows whose ID number is invalid are still included, because they are still in the file.

2. **If the totals do not match, nothing is returned to save.** The result is `{ ok: false, error }` with no `matched`, `created`, `leavers` or `exceptions` list. The caller must only write to the database when `ok` is true.

3. **A CTC cell that is not a number refuses the whole file.** The total cannot be checked, so the import stops. Spaces, commas and a leading `R` are accepted, for example `R32,500.50`.

4. **An invalid ID does not stop the other rows.** The row is listed in `exceptions` with the reason. The rest are still matched. A value that is not 13 digits stops there. A 13-digit number is also checked for a real date of birth, citizenship digit `0` or `1`, and the South African ID check digit (Luhn).

5. **A blank ID is allowed.** It is not an invalid ID. The row is matched on employee number. A blank cell never replaces a value already on record.

6. **Match order is ID number, then employee number, otherwise the person is new.** Employee numbers are compared without regard to capital letters. If the ID matches one person and the employee number belongs to someone else, the ID match is kept and the employee number is not copied across. A warning is returned.

7. **Blank disability does not mean the person is disabled.** For someone already on record, a blank disability cell keeps the stored value. For a new employee, a blank disability is stored as `No`, because the Excel template only accepts `Yes` or `No` and the file did not say they are disabled. `Y`, `yes`, `true`, `1` and `Disabled` become `Yes`. `N`, `no`, `false`, `0` and `none` become `No`. Anything else is an exception.

8. **A zero salary is a real value.** It replaces the stored salary. Only `null` and `""` count as blank.

9. **Leavers are reported, not deleted.** A leaver is someone on record who does not appear in the file. If their row is in the file but fails validation, they are an exception, not a leaver, and their record is not changed. A person should confirm leavers before the records are removed, because a missing row can be a broken file.

10. **Two-digit birth years.** `05` is 2005 when 15 June 2005 is a real date that is not in the future. If the 2000s date is in the future, the 1900s date is used instead. 29 February is accepted only in a leap year.

11. **The old race digit in an ID number is not checked.** The brief does not ask for it, and it is no longer a reliable part of the number.

## Sample file

The sample header is 6 people and monthly CTC `195350`.

| emp_no | Result | Why |
| --- | --- | --- |
| E001 | New, disability `No` | `N` means No. ID `8001015009087` is valid. |
| E002 | New, disability `Yes` | ID `9202204720083` is valid. |
| E003 | New, disability `No` | ID cell is blank, so the employee number is used. |
| E004 | New, disability `Yes` | `TRUE` means Yes. ID `0506155800085` is valid (15 June 2005). |
| E005 | Exception | `7712319999999` has citizenship digit 9 and a wrong check digit. |
| E006 | Exception | `9902305800086` has 30 February, which is not a date. |

`32 500 + 41 200 + 28 900 + 19 750 + 55 000 + 18 000 = 195 350`.

## AI usage

I used Cursor's coding agent (Grok) to draft this function, the tests and this README from the candidate brief.

I checked the result myself:

- I ran `npm test` (32 tests passed) and `npm run typecheck`.
- I added the six sample salaries by hand. The total is 195 350, and the people count is 6.
- I checked each sample ID against the four rules: 13 digits, a real date of birth, citizenship digit 0 or 1, and the Luhn check digit. `8001015009087`, `9202204720083` and `0506155800085` pass. `7712319999999` fails the citizenship digit and the check digit. `9902305800086` fails because 30 February is not a real date.
- I read the match order, the blank-cell rule and the control-total rule in `src/importEmployees.ts` and compared them with the tests in `tests/importEmployees.test.ts`.

The decisions in the list above are the ones I am using. The tests cover the sample file, a refused total, blank cells, ID-before-employee-number matching, leavers and invalid rows that must not stop the next row.

## Layout

- `src/importEmployees.ts` — the import function
- `src/saId.ts` — South African ID checks
- `src/fields.ts` — disability and money parsing
- `src/schema.ts` — Zod schemas for the header and each row
- `tests/` — Vitest tests

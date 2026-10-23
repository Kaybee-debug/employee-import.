import { z } from "zod";

export const HeaderSchema = z.object({
  people: z.number().int().nonnegative(),
  totalMonthlyCtc: z.number().finite().nonnegative(),
});

/**
 * One payroll row. Cells may be blank. Disability and CTC arrive in many
 * shapes ("Yes", true, 1, "32 500"), so those fields stay loose here and are
 * interpreted later.
 */
export const PayrollRowSchema = z.object({
  emp_no: z.union([z.string(), z.null()]).optional(),
  name: z.union([z.string(), z.null()]).optional(),
  id_number: z.union([z.string(), z.number(), z.null()]).optional(),
  disability: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  monthly_ctc: z.union([z.string(), z.number(), z.null()]).optional(),
});

export type Header = z.infer<typeof HeaderSchema>;
export type PayrollRow = z.infer<typeof PayrollRowSchema>;

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "value";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

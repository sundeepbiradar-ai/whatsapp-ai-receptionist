import { z } from "zod";

export const authFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type AuthFormValues = z.infer<typeof authFormSchema>;

export type AuthActionState = {
  error?: string;
  message?: string;
};

export function getAuthFormValues(formData: FormData): AuthFormValues {
  return authFormSchema.parse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Check the form and try again.";
  }

  return "We could not complete that request. Please try again.";
}

import { z } from "zod";

import { toSlug } from "@/lib/utils";

export const authFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type AuthFormValues = z.infer<typeof authFormSchema>;

export type AuthActionState = {
  error?: string;
  message?: string;
};

export const organizationNameSchema = z
  .string()
  .trim()
  .min(1, "Enter an organization name.")
  .max(200, "Organization name must be 200 characters or fewer.");

export function getOrganizationValues(formData: FormData): { name: string; slug: string } {
  const name = organizationNameSchema.parse(formData.get("name"));
  const slug = toSlug(name).slice(0, 100).replace(/-+$/g, "");

  if (!slug) {
    throw new Error("Organization name must include letters or numbers.");
  }

  return { name, slug };
}

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

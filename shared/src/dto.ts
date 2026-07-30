import { z } from 'zod';

export const emailSchema = z.email().transform((value) => value.toLowerCase());

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const publicUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  isAdmin: z.boolean(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

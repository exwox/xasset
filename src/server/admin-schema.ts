import { z } from "zod";

export const managedRoles = ["administrator", "user", "viewer"] as const;

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(200),
  role: z.enum(managedRoles),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(managedRoles).optional(),
  active: z.boolean().optional(),
  password: z.string().min(12).max(200).optional(),
}).refine((value) => Object.keys(value).length > 0);

const siteFields = {
  code: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(3).max(255),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  cameraHeight: z.number().min(100).max(20_000_000),
};

export const createSiteSchema = z.object({ ...siteFields, active: z.boolean().default(false) });
export const updateSiteSchema = z.object({
  code: siteFields.code.optional(),
  name: siteFields.name.optional(),
  longitude: siteFields.longitude.optional(),
  latitude: siteFields.latitude.optional(),
  cameraHeight: siteFields.cameraHeight.optional(),
  active: z.literal(true).optional(),
}).refine((value) => Object.keys(value).length > 0);

import z from "zod";
import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
} from "@repo/constants/files";
import { clientIdParamSchema } from "./client";

const allowedExtensions: readonly string[] = ALLOWED_DOCUMENT_EXTENSIONS;

const hasAllowedExtension = (name: string) => {
  const extension = name.split(".").pop()?.toLowerCase();
  return !!extension && allowedExtensions.includes(extension);
};

export const fileIdParamSchema = clientIdParamSchema.extend({
  fileId: z.coerce.number().int().positive(),
});

export const fileQuerySchema = z
  .object({
    folderId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
    search: z.string().max(255).optional(),
  })
  .optional();

export const multipartInitSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .refine(hasAllowedExtension, { message: "Unsupported file type." }),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  mimeType: z.string().nonempty().max(255),
  folderId: z.number().int().positive().nullable().optional(),
});

export const multipartCompleteSchema = z.object({
  uploadId: z.string().min(1),
  key: z.string().min(1),
  name: z
    .string()
    .min(1)
    .max(255)
    .refine(hasAllowedExtension, { message: "Unsupported file type." }),
  sizeBytes: z.number().int().positive().max(MAX_FILE_SIZE_BYTES),
  mimeType: z.string().nonempty().max(255),
  folderId: z.number().int().positive().nullable().optional(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive(),
        eTag: z.string().min(1),
      }),
    )
    .min(1),
});

export const multipartAbortSchema = z.object({
  uploadId: z.string().min(1),
  key: z.string().min(1),
});

export const updateFileSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(255)
    .refine(hasAllowedExtension, { message: "Unsupported file type." }),
});

export const uploadFileFormSchema = z.object({
  file: z
    .instanceof(File, { message: "A file is required." })
    .refine((file) => hasAllowedExtension(file.name), {
      message: "Unsupported file type.",
    })
    .refine((file) => file.size > 0 && file.size <= MAX_FILE_SIZE_BYTES, {
      message: "File is too large.",
    }),
  folderId: z.coerce.number().int().positive().optional(),
});

import z from "zod";

export const clientIdParamSchema = z.object({
  clientId: z.coerce.number().int().positive(),
});

export const folderIdParamSchema = clientIdParamSchema.extend({
  folderId: z.coerce.number().int().positive(),
});

export const folderQuerySchema = z
  .object({
    parentId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().positive().gte(1).optional(),
    search: z.string().max(255).optional(),
  })
  .optional();

export const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.number().int().positive().nullable().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().min(1).max(255),
});

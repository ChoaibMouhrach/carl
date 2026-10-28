import { toast } from "sonner";

export const reportBulkDelete = (
  deleted: number,
  noun: { one: string; many: string },
) => {
  toast.success(`${deleted} ${deleted === 1 ? noun.one : noun.many} deleted.`);
};

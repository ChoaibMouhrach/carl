export type Order = "asc" | "desc";

export interface SortOption<Sort extends string> {
  value: string;
  label: string;
  sort: Sort;
  order: Order;
}

export const sortValue = (sort: string, order: Order) => `${sort}:${order}`;

export const leadSortOptions: SortOption<"name" | "username" | "createdAt">[] =
  [
    {
      value: "createdAt:desc",
      label: "Newest first",
      sort: "createdAt",
      order: "desc",
    },
    {
      value: "createdAt:asc",
      label: "Oldest first",
      sort: "createdAt",
      order: "asc",
    },
    { value: "name:asc", label: "Name A–Z", sort: "name", order: "asc" },
    { value: "name:desc", label: "Name Z–A", sort: "name", order: "desc" },
    {
      value: "username:asc",
      label: "Username A–Z",
      sort: "username",
      order: "asc",
    },
  ];

export const communitySortOptions: SortOption<
  "name" | "members" | "mrr" | "priceCents" | "createdAt"
>[] = [
  {
    value: "createdAt:desc",
    label: "Newest first",
    sort: "createdAt",
    order: "desc",
  },
  {
    value: "createdAt:asc",
    label: "Oldest first",
    sort: "createdAt",
    order: "asc",
  },
  {
    value: "members:desc",
    label: "Most members",
    sort: "members",
    order: "desc",
  },
  {
    value: "members:asc",
    label: "Fewest members",
    sort: "members",
    order: "asc",
  },
  { value: "mrr:desc", label: "Highest MRR", sort: "mrr", order: "desc" },
  { value: "mrr:asc", label: "Lowest MRR", sort: "mrr", order: "asc" },
  {
    value: "priceCents:desc",
    label: "Price high to low",
    sort: "priceCents",
    order: "desc",
  },
  {
    value: "priceCents:asc",
    label: "Price low to high",
    sort: "priceCents",
    order: "asc",
  },
  { value: "name:asc", label: "Name A–Z", sort: "name", order: "asc" },
  { value: "name:desc", label: "Name Z–A", sort: "name", order: "desc" },
];

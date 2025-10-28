export type TransactionsQuery = {
  skip: number;
  count: number;
  order: "asc" | "desc";
  labels: string[];
  direction: "all" | "in" | "out";
};

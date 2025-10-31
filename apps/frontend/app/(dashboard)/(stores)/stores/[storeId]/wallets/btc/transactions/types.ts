export type TransactionsQuery = {
  skip: number;
  take: number;
  order: "asc" | "desc";
  labels: string[];
};

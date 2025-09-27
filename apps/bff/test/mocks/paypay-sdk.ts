export const createBTCPayClient = () => ({
  listStores: async () => [],
  createInvoice: async () => {
    throw new Error('Not implemented in tests');
  },
  getInvoice: async () => {
    throw new Error('Not implemented in tests');
  }
});

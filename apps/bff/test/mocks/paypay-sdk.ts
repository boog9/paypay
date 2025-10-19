export const createBTCPayClient = () => ({
  listStores: async () => [],
  createInvoice: async () => {
    throw new Error('Not implemented in tests');
  },
  getInvoice: async () => {
    throw new Error('Not implemented in tests');
  }
});

export const apiBaseUrl = () => '';
export const apiFetch = async () => {
  throw new Error('apiFetch is not available in tests.');
};

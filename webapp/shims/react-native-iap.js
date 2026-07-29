const React = require('react');

function useIAP() {
  React.useEffect(() => {}, []);
  return {
    connected: false,
    products: [],
    subscriptions: [],
    requestPurchase: () => Promise.resolve(),
    fetchProducts: () => Promise.resolve([]),
  };
}

function getTransactionJwsIOS() {
  return Promise.resolve(null);
}

function getAvailablePurchases() {
  return Promise.resolve([]);
}

function finishTransaction() {
  return Promise.resolve();
}

module.exports = {
  __esModule: true,
  useIAP,
  getTransactionJwsIOS,
  getAvailablePurchases,
  finishTransaction,
};

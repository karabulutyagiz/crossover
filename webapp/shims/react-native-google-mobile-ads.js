function mobileAds() {
  return {
    initialize: async () => ({}),
  };
}

const noopUnsub = () => {};

const RewardedAd = {
  createForAdRequest() {
    return {
      addAdEventListener() {
        return noopUnsub;
      },
      load() {},
      show() {},
    };
  },
};

const RewardedAdEventType = {
  EARNED_REWARD: 'earned_reward',
  LOADED: 'loaded',
};

const AdEventType = {
  ERROR: 'error',
  CLOSED: 'closed',
};

module.exports = {
  __esModule: true,
  default: mobileAds,
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
};

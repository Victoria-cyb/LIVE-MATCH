const { PubSub } = require('graphql-subscriptions');
const Match = require('../models/Match');

const pubsub = new PubSub();

const resolvers = {
  Query: {
    matches: async () => await Match.find(),
    match: async (_, { id }) => await Match.findById(id),
  },
  Subscription: {
    matchUpdated: {
      subscribe: () => pubsub.asyncIterator(['MATCH_UPDATED']),
    },
  },
};

module.exports = { resolvers, pubsub };
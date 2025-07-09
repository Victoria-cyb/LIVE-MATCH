const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type Match {
    id: ID!
    teams: [String!]!
    score: String
    odds: Odds
    time: String
    updatedAt: String
  }

  type Odds {
    home: Float
    draw: Float
    away: Float
  }

  type Query {
    matches: [Match!]!
    match(id: ID!): Match
  }

  type Subscription {
    matchUpdated: Match
  }
`;

module.exports = typeDefs;
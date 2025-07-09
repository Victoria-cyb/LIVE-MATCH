require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const http = require('http');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const typeDefs = require('./schema/typeDefs');
const { resolvers } = require('./resolvers');
const connectDB = require('./config/db');
const { startScraper } = require('./services/scraper');

const app = express();
const httpServer = http.createServer(app);

const schema = makeExecutableSchema({ typeDefs, resolvers });

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

useServer({ schema }, wsServer);

const server = new ApolloServer({
  schema,
  plugins: [{
    async serverWillStart() {
      return {
        async drainServer() {
          await wsServer.close();
        },
      };
    },
  }],
});

async function startServer() {
  await connectDB();
  await server.start();
  server.applyMiddleware({ app });
  startScraper();
  httpServer.listen(4000, () => {
    console.log(`🚀 Server ready at http://localhost:4000${server.graphqlPath}`);
  });
}

startServer();
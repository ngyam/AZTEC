import ApolloClient from 'apollo-client';
import { SchemaLink } from 'apollo-link-schema';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { makeExecutableSchema } from 'graphql-tools';
// import {
//     dataError,
// } from '~utils/error';
// import errorResponse from './utils/errorResponse';
import typeDefs from './typeDefs/background';
import resolvers from './resolvers/background';

const schema = makeExecutableSchema({
    typeDefs,
    resolvers,
});


// const formatError = (error) => {
//     if (error.graphQLErrors) {
//         return errorResponse(dataError('data.graphql', {
//             graphQLErrors: error.graphQLErrors,
//         }));
//     }
//     return error;
// };
//
class GraphQLService {
    constructor(connection) {
        this.apollo = new ApolloClient({
            link: new SchemaLink({ schema }),
            cache: new InMemoryCache({
                addTypename: false,
            }),
            defaultOptions: {
                query: {
                    fetchPolicy: 'no-cache',
                },
                watchQuery: {
                    fetchPolicy: 'no-cache',
                },
            },
            connectToDevTools: true,
        });
    }

    query(req) {
        return this.apollo.query({
            ...req,
            context: this.context,
        });
    }

    mutate(req) {
        return this.apollo.mutate({
            ...req,
            context: this.context,
        });
    }
}


export default new GraphQLService();

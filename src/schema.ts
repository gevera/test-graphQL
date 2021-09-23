import { GraphQLObjectType, GraphQLSchema, GraphQLString, GraphQLList, GraphQLInt } from "graphql";
const { PubSub } = require("graphql-subscriptions");

const pubsub = new PubSub();

const ARTIST_MODIFIED = "artist_has_been_modified";

const ArtistType = new GraphQLObjectType({
  name: 'Artist',
  fields: () => ({
    ArtistId: { type: GraphQLInt },
    Name: { type: GraphQLString },
  })
});

export const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "allArtistsQuery",
    fields: () => ({
      allArtists: {
        type: GraphQLList(ArtistType),
        resolve: async (_root, _args, ctx) => {
          const artists = await ctx.db.all(`SELECT * FROM artists;`);
          return artists;
        }
      }
    })
  }),
  mutation: new GraphQLObjectType({
    name: "changeArtistNameMutation",
    fields: () => ({
      changeArtistName: {
        type: ArtistType,
        args: {
          id: { type: GraphQLInt },
          name: { type: GraphQLString },
        },
        resolve: async (_root, args, ctx) => {
          // IN POSTGRES I COULD JUST USE RETURNING
          // const artistWithNewName = await ctx.db.all(`UPDATE artists SET Name = ${_args.name} WHERE ArtistId = ${_args.id} RETURNING *;`);
          let artistUpdated;
          await ctx.db.run(`UPDATE artists SET Name = ? WHERE ArtistId = ?;`, [args.name, args.id], async (err: Error) => {
            if (err) {
              console.error(err.message);
              artistUpdated = null;
            }
          });
          const artistWithNewName = await ctx.db.get(`SELECT * FROM artists WHERE ArtistId = ?;`, [args.id], async (err: Error, row: any) => {
            if (err) {
              console.error(err.message);
              artistUpdated = null;
            }
            return row;
          });
          artistUpdated = artistWithNewName;
          pubsub.publish(ARTIST_MODIFIED, { artistUpdated });
          return artistUpdated;

        }
      }
    })
  }),
  subscription: new GraphQLObjectType({
    name: 'artistChangePubSub',
    fields: () => ({
      artistChangesSubscription: {
        type: ArtistType,
        args: {
          id: { type: GraphQLInt },
        },
        resolve: async (_root, args, ctx) => {
          const subscribedArtist = await ctx.db.get(`SELECT * FROM artists WHERE ArtistId = ?;`, [args.id], async (err: Error, row: any) => {
            if (err) {
              console.error(err.message);
              return null;
            }
            return row;
          });
          return subscribedArtist;
        },
        subscribe: () => {
          return pubsub.asyncIterator(ARTIST_MODIFIED);
        }
      }
    })
  })
});

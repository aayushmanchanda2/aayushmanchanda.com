// Clerk issues the "convex" JWT; Convex trusts that issuer and nothing else.
export default {
  providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" }],
};

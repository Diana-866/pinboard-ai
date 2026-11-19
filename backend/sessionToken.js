const jwt = require("jsonwebtoken");

const SESSION_ALGORITHM = "HS256";
const SESSION_TTL = "7d";
// Session tokens and the short-lived Pinterest OAuth state nonce are signed with the
// same JWT_SECRET. Without a purpose claim the state — which travels in a URL query
// string, so it lands in browser history, access logs and Referer headers — also
// authenticated as a session for that user, because requireAuth only reads userId and
// tokenVersion. The claim marks what a token is for; verification refuses a token that
// declares a different purpose.
const SESSION_PURPOSE = "session";

function signSessionToken(user, secret) {
  return jwt.sign(
    {
      userId: user.id,
      tokenVersion: Number(user.token_version || 0),
      purpose: SESSION_PURPOSE,
    },
    secret,
    {
      algorithm: SESSION_ALGORITHM,
      expiresIn: SESSION_TTL,
    }
  );
}

function verifySessionToken(token, secret) {
  const decoded = jwt.verify(token, secret, {
    algorithms: [SESSION_ALGORITHM],
  });
  // Tokens issued before the claim existed have no purpose and stay valid, so this
  // hardening does not sign anybody out. Anything that names another purpose is not a
  // session, whatever it was minted for.
  if (decoded && typeof decoded === "object" && "purpose" in decoded) {
    if (decoded.purpose !== SESSION_PURPOSE) {
      throw new jwt.JsonWebTokenError("token purpose is not a session");
    }
  }
  return decoded;
}

module.exports = {
  SESSION_ALGORITHM,
  SESSION_TTL,
  SESSION_PURPOSE,
  signSessionToken,
  verifySessionToken,
};

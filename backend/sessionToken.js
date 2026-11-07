const jwt = require("jsonwebtoken");

const SESSION_ALGORITHM = "HS256";
const SESSION_TTL = "7d";

function signSessionToken(user, secret) {
  return jwt.sign(
    {
      userId: user.id,
      tokenVersion: Number(user.token_version || 0),
    },
    secret,
    {
      algorithm: SESSION_ALGORITHM,
      expiresIn: SESSION_TTL,
    }
  );
}

function verifySessionToken(token, secret) {
  return jwt.verify(token, secret, {
    algorithms: [SESSION_ALGORITHM],
  });
}

module.exports = {
  SESSION_ALGORITHM,
  SESSION_TTL,
  signSessionToken,
  verifySessionToken,
};

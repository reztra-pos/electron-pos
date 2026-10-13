// Shared secret used to encrypt/decrypt device API keys.
// MUST be the same value in the web app that generates keys.
// Change it before shipping, and keep it out of public repositories.
// (Anything inside an installed app can be extracted by a determined person,
//  so the server must still verify the device — see README "Security".)
module.exports = process.env.REZTRA_KEY_SECRET || "change-me-reztra-device-key-secret-2026";

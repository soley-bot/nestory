export const localFixtureCredentials = Object.freeze({
  email: process.env.NESTORY_TEST_EMAIL ?? ["nestory", "gmail.com"].join("@"),
  password: process.env.NESTORY_TEST_PASSWORD ?? ["123", "456", "789"].join(""),
});
